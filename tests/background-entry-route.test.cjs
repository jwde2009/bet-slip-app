const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const exported = read('tests/fixtures/betmgm-nfl-sgp-legacy-20261019.txt').replace(/\r\n/g,'\n');
const page = exported.split('BETMGM_INITIAL_CAPTURE\n')[1].split('\nBETMGM_CURRENT_CAPTURE:')[0];

async function runEntry({text=page,playersControl=false,pills=false,pillsInsideMain=false,manualPlayers=false,transition=true,categoryTransitions=null,afterDrawerOpen=null,mutatePlayers=null,mutatePills=null,browserOverrides=null,diagnose=false,url='https://sports.betmgm.com/en/sports/events/commanders-49ers-123',snapshot={version:1,books:[]}}={}) {
  const manifest=JSON.parse(read('ev-parlay-extension/manifest.json'));
  const dom=new JSDOM('<main></main>',{url,runScripts:'outside-only'});
  const app=new JSDOM('',{url:'http://localhost:3000/ev-parlay-lab',runScripts:'outside-only'});
  const w=dom.window;w.document.title='Commanders vs 49ers';
  w.document.querySelector('main').textContent=text;
  let playerClicks=0,drawerClicks=0;const categoryClicks=[];
  if(pills) {
    const contentRoot=w.document.querySelector('main'),main=w.document.createElement('section');
    main.textContent=contentRoot.textContent;contentRoot.textContent='';contentRoot.append(main);
    (pillsInsideMain?contentRoot:w.document.body).insertAdjacentHTML('afterbegin',read('tests/fixtures/betmgm-nfl-category-pills-20261019.html')+'\n');
    if(mutatePills)mutatePills(w.document);
    const players=()=>{
      const old=read('tests/fixtures/betmgm-nfl-players-legacy-20261019.txt').replace(/\r\n/g,'\n');
      const section=old.slice(old.indexOf('Anytime TD scorer'),old.indexOf('Show Less'));
      main.textContent='NFL (14)\nTomorrow\n7:15 PM\nESPN\nCommanders\n49ers\nPlayers\nTD scorers\nPassing\nReceiving\nRushing\n';
      // Exact category HTML, supplied price text and prior observed accordion
      // shape; panel composition and transition behavior remain simulated.
      main.insertAdjacentHTML('beforeend','<button dsaccordiontoggle aria-expanded="false" aria-controls="prices"><span slot="title">Anytime TD scorer</span></button><div id="prices" hidden><pre></pre></div>');
      main.querySelector('pre').textContent=section;
      const toggle=main.querySelector('[dsaccordiontoggle]');toggle.onclick=()=>{drawerClicks++;toggle.setAttribute('aria-expanded','true');main.querySelector('#prices').hidden=false;if(afterDrawerOpen)afterDrawerOpen(main);};
      if(mutatePlayers)mutatePlayers(main);
    };
    if(manualPlayers)players();
    for(const el of w.document.querySelectorAll('button[data-menu-item-id]'))el.onclick=()=>{
      const id=el.getAttribute('data-menu-item-id');categoryClicks.push(id);
      if(id==='Players'){playerClicks++;if(transition)players();}
      if(categoryTransitions?.[id])main.textContent='NFL (14)\nTomorrow\n7:15 PM\nESPN\nCommanders\n49ers\nSGP\nPlayers\n'+categoryTransitions[id];
    };
  }
  if(playersControl) {
    // Control shape is synthetic: the export contains rendered text, not HTML.
    const [before,after]=text.split('\nPlayers\n');
    const main=w.document.querySelector('main');main.textContent=before+'\n';
    const button=w.document.createElement('button');button.textContent='Players';button.setAttribute('role','tab');button.setAttribute('aria-selected','false');
    button.onclick=()=>{playerClicks++;button.setAttribute('aria-selected','true');};main.append(button,w.document.createTextNode('\n'+after));
  }
  for(const target of [dom,app]) {
    const win=target.window;
    Object.defineProperty(win.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;}});
    win.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30});
    win.HTMLElement.prototype.scrollIntoView=()=>{};
    win.setTimeout=fn=>{queueMicrotask(fn);return 1;};win.clearTimeout=()=>{};
    win.getComputedStyle=e=>({display:e.hidden?'none':'block',visibility:'visible'});
    win.alert=()=>{};
  }
  if(browserOverrides)browserOverrides(w);
  let discoveryDiagnostic=null;
  if(diagnose){w.$0=w.$0||w.document.querySelector('[data-menu-item-id=Players]');w.console.log=()=>{};discoveryDiagnostic=JSON.parse(JSON.stringify(vm.runInContext(read('tests/diagnostics/betmgm-category-discovery.js'),dom.getInternalVMContext())));}
  app.window.localStorage.setItem('EV_LOADED_COVERAGE_SNAPSHOT',JSON.stringify(snapshot));
  const tab={id:1,url,title:w.document.title},appTab={id:2,url:app.window.location.href};
  let clicked;const injections=[],loaded=[];
  const chrome={
    action:{onClicked:{addListener:fn=>{clicked=fn;}},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
    runtime:{getManifest:()=>manifest,onInstalled:{addListener:()=>{}}},
    contextMenus:{onClicked:{addListener:()=>{}}},
    tabs:{get:async id=>id===1?tab:appTab,query:async()=>[appTab]},
    scripting:{executeScript:async({target,func,args=[]})=>{
      injections.push({name:func.name,args});
      // Chrome serializes injected functions; do not share worker closures.
      const targetDom=target.tabId===1?dom:app;
      targetDom.window.__args=JSON.parse(JSON.stringify(args));
      const result=await vm.runInContext('('+func.toString()+')(...__args)',targetDom.getInternalVMContext());
      return [{result,documentId:'document-'+target.tabId}];
    }}
  };
  const context=vm.createContext({chrome,URL,console,setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout});
  context.importScripts=(...files)=>{for(const file of files){loaded.push(file);vm.runInContext(read('ev-parlay-extension/'+file),context,{filename:file});}};
  vm.runInContext(read('ev-parlay-extension/'+manifest.background.service_worker),context,{filename:manifest.background.service_worker});
  await clicked(tab);
  const queue=JSON.parse(app.window.localStorage.getItem('EV_IMPORT_QUEUE')||'[]');
  const toast=JSON.parse(w.sessionStorage.getItem('EV_PARLAY_LAST_TOAST')||'null');
  dom.window.close();app.window.close();
  return {queue,toast,playerClicks,drawerClicks,categoryClicks,injections,loaded,discoveryDiagnostic};
}

test('manifest service worker routes exact SGP starting-page text into NFL, not legacy',async()=>{
  const r=await runEntry();
  assert.deepEqual(r.loaded,['background.js','theScoreNflCapture.js','captureDemand.js','nflBookCapture.js','mlbVisibleCapture.js','pinnacleMlbCapture.js']);
  assert.equal(r.queue.length,1);
  const text=r.queue[0].text;
  assert.match(text,/NFL_CAPTURE_VERSION/);assert.doesNotMatch(text,/BETMGM_AUTOPASS|BETMGM_MANUAL_PLAYER_PROPS_REQUIRED/);
  const diag=JSON.parse(text.split('EXTENSION_CAPTURE_DIAGNOSTICS: ')[1]);
  assert.equal(diag.extensionVersion,'1.4.12');assert.equal(diag.entryVersion,'20261019_mgmcontext1');
  assert.equal(diag.route,'nfl-v2');assert.equal(diag.event,'Washington Commanders @ San Francisco 49ers');
  assert.equal(r.injections.some(x=>x.name==='extractOddsTextFromCurrentPage'),false);
  // Text-only evidence cannot prove the actual Players control is clickable.
  assert.equal(r.playerClicks,0);assert.match(text,/Players/);
});

for(const url of ['https://sports.betmgm.com/en/sports/events/commanders-49ers-123','https://sports.betmgm.com/en/sports/football-11/events/commanders-49ers-123']) {
  test('actual action pipeline reaches existing Players navigation: '+url,async()=>{
    const r=await runEntry({url,playersControl:true});
    assert.equal(r.queue.length,1);assert.match(r.queue[0].text,/NFL_CAPTURE_VERSION/);
    assert.equal(r.playerClicks,1);
    assert.equal(r.injections.some(x=>x.name==='extractOddsTextFromCurrentPage'),false);
    assert.match(r.queue[0].text,/"route":"nfl-v2"/);
  });
}

test('actual entrypoint refuses live SGP hero before capture and retains unknown coverage safety',async()=>{
  for(const options of [{text:page.replace('Tomorrow','Live')},{snapshot:null}]) {
    const r=await runEntry(options);
    assert.equal(r.queue.length,0);assert.equal(r.playerClicks,0);
    assert.equal(r.injections.some(x=>x.name==='extractOddsTextFromCurrentPage'),false);
    assert.match(JSON.stringify(r.toast),/Capture could not be verified/);
  }
});

const tdDemand={version:1,books:[{bookmaker:'BetMGM',sports:[{sport:'NFL',events:[{eventName:'Washington Commanders @ San Francisco 49ers',rowCount:6,missingSharpMarkets:[{marketType:'player_touchdowns'}]}]}]}]};
for(const pillsInsideMain of [false,true])for(const manualPlayers of [false,true])test('exact BetMGM pill bar through actual pipeline, manualPlayers='+manualPlayers+', insideMain='+pillsInsideMain,async()=>{
  const r=await runEntry({pills:true,pillsInsideMain,manualPlayers,snapshot:tdDemand});
  assert.equal(r.playerClicks,manualPlayers?0:1);assert.equal(r.drawerClicks,1);
  assert.deepEqual(r.categoryClicks,manualPlayers?[]:['Players']);
  const records=r.queue[0].text.split(/\r?\n/).filter(l=>l.startsWith('NFL_MARKET_V2: ')).map(l=>JSON.parse(l.slice(15)));
  assert.equal(records.flatMap(r=>r.quotes).length,22);
  assert.ok(records.every(r=>r.event==='Washington Commanders @ San Francisco 49ers'));
  assert.match(r.queue[0].text,/navigation-confirmed/);
});

test('unchanged content and all ds-pill-current classes do not verify activation',async()=>{
  const r=await runEntry({pills:true,transition:false,snapshot:tdDemand});
  assert.equal(r.playerClicks,1);assert.equal(r.drawerClicks,0);
  assert.doesNotMatch(r.queue[0].text,/NFL_MARKET_V2:/);
  assert.match(r.queue[0].text,/did not become ready/);
});

for(const [name,mutatePills] of [
  ['duplicate bar',d=>d.body.insertAdjacentHTML('afterbegin',d.querySelector('ul').outerHTML)],
  ['duplicate ID',d=>d.querySelector('ul').append(d.querySelector('[data-menu-item-id="Players"]').cloneNode(true))],
  ['hidden ancestor',d=>d.querySelector('[data-menu-item-id="Players"]').parentElement.hidden=true],
  ['disabled',d=>d.querySelector('[data-menu-item-id="Players"]').setAttribute('aria-disabled','true')],
  ['outcome',d=>d.querySelector('[data-menu-item-id="Players"]').classList.add('outcome-button')],
  ['wrong label',d=>d.querySelector('[data-menu-item-id="Players"] .ds-pill-text').textContent='Quick props'],
])test('actual pill bar fails closed: '+name,async()=>{
  const r=await runEntry({pills:true,mutatePills,snapshot:tdDemand});
  assert.equal(r.playerClicks,0);assert.equal(r.drawerClicks,0);assert.deepEqual(r.categoryClicks,[]);
  assert.doesNotMatch(r.queue[0].text,/NFL_MARKET_V2:/);
});


test('observed Spread/Totals/All IDs require structural content transitions, not just current classes',async()=>{
  const snapshot=JSON.parse(JSON.stringify(tdDemand));
  snapshot.books[0].sports[0].events[0].missingSharpMarkets=['spread','total','moneyline_2way'].map(marketType=>({marketType}));
  const r=await runEntry({pills:true,snapshot,categoryTransitions:{Spread:'Spread\nCommanders\n+7.5\n-112',Totals:'Total\nO 52\n-110\nU 52\n-108','-1':'Game lines\nFull game\nSpread\nTotal\nMoney\nCommanders\n+7.5\n-112\nO 52\n-110\n+320\n49ers\n-7.5\n-105\nU 52\n-108\n-425'}});
  assert.deepEqual(r.categoryClicks,['Spread','Totals','-1']);
  const diagnostics=r.queue[0].text.split(/\r?\n/).filter(l=>l.startsWith('NFL_CAPTURE_DIAGNOSTICS: ')).map(l=>JSON.parse(l.slice(25)));
  assert.deepEqual(diagnostics.filter(d=>d.phase==='navigation-confirmed').map(d=>d.tab),['Spreads','Totals','All']);
});


// These deliberately override the old all-elements-have-boxes harness. They
// reproduce the same empty live symptom for DIFFERENT causes, not a live cause.
for(const [name,browserOverrides,mutatePills,verify] of [
  ['zero-size bar',w=>{const bar=w.document.querySelector('ul');bar.getBoundingClientRect=()=>({width:0,height:0});},null,d=>assert.equal(d.reports[0].bar.width,0)],
  ['native visibility rejects bar',w=>{w.document.querySelector('ul').checkVisibility=()=>false;},null,d=>assert.equal(d.reports[0].bar.checkVisibility,false)],
  ['excluded ancestor',null,d=>{const bar=d.querySelector('ul'),wrap=d.createElement('div');wrap.className='layout-betslip-column';bar.before(wrap);wrap.append(bar);},d=>assert.equal(d.reports[0].bar.excludedAncestor.className,'layout-betslip-column')],
  ['two rendered bars',null,d=>d.body.insertAdjacentHTML('afterbegin',d.querySelector('ul').outerHTML),d=>assert.equal(d.renderedUnexcludedBarCount,2)],
])test('read-only diagnostics distinguish actual pipeline rejection: '+name,async()=>{
  const r=await runEntry({pills:true,snapshot:tdDemand,browserOverrides,mutatePills,diagnose:true});
  assert.equal(r.playerClicks,0);assert.equal(r.drawerClicks,0);
  assert.match(r.queue[0].text,/"availableTabs":\[\]/);
  verify(r.discoveryDiagnostic);
});


test('read-only diagnostic identifies selected Players inside an open shadow root without traversing it for capture',async()=>{
  const r=await runEntry({pills:true,snapshot:tdDemand,diagnose:true,mutatePills:d=>{
    const bar=d.querySelector('ul'),host=d.createElement('div');host.id='event-shadow-host';bar.before(host);
    host.attachShadow({mode:'open'}).append(bar);d.defaultView.$0=bar.querySelector('[data-menu-item-id=Players]');
  }});
  assert.equal(r.playerClicks,0);assert.equal(r.discoveryDiagnostic.lightDomBarCount,0);
  assert.equal(r.discoveryDiagnostic.selectedRoot.id,'event-shadow-host');
});


for(const tag of ['html','body'])test('BetMGM global '+tag+' betslip status does not exclude actual event categories or drawers',async()=>{
  const r=await runEntry({pills:true,pillsInsideMain:true,snapshot:tdDemand,mutatePills:d=>d.querySelector(tag).classList.add('betslip-bar-visi')});
  assert.equal(r.playerClicks,1);assert.equal(r.drawerClicks,1);
  const records=r.queue[0].text.split(/\r?\n/).filter(l=>l.startsWith('NFL_MARKET_V2: ')).map(l=>JSON.parse(l.slice(15)));
  assert.equal(records.flatMap(r=>r.quotes).length,22);
});

for(const attr of [['class','betslip'],['class','betslip__panel'],['class','layout-betslip-column'],['data-testid','betslip-panel']])test('real BetMGM betslip descendant categories remain excluded: '+attr.join('='),async()=>{
  const r=await runEntry({pills:true,snapshot:tdDemand,mutatePills:d=>{
    d.documentElement.classList.add('betslip-bar-visi');
    const bar=d.querySelector('ul'),wrap=d.createElement('section');wrap.setAttribute(...attr);bar.before(wrap);wrap.append(bar);
  }});
  assert.equal(r.playerClicks,0);assert.equal(r.drawerClicks,0);assert.doesNotMatch(r.queue[0].text,/NFL_MARKET_V2:/);
});

test('real BetMGM betslip drawer is excluded even under global HTML status',async()=>{
  const r=await runEntry({pills:true,snapshot:tdDemand,mutatePills:d=>d.documentElement.classList.add('betslip-bar-visi'),mutatePlayers:main=>{
    const wrap=main.ownerDocument.createElement('section');wrap.className='betslip__panel';
    const toggle=main.querySelector('[dsaccordiontoggle]'),panel=main.querySelector('#prices');toggle.before(wrap);wrap.append(toggle,panel);
  }});
  assert.equal(r.playerClicks,1);assert.equal(r.drawerClicks,0);assert.doesNotMatch(r.queue[0].text,/NFL_MARKET_V2:/);
});


function queuedRecords(r) {
  return r.queue[0].text.split(/\r?\n/).filter(l=>l.startsWith('NFL_MARKET_V2: ')).map(l=>JSON.parse(l.slice(15)));
}
function loseHeader(kind) {
  return main=>{
    const hero=main.firstChild,old=hero.textContent,w=main.ownerDocument.defaultView;
    hero.textContent=old.replace('NFL (14)','Header loading');
    let waits=0;const original=w.setTimeout;
    w.setTimeout=fn=>original(()=>{
      if(++waits===2&&kind!=='permanent') {
        hero.textContent=kind==='live'?old.replace('Tomorrow','Live'):kind==='event'?old.replace('49ers','Cowboys'):kind==='no-schedule'?old.replace('Tomorrow',''):old;
        if(kind==='path')w.history.pushState({},'',w.location.pathname+'-changed');
      }
      fn();
    });
  };
}

test('BetMGM initial action retains six exact starting-page main lines before Players fails context',async()=>{
  const r=await runEntry({pills:true,afterDrawerOpen:loseHeader('permanent')});
  const first=r.injections.findIndex(x=>x.name==='nflDetailPageStep'&&x.args[1]?.mode==='visible-main');
  const navigate=r.injections.findIndex(x=>x.name==='nflDetailPageStep'&&x.args[1]?.mode==='activate-tab');
  assert.ok(first>=0&&first<navigate);
  const qs=queuedRecords(r).flatMap(r=>r.quotes);assert.equal(qs.length,6);
  assert.deepEqual(qs.map(q=>[q.marketType,q.subject,q.line,q.odds]),[
    ['spread','Washington Commanders',7.5,-112],['spread','San Francisco 49ers',-7.5,-105],
    ['moneyline_2way','Washington Commanders',null,320],['moneyline_2way','San Francisco 49ers',null,-425],
    ['total','',52,-110],['total','',52,-108]]);
  assert.match(r.queue[0].text,/headerEvidence/);assert.doesNotMatch(r.queue[0].text,/"complete":true/);
});

test('BetMGM transient header loss recovers only after fresh same-event pregame evidence returns',async()=>{
  const r=await runEntry({pills:true,snapshot:tdDemand,afterDrawerOpen:loseHeader('recover')});
  assert.equal(queuedRecords(r).flatMap(r=>r.quotes).length,22);
  assert.equal(r.playerClicks,1);assert.equal(r.drawerClicks,1);
  assert.match(r.queue[0].text,/header recovered after bounded revalidation/);
  assert.equal(r.injections.some(x=>x.args[1]?.mode==='visible-main'),false,'prop-only targeted capture must not broaden');
});
for(const kind of ['permanent','live','event','no-schedule','path'])test('BetMGM header recovery refuses '+kind,async()=>{
  const r=await runEntry({pills:true,snapshot:tdDemand,afterDrawerOpen:loseHeader(kind)});
  assert.equal(queuedRecords(r).flatMap(r=>r.quotes).length,0);
  assert.equal(r.playerClicks,1);assert.equal(r.drawerClicks,1);
  assert.match(r.queue[0].text,/Context changed/);
});

test('BetMGM starting-page capture refuses an explicitly selected half tab',async()=>{
  const r=await runEntry({pills:true,browserOverrides:w=>w.document.querySelector('main').insertAdjacentHTML('beforeend','<button role="tab" aria-selected="true">1st Half</button>')});
  assert.equal(queuedRecords(r).flatMap(r=>r.quotes).length,0);
  assert.equal(r.playerClicks,0);
});
