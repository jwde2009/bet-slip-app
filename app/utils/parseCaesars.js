import { detectLeague } from "./detectLeague";
import {
  americanOddsFromStakeAndProfit,
  detectOddsMissingReason,
  extractBestOdds,
} from "./oddsHelpers";

function toDateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.dateOnly) return value.dateOnly;
  return "";
}

function formatDateToMMDDYYYY(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function parseDateFromScreenshotFileName(sourceFileName = "") {
  const s = String(sourceFileName || "");

  let m = s.match(/Screenshot_(\d{4})(\d{2})(\d{2})-\d{6}/i);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;

  m = s.match(/(\d{4})(\d{2})(\d{2})[-_]\d{6}/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;

  return "";
}

function parseCaesarsBetDate(text = "") {
  const s = String(text || "").replace(/\s+/g, " ").trim();

  let m = s.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i
  );
  if (m) {
    const d = new Date(m[0]);
    const formatted = formatDateToMMDDYYYY(d);
    if (formatted) return formatted;
  }

  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;

  return "";
}

function getMatch(text, regex, group = 1) {
  const m = String(text || "").match(regex);
  return m ? String(m[group] || "").trim() : "";
}

function toMoneyNumber(value) {
  if (!value) return "";
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num.toFixed(2) : "";
}

function cleanLine(line = "") {
  return String(line).replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCaesarsText(text = "") {
  return String(text)
    .replace(/\$\s+/g, "$")
    .replace(/\+\s+(\d{2,5})\b/g, "+$1")
    .replace(/-\s+(\d{2,5})\b/g, "-$1");
}

function buildFallbackRowId({
  sourceFileName = "",
  betId = "",
  fixture = "",
  selection = "",
  stake = "",
  odds = "",
}) {
  return [sourceFileName, betId, fixture, selection, stake, odds]
    .filter(Boolean)
    .join("|");
}

function splitTrailingOdds(text = "") {
  const s = cleanLine(text);

  let m = s.match(/^(.*?)(\s[+-]\d{3,5})\)?\s*$/);
  if (m) {
    return {
      text: m[1].trim(),
      odds: m[2].trim(),
    };
  }

  return { text: s, odds: "" };
}

function cleanCaesarsSelection(text = "") {
  let s = cleanLine(text);

  s = s.replace(/^[^A-Za-z0-9]+/, "");
  s = s.replace(/([A-Za-z])([+-]\d)/g, "$1 $2");
  s = s.replace(/\s+[+-]\d{2,5}(?=\s|$)/g, "");

  s = s.replace(/\s[+-]\d{2,5}\)?\s*$/i, "");
  s = s.replace(/\s["“”']?\d{3}\)?\s*$/i, "");
  s = s.replace(/\s+-\s+(Over|Under)\b/i, " $1");
  s = s.replace(/^\d+\s+(?=[A-Z][a-z])/, "");
  s = s.replace(/[\[\(\{].*?[\]\)\}]/g, "");
  s = s.replace(/["'=~®©]/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();

  return s;
}

function isLikelyEventLine(line = "") {
  if (!line || line.length < 8) return false;
  if (
    /\b(wager|risk|stake|odds|to win|total payout|cash out|same game parlay|sgp)\b/i.test(
      line
    )
  ) {
    return false;
  }
  if (/\$/.test(line)) return false;

  return (
    /\s@\s/.test(line) ||
    /\bvs\.?\b/i.test(line) ||
    /\bv\b/.test(line) ||
    /\bat\b/i.test(line)
  );
}

function cleanEventLine(line = "") {
  return cleanLine(line)
    .replace(/\b\d{1,2}:\d{2}\s*(AM|PM)\s*(ET|CT|MT|PT)?\b/gi, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCaesarsFinancials(cleaned = "", rawSelection = "") {
  const text = normalizeCaesarsText(cleaned);

  const stake =
    toMoneyNumber(getMatch(text, /\b(wager|stake|risk)\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i, 2)) ||
    toMoneyNumber(getMatch(text, /\$([0-9]+(?:\.[0-9]{1,2})?)\s*(risk|stake|wager)\b/i, 1));

  const toWin =
  toMoneyNumber(
    getMatch(text, /\bto win\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
  ) ||
  toMoneyNumber(
    getMatch(text, /\bwin\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
  );

  const payout =
  toMoneyNumber(
    getMatch(text, /\b(total payout|payout)\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i, 2)
  ) ||
  toMoneyNumber(
    getMatch(text, /\btotal return\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
  );

  const bestOdds = extractBestOdds({
    receiptText: text,
    rawSelection,
    payout,
    stake,
  });

  const odds =
    (bestOdds && typeof bestOdds === "object" ? bestOdds.oddsUS : bestOdds) ||
    getMatch(text, /\bodds\s*:?\s*([+-]\d{3,5})\b/i);

  return { stake, toWin, payout, odds };
}

function inferBetType(selection = "", marketDetail = "") {
  const s = `${selection} ${marketDetail}`.toLowerCase();

  const hasOverUnder = /\b(over|under)\b/.test(s);
  const hasLine = /[+-]\d+(\.\d+)?/.test(selection);
  const hasNamedSelection = /\b[a-z][a-z'.-]+\s+[a-z][a-z'.-]+\b/i.test(selection);

  const hasPropWords =
    /\b(player|made threes|threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals|by ko\/tko|by points)\b/.test(
      s
    ) ||
    /^\d+\+\s+(made threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals)\b/i.test(
      selection
    ) ||
    /^player\s+\d+\+/i.test(selection);

  if ((hasOverUnder && (hasNamedSelection || hasPropWords)) || hasPropWords) {
    return "player prop";
  }

  if (hasOverUnder) return "total";
  if (hasLine) return "spread";
  if (selection) return "moneyline";

  return "";
}

function scoreSelectionLine(line = "") {
  const l = line.toLowerCase();
  let score = 0;

  if (!line || line.length < 2) return -100;

  if (/\b(over|under)\b/.test(l)) score += 4;
  if (
    /\b(player|made threes|threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals|by ko\/tko|by points)\b/.test(
      l
    )
  ) {
    score += 5;
  }
  if (/[+-]\d+(\.\d+)?/.test(line)) score += 3;

  if (/\$/.test(line)) score -= 5;
  if (/\b(wager|risk|stake|odds|to win|total payout|payout|cash out)\b/.test(l)) {
    score -= 5;
  }
  if (isLikelyEventLine(line)) score -= 4;

  return score;
}

export function parseCaesarsSlip({
  cleaned,
  originalText,
  sourceFileName = "",
  sportsbook = "Caesars",
  shared,
  debug = false,
}) {
  const debugTrace = [];
  const {
    detectStatus,
    detectLive,
    extractBetId,
    enrichRow,
    parsePlacedDate,
  } = shared || {};

  const text = normalizeCaesarsText(cleaned);
  const lines = text.split("\n").map(cleanLine).filter(Boolean);

  const betId = typeof extractBetId === "function" ? extractBetId(text) : "";
  const status = typeof detectStatus === "function" ? detectStatus(text) : "";
  const liveFlag = typeof detectLive === "function" ? detectLive(text) : "N";

  const parsedBetDate =
    typeof parsePlacedDate === "function" ? parsePlacedDate(text) : "";
  const betDate =
    toDateOnly(parsedBetDate) ||
    parseCaesarsBetDate(text) ||
    parseDateFromScreenshotFileName(sourceFileName);

  let fixture = "";
  for (const line of lines) {
    if (isLikelyEventLine(line)) {
      fixture = cleanEventLine(line);
      break;
    }
  }
if (debug) {
  debugTrace.push({
    stage: "fixture",
    fixture,
  });
}
  let selectionCandidate = "";
  let bestScore = -100;

  for (const line of lines) {
    const score = scoreSelectionLine(line);
    if (score > bestScore) {
      bestScore = score;
      selectionCandidate = line;
    }
  }

  if (bestScore < 2) {
    selectionCandidate = "";
  }
  if (debug) {
  debugTrace.push({
    stage: "selection_candidate",
    selectionCandidate,
    bestScore,
  });
}

  if (!selectionCandidate) {
    const anchorIndex = lines.findIndex((line) =>
      /\b(wager|risk|stake|odds|to win|total payout|payout)\b/i.test(line)
    );

    if (anchorIndex > 0) {
      const candidate = cleanLine(lines[anchorIndex - 1]);
      if (candidate && !isLikelyEventLine(candidate) && !/\$/.test(candidate)) {
        selectionCandidate = candidate;
      }
    }
  }
if (debug) {
  debugTrace.push({
    stage: "selection_after_fallback",
    selectionCandidate,
  });
}
  const splitSelection = splitTrailingOdds(selectionCandidate);
let selection = cleanCaesarsSelection(splitSelection.text || selectionCandidate);

selection = selection
  .replace(/[»›>]+$/g, "")
  .replace(/\s+[+-]?\d{2,5}(\.\d+)?$/g, "")
  .trim();

if (debug) {
  debugTrace.push({
    stage: "selection_cleaned",
    rawSelectionCandidate: selectionCandidate,
    splitSelection,
    cleanedSelection: selection,
  });
}

const { stake, toWin, payout, odds } = extractCaesarsFinancials(
  text,
  selectionCandidate
);

if (debug) {
  debugTrace.push({
    stage: "financials",
    stake,
    toWin,
    payout,
    odds,
  });
}

let impliedOdds = splitSelection.odds || odds;
if (!impliedOdds && stake && toWin) {
  impliedOdds = americanOddsFromStakeAndProfit(Number(stake), Number(toWin)) || "";
}

if (debug) {
  debugTrace.push({
    stage: "implied_odds",
    splitOdds: splitSelection.odds,
    extractedOdds: odds,
    finalImpliedOdds: impliedOdds,
  });
}

let marketDetail = selection;

if (/^(over|under)\b/i.test(selection) && fixture && !selection.includes("(")) {
  selection = `${selection} (${fixture})`;
  marketDetail = selection;
}

const betType = inferBetType(selection, marketDetail);
const league = detectLeague(fixture, selection, marketDetail) || "";

  const warnings = [];
  if (!stake) warnings.push("stake_missing");
  if (!payout && !toWin) warnings.push("payout_missing");
  if (!selection) warnings.push("selection_missing");
  if (!fixture) warnings.push("fixture_missing");
  if (!betDate) warnings.push("no_bet_date_detected");

  const oddsNote = impliedOdds
    ? ""
    : detectOddsMissingReason({
        oddsUS: impliedOdds,
        stake,
        payout,
        toWin,
        screenType: "",
      });

  const fallbackId = buildFallbackRowId({
    sourceFileName,
    betId,
    fixture,
    selection,
    stake,
    odds: impliedOdds,
  });

  const baseRow =
    shared?.emptyParsed && typeof shared.emptyParsed === "object"
      ? { ...shared.emptyParsed, sourceFileName }
      : {
          sourceFileName,
          id: fallbackId || `caesars|${sourceFileName}|${Date.now()}`,
        };

  const row = {
  ...baseRow,
  id: baseRow.id || fallbackId || `caesars|${sourceFileName}|${Date.now()}`,
  bookmaker: sportsbook,
  betId,
  eventDate: "",
  betDate,
  sportLeague: league,
  selection,
  betType,
  betSourceTag: "",
  fixtureEvent: fixture,
  stake,
  oddsUS: impliedOdds,
  oddsMissingReason: oddsNote,
  marketDetail,
  live: liveFlag === "Y" ? "Y" : "N",
  bonusBet: /\bbonus bet\b/i.test(text) ? "Y" : "N",
  reviewLater: warnings.length >= 2 ? "Y" : "N",
  warnings: warnings.join(" | "),
  parseWarning: warnings.join(" | "),
  rawText: originalText || cleaned,
  status,
  ...(debug ? { debugTrace } : {}),
};

  return typeof enrichRow === "function" ? enrichRow(row) : row;
}