// User-triggered, rendered DOM only. Selectors are grounded in the Oct 14 sample.
async function capturePinnacleMlbPage(demand = {}) {
  const initialUrl = new URL(location.href);
  if (!/(^|\.)pinnacle\.com$/i.test(initialUrl.hostname) || !/^\/en\/baseball\/mlb\/[^/]+-vs-[^/]+\/\d+\/?$/.test(initialUrl.pathname)) return null;
  const diagnostics = [];
  const packet = { version: 1, url: initialUrl.href, capturedAt: new Date().toISOString(), mainText: String(document.body?.innerText || ''), panels: [], diagnostics };
  const sameEvent = () => location.origin === initialUrl.origin && location.pathname === initialUrl.pathname;
  const visible = element => {
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  };
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const progressKey='EV_CAPTURE_PENDING::'+initialUrl.origin+initialUrl.pathname;
  const marketType=title=>{
    const types={bases:'player_total_bases',strikeouts:'pitcher_strikeouts','home runs':'player_home_runs','hits allowed':'pitcher_hits_allowed','earned runs':'pitcher_earned_runs_allowed','pitching outs':'pitcher_outs_recorded',hits:'player_hits','runs batted in':'player_rbis',rbis:'player_rbis',runs:'player_runs','walks allowed':'pitcher_walks_allowed'};
    return types[title.split(/ Total /i).at(-1).toLowerCase()]||'';
  };
  const titleOf = drawer => {
    const title = drawer.querySelector(':scope > .collapse-title')?.cloneNode(true);
    title?.querySelectorAll('button, .collapse-icon').forEach(el => el.remove());
    return clean(title?.textContent);
  };
  const wanted = title => !demand.targets?.length || demand.labels?.some(label=>title.toLowerCase().endsWith(' total '+label.toLowerCase()));
  const supported = title => wanted(title) && /^.+? Total (?:Bases|Strikeouts|Home Runs|Hits Allowed|Earned Runs|Pitching Outs|Hits|Runs Batted In|RBIs|Runs|Walks Allowed)$/i.test(title) &&
    !/\b(?:inning|half|period|live|first|last)\b/i.test(title);
  const drawers = () => [...document.querySelectorAll('[data-test-id^="Event.Row "][data-collapsed]')];
  const deadline = Date.now() + 25000;
  const waitFor = async predicate => {
    const until = Math.min(deadline, Date.now() + 2500);
    while (sameEvent() && Date.now() < until) {
      if (predicate()) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  };
  const finish = () => {
    if(sameEvent()) {
      const paired=panel=>panel.quotes.length>=2&&panel.quotes.every(q=>{
        const m=q.label.match(/^(Over|Under) (.+)$/i);if(!m)return false;
        const peers=panel.quotes.filter(x=>x.label.toLowerCase()===(m[1].toLowerCase()==='over'?'under ':'over ')+m[2].toLowerCase());
        return peers.length===1&&panel.quotes.filter(x=>x.label===q.label).length===1;
      });
      const pending=drawers().filter(d=>supported(titleOf(d))&&!packet.panels.some(p=>p.title===titleOf(d)&&paired(p))).map(d=>marketType(titleOf(d))).filter(Boolean);
      if(demand.targets?.length)try{pending.push(...JSON.parse(sessionStorage.getItem(progressKey)||'[]').filter(t=>!demand.targets.includes(t)));}catch{}
      // Persist unfinished market demand; absence of any rendered drawers is not completion.
      if(pending.length||packet.panels.length)try{sessionStorage.setItem(progressKey,JSON.stringify([...new Set(pending)]));}catch{}
    }
    return {source: 'Pinnacle', text: 'PINNACLE_MLB_DOM_V1: ' + JSON.stringify(packet)};
  };
  if(demand.targets?.length&&demand.targets.every(t=>['spread','total','moneyline_2way'].includes(t)))return finish();
  const tab = document.querySelector('button#player-props');
  if (!tab || tab.disabled || clean(tab.textContent) !== 'Player Props') {
    diagnostics.push('Player Props control unavailable; only initial main lines captured.');
    return finish();
  }
  if (location.hash !== '#player-props') tab.click();
  if (!await waitFor(() => location.hash === '#player-props' && drawers().some(d => supported(titleOf(d))))) {
    diagnostics.push('Player Props did not become ready; capture incomplete.');
    if (!sameEvent()) { packet.mainText = ''; diagnostics.push('Event navigation detected; all prices discarded.'); }
    return finish();
  }
  const visited = new Set();
  while (sameEvent() && Date.now() < deadline && visited.size < 80) {
    const drawer = drawers().find(d => supported(titleOf(d)) && !visited.has(d.getAttribute('data-test-id')));
    if (!drawer) break;
    const key = drawer.getAttribute('data-test-id');
    const title = titleOf(drawer);
    visited.add(key);
    const current = () => drawers().find(d => d.getAttribute('data-test-id') === key && titleOf(d) === title);
    const controls = drawer.querySelector(':scope > .collapse-title');
    const showAll = [...(controls?.querySelectorAll('button') || [])].find(b => clean(b.textContent) === 'Show All' && !b.disabled);
    if (showAll) showAll.click();
    else if (drawer.getAttribute('data-collapsed') === 'true') controls?.click();
    if (!await waitFor(() => current()?.getAttribute('data-collapsed') === 'false' && current()?.querySelector('.collapse-content button.market-btn'))) {
      diagnostics.push(`No rendered prices after expansion: ${title}`);
      continue;
    }
    // Re-query after lazy rendering. Never click an outcome button.
    const content = current()?.querySelector(':scope > .collapse-content');
    const quotes = [];
    for (const button of content?.querySelectorAll('button.market-btn') || []) {
      if (button.disabled || button.getAttribute('aria-disabled') === 'true' || !visible(button)) continue;
      const label = clean(button.getAttribute('title'));
      const spans = [...button.querySelectorAll('span')].filter(visible).map(s => clean(s.textContent));
      if (!spans.includes(label)) continue;
      const prices = spans.filter(s => s !== label && /^(?:[+-]\d{3,6}|\d+\.\d+)$/.test(s));
      if (prices.length !== 1) continue;
      quotes.push({ label, price: prices[0], ariaLabel: button.getAttribute('aria-label') || '' });
    }
    if (!quotes.length) diagnostics.push(`No valid displayed prices: ${title}`);
    packet.panels.push({ title, quotes, capturedAt: new Date().toISOString() });
  }
  if (!sameEvent()) { packet.mainText = ''; packet.panels = []; diagnostics.push('Event navigation detected; all prices discarded.'); }
  else if (drawers().some(d => supported(titleOf(d)) && !visited.has(d.getAttribute('data-test-id')))) diagnostics.push('Capture safety limit reached; some drawers were not visited.');
  packet.capturedAt = new Date().toISOString();
  return finish();
}

const beforePinnacleMlb = extractSinglePayloadFromTab;
const pinnacleMlbRuns = new Set();
extractSinglePayloadFromTab = async function(tabId) {
  const tab = await chrome.tabs.get(tabId);
  let url;
  try { url = new URL(tab.url || ''); } catch { return beforePinnacleMlb(tabId); }
  if (!/(^|\.)pinnacle\.com$/i.test(url.hostname) || !/^\/en\/baseball\/mlb\/[^/]+-vs-[^/]+\/\d+\/?$/.test(url.pathname)) return beforePinnacleMlb(tabId);
  if (pinnacleMlbRuns.has(tabId)) return { source: 'Pinnacle', text: 'PINNACLE_MLB_DOM_V1: ' + JSON.stringify({version:1, url:url.href, diagnostics:['A capture is already running.'], panels:[]}) };
  pinnacleMlbRuns.add(tabId);
  try {
    const results = await safeExecuteScript({tabId, func:capturePinnacleMlbPage,args:[typeof captureDemandFor==='function'&&captureDemandFor(tabId)?.mode==='missing'?{targets:captureDemandFor(tabId).targets,labels:captureTargetLabels('MLB',captureDemandFor(tabId).targets)}:{}]});
    return results?.[0]?.result || {source:'Pinnacle', text:'PINNACLE_MLB_DOM_V1: ' + JSON.stringify({version:1,url:url.href,panels:[],diagnostics:['Capture injection failed.']})};
  } finally { pinnacleMlbRuns.delete(tabId); }
};
