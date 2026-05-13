async function safeExecuteScript({ tabId, func, args = [] }) {
  try {
    if (!tabId) return null;

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.id) return null;

    const url = String(tab.url || "");

    // Chrome cannot inject into chrome://, edge://, extension pages, or browser error pages.
    if (
      !url ||
      /^chrome:\/\//i.test(url) ||
      /^edge:\/\//i.test(url) ||
      /^chrome-extension:\/\//i.test(url) ||
      /^about:/i.test(url)
    ) {
      return null;
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
    });

    return Array.isArray(result) ? result : null;
  } catch (err) {
    const message = String(err?.message || err || "");

    // These are common race-condition errors when a page reloads/navigates.
    if (
      /frame with id 0 was removed/i.test(message) ||
      /frame with id 0 is showing error page/i.test(message) ||
      /cannot access contents of url/i.test(message) ||
      /no tab with id/i.test(message)
    ) {
      console.warn("EV Parlay Extractor skipped injection:", message);
      return null;
    }

    console.warn("EV Parlay Extractor script injection failed:", err);
    return null;
  }
}

async function safeShowToast(tabId, title, message, details = {}) {
  await safeExecuteScript({
    tabId,
    func: showImportToast,
    args: [title, message, details],
  });
}

async function setExtensionWorkingBadge(isWorking) {
  try {
    await chrome.action.setBadgeText({ text: isWorking ? "..." : "" });

    if (isWorking) {
      await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
      await chrome.action.setTitle({ title: "EV Parlay Extractor: running" });
    } else {
      await chrome.action.setTitle({ title: "EV Parlay Extractor" });
    }
  } catch (err) {
    // ignore badge failures
  }
}

function estimateExtractedRows(text = "", source = "") {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sourceText = String(source || "").toLowerCase();

  if (sourceText === "pinnacle" || sourceText === "betmgm") {
    let estimated = 0;

    for (let i = 0; i < lines.length - 4; i += 1) {
      const line = lines[i];
      const next = lines[i + 1];

      // Raw O/U prop shape:
      // Player
      // O 2.5
      // +100
      // U 2.5
      // -135
      if (
        /^[A-Za-z][A-Za-z .'-]+$/.test(line) &&
        /^[OU]\s*\d+(\.\d+)?$/i.test(lines[i + 1]) &&
        /^[-+]\d+$|^EVEN$/i.test(lines[i + 2]) &&
        /^[OU]\s*\d+(\.\d+)?$/i.test(lines[i + 3]) &&
        /^[-+]\d+$|^EVEN$/i.test(lines[i + 4])
      ) {
        estimated += 2;
        continue;
      }

      // Raw total shape:
      // Over 226 / O 226 / 226
      // -110
      if (/^(Over|Under)\s+\d+(\.\d+)?/i.test(line) && /^[-+]\d+$|^EVEN$/i.test(next)) {
        estimated += 1;
        continue;
      }

      if (/^[OU]\s*\d+(\.\d+)?$/i.test(line) && /^[-+]\d+$|^EVEN$/i.test(next)) {
        estimated += 1;
        continue;
      }

      // Raw spread/moneyline shape.
      if (/^[+-]?\d+(\.\d+)?$/.test(line) && /^[-+]\d+$|^EVEN$/i.test(next)) {
        estimated += 1;
        continue;
      }

      if (/^[A-Za-z][A-Za-z .'-]+$/.test(line) && /^[-+]\d+$|^EVEN$/i.test(next)) {
        estimated += 1;
      }
    }

    return estimated;
  }

  return lines.filter((line) => {
    if (/^THESCORE_STRUCTURED_EXPORT$/i.test(line)) return false;
    if (/^(Sport|Event|Start|Market):/i.test(line)) return false;
    return line.includes("|") && /[-+]\d+|EVEN/i.test(line);
  }).length;
}

function isBetMgmTabUrl(url = "") {
  return /betmgm/i.test(String(url || ""));
}

function isFanDuelTabUrl(url = "") {
  return /fanduel/i.test(String(url || ""));
}

function isDraftKingsTabUrl(url = "") {
  return /draftkings/i.test(String(url || ""));
}

function sleepBackground(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetBetMgmWorkflowStorageInPage() {
  try {
    Object.keys(sessionStorage || {}).forEach((key) => {
      if (/^EV_BETMGM_/i.test(String(key || ""))) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (err) {
    // ignore storage failures
  }
}

function normalizeExtractionBlock(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function mergeExtractionBlocks(blocks = []) {
  const seen = new Set();
  const merged = [];

  for (const block of blocks) {
    const normalized = normalizeExtractionBlock(block);

    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    merged.push(String(block || "").trim());
  }

  return merged.join("\n\n").trim();
}

async function extractSinglePayloadFromTab(tabId) {
  const extractionResult = await safeExecuteScript({
    tabId,
    func: extractOddsTextFromCurrentPage,
  });

  const [{ result: payload } = {}] = extractionResult || [];

  return {
    source: String(payload?.source || ""),
    text: String(payload?.text || ""),
    action: String(payload?.action || ""),
    message: String(payload?.message || ""),
  };
}

async function extractDraftKingsMultiPassPayload(tabId) {
  const captures = [];
  let source = "DraftKings";

  const maxPasses = 18;

  await safeShowToast(
    tabId,
    "Extracting DraftKings…",
    "Starting DraftKings section capture. Keep this tab open.",
    {
      loading: true,
      pulse: true,
    }
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    await safeShowToast(
      tabId,
      "Extracting DraftKings…",
      pass === 0
        ? `Pass ${pass + 1} of ${maxPasses}: capturing starting page.`
        : `Pass ${pass + 1} of ${maxPasses}: capturing newly opened section.`,
      {
        loading: true,
        pulse: pass === 0,
      }
    );

    const payload = await extractSinglePayloadFromTab(tabId);
    const text = String(payload?.text || "");
    const detectedSource = String(payload?.source || "");

    if (detectedSource) {
      source = detectedSource;
    }

    if (!text.trim()) {
      await safeShowToast(
        tabId,
        "DraftKings capture paused",
        `Pass ${pass + 1} returned no text. Using what was already captured.`,
        {
          loading: true,
          pulse: true,
        }
      );
      break;
    }

    captures.push(`DRAFTKINGS_AUTOPASS_${pass + 1}\n${text}`);

    const scheduledMatch = text.match(/DRAFTKINGS_SCHEDULED_STEP:\s*(.+)/i);

    if (!scheduledMatch?.[1]) {
      await safeShowToast(
        tabId,
        "DraftKings capture finishing…",
        `No next DraftKings step found after pass ${pass + 1}.`,
        {
          loading: true,
          pulse: false,
        }
      );
      break;
    }

    const nextLabel = String(scheduledMatch[1]).trim();

    await safeShowToast(
      tabId,
      "Extracting DraftKings…",
      /^[A-Z\s]+$/.test(nextLabel)
        ? `Opening DraftKings top tab: ${nextLabel}.`
        : `Opening DraftKings combo section: ${nextLabel}.`,
      {
        loading: true,
        pulse: /^[A-Z\s]+$/.test(nextLabel),
      }
    );

    await sleepBackground(/^[A-Z\s]+$/.test(nextLabel) ? 2750 : 1500);
  }

  return {
    source,
    text: mergeExtractionBlocks(captures),
  };
}

async function extractBetMgmMultiPassPayload(tabId) {
  const captures = [];
  let source = "BetMGM";

  const maxPasses = 24;
  let waitingForHydration = false;
  let hydrationRetries = 0;

  function looksLikeBetMgmHydrationShell(text = "") {
    const cleaned = String(text || "").trim();

    if (!cleaned) return true;

    const hasRealOdds =
      /[-+]\d{2,5}/.test(cleaned) &&
      (
        /\b(Player points|Player assists|Player rebounds|Player three-pointers|Player shots|Goalie saves|Game lines|Spread|Total|Money)\b/i.test(cleaned) ||
        /\b(Thunder|Lakers|Pistons|Cavaliers|Nuggets|Timberwolves|Celtics|76ers|Penguins|Flyers|Sabres|Bruins)\b/i.test(cleaned)
      );

    const isTinyShell =
      cleaned.length < 1200 &&
      /Sports\s+Rewards\s+Help/i.test(cleaned) &&
      !hasRealOdds;

    const isToastOnlyShell =
      /Extracting BetMGM/i.test(cleaned) &&
      !hasRealOdds &&
      cleaned.length < 2000;

    return isTinyShell || isToastOnlyShell;
  }

  await safeShowToast(
    tabId,
    "Extracting BetMGM…",
    "Starting BetMGM capture. Keep this tab open.",
    {
      loading: true,
      pulse: true,
    }
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    await safeShowToast(
      tabId,
      "Extracting BetMGM…",
      pass === 0
        ? `Pass ${pass + 1}: capturing current BetMGM page.`
        : `Pass ${pass + 1}: waiting for BetMGM content, then capturing.`,
      {
        loading: true,
        pulse: pass === 0,
      }
    );

    const payload = await extractSinglePayloadFromTab(tabId);
    const text = String(payload?.text || "");
    const detectedSource = String(payload?.source || "");

    if (detectedSource) {
      source = detectedSource;
    }

    if (!text.trim()) {
      await sleepBackground(2500);
      continue;
    }

    if (waitingForHydration && looksLikeBetMgmHydrationShell(text)) {
      hydrationRetries += 1;

      await safeShowToast(
        tabId,
        "Extracting BetMGM…",
        `BetMGM is still loading Player Props. Waiting again (${hydrationRetries}/4).`,
        {
          loading: true,
          pulse: false,
        }
      );

      if (hydrationRetries <= 4) {
        await sleepBackground(3000);
        continue;
      }
    }

    waitingForHydration = false;
    hydrationRetries = 0;

    captures.push(`BETMGM_AUTOPASS_${pass + 1}\n${text}`);

    const scheduledPlayerPropsMatch = text.match(/BETMGM_SCHEDULED_PLAYER_PROPS:\s*(.+)/i);
    const scheduledTopTabMatch = text.match(/BETMGM_SCHEDULED_TOP_TAB:\s*(.+)/i);
    const scheduledDrawerMatch = text.match(/BETMGM_SCHEDULED_DRAWER:\s*(.+)/i);
    const scheduledHeaderMatch = text.match(/BETMGM_SCHEDULED_PLAYER_HEADER:\s*(.+)/i);

    const scheduled =
      scheduledPlayerPropsMatch ||
      scheduledTopTabMatch ||
      scheduledDrawerMatch ||
      scheduledHeaderMatch;

    if (!scheduled?.[1]) {
      await safeShowToast(
        tabId,
        "BetMGM capture finishing…",
        `No next BetMGM step found after pass ${pass + 1}.`,
        {
          loading: true,
          pulse: false,
        }
      );
      break;
    }

    const label = String(scheduled[1] || "").trim();

    await safeShowToast(
      tabId,
      "Extracting BetMGM…",
      scheduledPlayerPropsMatch
        ? "Opened Player Props. Waiting for the page to hydrate before next capture."
        : scheduledTopTabMatch
          ? `Opened top tab: ${label}. Waiting before next capture.`
          : scheduledDrawerMatch
            ? `Opened drawer: ${label}. Waiting before next capture.`
            : `Opened player-prop header: ${label}. Waiting before next capture.`,
      {
        loading: true,
        pulse: true,
      }
    );

    waitingForHydration = true;

    await sleepBackground(scheduledPlayerPropsMatch || scheduledTopTabMatch ? 5000 : 3000);
  }

  return {
    source,
    text: mergeExtractionBlocks(captures),
  };
}

async function extractFanDuelMultiPassPayload(tabId) {
  const captures = [];
  let source = "FanDuel";

  // FanDuel NBA full pass can require many scheduled clicks:
  // ladders, O/U drawer, next tab, repeat.
  const maxPasses = 35;

  await safeShowToast(
    tabId,
    "Extracting FanDuel…",
    "Starting FanDuel multi-pass capture. Keep this tab open.",
    {
      loading: true,
      pulse: true,
    }
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    await safeShowToast(
      tabId,
      "Extracting FanDuel…",
      `Running pass ${pass + 1} of ${maxPasses}. Keep this tab open.`,
      {
        loading: true,
        pulse: pass === 0,
      }
    );

    const payload = await extractSinglePayloadFromTab(tabId);

    const text = String(payload?.text || "");
    const detectedSource = String(payload?.source || "");
    const action = String(payload?.action || "");
    const message = String(payload?.message || "");

    if (detectedSource) {
      source = detectedSource;
    }

    if (action === "navigate_only") {
      await safeShowToast(
        tabId,
        "Extracting FanDuel…",
        message || "Moved to Player Points. Continuing capture after page loads.",
        {
          loading: true,
          pulse: true,
        }
      );

      await sleepBackground(3500);
      continue;
    }

    if (!text.trim()) {
      await safeShowToast(
        tabId,
        "FanDuel capture paused",
        `Pass ${pass + 1} returned no text. Using what was already captured.`,
        {
          loading: true,
          pulse: true,
        }
      );
      break;
    }

    captures.push(`FANDUEL_AUTOPASS_${pass + 1}\n${text}`);

    const hasScheduledNextStep = /FANDUEL_SCHEDULED_/i.test(text);

    if (!hasScheduledNextStep) {
      await safeShowToast(
        tabId,
        "FanDuel capture finishing…",
        `No next FanDuel step found after pass ${pass + 1}.`,
        {
          loading: true,
          pulse: false,
        }
      );
      break;
    }

    const scheduledTopTabMatch = text.match(/FANDUEL_SCHEDULED_NEXT_TAB:\s*(.+?)\s*->\s*(.+)/i);
    const scheduledInternalMatch = text.match(/FANDUEL_SCHEDULED_INTERNAL_HEADER:\s*(.+?)\s*->\s*(.+)/i);
    const scheduledOuMatch = text.match(/FANDUEL_SCHEDULED_OU_DRAWER:\s*(.+?)\s*->\s*(.+)/i);

    if (scheduledTopTabMatch?.[2]) {
      await safeShowToast(
        tabId,
        "Extracting FanDuel…",
        `Moving to ${String(scheduledTopTabMatch[2]).trim()}.`,
        {
          loading: true,
          pulse: true,
        }
      );

      // Top-tab navigation causes FanDuel to re-render much more heavily than
      // opening a drawer/header, so give it more time before the next extract.
      await sleepBackground(2750);
    } else if (scheduledInternalMatch?.[2]) {
      await safeShowToast(
        tabId,
        "Extracting FanDuel…",
        `Opening combo section: ${String(scheduledInternalMatch[2]).trim()}.`,
        {
          loading: true,
          pulse: false,
        }
      );

      await sleepBackground(1700);
    } else if (scheduledOuMatch?.[2]) {
      await safeShowToast(
        tabId,
        "Extracting FanDuel…",
        `Opening ${String(scheduledOuMatch[2]).trim()} O/U.`,
        {
          loading: true,
          pulse: false,
        }
      );

      await sleepBackground(1800);
    } else {
      await sleepBackground(1500);
    }
  }

  return {
    source,
    text: mergeExtractionBlocks(captures),
  };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  const sourceTabId = tab.id;

  await setExtensionWorkingBadge(true);

  await safeShowToast(
    sourceTabId,
    "Extracting odds…",
    "The EV Parlay extension is running. Keep this tab open.",
    {
      loading: true,
      pulse: true,
    }
  );

  if (isBetMgmTabUrl(tab.url)) {
    await safeExecuteScript({
      tabId: sourceTabId,
      func: resetBetMgmWorkflowStorageInPage,
    });
  }

  const payload = isFanDuelTabUrl(tab.url)
    ? await extractFanDuelMultiPassPayload(sourceTabId)
    : isBetMgmTabUrl(tab.url)
      ? await extractBetMgmMultiPassPayload(sourceTabId)
      : isDraftKingsTabUrl(tab.url)
        ? await extractDraftKingsMultiPassPayload(sourceTabId)
        : await extractSinglePayloadFromTab(sourceTabId);


  const finalText = String(payload?.text || "");
  const source = String(payload?.source || "");
  const action = String(payload?.action || "");
  const message = String(payload?.message || "");

  if (action === "navigate_only") {
    await setExtensionWorkingBadge(false);

    await safeShowToast(
      sourceTabId,
      "FanDuel moved to Player Points",
      message || "No text was imported. Click the extension again from the Player Points page.",
      {
        loading: false,
        pulse: true,
        complete: true,
      }
    );

    return;
  }

  if (!finalText.trim() || !source.trim()) {
    await setExtensionWorkingBadge(false);
    await safeShowToast(sourceTabId, "Unsupported page", "No odds text was extracted.", {
      loading: false,
      pulse: true,
    });
    return;
  }

  const appUrl = "http://localhost:3000/ev-parlay-lab";
  const existingTabs = await chrome.tabs.query({ url: `${appUrl}*` });

  let appTabId = null;

  if (existingTabs.length > 0) {
    appTabId = existingTabs[0].id;
  } else {
    const created = await chrome.tabs.create({ url: appUrl, active: false });
    appTabId = created.id;
    await waitForTabComplete(appTabId);
  }

  if (!appTabId) {
    await setExtensionWorkingBadge(false);
    return;
  }

  const queueWriteResult = await safeExecuteScript({
    tabId: appTabId,
    func: writeImportIntoAppQueue,
    args: [finalText, source],
  });

  if (!queueWriteResult) {
    await setExtensionWorkingBadge(false);
    await safeShowToast(
      sourceTabId,
      "Import failed",
      "EV Parlay Lab was not ready. Open or reload the app, then try again.",
      {
        loading: false,
        pulse: true,
      }
    );
    return;
  }

  const estimatedRows = estimateExtractedRows(finalText, source);
  const isFanDuelCapture = /^fanduel$/i.test(source);

  await setExtensionWorkingBadge(false);

  await safeShowToast(
    sourceTabId,
    isFanDuelCapture
      ? "COMPLETE - FanDuel captured"
      : `COMPLETE - ${source} import sent`,
    isFanDuelCapture
      ? `${finalText.length.toLocaleString()} characters queued. Load newest import, then parse in EV Lab.`
      : estimatedRows > 0
        ? `Estimated rows queued: ${estimatedRows.toLocaleString()}`
        : `${finalText.length.toLocaleString()} characters queued. Load newest import, then parse in EV Lab.`,
    {
      characters: finalText.length,
      estimatedRows,
      complete: true,
      loading: false,
      pulse: true,
    }
  );
});

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (tab?.status === "complete") {
        resolve();
        return;
      }

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 3000);
    });
  });
}

function showImportToast(title, message, details = {}) {
  const toastId = "ev-parlay-extension-toast";

  const payload = {
    title: String(title || "Import sent"),
    message: String(message || ""),
    details: details || {},
    createdAt: Date.now(),
  };

  try {
    sessionStorage.setItem("EV_PARLAY_LAST_TOAST", JSON.stringify(payload));
  } catch (err) {
    // ignore storage failures
  }

  function renderToast(data) {
    const existing = document.getElementById(toastId);
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = toastId;

    toast.style.position = "fixed";
    toast.style.top = "16px";
    toast.style.right = "16px";
    toast.style.zIndex = "2147483647";
    const isComplete = data?.details?.complete === true;

    toast.style.background = isComplete ? "#1d4ed8" : "#166534";
    toast.style.color = "#f0fdf4";
    toast.style.border = isComplete ? "2px solid #93c5fd" : "1px solid #86efac";
    toast.style.borderRadius = "12px";
    toast.style.padding = isComplete ? "16px 18px" : "12px 14px";
    toast.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    toast.style.fontSize = "13px";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    toast.style.maxWidth = "360px";
    toast.style.minWidth = "260px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.gap = "10px";
    header.style.marginBottom = "4px";

    const titleEl = document.createElement("div");
    titleEl.style.display = "flex";
    titleEl.style.alignItems = "center";
    titleEl.style.gap = "8px";
    titleEl.style.fontWeight = "900";
    titleEl.style.fontSize = data?.details?.complete === true ? "18px" : "13px";
    titleEl.style.letterSpacing = data?.details?.complete === true ? "0.02em" : "normal";

    if (data?.details?.loading) {
      const spinner = document.createElement("span");
      spinner.setAttribute("aria-hidden", "true");
      spinner.style.width = "13px";
      spinner.style.height = "13px";
      spinner.style.border = "2px solid rgba(240,253,244,0.35)";
      spinner.style.borderTopColor = "#f0fdf4";
      spinner.style.borderRadius = "999px";
      spinner.style.display = "inline-block";
      spinner.style.flex = "0 0 auto";

      try {
        spinner.animate(
          [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
          {
            duration: 850,
            iterations: Infinity,
            easing: "linear",
          }
        );
      } catch (err) {
        // ignore animation failures
      }

      titleEl.appendChild(spinner);
    }

    const titleText = document.createElement("span");
    titleText.textContent = data.title || "Import sent";
    titleEl.appendChild(titleText);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "X";
    closeButton.style.background = "transparent";
    closeButton.style.border = "none";
    closeButton.style.color = "#f0fdf4";
    closeButton.style.cursor = "pointer";
    closeButton.style.fontSize = "18px";
    closeButton.style.lineHeight = "1";
    closeButton.style.fontWeight = "900";
    closeButton.setAttribute("aria-label", "Dismiss EV Parlay import toast");
    closeButton.addEventListener("click", () => {
      toast.remove();
      try {
        sessionStorage.removeItem("EV_PARLAY_LAST_TOAST");
      } catch (err) {
        // ignore
      }
    });

    const messageEl = document.createElement("div");
    messageEl.textContent = data.message || "";
    messageEl.style.lineHeight = "1.35";

    const detailEl = document.createElement("div");
    const chars = Number(data?.details?.characters || 0);
    detailEl.textContent = chars > 0 ? `${chars.toLocaleString()} characters queued` : "";
    detailEl.style.marginTop = "4px";
    detailEl.style.opacity = "0.75";
    detailEl.style.fontSize = "11px";

    const stampEl = document.createElement("div");
    stampEl.textContent = `Last import: ${new Date(data.createdAt || Date.now()).toLocaleTimeString()}`;
    stampEl.style.marginTop = "6px";
    stampEl.style.opacity = "0.85";
    stampEl.style.fontSize = "12px";

    header.appendChild(titleEl);
    header.appendChild(closeButton);

    toast.appendChild(header);
    toast.appendChild(messageEl);
    if (detailEl.textContent) toast.appendChild(detailEl);
    toast.appendChild(stampEl);

    document.body.appendChild(toast);

    if (data?.details?.pulse !== false) {
      try {
        const completePulse = data?.details?.complete === true;

        toast.animate(
          completePulse
            ? [
                { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
                { transform: "scale(1.075)", boxShadow: "0 0 0 8px rgba(147,197,253,0.75), 0 18px 44px rgba(0,0,0,0.32)" },
                { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
                { transform: "scale(1.055)", boxShadow: "0 0 0 5px rgba(147,197,253,0.55), 0 16px 38px rgba(0,0,0,0.28)" },
                { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
              ]
            : [
                { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
                { transform: "scale(1.035)", boxShadow: "0 0 0 5px rgba(134,239,172,0.55), 0 16px 38px rgba(0,0,0,0.28)" },
                { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
              ],
          {
            duration: completePulse ? 1100 : 650,
            easing: "ease-out",
          }
        );
      } catch (err) {
        // ignore animation failures
      }
    }
  }

  renderToast(payload);

  if (!window.__evParlayToastRestoreAttached) {
    window.__evParlayToastRestoreAttached = true;

    const restoreToast = () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("EV_PARLAY_LAST_TOAST") || "null");
        if (saved && saved.title) {
          renderToast(saved);
        }
      } catch (err) {
        // ignore
      }
    };

    window.addEventListener("focus", restoreToast);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) restoreToast();
    });
  }
}

function writeImportIntoAppQueue(finalText, source) {
  const key = "EV_IMPORT_QUEUE";

  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(queue)) queue = [];
  } catch (err) {
    queue = [];
  }

  queue.push({
    id: String(source || "book").toLowerCase() + "_" + Date.now(),
    source: source || "Unknown",
    text: finalText,
  });

  localStorage.setItem(key, JSON.stringify(queue));

  window.dispatchEvent(
    new CustomEvent("ev-parlay-import-queued", {
      detail: {
        source: source || "Unknown",
        length: String(finalText || "").length,
      },
    })
  );
}

async function extractOddsTextFromCurrentPage() {
  function isLiveStartText(value) {
  const text = clean(value).toLowerCase();

  return (
    /\blive\b/.test(text) ||
    /\btop\s+\d/.test(text) ||
    /\bbottom\s+\d/.test(text) ||
    /\bend\s+\d/.test(text) ||
    /\bperiod\b/.test(text) ||
    /\bquarter\b/.test(text) ||
    /\bhalf\b/.test(text) ||
    /\bb:\d\b/.test(text) ||
    /\bs:\d\b/.test(text) ||
    /\bo:\d\b/.test(text)
  );
}
  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

    function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

    function isElementVisible(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    }

    function isSafeExpandText(text) {
      const value = clean(text).toLowerCase();

      return (
        value === "see more" ||
        value === "show more" ||
        value === "show all" ||
        value === "load more" ||
        value === "expand all" ||
        /^show\s+more\b/i.test(value) ||
        /^see\s+more\b/i.test(value)
      );
    }

    async function openDetailsDrawers() {
      let changed = false;

      document.querySelectorAll("details").forEach((details) => {
        if (!details.open) {
          details.open = true;
          changed = true;
        }
      });

      if (changed) await sleep(350);
    }

    function getElementText(el) {
      return clean(
        el?.innerText ||
          el?.textContent ||
          el?.getAttribute?.("aria-label") ||
          el?.getAttribute?.("title") ||
          ""
      );
    }

    function findClickableAncestor(el) {
      let current = el;

      for (let depth = 0; current && depth < 8; depth += 1) {
        const tag = String(current.tagName || "").toUpperCase();
        const role = String(current.getAttribute?.("role") || "").toLowerCase();
        const tabIndex = current.getAttribute?.("tabindex");
        const className = String(current.className || "").toLowerCase();

        if (
          tag === "BUTTON" ||
          tag === "A" ||
          role === "button" ||
          current.onclick ||
          tabIndex !== null ||
          /button|click|expand|show|more|accordion|drawer|market|option/.test(className)
        ) {
          return current;
        }

        current = current.parentElement;
      }

      return el;
    }

    function getSafeExpandCandidates() {
      const directButtons = Array.from(
        document.querySelectorAll("button, a, [role='button']")
      );

      const textMatches = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;
          return isSafeExpandText(getElementText(el));
        })
        .map(findClickableAncestor);

      const all = [...directButtons, ...textMatches];
      const seen = new Set();
      const unique = [];

      for (const el of all) {
        if (!el || seen.has(el)) continue;
        seen.add(el);
        unique.push(el);
      }

      return unique.filter((el) => isElementVisible(el) && isSafeExpandText(getElementText(el)));
    }

    async function clickElementReliably(el) {
      try {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        await sleep(120);

        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        el.click();

        return true;
      } catch (err) {
        try {
          el.click();
          return true;
        } catch (innerErr) {
          return false;
        }
      }
    }

    async function clickElementAtCenterReliably(el) {
      if (!el) return false;

      try {
        el.scrollIntoView({ block: "center", inline: "center" });
        await sleep(180);

        const rect = el.getBoundingClientRect();
        const x = Math.max(1, Math.floor(rect.left + rect.width / 2));
        const y = Math.max(1, Math.floor(rect.top + rect.height / 2));
        const hit = document.elementFromPoint(x, y) || el;

        const eventOptions = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          button: 0,
          buttons: 1,
        };

        const pointerOptions = {
          ...eventOptions,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          pressure: 0.5,
        };

        const targets = Array.from(
          new Set([
            hit,
            el,
            el.closest?.("li"),
            el.closest?.("button"),
            el.closest?.("[role='button']"),
            el.closest?.("[role='tab']"),
            el.parentElement,
          ].filter(Boolean))
        );

        for (const target of targets) {
          try {
            target.dispatchEvent(new PointerEvent("pointerover", pointerOptions));
            target.dispatchEvent(new PointerEvent("pointerenter", pointerOptions));
            target.dispatchEvent(new MouseEvent("mouseover", eventOptions));
            target.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
            target.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
            target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
            target.dispatchEvent(new PointerEvent("pointerup", pointerOptions));
            target.dispatchEvent(new MouseEvent("mouseup", eventOptions));
            target.dispatchEvent(new MouseEvent("click", eventOptions));
          } catch (err) {
            // continue trying other targets
          }
        }

        try {
          hit.click?.();
        } catch (err) {
          // ignore
        }

        try {
          el.click?.();
        } catch (err) {
          // ignore
        }

        await sleep(250);

        return true;
      } catch (err) {
        try {
          el.click();
          return true;
        } catch (innerErr) {
          return false;
        }
      }
    }


    async function clickSafeExpandButtons() {
      let totalClicked = 0;
      const clickedTextSnapshots = new Set();

      for (let pass = 0; pass < 8; pass += 1) {
        const candidates = getSafeExpandCandidates();
        let clickedThisPass = 0;

        for (const el of candidates) {
          if (!isElementVisible(el)) continue;

          const text = getElementText(el);
          if (!isSafeExpandText(text)) continue;

          const rect = el.getBoundingClientRect();
          const snapshot = `${text}::${Math.round(rect.top)}::${Math.round(rect.left)}`;

          if (clickedTextSnapshots.has(snapshot)) continue;

          const ok = await clickElementReliably(el);

          if (ok) {
            clickedTextSnapshots.add(snapshot);
            clickedThisPass += 1;
            totalClicked += 1;
            await sleep(500);
          }

          if (totalClicked >= 120) break;
        }

        if (totalClicked >= 120 || clickedThisPass === 0) break;

        await sleep(650);
      }

      if (totalClicked) await sleep(1000);

      return totalClicked;
    }

    function getScrollableContainers() {
      return Array.from(document.querySelectorAll("*")).filter((el) => {
        if (!isElementVisible(el)) return false;

        const style = window.getComputedStyle(el);
        const canScrollY =
          /(auto|scroll)/i.test(style.overflowY || "") &&
          el.scrollHeight > el.clientHeight + 80;

        const canScrollX =
          /(auto|scroll)/i.test(style.overflowX || "") &&
          el.scrollWidth > el.clientWidth + 80;

        return canScrollY || canScrollX;
      });
    }

    async function scrollPageAndContainers() {
      const originalWindowY = window.scrollY;

      window.scrollTo(0, 0);
      await sleep(150);

      window.scrollTo(0, document.body.scrollHeight);
      await sleep(400);

      window.scrollTo(0, originalWindowY);
      await sleep(150);

      const containers = getScrollableContainers().slice(0, 20);

      for (const el of containers) {
        const originalTop = el.scrollTop;
        const originalLeft = el.scrollLeft;

        try {
          el.scrollTop = 0;
          el.scrollLeft = 0;
          await sleep(100);

          el.scrollTop = el.scrollHeight;
          el.scrollLeft = el.scrollWidth;
          await sleep(250);

          el.scrollTop = originalTop;
          el.scrollLeft = originalLeft;
        } catch (err) {
          // ignore scroll failures
        }
      }

      await sleep(250);
    }

    async function preparePageForExtraction() {
      await openDetailsDrawers();
      await clickSafeExpandButtons();
      await scrollPageAndContainers();

      // Second pass catches sections revealed by the first pass.
      await openDetailsDrawers();
      await clickSafeExpandButtons();
    }

    function isSafeBetMgmMarketTabText(value) {
      const text = clean(value).toLowerCase();

      const allowed = new Set([


        "player points",
        "player rebounds",
        "player assists",
        "player three-pointers",
        "player shots",
        "player points + rebounds + assists",
        "player points + assists",
        "player points + rebounds",
        "player rebounds + assists",
        "player double-double",
        "player triple-double",

        "anytime goalscorer",
        "first goalscorer",
        "player to score 2+ goals",
        "player to score 3+ goals",
        "player points",
        "player assists",
        "player power play points",
        "goalie saves",
        "goalie shutouts",
        "goals against"
      ]);

      if (allowed.has(text)) return true;

      return (
        /^player (points|rebounds|assists|three-pointers|shots)$/i.test(text) ||
        /^goalie (saves|shutouts)$/i.test(text) ||
        /^goals against$/i.test(text) ||
        /^anytime goalscorer$/i.test(text) ||
        /^first goalscorer$/i.test(text)
      );
    }

    function getSafeBetMgmMarketButtons() {
      return Array.from(document.querySelectorAll("button, a, [role='button']"))
        .filter(isElementVisible)
        .filter((el) => {
          const text = clean(
            el.innerText ||
              el.textContent ||
              el.getAttribute("aria-label") ||
              el.getAttribute("title") ||
              ""
          );

          if (!isSafeBetMgmMarketTabText(text)) return false;

          // Avoid obvious alt-line/promo/disruptive areas for now.
          if (/alternate|boost|pre-built|method of first basket|correct score|winning margin/i.test(text)) {
            return false;
          }

          return true;
        })
        .slice(0, 45);
    }

    function normalizeRawTextForMerge(text) {
      return String(text || "")
        .split("\n")
        .map((line) => clean(line))
        .filter(Boolean)
        .join("\n");
    }

    function mergeRawTextBlocks(blocks) {
      const seen = new Set();
      const merged = [];

      for (const block of blocks) {
        const normalized = normalizeRawTextForMerge(block);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        merged.push(String(block || "").trim());
      }

      return merged.join("\n\n").trim();
    }

    function getBetMgmScrollableTargets() {
      const candidates = Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;

          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);

          const canScrollY =
            /(auto|scroll)/i.test(style.overflowY || "") &&
            el.scrollHeight > el.clientHeight + 120;

          if (!canScrollY) return false;

          // BetMGM often renders odds inside a central scroll container.
          // Prefer large visible containers over tiny nested widgets.
          return rect.height >= 250 && rect.width >= 250;
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();

          const aArea = ar.width * ar.height;
          const bArea = br.width * br.height;

          return bArea - aArea;
        });

      return candidates.slice(0, 8);
    }

    async function captureBetMgmAcrossScroll(captures, label) {
      const originalWindowY = window.scrollY || 0;
      const windowStep = Math.max(650, Math.floor(window.innerHeight * 0.85));
      const maxPasses = 10;

      // First sweep the regular window.
      let lastWindowY = -1;

      for (let pass = 0; pass < maxPasses; pass += 1) {
        await clickSafeExpandButtons();
        await sleep(500);

        const text = rawPageText();
        if (text) {
          captures.push(`BETMGM_WINDOW_SCROLL_CAPTURE: ${label || "page"} pass ${pass + 1}\n${text}`);
        }

        const currentY = window.scrollY || 0;
        const nextY = Math.min(
          document.body.scrollHeight || 0,
          currentY + windowStep
        );

        if (nextY === currentY || currentY === lastWindowY) break;

        lastWindowY = currentY;
        window.scrollTo(0, nextY);
        await sleep(900);
      }

      window.scrollTo(0, originalWindowY);
      await sleep(500);

      // Then sweep internal scroll containers. This is the important part for BetMGM landing pages.
      const targets = getBetMgmScrollableTargets();

      for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
        const target = targets[targetIndex];
        const originalTop = target.scrollTop || 0;
        const step = Math.max(500, Math.floor(target.clientHeight * 0.85));
        let lastTop = -1;

        try {
          target.scrollTop = 0;
          await sleep(500);

          for (let pass = 0; pass < maxPasses; pass += 1) {
            await clickSafeExpandButtons();
            await sleep(500);

            const text = rawPageText();
            if (text) {
              captures.push(
                `BETMGM_CONTAINER_SCROLL_CAPTURE: ${label || "page"} container ${targetIndex + 1} pass ${pass + 1}\n${text}`
              );
            }

            const currentTop = target.scrollTop || 0;
            const nextTop = Math.min(target.scrollHeight || 0, currentTop + step);

            if (nextTop === currentTop || currentTop === lastTop) break;

            lastTop = currentTop;
            target.scrollTop = nextTop;
            target.dispatchEvent(new Event("scroll", { bubbles: true }));
            await sleep(950);
          }

          target.scrollTop = originalTop;
          target.dispatchEvent(new Event("scroll", { bubbles: true }));
          await sleep(300);
        } catch (err) {
          // ignore container scroll failures
        }
      }

      window.scrollTo(0, originalWindowY);
      await sleep(400);
    }

    async function buildBetMgmCombinedRawText() {
      const captures = [];

      await preparePageForExtraction();
      captures.push(`BETMGM_INITIAL_CAPTURE\n${rawPageText()}`);

      // This helps BetMGM landing pages where only visible games are rendered.
      await captureBetMgmAcrossScroll(captures, "initial page");

      // Re-collect buttons after the scroll pass because BetMGM may render more controls.
      const buttons = getSafeBetMgmMarketButtons();

      const seenLabels = new Set();

      for (const button of buttons) {
        const label = clean(
          button.innerText ||
            button.textContent ||
            button.getAttribute("aria-label") ||
            button.getAttribute("title") ||
            ""
        );

        if (!label || seenLabels.has(label.toLowerCase())) continue;
        seenLabels.add(label.toLowerCase());

        try {
          await clickElementReliably(button);
          await sleep(1500);

          // BetMGM often needs a second pass after market hydration.
          await clickSafeExpandButtons();
          await sleep(900);
          await clickSafeExpandButtons();
          await sleep(900);

          const captured = rawPageText();
          if (captured) {
            captures.push(`BETMGM_MARKET_CAPTURE: ${label}\n${captured}`);
          }

          // If the market itself has scrolling/virtualization, capture more than the first screen.
          await captureBetMgmAcrossScroll(captures, label);
        } catch (err) {
          // ignore BetMGM market click failures
        }
      }

      return mergeRawTextBlocks(captures);
    }

function normalizeDraftKingsLabel(value) {
  const text = clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*o\s*\/\s*u\s*\)\s*/gi, " o/u")
    .replace(/\s+o\s*\/\s*u\b/gi, " o/u")
    .trim();

  // Keep NBA combo O/U labels stable even if DK uses parentheses.
  if (/^pts \+ reb \+ ast o\/u$/i.test(text)) return "pts + reb + ast o/u";
  if (/^pts \+ reb o\/u$/i.test(text)) return "pts + reb o/u";
  if (/^pts \+ ast o\/u$/i.test(text)) return "pts + ast o/u";
  if (/^reb \+ ast o\/u$/i.test(text)) return "reb + ast o/u";

  // Normalize common NBA combo spelling variants.
  if (/^double[\s-]double$/i.test(text)) return "double-double";
  if (/^triple[\s-]double$/i.test(text)) return "triple-double";
  if (/^to record a double[\s-]double$/i.test(text)) return "double-double";
  if (/^to record a triple[\s-]double$/i.test(text)) return "triple-double";

  // NHL aliases added without changing NBA labels.
  if (/^goalie props?$/i.test(text)) return "goalie";
  if (/^goalies?$/i.test(text)) return "goalie";
  if (/^goalie \/ defense$/i.test(text)) return "goalie";
  if (/^goalie\/defense$/i.test(text)) return "goalie";

  if (/^goal scorer$/i.test(text)) return "goalscorer";
  if (/^anytime goalscorer$/i.test(text)) return "goalscorer";
  if (/^anytime goal scorer$/i.test(text)) return "goalscorer";

  if (/^sog$/i.test(text)) return "shots on goal";
  if (/^player shots$/i.test(text)) return "shots on goal";
  if (/^total shots$/i.test(text)) return "shots on goal";

  return text;
}

function isDraftKingsNoisyLabel(value) {
  return /popular|quick hits|sgp|builder|stats|halves|quarters|team props|game props|specials|featured|same game parlay|all odds|my bets/i.test(
    String(value || "")
  );
}

    function getDraftKingsMarketContentPattern(label) {
      const normalized = normalizeDraftKingsLabel(label);

      if (normalized === "game lines") return /\b(Puck Line|Spread|Total|Moneyline)\b/i;
      if (normalized === "points") return /\b(Points|Points O\/U|PPG)\b/i;
      if (normalized === "threes") return /\b(Threes|Threes O\/U|Made Threes|3\+ Made Threes)\b/i;
      if (normalized === "rebounds") return /\b(Rebounds|Rebounds O\/U|RPG)\b/i;
      if (normalized === "assists") return /\b(Assists|Assists O\/U|APG)\b/i;
      if (normalized === "combos") return /\b(Pts \+ Reb \+ Ast|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast|Double-Double|Triple-Double)\b/i;

      if (normalized === "goalscorer") return /\b(Goalscorer|Goal Scorer|Anytime Goalscorer)\b/i;
      if (normalized === "shots on goal") return /\bShots On Goal\b[\s\S]{0,900}\bShots On Goal O\/U\b/i;
      if (normalized === "goalie") return /\b(Goalie|Saves|Saves O\/U)\b/i;
      if (normalized === "blocks") return /\b(Blocks|Blocked Shots)\b/i;

      return new RegExp(`\\b${label}\\b`, "i");
    }

    function getDraftKingsClickableByExactText(label) {
      const wanted = normalizeDraftKingsLabel(label);
      if (!wanted) return null;

      const directCandidates = Array.from(
        document.querySelectorAll("button, a, [role='button'], [role='tab']")
      )
        .filter(isElementVisible)
        .map((el) => ({
          el,
          text: normalizeDraftKingsLabel(getElementText(el)),
        }))
        .filter(({ text }) => text === wanted && !isDraftKingsNoisyLabel(text));

      if (directCandidates[0]?.el) {
        return directCandidates[0].el;
      }

      // Safer fallback: exact visible text node, but only if its clickable ancestor is not
      // a giant page/body container. This avoids clicking MY BETS/page shell.
      const textMatches = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;

          const text = normalizeDraftKingsLabel(getElementText(el));
          if (text !== wanted || isDraftKingsNoisyLabel(text)) return false;

          const rect = el.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8 && rect.width < 320 && rect.height < 80;
        })
        .map((el) => {
          const clickable = findClickableAncestor(el);
          if (!clickable || !isElementVisible(clickable)) return null;

          const rect = clickable.getBoundingClientRect();

          // Avoid giant containers.
          if (rect.width > 500 || rect.height > 140) return null;

          return clickable;
        })
        .filter(Boolean);

      return textMatches[0] || null;
    }

    async function waitForDraftKingsMarketContent(label, timeoutMs = 6500) {
      const pattern = getDraftKingsMarketContentPattern(label);
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        const text = rawPageText();

        if (pattern.test(text)) {
          return true;
        }

        await sleep(350);
      }

      return false;
    }

    async function clickDraftKingsLabelAndCapture(label, captures) {
      const button = getDraftKingsClickableByExactText(label);

      if (!button) {
        captures.push(`DRAFTKINGS_MISSING_TAB: ${label}\n${rawPageText()}`);
        return false;
      }

      try {
        await clickElementReliably(button);
        await sleep(900);

        // Do not run full preparePageForExtraction here.
        // DK can jump to MY BETS or a shell page if broad expand clicking runs after a tab click.
        await openDetailsDrawers();

        const loaded = await waitForDraftKingsMarketContent(label);
        const captured = rawPageText();

        if (captured && captured.trim()) {
          captures.push(
            `DRAFTKINGS_MARKET_CAPTURE: ${label}${loaded ? "" : " (NO_CONTENT_MATCH)"}\n${captured}`
          );
          return loaded;
        }
      } catch (err) {
        captures.push(`DRAFTKINGS_CLICK_ERROR: ${label}\n${rawPageText()}`);
      }

      return false;
    }

function getDraftKingsComboSubheaderLabels() {
  return [
    "Pts + Reb + Ast",
    "Double-Double",
    "Triple-Double",
    "Pts + Reb",
    "Pts + Ast",
    "Reb + Ast",

    // DK may display these with or without parentheses depending on page/state.
    "Reb + Ast O/U",
    "Reb + Ast (O/U)",
    "Pts + Reb + Ast O/U",
    "Pts + Reb + Ast (O/U)",
    "Pts + Reb O/U",
    "Pts + Reb (O/U)",
    "Pts + Ast O/U",
    "Pts + Ast (O/U)",
  ];
}

    async function clickDraftKingsComboSubheaders(captures) {
      for (const label of getDraftKingsComboSubheaderLabels()) {
        const button = getDraftKingsClickableByExactText(label);

        if (!button) continue;

        try {
          await clickElementReliably(button);
          await sleep(900);
          await openDetailsDrawers();

          const captured = rawPageText();

          if (captured && captured.trim()) {
            captures.push(`DRAFTKINGS_COMBO_CAPTURE: ${label}\n${captured}`);
          }
        } catch (err) {
          // ignore combo subheader click failures
        }

        await sleep(350);
      }
    }

function getDraftKingsWorkflowLabels() {
  const pageText = clean(document.body?.innerText || "");
  const lowerPath = String(window.location.pathname || "").toLowerCase();

  const breadcrumbMatch = pageText.match(
    /Sportsbook\s*\/\s*[^/]{0,80}Odds\s*\/\s*[^/]{0,80}Odds/i
  );

  const breadcrumbText = clean(breadcrumbMatch?.[0] || "").toLowerCase();

  const isLikelyNhl =
    /\/nhl\b|nhl-odds|hockey-odds/i.test(lowerPath) ||
    /\bhockey odds\b|\bnhl odds\b/i.test(breadcrumbText);

  if (isLikelyNhl) {
    return [
      "Game Lines",
      "Goalscorer",
      "Shots On Goal",
      "Points",
      "Assists",
      "Goalie",
    ];
  }

  return [
    "POINTS",
    "THREES",
    "REBOUNDS",
    "ASSISTS",
    "COMBOS",

    // Combo subheaders after COMBOS is open.
    "Pts + Reb + Ast",
    "Pts + Reb",
    "Pts + Ast",
    "Reb + Ast",
    "Double-Double",
    "Double Double",
    "To Record A Double-Double",
    "To Record A Double Double",
    "Triple-Double",
    "Triple Double",
    "To Record A Triple-Double",
    "To Record A Triple Double",
    "Pts + Reb + Ast O/U",
    "Pts + Reb O/U",
    "Pts + Ast O/U",
    "Reb + Ast O/U",
  ];
}

    function getDraftKingsWorkflowProgressKey() {
      const path = String(window.location.pathname || "");
      return `EV_DK_WORKFLOW_PROGRESS::${path}`;
    }

    function getDraftKingsNextWorkflowLabel() {
      const labels = getDraftKingsWorkflowLabels();
      const key = getDraftKingsWorkflowProgressKey();
      const stored = Number(sessionStorage.getItem(key));
      const nextIndex = Number.isFinite(stored) ? stored : 0;

      if (nextIndex >= labels.length) {
        sessionStorage.removeItem(key);
        return "";
      }

      const nextLabel = labels[nextIndex];
      sessionStorage.setItem(key, String(nextIndex + 1));

      return nextLabel;
    }

    function scheduleDraftKingsClickByLabel(label) {
      if (!label) return false;

      window.setTimeout(() => {
        try {
          const wanted = clean(label);

          let button = getDraftKingsClickableByExactText(wanted);

          if (!button) {
            button = findClickableByExactVisibleText(wanted, {
              maxWidth: 520,
              maxHeight: 140,
            });
          }

          try {
            sessionStorage.setItem(
              "EV_DK_LAST_CLICK_DEBUG",
              JSON.stringify({
                label: wanted,
                found: !!button,
                text: button ? clean(button.innerText || button.textContent || "") : "",
                className: button ? String(button.className || "") : "",
                at: new Date().toISOString(),
              })
            );
          } catch (storageErr) {
            // ignore storage failures
          }

          if (!button) {
            console.warn("EV Parlay DraftKings button not found:", wanted);
            return;
          }

          button.scrollIntoView({ block: "center", inline: "nearest" });
          button.click();
        } catch (err) {
          console.warn("EV Parlay DraftKings scheduled click failed:", err);
        }
      }, 500);

      return true;
    }

    async function buildDraftKingsOneStepRawText() {
      const captures = [];

      let clickDebug = "";
      try {
        clickDebug = sessionStorage.getItem("EV_DK_LAST_CLICK_DEBUG") || "";
      } catch (err) {
        clickDebug = "";
      }

      // Only safe expansion. Do not broadly click DK shell controls.
      await openDetailsDrawers();
      await clickSafeExpandButtons();
      await sleep(500);

      const current = rawPageText();

      if (current && current.trim()) {
        captures.push(
          `DRAFTKINGS_CURRENT_CAPTURE${clickDebug ? `\nDRAFTKINGS_LAST_CLICK_DEBUG: ${clickDebug}` : ""}\n${current}`
        );
      }

      const nextLabel = getDraftKingsNextWorkflowLabel();

      if (nextLabel) {
        scheduleDraftKingsClickByLabel(nextLabel);
        captures.push(`DRAFTKINGS_SCHEDULED_STEP: ${nextLabel}`);
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }

    async function buildDraftKingsCombinedRawText() {
      const captures = [];

      try {
        await openDetailsDrawers();
        await sleep(350);

        const initialText = rawPageText();
        if (initialText && initialText.trim()) {
          captures.push(`DRAFTKINGS_INITIAL_CAPTURE\n${initialText}`);
        }

        const pageText = clean(document.body?.innerText || "").toLowerCase();

        const isLikelyNhl =
          /hockey|nhl|shots on goal|goalie|goalscorer|bruins|sabres|oilers|ducks|stars|wild|canadiens|lightning|penguins|flyers/i.test(
            pageText
          );

        const targetLabels = isLikelyNhl
          ? ["GOALSCORER", "SHOTS ON GOAL", "POINTS", "ASSISTS", "GOALIE", "BLOCKS"]
          : ["POINTS", "THREES", "REBOUNDS", "ASSISTS", "COMBOS"];

        for (const label of targetLabels) {
          const loaded = await clickDraftKingsLabelAndCapture(label, captures);

          if (label === "COMBOS" && loaded) {
            await clickDraftKingsComboSubheaders(captures);
          }

          await sleep(500);
        }
      } catch (err) {
        // Return whatever we captured rather than breaking the import.
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }

    function findClickableByExactVisibleText(label, options = {}) {
      const wanted = clean(label).toLowerCase();
      const maxWidth = Number(options.maxWidth || 420);
      const maxHeight = Number(options.maxHeight || 120);

      if (!wanted) return null;

      const directCandidates = Array.from(
        document.querySelectorAll("button, a, [role='button'], [role='tab']")
      )
        .filter(isElementVisible)
        .map((el) => ({
          el,
          text: clean(getElementText(el)).toLowerCase(),
        }))
        .filter(({ text }) => text === wanted);

      if (directCandidates[0]?.el) return directCandidates[0].el;

      const textMatches = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;

          const text = clean(getElementText(el)).toLowerCase();
          if (text !== wanted) return false;

          const rect = el.getBoundingClientRect();
          return (
            rect.width > 8 &&
            rect.height > 8 &&
            rect.width <= maxWidth &&
            rect.height <= maxHeight
          );
        })
        .map((el) => {
          const clickable = findClickableAncestor(el);
          if (!clickable || !isElementVisible(clickable)) return null;

          const rect = clickable.getBoundingClientRect();

          // Avoid accidentally clicking a giant page shell.
          if (rect.width > Math.max(maxWidth, 520) || rect.height > Math.max(maxHeight, 160)) {
            return null;
          }

          return clickable;
        })
        .filter(Boolean);

      return textMatches[0] || null;
    }

    async function clickExactVisibleText(label, options = {}) {
      const button = findClickableByExactVisibleText(label, options);
      if (!button) return false;

      try {
        await clickElementReliably(button);
        await sleep(Number(options.sleepMs || 900));
        return true;
      } catch (err) {
        return false;
      }
    }

    async function buildDraftKingsComboOnlyText() {
      const captures = [];

      await openDetailsDrawers();
      await sleep(300);

      const initial = rawPageText();

      if (initial && initial.trim()) {
        captures.push(`DRAFTKINGS_INITIAL_CAPTURE\n${initial}`);
      }

      // This is intentionally narrow. It only expands subheaders that are visible
      // after you are already on the DraftKings COMBOS page.
      const comboPageVisible =
        /\bCOMBOS\b/i.test(initial) &&
        /\b(Pts \+ Reb \+ Ast|Double-Double|Triple-Double|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast)\b/i.test(initial);

      if (!comboPageVisible) {
        return mergeRawTextBlocks(captures) || initial;
      }

      const comboLabels = [
        "Pts + Reb + Ast",
        "Double-Double",
        "Triple-Double",
        "Pts + Reb",
        "Pts + Ast",
        "Reb + Ast",
        "Reb + Ast O/U",
        "Pts + Reb + Ast O/U",
        "Pts + Reb O/U",
        "Pts + Ast O/U",
      ];

      for (const label of comboLabels) {
        const clicked = await clickExactVisibleText(label, {
          maxWidth: 360,
          maxHeight: 90,
          sleepMs: 950,
        });

        if (!clicked) continue;

        await openDetailsDrawers();
        await sleep(300);

        const captured = rawPageText();

        if (captured && captured.trim()) {
          captures.push(`DRAFTKINGS_COMBO_CAPTURE: ${label}\n${captured}`);
        }
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }

    async function buildBetMgmLightPlayerPropsText() {
      const captures = [];

      await openDetailsDrawers();
      await clickSafeExpandButtons();
      await sleep(500);

      const initial = rawPageText();

      if (initial && initial.trim()) {
        captures.push(`BETMGM_INITIAL_CAPTURE\n${initial}`);
      }

      // If the Player props tab/button is visible, enter it. If already there, this is harmless.
      await clickExactVisibleText("Player props", {
        maxWidth: 420,
        maxHeight: 120,
        sleepMs: 1200,
      });

      await openDetailsDrawers();
      await clickSafeExpandButtons();
      await sleep(650);

      const playerPropsCapture = rawPageText();
      if (playerPropsCapture && playerPropsCapture.trim()) {
        captures.push(`BETMGM_PLAYER_PROPS_CAPTURE\n${playerPropsCapture}`);
      }

      // Controlled tab pass. Parser safety still decides whether rows are full-game.
      // Ladders remain blocked parser-side; 1Q/half sections remain blocked parser-side.
      const betMgmLabels = [
        "Points",
        "Assists",
        "Rebounds",
        "Three-pointers",
        "Combo stats",
        "Defense",
      ];

      for (const label of betMgmLabels) {
        const clicked = await clickExactVisibleText(label, {
          maxWidth: 420,
          maxHeight: 120,
          sleepMs: 1000,
        });

        if (!clicked) continue;

        await openDetailsDrawers();
        await clickSafeExpandButtons();
        await sleep(650);

        const captured = rawPageText();

        if (captured && captured.trim()) {
          captures.push(`BETMGM_MARKET_CAPTURE: ${label}\n${captured}`);
        }
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }

function normalizeFanDuelLabel(value) {
  const text = clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();

  if (/^to record a double[-\s]double$/i.test(text)) return "to record a double double";
  if (/^double[-\s]double$/i.test(text)) return "to record a double double";

  if (/^to record a triple[-\s]double$/i.test(text)) return "to record a triple double";
  if (/^triple[-\s]double$/i.test(text)) return "to record a triple double";

  return text;
}

      function isSafeFanDuelExpandableText(value) {
      const text = clean(value);

      if (!text) return false;

      // Avoid quarter/period/half markets for now.
      if (/\b(1st|2nd|3rd|4th)\s+(Quarter|Period)\b/i.test(text)) return false;
      if (/\b(1st|2nd)\s+Half\b/i.test(text)) return false;
      if (/^Overtime$/i.test(text)) return false;

      const exact = new Set([
        // NBA top tabs / useful sections
        "Player Points",
        "Player Made Threes",
        "Player Threes",
        "Player Rebounds",
        "Player Assists",
        "Player Combos",
        "Player Pts + Reb + Ast",
        "Player Pts + Reb",
        "Player Pts + Ast",
        "Player Reb + Ast",
        "To Record A Double Double",
        "To Record A Triple Double",

        // NHL useful sections only
        "Any Time Goal Scorer",
        "Player 1+ Points",
        "Player 1+ Assists",
        "Player to Record 1+ Powerplay Points",
        "60 Min Player to Record 1+ Shots on Goal",
      ]);

      const normalizedText = normalizeFanDuelLabel(text);
      const normalizedExact = new Set(
        Array.from(exact).map((label) => normalizeFanDuelLabel(label))
      );

      if (exact.has(text) || normalizedExact.has(normalizedText)) return true;

      return (
        // NHL full-game O/U style drawers
        /^60 Min .+ Shots on Goal$/i.test(text) ||
        /^60 Min .+ Total Saves$/i.test(text) ||
        /^.+ - 60 Min Alt Saves$/i.test(text) ||
        /^60 Min .+ Total Goals$/i.test(text) ||
        /^.+ Total Goals$/i.test(text)
      );
    }

    function getFanDuelExpandableCandidates() {
      const directButtons = Array.from(
        document.querySelectorAll("button, a, [role='button'], [role='tab']")
      );

      const textMatches = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;

          const text = getElementText(el);
          if (!isSafeFanDuelExpandableText(text)) return false;

          const rect = el.getBoundingClientRect();

          // Avoid giant containers/page shells.
          return rect.width > 8 && rect.height > 8 && rect.width < 520 && rect.height < 140;
        })
        .map(findClickableAncestor);

      const all = [...directButtons, ...textMatches];
      const seen = new Set();
      const unique = [];

      for (const el of all) {
        if (!el || seen.has(el)) continue;
        seen.add(el);

        const text = getElementText(el);
        const childText = Array.from(el.querySelectorAll("*"))
          .map((child) => getElementText(child))
          .find((value) => isSafeFanDuelExpandableText(value));

        const usableText = isSafeFanDuelExpandableText(text) ? text : childText;
        if (!usableText) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width > 650 || rect.height > 180) continue;

        unique.push(el);
      }

      return unique.filter(isElementVisible).slice(0, 80);
    }

      async function clickFanDuelExpandableSections(options = {}) {
      const clicked = new Set();
      let totalClicked = 0;

      const maxPasses = Number(options.maxPasses || 1);
      const maxClicks = Number(options.maxClicks || 10);

      for (let pass = 0; pass < maxPasses; pass += 1) {
        const candidates = getFanDuelExpandableCandidates();
        let clickedThisPass = 0;

        for (const el of candidates) {
          if (!isElementVisible(el)) continue;

          const text = getElementText(el);
          const label = isSafeFanDuelExpandableText(text)
            ? text
            : Array.from(el.querySelectorAll("*"))
                .map((child) => getElementText(child))
                .find((value) => isSafeFanDuelExpandableText(value));

          if (!label) continue;

          // Key by label only. Position keys caused loops when FanDuel shifted content.
          const key = normalizeFanDuelLabel(label);
          if (clicked.has(key)) continue;

          const ok = await clickElementReliably(el);

          if (ok) {
            clicked.add(key);
            clickedThisPass += 1;
            totalClicked += 1;

            await sleep(650);
            await clickFanDuelShowMoreOnly(5);
            await sleep(250);
          }

          if (totalClicked >= maxClicks) break;
        }

        if (totalClicked >= maxClicks || clickedThisPass === 0) break;

        await sleep(450);
      }

      return totalClicked;
    }

        function getFanDuelShowMoreCandidates() {
      const directButtons = Array.from(
        document.querySelectorAll("button, a, [role='button']")
      );

      const textMatches = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;

          const text = getElementText(el);
          if (!/^Show more$/i.test(text)) return false;

          const rect = el.getBoundingClientRect();

          return (
            rect.width > 8 &&
            rect.height > 8 &&
            rect.width < 420 &&
            rect.height < 100
          );
        })
        .map(findClickableAncestor);

      const all = [...directButtons, ...textMatches];
      const seen = new Set();
      const unique = [];

      for (const el of all) {
        if (!el || seen.has(el)) continue;
        seen.add(el);

        if (!isElementVisible(el)) continue;

        const text = getElementText(el);
        const childText = Array.from(el.querySelectorAll("*"))
          .map((child) => getElementText(child))
          .find((value) => /^Show more$/i.test(value));

        if (!/^Show more$/i.test(text) && !childText) continue;

        const rect = el.getBoundingClientRect();

        // Avoid giant containers.
        if (rect.width > 560 || rect.height > 160) continue;

        unique.push(el);
      }

      return unique.slice(0, 12);
    }

    async function clickFanDuelShowMoreOnly(maxClicks = 8) {
      const clicked = new Set();
      let totalClicked = 0;

      for (let pass = 0; pass < 3; pass += 1) {
        const candidates = getFanDuelShowMoreCandidates();
        let clickedThisPass = 0;

        for (const el of candidates) {
          if (!isElementVisible(el)) continue;

          const rect = el.getBoundingClientRect();
          const key = `show-more::${Math.round(rect.top)}::${Math.round(rect.left)}::${Math.round(rect.width)}x${Math.round(rect.height)}`;

          if (clicked.has(key)) continue;

          const ok = await clickElementReliably(el);

          if (ok) {
            clicked.add(key);
            clickedThisPass += 1;
            totalClicked += 1;
            await sleep(450);
          }

          if (totalClicked >= maxClicks) break;
        }

        if (totalClicked >= maxClicks || clickedThisPass === 0) break;

        await sleep(450);
      }

      return totalClicked;
    }

    function isFanDuelNbaGameLandingPage(text) {
      const raw = String(text || "");
      const compact = raw.replace(/\s+/g, " ");

      const hasNbaGamePage =
        /\bBasketball\s*\/\s*NBA Odds\s*\//i.test(compact) ||
        /\bNBA Odds\s*\/.+?\s+@\s+.+?\s+Odds\b/i.test(compact) ||
        /\bSame Game Parlay/i.test(compact);

      const hasPlayerPropTabs =
        /\bPlayer Points\b/i.test(compact) &&
        /\bPlayer Threes\b/i.test(compact) &&
        /\bPlayer Rebounds\b/i.test(compact) &&
        /\bPlayer Assists\b/i.test(compact) &&
        /\bPlayer Combos\b/i.test(compact);

      const alreadyOnPlayerPropPage =
        /\b(Player Points|Player Threes|Player Rebounds|Player Assists|Player Combos) Odds\b/i.test(compact);

      return hasNbaGamePage && hasPlayerPropTabs && !alreadyOnPlayerPropPage;
    }

    function getFanDuelCurrentNbaTabFromText(text) {
      const lines = String(text || "")
        .split("\n")
        .map((line) => clean(line))
        .filter(Boolean);

      const joined = lines.join(" ");
      const path = String(window.location?.pathname || "").toLowerCase();
      const href = String(window.location?.href || "").toLowerCase();

      // Strongest signal: page title / odds heading.
      for (const line of lines) {
        const titleMatch = line.match(
          / @ .+ (Player Points|Player Threes|Player Rebounds|Player Assists|Player Combos) Odds$/i
        );

        if (titleMatch?.[1]) return titleMatch[1];
      }

      // URL fallback. FanDuel sometimes updates route/path more reliably than visible text.
      if (/player[-_/]?points/i.test(path) || /player[-_/]?points/i.test(href)) {
        return "Player Points";
      }

      if (/player[-_/]?threes/i.test(path) || /player[-_/]?threes/i.test(href)) {
        return "Player Threes";
      }

      if (/player[-_/]?rebounds/i.test(path) || /player[-_/]?rebounds/i.test(href)) {
        return "Player Rebounds";
      }

      if (/player[-_/]?assists/i.test(path) || /player[-_/]?assists/i.test(href)) {
        return "Player Assists";
      }

      if (/player[-_/]?combos/i.test(path) || /player[-_/]?combos/i.test(href)) {
        return "Player Combos";
      }

      // Content fallback. These are section-specific markers.
      if (
        /\bTo Score \d+(?:\.\d+)?\+ Points\b/i.test(joined) ||
        /\bPlayer Points\b[\s\S]{0,120}\bOVER\b[\s\S]{0,120}\bUNDER\b/i.test(joined)
      ) {
        return "Player Points";
      }

      if (
        /\b\d+(?:\.\d+)?\+ Made Threes\b/i.test(joined) ||
        /\bPlayer Made Threes\b/i.test(joined) ||
        /\bPlayer Threes Odds\b/i.test(joined)
      ) {
        return "Player Threes";
      }

      if (
        /\bTo Record \d+(?:\.\d+)?\+ Rebounds\b/i.test(joined) ||
        /\bPlayer Rebounds\b[\s\S]{0,120}\bOVER\b[\s\S]{0,120}\bUNDER\b/i.test(joined)
      ) {
        return "Player Rebounds";
      }

      if (
        /\bTo Record \d+(?:\.\d+)?\+ Assists\b/i.test(joined) ||
        /\bPlayer Assists\b[\s\S]{0,120}\bOVER\b[\s\S]{0,120}\bUNDER\b/i.test(joined)
      ) {
        return "Player Assists";
      }

      if (
        /\bTo Record A Double Double\b/i.test(joined) ||
        /\bTo Record A Triple Double\b/i.test(joined) ||
        /\bPlayer Pts \+ Reb \+ Ast\b/i.test(joined) ||
        /\bPlayer Combos Odds\b/i.test(joined)
      ) {
        return "Player Combos";
      }

      return "";
    }

    function isFanDuelNhlGamePage(text) {
      const compact = String(text || "").replace(/\s+/g, " ");
      const path = String(window.location?.pathname || "").toLowerCase();

      return (
        /\/nhl\b|nhl-odds|hockey-odds/i.test(path) ||
        /\bHockey\s*\/\s*NHL Odds\s*\//i.test(compact) ||
        (
          /\bNHL Odds\b/i.test(compact) &&
          /\bGoals\b/i.test(compact) &&
          /\bShots\b/i.test(compact) &&
          /\bPoints\/Assists\b/i.test(compact) &&
          /\bGoalies\b/i.test(compact)
        )
      );
    }

    function getFanDuelNhlWorkflowProgressKey() {
      const path = String(window.location.pathname || "");
      return `EV_FD_NHL_WORKFLOW_PROGRESS::${path}`;
    }

    function getFanDuelNextNhlWorkflowLabel() {
      const labels = [
        "Goals",
        "Shots",
        "Points/Assists",
        "Goalies",
      ];

      const key = getFanDuelNhlWorkflowProgressKey();
      const stored = Number(sessionStorage.getItem(key));
      const nextIndex = Number.isFinite(stored) ? stored : 0;

      if (nextIndex >= labels.length) {
        sessionStorage.removeItem(key);
        return "";
      }

      const nextLabel = labels[nextIndex];
      sessionStorage.setItem(key, String(nextIndex + 1));

      return nextLabel;
    }

    async function buildFanDuelOneNextNhlTabRawText() {
      const captures = [];

      const initial = rawPageText();

      if (initial && initial.trim()) {
        captures.push(`FANDUEL_NHL_INITIAL_CAPTURE\n${initial}`);
      }

      const showMoreClicked = await clickFanDuelShowMoreOnly(8);
      await sleep(650);

      const expandedClicked = await clickFanDuelExpandableSections({
        maxPasses: 1,
        maxClicks: 12,
      });

      await sleep(650);
      await clickFanDuelShowMoreOnly(8);

      const currentText = rawPageText();

      if (currentText && currentText.trim()) {
        captures.push(
          `FANDUEL_NHL_CURRENT_CAPTURE: show more ${showMoreClicked}; headers ${expandedClicked}\n${currentText}`
        );
      }

      const nextLabel = getFanDuelNextNhlWorkflowLabel();

      if (nextLabel) {
        scheduleFanDuelClickByLabel(nextLabel);

        captures.push(`FANDUEL_SCHEDULED_NEXT_TAB: NHL -> ${nextLabel}`);
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }

    function getFanDuelNextNbaTab(currentTab) {
      const order = [
        "Player Points",
        "Player Threes",
        "Player Rebounds",
        "Player Assists",
        "Player Combos",
      ];

      const currentIndex = order.findIndex(
        (label) => label.toLowerCase() === String(currentTab || "").toLowerCase()
      );

      if (currentIndex === -1) return "";
      return order[currentIndex + 1] || "";
    }

    function getFanDuelNbaInternalHeaderOrder(currentTab) {
      const tab = String(currentTab || "").trim().toLowerCase();

      // FAST MODE:
      // For Points / Threes / Rebounds / Assists, do NOT walk every ladder.
      // Capture the visible page, open the O/U drawer, then move to the next top tab.
      if (
        tab === "player points" ||
        tab === "player threes" ||
        tab === "player rebounds" ||
        tab === "player assists"
      ) {
        return [];
      }

      // Combos still need explicit drawer/header opens because each combo market
      // is usually a separate section.
      if (tab === "player combos") {
        return [
          "To Record A Double Double",
          "To Record A Triple Double",
          "Player Pts + Reb + Ast",
          "Player Pts + Reb",
          "Player Pts + Ast",
          "Player Reb + Ast",
        ];
      }

      return [];
    }

    function getFanDuelInternalProgressKey(currentTab) {
      const path = String(window.location.pathname || "");
      const tab = normalizeFanDuelLabel(currentTab || "unknown");
      return `EV_FD_INTERNAL_PROGRESS::${path}::${tab}`;
    }

    function getFanDuelInitialInternalIndex(currentTab, text) {
      const order = getFanDuelNbaInternalHeaderOrder(currentTab);
      if (!order.length) return 0;

      const rawText = String(text || "");

      // FanDuel usually opens the first ladder by default:
      // Points = 5+, Threes = 1+, Rebounds = 4+, Assists = 2+,
      // Combos = Double Double.
      // So the next thing to click should usually be index 1.
      if (rawText.toLowerCase().includes(order[0].toLowerCase())) {
        return 1;
      }

      return 0;
    }

    function getFanDuelNextInternalHeader(currentTab, text) {
      const order = getFanDuelNbaInternalHeaderOrder(currentTab);
      if (!order.length) return "";

      const key = getFanDuelInternalProgressKey(currentTab);
      const stored = Number(sessionStorage.getItem(key));

      let nextIndex = Number.isFinite(stored)
        ? stored
        : getFanDuelInitialInternalIndex(currentTab, text);

      if (nextIndex >= order.length) {
        sessionStorage.removeItem(key);
        return "";
      }

      const nextHeader = order[nextIndex];

      sessionStorage.setItem(key, String(nextIndex + 1));

      return nextHeader;
    }

    function getFanDuelOuProgressKey(currentTab) {
      const path = String(window.location.pathname || "");
      const tab = normalizeFanDuelLabel(currentTab || "unknown");
      return `EV_FD_OU_PROGRESS::${path}::${tab}`;
    }

    function getFanDuelOuHeaderForTab(currentTab) {
      const tab = String(currentTab || "").trim().toLowerCase();

      if (tab === "player points") return "Player Points";
      if (tab === "player threes") return "Player Made Threes";
      if (tab === "player rebounds") return "Player Rebounds";
      if (tab === "player assists") return "Player Assists";

      return "";
    }

    function hasFanDuelOuDrawerBeenScheduled(currentTab) {
      try {
        return sessionStorage.getItem(getFanDuelOuProgressKey(currentTab)) === "done";
      } catch (err) {
        return false;
      }
    }

    function markFanDuelOuDrawerScheduled(currentTab) {
      try {
        sessionStorage.setItem(getFanDuelOuProgressKey(currentTab), "done");
      } catch (err) {
        // ignore
      }
    }

    function resetFanDuelInternalProgress(currentTab) {
      try {
        sessionStorage.removeItem(getFanDuelInternalProgressKey(currentTab));
        sessionStorage.removeItem(getFanDuelOuProgressKey(currentTab));
      } catch (err) {
        // ignore
      }
    }

    function scheduleFanDuelOuDrawerClick(currentTab) {
      const label = getFanDuelOuHeaderForTab(currentTab);
      if (!label) return false;

      window.setTimeout(() => {
        try {
          const wanted = normalizeFanDuelLabel(label);

          const candidates = Array.from(document.querySelectorAll("body *"))
            .filter((el) => {
              if (!isElementVisible(el)) return false;

              const text = normalizeFanDuelLabel(getElementText(el));
              if (text !== wanted) return false;

              const rect = el.getBoundingClientRect();

              return (
                rect.width > 8 &&
                rect.height > 8 &&
                rect.width < 620 &&
                rect.height < 160
              );
            })
            .map((el) => {
              const clickable = findClickableAncestor(el);
              if (!clickable || !isElementVisible(clickable)) return null;

              const rect = clickable.getBoundingClientRect();
              if (rect.width > 760 || rect.height > 220) return null;

              return clickable;
            })
            .filter(Boolean)
            .sort((a, b) => {
              // Prefer lower matching label on the page.
              // This avoids the top navigation tab when the O/U drawer uses the same text.
              return b.getBoundingClientRect().top - a.getBoundingClientRect().top;
            });

          const button = candidates[0];

          if (button) {
            button.scrollIntoView({ block: "center", inline: "nearest" });
            button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
            button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
            button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            button.click();
          }
        } catch (err) {
          // ignore scheduled FanDuel O/U drawer click failures
        }
      }, 150);

      return true;
    }

       function scheduleFanDuelClickByLabel(label) {
      if (!label) return false;

      window.setTimeout(() => {
        try {
          const button = findClickableByExactVisibleText(label, {
            maxWidth: 520,
            maxHeight: 140,
          });

          if (button) {
            button.scrollIntoView({ block: "center", inline: "nearest" });
            button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
            button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
            button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            button.click();
          }
        } catch (err) {
          // ignore scheduled FanDuel click failures
        }
      }, 150);

      return true;
    }

    async function buildFanDuelOneNextNbaTabRawText() {
      const captures = [];

      const initial = rawPageText();

      if (initial && initial.trim()) {
        captures.push(`FANDUEL_INITIAL_CAPTURE\n${initial}`);
      }

      const currentTab = getFanDuelCurrentNbaTabFromText(initial);

      const currentShowMoreClicked = await clickFanDuelShowMoreOnly(8);
      await sleep(650);

      const currentText = rawPageText();

      if (currentText && currentText.trim()) {
        captures.push(
          `FANDUEL_CURRENT_CAPTURE: ${currentTab || "unknown"}; show more ${currentShowMoreClicked}\n${currentText}`
        );
      }

      const nextInternalHeader = getFanDuelNextInternalHeader(currentTab, currentText);

      if (nextInternalHeader) {
        scheduleFanDuelClickByLabel(nextInternalHeader);

        captures.push(
          `FANDUEL_SCHEDULED_INTERNAL_HEADER: ${currentTab || "unknown"} -> ${nextInternalHeader}`
        );

        return mergeRawTextBlocks(captures) || rawPageText();
      }

      const ouHeader = getFanDuelOuHeaderForTab(currentTab);
      const ouAlreadyScheduled = hasFanDuelOuDrawerBeenScheduled(currentTab);

      if (ouHeader && !ouAlreadyScheduled) {
        markFanDuelOuDrawerScheduled(currentTab);
        scheduleFanDuelOuDrawerClick(currentTab);

        captures.push(
          `FANDUEL_SCHEDULED_OU_DRAWER: ${currentTab || "unknown"} -> ${ouHeader}`
        );

        return mergeRawTextBlocks(captures) || rawPageText();
      }

      const nextTab = getFanDuelNextNbaTab(currentTab);

      if (nextTab) {
        resetFanDuelInternalProgress(currentTab);
        scheduleFanDuelClickByLabel(nextTab);

        captures.push(`FANDUEL_SCHEDULED_NEXT_TAB: ${currentTab || "unknown"} -> ${nextTab}`);
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }

        async function buildFanDuelExpandedRawText() {
      const captures = [];

      function getFanDuelSectionLabelsForPage(text) {
        const pageText = clean(text).toLowerCase();

        const isLikelyNhl =
          /\bhockey\b/i.test(pageText) ||
          /\bnhl odds\b/i.test(pageText) ||
          /\bshots on goal\b/i.test(pageText) ||
          /\bgoalies\b/i.test(pageText) ||
          /\bany time goal scorer\b/i.test(pageText) ||
          /\btotal saves\b/i.test(pageText);

        const isLikelyNba =
          /\bbasketball\b/i.test(pageText) ||
          /\bnba odds\b/i.test(pageText) ||
          /\bplayer points\b/i.test(pageText) ||
          /\bplayer rebounds\b/i.test(pageText) ||
          /\bplayer assists\b/i.test(pageText) ||
          /\bplayer combos\b/i.test(pageText) ||
          /\bplayer pts \+ reb/i.test(pageText);

        if (isLikelyNhl) {
          return ["Goals", "Shots", "Points/Assists", "Goalies"];
        }

        if (isLikelyNba) {
          return [
            "Player Points",
            "Player Threes",
            "Player Rebounds",
            "Player Assists",
            "Player Combos",
          ];
        }

        return [];
      }

      async function captureFanDuelSnapshot(label) {
        await sleep(450);

        const text = rawPageText();

        if (text && text.trim()) {
          captures.push(`FANDUEL_CAPTURE: ${label}\n${text}`);
        }
      }

      const initial = rawPageText();
      if (initial && initial.trim()) {
        captures.push(`FANDUEL_INITIAL_CAPTURE\n${initial}`);
      }

      const sectionLabels = getFanDuelSectionLabelsForPage(initial);

      // Expand the current visible section first.
      const initialShowMoreClicked = await clickFanDuelShowMoreOnly(8);
      const initialHeaderClicked = await clickFanDuelExpandableSections({
        maxPasses: 1,
        maxClicks: 10,
      });
      await clickFanDuelShowMoreOnly(8);

      await captureFanDuelSnapshot(
        `initial expanded headers ${initialHeaderClicked}, show more ${initialShowMoreClicked}`
      );

      // Then jump specific FanDuel top tabs one by one.
      for (const label of sectionLabels) {
        const clickedTab = await clickExactVisibleText(label, {
          maxWidth: 420,
          maxHeight: 120,
          sleepMs: 1200,
        });

        if (!clickedTab) {
          captures.push(`FANDUEL_MISSING_TAB: ${label}\n${rawPageText()}`);
          continue;
        }

        await sleep(650);

        const showMoreClicked = await clickFanDuelShowMoreOnly(8);

        const expandedClicked = await clickFanDuelExpandableSections({
          maxPasses: 1,
          maxClicks: 10,
        });

        await clickFanDuelShowMoreOnly(8);

        await captureFanDuelSnapshot(
          `${label} headers ${expandedClicked}, show more ${showMoreClicked}`
        );
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }


    function getBetMgmShowMoreCandidates() {
      const directButtons = Array.from(
        document.querySelectorAll("button, a, [role='button']")
      );

      const textMatches = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          if (!isElementVisible(el)) return false;

          const text = getElementText(el);
          if (!/^Show More$/i.test(text)) return false;

          const rect = el.getBoundingClientRect();

          return (
            rect.width > 8 &&
            rect.height > 8 &&
            rect.width < 360 &&
            rect.height < 90
          );
        })
        .map(findClickableAncestor);

      const all = [...directButtons, ...textMatches];
      const seen = new Set();
      const unique = [];

      for (const el of all) {
        if (!el || seen.has(el)) continue;
        seen.add(el);

        if (!isElementVisible(el)) continue;

        const text = getElementText(el);
        const childText = Array.from(el.querySelectorAll("*"))
          .map((child) => getElementText(child))
          .find((value) => /^Show More$/i.test(value));

        if (!/^Show More$/i.test(text) && !childText) continue;

        const rect = el.getBoundingClientRect();

        // Avoid giant page containers.
        if (rect.width > 520 || rect.height > 140) continue;

        unique.push(el);
      }

      return unique.slice(0, 30);
    }

    async function clickBetMgmShowMoreOnly() {
      const clicked = new Set();
      let totalClicked = 0;

      for (let pass = 0; pass < 3; pass += 1) {
        const candidates = getBetMgmShowMoreCandidates();
        let clickedThisPass = 0;

        for (const el of candidates) {
          if (!isElementVisible(el)) continue;

          const rect = el.getBoundingClientRect();
          const key = `show-more::${Math.round(rect.top)}::${Math.round(rect.left)}::${Math.round(rect.width)}x${Math.round(rect.height)}`;

          if (clicked.has(key)) continue;

          const ok = await clickElementReliably(el);

          if (ok) {
            clicked.add(key);
            clickedThisPass += 1;
            totalClicked += 1;
            await sleep(500);
          }

          if (totalClicked >= 30) break;
        }

        if (totalClicked >= 30 || clickedThisPass === 0) break;

        await sleep(500);
      }

      return totalClicked;
    }

    function getBetMgmSportKind(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");
      const path = String(window.location.pathname || "").toLowerCase();

      if (/\bNBA\s*\(/i.test(compact) || /\bbasketball\b/i.test(path)) return "NBA";
      if (/\bNHL\s*\(/i.test(compact) || /\bhockey\b/i.test(path) || /\bnhl\b/i.test(path)) return "NHL";

      if (
        /\bKnicks\b|\b76ers\b|\bCeltics\b|\bLakers\b|\bNuggets\b|\bTimberwolves\b|\bPistons\b|\bMagic\b|\bCavaliers\b|\bRaptors\b|\bHawks\b/i.test(compact)
      ) {
        return "NBA";
      }

      if (
        /\bCanadiens\b|\bLightning\b|\bPenguins\b|\bFlyers\b|\bBruins\b|\bSabres\b|\bOilers\b|\bDucks\b|\bStars\b|\bWild\b/i.test(compact)
      ) {
        return "NHL";
      }

      return "";
    }

    function hasBetMgmRealNbaPlayerPropsTopTabs(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");

      return (
        /\bPlayer props\b/i.test(compact) &&
        /\bPoints\b/i.test(compact) &&
        /\bFirst FG\b/i.test(compact) &&
        /\bAssists\b/i.test(compact) &&
        /\bRebounds\b/i.test(compact) &&
        /\bThree-pointers\b/i.test(compact) &&
        /\bCombo stats\b/i.test(compact)
      );
    }

    function isBetMgmGameLinesShell(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");

      return (
        /\bPlayer props\b/i.test(compact) &&
        /\bGame lines\b/i.test(compact) &&
        /\bFull game\b/i.test(compact) &&
        /\bSpread\b/i.test(compact) &&
        /\bTotal\b/i.test(compact) &&
        /\bMoney\b/i.test(compact) &&
        !hasBetMgmRealNbaPlayerPropsTopTabs(compact)
      );
    }

    function getBetMgmPlayerPropsAttemptKey() {
      const path = String(window.location.pathname || "");
      return `EV_BETMGM_PLAYER_PROPS_ATTEMPTS::${path}`;
    }

    function getBetMgmPlayerPropsAttempts() {
      try {
        return Number(sessionStorage.getItem(getBetMgmPlayerPropsAttemptKey()) || "0") || 0;
      } catch (err) {
        return 0;
      }
    }

    function markBetMgmPlayerPropsAttempt() {
      try {
        sessionStorage.setItem(
          getBetMgmPlayerPropsAttemptKey(),
          String(getBetMgmPlayerPropsAttempts() + 1)
        );
      } catch (err) {
        // ignore storage failures
      }
    }


    function shouldOpenBetMgmPlayerProps(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");

      // If the page exposes a Player props nav item, clicking it is safe.
      // If we are already on Player props, this is usually harmless and only happens
      // once per extension run because hasBetMgmEnteredPlayerProps() is marked.
      const hasPlayerPropsNav = /\bPlayer props\b/i.test(compact);

      // Require at least some game shell signal so random footer/legal text does not trigger it.
      const hasGameShell =
        /\bSGP\b/i.test(compact) ||
        /\bGame lines\b/i.test(compact) ||
        /\bSpreads?\b/i.test(compact) ||
        /\bTotals?\b/i.test(compact) ||
        /\bMoneyline?\b/i.test(compact) ||
        /\bMoney\b/i.test(compact);

      return hasPlayerPropsNav && hasGameShell;
    }

    function hasBetMgmForcedPlayerPropsClick() {
      try {
        return sessionStorage.getItem("EV_BETMGM_FORCED_PLAYER_PROPS_CLICKED") === "1";
      } catch (err) {
        return false;
      }
    }

    function markBetMgmForcedPlayerPropsClick() {
      try {
        sessionStorage.setItem("EV_BETMGM_FORCED_PLAYER_PROPS_CLICKED", "1");
      } catch (err) {
        // ignore storage failures
      }
    }

    function shouldForceBetMgmPlayerPropsFirst(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");

      if (hasBetMgmForcedPlayerPropsClick()) return false;

      // BetMGM NBA and NHL game pages both expose Player props as the top section.
      // We force this first because NBA landing pages can contain prop-preview text
      // that tricks isBetMgmPlayerPropsPage().
      return /\bPlayer props\b/i.test(compact);
    }


    function isBetMgmGameLandingPage(text) {
      const compact = String(text || "").replace(/\s+/g, " ");

      return (
        /\bPlayer props\b/i.test(compact) &&
        (
          /\bSGP\b/i.test(compact) ||
          /\bGame lines\b/i.test(compact) ||
          /\bSpreads?\b/i.test(compact) ||
          /\bTotals?\b/i.test(compact) ||
          /\bMoneyline?\b/i.test(compact) ||
          /\bMoney\b/i.test(compact)
        )
      );
    }


    function isBetMgmPlayerPropsPage(text) {
      const compact = String(text || "").replace(/\s+/g, " ");
      const sport = getBetMgmSportKind(compact);

      if (sport === "NBA") {
        return hasBetMgmRealNbaPlayerPropsTopTabs(compact);
      }

      if (sport === "NHL") {
        return (
          /\bPlayer props\b/i.test(compact) &&
          (
            /\bAnytime goalscorer\b/i.test(compact) ||
            /\bPlayer shots\b/i.test(compact) ||
            /\bGoalie saves\b/i.test(compact) ||
            /\bPlayer points\b/i.test(compact) ||
            /\bPlayer assists\b/i.test(compact)
          )
        );
      }

      return /\bPlayer props\b/i.test(compact) && !isBetMgmGameLinesShell(compact);
    }


    function isBetMgmLikelyNhlPage(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");
      const path = String(window.location?.pathname || "").toLowerCase();

      // IMPORTANT:
      // BetMGM pages include global nav text like NBA / NHL / MLB on every page.
      // Do NOT treat the presence of the word "NHL" alone as proof this is an NHL event.

      const nbaEventSignals =
        /\bBasketball\b/i.test(compact) ||
        /\bUSA\s+NBA\b/i.test(compact) ||
        /\bNBA\b[\s\S]{0,120}\b(Today|Tomorrow)\b/i.test(compact) ||
        /\b(Pistons|Cavaliers|Thunder|Lakers|Timberwolves|Spurs|Knicks|76ers|Celtics|Hawks|Nuggets|Rockets|Raptors|Magic)\b/i.test(compact);

      if (nbaEventSignals) return false;

      const nhlEventSignals =
        /\bHockey\b/i.test(compact) ||
        /\bUSA\s+NHL\b/i.test(compact) ||
        /nhl|hockey/i.test(path) ||
        /\b(Avalanche|Wild|Sabres|Canadiens|Ducks|Golden Knights|Penguins|Flyers|Bruins|Lightning|Oilers|Stars)\b/i.test(compact) ||
        (
          /\bAnytime goalscorer\b/i.test(compact) &&
          /\bPlayer shots\b/i.test(compact) &&
          /\bGoalie saves\b/i.test(compact)
        );

      return nhlEventSignals;
    }

    function getBetMgmWorkflowActions(text = "") {
      if (isBetMgmLikelyNhlPage(text)) {
        return [
          // O/U-like NHL markets only.
          // Do not spend passes on First goalscorer, 2+ goals, 3+ goals, shutouts,
          // or other markets that are not currently useful for Pinnacle matching.
          { type: "drawer", label: "Player shots" },
          { type: "drawer", label: "Player points" },
          { type: "drawer", label: "Player assists" },
          { type: "drawer", label: "Player power play points" },
          { type: "drawer", label: "Goalie saves" },
          { type: "drawer", label: "Goals against" },
          { type: "drawer", label: "Player blocked shots" },
        ];
      }

      return [
        // NBA top-tab-first workflow.
        // Keep this O/U-focused. Do not parse visible 10+/15+/20+ ladders as normal O/U.
        { type: "tab", label: "Points" },
        { type: "drawer", label: "Player points O/U" },

        { type: "tab", label: "Assists" },
        { type: "drawer", label: "Player assists O/U" },

        { type: "tab", label: "Rebounds" },
        { type: "drawer", label: "Player rebounds O/U" },

        { type: "tab", label: "Three-pointers" },
        { type: "drawer", label: "Player three-pointers O/U" },

        { type: "tab", label: "Combo stats" },
        { type: "drawer", label: "Player points + rebounds + assists O/U" },
        { type: "drawer", label: "Player points + assists O/U" },
        { type: "drawer", label: "Player points + rebounds O/U" },
        { type: "drawer", label: "Player rebounds + assists O/U" },
      ];
    }



    function getBetMgmWorkflowProgressKey() {
      const path = String(window.location.pathname || "");
      return `EV_BETMGM_WORKFLOW_PROGRESS::${path}`;
    }

    function getBetMgmEnteredPlayerPropsKey() {
      const path = String(window.location.pathname || "");
      return `EV_BETMGM_ENTERED_PLAYER_PROPS::${path}`;
    }

    function hasBetMgmEnteredPlayerProps() {
      try {
        return sessionStorage.getItem(getBetMgmEnteredPlayerPropsKey()) === "1";
      } catch (err) {
        return false;
      }
    }

    function markBetMgmEnteredPlayerProps() {
      try {
        sessionStorage.setItem(getBetMgmEnteredPlayerPropsKey(), "1");
      } catch (err) {
        // ignore storage failures
      }
    }

    function hasBetMgmForcedPlayerPropsClick() {
      try {
        return sessionStorage.getItem("EV_BETMGM_FORCED_PLAYER_PROPS_CLICKED") === "1";
      } catch (err) {
        return false;
      }
    }

    function markBetMgmForcedPlayerPropsClick() {
      try {
        sessionStorage.setItem("EV_BETMGM_FORCED_PLAYER_PROPS_CLICKED", "1");
      } catch (err) {
        // ignore storage failures
      }
    }

    function shouldForceBetMgmPlayerPropsFirst(text = "") {
      const compact = String(text || "").replace(/\s+/g, " ");

      if (hasBetMgmForcedPlayerPropsClick()) return false;

      return /\bPlayer props\b/i.test(compact);
    }


    function getBetMgmNextWorkflowAction(text = "") {
      const actions = getBetMgmWorkflowActions(text);
      const key = getBetMgmWorkflowProgressKey();
      const stored = Number(sessionStorage.getItem(key));

      const nextIndex = Number.isFinite(stored) ? stored : 0;

      if (nextIndex >= actions.length) {
        sessionStorage.removeItem(key);
        return null;
      }

      const nextAction = actions[nextIndex];

      sessionStorage.setItem(key, String(nextIndex + 1));

      return nextAction;
    }

    async function clickBetMgmElementAtCenter(el) {
      if (!el) return false;

      try {
        el.scrollIntoView({ block: "center", inline: "center" });
        await sleep(250);

        const rect = el.getBoundingClientRect();
        const x = Math.max(1, Math.floor(rect.left + rect.width / 2));
        const y = Math.max(1, Math.floor(rect.top + rect.height / 2));
        const hit = document.elementFromPoint(x, y) || el;

        const eventOptions = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          button: 0,
          buttons: 1,
        };

        const pointerOptions = {
          ...eventOptions,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          pressure: 0.5,
        };

        const targets = Array.from(
          new Set([
            el,
            hit,
            hit?.closest?.(".event-details-sitemap-pills-btn"),
            hit?.closest?.("li"),
            hit?.closest?.("button, [role='button'], [role='tab'], a"),
            el.querySelector?.("button"),
            el.querySelector?.("[role='button']"),
            el.querySelector?.("[role='tab']"),
          ].filter(Boolean))
        );

        for (const target of targets) {
          try {
            target.dispatchEvent(new PointerEvent("pointerover", pointerOptions));
            target.dispatchEvent(new MouseEvent("mouseover", eventOptions));
            target.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
            target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
            target.dispatchEvent(new PointerEvent("pointerup", pointerOptions));
            target.dispatchEvent(new MouseEvent("mouseup", eventOptions));
            target.dispatchEvent(new MouseEvent("click", eventOptions));
            target.click?.();
          } catch (err) {
            // keep trying
          }

          await sleep(60);
        }

        await sleep(450);
        return true;
      } catch (err) {
        try {
          el.click();
          return true;
        } catch (innerErr) {
          return false;
        }
      }
    }

    function navigateBetMgmToMarket(marketId = "") {
      const id = String(marketId || "").trim();
      if (!id) return false;

      try {
        const url = new URL(window.location.href);
        url.searchParams.set("market", id);

        sessionStorage.setItem(
          "EV_BETMGM_LAST_CLICK_DEBUG",
          JSON.stringify({
            mode: "navigate",
            label: id,
            found: true,
            from: window.location.href,
            to: url.toString(),
            at: new Date().toISOString(),
          })
        );

        window.location.assign(url.toString());
        return true;
      } catch (err) {
        try {
          const separator = window.location.href.includes("?") ? "&" : "?";
          const nextUrl = `${window.location.href}${separator}market=${encodeURIComponent(id)}`;

          sessionStorage.setItem(
            "EV_BETMGM_LAST_CLICK_DEBUG",
            JSON.stringify({
              mode: "navigate",
              label: id,
              found: true,
              from: window.location.href,
              to: nextUrl,
              fallback: true,
              at: new Date().toISOString(),
            })
          );

          window.location.assign(nextUrl);
          return true;
        } catch (innerErr) {
          return false;
        }
      }
    }


    function scheduleBetMgmNavClickByLabel(label) {
      if (!label) return false;

      window.setTimeout(async () => {
        try {
          const wanted = clean(label).toLowerCase();

          if (wanted === "player props") {
            const navigated = navigateBetMgmToMarket("PlayerProps");

            if (!navigated) {
              console.warn("EV Parlay BetMGM PlayerProps navigation failed");
            }

            return;
          }



          const menuIdByLabel = {
            "sgp": "-2",
            "player props": "PlayerProps",
            "spreads": "Spread",
            "spread": "Spread",
            "totals": "Totals",
            "total": "Totals",
            "parlays": "Parlays",
            "halves": "Halves",
            "quarters": "Quarters",
            "periods": "Periods",
            "game props": "GameProps",
            "team props": "TeamProps",
            "all": "-1",
          };

          const menuId = menuIdByLabel[wanted] || "";

          const getText = (el) =>
            clean(
              el?.innerText ||
                el?.textContent ||
                el?.getAttribute?.("aria-label") ||
                el?.getAttribute?.("title") ||
                ""
            );

          const visibleSmallEnough = (el) => {
            if (!isElementVisible(el)) return false;

            const rect = el.getBoundingClientRect();

            return (
              rect.width > 8 &&
              rect.height > 8 &&
              rect.width < 760 &&
              rect.height < 220
            );
          };

          let button = null;

          if (menuId) {
            button = document.querySelector(`button[data-menu-item-id="${menuId}"]`);
          }

          if (!button) {
            button = Array.from(
              document.querySelectorAll("button, [role='button'], [role='tab'], a")
            ).find((el) => getText(el).toLowerCase() === wanted && visibleSmallEnough(el));
          }

          if (!button) {
            const wrapper = Array.from(
              document.querySelectorAll(".event-details-sitemap-pills-btn, li, div, span")
            ).find((el) => getText(el).toLowerCase() === wanted && visibleSmallEnough(el));

            button =
              wrapper?.querySelector?.("button") ||
              wrapper?.closest?.("button, [role='button'], [role='tab'], a") ||
              findClickableAncestor(wrapper) ||
              wrapper ||
              null;
          }

          try {
            const rect = button?.getBoundingClientRect?.();

            sessionStorage.setItem(
              "EV_BETMGM_LAST_CLICK_DEBUG",
              JSON.stringify({
                mode: "nav",
                label,
                menuId,
                found: !!button,
                tag: button ? String(button.tagName || "") : "",
                text: button ? getText(button) : "",
                dataMenuItemId: button ? String(button.getAttribute?.("data-menu-item-id") || "") : "",
                className: button ? String(button.className || "") : "",
                top: rect ? Math.round(rect.top) : "",
                left: rect ? Math.round(rect.left) : "",
                width: rect ? Math.round(rect.width) : "",
                height: rect ? Math.round(rect.height) : "",
                at: new Date().toISOString(),
              })
            );
          } catch (storageErr) {
            // ignore storage failures
          }

          if (!button) {
            console.warn("EV Parlay BetMGM nav button not found:", label);
            return;
          }

          button.scrollIntoView({ block: "center", inline: "center" });
          await sleep(200);

          // Click the exact BetMGM button and its touch target.
          const touchTarget = button.querySelector?.(".ds-button-touch-target");
          const targets = [touchTarget, button].filter(Boolean);

          for (const target of targets) {
            try {
              target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "mouse" }));
              target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
              target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, composed: true, pointerType: "mouse" }));
              target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
              target.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
              target.click?.();
            } catch (err) {
              // keep trying
            }

            await sleep(80);
          }
        } catch (err) {
          console.warn("EV Parlay BetMGM scheduled nav click failed:", err);
        }
      }, 650);

      return true;
    }


    function scheduleBetMgmDrawerClickByLabel(label) {
      if (!label) return false;

      window.setTimeout(async () => {
        try {
          const wanted = clean(label);

          if (/quarter|1st|2nd|3rd|4th|half/i.test(wanted)) {
            return;
          }

          const exactText = (el) =>
            clean(
              el?.innerText ||
                el?.textContent ||
                el?.getAttribute?.("aria-label") ||
                el?.getAttribute?.("title") ||
                ""
            ).toLowerCase() === wanted.toLowerCase();

          const visibleUsable = (el) => {
            if (!isElementVisible(el)) return false;

            const rect = el.getBoundingClientRect();

            return (
              rect.width > 8 &&
              rect.height > 8 &&
              rect.width < 900 &&
              rect.height < 260
            );
          };

          // Prefer BetMGM accordion header buttons.
          // Current BetMGM drawer headers look like:
          // button.ds-accordion-header-clickable-area
          // aria-label="Open Accordion"
          const exactAccordionButtons = Array.from(
            document.querySelectorAll("button.ds-accordion-header-clickable-area")
          ).filter((candidate) => exactText(candidate) && visibleUsable(candidate));

          const exactRoleButtons = Array.from(
            document.querySelectorAll("button, [role='button'], [tabindex]")
          ).filter((candidate) => exactText(candidate) && visibleUsable(candidate));

          let button =
            exactAccordionButtons.find((candidate) =>
              /open accordion/i.test(String(candidate.getAttribute?.("aria-label") || ""))
            ) ||
            exactAccordionButtons[0] ||
            exactRoleButtons[0] ||
            null;

          // Fallback: exact visible text node, then walk up to the clickable button.
          if (!button) {
            const textNodeMatch = Array.from(document.querySelectorAll("body *"))
              .filter((candidate) => exactText(candidate) && visibleUsable(candidate))
              .sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                return ar.width * ar.height - br.width * br.height;
              })[0];

            button =
              textNodeMatch?.closest?.("button.ds-accordion-header-clickable-area") ||
              textNodeMatch?.closest?.("button, [role='button'], [tabindex]") ||
              findClickableAncestor(textNodeMatch) ||
              textNodeMatch ||
              null;
          }

          try {
            const rect = button?.getBoundingClientRect?.();

            sessionStorage.setItem(
              "EV_BETMGM_LAST_CLICK_DEBUG",
              JSON.stringify({
                mode: "drawer",
                label: wanted,
                found: !!button,
                tag: button ? String(button.tagName || "") : "",
                text: button ? clean(button.innerText || button.textContent || "") : "",
                ariaLabel: button ? String(button.getAttribute?.("aria-label") || "") : "",
                ariaExpanded: button ? String(button.getAttribute?.("aria-expanded") || "") : "",
                className: button ? String(button.className || "") : "",
                top: rect ? Math.round(rect.top) : "",
                left: rect ? Math.round(rect.left) : "",
                width: rect ? Math.round(rect.width) : "",
                height: rect ? Math.round(rect.height) : "",
                at: new Date().toISOString(),
              })
            );
          } catch (storageErr) {
            // ignore storage failures
          }

          if (!button) {
            console.warn("EV Parlay BetMGM drawer button not found:", wanted);
            return;
          }

          // Use the stronger coordinate helper if present.
          if (typeof clickElementAtCenterReliably === "function") {
            await clickElementAtCenterReliably(button);
          } else {
            button.scrollIntoView({ block: "center", inline: "center" });
            await sleep(180);
            button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "mouse" }));
            button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
            button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, composed: true, pointerType: "mouse" }));
            button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
            button.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
            button.click?.();
          }

          await sleep(900);

          // Record after-click status so we can tell whether it opened.
          try {
            sessionStorage.setItem(
              "EV_BETMGM_LAST_DRAWER_AFTER_CLICK",
              JSON.stringify({
                label: wanted,
                ariaExpandedAfter: String(button.getAttribute?.("aria-expanded") || ""),
                ariaLabelAfter: String(button.getAttribute?.("aria-label") || ""),
                textAfter: clean(button.innerText || button.textContent || ""),
                at: new Date().toISOString(),
              })
            );
          } catch (storageErr) {
            // ignore storage failures
          }
        } catch (err) {
          console.warn("EV Parlay BetMGM scheduled drawer click failed:", err);
        }
      }, 650);

      return true;
    }



    function scheduleBetMgmClickByLabel(label) {
      // Backward-compatible wrapper. Use top-tab click by default.
      return scheduleBetMgmTopTabClickByLabel(label);
    }

    async function buildBetMgmPlayerPropsMultiPassText() {
      const captures = [];

      let clickDebug = "";
      let drawerAfterClickDebug = "";
      try {
        clickDebug = sessionStorage.getItem("EV_BETMGM_LAST_CLICK_DEBUG") || "";
        drawerAfterClickDebug = sessionStorage.getItem("EV_BETMGM_LAST_DRAWER_AFTER_CLICK") || "";
      } catch (err) {
        clickDebug = "";
        drawerAfterClickDebug = "";
      }

      const initial = rawPageText();

      if (initial && initial.trim()) {
        captures.push(
          `BETMGM_INITIAL_CAPTURE${clickDebug ? `\nBETMGM_LAST_CLICK_DEBUG: ${clickDebug}` : ""}${drawerAfterClickDebug ? `\nBETMGM_LAST_DRAWER_AFTER_CLICK: ${drawerAfterClickDebug}` : ""}\n${initial}`
        );
      }

      const isOnPlayerPropsRoute = /(?:^|[?&])market=PlayerProps(?:&|$)/i.test(
        String(window.location.search || "")
      );

      const hasRealNbaPlayerPropsTabs = hasBetMgmRealNbaPlayerPropsTopTabs(initial);

      const hasPlayerPropOuDrawers =
        /\bPlayer points O\/U\b/i.test(initial) ||
        /\bPlayer assists O\/U\b/i.test(initial) ||
        /\bPlayer rebounds O\/U\b/i.test(initial) ||
        /\bPlayer three-pointers O\/U\b/i.test(initial) ||
        /\bPlayer points \+ rebounds \+ assists O\/U\b/i.test(initial) ||
        /\bPlayer points \+ assists O\/U\b/i.test(initial) ||
        /\bPlayer points \+ rebounds O\/U\b/i.test(initial) ||
        /\bPlayer rebounds \+ assists O\/U\b/i.test(initial);

      const isTruePlayerPropsLayout =
        isOnPlayerPropsRoute || hasRealNbaPlayerPropsTabs || hasPlayerPropOuDrawers;

      const playerPropsAttempts = getBetMgmPlayerPropsAttempts();

      // IMPORTANT:
      // The normal BetMGM game landing page contains preview labels like
      // "Player points" / "Player assists" / "Player three-pointers".
      // Those are NOT enough to treat the page as Player Props.
      // Navigate to ?market=PlayerProps first unless the route/top-tabs/O-U drawers prove
      // the real Player Props layout is already active.
      if (
        shouldOpenBetMgmPlayerProps(initial) &&
        !isTruePlayerPropsLayout &&
        playerPropsAttempts < 3
      ) {
        markBetMgmPlayerPropsAttempt();
        scheduleBetMgmNavClickByLabel("Player props");

        captures.push(`BETMGM_SCHEDULED_PLAYER_PROPS: Player props attempt ${playerPropsAttempts + 1}`);

        return mergeRawTextBlocks(captures) || rawPageText();
      }

      if (!isTruePlayerPropsLayout) {
        captures.push("BETMGM_PLAYER_PROPS_NOT_OPENED: still on game lines shell");
        return mergeRawTextBlocks(captures) || rawPageText();
      }

      markBetMgmEnteredPlayerProps();

      // Schedule the next action before clicking Show More.
      // Show More expands pre-built SGPs and can clutter the page before the real O/U drawers open.
      const nextAction = getBetMgmNextWorkflowAction(initial);

      if (nextAction) {
        if (nextAction.type === "tab") {
          scheduleBetMgmTopTabClickByLabel(nextAction.label);
          captures.push(`BETMGM_SCHEDULED_TOP_TAB: ${nextAction.label}`);
          return mergeRawTextBlocks(captures) || rawPageText();
        }

        if (nextAction.type === "drawer") {
          scheduleBetMgmDrawerClickByLabel(nextAction.label);
          captures.push(`BETMGM_SCHEDULED_DRAWER: ${nextAction.label}`);
          return mergeRawTextBlocks(captures) || rawPageText();
        }
      }

      captures.push("BETMGM_NO_NEXT_WORKFLOW_ACTION: Player Props detected but no workflow action returned");

      // Only after all workflow actions are done should we click Show More.
      const showMoreClicked = await clickBetMgmShowMoreOnly();
      await sleep(650);

      const expandedText = rawPageText();
      if (expandedText && expandedText.trim()) {
        captures.push(`BETMGM_CURRENT_CAPTURE: show more ${showMoreClicked}\n${expandedText}`);
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }



    async function buildBetMgmShowMoreRawText() {
      const captures = [];

      const initial = rawPageText();
      if (initial && initial.trim()) {
        captures.push(`BETMGM_INITIAL_CAPTURE\n${initial}`);
      }

      const clickedCount = await clickBetMgmShowMoreOnly();
      await sleep(700);

      const expanded = rawPageText();
      if (expanded && expanded.trim()) {
        captures.push(`BETMGM_SHOW_MORE_CAPTURE: clicked ${clickedCount}\n${expanded}`);
      }

      return mergeRawTextBlocks(captures) || rawPageText();
    }


  function rawPageText() {
    return String(document.body?.innerText || "").trim();
  }

  function detectBookSource() {
    const host = String(window.location.hostname || "").toLowerCase();

    if (host.includes("pinnacle")) return "Pinnacle";
    if (host.includes("fanduel")) return "FanDuel";
    if (host.includes("betmgm")) return "BetMGM";
    if (host.includes("draftkings")) return "DraftKings";
    if (host.includes("thescore")) return "TheScore";

    return "";
  }

  const detectedSource = detectBookSource();

  if (detectedSource === "BetMGM") {
    try {
      const betMgmText = await buildBetMgmPlayerPropsMultiPassText();

      return {
        source: detectedSource,
        text: String(betMgmText || "").trim() || rawPageText(),
      };
    } catch (err) {
      return {
        source: detectedSource,
        text: rawPageText(),
      };
    }
  }

  if (detectedSource === "FanDuel") {
    try {
      const fanDuelRaw = rawPageText();

      if (isFanDuelNhlGamePage(fanDuelRaw)) {
        const fanDuelText = await buildFanDuelOneNextNhlTabRawText();

        return {
          source: detectedSource,
          text: String(fanDuelText || "").trim() || fanDuelRaw,
        };
      }

      if (isFanDuelNbaGameLandingPage(fanDuelRaw)) {
        scheduleFanDuelClickByLabel("Player Points");

        return {
          source: detectedSource,
          text: "",
          action: "navigate_only",
          message: "FanDuel game landing page detected. Moved to Player Points. Click the extension again after the page loads.",
        };
      }

      const fanDuelText = await buildFanDuelOneNextNbaTabRawText();

      return {
        source: detectedSource,
        text: String(fanDuelText || "").trim() || rawPageText(),
      };
    } catch (err) {
      return {
        source: detectedSource,
        text: rawPageText(),
      };
    }
  }

  if (detectedSource === "DraftKings") {
    try {
      const draftKingsText = await buildDraftKingsOneStepRawText();

      return {
        source: detectedSource,
        text: String(draftKingsText || "").trim() || rawPageText(),
      };
    } catch (err) {
      return {
        source: detectedSource,
        text: rawPageText(),
      };
    }
  }

  if (detectedSource === "Pinnacle") {
    return {
      source: detectedSource,
      text: rawPageText(),
    };
  }

  function eventText() {
    const knownTeamAliases = [
      ["New York Yankees", ["new york yankees", "ny yankees", "nyy", "yankees"]],
      ["New York Knicks", ["new york knicks", "ny knicks", "nyk", "knicks"]],
      ["New York Mets", ["new york mets", "ny mets", "nym", "mets"]],
      ["New York Rangers", ["new york rangers", "ny rangers", "nyr rangers"]],
      ["New York Islanders", ["new york islanders", "ny islanders", "nyi islanders"]],
      ["Houston Astros", ["houston astros", "hou astros", "houston", "astros"]],
      ["Atlanta Braves", ["atlanta braves", "atl braves", "braves"]],
      ["Atlanta Hawks", ["atlanta hawks", "atl hawks", "hawks"]],
      ["Philadelphia Flyers", ["philadelphia flyers", "phi flyers", "flyers"]],
      ["Philadelphia Phillies", ["philadelphia phillies", "phi phillies", "phillies"]],
      ["Philadelphia 76ers", ["philadelphia 76ers", "phi 76ers", "76ers"]],
      ["Pittsburgh Penguins", ["pittsburgh penguins", "pit penguins", "penguins"]],
      ["Pittsburgh Pirates", ["pittsburgh pirates", "pit pirates", "pirates"]],
      ["Buffalo Sabres", ["buffalo sabres", "buf sabres", "sabres"]],
      ["Boston Bruins", ["boston bruins", "bos bruins", "bruins"]],
      ["Boston Red Sox", ["boston red sox", "bos red sox", "red sox"]],
      ["Boston Celtics", ["boston celtics", "bos celtics", "celtics"]],
      ["Colorado Avalanche", ["colorado avalanche", "col avalanche", "avalanche"]],
      ["Los Angeles Kings", ["los angeles kings", "la kings", "lak kings"]],
      ["Los Angeles Dodgers", ["los angeles dodgers", "la dodgers", "dodgers"]],
      ["Los Angeles Angels", ["los angeles angels", "la angels", "angels"]],
      ["Los Angeles Lakers", ["los angeles lakers", "la lakers", "lakers"]],
      ["Anaheim Ducks", ["anaheim ducks", "ana ducks", "ducks"]],
      ["Edmonton Oilers", ["edmonton oilers", "edm oilers", "oilers"]],
      ["Dallas Stars", ["dallas stars", "dal stars", "stars"]],
      ["Minnesota Wild", ["minnesota wild", "min wild", "wild"]],
      ["Minnesota Twins", ["minnesota twins", "min twins", "twins"]],
      ["Tampa Bay Lightning", ["tampa bay lightning", "tb lightning", "tbl lightning", "tampa", "lightning"]],
      ["Tampa Bay Rays", ["tampa bay rays", "tb rays", "tbr rays", "rays"]],
      ["Montreal Canadiens", ["montreal canadiens", "mtl canadiens", "canadiens"]],
      ["Carolina Hurricanes", ["carolina hurricanes", "car hurricanes", "hurricanes"]],
      ["Cleveland Guardians", ["cleveland guardians", "cle guardians", "guardians"]],
      ["Toronto Blue Jays", ["toronto blue jays", "tor blue jays", "blue jays"]],
      ["Detroit Tigers", ["detroit tigers", "det tigers", "tigers"]],
      ["Cincinnati Reds", ["cincinnati reds", "cin reds", "reds"]],
      ["Chicago Cubs", ["chicago cubs", "chi cubs", "cubs"]],
      ["Chicago White Sox", ["chicago white sox", "chi white sox", "white sox"]],
      ["Washington Nationals", ["washington nationals", "wsh nationals", "nationals"]],
      ["Miami Marlins", ["miami marlins", "mia marlins", "marlins"]],
      ["San Francisco Giants", ["san francisco giants", "sf giants", "giants"]],
      ["Seattle Mariners", ["seattle mariners", "sea mariners", "mariners"]],
      ["St. Louis Cardinals", ["st. louis cardinals", "st louis cardinals", "stl cardinals", "cardinals"]],
      ["San Diego Padres", ["san diego padres", "sd padres", "padres"]],
      ["Arizona Diamondbacks", ["arizona diamondbacks", "ari diamondbacks", "diamondbacks"]],
      ["Athletics", ["athletics", "oak athletics", "oakland athletics"]],
      ["Texas Rangers", ["texas rangers", "tex rangers"]],
      ["Kansas City Royals", ["kansas city royals", "kc royals", "royals"]],
      ["Milwaukee Brewers", ["milwaukee brewers", "mil brewers", "brewers"]],
      ["Denver Nuggets", ["denver nuggets", "den nuggets", "nuggets"]],
      ["Detroit Pistons", ["detroit pistons", "det pistons", "pistons"]],
      ["Minnesota Timberwolves", ["minnesota timberwolves", "min timberwolves", "timberwolves"]],
      ["Oklahoma City Thunder", ["oklahoma city thunder", "okc thunder", "thunder"]],
      ["Phoenix Suns", ["phoenix suns", "phx suns", "pho suns", "suns"]],
      ["Cleveland Cavaliers", ["cleveland cavaliers", "cle cavaliers", "cavaliers"]],
      ["Toronto Raptors", ["toronto raptors", "tor raptors", "raptors"]],
      ["San Antonio Spurs", ["san antonio spurs", "sa spurs", "spurs"]],
      ["Portland Trail Blazers", ["portland trail blazers", "por trail blazers", "trail blazers"]],
      ["Houston Rockets", ["houston rockets", "hou rockets", "rockets"]],
      ["Charlotte Hornets", ["charlotte hornets", "cha hornets", "hornets"]],
      ["Orlando Magic", ["orlando magic", "orl magic", "magic"]],
      ["Vegas Golden Knights", ["vegas golden knights", "vgs golden knights", "vgk golden knights", "golden knights", "vegas", "vgs", "vgk"]],
    ];

    function normalizeCandidate(value) {
      return clean(value)
        .replace(/\s+\d+$/, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function resolveKnownTeam(value) {
      const cleaned = normalizeCandidate(value);
      const lower = cleaned.toLowerCase();

      const sorted = knownTeamAliases
        .flatMap(([canonical, aliases]) => aliases.map((alias) => ({ canonical, alias })))
        .sort((a, b) => b.alias.length - a.alias.length);

      const exact = sorted.find(({ alias }) => lower === alias);
      if (exact) return exact.canonical;

      const prefix = sorted.find(({ alias }) => lower.startsWith(`${alias} `));
      if (prefix) return prefix.canonical;

      return "";
    }

    function candidateToEvent(candidate) {
      const text = normalizeCandidate(candidate);
      if (!text || !text.includes("@")) return "";

      const parts = text.split(/\s@\s/).map((part) => normalizeCandidate(part)).filter(Boolean);
      if (parts.length !== 2) return "";

      const away = resolveKnownTeam(parts[0]);
      const home = resolveKnownTeam(parts[1]);

      if (!away || !home || away === home) return "";
      return `${away} @ ${home}`;
    }

    const mainLinesDrawer = Array.from(document.querySelectorAll("details[data-testid]")).find((drawer) => {
      const title = clean(drawer.querySelector("summary h2")?.innerText || "");
      return /^Main Lines$/i.test(title);
    });

    if (mainLinesDrawer) {
      const mainLineTeams = Array.from(mainLinesDrawer.querySelectorAll('button[data-testid="team-name"]'))
        .map((el) => resolveKnownTeam(el.innerText))
        .filter(Boolean);

      const uniqueMainLineTeams = Array.from(new Set(mainLineTeams));

      if (uniqueMainLineTeams.length >= 2) {
        return `${uniqueMainLineTeams[0]} @ ${uniqueMainLineTeams[1]}`;
      }
    }

    const headingLines = Array.from(document.querySelectorAll("h1, h2, h3"))
      .flatMap((el) => String(el.innerText || "").split("\n"))
      .map(candidateToEvent)
      .filter(Boolean);

    if (headingLines.length) return headingLines[0];

    const bodyLines = String(document.body?.innerText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("@"));

    for (const line of bodyLines) {
      const event = candidateToEvent(line);
      if (event) return event;
    }

    return "Unknown Event";
  }

    function sportText() {
      const text = clean(document.body.innerText).toLowerCase();
      const path = String(window.location.pathname || "").toLowerCase();

      if (/hockey|nhl/.test(path)) return "NHL";
      if (/basketball|nba/.test(path)) return "NBA";
      if (/baseball|mlb/.test(path)) return "MLB";

      if (
        text.includes("shots on goal") ||
        text.includes("saves") ||
        text.includes("power play points") ||
        text.includes("goal scorer") ||
        text.includes("goalscorer") ||
        text.includes("sabres") ||
        text.includes("bruins") ||
        text.includes("canadiens") ||
        text.includes("lightning") ||
        text.includes("hurricanes") ||
        text.includes("senators") ||
        text.includes("avalanche") ||
        text.includes("kings") ||
        text.includes("stars") ||
        text.includes("wild") ||
        text.includes("ducks") ||
        text.includes("oilers") ||
        text.includes("panthers") ||
        text.includes("leafs") ||
        text.includes("devils") ||
        text.includes("rangers") ||
        text.includes("islanders") ||
        text.includes("flyers") ||
        text.includes("penguins") ||
        text.includes("kraken") ||
        text.includes("canucks") ||
        text.includes("jets")
      ) {
        return "NHL";
      }

      if (
        text.includes("player points") ||
        text.includes("player rebounds") ||
        text.includes("player assists") ||
        text.includes("player threes") ||
        text.includes("knicks") ||
        text.includes("hawks") ||
        text.includes("celtics") ||
        text.includes("76ers") ||
        text.includes("lakers") ||
        text.includes("spurs") ||
        text.includes("nuggets") ||
        text.includes("timberwolves") ||
        text.includes("cavaliers") ||
        text.includes("raptors")
      ) {
        return "NBA";
      }

      if (
        text.includes("home runs") ||
        text.includes("rbis") ||
        text.includes("strikeouts") ||
        text.includes("innings pitched") ||
        text.includes("hits allowed") ||
        text.includes("total bases") ||
        text.includes("baseball")
      ) {
        return "MLB";
      }

      if (text.includes("soccer")) return "SOCCER";
      if (text.includes("tennis")) return "TENNIS";
      if (text.includes("ufc") || text.includes("mma")) return "UFC";
      if (text.includes("golf")) return "GOLF";

      return "UNKNOWN";
    }

  function detectMarket(drawerMarket, article) {
    const txt = clean(article.innerText);

    if (txt.includes("Pts + Reb + Ast")) return "Pts + Reb + Ast";
    if (txt.includes("Pts + Reb")) return "Pts + Reb";
    if (txt.includes("Pts + Ast")) return "Pts + Ast";
    if (txt.includes("Reb + Ast")) return "Reb + Ast";
    if (txt.includes("Double Double")) return "Double Double";
    if (txt.includes("Triple Double")) return "Triple Double";

    if (txt.includes("(O/U)")) return drawerMarket + " (O/U)";

    return drawerMarket;
  }

  function pushUnique(rows, value) {
    if (!rows.includes(value)) rows.push(value);
  }

    function cleanTeamName(name) {
    const cleaned = clean(name)
      .replace(/\s+\d+$/, "")
      .replace(/\s+(Final|Live)$/i, "")
      .trim();

    if (!cleaned) return "";

    const knownTeamAliases = [
      ["Arizona Diamondbacks", ["arizona diamondbacks", "ari diamondbacks", "diamondbacks"]],
      ["Atlanta Braves", ["atlanta braves", "atl braves", "braves"]],
      ["Baltimore Orioles", ["baltimore orioles", "bal orioles", "orioles"]],
      ["Boston Red Sox", ["boston red sox", "bos red sox", "red sox"]],
      ["Chicago Cubs", ["chicago cubs", "chi cubs", "cubs"]],
      ["Chicago White Sox", ["chicago white sox", "chi white sox", "white sox"]],
      ["Cincinnati Reds", ["cincinnati reds", "cin reds", "reds"]],
      ["Cleveland Guardians", ["cleveland guardians", "cle guardians", "guardians"]],
      ["Colorado Rockies", ["colorado rockies", "col rockies", "rockies"]],
      ["Detroit Tigers", ["detroit tigers", "det tigers", "tigers"]],
      ["Houston Astros", ["houston astros", "hou astros", "astros"]],
      ["Kansas City Royals", ["kansas city royals", "kc royals", "royals"]],
      ["Los Angeles Angels", ["los angeles angels", "la angels", "angels"]],
      ["Los Angeles Dodgers", ["los angeles dodgers", "la dodgers", "dodgers"]],
      ["Miami Marlins", ["miami marlins", "mia marlins", "marlins"]],
      ["Milwaukee Brewers", ["milwaukee brewers", "mil brewers", "brewers"]],
      ["Minnesota Twins", ["minnesota twins", "min twins", "twins"]],
      ["New York Mets", ["new york mets", "ny mets", "nym", "mets"]],
      ["New York Yankees", ["new york yankees", "ny yankees", "nyy", "yankees"]],
      ["Athletics", ["athletics", "oak athletics", "oakland athletics"]],
      ["Philadelphia Phillies", ["philadelphia phillies", "phi phillies", "phillies"]],
      ["Pittsburgh Pirates", ["pittsburgh pirates", "pit pirates", "pirates"]],
      ["San Diego Padres", ["san diego padres", "sd padres", "padres"]],
      ["Seattle Mariners", ["seattle mariners", "sea mariners", "mariners"]],
      ["San Francisco Giants", ["san francisco giants", "sf giants", "giants"]],
      ["St. Louis Cardinals", ["st. louis cardinals", "st louis cardinals", "stl cardinals", "cardinals"]],
      ["Tampa Bay Rays", ["tampa bay rays", "tb rays", "tbr rays", "rays"]],
      ["Texas Rangers", ["texas rangers", "tex rangers"]],
      ["Toronto Blue Jays", ["toronto blue jays", "tor blue jays", "blue jays"]],
      ["Washington Nationals", ["washington nationals", "wsh nationals", "nationals"]],

      ["Boston Celtics", ["boston celtics", "bos celtics", "celtics"]],
      ["Cleveland Cavaliers", ["cleveland cavaliers", "cle cavaliers", "cavaliers"]],
      ["Denver Nuggets", ["denver nuggets", "den nuggets", "nuggets"]],
      ["Houston Rockets", ["houston rockets", "hou rockets", "rockets"]],
      ["Los Angeles Lakers", ["los angeles lakers", "la lakers", "lakers"]],
      ["Minnesota Timberwolves", ["minnesota timberwolves", "min timberwolves", "timberwolves"]],
      ["New York Knicks", ["new york knicks", "ny knicks", "nyk", "knicks"]],
      ["Oklahoma City Thunder", ["oklahoma city thunder", "okc thunder", "thunder"]],
      ["Orlando Magic", ["orlando magic", "orl magic", "magic"]],
      ["Philadelphia 76ers", ["philadelphia 76ers", "phi 76ers", "76ers"]],
      ["Phoenix Suns", ["phoenix suns", "phx suns", "pho suns", "suns"]],

      ["Boston Bruins", ["boston bruins", "bos bruins", "bruins"]],
      ["Buffalo Sabres", ["buffalo sabres", "buf sabres", "sabres"]],
      ["Carolina Hurricanes", ["carolina hurricanes", "car hurricanes", "hurricanes"]],
      ["Anaheim Ducks", ["anaheim ducks", "ana ducks", "ducks"]],
      ["Colorado Avalanche", ["colorado avalanche", "col avalanche", "avalanche"]],
      ["Dallas Stars", ["dallas stars", "dal stars", "stars"]],
      ["Edmonton Oilers", ["edmonton oilers", "edm oilers", "oilers"]],
      ["Florida Panthers", ["florida panthers", "fla panthers", "panthers"]],
      ["Los Angeles Kings", ["los angeles kings", "la kings", "lak kings", "kings"]],
      ["Minnesota Wild", ["minnesota wild", "min wild", "wild"]],
      ["Montreal Canadiens", ["montreal canadiens", "mtl canadiens", "canadiens"]],
      ["New York Islanders", ["new york islanders", "ny islanders", "nyi islanders", "islanders"]],
      ["New York Rangers", ["new york rangers", "ny rangers", "nyr", "rangers"]],
      ["Philadelphia Flyers", ["philadelphia flyers", "phi flyers", "flyers"]],
      ["Pittsburgh Penguins", ["pittsburgh penguins", "pit penguins", "penguins"]],
      ["Tampa Bay Lightning", ["tampa bay lightning", "tb lightning", "tbl lightning", "lightning"]],
      ["Toronto Maple Leafs", ["toronto maple leafs", "tor maple leafs", "maple leafs", "leafs"]],
      ["Vegas Golden Knights", ["vegas golden knights", "vgs golden knights", "vgk golden knights", "golden knights", "vegas", "vgs", "vgk"]],
      ["Washington Capitals", ["washington capitals", "wsh capitals", "capitals"]],
      ["Winnipeg Jets", ["winnipeg jets", "wpg jets", "jets"]]
    ];

    const lower = cleaned.toLowerCase();

    const sorted = knownTeamAliases
      .flatMap(([canonical, aliases]) => aliases.map((alias) => ({ canonical, alias })))
      .sort((a, b) => b.alias.length - a.alias.length);

    const exact = sorted.find(({ alias }) => lower === alias);
    if (exact) return exact.canonical;

    const prefix = sorted.find(({ alias }) => lower.startsWith(`${alias} `));
    if (prefix) return prefix.canonical;

    return cleaned;
  }

  function buildGamePageExport() {
    function toOdds(value) {
      const v = clean(value).toUpperCase();
      return v === "EVEN" ? "+100" : v;
    }

    const out = [];
    const rawEvent = eventText();
    let event = rawEvent;

    const parts = rawEvent.split(" @ ");
    if (parts.length === 2) {
      const away = cleanTeamName(parts[0]);
      const home = cleanTeamName(parts[1]);
      event = `${away} @ ${home}`;
    }

    const sport = sportText();

    out.push("THESCORE_STRUCTURED_EXPORT");
    out.push("Sport: " + sport);
    out.push("Event: " + event);

    function appendYesNoMarketFromVisibleText({ headerPattern, marketName, suffixRegex }) {
      const bodyLines = String(document.querySelector("main")?.innerText || document.body?.innerText || "")
        .split("\n")
        .map((line) => clean(line))
        .filter(Boolean);

      const headerIndex = bodyLines.findIndex((line) => headerPattern.test(line));
      if (headerIndex === -1) return;

      const stopRegex =
        /^(Triple[\s-]?Double|Double[\s-]?Double|Pts \+ Reb \+ Ast|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast|Pts \+ Reb \+ Ast \(O\/U\)|Pts \+ Reb \(O\/U\)|Pts \+ Ast \(O\/U\)|Reb \+ Ast \(O\/U\)|Popular|Quick Bets|Player Points|Player Rebounds|Player Assists|Player Threes|Player Combos|Player Defense|Quarter|Half|Game Props|Specials|Betting News)$/i;

      const rows = [];

      for (let i = headerIndex + 1; i < bodyLines.length - 1; i += 1) {
        const line = bodyLines[i];

        if (i > headerIndex + 1 && stopRegex.test(line)) break;
        if (!suffixRegex.test(line)) continue;

        const player = line.replace(suffixRegex, "").trim();
        if (!player) continue;

        let yesIndex = -1;
        for (let j = i + 1; j < Math.min(bodyLines.length, i + 8); j += 1) {
          if (/^Yes$/i.test(bodyLines[j])) {
            yesIndex = j;
            break;
          }
          if (stopRegex.test(bodyLines[j])) break;
        }

        if (yesIndex === -1) continue;

        let yesOdds = "";
        let noIndex = -1;

        for (let j = yesIndex + 1; j < Math.min(bodyLines.length, yesIndex + 14); j += 1) {
          const candidate = bodyLines[j];

          if (stopRegex.test(candidate)) break;
          if (suffixRegex.test(candidate)) break;

          if (/^No$/i.test(candidate)) {
            noIndex = j;
            break;
          }

          if (!yesOdds && /^[-+]\d+$|^EVEN$/i.test(candidate)) {
            yesOdds = candidate;
          }
        }

        let noOdds = "";
        if (noIndex !== -1) {
          for (let j = noIndex + 1; j < Math.min(bodyLines.length, noIndex + 14); j += 1) {
            const candidate = bodyLines[j];

            if (stopRegex.test(candidate)) break;
            if (suffixRegex.test(candidate)) break;

            if (/^[-+]\d+$|^EVEN$/i.test(candidate)) {
              noOdds = candidate;
              break;
            }
          }
        }

        if (yesOdds) {
          rows.push(`${player} | YES | ${toOdds(yesOdds)}`);
        }

        if (noOdds) {
          rows.push(`${player} | NO | ${toOdds(noOdds)}`);
        }
      }

      if (!rows.length) return;

      out.push("");
      out.push("Market: " + marketName);
      rows.forEach((row) => out.push(row));
    }

    appendYesNoMarketFromVisibleText({
      headerPattern: /^Double[\s-]?Double$/i,
      marketName: "Double Double",
      suffixRegex: /\s+(?:To Record A Double Double|Double-Double|Double Double)$/i,
    });

    appendYesNoMarketFromVisibleText({
      headerPattern: /^Triple[\s-]?Double$/i,
      marketName: "Triple Double",
      suffixRegex: /\s+(?:To Record A Triple Double|Triple-Double|Triple Double)$/i,
    });

    let wroteMainLines = false;

    function normalizeTheScoreMainLineTeam(value = "") {
      const text = clean(value)
        .replace(/\s+/g, " ")
        .trim();

      const aliases = new Map([
        ["MIN Wild", "Minnesota Wild"],
        ["Minnesota Wild", "Minnesota Wild"],
        ["COL Avalanche", "Colorado Avalanche"],
        ["Colorado Avalanche", "Colorado Avalanche"],

        ["ANA Ducks", "Anaheim Ducks"],
        ["Ducks", "Anaheim Ducks"],
        ["VGK Golden Knights", "Vegas Golden Knights"],
        ["VEG Golden Knights", "Vegas Golden Knights"],
        ["Golden Knights", "Vegas Golden Knights"],

        ["BUF Sabres", "Buffalo Sabres"],
        ["Sabres", "Buffalo Sabres"],
        ["MTL Canadiens", "Montreal Canadiens"],
        ["Canadiens", "Montreal Canadiens"],

        ["OKC Thunder", "Oklahoma City Thunder"],
        ["Thunder", "Oklahoma City Thunder"],
        ["LAL Lakers", "Los Angeles Lakers"],
        ["LA Lakers", "Los Angeles Lakers"],
        ["Lakers", "Los Angeles Lakers"],

        ["MIN Timberwolves", "Minnesota Timberwolves"],
        ["Timberwolves", "Minnesota Timberwolves"],
        ["SAS Spurs", "San Antonio Spurs"],
        ["SA Spurs", "San Antonio Spurs"],
        ["Spurs", "San Antonio Spurs"],

        ["DET Pistons", "Detroit Pistons"],
        ["Pistons", "Detroit Pistons"],
        ["CLE Cavaliers", "Cleveland Cavaliers"],
        ["Cavaliers", "Cleveland Cavaliers"],
      ]);

      return aliases.get(text) || cleanTeamName(text);
    }

    function appendMainLinesFromVisibleText(container) {
      if (wroteMainLines) return false;
      if (!container) return false;

      const raw = clean(container.innerText || container.textContent || "");

      if (!/\bMain Lines\b/i.test(raw)) return false;
      if (!/\bSpread\b/i.test(raw) || !/\bTotal\b/i.test(raw) || !/\bMoney\b/i.test(raw)) return false;

      function escapeMainLineRegex(value = "") {
        return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      function writeTheScoreMainLines({
        away,
        home,
        awaySpreadLine,
        awaySpreadOdds,
        totalLine,
        overOdds,
        awayMoney,
        homeSpreadLine,
        homeSpreadOdds,
        underOdds,
        homeMoney,
      }) {
        const spreadRegex = /^[+-]\d+(?:\.\d+)?$/;
        const oddsRegex = /^(?:[+-]\d+|EVEN)$/i;

        if (
          !away ||
          !home ||
          !spreadRegex.test(awaySpreadLine || "") ||
          !oddsRegex.test(awaySpreadOdds || "") ||
          !Number.isFinite(Number(totalLine)) ||
          !oddsRegex.test(overOdds || "") ||
          !oddsRegex.test(awayMoney || "") ||
          !spreadRegex.test(homeSpreadLine || "") ||
          !oddsRegex.test(homeSpreadOdds || "") ||
          !oddsRegex.test(underOdds || "") ||
          !oddsRegex.test(homeMoney || "")
        ) {
          return false;
        }

        out.push("");
        out.push("Market: Spread");
        out.push(`${away} | ${awaySpreadLine} | ${toOdds(awaySpreadOdds)}`);
        out.push(`${home} | ${homeSpreadLine} | ${toOdds(homeSpreadOdds)}`);

        out.push("");
        out.push("Market: Total");
        out.push(`Over | ${totalLine} | ${toOdds(overOdds)}`);
        out.push(`Under | ${totalLine} | ${toOdds(underOdds)}`);

        out.push("");
        out.push("Market: Moneyline");
        out.push(`${away} | ${toOdds(awayMoney)}`);
        out.push(`${home} | ${toOdds(homeMoney)}`);

        wroteMainLines = true;
        out.push("THESCORE_MAIN_LINES_TEXT_FALLBACK_CAPTURED");

        return true;
      }

      const eventParts = String(event || "")
        .split(" @ ")
        .map((part) => cleanTeamName(part))
        .filter(Boolean);

      // Direct parser for the exact visible text shape found in console:
      // Main Lines Cleveland Cavaliers @ Detroit Pistons Spread Total Money
      // CLE Cavaliers +3.5 -105 O 212.5 -105 +140
      // DET Pistons -3.5 -115 U 212.5 -115 -165
      if (eventParts.length === 2 && !/^Unknown Event$/i.test(String(event || ""))) {
        const eventPattern = escapeMainLineRegex(event);
        const directPattern = new RegExp(
          [
            "\\bMain Lines\\b",
            "\\s+",
            eventPattern,
            "\\s+Spread\\s+Total\\s+Money\\s+",
            "(.+?)\\s+",
            "([+-]\\d+(?:\\.\\d+)?)\\s+",
            "((?:[+-]\\d+)|EVEN)\\s+",
            "O\\s*(\\d+(?:\\.\\d+)?)\\s+",
            "((?:[+-]\\d+)|EVEN)\\s+",
            "((?:[+-]\\d+)|EVEN)\\s+",
            "(.+?)\\s+",
            "([+-]\\d+(?:\\.\\d+)?)\\s+",
            "((?:[+-]\\d+)|EVEN)\\s+",
            "U\\s*(\\d+(?:\\.\\d+)?)\\s+",
            "((?:[+-]\\d+)|EVEN)\\s+",
            "((?:[+-]\\d+)|EVEN)(?:\\s|$)",
          ].join(""),
          "i"
        );

        const match = raw.match(directPattern);

        if (match) {
          const overTotal = clean(match[4]);
          const underTotal = clean(match[10]);

          if (overTotal === underTotal) {
            const wrote = writeTheScoreMainLines({
              away: eventParts[0],
              home: eventParts[1],
              awaySpreadLine: clean(match[2]),
              awaySpreadOdds: clean(match[3]),
              totalLine: overTotal,
              overOdds: clean(match[5]),
              awayMoney: clean(match[6]),
              homeSpreadLine: clean(match[8]),
              homeSpreadOdds: clean(match[9]),
              underOdds: clean(match[11]),
              homeMoney: clean(match[12]),
            });

            if (wrote) return true;
          }
        }
      }

      // Fallback parser if the direct event-based regex fails.
      const expandedLines = raw
        .replace(/\b(Main Lines)\b/g, "\n$1\n")
        .replace(/\b(Spread)\b/g, "\n$1\n")
        .replace(/\b(Total)\b/g, "\n$1\n")
        .replace(/\b(Money)\b/g, "\n$1\n")
        .replace(/\b([A-Z]{2,4}\s+[A-Z][A-Za-z]+)\b/g, "\n$1\n")
        .replace(/\b([+-]\d+(?:\.\d+)?)\b/g, "\n$1\n")
        .replace(/\b([OU]\s*\d+(?:\.\d+)?)\b/g, "\n$1\n")
        .split("\n")
        .map(clean)
        .filter(Boolean);

      const working = expandedLines.filter((line) => {
        if (!line) return false;
        if (/^SGP Eligible$/i.test(line)) return false;
        if (/^3-Way Moneyline$/i.test(line)) return false;
        if (/^(Goals|Shots On Goal|Points|First Goalscorer|Period - Moneyline|Period - Total|Team To Score Next Goal)$/i.test(line)) return false;
        return true;
      });

      const eventIndex = working.findIndex((line) => /\s@\s/.test(line));
      if (eventIndex === -1) return false;

      const headerIndex = working.findIndex(
        (line, index) =>
          index > eventIndex &&
          /^Spread$/i.test(line) &&
          /^Total$/i.test(working[index + 1] || "") &&
          /^Money$/i.test(working[index + 2] || "")
      );

      if (headerIndex === -1) return false;

      const awayRaw = working[headerIndex + 3];
      const awaySpreadLine = working[headerIndex + 4];
      const awaySpreadOdds = working[headerIndex + 5];
      const overLine = working[headerIndex + 6];
      const overOdds = working[headerIndex + 7];
      const awayMoney = working[headerIndex + 8];

      const homeRaw = working[headerIndex + 9];
      const homeSpreadLine = working[headerIndex + 10];
      const homeSpreadOdds = working[headerIndex + 11];
      const underLine = working[headerIndex + 12];
      const underOdds = working[headerIndex + 13];
      const homeMoney = working[headerIndex + 14];

      const away = eventParts[0] || normalizeTheScoreMainLineTeam(awayRaw);
      const home = eventParts[1] || normalizeTheScoreMainLineTeam(homeRaw);

      const overTotal = clean(overLine).replace(/^O\s*/i, "");
      const underTotal = clean(underLine).replace(/^U\s*/i, "");

      if (overTotal !== underTotal) return false;

      return writeTheScoreMainLines({
        away,
        home,
        awaySpreadLine,
        awaySpreadOdds,
        totalLine: overTotal,
        overOdds,
        awayMoney,
        homeSpreadLine,
        homeSpreadOdds,
        underOdds,
        homeMoney,
      });
    }



    function appendVisibleMainLinesFromContainer(container) {
      if (wroteMainLines || !container) return false;

      const fallbackParts = String(event || "").split(" @ ");
      const fallbackAway = cleanTeamName(fallbackParts[0] || "");
      const fallbackHome = cleanTeamName(fallbackParts[1] || "");

      const teamButtons = Array.from(container.querySelectorAll('button[data-testid="team-name"]'));
      const awayRaw = clean(teamButtons[0]?.innerText || fallbackAway);
      const homeRaw = clean(teamButtons[1]?.innerText || fallbackHome);

      const away = cleanTeamName(awayRaw || fallbackAway);
      const home = cleanTeamName(homeRaw || fallbackHome);

      const selectionButtons = Array.from(container.querySelectorAll("button[data-type]")).filter((btn) => {
        const type = String(btn.getAttribute("data-type") || "");
        return [
          "AWAY_SPREAD",
          "HOME_SPREAD",
          "OVER",
          "UNDER",
          "AWAY_MONEYLINE",
          "HOME_MONEYLINE",
        ].includes(type);
      });

      if (!away || !home || selectionButtons.length < 6) return false;

      let awaySpread = null;
      let homeSpread = null;
      let overTotal = null;
      let underTotal = null;
      let awayMoney = null;
      let homeMoney = null;

      selectionButtons.forEach((btn) => {
        const type = String(btn.getAttribute("data-type") || "");
        const spans = Array.from(btn.querySelectorAll("span"))
          .map((el) => clean(el.innerText))
          .filter(Boolean);

        const line =
          spans.find((s) => /^[OU]\s*\d+(\.\d+)?$/i.test(s) || /^[+-]\d+(\.\d+)?$/.test(s)) || "";
        const odds = toOdds(spans.find((s) => /^[-+]\d+$|^EVEN$/i.test(s)) || "");
        const entry = { line, odds };

        if (type === "AWAY_SPREAD") awaySpread = entry;
        if (type === "HOME_SPREAD") homeSpread = entry;
        if (type === "OVER") overTotal = entry;
        if (type === "UNDER") underTotal = entry;
        if (type === "AWAY_MONEYLINE") awayMoney = entry;
        if (type === "HOME_MONEYLINE") homeMoney = entry;
      });

      if (awaySpread && homeSpread) {
        out.push("");
        out.push("Market: Spread");
        out.push(`${away} | ${awaySpread.line} | ${awaySpread.odds}`);
        out.push(`${home} | ${homeSpread.line} | ${homeSpread.odds}`);
      }

      if (overTotal && underTotal) {
        out.push("");
        out.push("Market: Total");
        out.push(`Over | ${overTotal.line.replace(/^O\s*/i, "")} | ${overTotal.odds}`);
        out.push(`Under | ${underTotal.line.replace(/^U\s*/i, "")} | ${underTotal.odds}`);
      }

      if (awayMoney && homeMoney) {
        out.push("");
        out.push("Market: Moneyline");
        out.push(`${away} | ${awayMoney.odds}`);
        out.push(`${home} | ${homeMoney.odds}`);
      }

      wroteMainLines = true;
      return true;
    }

    const mainLinesFallbackContainer = document.querySelector("main") || document.body;

    // Try the visible-text Main Lines fallback first.
    // Current TheScore NBA/NHL pages expose true main lines as collapsed visible text:
    // Main Lines / Event / Spread Total Money / Away / spread / odds / total / odds / money / Home...
    //
    // The older broad button parser can accidentally grab fake prop/H2H buttons from
    // the whole page, write fake main lines, and set wroteMainLines = true before this
    // better fallback gets a chance to run.
    if (!appendMainLinesFromVisibleText(mainLinesFallbackContainer)) {
      appendVisibleMainLinesFromContainer(mainLinesFallbackContainer);
    }

    document.querySelectorAll("details[data-testid]").forEach((drawer) => {
      const titleEl = drawer.querySelector("summary h2");

    if (!titleEl) return;

      const drawerMarket = clean(titleEl.innerText);
      if (!drawerMarket) return;

      if (/^Main Lines$/i.test(drawerMarket)) {
        const teamButtons = Array.from(drawer.querySelectorAll('button[data-testid="team-name"]'));
        if (teamButtons.length >= 2) {
          const awayRaw = clean(teamButtons[0].innerText);
          const homeRaw = clean(teamButtons[1].innerText);
          const away = cleanTeamName(awayRaw);
          const home = cleanTeamName(homeRaw);

          const selectionButtons = Array.from(drawer.querySelectorAll("button[data-type]")).filter((btn) => {
            const type = String(btn.getAttribute("data-type") || "");
            return [
              "AWAY_SPREAD",
              "HOME_SPREAD",
              "OVER",
              "UNDER",
              "AWAY_MONEYLINE",
              "HOME_MONEYLINE",
            ].includes(type);
          });

          if (away && home && selectionButtons.length >= 6) {
            let awaySpread = null;
            let homeSpread = null;
            let overTotal = null;
            let underTotal = null;
            let awayMoney = null;
            let homeMoney = null;

            selectionButtons.forEach((btn) => {
              const type = String(btn.getAttribute("data-type") || "");
              const spans = Array.from(btn.querySelectorAll("span"))
                .map((el) => clean(el.innerText))
                .filter(Boolean);

              const line =
                spans.find((s) => /^[OU]\s*\d+(\.\d+)?$/i.test(s) || /^[+-]\d+(\.\d+)?$/.test(s)) || "";
              const odds = toOdds(spans.find((s) => /^[-+]\d+$|^EVEN$/i.test(s)) || "");
              const entry = { line, odds };

              if (type === "AWAY_SPREAD") awaySpread = entry;
              if (type === "HOME_SPREAD") homeSpread = entry;
              if (type === "OVER") overTotal = entry;
              if (type === "UNDER") underTotal = entry;
              if (type === "AWAY_MONEYLINE") awayMoney = entry;
              if (type === "HOME_MONEYLINE") homeMoney = entry;
            });

            appendVisibleMainLinesFromContainer(drawer);

            return;
          }
        }
      }

      // If this was a Main Lines drawer but the standard button parser failed,
      // try the plain visible-text fallback before returning.
      // Do not fall through to the generic ladder/table parser. That creates
      // malformed rows like: ANA Ducks | Total | -180.
      if (/^Main Lines$/i.test(drawerMarket)) {
        appendMainLinesFromVisibleText(drawer);
        return;
      }
      const ladderTable = drawer.querySelector("table");
      if (ladderTable) {
        out.push("");
        out.push("Market: " + drawerMarket);

        const headers = Array.from(ladderTable.querySelectorAll("thead th"))
          .map((th) => clean(th.innerText))
          .filter(Boolean);

        const rows = drawer.querySelectorAll("tbody tr");

        rows.forEach((row) => {
          const player = clean(row.querySelector("th")?.innerText);
          if (!player) return;

          Array.from(row.querySelectorAll("td")).forEach((td, idx) => {
            const odds = Array.from(td.querySelectorAll("span"))
              .map((s) => clean(s.innerText))
              .find((v) => /^[-+]\d+$|^EVEN$/i.test(v));

            if (!odds || odds === "--") return;

            const threshold = headers[idx + 1];
            if (!threshold) return;

            out.push(`${player} | ${threshold} | ${odds.toUpperCase()}`);
          });
        });

        return;
      }

      drawer.querySelectorAll("article").forEach((article) => {
        const market = detectMarket(drawerMarket, article);
        let wroteMarket = false;
        const articleRows = [];

        const subjects = [
          ...Array.from(article.querySelectorAll("header.text-style-s-medium")).map((el) => clean(el.innerText)),
          ...Array.from(article.querySelectorAll('button[data-testid="team-name"]')).map((el) =>
            clean(el.innerText)
              .replace(/\s+Total Saves$/i, "")
              .replace(/\s+Total Points$/i, "")
              .replace(/\s+Total Assists$/i, "")
              .replace(/\s+Total Hits$/i, "")
              .replace(/\s+Total Goals$/i, "")
              .replace(/\s+Total Shots On Goal$/i, "")
          ),
        ].filter(Boolean);

        const uniqueSubjects = Array.from(new Set(subjects));

        uniqueSubjects.forEach((player) => {
          let block = null;

          const headerEl = Array.from(article.querySelectorAll("header.text-style-s-medium")).find(
            (el) => clean(el.innerText) === player
          );
          if (headerEl) {
            block = headerEl.closest("div[id]") || headerEl.parentElement;
          } else {
            const teamNameEl = Array.from(article.querySelectorAll('button[data-testid="team-name"]')).find(
              (el) =>
                clean(el.innerText)
                  .replace(/\s+Total Saves$/i, "")
                  .replace(/\s+Total Points$/i, "")
                  .replace(/\s+Total Assists$/i, "")
                  .replace(/\s+Total Hits$/i, "")
                  .replace(/\s+Total Goals$/i, "")
                  .replace(/\s+Total Shots On Goal$/i, "") === player
            );
            if (teamNameEl) {
              block =
                teamNameEl.closest("div.flex.flex-row") ||
                teamNameEl.parentElement?.parentElement ||
                teamNameEl.parentElement;
            }
          }

          const buttons = block
            ? block.querySelectorAll('button[data-type="OVER"], button[data-type="UNDER"], button[data-type="YES"], button[data-type="NO"], button[data-type="LIST"]')
            : [];

          buttons.forEach((btn) => {
            const label = clean(btn.innerText);
            const oddsMatch = label.match(/[-+]\d+|EVEN/i);
            if (!oddsMatch) return;

            const ou = label.match(/\b(Over|Under|O|U)\s*([\d.]+)/i);
            if (ou) {
              const side = /^U/i.test(ou[1]) ? "UNDER" : "OVER";
              pushUnique(
                articleRows,
                `${player} | ${side} | ${ou[2]} | ${toOdds(oddsMatch[0])}`
              );
              return;
            }

            const yesNo = label.match(/\b(Yes|No)\b/i);
            if (yesNo) {
              pushUnique(
                articleRows,
                `${player} | ${yesNo[1].toUpperCase()} | ${toOdds(oddsMatch[0])}`
              );
              return;
            }

            if (btn.getAttribute("data-type") === "LIST") {
              const td = btn.closest("td");
              const threshold = td?.id?.match(/-(\d+\+)$/)?.[1];
              if (threshold) {
                pushUnique(
                  articleRows,
                  `${player} | ${threshold} | ${toOdds(oddsMatch[0])}`
                );
              }
            }
          });
        });

        if (articleRows.length) {
          if (!wroteMarket) {
            out.push("");
            out.push("Market: " + market);
            wroteMarket = true;
          }

          articleRows.forEach((r) => out.push(r));
        }
      });
    });

    return out.join("\n");
  }

  function buildLandingPageExport() {
    function toOdds(value) {
      const v = clean(value).toUpperCase();
      return v === "EVEN" ? "+100" : v;
    }

    const out = [];
    const cards = Array.from(document.querySelectorAll("article"));

    cards.forEach((card) => {
      const teamButtons = Array.from(card.querySelectorAll('button[data-testid="team-name"]'));
      if (teamButtons.length < 2) return;

      const awayRaw = clean(teamButtons[0].innerText);
      const homeRaw = clean(teamButtons[1].innerText);
      if (!awayRaw || !homeRaw) return;

      const away = cleanTeamName(awayRaw);
      const home = cleanTeamName(homeRaw);

      const event = `${away} @ ${home}`;
      const timeText = clean(card.querySelector(".text-style-xs-medium")?.innerText || "");
            if (isLiveStartText(timeText)) return;
      const selectionButtons = Array.from(card.querySelectorAll("button[data-type]")).filter((btn) => {
        const type = String(btn.getAttribute("data-type") || "");
        return [
          "AWAY_SPREAD",
          "HOME_SPREAD",
          "OVER",
          "UNDER",
          "AWAY_MONEYLINE",
          "HOME_MONEYLINE",
        ].includes(type);
      });

      if (selectionButtons.length < 6) return;

      let awaySpread = null;
      let homeSpread = null;
      let overTotal = null;
      let underTotal = null;
      let awayMoney = null;
      let homeMoney = null;

      selectionButtons.forEach((btn) => {
        const type = String(btn.getAttribute("data-type") || "");
        const spans = Array.from(btn.querySelectorAll("span"))
          .map((el) => clean(el.innerText))
          .filter(Boolean);

        const line =
          spans.find((s) => /^[OU]\s*\d+(\.\d+)?$/i.test(s) || /^[+-]\d+(\.\d+)?$/.test(s)) || "";
        const odds = toOdds(spans.find((s) => /^[-+]\d+$|^EVEN$/i.test(s)) || "");
        const entry = { line, odds };

        if (type === "AWAY_SPREAD") awaySpread = entry;
        if (type === "HOME_SPREAD") homeSpread = entry;
        if (type === "OVER") overTotal = entry;
        if (type === "UNDER") underTotal = entry;
        if (type === "AWAY_MONEYLINE") awayMoney = entry;
        if (type === "HOME_MONEYLINE") homeMoney = entry;
      });

      out.push("THESCORE_STRUCTURED_EXPORT");
      out.push("Sport: " + sportText());
      out.push(`Event: ${event}`);
      if (timeText) out.push(`Start: ${timeText}`);

      if (awaySpread && homeSpread) {
        out.push("");
        out.push("Market: Spread");
        out.push(`${away} | ${awaySpread.line} | ${awaySpread.odds}`);
        out.push(`${home} | ${homeSpread.line} | ${homeSpread.odds}`);
      }

      if (overTotal && underTotal) {
        out.push("");
        out.push("Market: Total");
        out.push(`Over | ${overTotal.line.replace(/^O\s*/i, "")} | ${overTotal.odds}`);
        out.push(`Under | ${underTotal.line.replace(/^U\s*/i, "")} | ${underTotal.odds}`);
      }

      if (
        awayMoney &&
        homeMoney &&
        /^[-+]\d+$|^\+100$/i.test(String(awayMoney.odds || "")) &&
        /^[-+]\d+$|^\+100$/i.test(String(homeMoney.odds || ""))
      ) {
        out.push("");
        out.push("Market: Moneyline");
        out.push(`${away} | ${awayMoney.odds}`);
        out.push(`${home} | ${homeMoney.odds}`);
      }

      out.push("");
    });

    return out.join("\n").trim();
  }


  function normalizeTheScoreMarketTabLabel(value) {
    return clean(value)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/^player\s+/i, "")
      .trim();
  }

  function isTheScoreMarketTabText(value) {
    const text = normalizeTheScoreMarketTabLabel(value);

    const allowed = new Set([
      // NBA
      "points",
      "rebounds",
      "assists",
      "threes",
      "3-pointers made",
      "combos",
      "pts + reb + ast",
      "defense",

      // Main lines / default tab
      "main",
      "main lines",
      "game lines",
      "lines",
      "all",
      "all odds",
      "moneyline",
      "spread",
      "puck line",
      "popular",


      // NHL
      "goals",
      "goal scorer",
      "goalscorer",
      "shots on goal",
      "sog",
      "saves",
      "goalie saves",
      "player saves",
      "power play points",
      "blocked shots",
      "blocks",
      "hits",

      // MLB
      "total bases",
      "home runs",
      "rbis",
      "rbi",
      "runs",
      "pitcher strikeouts",
      "strikeouts",
      "hits allowed",
      "earned runs",
      "outs recorded",
      "walks allowed"
    ]);

    if (allowed.has(text)) return true;

    return (
      /^(points|rebounds|assists|threes|combos|defense)$/i.test(text) ||
      /^(main|main lines|game lines|lines|all|all odds|moneyline|spread|puck line|popular|goals|goal scorer|goalscorer|shots on goal|sog|points\/assists|saves|goalie saves|player saves|goalie\/defense|power play points|blocked shots|blocks|hits)$/i.test(text) ||
      /^(total bases|home runs|rbis|rbi|runs)$/i.test(text) ||
      /^(pitcher strikeouts|strikeouts|hits allowed|earned runs|outs recorded|walks allowed)$/i.test(text)
    );
  }

  function getTheScoreMarketTabButtons() {
    const priority = [
      // Main lines first. Popular often exports promo/player-H2H markets instead of true team lines.
      "main",
      "main lines",
      "game lines",
      "lines",
      "all",
      "all odds",
      "moneyline",
      "spread",
      "puck line",
      "popular",

      // NHL priority next so saves/assists do not get cut off by noisy page buttons.
      "goals",
      "goal scorer",
      "goalscorer",
      "shots on goal",
      "points",
      "assists",
      "points/assists",
      "saves",
      "goalie saves",
      "player saves",
      "goalie/defense",
      "power play points",
      "blocked shots",
      "blocks",
      "hits",

      // NBA
      "rebounds",
      "threes",
      "3-pointers made",
      "combos",
      "pts + reb + ast",
      "defense",

      // MLB
      "total bases",
      "home runs",
      "rbis",
      "rbi",
      "runs",
      "pitcher strikeouts",
      "strikeouts",
      "hits allowed",
      "earned runs",
      "outs recorded",
      "walks allowed"
    ];

    const scored = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .filter(isElementVisible)
      .map((el) => {
        const label = normalizeTheScoreMarketTabLabel(el.innerText || el.textContent || "");
        return {
          el,
          label,
          priorityIndex: priority.indexOf(label),
        };
      })
      .filter(({ label }) => isTheScoreMarketTabText(label));

    const seenLabels = new Set();
    const unique = [];

    for (const item of scored.sort((a, b) => {
      const aRank = a.priorityIndex === -1 ? 999 : a.priorityIndex;
      const bRank = b.priorityIndex === -1 ? 999 : b.priorityIndex;
      return aRank - bRank;
    })) {
      if (!item.label || seenLabels.has(item.label)) continue;
      seenLabels.add(item.label);
      unique.push(item.el);
    }

    return unique.slice(0, 80);
  }

  function normalizeStructuredExportForDedupe(text) {
    return String(text || "")
      .split("\n")
      .map((line) => clean(line))
      .filter(Boolean)
      .join("\n");
  }

  function mergeStructuredExports(exports) {
    const blocks = [];
    const seen = new Set();

    for (const text of exports) {
      const normalized = normalizeStructuredExportForDedupe(text);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      blocks.push(text.trim());
    }

    return blocks.join("\n\n").trim();
  }

  async function buildTheScoreCombinedExport() {
    const exports = [];

    function captureCurrentPage() {
      const hasGameDrawersNow = document.querySelectorAll("details[data-testid]").length > 0;
      const hasLandingCardsNow = document.querySelectorAll('button[data-testid="team-name"]').length >= 2;

      if (hasGameDrawersNow && hasLandingCardsNow) {
        return mergeStructuredExports([
          buildLandingPageExport(),
          buildGamePageExport(),
        ]);
      }

      if (hasGameDrawersNow) return buildGamePageExport();
      if (hasLandingCardsNow) return buildLandingPageExport();
      return "";
    }

    async function captureAfterTheScoreClick(label, button) {
      if (!button) return false;

      const before = clean(document.body.innerText).slice(0, 5000);

      try {
        await clickElementReliably(button);
        await sleep(900);
        await preparePageForExtraction();

        const after = clean(document.body.innerText).slice(0, 5000);
        const captured = captureCurrentPage();

        if (captured && captured.trim()) {
          exports.push(`THESCORE_MARKET_CAPTURE: ${label}\n${captured}`);
        }

        return after !== before || !!captured;
      } catch (err) {
        return false;
      }
    }

    function hasTheScoreTrueTeamMainLines(text = "") {
      const value = String(text || "");

      const eventMatches = [...value.matchAll(/^Event:\s*(.+?)$/gim)]
        .map((match) => String(match[1] || "").trim())
        .filter((eventName) => /\s@\s/.test(eventName))
        .filter((eventName) => !/To Record A (Double|Triple) Double|Race To \d+ Points|Method of/i.test(eventName));

      if (!eventMatches.length) return false;

      for (const eventName of eventMatches) {
        const [awayRaw, homeRaw] = eventName.split(/\s@\s/).map((part) => clean(part));
        if (!awayRaw || !homeRaw) continue;

        const awayLast = awayRaw.split(/\s+/).slice(-1)[0];
        const homeLast = homeRaw.split(/\s+/).slice(-1)[0];

        const moneylinePattern = new RegExp(
          `Market:\\s*Moneyline[\\s\\S]{0,700}(?:${escapeRegexForTheScore(awayRaw)}|${escapeRegexForTheScore(awayLast)})\\s*\\|\\s*(?:[+-]\\d+|EVEN)[\\s\\S]{0,700}(?:${escapeRegexForTheScore(homeRaw)}|${escapeRegexForTheScore(homeLast)})\\s*\\|\\s*(?:[+-]\\d+|EVEN)`,
          "i"
        );

        const spreadPattern = new RegExp(
          `Market:\\s*Spread[\\s\\S]{0,700}(?:${escapeRegexForTheScore(awayRaw)}|${escapeRegexForTheScore(awayLast)})\\s*\\|\\s*[+-]\\d+(?:\\.\\d+)?\\s*\\|\\s*(?:[+-]\\d+|EVEN)[\\s\\S]{0,700}(?:${escapeRegexForTheScore(homeRaw)}|${escapeRegexForTheScore(homeLast)})\\s*\\|\\s*[+-]\\d+(?:\\.\\d+)?\\s*\\|\\s*(?:[+-]\\d+|EVEN)`,
          "i"
        );

        if (moneylinePattern.test(value) || spreadPattern.test(value)) return true;
      }

      return false;
    }

    function escapeRegexForTheScore(value = "") {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }


    function findTheScoreButtonByLabel(label) {
      const wanted = normalizeTheScoreMarketTabLabel(label);

      const candidates = Array.from(
        document.querySelectorAll("button, a, [role='button'], [role='tab']")
      )
        .filter(isElementVisible)
        .map((el) => ({
          el,
          label: normalizeTheScoreMarketTabLabel(el.innerText || el.textContent || ""),
        }))
        .filter(({ label }) => label === wanted);

      if (candidates[0]?.el) return candidates[0].el;

      return findClickableByExactVisibleText(label, {
        maxWidth: 520,
        maxHeight: 140,
      });
    }

    await preparePageForExtraction();

    const initialCapture = captureCurrentPage();
    exports.push(`THESCORE_INITIAL_CAPTURE\n${initialCapture}`);

    const capturedTheScoreLabels = new Set(["popular", "initial", ""]);

    function normalizeTheScoreCaptureKey(label = "") {
      const text = normalizeTheScoreMarketTabLabel(label || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      const aliases = new Map([
        ["main", "main lines"],
        ["main lines", "main lines"],
        ["game lines", "main lines"],
        ["lines", "main lines"],
        ["all", "main lines"],
        ["all odds", "main lines"],
        ["moneyline", "main lines"],
        ["spread", "main lines"],
        ["puck line", "main lines"],

        ["player points", "points"],
        ["player rebounds", "rebounds"],
        ["player assists", "assists"],
        ["player threes", "threes"],
        ["player three-pointers", "threes"],
        ["3-pointers made", "threes"],
        ["three-pointers made", "threes"],
        ["player combos", "combos"],
        ["player defense", "defense"],
        ["points/assists", "points/assists"],
        ["goalie defense", "goalie/defense"],
        ["goalie/defense", "goalie/defense"],
        ["goal scorer", "goals"],
        ["goalscorer", "goals"],
        ["player saves", "saves"],
        ["goalie saves", "saves"],
        ["shots on goal", "shots on goal"],
        ["sog", "shots on goal"],
      ]);

      return aliases.get(text) || text;
    }

    async function captureTheScoreLabelOnce(label, button = null) {
      const key = normalizeTheScoreCaptureKey(label || "");
      if (!key || capturedTheScoreLabels.has(key)) return false;

      const resolvedButton = button || findTheScoreButtonByLabel(label);
      if (!resolvedButton) return false;

      capturedTheScoreLabels.add(key);

      const didCapture = await captureAfterTheScoreClick(key, resolvedButton);
      await sleep(250);

      return didCapture;
    }

    async function captureTheScoreMainLinesFirst() {
      const mainLineLabels = [
        "Main Lines",
        "Game Lines",
        "Lines",
        "All Odds",
        "All",
        "Moneyline",
        "Spread",
        "Puck Line",
      ];

      for (const label of mainLineLabels) {
        const button = findTheScoreButtonByLabel(label);
        if (!button) continue;

        const didCapture = await captureTheScoreLabelOnce(label, button);
        if (!didCapture) continue;

        const mergedSoFar = mergeStructuredExports(exports);
        if (hasTheScoreTrueTeamMainLines(mergedSoFar)) {
          exports.push("THESCORE_MAIN_LINES_CAPTURED: true team moneyline/spread found before props");
          return true;
        }
      }

      return false;
    }


    // First: try true team game lines before prop tabs.
    await captureTheScoreMainLinesFirst();

    // Then: currently visible tab buttons, but de-duped by normalized capture key.
    const buttons = getTheScoreMarketTabButtons();

    for (const button of buttons) {
      const label = normalizeTheScoreMarketTabLabel(button.innerText || button.textContent || "");
      await captureTheScoreLabelOnce(label, button);
    }

    // Second: focused fallback pass, also de-duped.
    // Do NOT include Popular here because initial capture already covers the default page.
    const targetedLabels = [
      // Main lines, if they were hidden or lazy-loaded.
      "Main Lines",
      "Game Lines",
      "Lines",
      "All Odds",
      "All",
      "Moneyline",
      "Spread",
      "Puck Line",

      // NBA
      "Points",
      "Rebounds",
      "Assists",
      "Threes",
      "3-Pointers Made",
      "Combos",
      "Pts + Reb + Ast",
      "Points + Rebounds",
      "Points + Assists",
      "Rebounds + Assists",

      // NHL
      "Goals",
      "Shots on Goal",
      "Points/Assists",
      "Points",
      "Assists",
      "Saves",
      "Power Play Points",
      "Goalie/Defense",
    ];

    for (const label of targetedLabels) {
      await captureTheScoreLabelOnce(label);
    }

    const merged = mergeStructuredExports(exports);

    if (!hasTheScoreTrueTeamMainLines(merged)) {
      return `${merged}\n\nTHESCORE_MAIN_LINES_NOT_FOUND: true team moneyline/spread were not present in exported text`;
    }

    return merged;
  }

  if (detectedSource === "TheScore") {
    const combinedText = await buildTheScoreCombinedExport();

    if (combinedText && combinedText.trim()) {
      return {
        source: "TheScore",
        text: combinedText,
      };
    }
  }

  alert("No supported sportsbook page structure detected.");
  return {
    source: "",
    text: "",
  };
}