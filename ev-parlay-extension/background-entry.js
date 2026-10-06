// Classic service-worker entry: preserve the existing multi-book implementation.
importScripts("background.js", "theScoreNflCapture.js");
const extractWithoutNflProps = extractSinglePayloadFromTab;
const nflRuns = new Set();
extractSinglePayloadFromTab = async function extractWithNflProps(tabId) {
  const tab = await chrome.tabs.get(tabId);
  let url;
  try { url = new URL(tab.url || ""); } catch { return extractWithoutNflProps(tabId); }
  if (!(url.hostname === "sportsbook.thescore.bet" && /\/competition\/nfl\/event\/[^/]+\/?$/i.test(url.pathname))) return extractWithoutNflProps(tabId);
  if (nflRuns.has(tabId)) return { source: "TheScore", text: "THESCORE_NFL_DEBUG: A capture is already running in this tab." };
  nflRuns.add(tabId);
  try {
    let mainText = "", event = "", visited = [];
    const captures = [];
    for (let pass = 0; pass < 18; pass += 1) {
      const current = new URL((await chrome.tabs.get(tabId)).url || "");
      if (current.origin !== url.origin || current.pathname !== url.pathname) break;
      // The tested legacy NFL extractor remains responsible for main-line prices.
      const main = await extractWithoutNflProps(tabId);
      if (/^Market: (?:Spread|Total|Moneyline)$/im.test(main.text || "")) mainText = main.text;
      event = mainText.match(/^Event:\s*(.+)$/m)?.[1] || event;
      await safeShowToast(tabId, "Extracting theScore NFL…", `Capturing NFL section ${pass + 1}.`, { loading: true, pulse: pass === 0 });
      const result = await safeExecuteScript({ tabId, func: captureTheScoreNflPropsStep, args: [visited, event, url.pathname] });
      const step = result?.[0]?.result;
      if (!step) { captures.push("THESCORE_NFL_DEBUG: Injection failed; partial capture retained."); break; }
      if (step.text) captures.push(step.text);
      event = step.event || event;
      visited = step.visited || visited;
      if (step.done) break;
      if (pass === 17) captures.push("THESCORE_NFL_DEBUG: Safety cap reached; capture may be incomplete.");
      await sleepBackground(1400);
    }
    return { source: "TheScore", text: [mainText, ...captures].filter(Boolean).join("\n\n") };
  } finally { nflRuns.delete(tabId); }
};
