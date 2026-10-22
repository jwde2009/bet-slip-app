// User-initiated visible-data fallback for MLB layouts without a verified tab
// collector. In particular, BetMGM must not run the NBA workflow on baseball.
function captureVisibleMlbPage(book) {
  const host = location.hostname.toLowerCase();
  if (!(book === 'BetMGM' && /(^|\.)betmgm\.com$/.test(host) || book === 'FanDuel' && /(^|\.)fanduel\.com$/.test(host))) return null;
  const text = String(document.body?.innerText || '');
  const compact = text.replace(/\s+/g, ' ');
  const explicit = /Baseball\s*(?:\/\s*)?MLB Odds/i.test(compact) ||
    /(?:mlb|baseball)/i.test(location.pathname) && /\bMLB\b/i.test(document.title || '');
  if (!explicit) return null;
  return {source:book, text:`MLB_VISIBLE_CAPTURE: ${book}\nMLB_VISIBLE_CAPTURE_AT: ${new Date().toISOString()}\nMLB_VISIBLE_CAPTURE_DIAGNOSTICS: Visible markets only. Open desired market drawers before capture; automatic MLB navigation is not yet verified for this book.\n${text}`};
}

const beforeVisibleMlbFanDuel = extractFanDuelMultiPassPayload;
const beforeVisibleMlbBetMgm = extractBetMgmMultiPassPayload;
const beforeVisibleMlbSingle = extractSinglePayloadFromTab;
async function visibleMlbPayload(tabId, book) {
  const result = await safeExecuteScript({tabId, func:captureVisibleMlbPage, args:[book]});
  return result?.[0]?.result || null;
}
extractFanDuelMultiPassPayload = async function(tabId, options = {}) {
  return await visibleMlbPayload(tabId, 'FanDuel') || beforeVisibleMlbFanDuel(tabId, options);
};
extractBetMgmMultiPassPayload = async function(tabId) {
  return await visibleMlbPayload(tabId, 'BetMGM') || beforeVisibleMlbBetMgm(tabId);
};
extractSinglePayloadFromTab = async function(tabId) {
  const tab = await chrome.tabs.get(tabId);
  let host; try { host = new URL(tab.url || '').hostname; } catch { return beforeVisibleMlbSingle(tabId); }
  if (/(^|\.)betmgm\.com$/.test(host)) return await visibleMlbPayload(tabId, 'BetMGM') || beforeVisibleMlbSingle(tabId);
  return beforeVisibleMlbSingle(tabId);
};
