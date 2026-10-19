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

function targetingContext(extra={}) {
  const ctx=extensionContext(extra);
  vm.runInContext(read('ev-parlay-extension/captureDemand.js'),ctx);
  return ctx;
}
for(const book of ['DraftKings','FanDuel','BetMGM','Caesars','Pinnacle','TheScore'])for(const sport of ['MLB','NHL','NFL']) {
  test(`${book} ${sport} shared demand distinguishes initial, missing, complete and explicit refresh`,()=>{
    const ctx=targetingContext(),scope={book,sport,event:'Away @ Home'};
    const snapshot={books:[{bookmaker:book,sports:[{sport,events:[{eventName:scope.event,missingExpectedMarkets:[{marketType:'spread'}],missingSharpMarkets:[{marketType:'total'}]}]}]}]};
    assert.equal(ctx.resolveCaptureDemand(null,scope).mode,'initial');
    assert.deepEqual(plain(ctx.resolveCaptureDemand(snapshot,scope).targets),['spread','total']);
    assert.equal(ctx.resolveCaptureDemand(snapshot,{...scope,event:'Different @ Event'}).mode,'initial');
    const event=snapshot.books[0].sports[0].events[0];event.missingExpectedMarkets=[];event.missingSharpMarkets=[];
    assert.equal(ctx.resolveCaptureDemand(snapshot,scope).mode,'complete');
    assert.equal(ctx.resolveCaptureDemand(snapshot,scope,{refresh:true}).mode,'refresh');
    event.coverageMarkedComplete=true;event.missingSharpMarkets=[{marketType:'total'}];
    assert.equal(ctx.resolveCaptureDemand(snapshot,scope).mode,'complete');
  });
}

test('FanDuel second run resumes only incomplete tabs/drawers despite changed app target demand',async()=>{
  let saved=null,run=1,active='Popular',snapshot=null;
  const calls=[];const href='https://sportsbook.fanduel.com/football/atl-no/123?tab=popular';
  const base={book:'FanDuel',recognized:true,pregame:true,event:nflEvent,origin:new URL(href).origin,path:new URL(href).pathname,href};
  const tabs=['Popular','Passing Props','Receiving Props','Rushing Props','TD Scorer Props'];
  const ctx=targetingContext({sleepBackground:async()=>{},safeShowToast:async()=>{},readCoverageSnapshotFromAppTab:async()=>snapshot,
    chrome:{tabs:{get:async()=>({url:href}),update:async(id,{url})=>{active=tabs.find(t=>url.includes(t.toLowerCase().replaceAll(' ','-')))||'Popular';}},scripting:{executeScript:async({func,args})=>{
      if(func.name==='nflNavCheckpoint'){if(args[0]==='write')saved=plain(args[2]);return [{result:args[0]==='read'?saved:true}];}
      const r=args[1];
      if(r.mode==='probe')return [{result:{...base,tabs}}];
      if(['plan-tab','tab-state'].includes(r.mode))return [{result:{...base,ready:active===r.tab,navigation:{found:true,active:active===r.tab,href:href.replace('popular',r.tab.toLowerCase().replaceAll(' ','-'))}}}];
      calls.push({run,tab:r.tab,processed:plain(r.processedLabels),targets:plain(r.targetTypes)});
      if(run===1&&r.tab==='Receiving Props'&&r.processedLabels.length)return [{result:{...base,stopped:'Context changed while loading markets',records:[]}}];
      const title=r.tab==='Receiving Props'?(run===1?'priced first drawer':'missing second drawer'):r.tab;
      return [{result:{...base,records:[{book:'FanDuel',event:nflEvent,period:'full_game',title,quotes:[quote('Over'),quote('Under')]}],processedLabels:[title],remaining:run===1&&r.tab==='Receiving Props',diagnostics:{}}}];
    }}}});
  await ctx.tryNflNavigationCapture(1,'FanDuel');
  assert.equal(saved.incomplete,true);assert.deepEqual(saved.completed,['Popular','Passing Props']);
  run=2;snapshot={books:[{bookmaker:'FanDuel',sports:[{sport:'NFL',events:[{eventName:nflEvent,missingExpectedMarkets:[{marketType:'player_rushing_yards'}],missingSharpMarkets:[]}]}]}]};
  const result=await ctx.tryNflNavigationCapture(1,'FanDuel');
  assert.deepEqual(calls.filter(c=>c.run===2).map(c=>c.tab),['Rushing Props','Receiving Props','TD Scorer Props']);
  assert.deepEqual(calls.find(c=>c.run===2&&c.tab==='Receiving Props').processed,['priced first drawer']);
  assert.match(result.text,/"complete":true/);
  run=3;snapshot.books[0].sports[0].events[0].missingExpectedMarkets=[];
  await ctx.tryNflNavigationCapture(1,'FanDuel');assert.equal(calls.filter(c=>c.run===3).length,0);
  run=4;vm.runInContext("captureDemandRuns.set(1,{mode:'refresh'})",ctx);
  await ctx.tryNflNavigationCapture(1,'FanDuel');assert.deepEqual(calls.filter(c=>c.run===4).map(c=>c.tab),tabs);
});

test('Target probe preserves basketball workflows and refuses an ambiguous event on retry',async()=>{
  const ctx=targetingContext({location:{pathname:'/basketball/nba/game',origin:'https://sports.example'},document:{title:'NBA',querySelector:()=>null,body:{innerText:''}}});
  assert.equal(ctx.captureDemandProbe('DraftKings',null).outOfScope,true);
  ctx.location.pathname='/event/game';ctx.document.title='NFL';ctx.document.body.innerText='A @ B\nC @ D';
  ctx.sessionStorage={getItem:()=>null,setItem(){}};
  const snapshot={books:[{bookmaker:'DraftKings',sports:[{sport:'NFL',events:[{eventName:'A @ B'},{eventName:'C @ D'}]}]}]};
  assert.equal(ctx.captureDemandProbe('DraftKings',snapshot).ambiguous,true);
});

test('Targeted native import filters event and markets; merge updates prices without losing unvisited rows',async()=>{
  const {parseOddsText:parse}=await loadModule(routerFile);
  const {mergeCaptureImports:merge}=await loadModule('app/ev-parlay-lab/utils/mergeCaptureImports.js');
  const raw=read('tests/fixtures/pinnacle-nfl-event-live-20261018.txt');
  const packet={book:'Pinnacle',sport:'NFL',event:'Dallas Cowboys @ Green Bay Packers',targets:['player_receiving_yards'],text:raw};
  const rows=plain(parse('CAPTURE_DEMAND_V1: '+JSON.stringify(packet),{sportsbook:'Pinnacle'}));
  assert.equal(rows.length,28);assert.ok(rows.every(r=>r.marketType==='player_receiving_yards'));
  assert.equal(parse('CAPTURE_DEMAND_V1: '+JSON.stringify({...packet,event:'Other @ Event'}),{sportsbook:'Pinnacle'}).length,0);
  const prior=plain(parse(raw,{sportsbook:'Pinnacle'}));
  const update={...rows[0],oddsAmerican:120,oddsDecimal:2.2};
  const result=plain(merge(prior,[update,update]));
  assert.equal(result.length,136);assert.equal(result.find(r=>r.selectionNormalized===update.selectionNormalized&&r.marketType===update.marketType).oddsDecimal,2.2);
  assert.equal(result.filter(r=>r.marketType==='moneyline_2way').length,2);
  assert.equal(merge(result,[update]).length,136);
});

test('Observed BetMGM ds toggle opens its aria-controls price panel once, not nested wrappers or outcomes',async()=>{
  const {JSDOM}=require('jsdom');
  // dsaccordiontoggle / slot title / aria-controls are from the live capture;
  // the price panel is synthetic because the supplied capture omitted its DOM.
  const dom=new JSDOM(`<main><pre>USA | NFL\nToday\nDallas Cowboys\nGreen Bay Packers\n</pre><nav>${['Players','Spreads','Totals','All'].map(x=>`<button role="tab" class="ds-pill" aria-selected="${x==='Players'}">${x}</button>`).join('')}</nav><div class="ds-accordion-header-wrapper"><ds-accordion-header class="ds-accordion-header"><button dsaccordiontoggle aria-expanded="false" aria-controls="ds-accordion-content-1"><div class="ds-accordion-header-start"><span slot="title">Passing yards</span></div></button></ds-accordion-header></div><div id="ds-accordion-content-1" hidden>Dak Prescott\nOver 274.5\n-110\nUnder 274.5\n-110<button data-type="outcome">Place selection</button></div></main>`,{url:'https://sports.betmgm.com/en/sports/events/dallas-greenbay-123'});
  const w=dom.window;let toggles=0,outcomes=0;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  w.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30});w.HTMLElement.prototype.scrollIntoView=()=>{};
  const button=w.document.querySelector('[dsaccordiontoggle]');
  button.onclick=()=>{toggles++;button.setAttribute('aria-expanded','true');w.document.getElementById('ds-accordion-content-1').hidden=false;};
  w.document.querySelector('[data-type]').onclick=()=>outcomes++;
  const ctx=targetingContext({window:w,document:w.document,location:w.location,Node:w.Node,setTimeout:fn=>{queueMicrotask(fn);return 1;},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});
  const probe=await ctx.nflDetailPageStep('BetMGM',{mode:'probe'});
  assert.deepEqual(plain(probe.tabs),['Players','Spreads','Totals','All']);
  const result=await ctx.nflDetailPageStep('BetMGM',{captureOnly:true,targetTypes:['player_passing_yards']});
  assert.equal(toggles,1);assert.equal(outcomes,0);assert.equal(result.records.length,1);assert.equal(result.records[0].quotes.length,2);
  assert.deepEqual(plain(ctx.nflTabsForTypes('BetMGM',['player_passing_yards'])),['Players']);
  assert.deepEqual(plain(ctx.nflTabsForTypes('BetMGM',['spread','total'])),['Spreads','Totals']);
  dom.window.close();
});

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

test('NFL navigation only permits same-event allowlisted tab destinations and validates checkpoints', () => {
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

const caesarsNhl = 'NHL\nEdmonton Oilers\nAT\nFlorida Panthers\n';
test('Caesars refuses partial-period captures instead of assigning full_game', async () => {
  const {parseCaesarsText: parse} = await loadModule('app/ev-parlay-lab/utils/parsers/parseCaesarsText.js');
  for (const label of ['1st Period','First Half','2nd Inning','Q1','Period: first_period']) {
    assert.throws(() => parse(caesarsNhl + label + '\nShots\nConnor McDavid\n2+\n-110'), /period labels/);
  }
});
for (const book of ['Caesars','FanDuel']) {
  test(`${book} ladder thresholds cannot borrow a later or second price`, async () => {
    // Exercise the actual helper with controlled row construction, independent of event detection.
    const source = read(`app/ev-parlay-lab/utils/parsers/parse${book}Text.js`).replace(/^import .*;$/gm, '').replace(/export /g, '');
    const context = vm.createContext({americanToDecimal: n => n > 0 ? 1+n/100 : 1-100/n, console});
    vm.runInContext(source, context);
    for (const tokens of [['2+','Locked','-120'],['2+','-110','+200'],['0+','-110']]) {
      context.input = [book === 'FanDuel' ? 'Player Points' : 'Points','Connor McDavid',...tokens];
      const rows = vm.runInContext("parsePlusLadders(input, 0, 'Edmonton Oilers @ Florida Panthers', 'NHL')", context);
      assert.equal(rows.length, tokens.includes('Locked') || tokens.includes('0+') ? 0 : 1);
      if (rows.length) assert.equal(rows[0].oddsAmerican,-110);
    }
  });
}
test('Caesars section boundary prevents Hits prices from becoming Total Bases', async () => {
  const {parseCaesarsText: parse} = await loadModule('app/ev-parlay-lab/utils/parsers/parseCaesarsText.js');
  const rows = parse('MLB\nSan Francisco Giants\nAT\nNew York Mets\nTotal Bases\nJuan Soto\n2+\n-110\nHits\nPete Alonso\n2+\n+180');
  assert.deepEqual(plain(rows.map(r=>[r.marketType,r.selectionNormalized,r.oddsAmerican])), [['player_hits','Pete Alonso Over',180],['player_total_bases','Juan Soto Over',-110]]);
});
test('theScore ambiguous historical MLB rejection reaches the app router', async () => {
  const {parseOddsText: parse} = await loadModule(routerFile);
  assert.throws(()=>parse(read('tests/fixtures/thescore-mlb-legacy.txt'),{sportsbook:'TheScore'}), /ambiguous price-column labels/);
});
test('theScore structured period labels exclude partial-game props', async () => {
  const {parseTheScoreText: parse} = await loadModule('app/ev-parlay-lab/utils/parsers/parseTheScoreText.js');
  const prefix = 'THESCORE_STRUCTURED_EXPORT\nSport: NHL\nEvent: Edmonton Oilers @ Florida Panthers\n';
  const props = 'Market: Shots on Goal\nConnor McDavid | OVER | 2.5 | -110\nConnor McDavid | UNDER | 2.5 | -120';
  assert.equal(parse(prefix + props).length,2);
  assert.equal(parse(prefix + 'Period: 1st_period\n' + props).length,0);
  assert.equal(parse(prefix + 'Period: 1st_period\n' + props + '\nPeriod: full_game\n' + props).length,2);
});


test('October 18 DK NFL failed capture proves discovery failure, not incorrect six main prices', async () => {
  const capture=read('tests/fixtures/draftkings-nfl-navigation-failed-20261018.txt');
  const diagnostics=capture.split(/\r?\n/).filter(l=>l.startsWith('NFL_CAPTURE_DIAGNOSTICS: ')).map(l=>JSON.parse(l.slice('NFL_CAPTURE_DIAGNOSTICS: '.length)));
  assert.equal(diagnostics[0].tabDiscovery.matchedAnchors,19);
  assert.equal(diagnostics[0].tabDiscovery.rejected['hidden-disabled-or-excluded'],19);
  assert.equal(diagnostics.at(-1).complete,false);
  const {parseOddsText}=await loadModule(routerFile);
  assert.equal(parseOddsText(capture,{sportsbook:'DraftKings'}).length,6);
});

test('DK NFL uses rendered exact labels like basketball, tolerates boxless anchors and diagnoses real hidden controls', async () => {
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(`<main><pre>Sportsbook / Football Odds / NFL Odds / ATL Falcons @ NO Saints Odds\nATL Falcons\nStarts In:\n01:00:00\nNO Saints\nOdds</pre><div role="tablist" class="tab-switcher-tabs">${['POPULAR','PASSING','RECEIVING','RUSHING'].map(l=>`<a role="tab" data-testid="tab-switcher-tab-inner" aria-controls="panel" aria-selected="${l==='POPULAR'}" href="?category=odds&subcategory=${l.toLowerCase()}"><span>${l}</span></a>`).join('')}</div><div id="panel"></div></main>`,{url:'https://sportsbook.draftkings.com/event/atl-no/123?category=odds&subcategory=popular'});
  const w=dom.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.tagName==='A'?0:100,height:this.tagName==='A'?0:30};};
  w.HTMLElement.prototype.checkVisibility=()=>false;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  let clicks=0;
  const anchors=[...w.document.querySelectorAll('a')];
  for(const a of anchors)a.onclick=e=>{e.preventDefault();clicks++;anchors.forEach(t=>t.setAttribute('aria-selected',String(t===a)));w.history.replaceState({},'',a.href);};
  const ctx=extensionContext({window:w,document:w.document,location:w.location,getComputedStyle:el=>({display:el.style.display||(el.tagName==='A'?'contents':'block'),visibility:el.style.visibility||'visible',opacity:el.style.opacity})});
  const probe=await ctx.nflDetailPageStep('DraftKings',{mode:'probe'});
  assert.deepEqual(plain(probe.tabs),['POPULAR','PASSING','RECEIVING','RUSHING']);
  const plan=await ctx.nflDetailPageStep('DraftKings',{mode:'activate-tab',tab:'PASSING'});
  assert.equal(plan.navigationScheduled,true);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(clicks,1);
  assert.equal((await ctx.nflDetailPageStep('DraftKings',{mode:'tab-state',tab:'PASSING'})).ready,true);
  // Reject actual hidden ancestors and report the specific cause; empty opacity is not zero.
  w.document.querySelector('[role="tablist"]').style.display='none';
  const hidden=await ctx.nflDetailPageStep('DraftKings',{mode:'probe'});
  assert.equal(hidden.tabs.length,0);
  assert.equal(hidden.diagnostics.tabDiscovery.rejected['css-hidden-ancestor'],4);
  assert.ok(hidden.diagnostics.tabDiscovery.rejectionSamples.every(x=>x.display==='none'));
  dom.window.close();
});


test('DK NFL coordinator activates the exact control instead of reloading its anchor URL', async () => {
  const href='https://sportsbook.draftkings.com/event/atl-no/123?category=odds&subcategory=popular';
  const base={recognized:true,pregame:true,event:nflEvent,origin:new URL(href).origin,path:new URL(href).pathname,href,tabs:['POPULAR','GAME LINES','TD SCORERS','PASSING','RECEIVING','RUSHING']};
  const activations=[];let updates=0;let active='POPULAR';
  const ctx=extensionContext({sleepBackground:async()=>{},safeShowToast:async()=>{},readCoverageSnapshotFromAppTab:async()=>null,
    chrome:{tabs:{get:async()=>({url:href,title:'NFL'}),update:async()=>{updates++;}},scripting:{executeScript:async({func,args})=>{
      if(func.name==='nflNavCheckpoint')return [{result:args[0]==='read'?null:true}];
      const request=args[1];
      if(request.mode==='probe')return [{result:base}];
      if(request.mode==='activate-tab'){active=request.tab;activations.push(active);return [{result:{...base,navigationScheduled:true}}];}
      if(['plan-tab','tab-state'].includes(request.mode))return [{result:{...base,activeTab:active,ready:active===request.tab,navigation:{found:true,active:active===request.tab,href:href.replace('popular',request.tab.toLowerCase().replaceAll(' ','-'))}}}];
      return [{result:{...base,records:[{book:'DraftKings',event:nflEvent,period:'full_game',title:request.tab,quotes:[quote('Over'),quote('Under')]}],remaining:0,diagnostics:{}}}];
    }}}});
  const result=await ctx.tryNflNavigationCapture(1,'DraftKings');
  assert.equal(updates,0);
  assert.deepEqual(plain(activations),['GAME LINES','TD SCORERS','PASSING','RECEIVING','RUSHING']);
  assert.match(result.text,/"complete":true/);
  assert.match(result.text,/DRAFTKINGS_NFL_HEADER_NAV_VERSION: 20261018_2/);
});

test('Live Pinnacle NFL event imports 130 decimal-priced props and six full-game lines', async () => {
  const {parseOddsText:parse}=await loadModule(routerFile);
  const raw=read('tests/fixtures/pinnacle-nfl-event-live-20261018.txt');
  for(const text of [raw,raw.replace(/\r?\n/g,'\r\n')]) {
    const rows=plain(parse(text,{sportsbook:'Pinnacle'}));
    assert.equal(rows.length,136);
    assert.equal(rows.filter(r=>r.marketType.startsWith('player_')).length,130);
    assert.ok(rows.every(r=>r.eventLabelRaw==='Dallas Cowboys @ Green Bay Packers'&&r.period==='full_game'&&r.isSharpSource));
    const bo=rows.filter(r=>r.playerName==='Bo Melton'&&r.marketType==='player_receiving_yards');
    assert.deepEqual(bo.map(r=>[r.lineValue,r.oddsDecimal]),[[8.5,1.9],[8.5,1.917]]);
    assert.deepEqual(rows.filter(r=>r.marketType==='total').map(r=>r.lineValue),[53.5,53.5]);
    assert.equal(rows.filter(r=>/field|team|quarter|half/.test(r.marketType)).length,0);
  }
});

test('Pinnacle decimal NFL props reject incomplete, wrong-unit, period, footer and next-event prices', async () => {
  const {parseNflPlayerProps:parse}=await loadModule('app/ev-parlay-lab/utils/parsers/nflPlayerProps.js');
  const header='NFL\nDallas Cowboys @ Green Bay Packers\n';
  const block='Dak Prescott Total Passing Yards\nOver 274.5 Passing Yards\n1.909\nUnder 274.5 Passing Yards\n1.925';
  assert.equal(parse(header+block,'Pinnacle').length,2);
  for(const bad of [block.replace('1.909','Locked'),block.replace('1.909','1.000'),block.replace('1.909','25'),block.replace('Under 274.5','Under 275.5'),block.replace('Under 274.5 Passing Yards','Under 274.5 Rushing Yards'),block.replace('Total Passing Yards','Total Passing Yards 1st Half'),block.replace('1.909\n',''), 'BET SLIP\n'+block,'Unknown Team @ Green Bay Packers\n'+block])
    assert.equal(parse(header+bad,'Pinnacle').length,0,bad);
  assert.equal(parse(header+block.replace('1.909','-110').replace('1.925','+105'),'Pinnacle').length,2);
});

test('Live FanDuel partial capture retains the 68 rows shown in the result screenshot', async () => {
  const raw=read('tests/fixtures/fanduel-nfl-event-live-20261018.txt');
  const {parseOddsText:parse}=await loadModule(routerFile);
  const rows=plain(parse(raw,{sportsbook:'FanDuel'}));
  const counts=rows.reduce((o,r)=>(o[r.marketType]=(o[r.marketType]||0)+1,o),{});
  assert.deepEqual(counts,{spread:2,moneyline_2way:2,total:2,player_passing_yards:4,player_passing_touchdowns:4,player_receptions:30,player_receiving_yards:24});
  assert.match(raw,/"complete":false/);
  assert.match(raw,/"remainingTabs":\["Receiving Props","Rushing Props","TD Scorer Props"\]/);
});

test('Live theScore capture matches 449 rows / 15 markets and later prices replace earlier snapshots', async () => {
  const {parseOddsText:parse}=await loadModule(routerFile);
  const rows=plain(parse(read('tests/fixtures/thescore-nfl-event-live-20261018.txt'),{sportsbook:'TheScore'}));
  assert.equal(rows.length,449);assert.equal(new Set(rows.map(r=>r.marketType)).size,15);
  assert.ok(rows.every(r=>r.period==='full_game'&&r.eventLabelRaw==='Dallas Cowboys @ Green Bay Packers'));
  assert.equal(new Set(rows.map(r=>[r.marketType,r.selectionNormalized,r.lineValue].join('|'))).size,449);
  const jav=rows.find(r=>r.playerName==='Jav. Williams'&&r.marketType==='player_rushing_yards'&&r.lineValue===29.5);
  assert.equal(jav.oddsAmerican,-1600);
  assert.equal(rows.filter(r=>r.marketType==='player_touchdowns').length,59);
});

test('Latest theScore positive retest retains 448 unique rows and all 15 captured markets',async()=>{
  const {parseOddsText:parse}=await loadModule(routerFile);
  const rows=plain(parse(read('tests/fixtures/thescore-nfl-retest-20261018.txt'),{sportsbook:'TheScore'}));
  assert.equal(rows.length,448);assert.equal(new Set(rows.map(r=>r.marketType)).size,15);
  assert.equal(new Set(rows.map(r=>[r.marketType,r.selectionNormalized,r.lineValue].join('|'))).size,448);
});

test('Live BetMGM diagnostics-only failure must not invent rows', async () => {
  const {parseOddsText:parse}=await loadModule(routerFile);
  const raw=read('tests/fixtures/betmgm-nfl-event-live-20261018.txt');
  assert.equal(parse(raw,{sportsbook:'BetMGM'}).length,0);
  assert.match(raw,/"unpricedDrawers":\["Game lines","Anytime TD scorer","Passing TDs"\]/);
});


test('FanDuel and BetMGM context stops report the failing header instead of the initial header', async () => {
  const {JSDOM}=require('jsdom');
  for(const book of ['FanDuel','BetMGM']) {
    const dom=new JSDOM('<main><a href="?tab=passing-props" aria-selected="true">Passing Props</a><details><summary>Dak Prescott - Passing Yds</summary></details></main>',{url:'https://sports.example/event/1?tab=passing-props'});
    const {window}=dom;
    if(book==='BetMGM')window.document.querySelector('details').outerHTML='<button dsaccordiontoggle aria-expanded="false" aria-controls="panel"><span slot="title">Passing yards</span></button><div id="panel"></div>';
    const hero=book==='FanDuel'?'Football / NFL Odds / Dallas Cowboys @ Green Bay Packers\nPopular\nSun, Oct 18\nSame Game Parlay™':'USA | NFL\nToday\nDallas Cowboys\nGreen Bay Packers';
    let raw=hero;
    Object.defineProperty(window.HTMLElement.prototype,'innerText',{get(){return /^(MAIN|BODY)$/.test(this.tagName)?raw:this.textContent;}});
    window.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30});
    window.HTMLElement.prototype.scrollIntoView=()=>{};
    window.document.querySelector('summary,button[dsaccordiontoggle]').onclick=()=>{raw='Header temporarily unavailable';};
    const ctx=extensionContext({document:window.document,location:window.location,Node:window.Node,
      setTimeout:fn=>{fn();return 1;},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});
    const result=await ctx.nflDetailPageStep(book,{captureOnly:true,tab:book==='FanDuel'?'Passing Props':''});
    assert.match(result.stopped,/Context changed/);
    assert.equal(result.diagnostics.contextFailure.reason,'Selected-game header unavailable');
    assert.equal(result.records.length,0);
    dom.window.close();
  }
});

test('DK SECTION layout modifiers do not exclude event tabs, while betslips and outcomes remain excluded', async () => {
  const {JSDOM}=require('jsdom');
  // Capture proves SECTION exclusion, not its exact attributes. These are
  // synthetic component/layout names exercising the overbroad substring rule.
  const labels=['POPULAR','TD SCORERS','PASSING','RECEIVING','RUSHING','GAME LINES'];
  const dom=new JSDOM(`<main><pre>Sportsbook / Football Odds / NFL Odds / ATL Falcons @ NO Saints Odds\nATL Falcons\nStarts In:\n01:00:00\nNO Saints\nOdds</pre><section class="sportsbook-layout--with-betslip" data-testid="event-social-layout"><div role="tablist" class="tab-switcher-tabs">${labels.map(l=>`<a role="tab" data-testid="tab-switcher-tab-inner" aria-controls="panel" aria-selected="${l==='POPULAR'}" href="?category=odds&subcategory=${l.toLowerCase().replaceAll(' ','-')}">${l}</a>`).join('')}</div><div id="panel"></div></section></main>`,{url:'https://sportsbook.draftkings.com/event/atl-no/123?category=odds&subcategory=popular'});
  const w=dom.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  w.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30});
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  const section=w.document.querySelector('section');
  const anchors=[...section.querySelectorAll('a')];let clicks=0;
  for(const a of anchors)a.onclick=e=>{e.preventDefault();clicks++;anchors.forEach(t=>t.setAttribute('aria-selected',String(t===a)));w.history.replaceState({},'',a.href);};
  const ctx=extensionContext({window:w,document:w.document,location:w.location,getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});
  assert.deepEqual(plain((await ctx.nflDetailPageStep('DraftKings',{mode:'probe'})).tabs),labels);
  await ctx.nflDetailPageStep('DraftKings',{mode:'activate-tab',tab:'PASSING'});
  await new Promise(r=>setTimeout(r,150));assert.equal(clicks,1);
  assert.equal((await ctx.nflDetailPageStep('DraftKings',{mode:'tab-state',tab:'PASSING'})).ready,true);
  for(const className of ['betslip','layout betslip-container','bet-slip__content','sportsbook-betslip__body','social-feed']) {
    section.className=className;
    const result=await ctx.nflDetailPageStep('DraftKings',{mode:'probe'});
    assert.equal(result.tabs.length,0,className);
    assert.equal(result.diagnostics.tabDiscovery.rejected['excluded-region'],6);
    assert.equal(result.diagnostics.tabDiscovery.rejectionSamples[0].className,className);
  }
  section.className='sportsbook-layout--with-betslip';section.dataset.testid='betslip-container';
  assert.equal((await ctx.nflDetailPageStep('DraftKings',{mode:'probe'})).tabs.length,0);
  section.dataset.testid='event-social-layout';
  anchors.forEach(a=>a.className='outcome-selection');
  assert.equal((await ctx.nflDetailPageStep('DraftKings',{mode:'probe'})).tabs.length,0);
  assert.equal(clicks,1);dom.window.close();
});

test('DK latest failed capture proves SECTION exclusion and old resume checkpoints are invalidated', () => {
  const raw=read('tests/fixtures/draftkings-nfl-excluded-section-20261018.txt');
  const diagnostics=raw.split(/\r?\n/).filter(l=>l.startsWith('NFL_CAPTURE_DIAGNOSTICS:')).map(l=>JSON.parse(l.slice(25)));
  assert.equal(diagnostics[0].tabDiscovery.rejected['excluded-region'],19);
  assert.ok(diagnostics[0].tabDiscovery.rejectionSamples.every(s=>s.ancestor==='SECTION'));
  const ctx=extensionContext(),base={book:'DraftKings',event:nflEvent,origin:'https://sportsbook.draftkings.com',path:'/event/123'};
  const checkpoint={...base,incomplete:true,returnedPartial:true,updatedAt:Date.now(),targets:[],completed:['POPULAR'],processedByTab:{PASSING:['old drawer']}};
  assert.equal(ctx.nflCheckpointMatches({...checkpoint,version:'20261012_4'},base,[]),false);
  assert.equal(ctx.nflCheckpointMatches({...checkpoint,version:'20261018_2'},base,[]),true);
  assert.equal(JSON.parse(read('ev-parlay-extension/manifest.json')).version,'1.4.5');
});

test('October 19 DK capture reached all six tabs but contains only six recoverable main lines',async()=>{
  const raw=read('tests/fixtures/draftkings-nfl-heading-only-20261019.txt');
  const objects=prefix=>raw.split(/\r?\n/).filter(l=>l.startsWith(prefix)).map(l=>JSON.parse(l.slice(prefix.length)));
  const diagnostics=objects('NFL_CAPTURE_DIAGNOSTICS: '),records=objects('NFL_MARKET_V2: ');
  assert.deepEqual(diagnostics.filter(d=>d.phase==='navigation-confirmed').map(d=>d.tab),['POPULAR','GAME LINES','TD SCORERS','PASSING','RECEIVING','RUSHING']);
  assert.equal(diagnostics.at(-1).complete,false);
  const empty=records.filter(r=>!r.quotes.length);
  assert.equal(empty.length,32);
  assert.ok(empty.every(r=>r.rawSample.trim()===r.title));
  const {parseOddsText}=await loadModule(routerFile);
  const rows=plain(parseOddsText(raw,{sportsbook:'DraftKings'}));
  assert.equal(rows.length,6);assert.ok(rows.every(r=>!r.marketType.startsWith('player_')));
});

function dkDrawerContext(markup) {
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM(`<main><pre>Sportsbook / Football Odds / NFL Odds / ATL Falcons @ NO Saints Odds\nATL Falcons\nStarts In:\n01:00:00\nNO Saints\nOdds</pre>${markup}</main>`,{url:'https://sportsbook.draftkings.com/event/atl-no/123?category=odds&subcategory=passing'});
  const w=dom.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  w.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30});
  w.HTMLElement.prototype.checkVisibility=function(){for(let p=this;p;p=p.parentElement)if(p.hidden||p.style.display==='none'||p.style.visibility==='hidden')return false;return true;};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  const ctx=extensionContext({window:w,document:w.document,location:w.location,Node:w.Node,setTimeout:fn=>{fn();return 0;},
    getComputedStyle:el=>({display:el.hidden?'none':'block',visibility:'visible'})});
  return {w,ctx};
}
const dkPrices='<div data-testid="outcome"><div>Dak Prescott</div><div>O 274.5</div><div>-110</div><div>U 274.5</div><div>-105</div></div>';

test('DK drawer reader reaches sibling prices beyond heading-only wrappers with one toggle and no outcome clicks',async()=>{
  const {w,ctx}=dkDrawerContext(`<section><div><div><div><button aria-expanded="false">Pass Yards O/U</button></div></div></div><div id="prices" hidden>${dkPrices}</div></section>`);
  let toggles=0,outcomes=0;
  const button=w.document.querySelector('button');
  button.onclick=()=>{toggles++;button.setAttribute('aria-expanded','true');w.document.getElementById('prices').hidden=false;};
  w.document.querySelector('[data-testid="outcome"]').onclick=()=>outcomes++;
  const result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_passing_yards']});
  assert.equal(result.records.length,1);assert.equal(result.records[0].quotes.length,2);
  assert.deepEqual(plain(result.records[0].quotes.map(q=>[q.subject,q.side,q.line,q.odds])),[['Dak Prescott','Over',274.5,-110],['Dak Prescott','Under',274.5,-105]]);
  assert.equal(toggles,1);assert.equal(outcomes,0);assert.equal(result.diagnostics.unpricedDrawers.length,0);
  const skip=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',processedLabels:['Pass Yards O/U']});
  assert.equal(skip.records.length,0);assert.equal(toggles,1);
});

function dkSuppliedDrawer() {
  const result=dkDrawerContext(read('tests/fixtures/draftkings-nfl-pass-yards-dom-20261019.html'));
  // The supplied market has no event header. This is an explicit test harness
  // identity, not recovered venue/home-away metadata or the prior DAL/GB game.
  result.w.document.querySelector('pre').textContent='Sportsbook / Football Odds / NFL Odds / SF 49ers @ WAS Commanders Odds\nSF 49ers\nStarts In:\n01:00:00\nWAS Commanders\nOdds';
  result.w.history.replaceState({},'','/event/sf-was/test-fixture?category=odds&subcategory=passing');
  return result;
}

test('DK demand uses verified canonical NFL identity despite abbreviated page, stale marker and no NFL URL/title',async()=>{
  const {w,ctx}=dkSuppliedDrawer();
  w.document.title='49ers vs Commanders - DraftKings';
  ctx.sessionStorage=w.sessionStorage;
  vm.runInContext(read('ev-parlay-extension/captureDemand.js'),ctx);
  ctx.safeExecuteScript=async({func,args})=>[{result:await func(...args)}];
  const event='San Francisco 49ers @ Washington Commanders';
  const snapshot={books:[{bookmaker:'DraftKings',sports:[{sport:'NFL',events:[
    {eventName:event,missingExpectedMarkets:[{marketType:'player_passing_yards'}]},
    {eventName:'Dallas Cowboys @ Green Bay Packers',missingExpectedMarkets:[{marketType:'player_receptions'}]}
  ]}]}]};
  const generic=ctx.captureDemandProbe('DraftKings',snapshot);
  assert.equal(generic.scope,null); // Old path creates initial marker, then blocks.
  const second=ctx.captureDemandProbe('DraftKings',snapshot);assert.equal(second.prior.initial,true);
  let plan=await ctx.prepareCaptureDemand(1,'DraftKings',snapshot);
  assert.equal(plan.mode,'missing');assert.equal(plan.event,event);
  assert.deepEqual(plain(plan.targets),['player_passing_yards']);
  // A different old page marker never supplies the chosen event identity.
  w.sessionStorage.setItem('EV_CAPTURE_DEMAND::'+generic.identity,JSON.stringify({book:'DraftKings',sport:'NFL',event:'Dallas Cowboys @ Green Bay Packers'}));
  plan=await ctx.prepareCaptureDemand(1,'DraftKings',snapshot);
  assert.equal(plan.event,event);assert.equal(plan.mode,'missing');
  snapshot.books[0].sports[0].events[0].missingExpectedMarkets=[];
  assert.equal((await ctx.prepareCaptureDemand(1,'DraftKings',snapshot)).mode,'complete');
  assert.equal((await ctx.prepareCaptureDemand(1,'DraftKings',snapshot,{refresh:true})).mode,'refresh');
});

test('Demand rejects failed/native-changing identity and genuinely ambiguous generic pages without broad retry',async()=>{
  let selected={recognized:true,event:'',pregame:false,reason:'Conflicting selected-game headers'};
  const generic={scope:null,ambiguous:true,prior:{initial:true},identity:'https://sports.example/event/1'};
  const ctx=targetingContext({safeExecuteScript:async({func})=>[{result:func.name==='captureDemandProbe'?{...generic}:selected}]});
  let plan=await ctx.prepareCaptureDemand(1,'DraftKings',null);
  assert.equal(plan.mode,'unresolved');assert.match(plan.reason,/Conflicting/);
  selected={recognized:true,event:nflEvent,pregame:true,origin:'https://sports.example',path:'/event/2'};
  assert.equal((await ctx.prepareCaptureDemand(1,'DraftKings',null)).mode,'unresolved');
  selected={recognized:false};
  assert.equal((await ctx.prepareCaptureDemand(1,'DraftKings',null)).mode,'unresolved');
  assert.equal((await ctx.prepareCaptureDemand(1,'DraftKings',null,{refresh:true})).mode,'refresh');
  const source=read('ev-parlay-extension/background.js');
  assert.match(source,/if\(demand\?\.mode==='unresolved'\|\|/);
  assert.match(source,/title:'Refresh all markets for this event',contexts:\['action'\]/);
  assert.match(source,/info\.menuItemId==='ev-refresh-all'\)runOddsCapture\(tab,\{refresh:true\}\)/);
});

test('Supplied DK CMS market extracts exact four passing quotes without animated stats or inherited event',async()=>{
  const {w,ctx}=dkSuppliedDrawer();let clicks=0;
  w.document.querySelectorAll('button,a').forEach(el=>el.addEventListener('click',()=>clicks++));
  const result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_passing_yards']});
  assert.equal(result.records.length,1);
  assert.deepEqual(plain(result.records[0].quotes.map(q=>[q.marketType,q.subject,q.side,q.line,q.odds])),[
    ['player_passing_yards','Brock Purdy','Over',249.5,-111],['player_passing_yards','Brock Purdy','Under',249.5,-113],
    ['player_passing_yards','Jayden Daniels','Over',206.5,-111],['player_passing_yards','Jayden Daniels','Under',206.5,-113]]);
  assert.equal(result.event,'San Francisco 49ers @ Washington Commanders');assert.equal(clicks,0);
  const {parseOddsText}=await loadModule(routerFile);
  const rows=plain(parseOddsText('NFL_MARKET_V2: '+JSON.stringify(result.records[0]),{sportsbook:'DraftKings'}));
  assert.equal(rows.length,4);assert.ok(rows.every(r=>r.eventLabelRaw===result.event&&r.marketType==='player_passing_yards'));
});

test('Supplied DK CMS excludes hidden, disabled, mismatched and neighboring prices without raw fallback',async()=>{
  for(const mutate of [
    w=>w.document.querySelector('[data-testid="market-template"]').hidden=true,
    w=>w.document.querySelector('[data-testid="market-template"]').style.display='none',
    w=>w.document.querySelector('[data-testid="market-template"]').setAttribute('aria-hidden','true'),
    w=>w.document.querySelector('button.cb-market__button').disabled=true,
    w=>w.document.querySelector('button.cb-market__button').setAttribute('aria-disabled','true'),
    w=>w.document.querySelector('[data-testid="button-odds-market-board"]').hidden=true,
    w=>w.document.querySelector('[data-testid="button-points-market-board"]').textContent='250.5',
    w=>w.document.querySelector('[data-testid="button-odds-market-board"]').textContent='Locked'
  ]) {
    const {w,ctx}=dkSuppliedDrawer();mutate(w);
    const neighbour=w.document.querySelector('.cms-expander-container').cloneNode(true);
    neighbour.querySelector('h2').textContent='1st Half Pass Yards O/U';
    neighbour.querySelectorAll('[data-testid="button-odds-market-board"]').forEach(el=>el.textContent='-999');
    w.document.querySelector('main').append(neighbour);
    const result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_passing_yards']});
    assert.equal(result.records.length,1);
    assert.equal(result.records[0].quotes.length,2);
    assert.ok(result.records[0].quotes.every(q=>q.subject==='Jayden Daniels'&&[-111,-113].includes(q.odds)));
  }
});

test('Supplied DK CMS opens collapsed sibling panel once and honors missing/processed market targets',async()=>{
  const {w,ctx}=dkSuppliedDrawer();let toggles=0,outcomes=0;
  const header=w.document.querySelector('[data-testid="collapsible-trigger"]');
  const panel=w.document.querySelector('.cms-expander-container').lastElementChild;
  header.setAttribute('aria-expanded','false');panel.hidden=true;
  header.onclick=()=>{toggles++;header.setAttribute('aria-expanded','true');panel.hidden=false;};
  w.document.querySelectorAll('button.cb-market__button,a').forEach(el=>el.onclick=()=>outcomes++);
  let result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_receptions']});
  assert.equal(result.records.length,0);assert.equal(toggles,0);
  result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_passing_yards']});
  assert.equal(result.records[0].quotes.length,4);assert.equal(toggles,1);assert.equal(outcomes,0);
  const processed=plain(result.processedLabels);
  result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_passing_yards'],processedLabels:processed});
  assert.equal(result.records.length,0);assert.equal(toggles,1);
  // Explicit refresh does not supply a processed-label checkpoint.
  result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture',targetTypes:['player_passing_yards']});
  assert.equal(result.records[0].quotes.length,4);assert.equal(toggles,1);assert.equal(outcomes,0);
});

test('DK missing panel cannot borrow an unsupported neighbouring market; explicit panels remain supported',async()=>{
  const {w,ctx}=dkDrawerContext(`<section><div><div><button aria-expanded="true">Pass Yards O/U</button></div></div><article><button aria-expanded="true">1st Half Pass Yards O/U</button>${dkPrices}</article></section>`);
  let result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture'});
  assert.equal(result.records[0].quotes.length,0);
  assert.equal(result.diagnostics.unpricedSamples[0].containerFound,false);
  assert.ok(result.diagnostics.unpricedSamples[0].ancestors.length>0);
  w.document.querySelector('main').insertAdjacentHTML('beforeend',`<div id="controlled">${dkPrices}</div>`);
  w.document.querySelector('button').setAttribute('aria-controls','controlled');
  result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture'});
  assert.equal(result.records[0].quotes.length,2);
});

test('DK unpriced diagnostics distinguish rendered text from filtered content without collecting page-shell HTML',async()=>{
  const {ctx}=dkDrawerContext(`<section class="sportsbook-market-accordion"><button aria-expanded="true">Pass Yards O/U</button><div aria-hidden="true">${dkPrices}</div></section><aside>PRIVATE ACCOUNT CONTENT</aside>`);
  const result=await ctx.nflDetailPageStep('DraftKings',{mode:'capture'}),sample=result.diagnostics.unpricedSamples[0];
  assert.equal(result.records[0].quotes.length,0);
  assert.equal(sample.readerVersion,'20261019_1');assert.equal(sample.containerFound,true);
  assert.match(sample.renderedSample,/Dak Prescott/);assert.doesNotMatch(sample.rawSample,/Dak Prescott/);
  assert.doesNotMatch(JSON.stringify(sample),/PRIVATE ACCOUNT/);
});
