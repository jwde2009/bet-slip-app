const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const plain = value => JSON.parse(JSON.stringify(value));

// Load the actual extensionless ES modules without changing the Next.js app's
// module settings or installing a separate test/transpilation dependency.
async function parser(book) {
  const context = vm.createContext({ console });
  const modules = new Map();
  function load(file) {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(
      fs.readFileSync(file, 'utf8'), { context, identifier: file }
    ));
    return modules.get(file);
  }
  const entry = load(path.join(root, `app/ev-parlay-lab/utils/parsers/parse${book}Text.js`));
  await entry.link((specifier, parent) => {
    const file = path.resolve(path.dirname(parent.identifier), specifier);
    return load(path.extname(file) ? file : `${file}.js`);
  });
  await entry.evaluate();
  return (text, context = {}) => plain(entry.namespace[`parse${book}Text`](text, context));
}

const extension = read('ev-parlay-extension/background.js');
function extensionSection(start, end, bindings = {}) {
  const from = extension.indexOf(start);
  const to = extension.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source boundaries: ${start}`);
  return vm.runInNewContext(`${extension.slice(from, to)}\n${start.match(/function (\w+)/)[1]}`, { clean, ...bindings });
}

test('supplied theScore export: 145 literal rows; team totals are not supported yet', async () => {
  const parse = await parser('TheScore');
  const rows = parse(read('tests/fixtures/thescore-mlb-legacy.txt'));
  assert.equal(rows.length, 145);
  assert.ok(rows.every(row => row.sport === 'MLB'));
  assert.ok(rows.every(row => row.eventLabelRaw === 'San Francisco Giants @ New York Mets'));
  // Preserve literal captured values, not an inferred repair of historic odds.
  const soto = rows.find(row => row.marketType === 'player_home_runs' && row.selectionNormalized === 'J. Soto Over');
  assert.equal(soto.lineValue, 1.5);
  assert.equal(soto.oddsAmerican, 240);
});

test('supplied collapsed Pinnacle props yield no invented prop rows', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(read('tests/fixtures/pinnacle-mlb-collapsed.txt'));
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => ['moneyline_2way', 'spread', 'total'].includes(row.marketType)));
  assert.equal(rows.find(row => row.marketType === 'moneyline_2way' && row.selectionNormalized === 'San Francisco Giants').oddsAmerican, 148);
});

const pinEvent = `Baseball\nMLB\nSan Francisco Giants @ New York Mets\nSaturday, September 5, 2026 at 15:10\nSan Francisco Giants\nNew York Mets\nPLAYER PROPS\n`;

test('supplied expanded Pinnacle page: all 38 prop pairs and six game rows', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(read('tests/fixtures/pinnacle-mlb-expanded.txt'));
  assert.equal(rows.length, 82);
  assert.ok(rows.every(row => row.sport === 'MLB' && row.league === 'MLB'));
  assert.ok(rows.every(row => row.eventLabelRaw === 'San Francisco Giants @ New York Mets'));
  const counts = {};
  const pairs = new Map();
  for (const row of rows) {
    counts[row.marketType] = (counts[row.marketType] || 0) + 1;
    if (!/^(player_|pitcher_)/.test(row.marketType)) continue;
    const player = row.selectionNormalized.replace(/ (Over|Under)$/, '');
    const key = `${player}|${row.marketType}|${row.lineValue}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(row.selectionNormalized.slice(player.length + 1));
  }
  assert.deepEqual(counts, {
    moneyline_2way: 2, spread: 2, total: 2,
    player_total_bases: 34, player_home_runs: 26,
    pitcher_earned_runs_allowed: 4, pitcher_hits_allowed: 4,
    pitcher_outs_recorded: 4, pitcher_strikeouts: 4,
  });
  assert.equal(pairs.size, 38);
  for (const sides of pairs.values()) assert.deepEqual(sides.sort(), ['Over', 'Under']);

  // Actual captured prices, including text suffixes such as "Bases" and "Runs".
  for (const [market, selection, line, odds] of [
    ['player_total_bases', 'Juan Soto Over', 1.5, 117],
    ['player_total_bases', 'Juan Soto Under', 1.5, -156],
    ['player_home_runs', 'Juan Soto Over', 0.5, 290],
    ['player_home_runs', 'Juan Soto Under', 0.5, -436],
    ['pitcher_strikeouts', 'Zac Thornton Over', 4.5, -135],
    ['pitcher_strikeouts', 'Zac Thornton Under', 4.5, 102],
    ['pitcher_earned_runs_allowed', 'Anthony Molina Over', 2.5, -101],
    ['pitcher_outs_recorded', 'Anthony Molina Under', 14.5, -118],
  ]) {
    const row = rows.find(row => row.marketType === market && row.selectionNormalized === selection);
    assert.ok(row, `${market}: ${selection}`);
    assert.equal(row.lineValue, line);
    assert.equal(row.oddsAmerican, odds);
  }

  // Expanded team totals, innings and exact scores must not leak into Game rows.
  assert.deepEqual(rows.filter(row => !/^(player_|pitcher_)/.test(row.marketType))
    .map(row => [row.marketType, row.selectionNormalized, row.lineValue, row.oddsAmerican]), [
    ['moneyline_2way', 'San Francisco Giants', null, 148],
    ['moneyline_2way', 'New York Mets', null, -162],
    ['spread', 'San Francisco Giants', 1.5, -146],
    ['spread', 'New York Mets', -1.5, 132],
    ['total', 'Over', 8, -108],
    ['total', 'Under', 8, -104],
  ]);
});

test('BetOnline captures cannot fall through to another book\'s odds parser', async () => {
  const context = vm.createContext({ console: { log() {} } });
  const route = new vm.SourceTextModule(read('app/ev-parlay-lab/utils/parseOddsText.js'), { context });
  const calls = [];
  await route.link(specifier => {
    const exportName = path.basename(specifier);
    return new vm.SyntheticModule([exportName], function () {
      this.setExport(exportName, () => { calls.push(exportName); return []; });
    }, { context });
  });
  await route.evaluate();
  // "More Bets" triggers the legacy DraftKings auto-detection for unknown books.
  const raw = 'MLB\nSan Francisco Giants @ New York Mets\nMore Bets';
  for (const sportsbook of ['BetOnline', 'Bet Online', ' betonline ']) {
    assert.deepEqual(plain(route.namespace.parseOddsText(raw, { sportsbook })), []);
  }
  assert.deepEqual(plain(route.namespace.parseOddsText(`BETONLINE_INITIAL_CAPTURE\n${raw}`, { sportsbook: 'Auto' })), []);
  assert.deepEqual(calls, []);
  route.namespace.parseOddsText(raw, { sportsbook: 'Pinnacle' });
  assert.deepEqual(calls, ['parsePinnacleText']);
});

// Real supplied header names, with explicitly synthetic expanded prices. These
// validate parser behavior, NOT live extraction or the actual market odds.
for (const [label, market] of [
  ['Zac Thornton Total Strikeouts', 'pitcher_strikeouts'],
  ['Anthony Molina Total Pitching Outs', 'pitcher_outs_recorded'],
  ['Anthony Molina Total Earned Runs', 'pitcher_earned_runs_allowed'],
  ['Anthony Molina Total Hits Allowed', 'pitcher_hits_allowed'],
  ['Juan Soto Total Bases', 'player_total_bases'],
  ['Juan Soto Total Home Runs', 'player_home_runs'],
]) {
  test(`Pinnacle recognizes expanded ${label}`, async () => {
    const parse = await parser('Pinnacle');
    const rows = parse(pinEvent + `${label}\nOver 1.5\n-110\nUnder 1.5\n+100`);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.marketType === market && row.lineValue === 1.5));
    assert.deepEqual(rows.map(row => row.oddsAmerican), [-110, 100]);
  });
}

test('Pinnacle handles adjacent props without skipping the next header', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(pinEvent + 'Juan Soto (Total Bases)\nOver 1.5\n-110\nUnder 1.5\n-110\nZac Thornton (Total Strikeouts)\nOver 5.5\n+100\nUnder 5.5\n-120');
  assert.equal(rows.length, 4);
});

test('Pinnacle rejects reversed or mismatched O/U labels', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(pinEvent + 'Juan Soto (Total Bases)\nUnder 1.5\n-110\nUnder 1.5\n-110');
  assert.equal(rows.length, 0);
});

test('Pinnacle preserves legacy parentheses and NBA props', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(pinEvent + 'Juan Soto (Total Bases)(must start)\nOver 1.5\n1.91\nUnder 1.5\n1.91');
  assert.equal(rows.length, 2);
  const nba = parse(pinEvent.replace('Baseball\nMLB', 'Basketball\nNBA') + 'Example Player Total Points\nOver 20.5\n-110\nUnder 20.5\n-110');
  assert.equal(nba.length, 2);
  assert.equal(nba[0].marketType, 'player_points');
});

function extractLadder(headers, prices) {
  const cells = prices.map(price => ({ querySelectorAll: () => price ? [{ innerText: price }] : [], colSpan: 1 }));
  const row = { querySelector: () => ({ innerText: 'J. Soto' }), querySelectorAll: () => cells };
  const table = { querySelectorAll: selector => selector === 'thead th'
    ? headers.map(innerText => ({ innerText, colSpan: 1, rowSpan: 1 })) : [row] };
  const drawer = {
    querySelector: selector => selector === 'summary h2' ? { innerText: 'Home Runs' } : selector === 'table' ? table : null,
    querySelectorAll: selector => selector === 'tbody tr' ? [row] : [],
  };
  const main = { innerText: '', querySelectorAll: () => [] };
  const document = {
    body: main,
    querySelector: () => main,
    querySelectorAll: selector => selector === 'details[data-testid]' ? [drawer] : [],
  };
  return extensionSection('  function buildGamePageExport()', '  function buildLandingPageExport()', {
    document,
    eventText: () => 'San Francisco Giants @ New York Mets',
    cleanTeamName: value => value,
    sportText: () => 'MLB',
  })();
}

test('theScore preserves blank corner header: 1+ price stays 1+', () => {
  const output = extractLadder(['', '1+', '2+'], ['+240', '+1800']);
  assert.match(output, /J\. Soto \| 1\+ \| \+240/);
  assert.match(output, /J\. Soto \| 2\+ \| \+1800/);
});

test('theScore supports named or absent corner headers', () => {
  for (const headers of [['Player', '1+', '2+'], ['1+', '2+']]) {
    const output = extractLadder(headers, ['+240', '+1800']);
    assert.match(output, /J\. Soto \| 1\+ \| \+240/);
    assert.match(output, /J\. Soto \| 2\+ \| \+1800/);
  }
});

test('theScore keeps an unavailable ladder cell in its original column', () => {
  const output = extractLadder(['', '1+', '2+', '3+'], ['+240', null, '+4000']);
  assert.match(output, /J\. Soto \| 1\+ \| \+240/);
  assert.match(output, /J\. Soto \| 3\+ \| \+4000/);
  assert.doesNotMatch(output, /J\. Soto \| 2\+/);
});

test('theScore rejects ambiguous ladder column counts', () => {
  assert.doesNotMatch(extractLadder(['', '1+', '2+'], ['+240']), /^J\. Soto \|/m);
  assert.doesNotMatch(extractLadder(['1+', '2+', '3+'], ['+240', '+1800']), /^J\. Soto \|/m);
});

test('Pinnacle cannot borrow an unsupported neighboring prop\'s prices', async () => {
  const parse = await parser('Pinnacle');
  const rows = parse(pinEvent + 'Juan Soto Total Bases\nExample Player Total Singles\nOver 1.5\n-110\nUnder 1.5\n-110');
  assert.equal(rows.length, 0);
});

test('theScore filters basketball targets from an MLB or tennis capture', () => {
  const filter = extensionSection('  function filterTheScoreTargetLabelsForSport(', '  function isTheScoreMarketTabText(');
  const basketball = ['Points', 'Rebounds', 'Assists', 'Threes', '3-Pointers Made', 'Combos', 'Pts + Reb + Ast', 'Double Double', 'Triple Double'];
  assert.deepEqual(plain(filter(basketball, 'MLB')), []);
  assert.deepEqual(plain(filter(basketball, 'TENNIS')), []);
  assert.deepEqual(plain(filter(basketball, 'WNBA')), basketball);
  assert.deepEqual(plain(filter([...basketball, 'Pitcher Strikeouts', 'Total Bases'], 'MLB')), ['Pitcher Strikeouts', 'Total Bases']);
});

test('theScore tennis URL wins over WNBA sidebar text', () => {
  const detect = extensionSection('    function sportText()', '  function detectMarket(', {
    document: { body: { innerText: 'WNBA\nIndiana Fever\nTennis' } },
    window: { location: { pathname: '/sports/tennis/event-1' } },
  });
  assert.equal(detect(), 'TENNIS');
});

function extractMainLines({ textOnly = false, duplicateTypes = false, conflictingOdds = false } = {}) {
  // Synthetic DOM with deliberately misleading raw-text order. Only the typed
  // moneyline buttons should determine moneyline prices.
  const raw = 'Main Lines\nSpread Total Money\nSan Francisco Giants\n+1.5\n-155\n-155\nO 7.5\n-125\nNew York Mets\n-1.5\n+130\n+130\nU 7.5\n+105';
  const teams = ['San Francisco Giants', 'New York Mets'].map(innerText => ({ innerText }));
  const prices = [
    ['AWAY_SPREAD', ['+1.5', '-155']], ['HOME_SPREAD', ['-1.5', '+130']],
    ['OVER', ['O 7.5', '-125']], ['UNDER', ['U 7.5', '+105']],
    ['AWAY_MONEYLINE', conflictingOdds ? ['+145', '+150'] : ['+145']], ['HOME_MONEYLINE', ['-160']],
  ];
  if (duplicateTypes) prices.push(['AWAY_MONEYLINE', ['+110']]);
  const buttons = prices.map(([type, spans]) => ({
    getAttribute: () => type,
    querySelectorAll: () => spans.map(innerText => ({ innerText })),
  }));
  const main = {
    innerText: raw,
    querySelectorAll: selector => selector === 'button[data-testid="team-name"]' ? teams : textOnly ? [] : buttons,
  };
  return extensionSection('  function buildGamePageExport()', '  function buildLandingPageExport()', {
    document: { body: main, querySelector: () => main, querySelectorAll: () => [] },
    eventText: () => 'San Francisco Giants @ New York Mets',
    cleanTeamName: value => value,
    sportText: () => 'MLB',
  })();
}

test('theScore reads moneyline odds from moneyline buttons, not duplicated spread text', () => {
  const output = extractMainLines();
  assert.match(output, /Market: Moneyline\nSan Francisco Giants \| \+145\nNew York Mets \| -160/);
  assert.match(output, /Market: Spread\nSan Francisco Giants \| \+1\.5 \| -155/);
});

test('theScore fails closed for ambiguous MLB main lines', () => {
  for (const options of [{ textOnly: true }, { duplicateTypes: true }, { conflictingOdds: true }]) {
    const output = extractMainLines(options);
    assert.doesNotMatch(output, /Market: Moneyline/);
    assert.match(output, /THESCORE_MAIN_LINES_SKIPPED/);
  }
});

test('theScore resolves MLB-only aliases without WNBA/NHL substitutions', () => {
  const resolve = extensionSection('  function resolveTheScoreMlbTeam(', '  function eventText()');
  for (const [input, expected] of [
    ['Baltimore Orioles', 'Baltimore Orioles'], ['BAL Orioles', 'Baltimore Orioles'],
    ['COL Rockies', 'Colorado Rockies'], ['ATL', 'Atlanta Braves'],
    ['NYM', 'New York Mets'], ['SEA', 'Seattle Mariners'],
    ['Rangers', 'Texas Rangers'], ['SF Giants', 'San Francisco Giants'],
    ['NY Mets', 'New York Mets'], ['St Louis Cardinals', 'St. Louis Cardinals'],
  ]) assert.equal(resolve(input), expected);
  for (const input of ['R Gusto', 'NY', 'LA', 'Chicago', 'Atlanta Dream', 'Unknown Event']) assert.equal(resolve(input), '');

  const inferEvent = extensionSection('  function eventText()', '    function sportText()', {
    document: { body: { innerText: 'ATL @ NYM' }, querySelectorAll: selector => selector === 'h1, h2, h3' ? [{ innerText: 'ATL @ NYM' }] : [] },
    sportText: () => 'MLB', resolveTheScoreMlbTeam: resolve,
  });
  assert.equal(inferEvent(), 'Atlanta Braves @ New York Mets');
});
