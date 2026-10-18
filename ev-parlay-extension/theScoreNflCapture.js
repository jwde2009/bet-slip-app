// Self-contained: Chrome serializes this function into the current sportsbook tab.
// It reads market prices and clicks only same-event tabs / expansion controls.
async function captureTheScoreNflPropsStep(visited = [], hintedEvent = "", expectedPath = "", demand = {}) {
  const clean = value => String(value || "").replace(/\u2212/g, "-").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  const text = el => clean(el?.innerText || el?.textContent || "");
  const list = (el, selector) => Array.from(el?.querySelectorAll(selector) || []);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const seen = new Set(visited.map(clean));
  const debug = [];
  const result = (extra = {}) => ({ event: hintedEvent, visited: [...seen], done: true, text: debug.join("\n"), ...extra });
  if (location.hostname !== "sportsbook.thescore.bet" || location.pathname !== expectedPath ||
      !/\/competition\/nfl\/event\/[^/]+\/?$/i.test(expectedPath)) {
    debug.push("THESCORE_NFL_DEBUG: Stopped because the event URL changed.");
    return result();
  }
  let root = document.querySelector("main") || document.body;
  const visible = el => {
    if (!el || el.isConnected === false) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const selected = list(root, '[role="tab"][aria-selected="true"], [aria-current="page"]');
  const status = list(root, '[data-testid="event-status"], [data-testid="scoreboard"]')
    .map(text).join(" ");
  if (selected.some(el => /^(?:Live|(?:1st|2nd|3rd|4th|First|Second|Third|Fourth) (?:Half|Quarter)|Regulation|Team Totals?)$/i.test(text(el))) ||
      /\b(?:LIVE|Halftime|Final)\b|\b(?:Q[1-4]|[1-4]Q)\s+\d{1,2}:\d{2}/i.test(status)) {
    debug.push("THESCORE_NFL_DEBUG: Full-game pregame capture only; selected period/live status was rejected.");
    return result();
  }
  const clubs = [
    ["Arizona Cardinals", "ARI"], ["Atlanta Falcons", "ATL"], ["Baltimore Ravens", "BAL"], ["Buffalo Bills", "BUF"],
    ["Carolina Panthers", "CAR"], ["Chicago Bears", "CHI"], ["Cincinnati Bengals", "CIN"], ["Cleveland Browns", "CLE"],
    ["Dallas Cowboys", "DAL"], ["Denver Broncos", "DEN"], ["Detroit Lions", "DET"], ["Green Bay Packers", "GB"],
    ["Houston Texans", "HOU"], ["Indianapolis Colts", "IND"], ["Jacksonville Jaguars", "JAX", "JAC"], ["Kansas City Chiefs", "KC"],
    ["Las Vegas Raiders", "LV"], ["Los Angeles Chargers", "LAC", "LA"], ["Los Angeles Rams", "LAR", "LA"], ["Miami Dolphins", "MIA"],
    ["Minnesota Vikings", "MIN"], ["New England Patriots", "NE"], ["New Orleans Saints", "NO"], ["New York Giants", "NYG", "NY"],
    ["New York Jets", "NYJ", "NY"], ["Philadelphia Eagles", "PHI"], ["Pittsburgh Steelers", "PIT"], ["San Francisco 49ers", "SF"],
    ["Seattle Seahawks", "SEA"], ["Tampa Bay Buccaneers", "TB"], ["Tennessee Titans", "TEN"], ["Washington Commanders", "WAS", "WSH"],
  ];
  function team(value) {
    const wanted = clean(value).replace(/\s+\d+-\d+(?:-\d+)?(?:,.*)?$/, "").toLowerCase();
    for (const [name, ...codes] of clubs) {
      const nickname = name.split(" ").at(-1);
      const aliases = [name, nickname, ...codes.filter(code => !["NY", "LA"].includes(code)), ...codes.map(code => `${code} ${nickname}`)];
      if (aliases.some(alias => alias.toLowerCase() === wanted)) return name;
    }
    return "";
  }
  function eventName(value) {
    const parts = clean(value).split(/\s+(?:@|at|vs\.?)\s+/i);
    const a = team(parts[0]), h = team(parts[1]);
    return parts.length === 2 && a && h && a !== h ? `${a} @ ${h}` : "";
  }
  const title = drawer => text(drawer?.querySelector("summary h2, summary"));
  const eventCandidates = new Set();
  const addEvent = value => { const name = eventName(value); if (name) eventCandidates.add(name); };
  addEvent(hintedEvent);
  for (const header of list(root, "h1").filter(visible)) addEvent(text(header));
  // Only inspect the current game's Main Lines/Game Lines drawer, not sidebar games.
  // The October 11 capture has a plain matchup line but no usable h1/team-name nodes.
  for (const mainDrawer of list(root, "details").filter(el => visible(el) && /^(Main Lines|Game Lines)$/i.test(title(el)))) {
    const explicit = String(mainDrawer.innerText || mainDrawer.textContent || "")
      .split(/\r?\n/).map(eventName).filter(Boolean);
    for (const name of explicit) eventCandidates.add(name);
    if (!explicit.length) {
      const names = [...new Set(list(mainDrawer, '[data-testid="team-name"]').map(text).map(team).filter(Boolean))];
      if (names.length === 2) addEvent(`${names[0]} @ ${names[1]}`);
    }
  }
  const event = eventCandidates.size === 1 ? [...eventCandidates][0] : "";
  if (eventCandidates.size > 1) debug.push("THESCORE_NFL_DEBUG: Conflicting current-game headers; prices were not emitted.");
  const supported = /^(?:player\s+)?(?:total\s+)?(?:pass(?:ing)? yards|pass(?:ing)? (?:touchdowns|tds|attempts|completions|interceptions)|touchdown passes|interceptions(?: thrown)?|completions|rush(?:ing)? (?:yards|attempts)|carries|rec(?:eiving)? yards|receptions|rush(?:ing)?\s*(?:\+|and)\s*rec(?:eiving)? yards|pass(?:ing)?\s*\+\s*rush(?:ing)? yards|touchdowns(?: scored)?|anytime (?:touchdown(?:s| scorers?)?|td scorer))(?:\s*\(?o\s*\/\s*u\)?)?$/i;
  const drawerKeys = [];
  const occurrences = new Map();
  for (const drawer of list(root, "details").filter(visible)) {
    const market = title(drawer);
    const index = occurrences.get(market) || 0;
    occurrences.set(market, index + 1);
    const normalize=v=>clean(v).toLowerCase().replace(/\s*\(o\/u\)$/, '').replace(/^player\s+/, '').replace(/^total\s+/, '').replace(/ and /g,' + ');
    if (supported.test(market)&&(!demand.targetTypes?.length||demand.targetLabels?.some(label=>normalize(label)===normalize(market)))) drawerKeys.push({ market, index });
  }
  function findDrawer(key) {
    // Click handlers may replace the drawer element; never keep reading a stale node.
    root = document.querySelector("main") || document.body;
    return list(root, "details").filter(el => visible(el) && title(el) === key.market)[key.index];
  }
  function sameContext() {
    if (location.hostname !== "sportsbook.thescore.bet" || location.pathname !== expectedPath) return false;
    root = document.querySelector("main") || document.body;
    const active = list(root, '[role="tab"][aria-selected="true"], [aria-current="page"]');
    const live = list(root, '[data-testid="event-status"], [data-testid="scoreboard"]').map(text).join(" ");
    return !active.some(el => /^(?:Live|(?:1st|2nd|3rd|4th|First|Second|Third|Fourth) (?:Half|Quarter)|Regulation|Team Totals?)$/i.test(text(el))) &&
      !/\b(?:LIVE|Halftime|Final)\b|\b(?:Q[1-4]|[1-4]Q)\s+\d{1,2}:\d{2}/i.test(live);
  }
  const noSelection = el => !el.disabled && el.getAttribute("aria-disabled") !== "true" &&
    !el.hasAttribute("data-type") && !el.closest('[data-testid*="betslip"], [data-testid*="selection"]');
  const out = ["THESCORE_STRUCTURED_EXPORT", "THESCORE_NFL_PROPS_VERSION: 20261011_1", "Sport: NFL", `Event: ${event}`, "Period: full_game"];
  function player(value) {
    const p = clean(value).replace(/\s+Total\s+.+$/i, "");
    return !team(p) && !/\b(?:Over|Under|Player|Yards|Touchdowns|Receptions|Total|No scorer|None|Field)\b/i.test(p) &&
      /^[\p{L}][\p{L}.'’\-]*(?:\s+[\p{L}][\p{L}.'’\-]*){1,5}$/u.test(p) ? p : "";
  }
  function price(value) {
    const prices = [...clean(value).matchAll(/(?:^|\s)([+-]\d{3,7}|EVEN|EVS)(?=\s|$)/gi)].map(match => match[1].toUpperCase());
    const unique = [...new Set(prices)];
    return unique.length === 1 && (/^EV/.test(unique[0]) || Math.abs(Number(unique[0])) >= 100 && Math.abs(Number(unique[0])) <= 1000000)
      ? (/^EV/.test(unique[0]) ? "+100" : unique[0]) : "";
  }
  function selection(button, name, header = "", market = "") {
    if (!name || !visible(button) || button.disabled || button.getAttribute("aria-disabled") === "true") return "";
    const label = text(button), odds = price(label);
    if (!odds) return "";
    const ou = label.match(/\b(Over|Under|O|U)\s*(\d+(?:\.\d+)?)/i);
    const type = button.getAttribute("data-type") || "";
    if (ou) {
      const side = /^U/i.test(ou[1]) ? "UNDER" : "OVER";
      if (/^(OVER|UNDER)$/i.test(type) && type.toUpperCase() !== side) return "";
      return `${name} | ${side} | ${ou[2]} | ${odds}`;
    }
    if (/^\d+\+$/.test(header)) return `${name} | ${header} | ${odds}`;
    const yesNo = label.match(/\b(Yes|No)\b/i);
    if (yesNo && /anytime/i.test(market)) return `${name} | ${yesNo[1].toUpperCase()} | ${odds}`;
    return "";
  }
  function readRows(drawer) {
    const rows = new Set();
    if (!drawer) return rows;
    const market = title(drawer);
    for (const table of list(drawer, "table")) {
      const headers = list(table, "thead th");
      if (headers.some(cell => Number(cell.colSpan || 1) !== 1 || Number(cell.rowSpan || 1) !== 1)) continue;
      for (const tr of list(table, "tbody tr")) {
        const name = player(text(tr.querySelector("th"))), cells = list(tr, "td"), offset = headers.length - cells.length;
        if (!name || ![0, 1].includes(offset) || cells.some(cell => Number(cell.colSpan || 1) !== 1) ||
            offset === 1 && /^\d+\+$/.test(text(headers[0]))) continue;
        cells.forEach((cell, index) => {
          for (const btn of list(cell, "button")) {
            const row = selection(btn, name, text(headers[index + offset]), market);
            if (row) rows.add(row);
          }
        });
      }
    }
    const subjects = list(drawer, 'header.text-style-s-medium, button[data-testid="team-name"]');
    for (const subject of subjects) {
      const name = player(text(subject));
      if (!name) continue;
      let block = subject.parentElement;
      for (let depth = 0; block && block !== drawer && depth < 6; depth += 1, block = block.parentElement) {
        const names = new Set(list(block, 'header.text-style-s-medium, button[data-testid="team-name"]').map(text).map(player).filter(Boolean));
        if (names.size > 1) break;
        const buttons = list(block, 'button[data-type="OVER"], button[data-type="UNDER"], button[data-type="YES"], button[data-type="NO"]');
        if (!buttons.length) continue;
        for (const btn of buttons) {
          const row = selection(btn, name, "", market);
          if (row) rows.add(row);
        }
        break;
      }
    }
    return rows;
  }
  async function settledRows(key) {
    let rows = new Set(), previous = "";
    // Poll for actual prices, not the empty/zero-width skeleton in a nominally open details.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!sameContext()) return new Set();
      rows = readRows(findDrawer(key));
      const signature = [...rows].join("\n");
      if (signature && signature === previous) return rows;
      previous = signature;
      await wait(150);
    }
    return rows;
  }
  let rowCount = 0, drawerClicks = 0, expanded = 0;
  const emptyDrawers = [], drawerSamples = [];
  // Read each drawer before opening the next: some accordion groups allow only one open.
  for (const key of drawerKeys) {
    if (!sameContext()) break;
    let drawer = findDrawer(key);
    const summary = drawer?.querySelector("summary");
    if (!drawer || !summary || !visible(summary) || !noSelection(summary)) continue;
    if (!drawer.open) {
      summary.click(); // Trigger the site's lazy-loading handler; do not just set .open.
      drawerClicks += 1;
      await wait(250);
    }
    let rows = await settledRows(key);
    for (let round = 0; round < 4 && expanded < 24 && sameContext(); round += 1) {
      drawer = findDrawer(key);
      const more = list(drawer, "button").find(button => visible(button) && noSelection(button) && /^(Show more|See more|Show all)$/i.test(text(button)));
      if (!more) break;
      const before = [...rows].join("\n");
      more.click(); expanded += 1;
      await wait(350);
      rows = await settledRows(key);
      if ([...rows].join("\n") === before) break;
    }
    if (!sameContext()) break;
    drawer = findDrawer(key);
    if (!rows.size||list(drawer,'button').some(b=>visible(b)&&noSelection(b)&&/^(Show more|See more|Show all)$/i.test(text(b)))) emptyDrawers.push(key.market);
    if (event && rows.size) { out.push(`Market: ${key.market}`, ...rows); rowCount += rows.size; }
    drawerSamples.push({ title: key.market, open: !!drawer?.open, rows: rows.size, text: String(drawer?.innerText || "").slice(0, 3000) });
  }
  if (!sameContext()) {
    debug.push("THESCORE_NFL_DEBUG: Event URL or pregame context changed during drawer loading; stopped safely.");
    return result({ event, text: [...out, ...debug].join("\n") });
  }
  const labels = new Set(["popular", "main lines", "game lines", "player props", "passing", "rushing", "receiving", "touchdowns", "pass props", "rush props", "receiving props", "player passing", "player rushing", "player receiving", "passing props", "rushing props"]);
  function tabLabel(el) { return text(el).toLowerCase(); }
  const tabs = list(root, 'button, a, [role="tab"]').filter(el => {
    if (!visible(el) || !labels.has(tabLabel(el)) || !noSelection(el) || el.closest("details")) return false;
    if (el.tagName === "A") {
      try { const u = new URL(el.getAttribute("href"), location.href); return u.origin === location.origin && u.pathname === expectedPath && u.search === location.search; } catch { return false; }
    }
    return true;
  });
  for (const el of list(root, '[role="tab"][aria-selected="true"], [aria-current="page"]')) if (labels.has(tabLabel(el))) seen.add(tabLabel(el));
  const hash = decodeURIComponent(location.hash.slice(1)).replace(/[-_]/g, " ").toLowerCase();
  if (labels.has(hash)) seen.add(hash);
  const drawers = list(root, "details").filter(visible);
  debug.push(`THESCORE_NFL_DEBUG: ${JSON.stringify({ event, hash, tabs: [...new Set(tabs.map(tabLabel))], drawers: drawers.map(title).slice(0, 40), rows: rowCount, drawerClicks, expanded, emptyDrawers })}`);
  if (!event) debug.push("THESCORE_NFL_DEBUG: No unambiguous NFL event header; prices were not emitted.");
  // Preserve loaded samples before an exclusive accordion closes them again.
  const samples = [...drawerSamples, ...drawers.filter(drawer => !supported.test(title(drawer))).map(drawer => ({ title: title(drawer), text: String(drawer.innerText || "").slice(0, 3000) }))];
  for (const sample of samples.slice(0, 32)) debug.push(`THESCORE_NFL_RAW_DRAWER: ${JSON.stringify(sample)}`);
  const wantedTabs=new Set((demand.targetTypes||[]).flatMap(type=>type==='player_touchdowns'?['popular','touchdowns']:type.startsWith('player_passing')?['passing','pass props','passing props','player passing']:type.startsWith('player_rushing')?['rushing','rush props','rushing props','player rushing']:['receiving','receiving props','player receiving']));
  const next = tabs.find(el => !seen.has(tabLabel(el))&&(!demand.targetTypes?.length||wantedTabs.has(tabLabel(el))));
  let done = true;
  if (next) {
    seen.add(tabLabel(next));
    next.click(); // Exactly one tab click; never dispatch both click() and a click event.
    debug.push(`THESCORE_NFL_DEBUG: Requested tab ${tabLabel(next)}`);
    done = false;
  }
  return result({ event, visited: [...seen], done, pendingMarkets:emptyDrawers,
    pricedMarkets:drawerSamples.filter(s=>s.rows>0&&!emptyDrawers.includes(s.title)).map(s=>s.title),text: [...out, ...debug].join("\n") });
}
