// Shared repeat-run semantics. An empty demand is never a request for a full run.
function resolveCaptureDemand(snapshot, scope, {refresh=false}={}) {
  const key=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  const book=(snapshot?.books||[]).find(b=>key(b.bookmaker)===key(scope.book));
  const sport=(book?.sports||[]).find(s=>key(s.sport)===key(scope.sport));
  const found=(sport?.events||[]).find(e=>key(e.eventName)===key(scope.event));
  const event=found?.rowCount===0?null:found;
  const coverageKnown=Array.isArray(snapshot?.books);
  const targets=[...new Set([...(event?.missingExpectedMarkets||[]),...(event?.missingSharpMarkets||[])].map(m=>m.marketType==='moneyline'?'moneyline_2way':m.marketType).filter(Boolean))];
  return {...scope,loaded:!!event,coverageKnown,resetProgress:coverageKnown&&!event,markedComplete:event?.coverageMarkedComplete===true,targets:refresh?[]:targets,
    mode:refresh?'refresh':!event?'initial':event.coverageMarkedComplete?'complete':targets.length?'missing':'complete'};
}
const captureDemandRuns=new Map();
function captureDemandFor(tabId) { return captureDemandRuns.get(tabId)||null; }
function captureDemandBook(url) {
  let host;try{host=new URL(url).hostname;}catch{return '';}
  return [['draftkings.com','DraftKings'],['fanduel.com','FanDuel'],['betmgm.com','BetMGM'],['pinnacle.com','Pinnacle'],['thescore.bet','TheScore'],['caesars.com','Caesars']].find(([domain])=>host===domain||host.endsWith('.'+domain))?.[1]||'';
}
function captureDemandProbe(book,snapshot) {
  const pageIdentity=location.pathname+' '+String(document.title||'');
  if(/\b(?:NBA|WNBA|basketball)\b/i.test(pageIdentity)&&!(/\b(?:MLB|NHL|NFL)\b/i.test(pageIdentity)))return {outOfScope:true};
  const key=v=>String(v||'').toLowerCase().replace(/\s+(?:vs\.?|at)\s+/g,' @ ').replace(/\s+/g,' ').trim();
  const root=document.querySelector('main')||document.body;
  const raw=key(root?.innerText||'');
  const candidates=[];
  for(const b of snapshot?.books||[])for(const s of b.sports||[])if(['MLB','NHL','NFL'].includes(s.sport))for(const e of s.events||[]) {
    // Require the complete event label, never city-only or substring team inference.
    if(raw.includes(key(e.eventName)))candidates.push({book,sport:s.sport,event:e.eventName});
  }
  const identity=location.origin+location.pathname;
  let prior=null;try{prior=JSON.parse(sessionStorage.getItem('EV_CAPTURE_DEMAND::'+identity)||'null');}catch{}
  // A deleted book can still be identified by the exact visible event label
  // retained for another book. Use that only as identity, never as its coverage.
  if(prior?.event&&key(prior.book)===key(book)&&['MLB','NHL','NFL'].includes(prior.sport)&&raw.includes(key(prior.event)))candidates.push(prior);
  const unique=[...new Map(candidates.map(c=>[c.sport+'|'+key(c.event),{book,sport:c.sport,event:c.event}])).values()];
  const scope=unique.length===1?unique[0]:null;
  try{sessionStorage.setItem('EV_CAPTURE_DEMAND::'+identity,JSON.stringify(scope||prior||{book,initial:true}));}catch{}
  let pending=[];try{pending=JSON.parse(sessionStorage.getItem('EV_CAPTURE_PENDING::'+identity)||'[]');}catch{}
  return {scope,ambiguous:unique.length>1,prior,identity,pending};
}
async function prepareCaptureDemand(tabId,book,snapshot,options={}) {
  if(!book)return null;
  const result=await safeExecuteScript({tabId,func:captureDemandProbe,args:[book,snapshot]});
  const probe=result?.[0]?.result;
  if(probe?.outOfScope)return null;
  if(!probe)return {book,mode:'unresolved',targets:[],reason:'Could not establish the selected event for targeting.'};
  // NFL collectors already resolve the selected breadcrumb/hero and canonical
  // teams. Use that same read-only identity before the generic literal match.
  // DK renders "SF 49ers @ WAS Commanders", while imported coverage uses full
  // names; event URLs/titles also need not contain the word NFL.
  if(typeof nflDetailPageStep==='function'&&['DraftKings','FanDuel','BetMGM','TheScore'].includes(book)) {
    let selected;
    for(let attempt=0;attempt<3;attempt++) {
      const response=await safeExecuteScript({tabId,func:nflDetailPageStep,args:[book,{mode:'probe'}]});
      selected=response?.[0]?.result;
      if(selected?.event&&selected.pregame||/live|finished|changed|conflict/i.test(selected?.reason||selected?.stopped||''))break;
      if(attempt<2&&typeof sleepBackground==='function')await sleepBackground(150);
    }
    if(selected?.recognized) {
      if(!selected.event||!selected.pregame||selected.origin+selected.path!==probe.identity)
        return {book,sport:'NFL',mode:'unresolved',targets:[],reason:selected.reason||selected.stopped||'Selected NFL event changed or could not be verified.'};
      probe.scope={book,sport:'NFL',event:selected.event};probe.ambiguous=false;
    }
  }
  if(!options.refresh&&!Array.isArray(snapshot?.books))return {book,mode:'unresolved',targets:[],reason:'App coverage could not be read. Open the parlay app and retry; missing data was not treated as deletion.'};
  if(!options.refresh&&(probe.ambiguous||!probe.scope&&probe.prior))return {book,mode:'unresolved',targets:[],reason:'Selected event could not be matched uniquely. Open its event page, or explicitly refresh; no broad retry was started.'};
  const plan=probe.scope?resolveCaptureDemand(snapshot,probe.scope,options):{book,mode:options.refresh?'refresh':'initial',targets:[]};
  if(plan.resetProgress) {
    const reset=await safeExecuteScript({tabId,func:resetEmptyCaptureProgress,args:[probe.identity,probe.scope]});
    if(reset?.[0]?.result!==true)return {book,mode:'unresolved',targets:[],reason:'Could not reset capture progress for the verified empty event; no capture was started.'};
  }
  if(plan.loaded&&!plan.markedComplete&&!options.refresh&&Array.isArray(probe.pending)&&probe.pending.length) {
    plan.targets=[...new Set([...plan.targets,...probe.pending])];plan.mode='missing';
  }
  return {...plan,identity:probe.identity};
}
function resetEmptyCaptureProgress(identity,scope) {
  if(location.origin+location.pathname!==identity||!scope?.event)return false;
  const path=location.pathname;
  const keys=['EV_CAPTURE_PENDING::'+identity,'EV_CAPTURE_DEMAND::'+identity];
  if(scope.sport==='NFL')keys.push(`EV_NFL_CAPTURE_PROGRESS_V4::${scope.book}::${path}`);
  if(scope.book==='DraftKings'&&scope.sport==='MLB')keys.push(`EV_DK_MLB_WORKFLOW_PROGRESS::${path}`);
  if(scope.book==='DraftKings'&&scope.sport==='NHL')keys.push(`EV_DK_WORKFLOW_PROGRESS::${path}`);
  if(scope.book==='FanDuel'&&scope.sport==='NHL')keys.push(`EV_FD_NHL_WORKFLOW_PROGRESS::${path}`);
  if(scope.book==='BetMGM'&&['MLB','NHL'].includes(scope.sport))keys.push(`EV_BETMGM_WORKFLOW_PROGRESS::${scope.sport}::${path}`);
  try {
    keys.forEach(key=>sessionStorage.removeItem(key));
    sessionStorage.setItem('EV_CAPTURE_DEMAND::'+identity,JSON.stringify(scope));
    return true;
  }catch{return false;}
}
function captureDemandVisiblePage(book,identity) {
  if(location.origin+location.pathname!==identity)return {source:book,text:'',message:'Selected event changed.'};
  return {source:book,text:String((document.querySelector('main')||document.body)?.innerText||''),
    message:'Targeted visible-market capture; automatic drawer navigation is not verified for this layout.'};
}
function demandUsesNativeCollector(plan) {
  return plan.sport==='NFL'&&['DraftKings','FanDuel','BetMGM','TheScore'].includes(plan.book)||
    plan.sport==='MLB'&&['DraftKings','Pinnacle'].includes(plan.book)||
    plan.sport==='NHL'&&['DraftKings','FanDuel','TheScore'].includes(plan.book);
}
function captureTargetLabels(sport,types) {
  const labels={
    moneyline_2way:['Game Lines','Main Lines','Moneyline'],spread:['Game Lines','Main Lines','Spread'],total:['Game Lines','Main Lines','Total'],
    player_hits:['Hits','Hits O/U'],player_total_bases:['Total Bases','Total Bases O/U','Bases'],player_home_runs:['Home Runs'],player_rbis:['RBIs','RBIs O/U','Runs Batted In'],player_runs:['Runs','Runs O/U'],player_hits_runs_rbis:['Hits + Runs + RBIs'],
    pitcher_strikeouts:['Strikeouts','Strikeouts O/U'],pitcher_outs_recorded:['Outs','Outs Recorded','Pitching Outs'],pitcher_hits_allowed:['Hits Allowed'],pitcher_earned_runs_allowed:['Earned Runs'],pitcher_walks_allowed:['Walks Allowed'],
    player_passing_yards:['Passing Yards','Pass Yards'],player_passing_touchdowns:['Passing Touchdowns','Passing TDs','Touchdown Passes'],player_passing_attempts:['Passing Attempts','Pass Attempts'],player_passing_completions:['Passing Completions','Pass Completions','Completions'],player_passing_interceptions:['Interceptions','Interceptions Thrown','Passing Interceptions'],
    player_rushing_yards:['Rushing Yards'],player_rushing_attempts:['Rushing Attempts','Rush Attempts','Carries'],player_receiving_yards:['Receiving Yards'],player_receptions:['Receptions'],player_touchdowns:['Touchdowns','Touchdowns Scored','Anytime Touchdown Scorer'],player_rushing_receiving_yards:['Rushing + Receiving Yards'],player_passing_rushing_yards:['Passing + Rushing Yards']
  };
  const parents=sport==='MLB'?[...(types.some(t=>t.startsWith('player_'))?['Batter Props','Batter']:[]),...(types.some(t=>t.startsWith('pitcher_'))?['Pitcher Props','Pitcher']:[])]:[];
  return [...new Set([...parents,...types.flatMap(t=>labels[t]||[])])];
}
function nflTypesForTitles(titles) {
  const types=['player_passing_yards','player_passing_touchdowns','player_passing_attempts','player_passing_completions','player_passing_interceptions','player_rushing_yards','player_rushing_attempts','player_receiving_yards','player_receptions','player_touchdowns','player_rushing_receiving_yards','player_passing_rushing_yards'];
  const key=v=>String(v).toLowerCase().replace(/\s*\(o\/u\)$/,'').replace(/^player\s+/,'').replace(/^total\s+/,'').replace(/ and /g,' + ').trim();
  return types.filter(type=>captureTargetLabels('NFL',[type]).some(label=>titles.some(title=>key(title)===key(label))));
}
function updateCapturePending(identity,done,pending) {
  if(location.origin+location.pathname!==identity)return;
  try {
    const key='EV_CAPTURE_PENDING::'+identity;
    const prior=JSON.parse(sessionStorage.getItem(key)||'[]');
    sessionStorage.setItem(key,JSON.stringify([...new Set([...prior.filter(t=>!done.includes(t)),...pending])]));
  }catch{}
}
