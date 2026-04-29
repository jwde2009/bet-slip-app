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
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  const sourceTabId = tab.id;

  const extractionResult = await safeExecuteScript({
    tabId: sourceTabId,
    func: extractOddsTextFromCurrentPage,
  });

  const [{ result: payload } = {}] = extractionResult || [];

  const finalText = String(payload?.text || "");
  const source = String(payload?.source || "");

  if (!finalText.trim() || !source.trim()) {
    await safeShowToast(sourceTabId, "Unsupported page", "No odds text was extracted.");
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

  if (!appTabId) return;

  const queueWriteResult = await safeExecuteScript({
    tabId: appTabId,
    func: writeImportIntoAppQueue,
    args: [finalText, source],
  });

  if (!queueWriteResult) {
    await safeShowToast(
      sourceTabId,
      "Import failed",
      "EV Parlay Lab was not ready. Open or reload the app, then try again."
    );
    return;
  }

  const estimatedRows = estimateExtractedRows(finalText, source);

  await safeShowToast(
    sourceTabId,
    `${source} import sent`,
    `Rows extracted: ${estimatedRows.toLocaleString()}`,
    {
      characters: finalText.length,
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
    toast.style.background = "#166534";
    toast.style.color = "#f0fdf4";
    toast.style.border = "1px solid #86efac";
    toast.style.borderRadius = "10px";
    toast.style.padding = "12px 14px";
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
    titleEl.textContent = data.title || "Import sent";
    titleEl.style.fontWeight = "800";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
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
        toast.animate(
          [
            { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
            { transform: "scale(1.035)", boxShadow: "0 0 0 5px rgba(134,239,172,0.55), 0 16px 38px rgba(0,0,0,0.28)" },
            { transform: "scale(1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" },
          ],
          {
            duration: 650,
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

  await preparePageForExtraction();

  if (detectedSource === "BetMGM") {
    return {
      source: detectedSource,
      text: await buildBetMgmCombinedRawText(),
    };
  }

  if (
    detectedSource === "Pinnacle" ||
    detectedSource === "FanDuel" ||
    detectedSource === "DraftKings"
  ) {
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

            return;
          }
        }
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


  function isTheScoreMarketTabText(value) {
    const text = clean(value).toLowerCase();

    const allowed = new Set([
      "player points",
      "points",
      "player rebounds",
      "rebounds",
      "player assists",
      "assists",
      "player threes",
      "3-pointers made",
      "player combos",
      "pts + reb + ast",
      "player defense",
      "goals",
      "goal scorer",
      "shots on goal",
      "sog",
      "points",
      "assists",
      "saves",
      "hits",
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
      /^(player )?(points|rebounds|assists|threes)$/i.test(text) ||
      /^(hits|total bases|home runs|rbis|runs)$/i.test(text) ||
      /^(pitcher strikeouts|strikeouts|hits allowed|earned runs|outs recorded|walks allowed)$/i.test(text) ||
      /^(goals|shots on goal|saves|power play points|blocked shots)$/i.test(text)
    );
  }

  function getTheScoreMarketTabButtons() {
    return Array.from(document.querySelectorAll("button, a, [role='button']"))
      .filter(isElementVisible)
      .filter((el) => isTheScoreMarketTabText(el.innerText || el.textContent || ""))
      .slice(0, 35);
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

      if (hasGameDrawersNow) return buildGamePageExport();
      if (hasLandingCardsNow) return buildLandingPageExport();
      return "";
    }

    await preparePageForExtraction();
    exports.push(captureCurrentPage());

    const buttons = getTheScoreMarketTabButtons();

    for (const button of buttons) {
      const before = clean(document.body.innerText).slice(0, 5000);

      try {
        button.click();
        await sleep(650);
        await preparePageForExtraction();

        const after = clean(document.body.innerText).slice(0, 5000);
        const captured = captureCurrentPage();

        if (after !== before || captured) {
          exports.push(captured);
        }
      } catch (err) {
        // ignore market-tab click failures
      }
    }

    return mergeStructuredExports(exports);
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