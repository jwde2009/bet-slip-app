// app/utils/parseKalshi.js

import { detectLeague } from "./detectLeague";

function pushTrace(debugTrace, stage, data = {}) {
  if (!Array.isArray(debugTrace)) return;
  debugTrace.push({ stage, ...data });
}

function normalizeText(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\u00A0/g, " ")
    .trim();
}

function cleanLine(value = "") {
  return String(value || "")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLines(text = "") {
  return normalizeText(text)
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
}

function getMatch(text, regex) {
  const match = String(text || "").match(regex);
  return match ? (match[1] || match[0] || "").trim() : "";
}

function extractStake(text) {
  const raw =
    getMatch(text, /\bCost:\s*\$?([\d,]+(?:\.\d{2})?)/i) ||
    getMatch(text, /\bAmount:\s*\$?([\d,]+(?:\.\d{2})?)/i);
  return raw ? raw.replace(/,/g, "") : "";
}

function extractLegCount(text) {
  const raw =
    getMatch(text, /\b(\d+)\s+markets?\s+pay\b/i) ||
    getMatch(text, /\b(\d+)\s+market\b/i);
  return raw ? Number(raw) : 0;
}

function cleanFixtureLine(line = "") {
  return String(line || "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/^(?:[A-Z]\s+){1,3}(?=[A-Z][a-z]+\s+at\s+[A-Z][a-z]+)/, "")
    .replace(/^(?:[A-Z]{1,3}\s+){1,3}(?=[A-Z][a-z]+\s+at\s+[A-Z][a-z]+)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyMetaLine(line = "") {
  const s = String(line || "").toLowerCase();
  return (
    /\bkalshi\b/.test(s) ||
    /\bportfolio\b/.test(s) ||
    /\bmarket(s)? pay\b/.test(s) ||
    /\bcost:\b/.test(s) ||
    /\bfee\b/.test(s) ||
    /\bbought:\b/.test(s) ||
    /\border\b/.test(s) ||
    /\bfilled\b/.test(s) ||
    /\bstatus\b/.test(s) ||
    /\bcontracts?\b/.test(s) ||
    /\bshares?\b/.test(s) ||
    /\bquantity\b/.test(s) ||
    /\bpayout\b/.test(s) ||
    /\breturn\b/.test(s) ||
    /\bprofit\b/.test(s)
  );
}

function isFixtureLine(line = "") {
  const s = cleanLine(line);

  // must contain "at"
  if (!/\bat\b/i.test(s)) return false;

  // ignore obvious junk
  if (/cost|payout|odds|chance|buy|order/i.test(s)) return false;

  return true;
}

function detectExplicitLeague(sourceText = "", lines = []) {
  const joined = [sourceText, ...lines]
    .join("\n")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    joined.includes("pro basketball m") ||
    joined.includes("pro basketball") ||
    joined.includes("basketball m") ||
    joined.includes("nba")
  ) {
    return "NBA";
  }

  if (
    joined.includes("college basketball") ||
    joined.includes("ncaam") ||
    joined.includes("ncaab")
  ) {
    return "NCAAM";
  }

  if (joined.includes("wnba")) return "WNBA";

  if (
    joined.includes("pro baseball") ||
    joined.includes("baseball") ||
    joined.includes("mlb")
  ) {
    return "MLB";
  }

  if (
    joined.includes("pro football") ||
    joined.includes("football") ||
    joined.includes("nfl")
  ) {
    return "NFL";
  }

  if (
    joined.includes("pro hockey") ||
    joined.includes("hockey") ||
    joined.includes("nhl")
  ) {
    return "NHL";
  }

  if (
    joined.includes("soccer") ||
    joined.includes("champions league") ||
    joined.includes("premier league") ||
    joined.includes("mls")
  ) {
    return "Soccer";
  }

  return "";
}

function inferLeagueFromFixture(fixtureEvent = "", selection = "", marketDetail = "") {
  const text = `${fixtureEvent} ${selection} ${marketDetail}`.toLowerCase();

  if (
    /celtics|knicks|lakers|clippers|bucks|pacers|bulls|mavericks|spurs|pelicans|thunder|warriors|timberwolves|hornets|heat|nets|suns|grizzlies|nuggets|trail blazers|blazers|hawks|magic|pistons|raptors|76ers|sixers|cavaliers|rockets|jazz|kings/i.test(
      text
    )
  ) {
    return "NBA";
  }

  if (
    /yankees|mets|dodgers|cubs|cardinals|astros|braves|phillies|padres|giants|red sox|blue jays|orioles|guardians|mariners|rangers|twins|white sox|tigers|reds|pirates|brewers|diamondbacks|rockies|angels|athletics|a's|nationals|marlins|rays|royals/i.test(
      text
    )
  ) {
    return "MLB";
  }

  if (
    /chiefs|bills|ravens|bengals|cowboys|eagles|packers|bears|lions|vikings|49ers|seahawks|rams|chargers|raiders|broncos|jets|patriots|dolphins|steelers|browns|texans|colts|titans|jaguars|saints|falcons|panthers|buccaneers|commanders|giants|cardinals/i.test(
      text
    )
  ) {
    return "NFL";
  }

  if (
    /bruins|rangers|islanders|devils|flyers|penguins|capitals|hurricanes|lightning|panthers|leafs|maple leafs|canadiens|senators|sabres|red wings|blue jackets|avalanche|stars|wild|jets|predators|blues|blackhawks|kraken|canucks|oilers|flames|kings|ducks|sharks|golden knights/i.test(
      text
    )
  ) {
    return "NHL";
  }

  return "";
}

function inferLeagueFromAllText(sourceText = "") {
  const text = String(sourceText || "").toLowerCase();

  if (/basketball/.test(text)) return "NBA";
  if (/baseball/.test(text)) return "MLB";
  if (/football/.test(text)) return "NFL";
  if (/hockey/.test(text)) return "NHL";

  return "";
}

function normalizeTotalSelection(side, number, suffix = "") {
  const tail = suffix ? ` ${suffix}` : "";
  return `${side} ${number}${tail}`.trim();
}

function classifyLeg(line) {
  const value = cleanLine(line);
  if (!value) return null;

  const lower = value.toLowerCase();

  // 🔥 Handle "No - Over 224.5 points scored"
  let m = value.match(/^(Yes|No)\s*-\s*(Over|Under)\s+(\d+(?:\.\d+)?)/i);
  if (m) {
    const yesNo = m[1].toLowerCase();
    const ou = m[2];
    const number = m[3];

    return {
      raw: value,
      selection: `${yesNo === "yes" ? "Yes on" : "No on"} ${ou} ${number}`,
      betType: "total",
      marketDetail: value,
    };
  }

  // 🔥 Handle totals (very loose now)
  if (/over\s+\d+/.test(lower) || /under\s+\d+/.test(lower)) {
    const match = value.match(/(Over|Under)\s+(\d+(?:\.\d+)?)/i);
    if (match) {
      return {
        raw: value,
        selection: `${match[1]} ${match[2]}`,
        betType: "total",
        marketDetail: value,
      };
    }
  }

  // 🔥 Handle moneyline
  if (lower.includes("to win")) {
    const team = value.replace(/to win/i, "").trim();
    return {
      raw: value,
      selection: team,
      betType: "moneyline",
      marketDetail: value,
    };
  }

  // 🔥 Handle spread (looser)
  if (/[+-]\d+(\.\d+)?/.test(value)) {
    return {
      raw: value,
      selection: value,
      betType: "spread",
      marketDetail: value,
    };
  }

  // 🔥 fallback: if it looks like a meaningful line, keep it
  if (value.length > 5 && !isLikelyMetaLine(value)) {
    return {
      raw: value,
      selection: value,
      betType: "",
      marketDetail: value,
    };
  }

  return null;
}

function buildLegs(lines, debugTrace) {
  const legs = [];
  let currentFixture = "";

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);

    if (!line) continue;

    if (isFixtureLine(line)) {
      currentFixture = cleanFixtureLine(line);
      continue;
    }

    const leg = classifyLeg(line);
    if (!leg) continue;

    legs.push({
      ...leg,
      fixtureEvent: currentFixture,
    });
  }

  pushTrace(debugTrace, "kalshi_legs_built", {
    legCount: legs.length,
    legs,
  });

  return legs;
}

function summarizeParlayLegs(legs) {
  return legs.map((leg) => leg.raw).join(" | ");
}

function summarizeFixtures(legs) {
  const fixtures = [];
  for (const leg of legs) {
    const fixture = cleanFixtureLine(leg.fixtureEvent || "");
    if (fixture && !fixtures.includes(fixture)) {
      fixtures.push(fixture);
    }
  }
  return fixtures.join(" | ");
}

function getPrimaryBetType(legs, legCountFromTicket) {
  if ((legCountFromTicket || 0) > 1 || legs.length > 1) return "parlay";
  return legs[0]?.betType || "";
}

function getConfidenceFlag(legs, stake, fixtureEvent) {
  if (legs.length >= 1 && stake && fixtureEvent) return "Medium";
  if (legs.length >= 1 && stake) return "Medium";
  if (legs.length >= 1) return "Low";
  return "Low";
}

function shouldReviewLater({ legs, selection, betType }) {
  if (!legs.length) return "Y";
  if (!selection) return "Y";
  if (!betType) return "Y";

  // DO NOT require odds or fixture for Kalshi
  return "N";
}

export function parseKalshiSlip(cleaned, shared = {}) {
  const {
    detectStatus,
    extractBetId,
    enrichRow,
    parsePlacedDate,
  } = shared || {};

  const sourceText = normalizeText(cleaned || "");
  const lines = getLines(sourceText);
  const debugTrace = [];

  pushTrace(debugTrace, "kalshi_start", {
    lineCount: lines.length,
    preview: lines.slice(0, 25),
  });

  const bookmaker = "Kalshi";
  const stake = extractStake(sourceText);

  const placed =
    typeof parsePlacedDate === "function"
      ? parsePlacedDate(sourceText)
      : { raw: "", normalized: "", dateObj: null, dateOnly: "" };

  const rawPlacedDate = placed.raw || "";
  const betDate = placed.dateOnly || "";

  const status = typeof detectStatus === "function" ? detectStatus(sourceText) : "";
  const betId = typeof extractBetId === "function" ? extractBetId(sourceText) : "";
  const legCountFromTicket = extractLegCount(sourceText);

  const legs = buildLegs(lines, debugTrace);

  let selection = "";
  let marketDetail = "";
  let fixtureEvent = "";
  let betType = "";

  if (legs.length === 1) {
    selection = legs[0].selection || "";
    marketDetail = legs[0].marketDetail || "";
    fixtureEvent = cleanFixtureLine(legs[0].fixtureEvent || "");
    betType = legs[0].betType || "";
  } else if (legs.length > 1) {
    selection = summarizeParlayLegs(legs);
    marketDetail = legs.map((leg) => `${leg.betType}: ${leg.raw}`).join(" | ");
    fixtureEvent = summarizeFixtures(legs);
    betType = getPrimaryBetType(legs, legCountFromTicket);
  }

  const explicitLeague = detectExplicitLeague(sourceText, lines);
  const detectedLeague =
    detectLeague({
      cleaned: sourceText,
      marketDetail,
      fixtureEvent,
      selection,
      isParlay: betType === "parlay",
    }) || "";

    const sportLeague =
  explicitLeague ||
  detectedLeague ||
  inferLeagueFromFixture(fixtureEvent, selection, marketDetail) ||
  inferLeagueFromAllText(sourceText) ||
  "";
  const confidenceFlag = getConfidenceFlag(legs, stake, fixtureEvent);
  const reviewLater = shouldReviewLater({
    legs,
    selection,
    betType,
    fixtureEvent,
  });

  const row = {
    eventDate: "",
    betDate,
    bookmaker,
    sportLeague,
    selection,
    betType,
    fixtureEvent,
    stake,
    oddsUS: "",
    oddsSource: "",
    oddsMissingReason: "kalshi_no_american_odds_detected",
    live: "N",
    bonusBet: "N",
    win: "",
    marketDetail,
    payout: "",
    toWin: "",
    rawPlacedDate,
    status,
    parseWarning: reviewLater === "Y" ? "kalshi_needs_manual_review" : "",
    duplicateWarning: "",
    sourceFileName: "",
    sourceText,
    sourceImageUrl: "",
    reviewNotes: "",
    betId,
    accountOwner: "Me",
    betSourceTag: "",
    impliedProbability: "",
    confidenceFlag,
    likelyParserIssue: reviewLater === "Y" ? "Y" : "N",
    reviewLater,
    duplicateIgnored: "N",
    reviewResolved: "N",
    debugTrace,
  };

  pushTrace(debugTrace, "kalshi_result", {
    bookmaker: row.bookmaker,
    selection: row.selection,
    betType: row.betType,
    fixtureEvent: row.fixtureEvent,
    stake: row.stake,
    sportLeague: row.sportLeague,
    reviewLater: row.reviewLater,
  });

  return typeof enrichRow === "function" ? enrichRow(row) : row;
}