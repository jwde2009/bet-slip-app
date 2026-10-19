// Only allowlisted, same-event tabs and market expansion controls are clicked.
// Chrome serializes this entire function; it intentionally has no external dependencies.
async function nflDetailPageStep(book, request = {}) {
 try {
  const core = (// One source of truth embedded in the browser capture and the app reader.
function createNflCaptureCore() {
  const names = [
    ['Arizona Cardinals','ARI'],['Atlanta Falcons','ATL'],['Baltimore Ravens','BAL'],['Buffalo Bills','BUF'],
    ['Carolina Panthers','CAR'],['Chicago Bears','CHI'],['Cincinnati Bengals','CIN'],['Cleveland Browns','CLE'],
    ['Dallas Cowboys','DAL'],['Denver Broncos','DEN'],['Detroit Lions','DET'],['Green Bay Packers','GB'],
    ['Houston Texans','HOU'],['Indianapolis Colts','IND'],['Jacksonville Jaguars','JAX','JAC'],['Kansas City Chiefs','KC'],
    ['Las Vegas Raiders','LV'],['Los Angeles Chargers','LAC','LA'],['Los Angeles Rams','LAR','LA'],['Miami Dolphins','MIA'],
    ['Minnesota Vikings','MIN'],['New England Patriots','NE'],['New Orleans Saints','NO'],['New York Giants','NYG','NY'],
    ['New York Jets','NYJ','NY'],['Philadelphia Eagles','PHI'],['Pittsburgh Steelers','PIT'],['San Francisco 49ers','SF'],
    ['Seattle Seahawks','SEA'],['Tampa Bay Buccaneers','TB'],['Tennessee Titans','TEN'],['Washington Commanders','WAS','WSH'],
  ];
  const clean = v => String(v ?? '').replace(/\u2212|âˆ’/g,'-').replace(/[\u200B-\u200F\u2060\uFEFF]/g,'').replace(/\s+/g,' ').trim();
  const lines = v => String(v ?? '').split(/\r?\n|\t/).map(clean).filter(Boolean);
  const keys = new Map();
  for (const [name,...codes] of names) {
    const nick = name.split(' ').at(-1);
    for (const a of [name,nick,...codes.filter(c=>!['LA','NY'].includes(c)),...codes.map(c=>`${c} ${nick}`)]) keys.set(a.toLowerCase(),name);
  }
  const team = v => keys.get(clean(v).replace(/\s+\(?\d+-\d+(?:-\d+)?\)?$/,'').toLowerCase()) || '';
  function eventName(v) {
    const p = clean(v).replace(/\s+Odds$/i,'').split(/\s+(?:@|at|vs\.?)\s+/i);
    const a = team(p[0]), h = team(p[1]);
    return p.length === 2 && a && h && a !== h ? `${a} @ ${h}` : '';
  }
  const upcoming = /^(?:Starts In:|Starting in\b|Today\b|Tomorrow\b|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\b|\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i;
  const live = /^(?:Live\b|Final\b|Finished\b|Halftime\b|[1-4](?:st|nd|rd|th) (?:Quarter|Half)\b|Q[1-4]\b|Overtime\b)/i;
  function inspect(raw, book) {
    const ls = lines(raw);
    if (book === 'DraftKings') {
      const i = ls.findIndex(x=>/^Sportsbook\s*\/\s*Football Odds\s*\/\s*NFL Odds\s*\//i.test(x));
      if (i < 0) return null;
      const event = eventName(ls[i].replace(/^Sportsbook\s*\/\s*Football Odds\s*\/\s*NFL Odds\s*\/\s*/i,''));
      if (!event) return {recognized:true,event:'',pregame:false,reason:'NFL breadcrumb has unresolved teams'};
      const [a,h] = event.split(' @ ');
      const limit = ls.findIndex((x,j)=>j>i && /^(?:Odds|POPULAR)$/i.test(x));
      const end = limit < 0 ? Math.min(ls.length,i+180) : limit;
      let pregame = false;
      for (let j=i+1;j<end;j++) {
        if(team(ls[j])!==a) continue;
        for(let k=j+1;k<Math.min(end,j+12);k++) if(team(ls[k])===h) {
          const status=ls.slice(j+1,k);
          if (status.some(s=>upcoming.test(s)) && !status.some(s=>live.test(s))) pregame=true;
        }
      }
      return {recognized:true,event,pregame,reason:pregame?'':'No selected-game pregame header'};
    }
    if (book === 'FanDuel') {
      // The breadcrumb is authoritative; footer/sidebar NBA/WNBA links are not.
      let start=-1, value='';
      for(let i=0;i<ls.length;i++) {
        if (/^Football$/i.test(ls[i]) && ls[i+1]==='/' && /^NFL Odds$/i.test(ls[i+2]||'') && ls[i+3]==='/') {start=i+4;value=ls[start];break;}
        if (/^Football\s*\/\s*NFL Odds\s*\//i.test(ls[i])) {start=i;value=ls[i].replace(/^Football\s*\/\s*NFL Odds\s*\/\s*/i,'');break;}
      }
      if(start<0) return null;
      const event=eventName(value);
      // 'Popular' also occurs in the breadcrumb, BEFORE the event hero.
      // A breadcrumb tab name is not an end-of-header signal. Read only the
      // bounded hero, stopping before actual market controls or market data.
      const boundary=/^(?:More info|Learn More|My Bets|Same Game Parlay[\u2122\u00AE]?|Quick Bets|Passing Props|Receiving Props|Rushing Props|TD Scorer Props|Game Lines|Touchdown Scorers)$/i;
      const tabFollowing=/^(?:Quick Bets|Passing Props|Receiving Props|Rushing Props|TD Scorer Props)$/i;
      const breadcrumbTab=/^(?:Popular|Passing Props|Receiving Props|Rushing Props|TD Scorer Props)$/i;
      let skippedBreadcrumbTab='';
      let end=Math.min(ls.length,start+24);
      for(let i=start+1;i<end;i++) {
        // A tab suffix directly after the breadcrumb event is navigation, not
        // a status or the market-tab bar. Skip at most one such leading label.
        if(i<=start+2 && !skippedBreadcrumbTab && breadcrumbTab.test(ls[i])) {skippedBreadcrumbTab=ls[i];continue;}
        if(boundary.test(ls[i]) || /^Popular$/i.test(ls[i]) && tabFollowing.test(ls[i+1]||'')) {end=i;break;}
      }
      const status=ls.slice(start+1,end);
      const scheduleTokens=status.filter(s=>upcoming.test(s));
      const liveTokens=status.filter(s=>live.test(s)||/^(?:[1-4]Q\b|HT\b|FT\b|OT\b|End of (?:[1-4](?:st|nd|rd|th) Quarter|Game)\b)/i.test(s));
      const conflicting=status.map(eventName).filter(e=>e&&e!==event);
      const pregame=!!event && scheduleTokens.length>0 && !liveTokens.length && !conflicting.length;
      const reason=!event?'NFL breadcrumb has unresolved teams':conflicting.length?'Conflicting selected-game headers':liveTokens.length?'Selected game is live/finished':pregame?'':'No selected-game pregame header';
      // Only the selected hero is included, never the whole page/account shell.
      const headerDiagnostics={event,skippedBreadcrumbTab,statusTokens:status.map(s=>s.slice(0,120)),boundary:ls[end]||'',scheduleTokens,liveTokens,conflictingEvents:[...new Set(conflicting)]};
      return {recognized:true,event,pregame,reason,headerDiagnostics};
    }
    if(book==='BetMGM') {
      const start=ls.findIndex(x=>/^(?:USA|United States)\s*\|\s*NFL$/i.test(x));
      if(start<0)return null;
      for(let i=start+1;i<Math.min(ls.length-1,start+16);i++) {
        const a=team(ls[i]),h=team(ls[i+1]);
        if(!a||!h||a===h)continue;
        const status=ls.slice(start+1,i);
        const pregame=status.some(s=>upcoming.test(s)) && !status.some(s=>live.test(s));
        return {recognized:true,event:`${a} @ ${h}`,pregame,reason:pregame?'':'No selected-game pregame header'};
      }
      return {recognized:true,event:'',pregame:false,reason:'No selected NFL matchup'};
    }
    return null;
  }
  const defs = [
    ['player_passing_yards',['passing yards','pass yards','passing yds']],
    ['player_passing_touchdowns',['passing touchdowns','pass touchdowns','passing tds','pass tds','touchdown passes']],
    ['player_passing_attempts',['passing attempts','pass attempts']],
    ['player_passing_completions',['passing completions','pass completions','completions']],
    ['player_passing_interceptions',['passing interceptions','pass interceptions','interceptions thrown','interceptions']],
    ['player_rushing_yards',['rushing yards','rush yards','rushing yds']],
    ['player_rushing_attempts',['rushing attempts','rush attempts','carries']],
    ['player_receiving_yards',['receiving yards','rec yards','receiving yds']],
    ['player_receptions',['receptions']],
    ['player_rushing_receiving_yards',['rushing + receiving yards','rushing and receiving yards','rush + rec yards','rushing + receiving yds']],
    ['player_passing_rushing_yards',['passing + rushing yards','pass + rush yards','passing + rushing yds']],
    ['player_touchdowns',['touchdowns','touchdowns scored','anytime touchdown scorer','anytime touchdown scorers','anytime td scorer','anytime touchdowns','total touchdowns']],
  ];
  const allTypes = new Set(['spread','total','moneyline_2way',...defs.map(d=>d[0])]);
  const badMarket = /\b(?:first|last|half|halves|quarter|1st|2nd|3rd|4th|live|season|team|longest|defensive|drive|either|alternate|alt|special|sgp|pre-built)\b/i;
  function market(v) {
    let s=clean(v).toLowerCase();
    if(badMarket.test(s))return '';
    if(defs.some(d=>d[0]===s))return s;
    s=s.replace(/\s*\(?o\s*\/\s*u\)?$/i,'').replace(/^player\s+/,'').replace(/^total\s+/,'').trim();
    return defs.find(d=>d[1].includes(s))?.[0] || '';
  }
  function player(v) {
    const s=clean(v);
    if(s.length>80||team(s)||/\b(?:Over|Under|Avg|Player|Total|First|Last|Half|Quarter|Team|Scorer|Yards|Passing|Receiving|Rushing|Receptions|Touchdowns|None|Field|SGP|No|Defense)\b/i.test(s))return '';
    return /^[\p{L}][\p{L}.'’\-]*(?:\s+[\p{L}][\p{L}.'’\-]*){1,5}$/u.test(s)?s:'';
  }
  function describe(title) {
    const s=clean(title);
    if(badMarket.test(s))return null;
    if(/^(?:Game|Main Lines|Game Lines)$/i.test(s))return {type:'main',name:''};
    if(/^(?:TD Scorer|TD Scorers|Touchdown Scorers)$/i.test(s))return {type:'player_touchdowns',name:'',tableOnly:true};
    const m=s.match(/^(.+?)\s+-\s+(.+)$/);
    if(m && player(m[1]) && market(m[2]))return {type:market(m[2]),name:player(m[1])};
    const type=market(s);
    return type?{type,name:''}:null;
  }
  function odds(v) {
    const s=clean(v);
    if(/^(EVEN|EVS)$/i.test(s))return 100;
    const n=Number(s);
    return /^[+-]\d{3,7}$/.test(s) && Math.abs(n)>=100 && Math.abs(n)<=1000000?n:null;
  }
  function priceIn(v) {
    const prices=[...clean(v).matchAll(/(?:^|\s)([+-]\d{3,7}|EVEN|EVS)(?=\s|$)/gi)].map(m=>odds(m[1]));
    const u=[...new Set(prices.filter(p=>p!==null))];
    return u.length===1?u[0]:null;
  }
  function handicap(v) {const s=clean(v);return /^(?:PK|PICK|PICK'EM|[+-]?0(?:\.0)?)$/i.test(s)?0:/^[+-]\d+(?:\.\d+)?$/.test(s)&&Math.abs(Number(s))<100?Number(s):null;}
  function ou(v) {const m=clean(v).match(/^(O|U|Over|Under)\s*(\d+(?:\.\d+)?)$/i);return m?{side:/^U/i.test(m[1])?'Under':'Over',line:Number(m[2])}:null;}
  const quote=(type,subject,side,line,price)=>({marketType:type,subject,side,line,odds:price});
  function validQuotes(qs,event) {
    const [a,h]=event.split(' @ '), groups=new Map(), singles=[];
    for(const q of qs||[]) {
      if(!q||!allTypes.has(q.marketType)||!Number.isInteger(q.odds)||Math.abs(q.odds)<100||Math.abs(q.odds)>1000000)continue;
      const main=['spread','total','moneyline_2way'].includes(q.marketType);
      if(!main && !player(q.subject))continue;
      if(!['Over','Under','Away','Home'].includes(q.side))continue;
      if(main && q.marketType!=='total' && q.subject!==(q.side==='Away'?a:q.side==='Home'?h:''))continue;
      if(q.marketType==='moneyline_2way') {if(q.line!==null)continue;}
      else if(typeof q.line!=='number'||!Number.isFinite(q.line)||q.line<0 && q.marketType!=='spread')continue;
      if(q.marketType==='total' && (!['Over','Under'].includes(q.side)||q.line<=0))continue;
      if(!main && !['Over','Under'].includes(q.side))continue;
      if(q.single===true && q.marketType==='player_touchdowns'&&q.side==='Over'&&q.line===0.5){singles.push(q);continue;}
      const k=[q.marketType,main?'':q.subject,q.marketType==='spread'?Math.abs(q.line):q.line].join('|');
      const g=groups.get(k)||new Map();
      const old=g.get(q.side);
      if(old && old.odds!==q.odds)g.set('invalid',true);
      g.set(q.side,q);groups.set(k,g);
    }
    const out=[];
    for(const g of groups.values()) {
      if(g.get('invalid'))continue;
      const x=g.get('Over')||g.get('Away'),y=g.get('Under')||g.get('Home');
      if(!x||!y||x.marketType!==y.marketType)continue;
      if(x.marketType==='spread'&&Math.abs(x.line+y.line)>1e-6)continue;
      if(x.marketType!=='spread'&&x.line!==y.line)continue;
      out.push(x,y);
    }
    const ss=new Map();for(const s of singles){const k=s.subject;const old=ss.get(k);ss.set(k,old&&old.odds!==s.odds?{...s,invalid:true}:old?.invalid?old:s);}
    out.push(...[...ss.values()].filter(s=>!s.invalid));
    return out;
  }
  function parseMain(book,event,raw) {
    const ls=lines(raw),[a,h]=event.split(' @ '),qs=[];
    if(!a||!h)return [];
    for(let i=0;i<ls.length;i++) {
      const fd=book==='FanDuel';
      const header=/^Spread$/i.test(ls[i]) && (fd?/^Money$/i.test(ls[i+1]||'')&&/^Total$/i.test(ls[i+2]||''):/^Total$/i.test(ls[i+1]||'')&&/^(Money|Moneyline)$/i.test(ls[i+2]||''));
      if(!header)continue;
      let c=ls.slice(i+3),x=[];
      if(book==='DraftKings') {
        if(team(c[0])!==a||!/^AT$/i.test(c[1]||'')||team(c[2])!==h)continue;
        c=c.slice(3,15);if(c.length!==12||c[2]!=='O'||c[8]!=='U')continue;
        x=[handicap(c[0]),odds(c[1]),odds(c[5]),ou('O '+c[3]),odds(c[4]),handicap(c[6]),odds(c[7]),odds(c[11]),ou('U '+c[9]),odds(c[10])];
      } else if(fd) {
        if(team(c[0])!==a||team(c[1])!==h)continue;c=c.slice(2,12);if(c.length!==10)continue;
        x=[handicap(c[0]),odds(c[1]),odds(c[2]),ou(c[3]),odds(c[4]),handicap(c[5]),odds(c[6]),odds(c[7]),ou(c[8]),odds(c[9])];
      } else if(book==='BetMGM') {
        if(team(c[0])!==a||team(c[6])!==h)continue;c=c.slice(0,12);
        x=[handicap(c[1]),odds(c[2]),odds(c[5]),ou(c[3]),odds(c[4]),handicap(c[7]),odds(c[8]),odds(c[11]),ou(c[9]),odds(c[10])];
      } else continue;
      if(x[0]!==null&&x[5]!==null)qs.push(quote('spread',a,'Away',x[0],x[1]),quote('spread',h,'Home',x[5],x[6]));
      qs.push(quote('moneyline_2way',a,'Away',null,x[2]),quote('moneyline_2way',h,'Home',null,x[7]));
      if(x[3]?.side==='Over'&&x[8]?.side==='Under')qs.push(quote('total','','Over',x[3].line,x[4]),quote('total','','Under',x[8].line,x[9]));
      break;
    }
    return validQuotes(qs,event);
  }
  function parseMainTable(event,table) {
    const hs=(table.headers||[]).map(v=>clean(v).toLowerCase()),[a,h]=event.split(' @ '),qs=[];
    if(!hs.includes('spread')||!hs.includes('total')||!hs.some(x=>/^(money|moneyline)$/.test(x)))return [];
    for(const r of table.rows||[]) {
      const name=team(r.name);if(![a,h].includes(name))continue;
      const side=name===a?'Away':'Home';
      if(r.cells.length!==hs.length)continue;
      for(let j=0;j<hs.length;j++) {
        const cell=r.cells[j];if(cell.locked)continue;
        const p=priceIn(cell.text);if(p===null)continue;
        const ls=lines(cell.text);
        if(hs[j]==='spread') {const vs=[...new Set([...clean(cell.text).matchAll(/(?:^|\s)([+-]\d+(?:\.\d+)?|PK)(?=\s|$)/gi)].map(m=>handicap(m[1])).filter(v=>v!==null))];if(vs.length===1)qs.push(quote('spread',name,side,vs[0],p));}
        else if(hs[j]==='total') {const vs=[...clean(cell.text).matchAll(/(?:^|\s)((?:Over|Under|O|U)\s*\d+(?:\.\d+)?)(?=\s|$)/gi)].map(m=>ou(m[1])).filter(Boolean);const uniq=[...new Map(vs.map(v=>[v.side+'|'+v.line,v])).values()];if(uniq.length===1)qs.push(quote('total','',uniq[0].side,uniq[0].line,p));}
        else if(/^(money|moneyline)$/.test(hs[j]))qs.push(quote('moneyline_2way',name,side,null,p));
      }
    }
    return validQuotes(qs,event);
  }
  function parsePropText(title,raw) {
    const d=describe(title);if(!d||d.type==='main'||d.tableOnly)return [];
    const ls=lines(raw),qs=[];
    function token(i,name) {
      let s=ls[i]||'';
      if(name&&s.toLowerCase().startsWith(name.toLowerCase()+' '))s=s.slice(name.length).trim();
      let m=s.match(/^(O|U|Over|Under)\s*(\d+(?:\.\d+)?)\s+([+-]\d{3,7}|EVEN|EVS)$/i);
      if(m)return {side:/^U/i.test(m[1])?'Under':'Over',line:Number(m[2]),odds:odds(m[3]),next:i+1};
      let o=ou(s);
      if(o)return {...o,odds:odds(ls[i+1]),next:i+2};
      if(/^(O|U|Over|Under)$/i.test(s)) {
        const side=/^U/i.test(s)?'Under':'Over';o=ou(ls[i+1]);
        if(o && o.side===side)return {...o,odds:odds(ls[i+2]),next:i+3};
        if(/^\d+(?:\.\d+)?$/.test(ls[i+1]||''))return {side,line:Number(ls[i+1]),odds:odds(ls[i+2]),next:i+3};
      }
      return null;
    }
    let active=d.name;
    for(let i=0;i<ls.length;i++) {
      if(ls[i].toLowerCase()===clean(title).toLowerCase())continue;
      if(!d.name&&player(ls[i])) {active=player(ls[i]);continue;}
      if(!active)continue;
      if(d.type==='player_touchdowns' && /^anytime/i.test(clean(title)) && /^Yes$/i.test(ls[i])) {
        const p=odds(ls[i+1]);if(p!==null)qs.push({...quote(d.type,active,'Over',0.5,p),single:true});i++;active=d.name;continue;
      }
      const o=token(i,active);if(!o||o.side!=='Over')continue;
      const u=token(o.next,active);
      if(u&&u.side==='Under'&&o.line===u.line&&o.odds!==null&&u.odds!==null){qs.push(quote(d.type,active,'Over',o.line,o.odds),quote(d.type,active,'Under',u.line,u.odds));i=u.next-1;}
      active=d.name;
    }
    return qs;
  }
  function tdTable(table) {
    const hs=(table.headers||[]).map(clean);
    const ix=hs.findIndex(x=>/^(Anytime TD Scorer|Anytime Touchdown Scorer|Anytime)$/i.test(x));
    if(ix<0)return [];
    const qs=[];
    for(const r of table.rows||[]){const name=player(r.name);if(!name||r.cells.length!==hs.length)continue;const cell=r.cells[ix];if(cell.locked)continue;const p=priceIn(cell.text);if(p!==null)qs.push({...quote('player_touchdowns',name,'Over',0.5,p),single:true});}
    return qs;
  }
  const tabLabels={DraftKings:['POPULAR','GAME LINES','TD SCORERS','PASSING','RECEIVING','RUSHING'],FanDuel:['Popular','Passing Props','Receiving Props','Rushing Props','TD Scorer Props'],BetMGM:['All','Players'],TheScore:['Popular','Passing','Receiving','Rushing']};
  function row(book,event,q) {
    const main=['spread','total','moneyline_2way'].includes(q.marketType);
    const selection=main?q.marketType==='total'?q.side:q.subject:`${q.subject} ${q.side}`;
    const key=[book,event,q.marketType,selection,q.line].join('|');let hash=2166136261;for(const ch of key)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
    return {id:book.toLowerCase()+'_nflv2_'+hash.toString(16),sportsbook:book,sport:'NFL',league:'NFL',eventLabelRaw:event,
      marketType:q.marketType,selectionRaw:selection,selectionNormalized:selection,...(!main?{playerName:q.subject}:{}),lineValue:q.line,oddsAmerican:q.odds,
      oddsDecimal:q.odds>0?1+q.odds/100:1+100/Math.abs(q.odds),period:'full_game',confidence:'high',parseWarnings:!main&&Number.isInteger(q.line)?['Integer prop line: a push is possible.']:[],
      isSharpSource:false,isTargetBook:true,batchRole:'target',excluded:false,userEdited:false};
  }
  return {clean,lines,team,eventName,inspect,describe,market,player,odds,priceIn,quote,validQuotes,parseMain,parseMainTable,parsePropText,tdTable,tabLabels,row,badMarket};
}
)();
  const {clean,lines} = core;
  const wait = ms=>new Promise(r=>setTimeout(r,ms));
  const list = (el,s)=>Array.from(el?.querySelectorAll(s)||[]);
  const text = el=>clean(el?.innerText||el?.textContent||'');
  // Match the basketball workflow's rendered exact-label control mechanism.
  // A semantic tab may have no own box (display:contents), while its label does.
  function dkTabVisual(el) {
    if(!el?.isConnected)return {reason:'detached'};
    for(let p=el;p;p=p.parentElement||p.getRootNode?.().host||null) {
      const css=getComputedStyle(p);
      if(p.matches(excluded))return {reason:'excluded-region',node:p.tagName,className:String(p.className||'').slice(0,200),testId:(p.getAttribute('data-testid')||'').slice(0,120)};
      if(p.hidden||p.getAttribute('aria-hidden')==='true')return {reason:'hidden-ancestor',node:p.tagName};
      if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.contentVisibility==='hidden'||parseFloat(css.opacity)===0)
        return {reason:'css-hidden-ancestor',node:p.tagName,display:css.display,visibility:css.visibility,opacity:css.opacity};
    }
    const candidates=[el,...list(el,'span,div')];
    for(const candidate of candidates) {
      if(text(candidate)!==text(el))continue;
      const r=candidate.getBoundingClientRect(),css=getComputedStyle(candidate);
      if(r.width>0&&r.height>0&&r.width<=520&&r.height<=140&&css.display!=='none'&&css.visibility!=='hidden'&&parseFloat(css.opacity)!==0)
        return {node:candidate,reason:''};
    }
    const r=el.getBoundingClientRect();
    return {reason:'no-rendered-label',width:r.width,height:r.height,display:getComputedStyle(el).display};
  }
  const visible = el=>{
    if(!el||!el.isConnected)return false;
    if(book==='DraftKings'&&el.matches('a[role="tab"][data-testid="tab-switcher-tab-inner"]'))return !dkTabVisual(el).reason;
    if(el.checkVisibility&&!el.checkVisibility({opacityProperty:true,visibilityProperty:true}))return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!el.closest('[hidden], [aria-hidden="true"]');
  };
  // DK's event SECTION can carry layout modifiers mentioning a betslip/social
  // feature. Substring matching classifies that entire event as a betslip.
  // Match component names at token boundaries, not arbitrary ancestor substrings.
  const dkExcludedComponents=['betslip','bet-slip','sportsbook-betslip','social-feed'];
  const dkExcluded=dkExcludedComponents.flatMap(name=>[
    `[data-testid="${name}" i]`, `[data-testid^="${name}-" i]`, `[data-testid^="${name}__" i]`,
    `[class~="${name}" i]`, `[class^="${name}-" i]`, `[class*=" ${name}-" i]`,
    `[class^="${name}__" i]`, `[class*=" ${name}__" i]`
  ]).join(', ');
  const excluded=book==='DraftKings'
    ? `aside, footer, [role="dialog"], ${dkExcluded}, #ev-parlay-extension-toast`
    : 'aside, footer, [data-testid*="betslip" i], [data-testid*="bet-slip" i], [class*="betslip" i], [class*="bet-slip" i], [data-testid*="social" i], [class*="social-feed" i], #ev-parlay-extension-toast';
  const raw = ()=>String((document.querySelector('main')||document.body)?.innerText||'');
  const url=()=>new URL(location.href);
  const startUrl=url();
  const root=()=>document.querySelector('main')||document.body;
  function summaryTitle(d){return text(d.querySelector('summary h2, summary h3, summary'));}
  function probe() {
    if(book!=='TheScore')return core.inspect(raw(),book)||core.inspect(document.body.innerText,book);
    if(!/\/competition\/nfl\/event\/[^/]+\/?$/i.test(location.pathname)||location.hostname!=='sportsbook.thescore.bet')return null;
    const candidates=new Set();
    for(const h of list(root(),'h1').filter(visible)){const e=core.eventName(text(h));if(e)candidates.add(e);}
    for(const d of list(root(),'details').filter(x=>visible(x)&&core.describe(summaryTitle(x)))) {
      for(const l of lines(d.innerText)){const e=core.eventName(l);if(e)candidates.add(e);}
      // A closed drawer can still carry an exact event header in its scoped DOM.
      for(const child of list(d,'h1,h2,h3,header,div,span')){const e=core.eventName(text(child));if(e)candidates.add(e);}
    }
    // Later prop tabs may omit the hero; only reuse the same-event caller's identity.
    if(!candidates.size && request.event && startUrl.pathname===request.path)candidates.add(core.eventName(request.event));
    const event=candidates.size===1?[...candidates][0]:'';
    const status=list(root(),'[data-testid="event-status"], [data-testid="scoreboard"], [data-testid="event-scoreboard"]').filter(visible).map(text).join(' ');
    const invalid=/\b(?:LIVE|Halftime|Final|Finished|Overtime)\b|\b(?:Q[1-4]|[1-4]Q)\b|\b[1-4](?:st|nd|rd|th) Quarter\b/i.test(status);
    return {recognized:true,event,pregame:!invalid,reason:invalid?'Selected game is live/finished':!event?'No unique NFL event header':''};
  }
  const initial=probe();
  if(!initial)return {recognized:false};
  const diagnostics={version:(book==='FanDuel'||book==='DraftKings')?'20261012_nav4':'20261012_1',book,event:initial.event,tab:request.tab||'',clickedTabs:[],openedDrawers:[],unpricedDrawers:[],unavailableTabs:[],notes:[]};
  if(book==='FanDuel')diagnostics.header=initial.headerDiagnostics||null;
  const result=(extra={})=>({recognized:true,...initial,diagnostics,...extra});
  if(!initial.event||!initial.pregame)return result({stopped:initial.reason||'Unsafe event context',records:[]});
  const event=initial.event;
  if(request.origin&&request.origin!==location.origin)return result({stopped:'Origin changed',records:[]});
  if(request.event&&event!==request.event)return result({stopped:'Selected event changed',records:[]});
  function sameContext() {
    const u=url();
    if(u.origin!==startUrl.origin||u.pathname!==startUrl.pathname||request.path&&u.pathname!==request.path) {
      diagnostics.contextFailure={reason:'Source event URL changed',originChanged:u.origin!==startUrl.origin,pathChanged:u.pathname!==startUrl.pathname};
      return false;
    }
    const p=probe();
    if(!p||p.event!==event||!p.pregame) {
      diagnostics.contextFailure={reason:!p?'Selected-game header unavailable':p.event!==event?'Selected event changed':p.reason||'Pregame status unavailable',
        event:p?.event||'',pregame:!!p?.pregame,...(book==='FanDuel'?{header:p?.headerDiagnostics||null}:{})};
      return false;
    }
    return true;
  }
  function safeControl(el) {
    if(!visible(el)||el.disabled||el.getAttribute('aria-disabled')==='true'||el.closest(excluded))return false;
    const own=[el.getAttribute('data-testid'),el.className,el.getAttribute('data-test-id')].join(' ');
    if(/(?:outcome|selection|add.to.bet|place.bet)/i.test(own)||el.hasAttribute('data-type'))return false;
    const t=text(el);if(!t||t.length>130||/(?:^|\s)[+-]\d{3,}(?:\s|$)/.test(t))return false;
    return true;
  }
  function safeLink(el) {
    const a=el.closest('a');if(!a)return true;
    try {
      const u=new URL(a.getAttribute('href'),location.href);
      if(u.origin!==startUrl.origin||u.pathname!==startUrl.pathname)return false;
      for(const [k,v]of startUrl.searchParams)if(!/^(tab|market|category|subcategory|activeTab)$/i.test(k)&&u.searchParams.get(k)!==v)return false;
      for(const [k,v]of u.searchParams)if(!/^(tab|market|category|subcategory|activeTab)$/i.test(k)&&startUrl.searchParams.get(k)!==v)return false;
      return true;
    }catch{return false;}
  }
  const selected = el=>el?.getAttribute('aria-selected')==='true'||el?.getAttribute('aria-current')==='page'||el?.getAttribute('data-state')==='active'||/(?:^|[\s_-])(?:selected|active)(?:$|[\s_-])/.test(String(el?.className||''));
  // Adapted from getDraftKingsClickableByExactText / findClickableByExactVisibleText:
  // exact visible labels + bounded clickable ancestors, not just semantic buttons.
  // Unlike the legacy whole-body fallback, require an NFL market-tab group.
  // Observed DraftKings markup supplied by the user on 2026-10-13.
  // Native event anchors are authoritative; do not infer their tablist from its
  // height or reject it merely because an unrelated ancestor has aria-expanded.
  let dkSelectedNonCoreTab = false;
  function draftKingsObservedTabs() {
    const selector = 'a[role="tab"][data-testid="tab-switcher-tab-inner"][href]';
    const slugs = {'popular':'popular','td scorers':'td-scorers','passing':'passing',
      'receiving':'receiving','rushing':'rushing','game lines':'game-lines'};
    const report = {version:'20261013_1',strategy:'observed-event-tablist',visibilityStrategy:'legacy-rendered-exact-label',
      headerNavigationVersion:'20261018_2',matchedAnchors:0,acceptedTabs:[],rejected:{},rejectionSamples:[],openShadowRoots:0,scanLimited:false};
    const reject = reason => {report.rejected[reason]=(report.rejected[reason]||0)+1;};
    // Include open component roots, but never cross frames or closed roots.
    // Limits keep the discovery bounded on pages with long social/market feeds.
    const roots=[document];let scanned=0;
    for(let i=0;i<roots.length&&i<40;i++) {
      for(const el of roots[i].querySelectorAll('*')) {
        if(++scanned>20000){report.scanLimited=true;break;}
        if(el.shadowRoot&&!roots.includes(el.shadowRoot))roots.push(el.shadowRoot);
      }
      if(report.scanLimited)break;
    }
    if(roots.length>40){report.scanLimited=true;roots.length=40;}
    report.openShadowRoots=roots.length-1;
    const groups=new Map();
    for(const scope of roots)for(const el of scope.querySelectorAll(selector)) {
      report.matchedAnchors++;
      const group=el.closest('.tab-switcher-tabs[role="tablist"]');
      if(!group){reject('outside-observed-tablist');continue;}
      const visual=dkTabVisual(el);
      const reason=visual.reason || (el.closest(excluded)?'excluded-region':el.disabled||el.getAttribute('aria-disabled')==='true'?'disabled-control':!safeControl(el)?'unsafe-control':'');
      if(reason){
        reject(reason);
        if(report.rejectionSamples.length<8) {
          const {node,...details}=visual;
          report.rejectionSamples.push({label:text(el).slice(0,80),...details,reason,...(typeof node==='string'?{ancestor:node}:{})});
        }
        continue;
      }
      let dest;
      try{dest=new URL(el.getAttribute('href'),location.href);}catch{reject('invalid-link');continue;}
      if(!safeLink(el)||dest.protocol!=='https:'){reject('different-event-or-fixed-query');continue;}
      if(dest.hash!==startUrl.hash){reject('different-fragment');continue;}
      if(dest.searchParams.getAll('category').length!==1||dest.searchParams.get('category')!=='odds'||
        dest.searchParams.getAll('subcategory').length!==1){reject('invalid-category');continue;}
      const label=text(el).toLowerCase(),slug=slugs[label];
      // Retain the selected non-core tab as a stop signal; never visit its link.
      if(el.getAttribute('aria-selected')==='true'&&!slug)dkSelectedNonCoreTab=true;
      if(!slug||dest.searchParams.get('subcategory')!==slug){reject('non-core-or-mismatched-label');continue;}
      if(!el.getAttribute('aria-controls')?.trim()){reject('missing-panel-reference');continue;}
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group).push(el);
    }
    const accepted=[];
    for(const items of groups.values()) {
      // At least three distinct approved peers and one shared panel reference
      // distinguish this market bar from isolated/promotional links.
      const labels=new Set(items.map(el=>text(el).toLowerCase()));
      const panels=new Set(items.map(el=>el.getAttribute('aria-controls').trim()));
      if(labels.size<3||panels.size!==1){reject('inconsistent-tab-group');continue;}
      const byLabel=new Map();let conflict=false;
      for(const el of items) {
        const label=text(el).toLowerCase(),prior=byLabel.get(label);
        if(prior&&new URL(prior.getAttribute('href'),location.href).href!==new URL(el.getAttribute('href'),location.href).href)conflict=true;
        if(!prior||el.getAttribute('aria-selected')==='true')byLabel.set(label,el);
      }
      if(conflict){reject('conflicting-duplicate-label');continue;}
      accepted.push(...byLabel.values());
    }
    report.acceptedTabs=[...new Set(accepted.map(text))];
    diagnostics.tabDiscovery=report;
    return {observed:report.matchedAnchors>0,controls:accepted};
  }
  function draftKingsTabCandidates() {
    const observed=draftKingsObservedTabs();
    // Do not let a loose fallback re-accept a known link rejected by the checks.
    if(observed.observed)return observed.controls;
    diagnostics.tabDiscovery.strategy='legacy-exact-label-fallback';
    const allowed=new Set(core.tabLabels.DraftKings.map(s=>s.toLowerCase()));
    const scope=document.body;
    const leaves=list(scope,'button,a,[role="button"],[role="tab"],li,span,div').filter(el=>
      visible(el)&&!el.closest(excluded)&&allowed.has(text(el).toLowerCase())&&
      !Array.from(el.children).some(c=>text(c).toLowerCase()===text(el).toLowerCase()));
    function tabGroup(el) {
      for(let p=el.parentElement,depth=0;p&&p!==scope&&depth<7;p=p.parentElement,depth++) {
        if(p.closest(excluded)||p.closest('details,[aria-expanded]'))return null;
        const r=p.getBoundingClientRect();
        if(r.height>210||text(p).length>900)break;
        const found=new Set(list(p,'button,a,[role="button"],[role="tab"],li,span,div')
          .filter(visible).map(text).map(t=>t.toLowerCase()).filter(t=>allowed.has(t)));
        if(found.size>=3)return p;
      }
      return null;
    }
    const out=[];
    for(const leaf of leaves) {
      const group=tabGroup(leaf);if(!group)continue;
      let control=leaf;
      for(let p=leaf;p&&p!==group;p=p.parentElement) {
        if(text(p).toLowerCase()!==text(leaf).toLowerCase())break;
        if(p.matches('button,a,[role="button"],[role="tab"],[tabindex]')||typeof p.onclick==='function'||
          /(?:tabbed-subheader|tabbed-header|tab-item|tabs__tab)/i.test(String(p.className||''))) {control=p;break;}
      }
      const rect=control.getBoundingClientRect();
      if(rect.width>520||rect.height>140||!safeControl(control)||!safeLink(control))continue;
      if(control.closest('details')||control.hasAttribute('aria-expanded'))continue;
      if(!out.includes(control))out.push(control);
    }
    return out;
  }
  let draftKingsTabsCache=null;
  const approvedTabs=book==='BetMGM'?['Players','Spreads','Totals','All']:core.tabLabels[book];
  const tabCandidates=()=>book==='DraftKings'?(draftKingsTabsCache||(draftKingsTabsCache=draftKingsTabCandidates())):list(root(),'[role="tab"], [role="tablist"] a, [role="tablist"] button, a, button, [role="button"]').filter(el=>
    safeControl(el)&&safeLink(el)&&!(book==='BetMGM'&&/^All$/i.test(text(el))&&el.getAttribute('role')!=='tab'&&!el.closest('[role="tablist"]')&&!el.matches('button.ds-pill'))&&!el.closest('details')&&!el.hasAttribute('aria-expanded')&&approvedTabs.some(l=>l.toLowerCase()===text(el).toLowerCase()));
  function findTab(label){
    const candidates=tabCandidates().filter(el=>text(el).toLowerCase()===label.toLowerCase());
    if(book==='FanDuel') {
      const slug={'Popular':'popular','Passing Props':'passing-props','Receiving Props':'receiving-props','Rushing Props':'rushing-props','TD Scorer Props':'td-scorer-props'}[label];
      return candidates.find(el=>el.tagName==='A'&&el.hasAttribute('href')&&new URL(el.getAttribute('href'),location.href).searchParams.get('tab')===slug);
    }
    return candidates.sort((a,b)=>(a.getAttribute('role')==='tab'?-1:0)-(b.getAttribute('role')==='tab'?-1:0))[0];
  }
  function partialTab() {
    if(book==='DraftKings') {
      tabCandidates();
      if(dkSelectedNonCoreTab)return true;
    }
    const partial=list(root(),book==='FanDuel'?'nav [aria-selected="true"], [aria-current="page"], [data-state="active"]':'[role="tab"][aria-selected="true"], [aria-current="page"], [data-state="active"]').filter(visible)
      .find(el=>/^(?:1st|2nd|3rd|4th|First|Second|Third|Fourth) (?:Half|Quarter)(?: Props)?$|^(?:Halves|Quarters|Live)$/i.test(text(el)));
    if(partial)diagnostics.contextFailure={reason:'Selected partial-period or live tab',label:text(partial)};
    return !!partial;
  }
  function controlSelected(control) {
    if(!control)return false;
    if(selected(control)||list(control,'[aria-selected="true"],[aria-current="page"]').length)return true;
    for(let p=control.parentElement,depth=0;p&&depth<3;p=p.parentElement,depth++) {
      if(text(p).toLowerCase()!==text(control).toLowerCase())break;
      if(selected(p))return true;
    }
    return false;
  }
  function tabActive(label,control) {
    if(book==='DraftKings'&&control?.matches('a[role="tab"][data-testid="tab-switcher-tab-inner"]')) {
      // A URL change alone can precede React rendering the new tab content.
      // Wait for the actual selected tab, and require agreement with its slug.
      if(control.getAttribute('aria-selected')!=='true')return false;
      const dest=new URL(control.getAttribute('href'),location.href),current=url();
      const sub=current.searchParams.get('subcategory');
      return (!current.searchParams.has('category')||current.searchParams.get('category')==='odds')&&
        (sub===null?dest.searchParams.get('subcategory')==='popular':sub===dest.searchParams.get('subcategory'));
    }
    if(controlSelected(control))return true;
    const link=control?.closest('a[href]');
    if(link) {
      const dest=new URL(link.getAttribute('href'),location.href);
      const navKeys=['tab','market','category','subcategory','activeTab'];
      const hasKey=navKeys.some(k=>dest.searchParams.has(k));
      if(hasKey&&dest.href===url().href)return true;
    }
    return false;
  }
  function tabInfo(label) {
    const control=label?findTab(label):null;
    const a=control?.closest('a[href]');
    return {label:label||'',found:!!control,active:!!control&&tabActive(label,control),
      href:a&&safeLink(a)?new URL(a.getAttribute('href'),location.href).href:'',
      control:control?{tag:control.tagName,role:control.getAttribute('role')||'',className:String(control.className||'').slice(0,160)}:null};
  }
  const tabsNow=()=>[...new Set(tabCandidates().map(text))];
  const activeTab=()=>tabsNow().find(l=>tabActive(l,findTab(l)))||'';
  if(request.mode==='probe')return result({path:startUrl.pathname,origin:startUrl.origin,href:startUrl.href,tabs:tabsNow(),activeTab:activeTab()});
  if(['tab-state','plan-tab','activate-tab'].includes(request.mode)) {
    const wanted=approvedTabs.find(l=>l.toLowerCase()===String(request.tab||'').toLowerCase());
    if(!wanted)return result({stopped:'Unapproved tab label',records:[]});
    const info=tabInfo(wanted);
    const state={path:startUrl.pathname,origin:startUrl.origin,href:startUrl.href,tabs:tabsNow(),activeTab:activeTab(),navigation:info,ready:info.active&&!partialTab()};
    if(partialTab())return result({...state,stopped:'Selected half/quarter/live tab; not a full-game capture',records:[]});
    if(request.mode!=='activate-tab'||!info.found||info.active)return result(state);
    // Return before activation, as the older scheduled-click workflows do.
    // The extension worker, not this document, owns the wait and next injection.
    window.setTimeout(()=>{
      try {
        draftKingsTabsCache=null;
        const fresh=findTab(wanted);
        if(fresh&&sameContext()&&safeControl(fresh)&&safeLink(fresh)&&!tabActive(wanted,fresh)) {
          const visual=book==='DraftKings'?dkTabVisual(fresh).node:null;
          (visual?.scrollIntoView?visual:fresh).scrollIntoView({block:'center',inline:'nearest'});
          fresh.click(); // One activation; never also dispatch a synthetic click.
        }
      } catch(error) { console.warn('NFL scheduled tab activation failed:',error); }
    },100);
    return result({...state,navigationScheduled:true});
  }
  if(request.captureOnly&&request.tab&&!tabInfo(request.tab).active)
    return result({records:[],retryable:true,diagnostics:{...diagnostics,notes:['Requested tab is not active yet']}});
  if(request.tab&&!request.captureOnly) {
    const wanted=approvedTabs.find(l=>l.toLowerCase()===request.tab.toLowerCase());
    if(!wanted)return result({stopped:'Unapproved tab label',records:[]});
    let control=findTab(wanted);
    if(!control){diagnostics.unavailableTabs.push(wanted);return result({records:[]});}
    if(!selected(control)) {
      const before=raw(),previousUrl=location.href;
      control.scrollIntoView({block:'center',inline:'nearest'});
      if(!sameContext()||!safeControl(control)||!safeLink(control))return result({stopped:'Page changed before tab click',records:[]});
      control.click();diagnostics.clickedTabs.push(wanted); // ONE activation, never two click events.
      let activated=false;
      for(let n=0;n<24;n++) {
        await wait(150);if(!sameContext())return result({stopped:'Page changed after tab click',records:[]});
        control=findTab(wanted);
        const confirmed=book==='FanDuel' ? selected(control) || (control?.hasAttribute('href') && url().searchParams.get('tab')===new URL(control.getAttribute('href'),location.href).searchParams.get('tab')) : selected(control)||location.href!==previousUrl||raw()!==before;
        if(confirmed){activated=true;break;}
      }
      if(!activated){diagnostics.notes.push('Tab activation was not verified');return result({records:[]});}
      await wait(500);
    }
  }
  if(partialTab())return result({stopped:'Selected half/quarter/live tab; not a full-game capture',records:[]});
  function headerTitle(el) {
    if(book==='BetMGM'&&el.matches('button[dsaccordiontoggle]'))return text(el.querySelector('[slot="title"]'));
    if(el.tagName==='SUMMARY')return text(el.querySelector('h2,h3'))||text(el);
    return text(el.querySelector('h2,h3,[data-testid="market-name"],.sportsbook-market-accordion__title'))||text(el);
  }
  const headerSelector='summary, button[aria-expanded], [role="button"][aria-expanded], [aria-controls][aria-expanded], .sportsbook-market-accordion__header, [class*="accordion-header" i], [data-testid="market-header"]';
  function headers(){
    if(book==='BetMGM')return list(root(),'button[dsaccordiontoggle][aria-controls][aria-expanded]').filter(el=>safeControl(el)&&core.describe(headerTitle(el)));
    const regular=list(root(),headerSelector).filter(el=>safeControl(el)&&safeLink(el)&&core.describe(headerTitle(el)));
    if(book!=='DraftKings')return regular;
    const extra=list(root(),'.sportsbook-market-accordion__title, .sportsbook-event-accordion__title, h2, h3, [role="heading"]');
    for(const label of extra) {
      if(!visible(label)||label.closest(excluded)||!core.describe(text(label)))continue;
      const control=label.closest('button,summary,[role="button"],[aria-expanded],.sportsbook-market-accordion__header,.sportsbook-event-accordion__header');
      if(control&&safeControl(control)&&safeLink(control)&&core.describe(headerTitle(control))&&!regular.includes(control))regular.push(control);
    }
    return regular.filter(el=>!regular.some(other=>other!==el&&other.contains(el)&&headerTitle(other)===headerTitle(el)));
  }
  function findHeader(label){return headers().find(el=>headerTitle(el)===label);}
  function containerFor(el) {
    if(!el)return null;
    const d=el.closest('details');if(d)return d;
    // The observed FD accordion has several header-only wrappers. Its prices
    // first occur above all of them, not on a fixed parent or CSS class.
    if(book==='FanDuel') {
      for(let p=el.parentElement,depth=0;p&&p!==root()&&depth<9;p=p.parentElement,depth++) {
        if(p.closest(excluded))return null;
        // Count ALL accordion controls, including unsupported markets: never
        // borrow prices from a neighbouring player or an alternate/period market.
        const hs=list(p,headerSelector).filter(visible);
        if(hs.length!==1||hs[0]!==el)return null;
        const outcomes=list(p,'button,[role="button"]').filter(x=>!x.hasAttribute('aria-expanded')&&!el.contains(x)&&visible(x));
        if(outcomes.length && outcomes.some(x=>core.priceIn(x.innerText)!==null || x.disabled || x.getAttribute('aria-disabled')==='true'))return p;
      }
      return null;
    }
    const controls=el.getAttribute('aria-controls');
    if(controls) {const target=document.getElementById(controls);if(target&&root().contains(target)&&!target.closest(excluded))return target;}
    if(book==='DraftKings') {
      // A heading can sit several wrappers below its sibling price panel. Never
      // stop at a fixed parent depth: it can produce heading-only raw samples.
      // Count unsupported and nested controls too, so a missing panel cannot
      // borrow a neighbour's prices (including a half/quarter market).
      for(let p=el.parentElement,depth=0;p&&p!==root()&&depth<9;p=p.parentElement,depth++) {
        if(p.closest(excluded))return null;
        const neighbours=list(p,headerSelector).filter(x=>visible(x)&&x!==el&&!x.contains(el)&&!el.contains(x));
        if(neighbours.length)return null;
        if(p.matches('.cms-expander-container,.sportsbook-market-accordion,.sportsbook-event-accordion'))return p;
        const prices=list(p,'table,[data-type],[data-testid*="outcome" i],[class*="outcome" i]')
          .some(x=>!el.contains(x));
        if(prices)return p;
      }
      return null;
    }
    const component=el.closest('.sportsbook-market-accordion,.sportsbook-event-accordion');if(component)return component;
    let p=el.parentElement;
    for(let n=0;p&&p!==root()&&n<5;n++,p=p.parentElement){
      if(p.closest(excluded))return null;
      const count=list(p,headerSelector).filter(x=>core.describe(headerTitle(x))).length;
      if(count>1)return null;
      if(list(p,'table, [data-type], [data-testid*="outcome" i], [class*="outcome" i]').length)return p;
      if(n===1&&count===1)return p;
    }
    return null;
  }
  function readable(el) {
    if(!el)return '';
    // FanDuel uses aria-hidden for VISIBLY RENDERED column labels. innerText
    // keeps those labels while omitting display:none / visibility:hidden text.
    if(book==='FanDuel')return String(el.innerText||'');
    function walk(n) {
      if(n.nodeType===Node.TEXT_NODE)return n.nodeValue;
      if(n.nodeType!==Node.ELEMENT_NODE)return '';
      const e=n,s=getComputedStyle(e);
      if(e.hidden||e.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||e.matches(excluded))return '';
      if(s.display!=='contents'&&e.checkVisibility&&!e.checkVisibility({opacityProperty:true,visibilityProperty:true}))return '';
      const closed=e.closest('details:not([open])');
      if(closed&&closed!==e&&!closed.querySelector('summary')?.contains(e))return '';
      const block=/^(?:block|flex|grid|table-row|table-cell|table-caption|list-item)$/.test(s.display)||e.tagName==='BR';
      const value=Array.from(e.childNodes).map(walk).join(' ');return block?'\n'+value+'\n':value;
    }
    return walk(el);
  }
  function tablesIn(container) {
    return list(container,'table').map(table=>{
      const hs=list(table,'thead th');
      if(!hs.length||hs.some(x=>Number(x.colSpan||1)!==1||Number(x.rowSpan||1)!==1))return {headers:[],rows:[]};
      const headers=hs.map(x=>clean(readable(x))),rows=[];
      for(const tr of list(table,'tbody tr')) {
        const all=list(tr,':scope > th, :scope > td');
        if(all.some(x=>Number(x.colSpan||1)!==1||Number(x.rowSpan||1)!==1))continue;
        let cells=all,name='';
        if(all.length===headers.length && headers[0]===''){name=clean(readable(all[0]));cells=all.slice(1);}
        else if(all.length===headers.length+1){name=clean(readable(all[0]));cells=all.slice(1);}
        else continue;
        rows.push({name:lines(name)[0]||'',cells:cells.map(c=>({text:readable(c),locked:!!c.querySelector('[disabled], [aria-disabled="true"]')}))});
      }
      return {headers:headers[0]===''?headers.slice(1):headers,rows};
    });
  }
  function fanDuelMain(container) {
    // Observed layout: two name labels in a left column, two separate groups
    // of three outcome buttons in a right column, labelled Spread/Money/Total.
    // Locked buttons stay in position; no missing cell can shift other prices.
    const heading=list(container,'[role="heading"]').find(el=>
      core.lines(el.innerText).map(x=>x.toLowerCase()).join('|')==='spread|money|total');
    if(!heading)return [];
    const names=list(container,'[role="text"]').filter(visible).map(x=>core.team(x.innerText)).filter(Boolean);
    const [away,home]=event.split(' @ ');
    if(names.length!==2||names[0]!==away||names[1]!==home)return [];
    const buttons=list(container,'button,[role="button"]').filter(el=>
      !el.hasAttribute('aria-expanded')&&!el.closest('nav')&&visible(el)&&
      !list(container,headerSelector).some(h=>h.contains(el)));
    if(buttons.length!==6)return [];
    const groups=[];
    for(const button of buttons) {
      const group=button.parentElement;
      if(!groups.includes(group))groups.push(group);
    }
    if(groups.length!==2||groups.some(g=>buttons.filter(b=>b.parentElement===g).length!==3))return [];
    return core.parseMainTable(event,{headers:['Spread','Money','Total'],rows:groups.map((group,i)=>({
      name:names[i],cells:buttons.filter(b=>b.parentElement===group).map(b=>({
        text:readable(b),locked:!!b.disabled||b.getAttribute('aria-disabled')==='true'||!!b.querySelector('[disabled],[aria-disabled="true"]')
      }))
    }))});
  }
  function readMarket(label,container) {
    const d=core.describe(label);if(!d||!container)return [];
    if(book==='DraftKings'&&d.type!=='main'&&container.querySelector('[data-testid="market-template"]')) {
      // Observed CMS O/U grid: each template owns one player link and its
      // outcome buttons. Stats counters contain every animated digit, so never
      // infer player/line/price associations from the flattened grid text.
      const qs=[],owner=container.closest('.cms-expander-container');
      for(const template of list(container,'[data-testid="market-template"]')) {
        if(!visible(template)||template.closest(excluded)||template.closest('.cms-expander-container')!==owner)continue;
        const players=list(template,'[data-testid="player-page-link"]').filter(visible);
        if(players.length!==1)continue;
        const name=core.player(text(players[0].querySelector('p')||players[0]));
        if(!name||(d.name&&d.name!==name))continue;
        for(const button of list(template,'button.cb-market__button')) {
          if(!visible(button)||button.disabled||button.getAttribute('aria-disabled')==='true')continue;
          const fields=['button-title-market-board','button-points-market-board','button-odds-market-board']
            .map(id=>button.querySelector(`[data-testid="${id}"]`));
          if(!fields.every(visible))continue;
          const side=text(fields[0]),line=text(fields[1]),price=core.odds(text(fields[2]));
          if(!/^(O|U|Over|Under)$/i.test(side)||!/^\d+(?:\.\d+)?$/.test(line)||price===null)continue;
          qs.push(core.quote(d.type,name,/^u/i.test(side)?'Under':'Over',Number(line),price));
        }
      }
      // Do not let a raw fallback reinterpret hidden, locked or missing cells.
      return core.validQuotes(qs,event);
    }
    if(d.type==='main') {
      if(book==='FanDuel')return fanDuelMain(container);
      let qs=[];for(const t of tablesIn(container))qs.push(...core.parseMainTable(event,t));
      if(!qs.length&&book!=='TheScore')qs=core.parseMain(book,event,readable(container));
      return core.validQuotes(qs,event);
    }
    let qs=core.parsePropText(label,readable(container));
    if(book==='FanDuel' && d.name) {
      // Prefer button-level O/U labels when available; never activate them.
      const controls=list(container,'button,[role="button"]').filter(el=>visible(el)&&!el.hasAttribute('aria-expanded'));
      const structured=[];
      for(const b of controls) {
        if(b.disabled||b.getAttribute('aria-disabled')==='true'||b.querySelector('[disabled],[aria-disabled="true"]'))continue;
        const labelText=clean(readable(b)),price=core.priceIn(labelText);
        const sides=[...labelText.matchAll(/(?:^|\s)(Over|Under|O|U)\s*(\d+(?:\.\d+)?)(?=\s|$)/gi)];
        const values=[...new Map(sides.map(m=>[m[1][0].toUpperCase()+'|'+m[2],m])).values()];
        if(price===null||values.length!==1)continue;
        const m=values[0];structured.push(core.quote(d.type,d.name,/^u/i.test(m[1])?'Under':'Over',Number(m[2]),price));
      }
      // Do not let a raw-text fallback reinterpret disabled or missing cells.
      if(controls.length)qs=structured;
    }
    if(d.type==='player_touchdowns')for(const t of tablesIn(container))qs.push(...core.tdTable(t));
    return core.validQuotes(qs,event);
  }
  async function settled(label) {
    let qs=[],previous='',matches=0;
    for(let n=0;n<(book==='FanDuel'?8:16);n++) {
      if(!sameContext()||partialTab())return [];
      qs=readMarket(label,containerFor(findHeader(label)));
      const now=JSON.stringify(qs);
      matches=qs.length&&now===previous?matches+1:0;
      if(matches>=(book==='FanDuel'?1:2))return qs;previous=now;await wait(150);
    }
    return qs;
  }
  const records=[];
  const boundedBook=book==='FanDuel'||book==='DraftKings'||book==='BetMGM';
  const marketDeadline=Date.now()+(boundedBook?10000:35000);
  const targetTypes=request.targetTypes?.length?new Set(request.targetTypes):null;
  const already=new Set(boundedBook&&Array.isArray(request.processedLabels)?request.processedLabels:[]);
  const pending=[...new Set(headers().map(headerTitle))].filter(label=>{
    if(already.has(label))return false;
    const d=core.describe(label);
    if(book==='FanDuel') {
      // Popular contains a long catch-all list. Capture main lines there, then
      // move to the ACTUAL football tabs instead of timing out on that list.
      const tab=request.tab||'Popular';
      if(tab==='Popular'&&d.type!=='main')return false;
      if(tab==='Passing Props'&&!d.type.startsWith('player_passing'))return false;
      if(tab==='Receiving Props'&&!['player_receiving_yards','player_receptions','player_rushing_receiving_yards'].includes(d.type))return false;
      if(tab==='Rushing Props'&&!d.type.startsWith('player_rushing'))return false;
      if(tab==='TD Scorer Props'&&d.type!=='player_touchdowns')return false;
    }
    if(!targetTypes)return true;
    return d.type==='main'?[...targetTypes].some(t=>['spread','total','moneyline_2way'].includes(t)):targetTypes.has(d.type);
  });
  const wanted=boundedBook?pending.slice(0,4):pending;
  const processedLabels=[];
  if(!wanted.length)diagnostics.notes.push('No safely identifiable market headings on this tab');
  for(const label of wanted) {
    if(Date.now()>marketDeadline){diagnostics.notes.push('Per-tab time limit reached; capture is partial');break;}
    if(!sameContext()||partialTab())return result({stopped:'Context changed while loading markets',records:[]});
    let h=findHeader(label);if(!h){diagnostics.unpricedDrawers.push(label);if(boundedBook)processedLabels.push(label);continue;}
    const d=h.closest('details'),open=d?d.open:h.getAttribute('aria-expanded')==='true';
    if(!open) {
      if(!safeControl(h)||!safeLink(h))continue;
      h.scrollIntoView({block:'center',inline:'nearest'});h.click();diagnostics.openedDrawers.push(label);await wait(200);
    }
    let qs=await settled(label);
    for(let round=0;round<4;round++) {
      if(!sameContext())break;
      const block=containerFor(findHeader(label));
      const more=list(block,'button,[role="button"],a').find(el=>safeControl(el)&&safeLink(el)&&/^(?:Show more|See more|Show all|See all|Load more)(?:\s*\(\d+\))?$/i.test(text(el)));
      if(!more)break;
      const before=readable(block);more.click();await wait(450);qs=await settled(label);
      if(readable(containerFor(findHeader(label)))===before)break;
    }
    const block=containerFor(findHeader(label));
    const morePending=list(block,'button,[role="button"],a').some(el=>safeControl(el)&&safeLink(el)&&/^(?:Show more|See more|Show all|See all|Load more)(?:\s*\(\d+\))?$/i.test(text(el)));
    if(!qs.length||morePending) {
      diagnostics.unpricedDrawers.push(label);
      if(morePending)diagnostics.notes.push(`Expansion limit or unchanged content: ${label}; drawer remains incomplete`);
      // Keep only the scoped market/control, not the account or page shell.
      if(book==='BetMGM'||book==='DraftKings') {
        diagnostics.unpricedSamples ||= [];
        if(diagnostics.unpricedSamples.length<4)diagnostics.unpricedSamples.push({title:label,
          containerFound:!!block,control:findHeader(label)?.outerHTML?.slice(0,1200)||'',rawSample:readable(block).slice(0,2500),
          ...(book==='DraftKings'?{readerVersion:'20261019_1',
            // Rendered text distinguishes scope selection from walker filtering;
            // ancestor metadata contains no page/account HTML or text.
            renderedSample:String(block?.innerText||'').slice(0,2500),
            ancestors:(()=>{const out=[];for(let p=findHeader(label)?.parentElement;p&&p!==root()&&out.length<9;p=p.parentElement){
              if(p.closest(excluded))break;
              out.push({tag:p.tagName,className:String(p.className||'').slice(0,180),id:p.id,
                headers:list(p,headerSelector).length,tables:list(p,'table').length,selected:p===block});
              if(p===block)break;
            }return out;})()}: {})});
      }
    }
    records.push({book,event,period:'full_game',title:label,quotes:qs,rawSample:readable(block).slice(0,2500)});
    if(boundedBook)processedLabels.push(label);
  }
  // Some DK/FD game tables are not accordions. Read only the current event's Game Lines section.
  if(!records.some(r=>core.describe(r.title)?.type==='main')&&book!=='TheScore'&&book!=='FanDuel'&&(!targetTypes||[...targetTypes].some(t=>['spread','total','moneyline_2way'].includes(t)))) {
    const ls=lines(raw());
    const i=ls.findIndex((l,j)=>/^(?:Game|Game Lines)$/i.test(l)&&/^Spread$/i.test(ls[j+1]||''));
    if(i>=0)records.push({book,event,period:'full_game',title:'Game Lines',quotes:core.parseMain(book,event,ls.slice(i,i+35).join('\n'))});
  }
  if(!sameContext()||partialTab())return result({stopped:'Context changed before capture completed',records:[]});
  diagnostics.quotedRows=records.reduce((s,r)=>s+r.quotes.length,0);
  diagnostics.availableHeadings=headers().map(headerTitle).slice(0,80);
  return result({records,...(boundedBook?{processedLabels,remaining:pending.some(x=>!processedLabels.includes(x))}: {})});
 } catch(error) {
    return {recognized:true,records:[],stopped:'Page capture exception',diagnostics:{book,
      errorName:String(error?.name||'Error'),errorMessage:String(error?.message||error),
      operation:String(request.mode||'capture'),tab:String(request.tab||'')}};
  }
}

// NFL navigation uses the existing multipass architecture: the extension worker
// owns progress/waits; every capture runs in a fresh document injection.
const NFL_NAVIGATION_VERSION='20261018_2';
// Progress contains drawer identities, not prices. Retain it for this exact event
// until an explicit refresh, rather than dropping unfinished work after 15 minutes.
function nflNavCheckpoint(action,base,value) {
  if(location.origin!==base.origin||location.pathname!==base.path)return null;
  const key=`EV_NFL_CAPTURE_PROGRESS_V4::${base.book}::${base.path}`;
  try {
    if(action==='read')return JSON.parse(sessionStorage.getItem(key)||'null');
    if(action==='write'){sessionStorage.setItem(key,JSON.stringify(value));return true;}
  } catch { return null; }
  return null;
}
function nflSameEventUrl(value,base) {
  try {
    const u=new URL(value),b=new URL(base.href||base.origin+base.path);
    if(u.protocol!=='https:'||u.origin!==base.origin||u.pathname!==base.path)return false;
    const fixed=url=>[...url.searchParams].filter(([k])=>!/^(tab|market|category|subcategory|activeTab)$/i.test(k)).sort();
    return JSON.stringify(fixed(u))===JSON.stringify(fixed(b));
  }catch{return false;}
}
function nflSafeDestination(href,base,book,label) {
  if(!nflSameEventUrl(href,base))return false;
  if(book==='FanDuel') {
    const slugs={'Popular':'popular','Passing Props':'passing-props','Receiving Props':'receiving-props','Rushing Props':'rushing-props','TD Scorer Props':'td-scorer-props'};
    return new URL(href).searchParams.get('tab')===slugs[label];
  }
  if(book==='DraftKings') {
    const u=new URL(href);
    if(u.searchParams.has('category')||u.searchParams.has('subcategory')) {
      const slugs={'POPULAR':'popular','TD SCORERS':'td-scorers','PASSING':'passing',
        'RECEIVING':'receiving','RUSHING':'rushing','GAME LINES':'game-lines'};
      return u.searchParams.getAll('category').length===1&&u.searchParams.get('category')==='odds'&&
        u.searchParams.getAll('subcategory').length===1&&!!slugs[label]&&u.searchParams.get('subcategory')===slugs[label];
    }
  }
  return true;
}
function nflCheckpointMatches(saved,base,targets,now=Date.now()) {
  return saved&&saved.version===NFL_NAVIGATION_VERSION&&typeof saved.incomplete==='boolean'&&saved.returnedPartial===true&&saved.event===base.event&&
    saved.origin===base.origin&&saved.path===base.path&&saved.book===base.book&&
    Number.isFinite(saved.updatedAt)&&saved.updatedAt<=now;
}
async function nflNavInject(tabId,func,args) {
  try {
    const results=await chrome.scripting.executeScript({target:{tabId},func,args});
    const item=results?.find(r=>r.frameId===0)||results?.[0];
    if(!item||!Object.prototype.hasOwnProperty.call(item,'result'))
      return {ok:false,error:String(item?.error?.message||'No result returned by current document')};
    return {ok:true,value:item.result,documentId:item.documentId||''};
  } catch(error) {return {ok:false,error:String(error?.message||error).slice(0,500)};}
}
async function tryNflNavigationCapture(tabId,book) {
  if(nflV2ActiveRuns.has(tabId))return {source:book,text:'',message:'A capture is already running in this tab.'};
  nflV2ActiveRuns.add(tabId);
  const chunks=[`NFL_CAPTURE_VERSION: 20261012_1\nNFL_CAPTURE_BOOK: ${book}\nSport: NFL\nNFL_NAVIGATION_VERSION: ${NFL_NAVIGATION_VERSION}`];
  if(book==='FanDuel')chunks.push('FANDUEL_NFL_LAYOUT_VERSION: 20261012_2\nFANDUEL_NFL_HEADER_VERSION: 20261012_3');
  if(book==='DraftKings')chunks.push('DRAFTKINGS_NFL_TABS_VERSION: 20261013_1\nDRAFTKINGS_NFL_HEADER_NAV_VERSION: 20261018_2');
  const diag=details=>chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,...details}));
  const response=()=>({source:book,text:chunks.join('\n\n')});
  try {
    let first;
    for(let n=0;n<4;n++) {
      first=await nflNavInject(tabId,nflDetailPageStep,[book,{mode:'probe'}]);
      if(first.ok&&first.value?.recognized&&first.value?.event)break;
      if(n<3)await sleepBackground(400);
    }
    const probe=first?.value;
    if(!probe?.recognized) {
      const tab=await chrome.tabs.get(tabId);
      const explicitNfl=/\/(?:football\/nfl|competition\/nfl\/event)(?:\/|$)/i.test(String(tab.url||''))||/\bNFL\b/i.test(String(tab.title||''));
      if(!explicitNfl&&first?.ok)return null;
      diag({stopped:'NFL page could not be verified; no other-sport fallback',operation:'probe',error:first?.error||'',reason:probe?.reason||''});return response();
    }
    if(!probe.event||!probe.pregame) {
      diag({stopped:probe.stopped||probe.reason||'No safe NFL event',operation:'probe',event:probe.event||'',header:probe.headerDiagnostics||null});return response();
    }
    const base={book,event:probe.event,origin:probe.origin,path:probe.path,href:probe.href};
    if(!nflSameEventUrl(base.href,base)){diag({stopped:'Unsupported event URL'});return response();}
    const snapshot=await readCoverageSnapshotFromAppTab();
    const external=typeof captureDemandFor==='function'?captureDemandFor(tabId):null;
    const demand=typeof resolveCaptureDemand==='function'?resolveCaptureDemand(snapshot,{book,sport:'NFL',event:base.event},{refresh:external?.mode==='refresh'}):{mode:'initial',targets:nflMissingTypes(snapshot,book,base.event)};
    const stored=await nflNavInject(tabId,nflNavCheckpoint,['read',base]);
    const saved=stored.ok?stored.value:null;
    const resume=demand.mode!=='refresh'&&nflCheckpointMatches(saved,base,demand.targets);
    const completed=new Set(resume?saved.completed||[]:[]);
    const priorTabs=resume?(saved.tabs||nflTabsForTypes(book,saved.targets||[])):[];
    const unfinished=priorTabs.filter(t=>!completed.has(t));
    const targets=demand.mode==='refresh'?[]:resume&&unfinished.length?([...new Set([...(saved.targets||[]),...demand.targets])]):demand.targets;
    const requested=demand.mode==='missing'?nflTabsForTypes(book,demand.targets):demand.mode==='initial'&&!resume||demand.mode==='refresh'?nflTabsForTypes(book,[]):[];
    const tabs=[...new Set([...requested,...unfinished])];
    // App demand is authoritative for newly missing markets, even if an older
    // run marked that category complete. Keep priced drawers only on unfinished tabs.
    for(const t of requested)completed.delete(t);
    const processedByTab=resume&&saved.processedByTab&&typeof saved.processedByTab==='object'?saved.processedByTab:{};
    for(const t of requested)if(!unfinished.includes(t))delete processedByTab[t];
    const checkpoint={version:NFL_NAVIGATION_VERSION,...base,targets,tabs,completed:[...completed],processedByTab,
      incomplete:true,returnedPartial:false,updatedAt:Date.now()};
    async function saveProgress() {
      checkpoint.completed=[...completed];checkpoint.updatedAt=Date.now();
      const r=await nflNavInject(tabId,nflNavCheckpoint,['write',base,checkpoint]);
      if(!r.ok||r.value!==true)diag({phase:'checkpoint',note:'Progress could not be saved; current capture remains in memory'});
    }
    chunks.push('NFL_CAPTURE_RUN: '+JSON.stringify({book,event:base.event,mode:!tabs.length?'nothing-missing':resume&&unfinished.length?'resume-incomplete':demand.mode==='refresh'?'refresh':targets.length?'missing-markets':tabs.length?'full-core-markets':'nothing-missing',targets,completedTabs:[...completed]}));
    const todo=tabs.filter(t=>!completed.has(t));
    let fatal=false;
    const incomplete=[];
    async function currentTabGuard() {
      let t;try{t=await chrome.tabs.get(tabId);}catch{return {error:'Source tab closed'};}
      if(!nflSameEventUrl(t.url,base)||t.pendingUrl&&!nflSameEventUrl(t.pendingUrl,base))return {error:'Source event URL changed; capture stopped'};
      return {tab:t};
    }
    function fatalPage(r) {
      return !!(r?.event&&r.event!==base.event)||/live\/finished|live or finished|conflicting|Selected event changed|Origin changed|Page capture exception/i.test(String(r?.stopped||r?.reason||''));
    }
    async function waitForTab(label) {
      let stable=0,last,errors=0;
      for(let poll=0;poll<32;poll++) {
        const guard=await currentTabGuard();if(guard.error)return {fatal:guard.error};
        if(guard.tab.status==='loading'){stable=0;await sleepBackground(400);continue;}
        last=await nflNavInject(tabId,nflDetailPageStep,[book,{...base,mode:'tab-state',tab:label}]);
        if(!last.ok){errors++;stable=0;await sleepBackground(400);continue;}
        const r=last.value;
        if(fatalPage(r))return {fatal:r.stopped||r.reason||'Selected event changed',details:r.diagnostics};
        if(r?.recognized&&r.event===base.event&&r.pregame&&r.ready) {
          stable++;if(stable>=2)return {ready:true,state:r,injectionRetries:errors};
        } else stable=0;
        await sleepBackground(400);
      }
      return {error:'Requested tab did not become ready within the bounded wait',details:last?.value?.diagnostics,lastError:last?.error||'',injectionRetries:errors};
    }
    // Preserve the already-working DK main reader even if the live page's
    // tab controls still cannot be resolved. Never replace priced text with
    // a diagnostics-only export merely because navigation discovery failed.
    if(book==='DraftKings'&&!resume&&!probe.tabs?.length) {
      const visibleMain=await nflNavInject(tabId,nflDetailPageStep,[book,{...base,captureOnly:true,tab:'',targetTypes:['spread','total','moneyline_2way']}]);
      if(visibleMain.ok&&!visibleMain.value?.stopped) {
        for(const record of visibleMain.value?.records||[])chunks.push('NFL_MARKET_V2: '+JSON.stringify(record));
        diag({...visibleMain.value?.diagnostics,phase:'visible-main-fallback'});
      }
    }
    for(const label of todo) {
      if(fatal)break;
      await safeShowToast(tabId,`Extracting ${book} NFL…`,`${resume?'Resuming':'Capturing'} ${label}.`,{loading:true,pulse:false});
      const guard=await currentTabGuard();if(guard.error){diag({stopped:guard.error,tab:label});fatal=true;break;}
      let plan;
      for(let attempt=0;attempt<3;attempt++) {
        plan=await nflNavInject(tabId,nflDetailPageStep,[book,{...base,mode:'plan-tab',tab:label}]);
        if(plan.ok&&(plan.value?.navigation?.found||fatalPage(plan.value)))break;
        await sleepBackground(400);
      }
      if(plan.ok&&fatalPage(plan.value)){diag({stopped:plan.value.stopped||plan.value.reason,tab:label,details:plan.value.diagnostics});fatal=true;break;}
      const nav=plan.value?.navigation;
      if(!plan.ok||!nav?.found) {
        diag({tab:label,unavailableTabs:[label],availableTabs:plan.value?.tabs||[],error:plan.error||'',note:'No safe exact-label control in the current event tab group',...(book==='DraftKings'?{tabDiscovery:plan.value?.diagnostics?.tabDiscovery||null}:{})});
        incomplete.push(label);continue;
      }
      checkpoint.pendingTab=label;await saveProgress();
      if(!nav.active) {
        diag({phase:'navigation-requested',tab:label,control:nav.control,method:nav.href&&book==='FanDuel'?'same-event-link':'scheduled-exact-control'});
        if(nav.href&&!nflSafeDestination(nav.href,base,book,label)){diag({stopped:'Rejected tab destination',tab:label});incomplete.push(label);continue;}
        if(nav.href&&book==='FanDuel') {
          if(!nflSafeDestination(nav.href,base,book,label)){diag({stopped:'Rejected tab destination',tab:label});incomplete.push(label);continue;}
          const g=await currentTabGuard();if(g.error){diag({stopped:g.error,tab:label});fatal=true;break;}
          // URL came from the live same-event anchor, not a guessed route.
          try{await chrome.tabs.update(tabId,{url:nav.href});}
          catch(error){diag({stopped:'Tab navigation failed',tab:label,error:String(error?.message||error)});incomplete.push(label);continue;}
        } else {
          const activation=await nflNavInject(tabId,nflDetailPageStep,[book,{...base,mode:'activate-tab',tab:label}]);
          if(!activation.ok)diag({phase:'activation-response-lost',tab:label,error:activation.error,note:'Checking the live tab before retrying any activation'});
        }
        // The wait survives a destroyed content-script/document context.
        await sleepBackground(600);
      }
      let state=await waitForTab(label);
      if(state.fatal){diag({stopped:state.fatal,tab:label,details:state.details});fatal=true;break;}
      if(!state.ready){diag({tab:label,stopped:state.error,lastError:state.lastError});incomplete.push(label);continue;}
      diag({phase:'navigation-confirmed',tab:label,activeTab:state.state.activeTab,injectionRetries:state.injectionRetries});
      let processed=new Set(Array.isArray(processedByTab[label])?processedByTab[label]:[]);
      let hasPrices=processed.size>0,finished=false;
      const unpricedDrawers=new Set();
      for(let batch=0;batch<24;batch++) {
        let capture;
        for(let attempt=0;attempt<3;attempt++) {
          capture=await nflNavInject(tabId,nflDetailPageStep,[book,{...base,tab:label,captureOnly:true,targetTypes:resume&&unfinished.includes(label)&&!(saved.targets||[]).length?[]:targets,processedLabels:[...processed]}]);
          if(capture.ok&&!capture.value?.retryable)break;
          diag({phase:'capture-retry',tab:label,attempt:attempt+1,error:capture.error||'Tab not ready'});
          state=await waitForTab(label);if(!state.ready)break;
        }
        if(!capture?.ok||!state.ready){diag({stopped:'Capture injection failed after bounded retries; partial data retained',tab:label,error:capture?.error||state.error||state.fatal||''});incomplete.push(label);break;}
        const r=capture.value;
        if(fatalPage(r)||r?.stopped){diag({...r?.diagnostics,tab:label,stopped:r?.stopped||r?.reason||'Capture context changed'});fatal=true;break;}
        if(!r?.recognized){diag({stopped:'Selected NFL game no longer recognized',tab:label});fatal=true;break;}
        for(const record of r.records||[]) {
          chunks.push('NFL_MARKET_V2: '+JSON.stringify(record));
          if(record.quotes?.length){hasPrices=true;unpricedDrawers.delete(record.title);}
          else unpricedDrawers.add(record.title);
        }
        for(const label of r.diagnostics?.unpricedDrawers||[])unpricedDrawers.add(label);
        diag({...r.diagnostics,tab:label,phase:'capture'});
        const before=processed.size;
        for(const l of r.processedLabels||[])processed.add(l);
        // Store only completed priced drawers, so unpriced drawers may retry on
        // another user-initiated run. In-run processed set still advances.
        const priorGood=new Set(processedByTab[label]||[]);
        for(const record of r.records||[])if(record.quotes?.length&&!unpricedDrawers.has(record.title))priorGood.add(record.title);
        processedByTab[label]=[...priorGood];await saveProgress();
        if(!r.remaining) {
          const unpriced=unpricedDrawers.size>0;
          finished=hasPrices&&!unpriced;break;
        }
        if(processed.size===before){diag({stopped:'No progress in bounded drawer batch',tab:label});break;}
      }
      if(finished){completed.add(label);delete processedByTab[label];}
      else if(!incomplete.includes(label))incomplete.push(label);
      await saveProgress();
    }
    checkpoint.incomplete=fatal||tabs.some(t=>!completed.has(t));
    checkpoint.returnedPartial=true;
    checkpoint.pendingTab=todo.find(t=>!completed.has(t))||'';
    await saveProgress();
    diag({phase:'run-finished',event:base.event,complete:!checkpoint.incomplete,completedTabs:[...completed],remainingTabs:tabs.filter(t=>!completed.has(t))});
    return response();
  } catch(error) {
    diag({stopped:'Extension workflow exception; partial data retained',error:String(error?.message||error).slice(0,500)});return response();
  } finally {nflV2ActiveRuns.delete(tabId);}
}

// Install only after the legacy background and the existing theScore prop helper.
// Non-NFL pages continue through their original book workflow unchanged.
const NFL_CAPTURE_VERSION = '20261012_1';
const nflV2ActiveRuns = new Set();
function nflMissingTypes(snapshot,book,event) {
  const accepted=new Set(['spread','total','moneyline_2way','player_passing_yards','player_passing_touchdowns','player_passing_attempts','player_passing_completions','player_passing_interceptions','player_rushing_yards','player_rushing_attempts','player_receiving_yards','player_receptions','player_rushing_receiving_yards','player_passing_rushing_yards','player_touchdowns']);
  const tidy=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  const missing=[];
  for(const b of snapshot?.books||[]) {
    if(tidy(b.bookmaker)!==tidy(book))continue;
    for(const s of b.sports||[]) {
      if(tidy(s.sport)!=='nfl')continue;
      for(const e of s.events||[]) {
        if(tidy(e.eventName)!==tidy(event))continue;
        for(const m of [...(e.missingSharpMarkets||[]),...(e.missingExpectedMarkets||[])]) {
          let t=tidy(m.marketType).replace(/ /g,'_');
          if(t==='moneyline')t='moneyline_2way';
          if(accepted.has(t))missing.push(t);
        }
      }
    }
  }
  return [...new Set(missing)];
}
function nflTabsForTypes(book,types) {
  const all={DraftKings:['POPULAR','GAME LINES','TD SCORERS','PASSING','RECEIVING','RUSHING'],FanDuel:['Popular','Passing Props','Receiving Props','Rushing Props','TD Scorer Props'],BetMGM:['Players','Spreads','Totals','All']};
  if(!types?.length)return all[book]||[];
  if(book==='BetMGM')return [...new Set(types.map(t=>t==='spread'?'Spreads':t==='total'?'Totals':t==='moneyline_2way'?'All':'Players'))];
  const tabs=new Set();
  for(const t of types) {
    const dk=book==='DraftKings';
    if(['spread','total','moneyline_2way'].includes(t))tabs.add(dk?'GAME LINES':'Popular');
    else if(t==='player_touchdowns')tabs.add(dk?'TD SCORERS':'TD Scorer Props');
    else if(t.startsWith('player_passing'))tabs.add(dk?'PASSING':'Passing Props');
    else if(t.startsWith('player_receiving')||t==='player_receptions')tabs.add(dk?'RECEIVING':'Receiving Props');
    else if(t.startsWith('player_rushing'))tabs.add(dk?'RUSHING':'Rushing Props');
  }
  return [...tabs];
}
async function tryNflCaptureV2(tabId,book) {
  // The October 13 detail collector predates this integration with the listing
  // repairs on main. Keep the supplied FD/DK slate formats on their no-click path.
  if (book === 'DraftKings' || book === 'FanDuel') {
    const listing = await safeExecuteScript({tabId, func: captureNflListingOnly, args: [book]});
    if (listing?.[0]?.result) return listing[0].result;
  }
  if(book==='FanDuel'||book==='DraftKings'||book==='BetMGM')return tryNflNavigationCapture(tabId,book);
  const first=await safeExecuteScript({tabId,func:nflDetailPageStep,args:[book,{mode:'probe'}]});
  const probe=first?.[0]?.result;
  if(!probe?.recognized) {
    const tab=await chrome.tabs.get(tabId);
    const path=new URL(tab.url||'https://invalid.local').pathname;
    if(/\/(?:football\/nfl|competition\/nfl\/event)(?:\/|$)/i.test(path))return {source:book,text:`NFL_CAPTURE_VERSION: 20261012_1\nNFL_CAPTURE_BOOK: ${book}\nNFL_CAPTURE_DIAGNOSTICS: NFL page header is not ready; no basketball fallback was used.`};
    return null;
  }
  const heading=`NFL_CAPTURE_VERSION: ${NFL_CAPTURE_VERSION}\nNFL_CAPTURE_BOOK: ${book}\nSport: NFL\n`;
  if(nflV2ActiveRuns.has(tabId))return {source:book,text:'',message:'A capture is already running in this tab.'};
  nflV2ActiveRuns.add(tabId);
  const chunks=[heading];
  if(book==='FanDuel')chunks.push('FANDUEL_NFL_LAYOUT_VERSION: 20261012_2\nFANDUEL_NFL_HEADER_VERSION: 20261012_3');
  try {
    if(!probe.event||!probe.pregame) {
      chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,stopped:probe.reason||'No safe NFL event',...(book==='FanDuel'?{event:probe.event||'',header:probe.headerDiagnostics||null}:{})}));
      return {source:book,text:chunks.join('\n')};
    }
    if(book==='FanDuel')chunks.push('NFL_HEADER_DIAGNOSTICS: '+JSON.stringify(probe.headerDiagnostics||{}));
    const snapshot=await readCoverageSnapshotFromAppTab();
    const external=typeof captureDemandFor==='function'?captureDemandFor(tabId):null;
    const demand=typeof resolveCaptureDemand==='function'?resolveCaptureDemand(snapshot,{book,sport:'NFL',event:probe.event},{refresh:external?.mode==='refresh'}):null;
    if(demand&&external?.mode==='missing'&&external.event===probe.event){demand.targets=[...new Set([...demand.targets,...external.targets])];demand.mode='missing';}
    if(demand?.mode==='complete')return {source:book,text:'',message:'No missing markets for this event.'};
    let targets=demand?demand.targets:nflMissingTypes(snapshot,book,probe.event);
    const tsMainOnly=book==='TheScore'&&targets.length>0&&targets.every(t=>['spread','total','moneyline_2way'].includes(t));
    // The existing TS prop collector is preserved. Prop-specific targeting is not claimed here.
    // Preserve prop demand instead of resetting a targeted run to all markets.
    chunks.push('NFL_CAPTURE_RUN: '+JSON.stringify({book,event:probe.event,mode:targets.length?'missing-markets':'full-core-markets',targets}));
    const base={event:probe.event,path:probe.path,origin:probe.origin,targetTypes:book==='TheScore'?['spread','total','moneyline_2way']:targets};
    let stopped=false;
    async function step(tab,processedLabels=[]) {
      await safeShowToast(tabId,`Extracting ${book} NFL…`,`${targets.length?'Missing-market pass':'NFL capture'}: ${tab||'current section'}.`,{loading:true,pulse:false});
      const rs=await safeExecuteScript({tabId,func:nflDetailPageStep,args:[book,{...base,tab,processedLabels}]});
      const r=rs?.[0]?.result;
      if(!r){chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,stopped:'Capture injection failed; partial data retained'}));stopped=true;return;}
      for(const record of r.records||[])chunks.push('NFL_MARKET_V2: '+JSON.stringify(record));
      chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({...r.diagnostics,...(r.stopped?{stopped:r.stopped}:{})}));
      if(r.stopped||!r.recognized)stopped=true;
      return r;
    }
    async function batchedStep(tab) {
      const processed=new Set();
      for(let batch=0;batch<20&&!stopped;batch++) {
        const r=await step(tab,[...processed]);
        if(!r||!r.remaining)break;
        const before=processed.size;for(const label of r.processedLabels||[])processed.add(label);
        if(processed.size===before){chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,tab,stopped:'No progress in bounded drawer batch'}));break;}
        if(batch===19)chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,tab,stopped:'Drawer batch cap reached; capture is partial'}));
      }
    }
    if(book==='BetMGM')await batchedStep('');
    else if(book!=='FanDuel'&&(!targets.length||tsMainOnly))await step('');
    if(book==='TheScore') {
      if(!stopped&&(!targets.length||tsMainOnly)&&probe.tabs?.some(t=>/^Popular$/i.test(t)))await step('Popular');
      if(!stopped&&!tsMainOnly) {
        let visited=[],event=probe.event;
        for(let pass=0;pass<18;pass++) {
          const tab=await chrome.tabs.get(tabId),url=new URL(tab.url||'');
          if(url.pathname!==probe.path)break;
          await safeShowToast(tabId,'Extracting theScore NFL…',`NFL player props section ${pass+1}.`,{loading:true,pulse:false});
          const rs=await safeExecuteScript({tabId,func:captureTheScoreNflPropsStep,args:[visited,event,probe.path,{targetTypes:targets,targetLabels:typeof captureTargetLabels==='function'?captureTargetLabels('NFL',targets):[]}]});
          const r=rs?.[0]?.result;
          if(!r){chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,stopped:'Prop capture injection failed'}));break;}
          if(r.text)chunks.push(r.text);
          if(typeof updateCapturePending==='function')await safeExecuteScript({tabId,func:updateCapturePending,args:[probe.origin+probe.path,nflTypesForTitles(r.pricedMarkets||[]),nflTypesForTitles(r.pendingMarkets||[])]});
          visited=r.visited||visited;event=r.event||event;
          if(r.done)break;await sleepBackground(1400);
        }
      }
    } else {
      for(const tab of nflTabsForTypes(book,targets)){
        if(stopped)break;
        await batchedStep(tab);
      }
    }
    return {source:book,text:chunks.join('\n\n')};
  } catch(e) {
    chunks.push('NFL_CAPTURE_DIAGNOSTICS: '+JSON.stringify({book,stopped:String(e?.message||e)}));
    return {source:book,text:chunks.join('\n\n')};
  } finally {nflV2ActiveRuns.delete(tabId);}
}
function captureNflListingOnly(book) {
  const raw = String(document.body?.innerText || '');
  const dk = book === 'DraftKings' && (/Sportsbook\s*\/\s*Football Odds\s*\/\s*NFL Odds(?:\s*\n|\s*$)/i.test(raw) || /\/leagues\/football\/nfl\/?$/i.test(location.pathname)) && /GAME LINES[\s\S]*Spread\s+Total\s+Moneyline/i.test(raw);
  const fd = book === 'FanDuel' && /NFL Odds\s+NFL\s+SPREAD\s+MONEY\s+TOTAL/i.test(raw);
  return dk || fd ? {source:book, text:`${dk ? 'DRAFTKINGS' : 'FANDUEL'}_NFL_MAIN_LINES_CAPTURE\nNFL_CAPTURE_LEAGUE: NFL\n${raw}`} : null;
}
const nflV2OriginalDraftKings=extractDraftKingsMultiPassPayload;
extractDraftKingsMultiPassPayload=async function(tabId,options={}) {
  return await tryNflCaptureV2(tabId,'DraftKings') || nflV2OriginalDraftKings(tabId,options);
};
const nflV2OriginalFanDuel=extractFanDuelMultiPassPayload;
extractFanDuelMultiPassPayload=async function(tabId,options={}) {
  return await tryNflCaptureV2(tabId,'FanDuel') || nflV2OriginalFanDuel(tabId,options);
};
const nflV2OriginalSingle=extractSinglePayloadFromTab;
extractSinglePayloadFromTab=async function(tabId) {
  const tab=await chrome.tabs.get(tabId);
  let host='';try{host=new URL(tab.url||'').hostname;}catch{return nflV2OriginalSingle(tabId);}
  if(/(^|\.)betmgm\.com$/i.test(host))return await tryNflCaptureV2(tabId,'BetMGM') || nflV2OriginalSingle(tabId);
  if(host==='sportsbook.thescore.bet')return await tryNflCaptureV2(tabId,'TheScore') || nflV2OriginalSingle(tabId);
  return nflV2OriginalSingle(tabId);
};
const nflV2OriginalBetMgm=extractBetMgmMultiPassPayload;
extractBetMgmMultiPassPayload=async function(tabId) {
  return await tryNflCaptureV2(tabId,'BetMGM') || nflV2OriginalBetMgm(tabId);
};
