const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const fixture = JSON.parse(read('tests/fixtures/pinnacle-mlb-dom-20261014.json'));
const source = read('ev-parlay-extension/pinnacleMlbCapture.js');
const plain = x => JSON.parse(JSON.stringify(x));
async function parser(modulePath = "app/ev-parlay-lab/utils/parsers/parsePinnacleText.js", exportName = "parsePinnacleText") {
  const context = vm.createContext({console: {log(){},warn(){}}});
  const modules = new Map();
  function load(file) {
    if (!modules.has(file)) modules.set(file,new vm.SourceTextModule(read(file),{context,identifier:path.join(root,file)}));
    return modules.get(file);
  }
  const entry = load(modulePath);
  await entry.link((name,parent)=>load(path.relative(root,path.resolve(path.dirname(parent.identifier),name+'.js'))));
  await entry.evaluate();
  const fn = (text, context) => plain(entry.namespace[exportName](text, context));
  fn.native = entry.namespace[exportName];
  return fn;
}
function browser(html, url=fixture.source_url) {
  const dom = new JSDOM(html,{url});
  Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  let clock = Date.parse(fixture.observed_at);
  class Clock extends Date { constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;} }
  const context = vm.createContext({document:dom.window.document,location:dom.window.location,URL,Date:Clock,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),
    setTimeout: fn => {clock+=100; queueMicrotask(fn);},extractSinglePayloadFromTab:async()=>({source:'legacy'}),console});
  vm.runInContext(source,context);
  return {dom,context,run:()=>vm.runInContext('capturePinnacleMlbPage()',context)};
}
const tabHtml = '<button id="player-props">Player Props</button>';
const prefix = 'PINNACLE_MLB_DOM_V1: ';
const packet = text => JSON.parse(text.slice(prefix.length));

test('Observed Pinnacle DOM: activate Player Props, expand Show All, preserve decimal prices and contextual markets',async()=>{
  const b = browser(fixture.strikeouts_and_collapsed.join('')+tabHtml,fixture.source_url.replace('#player-props','#all'));
  let tabs=0,showAll=0,outcomes=0;
  const doc=b.dom.window.document;
  doc.querySelector('#player-props').onclick=()=>{tabs++;b.dom.window.location.hash='player-props';};
  doc.querySelector('.collapse-title button').onclick=()=>{
    showAll++;
    doc.querySelector('[data-collapsed="true"]').outerHTML=fixture.expanded[0].split('<button id=')[0];
  };
  doc.addEventListener('click',e=>{if(e.target.closest('.market-btn'))outcomes++;});
  const result=await b.run();
  assert.equal(tabs,1);assert.equal(showAll,1);assert.equal(outcomes,0);
  const data=packet(result.text);
  assert.equal(data.panels.length,2);assert.deepEqual(data.diagnostics,[]);
  const rows=(await parser())(result.text);
  assert.equal(rows.length,4);
  data.panels.push(plain(data.panels[0]));
  const repeated=(await parser())(prefix+JSON.stringify(data));
  assert.equal(repeated.length,4);
  assert.equal(new Set(repeated.map(row=>row.id)).size,4);
  const bases=rows.filter(r=>r.marketType==='player_total_bases');
  assert.deepEqual(bases.map(r=>[r.selectionNormalized,r.lineValue,r.oddsDecimal,r.ariaOddsAmerican]),[['Andrew Vaughn Over',0.5,1.645,-155],['Andrew Vaughn Under',0.5,2.23,123]]);
  assert.ok(Math.abs(bases[0].oddsAmerican-(-155.0387596899225))<1e-9);
  assert.equal(bases[0].originalOdds,'1.645');
  assert.ok(rows.every(r=>r.sport==='MLB'&&r.period==='full_game'&&r.eventLabelRaw==='Milwaukee Brewers @ Los Angeles Dodgers'&&r.capturedAt));
  assert.deepEqual(rows.filter(r=>r.marketType==='pitcher_strikeouts').map(r=>[r.selectionNormalized,r.lineValue,r.oddsDecimal]),[['Robert Gasser Over',3.5,1.892],['Robert Gasser Under',3.5,1.892]]);
});

test('Already expanded observed panels are read without Hide All or outcome clicks',async()=>{
  const b=browser(fixture.expanded[0]);let clicks=0;b.dom.window.document.addEventListener('click',()=>clicks++);
  const result=await b.run();assert.equal(clicks,0);assert.equal((await parser())(result.text).length,2);
});

test('Collapsed title without Show All can reveal lazily replaced content',async()=>{
  const b=browser(fixture.strikeouts_and_collapsed[0]+tabHtml);
  const doc=b.dom.window.document;
  const drawer=doc.querySelector('[data-collapsed="false"]');
  const original=drawer.outerHTML;
  drawer.setAttribute('data-collapsed','true');drawer.querySelector('.collapse-content').remove();
  drawer.querySelector('.collapse-title').onclick=()=>{drawer.outerHTML=original;};
  const result=await b.run();
  assert.equal(packet(result.text).panels[0].quotes.length,2);
  assert.ok(packet(result.text).diagnostics.some(x=>x.includes('Andrew Vaughn')));
});

test('Event navigation aborts capture; foreign host and other leagues do not activate controls',async()=>{
  const b=browser(fixture.expanded[0],fixture.source_url.replace('#player-props','#all'));
  b.dom.window.document.querySelector('#player-props').onclick=()=>b.dom.reconfigure({url:'https://www.pinnacle.com/en/baseball/mlb/other-game/123/'});
  const data=packet((await b.run()).text);assert.equal(data.panels.length,0);assert.equal(data.mainText,'');assert.ok(data.diagnostics.some(x=>x.includes('navigation')));
  for(const url of ['https://evilpinnacle.com/en/baseball/mlb/a-vs-b/1/','https://www.pinnacle.com/en/football/nfl/a-vs-b/1/'])assert.equal(await browser(fixture.expanded[0],url).run(),null);
});

test('Contextual packet rejects mismatched units, missing sides, conflicting duplicates and partial periods',async()=>{
  const raw=packet((await browser(fixture.expanded[0]).run()).text);const parse=await parser();
  const check=mutate=>{const p=plain(raw);mutate(p);assert.equal(parse(prefix+JSON.stringify(p)).length,0);};
  check(p=>p.panels[0].quotes[0].label='Over 0.5 Home Runs');
  check(p=>p.panels[0].quotes.pop());
  check(p=>p.panels[0].quotes.push({...p.panels[0].quotes[0],price:'1.500'}));
  check(p=>p.panels[0].title+=' First Inning');
  check(p=>p.panels[0].quotes[0].price='-20');
  check(p=>p.url='https://example.com/en/baseball/mlb/milwaukee-brewers-vs-los-angeles-dodgers/1/');
  check(p=>p.capturedAt='invalid');
  const duplicate=plain(raw);duplicate.panels.push(plain(raw.panels[0]));assert.equal(parse(prefix+JSON.stringify(duplicate)).length,2);
});

test('Main-line preservation filters raw props and mismatched events',async()=>{
  const parse=await parser();const p=packet((await browser(fixture.expanded[0]).run()).text);
  p.mainText=read('tests/fixtures/pinnacle-mlb-expanded.txt');
  assert.equal(parse(prefix+JSON.stringify(p)).length,2);
  p.url='https://www.pinnacle.com/en/baseball/mlb/san-francisco-giants-vs-new-york-mets/1/#all';p.panels=[];
  const rows=parse(prefix+JSON.stringify(p));assert.equal(rows.length,6);assert.ok(rows.every(r=>['spread','total','moneyline_2way'].includes(r.marketType)));
});

test('Wrapper uses scoped injection, preserves other books and prevents concurrent capture',async()=>{
  let release;let calls=0;
  const b=browser('');b.context.chrome={tabs:{get:async()=>({url:fixture.source_url})}};
  b.context.safeExecuteScript=async()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const first=vm.runInContext('extractSinglePayloadFromTab(1)',b.context);
  await new Promise(resolve=>setImmediate(resolve));
  const second=await vm.runInContext('extractSinglePayloadFromTab(1)',b.context);
  assert.match(second.text,/already running/);assert.equal(calls,1);
  release([{result:{source:'Pinnacle',text:'done'}}]);assert.equal((await first).text,'done');
  b.context.chrome.tabs.get=async()=>({url:'https://www.pinnacle.com/en/football/nfl/a-vs-b/1/'});
  assert.equal((await vm.runInContext('extractSinglePayloadFromTab(1)',b.context)).source,'legacy');
});


test('Router retains capture diagnostics and normalization retains displayed decimal and provenance',async()=>{
  const capture=await browser(fixture.expanded[0]).run();
  const route=await parser('app/ev-parlay-lab/utils/parseOddsText.js','parseOddsText');
  const rows=route.native(capture.text,{sportsbook:'Pinnacle'});
  assert.equal(rows.importDiagnostics.accepted,2);
  assert.equal(rows.importDiagnostics.skipped,0);
  const normalize=await parser('app/ev-parlay-lab/utils/normalizeTeams.js','normalizeParsedRows');
  const normalized=normalize(rows);
  assert.equal(normalized[0].oddsDecimal,1.645);
  assert.equal(normalized[0].originalOdds,'1.645');
  assert.equal(normalized[0].sourceType,'pinnacle_dom');
  assert.equal(normalized[0].ariaOddsAmerican,-155);
});

test('Synthetic suffix/unit variations preserve player parentheses and keep aria labels out of market inference',async()=>{
  const p=packet((await browser(fixture.expanded[0]).run()).text);const parse=await parser();
  for(const [category,unit,type,line] of [['Pitching Outs','Pitching Outs','pitcher_outs_recorded',11.5],['Hits Allowed','Hits Allowed','pitcher_hits_allowed',3.5],['Home Runs','Home Runs','player_home_runs',0.5]]) {
    p.panels=[{title:`Sample Player Jr. (L) Total ${category}`,quotes:[{label:`Over ${line} ${unit}`,price:'+110',ariaLabel:'Money Line -999'},{label:`Under ${line} ${unit}`,price:'-120',ariaLabel:'Money Line 999'}]}];
    const rows=parse(prefix+JSON.stringify(p));assert.equal(rows.length,2);
    assert.equal(rows[0].marketType,type);assert.equal(rows[0].participant,'Sample Player Jr. (L)');
    assert.equal(rows[0].oddsAmerican,110);assert.equal(rows[0].ariaOddsAmerican,-999);
  }
});

test('Disabled outcomes are not treated as priced pairs',async()=>{
  const b=browser(fixture.expanded[0]);b.dom.window.document.querySelector('.market-btn').disabled=true;
  assert.equal((await parser())((await b.run()).text).length,0);
});


test('Tracking query parameters preserve event identity and original source URL',async()=>{
  const parse=await parser();
  for (const query of ['?utm_source=test', '?tracking=1&return=%2Fen%2Fbaseball%2Fmlb%2Fother-event%2F1%2F']) {
    const url=fixture.source_url.replace('#player-props',query+'#player-props');
    const rows=parse((await browser(fixture.expanded[0],url).run()).text);
    assert.equal(rows.length,2);
    assert.ok(rows.every(r=>r.eventLabelRaw==='Milwaukee Brewers @ Los Angeles Dodgers'&&r.sourceUrl===url));
  }
  // A query-only navigation is benign; a changed event ID/path is not.
  for(const changeEvent of [false,true]) {
    const b=browser(fixture.expanded[0],fixture.source_url.replace('#player-props','?tracking=old#all'));
    b.dom.window.document.querySelector('#player-props').onclick=()=>b.dom.reconfigure({url:fixture.source_url.replace('1638279070',changeEvent?'9999999999':'1638279070').replace('#player-props','?tracking=new#player-props')});
    const result=await b.run();
    assert.equal(parse(result.text).length,changeEvent?0:2);
    if(changeEvent)assert.match(result.text,/Event navigation detected/);
  }
});

test('CSS-only hidden outcomes, ancestors and price spans cannot become priced pairs',async()=>{
  const parse=await parser();
  for(const rule of ['display: none','visibility: hidden','visibility: collapse']) {
    for(const target of ['.market-btn','.collapse-content','.market-btn span:last-child']) {
      const b=browser('<style>.test-hidden {'+rule+'}</style>'+fixture.expanded[0]);
      b.dom.window.document.querySelector(target).classList.add('test-hidden');
      assert.equal(parse((await b.run()).text).length,0,rule+' '+target);
    }
  }
  const b=browser('<style>.test-hidden { display: none }</style>'+fixture.expanded[0]);
  const hidden=b.dom.window.document.createElement('span');hidden.className='test-hidden';hidden.textContent='9.999';
  b.dom.window.document.querySelector('.market-btn').appendChild(hidden);
  const rows=parse((await b.run()).text);
  assert.equal(rows.length,2);assert.equal(rows[0].oddsDecimal,1.645);
});
