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

const coreFile = 'app/ev-parlay-lab/utils/parsers/nflCaptureCore.js';
const routerFile = 'app/ev-parlay-lab/utils/parseOddsText.js';
const tableFile = 'app/ev-parlay-lab/utils/parsers/parseOddsTable.js';
const nflEvent = 'Atlanta Falcons @ New Orleans Saints';
const quote = (side, odds = -110) => ({ marketType: 'player_receiving_yards', subject: 'Drake London', side, line: 69.5, odds });
const capture = (book, quotes = [quote('Over'), quote('Under')], extra = {}) => 'NFL_MARKET_V2: ' + JSON.stringify({ book, event: nflEvent, period: 'full_game', quotes, ...extra });

function extensionContext(extra = {}) {
  const context = vm.createContext({ URL, console, Date, setTimeout, clearTimeout,
    extractDraftKingsMultiPassPayload: async () => null, extractFanDuelMultiPassPayload: async () => null,
    extractSinglePayloadFromTab: async () => null, extractBetMgmMultiPassPayload: async () => null, ...extra });
  vm.runInContext(read('ev-parlay-extension/nflBookCapture.js'), context);
  return context;
}

test('Recovered browser core and app core stay identical', () => {
  const extension = read('ev-parlay-extension/nflBookCapture.js');
  const core = extension.slice(extension.indexOf('function createNflCaptureCore()'), extension.indexOf('\n)();'));
  assert.equal(read(coreFile).split('export ')[1].trim(), core.trim());
});

for (const book of ['DraftKings', 'FanDuel', 'BetMGM', 'TheScore']) {
  test(`${book} recovered NFL stream reaches app parser with exact paired prices`, async () => {
    const { parseOddsText } = await loadModule(routerFile);
    const rows = plain(parseOddsText(capture(book), { sportsbook: book }));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(r => [r.sportsbook, r.sport, r.marketType, r.lineValue, r.oddsAmerican]), Array(2).fill([book, 'NFL', 'player_receiving_yards', 69.5, -110]));
    assert.deepEqual(rows.map(r => r.selectionNormalized), ['Drake London Over', 'Drake London Under']);
  });
}

test('NFL stream rejects wrong period/event/book, incomplete or conflicting prices and diagnostics-only exports', async () => {
  const { parseOddsText: parse } = await loadModule(routerFile);
  for (const text of [capture('DraftKings', [quote('Over')]), capture('DraftKings', [quote('Over'), quote('Under', 0)]),
    capture('DraftKings', undefined, { period: '1st_half' }), capture('DraftKings', undefined, { event: 'Atlanta Dream @ New York Liberty' }),
    capture('DraftKings', [quote('Over'), quote('Over', 100), quote('Under')]), capture('FanDuel'),
    'NFL_CAPTURE_DIAGNOSTICS: failed\nMore Bets\nOver 69.5 -110', 'NFL_MARKET_V2: {invalid']) {
    assert.equal(parse(text, { sportsbook: 'DraftKings' }).length, 0, text);
  }
  const rows = parse(capture('DraftKings') + '\n' + capture('DraftKings', [quote('Over', -120), quote('Under', 100)]), { sportsbook: 'DraftKings' });
  assert.deepEqual(plain(rows.map(r => r.oddsAmerican)), [-120, 100]);
});

test('theScore V2 main-line stream retains legacy structured props in the same export', async () => {
  const { parseOddsText: parse } = await loadModule(routerFile);
  const main = capture('TheScore', [
    {marketType:'moneyline_2way',subject:'Atlanta Falcons',side:'Away',line:null,odds:120},
    {marketType:'moneyline_2way',subject:'New Orleans Saints',side:'Home',line:null,odds:-140}]);
  const props = `THESCORE_STRUCTURED_EXPORT\nSport: NFL\nEvent: ${nflEvent}\nMarket: Receiving Yards\nDrake London | OVER | 69.5 | -110\nDrake London | UNDER | 69.5 | -110`;
  assert.equal(parse(main + '\n' + props, {sportsbook:'TheScore'}).length, 4);
});

test('NFL listing adapter preserves actual supplied DK/FD slates without clicking', () => {
  for (const [book,file] of [['DraftKings','draftkings-nfl-slate-user.txt'],['FanDuel','fanduel-nfl-slate-user.txt']]) {
    const ctx = extensionContext({location:{pathname:'/leagues/football/nfl'},document:{body:{innerText:read('tests/fixtures/'+file)}}});
    const result = ctx.captureNflListingOnly(book);
    assert.equal(result?.source, book);
    assert.ok(result.text.includes('NFL_CAPTURE_LEAGUE: NFL'));
    ctx.location.pathname = '/event/atl-no/123';
    ctx.document.body.innerText = `Sportsbook / Football Odds / NFL Odds / ${nflEvent} Odds\nGAME LINES\nSpread\nTotal\nMoneyline`;
    assert.equal(ctx.captureNflListingOnly(book), null);
  }
});

test('NFL navigation only permits same-event allowlisted tab destinations and bounds checkpoint age', () => {
  const ctx = extensionContext();
  const href = 'https://sportsbook.draftkings.com/event/atl-no/123?category=odds&subcategory=popular';
  const base = {book:'DraftKings',event:nflEvent,href,origin:new URL(href).origin,path:new URL(href).pathname};
  assert.equal(ctx.nflSafeDestination(href.replace('popular','passing'),base,'DraftKings','PASSING'), true);
  for (const bad of [href.replace('/123','/999'),href.replace('popular','first-quarter'),href.replace('draftkings.com','evil.example'),href+'&wager=1',href.replace('category=odds','category=betslip')]) assert.equal(ctx.nflSafeDestination(bad,base,'DraftKings','PASSING'), false);
  assert.equal(ctx.nflCheckpointMatches({...base, version:'wrong', incomplete:true,returnedPartial:true,updatedAt:Date.now(),targets:[]},base,[]),false);
});

const headers = ['league','event','market','period','selection','line','sportsbook','odds','odds_format','odds_type','captured_at','participant','source'];
const baseRow = {league:'NFL',event:nflEvent,market:'total',period:'full_game',selection:'Over',line:'44.5',sportsbook:'DraftKings',odds:'-110',odds_format:'american',odds_type:'listed',captured_at:'2026-10-14T01:00:00Z',participant:'',source:'Synthetic test'};
const encode = (value,delimiter) => /["\n\r]/.test(String(value)) || String(value).includes(delimiter) ? '"'+String(value).replaceAll('"','""')+'"' : value;
const table = (rows, delimiter = ',') => headers.join(delimiter)+'\n'+rows.map(r=>headers.map(h=>encode({...baseRow,...r}[h],delimiter)).join(delimiter)).join('\n');

for (const book of ['DraftKings','FanDuel','BetMGM','Caesars','Pinnacle','TheScore']) for (const league of ['MLB','NHL','NFL']) {
  test(`Synthetic normalized table: ${book} ${league} round trip through router and matching`, async () => {
    const { parseOddsText } = await loadModule(routerFile);
    const event = {MLB:'Cleveland Guardians @ Tampa Bay Rays',NHL:'Edmonton Oilers @ Florida Panthers',NFL:nflEvent}[league];
    const rows = parseOddsText(table([{sportsbook:book,league,event},{sportsbook:book,league,event,selection:'Under'}]), {sportsbook:'Odds table'});
    assert.equal(rows.length,2); assert.ok(rows.every(r=>r.sportsbook===book && r.sport===league && r.capturedAt===baseRow.captured_at));
    const {buildCanonicalMarkets} = await loadModule('app/ev-parlay-lab/utils/matchMarkets.js');
    const result = buildCanonicalMarkets(rows);
    assert.equal(result.markets.length,1); assert.equal(result.markets[0].selections.length,2);
    assert.equal(result.markets[0].id.split('||').length,5, 'Keep legacy full-game market ID shape for saved sessions');
  });
}

test('CSV/TSV keeps quoted labels, participant, source and decimal prices through normalization', async () => {
  const { inspectOddsTable } = await loadModule(tableFile);
  const { normalizeParsedRows } = await loadModule('app/ev-parlay-lab/utils/normalizeTeams.js');
  for (const delimiter of [',','\t']) {
    const result = inspectOddsTable(table([{market:'player_receiving_yards',participant:'Drake London',odds:'1.957',odds_format:'decimal',source:'Manual, "listed"\nprice'}],delimiter));
    assert.equal(result.rows[0].source,'Manual, "listed"\nprice');
    assert.equal(result.rows[0].playerName,'Drake London');
    assert.equal(normalizeParsedRows(result.rows)[0].oddsDecimal,1.957);
    assert.equal(result.rows[0].originalOdds,'1.957');
  }
});

test('Table excludes invalid prices, fair odds, unknown metadata and missing prop participants with diagnostics', async () => {
  const {inspectOddsTable} = await loadModule(tableFile);
  for (const invalid of [{odds_type:'true'},{odds:'Locked'},{odds:'15'},{odds:'1',odds_format:'decimal'},{line:''},{line:'8.5 / 9.5'},
    {captured_at:'2026-10-14 01:00'},{market:'unknown'},{period:''},{sportsbook:'Unknown'},{league:'NCAAF'},
    {market:'player_receiving_yards',participant:''},{selection:'Team total'}, {event:'Unknown'}]) {
    const result = inspectOddsTable(table([invalid]));
    assert.equal(result.rows.length,0,JSON.stringify(invalid)); assert.equal(result.diagnostics.skipped,1); assert.ok(result.diagnostics.errors.length);
  }
  assert.ok(inspectOddsTable('bad,header\n1,2').diagnostics.errors[0].includes('Missing columns'));
  assert.ok(inspectOddsTable(table([])+'"bad').diagnostics.errors[0].includes('Unclosed'));
});

test('Table duplicates keep latest timestamp, and conflicting same-time prices stay excluded', async () => {
  const {inspectOddsTable} = await loadModule(tableFile);
  let result = inspectOddsTable(table([{odds:'120'}, {odds:'-105',captured_at:'2026-10-14T02:00:00Z'},{odds:'130'}]));
  assert.equal(result.rows.length,1); assert.equal(result.rows[0].oddsAmerican,-105); assert.equal(result.diagnostics.duplicates,2);
  result = inspectOddsTable(table([{}, {odds:'-120'}, {}]));
  assert.equal(result.rows.length,1); assert.equal(result.rows[0].excluded,true); assert.equal(result.diagnostics.accepted,0);
});

test('Repeated table imports replace older snapshots without reopening excluded conflicts', async () => {
  const {inspectOddsTable,mergeOddsTableImports} = await loadModule(tableFile);
  const rows = data => inspectOddsTable(table(data)).rows;
  const old = rows([{}]), newer = rows([{odds:'-120',captured_at:'2026-10-14T02:00:00Z'}]);
  let merged = mergeOddsTableImports(old,newer);
  assert.equal(merged.length,1); assert.equal(merged[0].oddsAmerican,-120);
  merged = mergeOddsTableImports(merged,old);
  assert.equal(merged[0].oddsAmerican,-120); assert.equal(merged[0].loadedAt,'2026-10-14T02:00:00Z');
  const conflicting = rows([{odds:'-130',captured_at:'2026-10-14T02:00:00Z'}]);
  merged = mergeOddsTableImports(merged,conflicting);
  assert.equal(merged[0].excluded,true);
  assert.equal(mergeOddsTableImports(merged,conflicting)[0].excluded,true);
});

test('NHL puck-line sides preserve sign and cannot merge with regulation markets', async () => {
  const {inspectOddsTable} = await loadModule(tableFile);
  const {buildCanonicalMarkets} = await loadModule('app/ev-parlay-lab/utils/matchMarkets.js');
  const {getSelectionLineValue} = await loadModule('app/ev-parlay-lab/utils/marketNormalization.js');
  const event='Edmonton Oilers @ Florida Panthers';
  const rows = inspectOddsTable(table([{league:'NHL',event,market:'spread',selection:'Edmonton Oilers',line:'1.5'},
    {league:'NHL',event,market:'spread',selection:'Florida Panthers',line:'-1.5'},
    {league:'NHL',event,market:'spread',selection:'Edmonton Oilers',line:'1.5',period:'regulation'}])).rows;
  assert.equal(rows[2].excluded,true);
  const {markets} = buildCanonicalMarkets(rows);
  assert.equal(markets.length,1); assert.equal(markets[0].selections.length,2);
  assert.deepEqual(plain(markets[0].selections.map(s=>getSelectionLineValue(markets[0],s))),[1.5,-1.5]);
  rows[2].excluded=false;
  assert.equal(buildCanonicalMarkets(rows).markets.length,2);
});

test('Caesars NHL event beats unrelated NBA sidebar and preserves observed O/U table shape', async () => {
  const {parseCaesarsText} = await loadModule('app/ev-parlay-lab/utils/parsers/parseCaesarsText.js');
  // Synthetic prices in the legacy parser's existing O/U layout; not a live Caesars capture.
  const text = 'NBA\nMLB\nNHL\nEdmonton Oilers\nAT\nFlorida Panthers\nShots on Goal O/U\nConnor McDavid\nO\n2.5\n-110\nU\n2.5\n-120';
  const rows = parseCaesarsText(text);
  assert.equal(rows.length,2); assert.ok(rows.every(r=>r.sport==='NHL' && r.marketType==='player_shots_on_goal'));
});

test('Matchup classification recognizes MLB/NHL/NFL exact pairs without city-only cross-league guessing', async () => {
  const {matchupLeague} = await loadModule('app/ev-parlay-lab/utils/parsers/matchupLeague.js');
  assert.equal(matchupLeague('Edmonton Oilers','Florida Panthers'),'NHL');
  assert.equal(matchupLeague('New York Jets','New England Patriots'),'NFL');
  assert.equal(matchupLeague('Texas Rangers','New York Mets'),'MLB');
  assert.equal(matchupLeague('Unknown','Florida Panthers'),'');
  assert.equal(matchupLeague('Texas Rangers','Texas Rangers'),'');
});

test('DraftKings NHL workflow ignores stale basketball target labels', () => {
  const source = read('ev-parlay-extension/background.js');
  const from = source.indexOf('function getDraftKingsWorkflowLabels()');
  const end = source.indexOf('    function getDraftKingsWorkflowProgressKey()',from);
  const labels = vm.runInNewContext(source.slice(from,end)+'\ngetDraftKingsWorkflowLabels()', {
    window:{location:{pathname:'/event/edmonton-florida/123'}}, document:{body:{innerText:'Sportsbook / Hockey Odds / NHL Odds'}},
    clean:s=>s, sessionStorage:{getItem:()=>JSON.stringify(['Rebounds','Threes'])},
  });
  assert.deepEqual(plain(labels),['Game Lines','Goalscorer','Shots On Goal','Points','Assists','Goalie']);
});

test('BetMGM/FanDuel explicit MLB pages capture visible text without basketball clicks; other leagues fall through', () => {
  for (const book of ['BetMGM','FanDuel']) {
    const ctx = extensionContext({location:{hostname:book.toLowerCase()+'.com',pathname:'/baseball/mlb'},
      document:{title:'MLB odds',body:{innerText:'Baseball\nMLB Odds\nvisible market text'}}});
    vm.runInContext(read('ev-parlay-extension/mlbVisibleCapture.js'),ctx);
    const result = ctx.captureVisibleMlbPage(book);
    assert.equal(result.source,book); assert.match(result.text,/visible market text/); assert.match(result.text,/Visible markets only/);
    ctx.location.pathname='/hockey/nhl';ctx.document.title='NHL odds';ctx.document.body.innerText='NBA NHL MLB\nHockey\nNHL Odds';
    assert.equal(ctx.captureVisibleMlbPage(book),null);
    ctx.location.hostname='betmgm.com.evil.example';ctx.location.pathname='/baseball/mlb';ctx.document.title='MLB';
    assert.equal(ctx.captureVisibleMlbPage(book),null);
  }
});

test('Actual injected Caesars extractor returns visible data without clicks on MLB/NHL/NFL pages', async () => {
  const source = read('ev-parlay-extension/background.js');
  const start = source.indexOf('async function extractOddsTextFromCurrentPage()');
  for (const league of ['MLB','NHL','NFL']) {
    const raw = league + '\nvisible data';
    const extract = vm.runInNewContext(source.slice(start)+'\nextractOddsTextFromCurrentPage',{
      window:{location:{hostname:'sportsbook.caesars.com',pathname:'/sport/'+league.toLowerCase()}},
      document:{body:{innerText:raw}},setTimeout:()=>{throw new Error('No capture navigation expected');},
    });
    const result=await extract();
    assert.equal(result.source,'Caesars'); assert.equal(result.text,'CAESARS_VISIBLE_CAPTURE\n'+raw);
  }
});

test('Recovered DK tab selector accepts event anchors inside expanded wrappers and waits for selected panel', async () => {
  const {JSDOM} = require('jsdom');
  // Synthetic DOM reproduces the exact role/testid/class/href contract recovered
  // from the user's October 13 repair, not a fresh live-page observation.
  const dom = new JSDOM(`<main><pre>Sportsbook / Football Odds / NFL Odds / ATL Falcons @ NO Saints Odds\nATL Falcons\nStarts In:\n01:00:00\nNO Saints\nOdds</pre>
    <div aria-expanded="true"><div class="tab-switcher-tabs" role="tablist">${['POPULAR','PASSING','RECEIVING','RUSHING'].map(label=>`<a role="tab" data-testid="tab-switcher-tab-inner" aria-controls="odds-panel" aria-selected="${label==='POPULAR'}" href="?category=odds&subcategory=${label.toLowerCase()}">${label}</a>`).join('')}</div></div>
    <div id="odds-panel"></div><button data-testid="outcome">Over 69.5 -110</button></main>`,{url:'https://sportsbook.draftkings.com/event/atl-no/123?category=odds&subcategory=popular'});
  const {window} = dom;
  Object.defineProperty(window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  window.HTMLElement.prototype.getBoundingClientRect = () => ({width:100,height:30});
  window.HTMLElement.prototype.scrollIntoView = () => {};
  let betClicks=0,tabClicks=0;
  window.document.querySelector('button').onclick = () => betClicks++;
  const anchors=[...window.document.querySelectorAll('a')];
  for(const a of anchors) a.onclick = event => {event.preventDefault();tabClicks++;for(const t of anchors)t.setAttribute('aria-selected',String(t===a));window.history.replaceState({},'',a.href);};
  const ctx = extensionContext({window,document:window.document,location:window.location,
    getComputedStyle:el=>({display:el.style.display||'block',visibility:'visible',opacity:'1'})});
  const probe=await ctx.nflDetailPageStep('DraftKings',{mode:'probe'});
  assert.equal(probe.pregame,true); assert.deepEqual(plain(probe.tabs),['POPULAR','PASSING','RECEIVING','RUSHING']);
  assert.equal(probe.diagnostics.tabDiscovery.strategy,'observed-event-tablist');
  const planned=await ctx.nflDetailPageStep('DraftKings',{mode:'plan-tab',tab:'PASSING'});
  assert.equal(planned.navigation.found,true); assert.equal(planned.ready,false);
  await ctx.nflDetailPageStep('DraftKings',{mode:'activate-tab',tab:'PASSING'});
  await new Promise(resolve=>setTimeout(resolve,150));
  const after=await ctx.nflDetailPageStep('DraftKings',{mode:'tab-state',tab:'PASSING'});
  assert.equal(tabClicks,1); assert.equal(after.ready,true); assert.equal(betClicks,0);
  // A URL change without an active DOM tab must never count as readiness.
  anchors.find(a=>a.textContent==='PASSING').setAttribute('aria-selected','false');
  const pending=await ctx.nflDetailPageStep('DraftKings',{mode:'tab-state',tab:'PASSING'});
  assert.equal(pending.ready,false);
  anchors.find(a=>a.textContent==='PASSING').href='https://other.example/?category=odds&subcategory=passing';
  const unsafe=await ctx.nflDetailPageStep('DraftKings',{mode:'plan-tab',tab:'PASSING'});
  assert.equal(unsafe.navigation.found,false); assert.equal(betClicks,0);
  dom.window.close();
});
