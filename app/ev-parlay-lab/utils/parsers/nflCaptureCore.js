// Recovered unchanged from October 13 installer; kept identical to the injected core.
export function createNflCaptureCore() {
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
  const badMarket = /\b(?:first|last|half|halves|quarter|1st|2nd|3rd|4th|live|season|team|longest|defensive|drive|either|alternate|alt|specials?|sgp|pre-built)\b/i;
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
