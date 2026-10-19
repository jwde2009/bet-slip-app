const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const exported = read('tests/fixtures/betmgm-nfl-sgp-legacy-20261019.txt');
const page = exported.split('BETMGM_INITIAL_CAPTURE\n')[1].split('\nBETMGM_CURRENT_CAPTURE:')[0];

async function runEntry({text=page,playersControl=false,url='https://sports.betmgm.com/en/sports/events/commanders-49ers-123',snapshot={version:1,books:[]}}={}) {
  const manifest=JSON.parse(read('ev-parlay-extension/manifest.json'));
  const dom=new JSDOM('<main></main>',{url,runScripts:'outside-only'});
  const app=new JSDOM('',{url:'http://localhost:3000/ev-parlay-lab',runScripts:'outside-only'});
  const w=dom.window;w.document.title='Commanders vs 49ers';
  w.document.querySelector('main').textContent=text;
  let playerClicks=0;
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
  return {queue,toast,playerClicks,injections,loaded};
}

test('manifest service worker routes exact SGP starting-page text into NFL, not legacy',async()=>{
  const r=await runEntry();
  assert.deepEqual(r.loaded,['background.js','theScoreNflCapture.js','captureDemand.js','nflBookCapture.js','mlbVisibleCapture.js','pinnacleMlbCapture.js']);
  assert.equal(r.queue.length,1);
  const text=r.queue[0].text;
  assert.match(text,/NFL_CAPTURE_VERSION/);assert.doesNotMatch(text,/BETMGM_AUTOPASS|BETMGM_MANUAL_PLAYER_PROPS_REQUIRED/);
  const diag=JSON.parse(text.split('EXTENSION_CAPTURE_DIAGNOSTICS: ')[1]);
  assert.equal(diag.extensionVersion,'1.4.9');assert.equal(diag.entryVersion,'20261019_sgp1');
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
