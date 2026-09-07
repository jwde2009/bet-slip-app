const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

async function moduleExports(relative) {
  const context = vm.createContext({ console: { log() {}, warn() {} } });
  const modules = new Map();
  function load(file) {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  }
  const entry = load(path.join(root, relative));
  await entry.link((specifier, parent) => {
    const file = path.resolve(path.dirname(parent.identifier), specifier);
    return load(path.extname(file) ? file : `${file}.js`);
  });
  await entry.evaluate();
  return entry.namespace;
}

async function parser(book) {
  const exports = await moduleExports(`app/ev-parlay-lab/utils/parsers/parse${book}Text.js`);
  return (text, context = {}) => plain(exports[`parse${book}Text`](text, context));
}

// Synthetic NFL values in the Pinnacle detail format already observed in the
// supplied MLB captures. These are not live quotes or a live NFL DOM fixture.
const pinPrefix = 'WNBA\nNBA\nNHL\nMLB\nFootball\nNFL\nNew England Patriots @ Seattle Seahawks\nWednesday, September 9, 2026 at 20:20\nNew England Patriots\nSeattle Seahawks\nALLGAME1ST HALF1ST QUARTERPLAYER PROPS\n';
const pinMarkets = 'Money Line – Game\nShow All\nNew England Patriots\n+160\nSeattle Seahawks\n-190\nHandicap – Game\nNew England Patriots\tSeattle Seahawks\n+3.5\n-110\n-3.5\n-110\nSee more\nTotal – Game\nOver 44.5\n-110\nUnder 44.5\n-110\nSee more\n';
const pin = pinPrefix + pinMarkets;
const detail = read('tests/fixtures/betmgm-nfl-detail-public.txt');
const slate = read('tests/fixtures/betmgm-nfl-list-public.txt');

test('User Pinnacle NFL capture retains all six actual game prices and excludes expanded props and periods', async () => {
  const rows = (await parser('Pinnacle'))(read('tests/fixtures/pinnacle-nfl-patriots-seahawks-user.txt'));
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.sport === 'NFL' && row.league === 'NFL' && row.period === 'full_game' && row.eventLabelRaw === 'New England Patriots @ Seattle Seahawks'));
  assert.deepEqual(rows.map(row => [row.marketType, row.selectionNormalized, row.lineValue, row.oddsAmerican]), [
    ['moneyline_2way', 'New England Patriots', null, 156], ['moneyline_2way', 'Seattle Seahawks', null, -178],
    ['spread', 'New England Patriots', 3.5, -114], ['spread', 'Seattle Seahawks', -3.5, 101],
    ['total', 'Over', 44.5, -103], ['total', 'Under', 44.5, -113],
  ]);
});

// Synthetic input in the legacy generic landing parser's accepted token order.
// This reproduces its unsafe sport guesses, not a captured NFL landing layout.
const legacyNflLanding = 'Football\nNFL\nToday\n' + [
  ['New England Patriots', 'Seattle Seahawks'],
  ['New York Jets', 'Tennessee Titans'],
  ['Arizona Cardinals', 'New York Giants'],
].map(teams => teams.join('\n') + '\n+3.5\n-110\n-3.5\n-110\n+150\n-170\n44.5\n-110\n44.5\n-110').join('\n');

test('Unmarked NFL landing captures cannot fall through to soccer, NHL or MLB guesses', async () => {
  const parse = await parser('Pinnacle');
  assert.deepEqual(parse(legacyNflLanding), []);
  assert.deepEqual(parse(`NFL_CAPTURE_LEAGUE: NFL\n${legacyNflLanding}`), []);
});

test('A sidebar NFL label does not prevent a later MLB event from parsing', async () => {
  const parse = await parser('Pinnacle');
  const input = read('tests/fixtures/pinnacle-mlb-expanded.txt');
  assert.deepEqual(parse(`Football\nNFL\n${input}`).map(({ id, ...row }) => row), parse(input).map(({ id, ...row }) => row));
});

test('Unsupported Pinnacle NFL input shows next steps without changing loaded rows or parse time', async () => {
  const source = read('app/ev-parlay-lab/page.js');
  const start = source.indexOf('   function handleParse()');
  const end = source.indexOf('  function applyBatchRoleToRows(', start);
  assert.ok(start >= 0 && end > start);
  const { parseNflMainLines } = await moduleExports('app/ev-parlay-lab/utils/parsers/nflMainLines.js');
  const messages = [];
  const fail = () => { throw new Error('Unsupported input must stop before parsing, normalizing or changing session state'); };
  const handle = vm.runInNewContext(`${source.slice(start, end)}\nhandleParse`, {
    rawText: legacyNflLanding, sportsbook: 'Pinnacle', parseNflMainLines,
    console: { log() {} }, alert: message => messages.push(message),
    parseOddsText: fail, setRows: fail, setRawText: fail, setLastParsedAt: fail,
  });
  handle();
  assert.equal(messages.length, 1);
  assert.match(messages[0], /individual NFL game/);
  assert.match(messages[0], /input and loaded rows are preserved/);
});

test('Pinnacle NFL detail yields exactly six full-game sharp rows despite mixed-sport navigation', async () => {
  const rows = (await parser('Pinnacle'))(pin);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.sport === 'NFL' && row.league === 'NFL' && row.isSharpSource && !row.isTargetBook));
  assert.deepEqual(rows.map(row => [row.marketType, row.selectionNormalized, row.lineValue, row.oddsAmerican]), [
    ['moneyline_2way', 'New England Patriots', null, 160], ['moneyline_2way', 'Seattle Seahawks', null, -190],
    ['spread', 'New England Patriots', 3.5, -110], ['spread', 'Seattle Seahawks', -3.5, -110],
    ['total', 'Over', 44.5, -110], ['total', 'Under', 44.5, -110],
  ]);
});

test('Pinnacle keeps half, quarter, team-total, props and three-way prices out of full-game rows', async () => {
  const parse = await parser('Pinnacle');
  const partials = 'Money Line – 1st Half\nNew England Patriots\n+105\nSeattle Seahawks\n-120\nHandicap – 1st Quarter\nNew England Patriots\nSeattle Seahawks\n+0.5\n+110\n-0.5\n-130\nTeam Total – Game\nOver 24.5\n-125\nUnder 24.5\n+105\nPlayer Total Passing Yards\nOver 200.5\n-110\nUnder 200.5\n-110';
  assert.deepEqual(parse(pin + partials), parse(pin));
  assert.deepEqual(parse(pinPrefix + partials), []);
  const threeWay = pin.replace('Seattle Seahawks\n-190', 'Draw\n+1500\nSeattle Seahawks\n-190');
  assert.equal(parse(threeWay).filter(row => row.marketType === 'moneyline_2way').length, 0);
});

test('Pinnacle rejects mismatched totals/spreads and cannot borrow prices from neighboring headings', async () => {
  const parse = await parser('Pinnacle');
  assert.equal(parse(pin.replace('Under 44.5', 'Under 45.5')).length, 4);
  assert.equal(parse(pin.replace('-3.5\n-110', '-2.5\n-110')).length, 4);
  assert.deepEqual(parse(pinPrefix + 'Total – Game\nOver 44.5\nUnder 44.5\nTotal – 1st Half\nOver 22.5\n-110\nUnder 22.5\n-110'), []);
});

test('Pinnacle decimal/EVEN prices and pick-em lines are parsed without turning a line into odds', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(pin.replaceAll('-110', '1.91').replace('+160', 'EVEN').replaceAll('+3.5', 'PK').replaceAll('-3.5', '0'));
  assert.equal(rows.length, 6);
  assert.equal(rows[0].oddsAmerican, 100);
  assert.ok(rows.filter(row => row.marketType === 'spread').every(row => row.lineValue === 0));
  assert.deepEqual(parse(pinPrefix + 'Money Line – Game\nNew England Patriots\n15\nSeattle Seahawks\n-190'), []);
});

test('Pinnacle separates multiple event blocks and rejects unknown NFL teams', async () => {
  const parse = await parser('Pinnacle');
  const second = pin.replaceAll('New England Patriots', 'New York Giants').replaceAll('Seattle Seahawks', 'Arizona Cardinals');
  const rows = parse(pin + '\n' + second);
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map(row => row.eventLabelRaw)).size, 2);
  assert.deepEqual(parse(pin.replaceAll('Seattle Seahawks', 'Alabama')), []);
  const emptyFirst = pinPrefix + 'Money Line – Game\n';
  assert.ok(parse(emptyFirst + second).every(row => row.eventLabelRaw === 'New York Giants @ Arizona Cardinals'));
});

test('BetMGM public game-detail excerpt parses actual six prices and keeps NFL target role', async () => {
  const rows = (await parser('BetMGM'))(detail);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.eventLabelRaw === 'New England Patriots @ Seattle Seahawks' && row.league === 'NFL' && row.isTargetBook && !row.isSharpSource));
  assert.deepEqual(rows.map(row => [row.marketType, row.selectionNormalized, row.lineValue, row.oddsDecimal]), [
    ['spread', 'New England Patriots', 3.5, 1.88], ['spread', 'Seattle Seahawks', -3.5, 1.95],
    ['total', 'Over', 44.5, 1.93], ['total', 'Under', 44.5, 1.90],
    ['moneyline_2way', 'New England Patriots', null, 2.60], ['moneyline_2way', 'Seattle Seahawks', null, 1.52],
  ]);
});

test('BetMGM public NFL list handles inline decimal prices, team records, and consecutive games', async () => {
  const rows = (await parser('BetMGM'))(slate);
  assert.equal(rows.length, 12);
  assert.deepEqual([...new Set(rows.map(row => row.eventLabelRaw))], ['New England Patriots @ Seattle Seahawks', 'San Francisco 49ers @ Los Angeles Rams']);
  assert.equal(rows.find(row => row.selectionNormalized === 'Los Angeles Rams' && row.marketType === 'moneyline_2way').oddsDecimal, 1.52);
});

test('BetMGM accepts American price fields in both observed card layouts', async () => {
  const parse = await parser('BetMGM');
  // The American replacements below are synthetic; actual public fixtures are decimal.
  for (const input of [detail, slate]) {
    const rows = parse(input.replace(/\b1\.\d+\b/g, '-110').replace(/\b2\.60\b/g, '+160'));
    assert.equal(rows.length, input === detail ? 6 : 12);
    assert.ok(rows.every(row => [-110, 160].includes(row.oddsAmerican)));
  }
});

test('BetMGM partial-period tables cannot produce full-game quotes', async () => {
  const parse = await parser('BetMGM');
  for (const period of ['1st half', '2nd half', '1st quarter', '2nd quarter', '3rd quarter', '4th quarter', 'Regulation time']) {
    assert.deepEqual(parse(detail.replace('Game lines\nGame lines\n1st half\n1st quarter', period)), [], period);
  }
  const half = detail.replace('Game lines\nGame lines\n1st half\n1st quarter', '1st half').replaceAll('44.5', '22.5');
  assert.equal(parse(half + '\nFull game\n' + detail).length, 6);
});

test('BetMGM locked/missing prices and inconsistent lines do not shift fields', async () => {
  const parse = await parser('BetMGM');
  assert.equal(parse(detail.replace('2.60', 'Locked')).length, 4);
  assert.equal(parse(detail.replace('U 44.5', 'U 45.5')).length, 4);
  assert.equal(parse(detail.replace('-3.5', '-4.5')).length, 4);
  assert.deepEqual(parse(detail.replace('1.88\n', '')), []);
  assert.deepEqual(parse(detail.replaceAll('Seahawks', 'Alabama')), []);
});

test('NFL parsing requires NFL context; college and MLB names do not become NFL teams', async () => {
  const mgm = await parser('BetMGM');
  const pinnacle = await parser('Pinnacle');
  for (const input of [detail.replaceAll('NFL', 'NCAAF').replaceAll('Patriots', 'Michigan').replaceAll('Seahawks', 'Washington'), detail.replaceAll('NFL', 'MLB').replaceAll('Patriots', 'Giants').replaceAll('Seahawks', 'Cardinals')]) {
    assert.ok(mgm(input).every(row => row.sport !== 'NFL'));
  }
  assert.ok(pinnacle(pin.replace('Football\nNFL', 'Football\nNCAA').replaceAll('New England Patriots', 'Michigan').replaceAll('Seattle Seahawks', 'Washington')).every(row => row.sport !== 'NFL'));
});

test('NFL exact lookup covers all 32 clubs, abbreviations and numeric 49ers name', async () => {
  const { resolveNflMainLineTeam } = await moduleExports('app/ev-parlay-lab/utils/parsers/nflMainLines.js');
  const { TEAM_ALIASES_BY_SPORT } = await moduleExports('app/ev-parlay-lab/data/teamAliases.js');
  const teams = [...new Set(Object.values(TEAM_ALIASES_BY_SPORT.NFL))];
  assert.equal(teams.length, 32);
  for (const team of teams) assert.equal(resolveNflMainLineTeam(team), team);
  assert.equal(resolveNflMainLineTeam('NY Giants 0-0'), 'New York Giants');
  assert.equal(resolveNflMainLineTeam('LA Chargers'), 'Los Angeles Chargers');
  assert.equal(resolveNflMainLineTeam('SF 49ers'), 'San Francisco 49ers');
  for (const value of ['Washington', 'Arizona', 'Michigan', 'LA', 'New York', 'R Gusto']) assert.equal(resolveNflMainLineTeam(value), '');
});

test('Pinnacle and BetMGM NFL rows match into the same three canonical markets', async () => {
  const pinRows = (await parser('Pinnacle'))(pin);
  const mgmRows = (await parser('BetMGM'))(detail);
  const { normalizeParsedRows } = await moduleExports('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await moduleExports('app/ev-parlay-lab/utils/matchMarkets.js');
  const result = plain(buildCanonicalMarkets(normalizeParsedRows([...pinRows, ...mgmRows])));
  assert.equal(result.markets.length, 3);
  assert.ok(result.markets.every(market => market.sport === 'NFL' && market.selections.length === 2));
  assert.ok(result.markets.every(market => market.selections.every(selection => selection.quotes.length === 2)));
  const { calculateFairOddsForMarkets } = await moduleExports('app/ev-parlay-lab/utils/fairOdds.js');
  const fair = plain(calculateFairOddsForMarkets(result.markets));
  assert.equal(fair.length, 6);
  const spreads = fair.filter(item => item.marketType === 'spread');
  assert.equal(spreads.find(item => item.rawSelectionLabel === 'New England Patriots').lineValue, 3.5);
  assert.equal(spreads.find(item => item.rawSelectionLabel === 'Seattle Seahawks').lineValue, -3.5);
  assert.ok(spreads.every(item => Math.abs(item.fairProbability - 0.5) < 0.000001));
  assert.match(spreads.find(item => item.rawSelectionLabel === 'Seattle Seahawks').fullSelectionLabel, /-3\.5/);
});

test('NFL spread grouping preserves alternate handicap direction and parlay leg signs', async () => {
  const { normalizeParsedRows } = await moduleExports('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await moduleExports('app/ev-parlay-lab/utils/matchMarkets.js');
  const { calculateFairOddsForMarkets } = await moduleExports('app/ev-parlay-lab/utils/fairOdds.js');
  const { buildParlayCandidates } = await moduleExports('app/ev-parlay-lab/utils/parlayEngine.js');
  const parsePin = await parser('Pinnacle');
  const base = parsePin(pin).filter(item => item.marketType === 'spread');
  const opposite = base.map(item => ({ ...item, lineValue: -item.lineValue }));
  const alternativeMarkets = buildCanonicalMarkets(normalizeParsedRows([...base, ...opposite])).markets;
  assert.equal(alternativeMarkets.length, 2);
  assert.ok(alternativeMarkets.every(market => market.selections.length === 2));

  // Synthetic profitable target prices make both signs observable in generated
  // cross-game candidates. These are test inputs, not betting recommendations.
  const second = base.map(item => ({ ...item,
    eventLabelRaw: 'Buffalo Bills @ Kansas City Chiefs',
    selectionRaw: item.selectionRaw === 'New England Patriots' ? 'Buffalo Bills' : 'Kansas City Chiefs',
    selectionNormalized: item.selectionRaw === 'New England Patriots' ? 'Buffalo Bills' : 'Kansas City Chiefs',
  }));
  const sharp = [...base, ...second];
  const target = sharp.map(item => ({ ...item, sportsbook: 'BetMGM', isSharpSource: false, isTargetBook: true, oddsAmerican: 150, oddsDecimal: 2.5 }));
  const rows = normalizeParsedRows([...sharp, ...target]);
  const markets = buildCanonicalMarkets(rows).markets;
  const fair = calculateFairOddsForMarkets(markets);
  const result = plain(buildParlayCandidates({ rows, markets, fairOddsResults: fair, filters: {
    maxLegs: 2, allowSameGame: false, useMinLegEvFilter: false, minParlayAmerican: -10000,
    maxAbsOdds: 10000, boostPct: 0, stake: 10, bankroll: 6000, kellyFraction: 0.25,
  } }));
  assert.equal(result.counts.eligibleLegs, 4);
  assert.ok(result.parlays.length > 0);
  const legs = result.parlays.flatMap(parlay => parlay.legs);
  assert.ok(legs.some(leg => leg.lineValue === -3.5));
  for (const leg of legs) {
    assert.equal(leg.lineValue, ['Seattle Seahawks', 'Kansas City Chiefs'].includes(leg.selectionLabel) ? -3.5 : 3.5);
  }
});

test('NFL coverage considers three complete main-line pairs sufficient', () => {
  const source = read('app/ev-parlay-lab/components/LoadCoveragePanel.js');
  const start = source.indexOf('function isThinEvent(');
  const end = source.indexOf('\nfunction clean(', start);
  const isThin = vm.runInNewContext(`${source.slice(start, end)}\nisThinEvent`);
  const markets = ['moneyline_2way', 'spread', 'total'].map(marketType => ({ marketType, rowCount: 2 }));
  assert.equal(isThin({ sport: 'NFL', marketCount: 3, rowCount: 6, markets }), false);
  assert.equal(isThin({ sport: 'NFL', marketCount: 2, rowCount: 4, markets: markets.slice(0, 2) }), true);
  assert.equal(isThin({ sport: 'NFL', marketCount: 3, rowCount: 5, markets: markets.map(item => ({ ...item, rowCount: 1 })) }), true);
  assert.equal(isThin({ sport: 'NBA', marketCount: 3, rowCount: 6, markets }), true);
});

test('Football extension detection uses the URL/title instead of mixed-sport sidebar text', () => {
  const source = read('ev-parlay-extension/background.js');
  const start = source.indexOf('  function footballCaptureLeague()');
  const end = source.indexOf('\n  if (detectedSource === "BetMGM")', start);
  assert.ok(start > 0 && end > start);
  for (const [pathname, title, expected] of [
    ['/en/football/nfl/matchups/', '', 'NFL'],
    ['/en/sports/football-11/betting/usa-9/nfl-35', '', 'NFL'],
    ['/en/sports/events/example', 'New England Patriots @ Seattle Seahawks, NFL | BetMGM', 'NFL'],
    ['/en/football/ncaa/matchups/', '', 'NCAAF'],
    ['/en/sports/football-11/betting', '', 'MIXED'],
    ['/en/sports/basketball-7', 'NBA | BetMGM', ''],
  ]) {
    const detect = vm.runInNewContext(`${source.slice(start, end)}\nfootballCaptureLeague`, { window: { location: { pathname } }, document: { title, body: { innerText: 'NBA WNBA NHL NFL NCAAF' } } });
    assert.equal(detect(), expected);
  }
});

test('BetMGM football capture exits before any player-prop expansion or repeated passes', async () => {
  const source = read('ev-parlay-extension/background.js');
  const start = source.indexOf('async function extractBetMgmMultiPassPayload(');
  const end = source.indexOf('function seedFanDuelTargetWorkflowLabels(', start);
  let captures = 0;
  const extract = vm.runInNewContext(`${source.slice(start, end)}\nextractBetMgmMultiPassPayload`, {
    safeShowToast: async () => {},
    extractSinglePayloadFromTab: async () => { captures += 1; return { source: 'BetMGM', text: `BETMGM_FOOTBALL_MAIN_LINES_CAPTURE\nNFL_CAPTURE_LEAGUE: NFL\n${detail}` }; },
    mergeExtractionBlocks: blocks => blocks.join('\n'),
    sleepBackground: () => { throw new Error('Football must not wait for another pass'); },
  });
  const payload = await extract(1);
  assert.equal(captures, 1);
  assert.match(payload.text, /NFL_CAPTURE_LEAGUE: NFL/);
});
