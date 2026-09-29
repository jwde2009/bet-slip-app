const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function loadModule(file, bindings = {}) {
  const context = vm.createContext({ console: { log() {}, warn() {} }, setTimeout, clearTimeout, ...bindings });
  const modules = new Map();
  function load(filename) {
    if (!modules.has(filename)) modules.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context, identifier: filename }));
    return modules.get(filename);
  }
  const entry = load(path.join(root, file));
  await entry.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), `${specifier}.js`)));
  await entry.evaluate();
  return entry.namespace;
}
async function parse(raw, context = {}) {
  const { parseDraftKingsText } = await loadModule('app/ev-parlay-lab/utils/parsers/parseDraftKingsText.js');
  return plain(parseDraftKingsText(raw, context));
}

// Synthetic baseball fixtures: the row-major arrangement comes from the user
// DK NFL capture, with MLB Run Line terminology. Not a supplied/live MLB export.
const prefix = 'DRAFTKINGS_CURRENT_CAPTURE\nMLB_CAPTURE_LEAGUE: MLB\nNBA\nWNBA\nNFL\nSportsbook / Baseball Odds / MLB Odds\nGame Lines\nRun Line\nTotal\nMoneyline\n';
const card = 'Texas Rangers\nAT\nNew York Mets\n+1.5\n-155\nO\n8.5\n-110\n+130\n-1.5\n+125\nU\n8.5\nEVEN\n-150\n7:10 PM\nMore Bets\n';
const detail = 'DRAFTKINGS_CURRENT_CAPTURE\nMLB_CAPTURE_LEAGUE: MLB\nSportsbook / Baseball Odds / MLB Odds / Texas Rangers @ New York Mets Odds\n';

test('DraftKings MLB Run Line tables retain exact prices and canonical MLB identities across multiple cards', async () => {
  const rows = await parse(prefix + card + card.replace('Texas Rangers', 'SF Giants').replace('New York Mets', 'LA Dodgers'));
  assert.equal(rows.length, 12);
  assert.ok(rows.every(row => row.sport === 'MLB' && row.league === 'MLB' && row.period === 'full_game'));
  assert.deepEqual(rows.slice(0, 6).map(row => [row.marketType, row.selectionNormalized, row.lineValue, row.oddsAmerican]), [
    ['spread', 'Texas Rangers', 1.5, -155], ['spread', 'New York Mets', -1.5, 125],
    ['total', 'Over', 8.5, -110], ['total', 'Under', 8.5, 100],
    ['moneyline_2way', 'Texas Rangers', null, 130], ['moneyline_2way', 'New York Mets', null, -150],
  ]);
  assert.equal(rows[6].eventLabelRaw, 'San Francisco Giants @ Los Angeles Dodgers');
  assert.ok(rows.every(row => row.isTargetBook && !row.isSharpSource));
});

test('DraftKings MLB supports detail, unmarked breadcrumb, inline O/U and repeated captures without duplicating prices', async () => {
  assert.equal((await parse(detail + 'Game Lines\nRun Line\nTotal\nMoneyline\n' + card)).length, 6);
  assert.equal((await parse((prefix + card).replace('MLB_CAPTURE_LEAGUE: MLB\n', '').replaceAll('O\n8.5', 'Over 8.5').replaceAll('U\n8.5', 'Under 8.5'))).length, 6);
  const repeated = (prefix + card).repeat(18) + prefix + card.replace('+130', '+140');
  const rows = await parse(repeated);
  assert.equal(rows.length, 6);
  assert.equal(rows.find(row => row.marketType === 'moneyline_2way').oddsAmerican, 140);
});

test('DraftKings MLB cannot substitute pitcher names, locked cells, mismatched lines or adjacent market prices', async () => {
  assert.deepEqual(await parse(prefix + card.replace('New York Mets', 'R. Gusto')), []);
  assert.equal((await parse(prefix + card.replace('-155', 'Locked'))).length, 4);
  assert.deepEqual(await parse(prefix + card.replace('-155\n', '')), []);
  assert.equal((await parse(prefix + card.replace('-1.5', '-2.5'))).length, 4);
  assert.equal((await parse(prefix + card.replace('U\n8.5', 'U\n9.5'))).length, 4);
  assert.deepEqual(await parse(prefix + card.slice(0, card.indexOf('+125')) + '\nTotal Bases O/U\nJuan Soto\nO\n1.5\n-110\nU\n1.5\n-110'), []);
});

test('DraftKings MLB requires MLB scope and keeps innings, team totals and other leagues out of game rows', async () => {
  const { parseDraftKingsMlb } = await loadModule('app/ev-parlay-lab/utils/parsers/draftKingsMlb.js');
  assert.equal(parseDraftKingsMlb('MLB\nNFL\nRun Line\nTotal\nMoneyline\n' + card), null);
  for (const heading of ['1st 5 Innings', '1st Inning', 'First Five Innings', 'Team Totals', 'Alternate Run Line', 'Live']) {
    assert.deepEqual(await parse(prefix.replace('Game Lines', heading) + card), [], heading);
  }
  assert.deepEqual(await parse(prefix + 'Sportsbook / Hockey Odds / NHL Odds\nRun Line\nTotal\nMoneyline\n' + card), []);
});

test('DraftKings MLB explicit player O/U pairs preserve event, names, thresholds and market types', async () => {
  const rows = await parse(detail + 'Total Bases O/U\nPlayer\nOver\nUnder\nJuan Soto\nO\n1.5\n+110\nU\n1.5\n-140\nStrikeouts O/U\nJacob deGrom\nOver 6.5\n-120\nUnder 6.5\nEVEN\n');
  assert.deepEqual(rows.map(row => [row.marketType, row.selectionNormalized, row.lineValue, row.oddsAmerican]), [
    ['player_total_bases', 'Juan Soto Over', 1.5, 110], ['player_total_bases', 'Juan Soto Under', 1.5, -140],
    ['pitcher_strikeouts', 'Jacob deGrom Over', 6.5, -120], ['pitcher_strikeouts', 'Jacob deGrom Under', 6.5, 100],
  ]);
  assert.ok(rows.every(row => row.eventLabelRaw === 'Texas Rangers @ New York Mets'));
});

test('DraftKings MLB props reject unscoped events, unlabelled ladders, partial pairs and neighboring unsupported markets', async () => {
  const prop = 'Total Bases O/U\nJuan Soto\nO\n1.5\n+110\nU\n1.5\n-140\n';
  assert.deepEqual(await parse(prefix + prop), []);
  assert.deepEqual(await parse(detail + prop.replace('Total Bases O/U', 'Total Bases\n1+\n2+')), []);
  assert.deepEqual(await parse(detail + prop.replace('-140', 'Locked')), []);
  assert.deepEqual(await parse(detail + prop.replace('U\n1.5', 'U\n2.5')), []);
  assert.deepEqual(await parse(detail + prop.replace('U\n1.5\n-140', 'Home Runs\nU\n1.5\n-140')), []);
  assert.deepEqual(await parse(detail + '1st 5 Innings\n' + prop), []);
  const unknown = 'Unsupported Player Market\nJacob deGrom\nO\n6.5\n-110\nU\n6.5\n-110\n';
  assert.equal((await parse(detail + prop + unknown)).length, 2);
  assert.deepEqual(await parse(detail + 'Pitcher Props\n' + prop.replace('Total Bases O/U', 'Hits O/U')), []);
  assert.equal((await parse(detail + 'Pitcher Props\n' + prop.replace('Total Bases O/U', 'Batter Hits O/U'))).length, 2);
});

test('DraftKings MLB and Pinnacle MLB normalize into the same run line and prop markets', async () => {
  const { normalizeParsedRows } = await loadModule('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await loadModule('app/ev-parlay-lab/utils/matchMarkets.js');
  const dk = await parse(prefix + card + detail + 'Total Bases O/U\nJuan Soto\nO\n1.5\n+110\nU\n1.5\n-140\n');
  const pin = dk.map(row => ({ ...row, sportsbook: 'Pinnacle', isSharpSource: true, isTargetBook: false }));
  const markets = plain(buildCanonicalMarkets(normalizeParsedRows([...dk, ...pin]))).markets;
  assert.equal(markets.length, 4);
  assert.ok(markets.every(market => market.selections.every(selection => selection.quotes.length === 2)));
  assert.ok(markets.every(market => market.selections.length === 2));
});

test('MLB run-line matching keeps opposite alternate handicaps separate and preserves selection signs in fair odds', async () => {
  const { normalizeParsedRows } = await loadModule('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await loadModule('app/ev-parlay-lab/utils/matchMarkets.js');
  const { calculateFairOddsForMarkets } = await loadModule('app/ev-parlay-lab/utils/fairOdds.js');
  const { getSelectionLineValue } = await loadModule('app/ev-parlay-lab/utils/marketNormalization.js');
  const base = (await parse(prefix + card)).filter(row => row.marketType === 'spread');
  const sharp = base.map(row => ({ ...row, sportsbook: 'Pinnacle', isSharpSource: true, isTargetBook: false }));
  const markets = buildCanonicalMarkets(normalizeParsedRows([...sharp, ...base, ...base.map(row => ({ ...row, lineValue: -row.lineValue }))])).markets;
  assert.equal(markets.length, 2);
  assert.ok(markets.every(market => market.selections.length === 2));
  for (const market of markets) for (const selection of market.selections) {
    assert.equal(getSelectionLineValue(market, selection), selection.label === 'New York Mets' ? -market.lineValue : market.lineValue);
  }
  const fair = calculateFairOddsForMarkets(markets);
  assert.ok(fair.length > 0);
});

const extension = read('ev-parlay-extension/background.js');
function workflow(pathname, page, visible = []) {
  const stored = new Map([['EV_DK_TARGET_WORKFLOW_LABELS', '["POINTS","COMBOS"]']]);
  const from = extension.indexOf('function isDraftKingsMlbPage()');
  const to = extension.indexOf('    function scheduleDraftKingsClickByLabel', from);
  const context = vm.createContext({ window: { location: { pathname, href: pathname } }, document: { body: { innerText: page } },
    clean: value => String(value).replace(/\s+/g, ' ').trim(), normalizeDraftKingsLabel: value => value.toLowerCase(),
    sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    getDraftKingsClickableByExactText: label => visible.includes(label), findClickableByExactVisibleText: () => null,
  });
  return vm.runInContext(`${extension.slice(from, to)}\n({labels:getDraftKingsWorkflowLabels, next:getDraftKingsNextWorkflowLabel, isMlb:isDraftKingsMlbPage})`, context);
}

test('DraftKings MLB capture ignores stale basketball targets and skips absent tabs without losing later visible prop tabs', () => {
  const visible = ['Batter Props'];
  const flow = workflow('/leagues/baseball/mlb', 'NBA NHL MLB NFL', visible);
  assert.ok(flow.isMlb());
  assert.ok(flow.labels().includes('Strikeouts'));
  assert.ok(!flow.labels().includes('POINTS'));
  assert.equal(flow.next(), 'Batter Props');
  visible.push('Total Bases', 'Pitcher Props');
  assert.equal(flow.next(), 'Total Bases');
  assert.equal(flow.next(), 'Pitcher Props');
  visible.push('Strikeouts');
  assert.equal(flow.next(), 'Strikeouts');
  assert.equal(flow.next(), '');
  assert.equal(workflow('/event/123', 'Sportsbook / Baseball Odds / MLB Odds / Rangers @ Mets Odds').isMlb(), true);
  assert.equal(workflow('/leagues/basketball/nba', 'MLB NBA').isMlb(), false);
});

test('Large import previews are bounded; copy and download preserve every character including CRLF and Unicode', async () => {
  const { importTextPreview, copyImportText, downloadImportText } = await loadModule('app/ev-parlay-lab/utils/importTextTools.js');
  const raw = 'MLB\r\nJosé Ramírez −120\n'.repeat(30000);
  const preview = importTextPreview(raw);
  assert.equal(preview.text.length, 30000);
  assert.equal(preview.length, raw.length);
  assert.ok(preview.truncated);
  let copied, downloaded, revoked, clicked = false, removed = false;
  await copyImportText(raw, { writeText: async text => { copied = text; } });
  const anchor = { click() { clicked = true; }, remove() { removed = true; } };
  downloadImportText(raw, 'DraftKings', { Blob, URL: { createObjectURL(blob) { downloaded = blob; return 'blob:test'; }, revokeObjectURL(url) { revoked = url; } },
    document: { createElement: () => anchor, body: { appendChild() {} } }, setTimeout: callback => callback() });
  assert.equal(copied, raw);
  assert.equal(await downloaded.text(), raw);
  assert.ok(clicked && removed);
  assert.equal(revoked, 'blob:test');
  assert.match(anchor.download, /^draftkings-import-.*\.txt$/);
  await assert.rejects(copyImportText(raw, {}), /Clipboard unavailable/);
  await assert.rejects(copyImportText(raw, { writeText: async () => { throw new Error('Permission denied'); } }), /Permission denied/);
});

test('Background parsing returns rows and terminates its worker; errors, timeout, cancellation and late results cannot commit', async () => {
  const { parseOddsInBackground } = await loadModule('app/ev-parlay-lab/utils/parseOddsInBackground.js');
  for (const mode of ['success', 'parse-error', 'load-error', 'decode-error', 'malformed', 'timeout', 'cancel']) {
    let sent, stopped = 0;
    const worker = { postMessage: value => { sent = value; }, terminate: () => stopped++ };
    const job = parseOddsInBackground('raw', { sportsbook: 'DraftKings' }, { makeWorker: () => worker, timeoutMs: 10 });
    const result = mode === 'success' ? job.promise : assert.rejects(job.promise);
    assert.equal(sent.text, 'raw');
    if (mode === 'success') worker.onmessage({ data: { rows: [{ sport: 'MLB' }] } });
    if (mode === 'parse-error') worker.onmessage({ data: { error: 'bad capture' } });
    if (mode === 'load-error') worker.onerror();
    if (mode === 'decode-error') worker.onmessageerror();
    if (mode === 'malformed') worker.onmessage({ data: {} });
    if (mode === 'cancel') job.cancel();
    const value = await result;
    if (mode === 'success') assert.deepEqual(plain(value), [{ sport: 'MLB' }]);
    worker.onmessage({ data: { rows: ['late'] } });
    job.cancel();
    assert.equal(stopped, 1, mode);
  }
  const broken = parseOddsInBackground('', {}, { makeWorker: () => { throw new Error('Worker unavailable'); } });
  await assert.rejects(broken.promise, /Worker unavailable/);
});

test('The actual React import component renders a bounded preview and full-text actions', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const helpers = await loadModule('app/ev-parlay-lab/utils/importTextTools.js');
  const filename = 'app/ev-parlay-lab/components/ImportTextInput.js';
  const swc = require('next/dist/build/swc');
  await swc.loadBindings();
  const { code } = await swc.transform(read(filename), {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const compiled = { exports: {} };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports,
    require: name => name.includes('importTextTools') ? helpers : require(name) });
  const raw = 'test capture\n'.repeat(50000) + 'END_OF_FULL_CAPTURE';
  const html = renderToStaticMarkup(React.createElement(compiled.exports.default, { rawText: raw, setRawText() {}, sportsbook: 'DraftKings' }));
  assert.match(html, /Copy full text/);
  assert.match(html, /Download TXT/);
  assert.match(html, /readOnly=""/);
  assert.equal(html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1].length, 30000);
  assert.ok(!html.includes('END_OF_FULL_CAPTURE'));
  assert.ok(html.length < 35000);
});

test('The actual worker runs the app parser router and returns MLB rows without DOM globals', async () => {
  let response;
  const self = { postMessage: value => { response = value; } };
  await loadModule('app/ev-parlay-lab/workers/parseOdds.worker.js', { self });
  self.onmessage({ data: { text: prefix + card, context: { sportsbook: 'DraftKings' } } });
  assert.equal(response.rows.length, 6);
  assert.ok(response.rows.every(row => row.sport === 'MLB'));
});

test('Import handler retains rows on zero/error/cancel and ignores stale worker completion', async () => {
  const source = read('app/ev-parlay-lab/page.js');
  const start = source.indexOf('   async function handleParse()');
  const end = source.indexOf('  function applyBatchRoleToRows(', start);
  assert.ok(start >= 0 && end > start);
  for (const mode of ['zero', 'error', 'stale', 'success']) {
    let complete, fail, busy = false, notice = '', changed = 0, timestamp = '';
    const parseJob = { current: null };
    const job = { promise: new Promise((resolve, reject) => { complete = resolve; fail = reject; }), cancel() { fail(new Error('Canceled')); } };
    const run = vm.runInNewContext(`${source.slice(start, end)}\nhandleParse`, {
      rawText: prefix + card, sportsbook: 'DraftKings', batchRole: 'target', importMode: 'append', parseJob,
      cancelActiveParse() { parseJob.current?.cancel(); parseJob.current = null; }, parseOddsInBackground: () => job,
      setIsParsing: value => { busy = value; }, setParseNotice: value => { notice = value; },
      setRows: () => { changed++; }, setLastParsedAt: value => { timestamp = value; },
      applyBatchRoleToRows: rows => rows, normalizeParsedRows: rows => rows, makeParsedRowId: () => 'row',
    });
    const pending = run();
    assert.equal(busy, true);
    if (mode === 'stale') parseJob.current = null;
    if (mode === 'error') fail(new Error('Capture failed'));
    else complete(mode === 'zero' ? [] : [{ sport: 'MLB' }]);
    await pending;
    assert.equal(changed, mode === 'success' ? 1 : 0);
    assert.equal(Boolean(timestamp), mode === 'success');
    if (mode !== 'stale') assert.equal(busy, false);
    if (mode === 'zero') assert.match(notice, /Download TXT/);
    if (mode === 'error') assert.match(notice, /retained/);
  }
});
