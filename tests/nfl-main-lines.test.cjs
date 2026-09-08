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
const pinSlate = read('tests/fixtures/pinnacle-nfl-slate-user.txt');
const mgmDual = read('tests/fixtures/betmgm-nfl-dual-period-user.txt');
const mgmDualExpected = [
  ['New England Patriots', 'Seattle Seahawks', 3.5, -118, -102, 155, -190, 44.5, -108, -110],
  ['San Francisco 49ers', 'Los Angeles Rams', 3.5, -108, -110, 160, -190, 48.5, -108, -110],
  ['New York Jets', 'Tennessee Titans', 1.5, -110, -110, 105, -125, 39.5, -108, -110],
  ['Chicago Bears', 'Carolina Panthers', -3, -105, -115, -155, 130, 47, -110, -108],
  ['New Orleans Saints', 'Detroit Lions', 7, -112, -105, 260, -325, 50, -108, -110],
  ['Baltimore Ravens', 'Indianapolis Colts', -3.5, -102, -118, -185, 150, 47.5, -110, -108],
  ['Atlanta Falcons', 'Pittsburgh Steelers', 3.5, -112, -105, 155, -190, 42, -108, -110],
  ['Buffalo Bills', 'Houston Texans', -1, -110, -108, -120, 100, 44.5, -108, -110],
  ['Tampa Bay Buccaneers', 'Cincinnati Bengals', 3.5, -108, -110, 165, -200, 50.5, -110, -108],
  ['Cleveland Browns', 'Jacksonville Jaguars', 8, -105, -112, 333, -450, 40.5, -110, -110],
  ['Washington Commanders', 'Philadelphia Eagles', 5, -110, -108, 195, -235, 44.5, -108, -110],
  ['Miami Dolphins', 'Las Vegas Raiders', 3.5, -112, -105, 150, -185, 40.5, -112, -108],
  ['Arizona Cardinals', 'Los Angeles Chargers', 9.5, -108, -110, 400, -525, 47.5, -105, -112],
  ['Green Bay Packers', 'Minnesota Vikings', 1.5, -110, -108, 100, -120, 46.5, -108, -110],
];

test('User BetMGM side-by-side periods yield all 84 actual full-game prices only', async () => {
  const rows = (await parser('BetMGM'))(mgmDual);
  assert.equal(rows.length, 84);
  assert.ok(rows.every(row => row.sport === 'NFL' && row.period === 'full_game' && row.isTargetBook));
  for (const [away, home, handicap, aSpread, hSpread, aMl, hMl, line, over, under] of mgmDualExpected) {
    const event = rows.filter(row => row.eventLabelRaw === `${away} @ ${home}`);
    assert.equal(event.length, 6);
    for (const [market, selection, threshold, price] of [
      ['spread', away, handicap, aSpread], ['spread', home, -handicap, hSpread],
      ['moneyline_2way', away, null, aMl], ['moneyline_2way', home, null, hMl],
      ['total', 'Over', line, over], ['total', 'Under', line, under],
    ]) {
      const found = event.find(row => row.marketType === market && row.selectionNormalized === selection);
      assert.ok(found, `${away}: ${market} ${selection}`);
      assert.equal(found.lineValue, threshold);
      assert.equal(found.oddsAmerican, price);
    }
  }
});

test('BetMGM parallel period layout requires both headers and a consistent column count', async () => {
  const parse = await parser('BetMGM');
  for (const input of [
    mgmDual.replace('Game lines\n1st half', '1st half\nGame lines'),
    mgmDual.replace('Game lines\n1st half', 'Game lines\nGame lines\n1st half'),
    mgmDual.replaceAll('Spread\nTotal\nMoney\nSpread\nTotal\nMoney', 'Spread\nTotal\nMoney'),
  ]) assert.deepEqual(parse(input), []);
  assert.equal(parse(mgmDual.replace('+155\n-190', 'Locked\n-190')).length, 82);
  assert.equal(parse(mgmDual.replace('+3.5\n-118\n', '+3.5\n')).length, 78);
  // Removing the whole first price group must not promote the half to game.
  assert.equal(parse(mgmDual.replace('+3.5\n-118\n-3.5\n-102\nO 44.5\n-108\nU 44.5\n-110\n+155\n-190\n', '')).length, 78);
});

test('User NFL slates match only equal thresholds: 14 moneylines, seven spreads, five totals', async () => {
  const { normalizeParsedRows } = await moduleExports('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await moduleExports('app/ev-parlay-lab/utils/matchMarkets.js');
  const rows = [...(await parser('Pinnacle'))(pinSlate), ...(await parser('BetMGM'))(mgmDual)];
  const markets = plain(buildCanonicalMarkets(normalizeParsedRows(rows))).markets;
  assert.equal(markets.length, 64);
  assert.ok(markets.every(market => market.sport === 'NFL'));
  const matched = markets.filter(market => market.selections.every(selection => new Set(selection.quotes.map(quote => quote.sportsbook)).size === 2));
  assert.equal(matched.length, 26);
  assert.equal(matched.filter(market => market.marketType === 'moneyline_2way').length, 14);
  assert.equal(matched.filter(market => market.marketType === 'spread').length, 7);
  assert.equal(matched.filter(market => market.marketType === 'total').length, 5);
});

// Expected values transcribed independently from the user's 16-game slate:
// away/home, spread and its two prices, moneylines, total and its two prices.
const pinSlateExpected = [
  ['New England Patriots', 'Seattle Seahawks', 3.5, -116, 103, 155, -176, 44.5, -108, -108],
  ['San Francisco 49ers', 'Los Angeles Rams', 3.5, -108, -104, 171, -197, 48, -111, -105],
  ['Atlanta Falcons', 'Pittsburgh Steelers', 3.5, -114, 101, 158, -181, 42.5, -105, -111],
  ['Baltimore Ravens', 'Indianapolis Colts', -3.5, 103, -116, -177, 155, 47.5, -113, -104],
  ['Cleveland Browns', 'Jacksonville Jaguars', 9.5, -114, 101, 316, -391, 40.5, -112, -104],
  ['New Orleans Saints', 'Detroit Lions', 7, -108, -105, 267, -321, 50.5, 102, -120],
  ['New York Jets', 'Tennessee Titans', 1, -103, -109, 106, -119, 39, -111, -105],
  ['Tampa Bay Buccaneers', 'Cincinnati Bengals', 4, -106, -106, 180, -208, 51, 101, -117],
  ['Buffalo Bills', 'Houston Texans', -1, -107, -105, -114, 102, 44, -118, 101],
  ['Chicago Bears', 'Carolina Panthers', -2.5, -124, 110, -160, 141, 47.5, 101, -118],
  ['Green Bay Packers', 'Minnesota Vikings', 1, 102, -115, 111, -124, 46, -112, -104],
  ['Arizona Cardinals', 'Los Angeles Chargers', 10.5, -119, 106, 395, -509, 47, -114, -102],
  ['Miami Dolphins', 'Las Vegas Raiders', 3.5, -114, 101, 157, -180, 40.5, -110, -106],
  ['Washington Commanders', 'Philadelphia Eagles', 4.5, -104, -108, 196, -228, 44.5, -102, -114],
  ['Dallas Cowboys', 'New York Giants', -2.5, -126, 112, -161, 142, 47.5, -121, 104],
  ['Denver Broncos', 'Kansas City Chiefs', 3, -117, 104, 131, -149, 43, -115, -102],
];

test('User Pinnacle NFL slate produces 16 events and all 96 exact full-game sharp rows', async () => {
  const rows = (await parser('Pinnacle'))(pinSlate);
  assert.equal(rows.length, 96);
  assert.equal(new Set(rows.map(row => row.eventLabelRaw)).size, 16);
  assert.ok(rows.every(row => row.sport === 'NFL' && row.league === 'NFL' && row.period === 'full_game' && row.isSharpSource && !row.isTargetBook));
  for (const [away, home, handicap, awaySpread, homeSpread, awayMl, homeMl, line, over, under] of pinSlateExpected) {
    const event = rows.filter(row => row.eventLabelRaw === `${away} @ ${home}`);
    assert.equal(event.length, 6, `${away} @ ${home}`);
    for (const [market, selection, threshold, price] of [
      ['spread', away, handicap, awaySpread], ['spread', home, -handicap, homeSpread],
      ['moneyline_2way', away, null, awayMl], ['moneyline_2way', home, null, homeMl],
      ['total', 'Over', line, over], ['total', 'Under', line, under],
    ]) {
      const found = event.find(row => row.marketType === market && row.selectionNormalized === selection);
      assert.ok(found, `${away} @ ${home}: ${market} ${selection}`);
      assert.equal(found.lineValue, threshold);
      assert.equal(found.oddsAmerican, price);
    }
  }
});

test('Pinnacle slate also works without extension markers and ignores market-count prices', async () => {
  const parse = await parser('Pinnacle');
  const expected = parse(pinSlate);
  assert.deepEqual(parse(pinSlate.replace(/^PINNACLE_NFL_MAIN_LINES_CAPTURE\nNFL_CAPTURE_LEAGUE: NFL\n/, '')), expected);
  assert.deepEqual(parse(pinSlate.replace('+67\n', '+167\n')), expected);
});

test('Pinnacle slate requires the observed headings, kickoff, and full card boundaries', async () => {
  const parse = await parser('Pinnacle');
  const headers = 'HANDICAP\nMONEY LINE\nOVER\nUNDER';
  for (const input of [
    pinSlate.replaceAll(headers, ''),
    pinSlate.replaceAll(headers, 'MONEY LINE\nHANDICAP\nOVER\nUNDER'),
    pinSlate.replaceAll(headers, 'HANDICAP\nMONEY LINE\nUNDER\nOVER'),
  ]) assert.deepEqual(parse(input), []);
  for (const input of [
    pinSlate.replace('19:20\n', ''),
    pinSlate.replace('+67\n', ''),
    pinSlate.replace('+3.5\n-116\n', '+3.5\n'),
    pinSlate.replace('44.5\n-108\n+67', '44.5\n+167'),
    pinSlate.replace('Seattle Seahawks\n19:20', 'Unknown Team\n19:20'),
  ]) {
    const rows = parse(input);
    assert.equal(rows.length, 90);
    assert.ok(rows.every(row => row.eventLabelRaw !== 'New England Patriots @ Seattle Seahawks'));
    assert.equal(rows.filter(row => row.eventLabelRaw === 'San Francisco 49ers @ Los Angeles Rams').length, 6);
  }
});

test('Pinnacle slate keeps locked fields in place and rejects unequal spread or total pairs', async () => {
  const parse = await parser('Pinnacle');
  for (const [input, absent] of [
    [pinSlate.replace('+155\n', 'Locked\n'), 'moneyline_2way'],
    [pinSlate.replace('-3.5\n+103', '-2.5\n+103'), 'spread'],
    [pinSlate.replace('44.5\n-108\n+67', '45.5\n-108\n+67'), 'total'],
  ]) {
    const rows = parse(input);
    assert.equal(rows.length, 94);
    const first = rows.filter(row => row.eventLabelRaw === 'New England Patriots @ Seattle Seahawks');
    assert.equal(first.length, 4);
    assert.ok(first.every(row => row.marketType !== absent));
  }
});

test('Pinnacle slate rejects explicit partial periods, live sections and other leagues', async () => {
  const parse = await parser('Pinnacle');
  const heading = '\nWED, SEP 09, 2026\n';
  for (const period of ['1st Half', '1st Quarter', 'Team Totals', 'Futures', 'Regulation']) {
    const input = pinSlate.replace(heading, `\n${period}${heading}`);
    assert.deepEqual(parse(input), [], period);
    assert.equal(parse(input.replace(`\n${period}\n`, `\n${period}\nGame\n`)).length, 96);
  }
  const live = pinSlate.replace('UNDER\nNew England Patriots', 'UNDER\nLive\nNew England Patriots');
  assert.equal(parse(live).length, 90);
  assert.deepEqual(parse(pinSlate.replaceAll('NFL', 'NCAAF'), { sport: 'NFL' }), []);
});

test('Pinnacle slate supports decimal/EVEN prices and pick-em without converting market counts', async () => {
  // Synthetic substitutions for format coverage, not additional captured prices.
  const input = pinSlate.replace('+155\n', 'EVEN\n').replace('-176\n', '1.90\n')
    .replace('+3.5\n-116\n-3.5\n+103', 'PK\n1.91\n0\n1.93');
  const rows = (await parser('Pinnacle'))(input);
  assert.equal(rows.length, 96);
  const first = rows.filter(row => row.eventLabelRaw === 'New England Patriots @ Seattle Seahawks');
  assert.ok(first.filter(row => row.marketType === 'spread').every(row => row.lineValue === 0));
  assert.equal(first.find(row => row.marketType === 'moneyline_2way' && row.selectionNormalized === 'New England Patriots').oddsAmerican, 100);
});

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

const fdSlate = read('tests/fixtures/fanduel-nfl-slate-user.txt');
const dkSlate = read('tests/fixtures/draftkings-nfl-slate-user.txt');

for (const [book, fixture, events, expected] of [
  ['FanDuel', fdSlate, 32, [3.5, -112, -108, 158, -188, 44.5, -110, -110]],
  ['DraftKings', dkSlate, 16, [3.5, -118, -102, 142, -170, 44.5, -108, -112]],
]) {
  test(`${book} user NFL slate yields six main-line rows per game with exact opening prices`, async () => {
    const parse = await parser(book);
    const rows = parse(fixture);
    assert.equal(rows.length, events * 6);
    assert.equal(new Set(rows.map(row => row.eventLabelRaw)).size, events);
    assert.ok(rows.every(row => row.sport === 'NFL' && row.period === 'full_game'));
    for (const name of new Set(rows.map(row => row.eventLabelRaw))) {
      const game = rows.filter(row => row.eventLabelRaw === name);
      assert.equal(game.length, 6);
      assert.equal(new Set(game.map(row => row.marketType)).size, 3);
      assert.equal(game.filter(row => row.marketType === 'spread').reduce((sum, row) => sum + row.lineValue, 0), 0);
    }
    const opening = rows.filter(row => row.eventLabelRaw === 'New England Patriots @ Seattle Seahawks');
    const find = (market, selection) => opening.find(row => row.marketType === market && row.selectionNormalized === selection);
    const a = find('spread', 'New England Patriots'), h = find('spread', 'Seattle Seahawks');
    assert.deepEqual([a.lineValue, a.oddsAmerican, h.oddsAmerican, find('moneyline_2way', 'New England Patriots').oddsAmerican,
      find('moneyline_2way', 'Seattle Seahawks').oddsAmerican, find('total', 'Over').lineValue,
      find('total', 'Over').oddsAmerican, find('total', 'Under').oddsAmerican], expected);
    assert.equal(h.lineValue, -expected[0]);
    assert.deepEqual(parse(fixture.replace(/^.*NFL_MAIN_LINES_CAPTURE\nNFL_CAPTURE_LEAGUE: NFL\n/, '')), rows);
  });

  test(`${book} repeated NFL captures deduplicate; partial periods and missing cells never shift prices`, async () => {
    const parse = await parser(book);
    const repetitions = book === 'FanDuel' ? 35 : 5;
    assert.deepEqual(parse(Array(repetitions).fill(fixture).join('\n')), parse(fixture));
    const header = book === 'FanDuel' ? 'SPREAD\nMONEY\nTOTAL' : 'Spread\n\nTotal\n\nMoneyline';
    const half = fixture.replaceAll(header, `1st Half\n${header}`);
    assert.deepEqual(parse(half), []);
    assert.deepEqual(parse(fixture.replaceAll('\nNFL\n', '\nNCAAF\n').replace('NFL_CAPTURE_LEAGUE: NFL', 'NFL_CAPTURE_LEAGUE: NCAAF')), []);
    const price = book === 'FanDuel' ? '-112' : '−118';
    assert.equal(parse(fixture.replace(price, 'Locked')).length, events * 6 - 2);
    assert.equal(parse(fixture.replace(`${price}\n`, '')).length, events * 6 - 6);
  });
}

test('DraftKings NFL breadcrumb overrides unrelated sidebar league names in unmarked captures', async () => {
  const input = dkSlate.replace(/^DRAFTKINGS_NFL_MAIN_LINES_CAPTURE\nNFL_CAPTURE_LEAGUE: NFL\nNFL\n/,
    'NFL\nCFL\nSoccer\nSportsbook / Football Odds / NFL Odds\n');
  assert.equal((await parser('DraftKings'))(input).length, 96);
});

for (const [book, marker, nextFunction] of [
  ['FanDuel', 'FANDUEL', 'chrome.action.onClicked'],
  ['DraftKings', 'DRAFTKINGS', 'async function extractBetMgmMultiPassPayload('],
]) {
  test(`${book} NFL capture exits after one pass even with stale basketball retry markers`, async () => {
    const source = read('ev-parlay-extension/background.js');
    const start = source.indexOf(`async function extract${book}MultiPassPayload(`);
    const end = source.indexOf(nextFunction, start);
    let captures = 0;
    const extract = vm.runInNewContext(`${source.slice(start, end)}\nextract${book}MultiPassPayload`, {
      safeShowToast: async () => {},
      extractSinglePayloadFromTab: async () => { captures += 1; return { source: book, text: `${marker}_NFL_MAIN_LINES_CAPTURE\nNFL_CAPTURE_LEAGUE: NFL\n${marker}_SCHEDULED_STEP: Points\n${marker}_SCHEDULED_RETRY: NBA page not ready` }; },
      mergeExtractionBlocks: blocks => blocks.join('\n'),
      sleepBackground: () => { throw new Error('NFL listing must not wait for another pass'); },
    });
    const payload = await extract(1);
    assert.equal(captures, 1);
    assert.match(payload.text, /NFL_CAPTURE_LEAGUE: NFL/);
  });
}

test('The actual injected extractor returns NFL listings without clicks, timers or prop work', async () => {
  const source = read('ev-parlay-extension/background.js');
  const start = source.indexOf('async function extractOddsTextFromCurrentPage()');
  for (const [hostname, pathname, title, innerText, marker] of [
    ['sportsbook.fanduel.com', '/navigation/nfl', 'NFL Odds', fdSlate, 'FANDUEL'],
    ['sportsbook.draftkings.com', '/leagues/football/nfl', 'NFL Odds', dkSlate, 'DRAFTKINGS'],
  ]) {
    const extract = vm.runInNewContext(`${source.slice(start)}\nextractOddsTextFromCurrentPage`, {
      window: { location: { hostname, pathname } }, document: { title, body: { innerText } },
      setTimeout: () => { throw new Error('NFL listing must not schedule a click or retry'); },
    });
    const result = await extract();
    assert.ok(result.text.startsWith(`${marker}_NFL_MAIN_LINES_CAPTURE`));
    assert.equal(result.text.split(innerText.trim()).length, 2);
  }
});

function scoreNflDom(options = {}) {
  // Synthetic DOM models the market-typed selectors already used by theScore
  // extractor. The supplied Score export lost its original DOM/team names.
  const names = options.names || ['NE Patriots 0-0-0, 1st AFC East', 'SEA Seahawks 0-0-0, 1st NFC West'];
  const values = options.values || [['+3.5', '-120'], ['-3.5', '+100'], ['O 43.5', '-120'], ['U 43.5', '+100'], ['+150'], ['-175']];
  const types = ['AWAY_SPREAD', 'HOME_SPREAD', 'OVER', 'UNDER', 'AWAY_MONEYLINE', 'HOME_MONEYLINE'];
  const buttons = values.map((texts, i) => ({
    disabled: options.locked === i,
    getAttribute: attr => attr === 'data-type' ? types[i] : null,
    querySelectorAll: () => texts.map(innerText => ({ innerText })),
  }));
  if (options.duplicate) buttons.push(buttons[0]);
  const card = {
    querySelector: () => ({ innerText: options.time || 'Sep 9, 2026 · 7:20 PM' }),
    querySelectorAll: selector => selector.includes('team-name') ? names.map(innerText => ({ innerText })) : buttons,
  };
  return {
    title: options.title || 'NFL Odds', body: { innerText: `NFL WNBA NHL\n${names.join('\n')}` },
    querySelector: () => null,
    querySelectorAll: selector => selector === 'article' ? [card] : selector.includes('aria-selected') && options.period ? [{ innerText: options.period }] : [],
  };
}

async function captureScoreNfl(options = {}) {
  const source = read('ev-parlay-extension/background.js');
  const start = source.indexOf('async function extractOddsTextFromCurrentPage()');
  const extract = vm.runInNewContext(`${source.slice(start)}\nextractOddsTextFromCurrentPage`, {
    window: { location: { hostname: 'thescore.bet', pathname: options.path || '/sport/football/nfl' } },
    document: scoreNflDom(options),
    setTimeout: () => { throw new Error('NFL main lines must not schedule prop clicks'); },
  });
  return (await extract()).text;
}

test('theScore NFL typed capture retains football names and all six prices despite mixed navigation', async () => {
  const text = await captureScoreNfl();
  assert.match(text, /THESCORE_CAPTURE_VERSION: 20260908_NFL_1/);
  assert.doesNotMatch(text, /Storm|Sparks|Sport: NHL|Sport: WNBA/);
  const rows = (await parser('TheScore'))(text);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.sport === 'NFL' && row.eventLabelRaw === 'New England Patriots @ Seattle Seahawks'));
  assert.deepEqual(rows.map(row => row.oddsAmerican), [-120, 100, -120, 100, 150, -175]);
  assert.equal((await parser('TheScore'))(await captureScoreNfl({ path: '/sports', title: 'Sports' })).length, 6);
});

test('theScore NFL uses exact team aliases; price text cannot become a pick-em spread', async () => {
  const source = read('ev-parlay-extension/background.js');
  const start = source.indexOf('  function resolveTheScoreNflTeam(');
  const end = source.indexOf('  function buildTheScoreNflExport(', start);
  const resolve = vm.runInNewContext(`${source.slice(start, end)}\nresolveTheScoreNflTeam`, { clean: value => String(value || '').replace(/\s+/g, ' ').trim() });
  for (const [value, expected] of [['NY Jets', 'New York Jets'], ['NY Giants', 'New York Giants'], ['LA Rams', 'Los Angeles Rams'], ['LA Chargers', 'Los Angeles Chargers'], ['SF 49ers 0-0-0, 1st NFC West', 'San Francisco 49ers'], ['NY', ''], ['Seattle Storm', ''], ['University of Arizona', '']]) assert.equal(resolve(value), expected);
  const parse = await parser('TheScore');
  const values = [['PK', '-110'], ['0', '-110'], ['O 43.5', '-120'], ['U 43.5', 'EVEN'], ['+150'], ['-175']];
  const rows = parse(await captureScoreNfl({ values }));
  assert.equal(rows.length, 6);
  assert.ok(rows.filter(row => row.marketType === 'spread').every(row => row.lineValue === 0 && row.oddsAmerican === -110));
  values[0] = ['-110'];
  assert.equal(parse(await captureScoreNfl({ values })).length, 4);
});

test('theScore NFL rejects ambiguous, partial-period, live and locked typed selections', async () => {
  const parse = await parser('TheScore');
  for (const options of [{ duplicate: true }, { period: '1st Half' }, { time: 'Live 1st Quarter' }, { names: ['NY', 'LA'] }])
    assert.deepEqual(parse(await captureScoreNfl(options)), []);
  assert.equal(parse(await captureScoreNfl({ locked: 0 })).length, 4);
});

test('theScore corrupted user export is rejected instead of inventing football identities', async () => {
  const parse = await parser('TheScore');
  assert.deepEqual(parse(read('tests/fixtures/thescore-nfl-corrupt-user.txt')), []);
  const page = read('app/ev-parlay-lab/page.js');
  assert.match(page, /theScore NFL: no usable full-game pairs found/);
});

test('All four supplied NFL slates normalize and calculate together with FanDuel in sharp mode', async () => {
  const { normalizeParsedRows } = await moduleExports('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await moduleExports('app/ev-parlay-lab/utils/matchMarkets.js');
  const { calculateFairOddsForMarkets } = await moduleExports('app/ev-parlay-lab/utils/fairOdds.js');
  const { buildParlayCandidates } = await moduleExports('app/ev-parlay-lab/utils/parlayEngine.js');
  const { SAMPLE_FILTERS } = await moduleExports('app/ev-parlay-lab/data/sampleData.js');
  const inputs = [['Pinnacle', pinSlate], ['BetMGM', mgmDual], ['FanDuel', fdSlate], ['DraftKings', dkSlate]];
  const parsed = (await Promise.all(inputs.map(async ([book, text]) => (await parser(book))(text)))).flat();
  // Same roles applied by the app when its existing FanDuel sharp toggle is ON.
  const rows = normalizeParsedRows(parsed.map(row => row.sportsbook === 'FanDuel'
    ? { ...row, isSharpSource: true, isTargetBook: false, batchRole: 'fair_odds' } : row));
  const markets = buildCanonicalMarkets(rows).markets;
  const fair = calculateFairOddsForMarkets(markets, { method: 'power' });
  const result = buildParlayCandidates({ rows, markets, fairOddsResults: fair, filters: SAMPLE_FILTERS });
  assert.equal(rows.length, 468);
  assert.equal(markets.length, 124);
  assert.ok(markets.every(market => market.sport === 'NFL'));
  assert.ok(fair.length > 0);
  assert.ok(result.counts.eligibleLegs > 0);
  assert.ok(result.parlays.length > 0);
  assert.ok(result.parlays.every(parlay => parlay.legs.every(leg => Number.isFinite(leg.oddsDecimal))));
});
