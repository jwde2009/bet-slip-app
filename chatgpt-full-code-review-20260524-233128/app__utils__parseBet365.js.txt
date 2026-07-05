// app/utils/parseBet365.js

import { detectLeague } from "./detectLeague";

function clean(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLines(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean);
}

function pushTrace(debugTrace, stage, data = {}) {
  if (!Array.isArray(debugTrace)) return;
  debugTrace.push({ stage, ...data });
}

function getMatch(text, regex) {
  const m = String(text || "").match(regex);
  return m ? String(m[1] || "").trim() : "";
}

function extractStake(text = "") {
  return (
    getMatch(text, /\bStake[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(text, /\bTotal Stake[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(text, /\bWager(?: To Return)?[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(text, /\bBet Placed[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
    ""
  ).replace(/,/g, "");
}

function extractToWin(text = "") {
  return (
    getMatch(text, /\bTo Win[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(text, /\bReturns?[:\s]*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
    ""
  ).replace(/,/g, "");
}

function extractOddsUS(text = "") {
  return getMatch(text, /\bOdds[:\s]*([+-]\d{2,5})/i);
}

// safer odds fallback
function extractOddsUSFallback(text = "") {
  const m = String(text).match(/(^|\s)([+-]\d{2,5})(?=\s|$)/);
  return m ? m[2] : "";
}

function isLikelyMeta(line = "") {
  const s = String(line || "").toLowerCase();

  return (
    s.includes("bet365") ||
    s.includes("receipt") ||
    s.includes("open bets") ||
    s.includes("my bets") ||
    s.includes("cash out") ||
    s.includes("stake") ||
    s.includes("to win") ||
    s.includes("returns") ||
    s.includes("potential returns") ||
    s.includes("single") ||
    s.includes("parlay") ||
    s.includes("placed") ||
    s.includes("settled") ||
    s.includes("reuse selections") ||
    s.includes("bet ref") ||
    s.includes("all sports") ||
    s.includes("live") ||
    s.includes("search") ||
    /^[0-9:.\- ]+$/.test(s) || // time / numeric junk
    (s.match(/[=&%$#]/g) || []).length > 3 // heavy OCR noise
  );
}

function looksLikeFixture(line = "") {
  const s = String(line || "").trim();

  // must contain matchup indicator
  if (!/@| vs | v | at /i.test(s)) return false;

  // reject lines starting with time (common OCR noise)
  if (/^\d{1,2}:\d{2}/.test(s)) return false;

  // reject lines with too many symbols (OCR garbage)
  const symbolCount = (s.match(/[=&%$#]/g) || []).length;
  if (symbolCount > 2) return false;

  // must have enough letters (real teams)
  const alphaCount = (s.match(/[a-z]/gi) || []).length;
  if (alphaCount < 6) return false;

  return true;
}
function extractFixture(lines = []) {
  const candidates = lines.filter(
    (line) => looksLikeFixture(line) && !isLikelyMeta(line)
  );

  if (!candidates.length) return "";

  const score = (s) => {
    const letters = (s.match(/[a-z]/gi) || []).length;
    const symbols = (s.match(/[^a-z0-9\s@]/gi) || []).length;
    const hasAt = /@/.test(s) ? 12 : 0;
    return letters - symbols + hasAt;
  };

  const sorted = candidates.sort((a, b) => score(b) - score(a));
  const best = sorted[0];
  const idx = lines.indexOf(best);

  // 🔥 strongest: combine 3 lines
  if (idx > 0 && idx < lines.length - 1) {
    const combined = `${lines[idx - 1]} ${best} ${lines[idx + 1]}`;
    if (looksLikeFixture(combined)) return combined;
  }

  // combine previous
  if (idx > 0) {
    const combined = `${lines[idx - 1]} ${best}`;
    if (looksLikeFixture(combined)) return combined;
  }

  // combine next
  if (idx < lines.length - 1) {
    const combined = `${best} ${lines[idx + 1]}`;
    if (looksLikeFixture(combined)) return combined;
  }

  return best;
}

function classifyBetType(selection = "", marketDetail = "") {
  const text = `${selection} ${marketDetail}`.toLowerCase();

  if (/\bover\b|\bunder\b|\btotal\b/i.test(text)) return "total";
  if (/[+-]\d+(?:\.\d+)?/.test(selection) && !/\b[+-]\d{2,5}\b/.test(selection)) return "spread";
  if (/\bmoneyline\b/i.test(text)) return "moneyline";
  if (/\bto win\b/i.test(text)) return "moneyline";

  return "straight";
}

function extractSelectionAndMarket(lines = [], text = "") {
  const nonMeta = lines.filter((line) => !isLikelyMeta(line));

  // prioritize player props first (most common for bet365)
  const playerProp = nonMeta.find((line) =>
    / - (Over|Under)\s+\d+(\.\d+)?/i.test(line)
  );

  if (playerProp) {
    return {
      selection: clean(playerProp),
      marketDetail: clean(playerProp),
    };
  }

  // totals
  const totalLine = nonMeta.find((line) =>
    /\b(Over|Under)\s+\d+(\.\d+)?/i.test(line)
  );

  if (totalLine) {
    return {
      selection: clean(totalLine),
      marketDetail: clean(totalLine),
    };
  }

  // spreads
  const spreadLine = nonMeta.find(
    (line) =>
      /[A-Za-z].*\s[+-]\d+(\.\d+)?/.test(line) &&
      !/\b[+-]\d{2,5}\b/.test(line)
  );

  if (spreadLine) {
    return {
      selection: clean(spreadLine),
      marketDetail: clean(spreadLine),
    };
  }

  // fallback: best alpha-heavy line
  const scored = nonMeta
    .map((line) => ({
      line,
      score: (line.match(/[a-z]/gi) || []).length,
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored.find(
  (x) => (x.line.match(/[a-z]/gi) || []).length > 8
)?.line || scored[0]?.line || "";

  return {
    selection: clean(best),
    marketDetail: clean(best),
  };
}

function extractDateFromFilename(fileName = "") {
  const m = String(fileName).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}


export function parseBet365Slip(cleaned, shared = {}, sourceFileName = "") {
  const {
    enrichRow,
    parsePlacedDate,
    detectStatus,
    extractBetId,
  } = shared || {};

  const sourceText = clean(cleaned || "");
  const lines = getLines(cleaned || "");
  const debugTrace = [];

  pushTrace(debugTrace, "bet365_start", {
    lineCount: lines.length,
    preview: lines.slice(0, 20),
  });

  const placed =
  typeof parsePlacedDate === "function"
    ? parsePlacedDate(sourceText)
    : { raw: "", normalized: "", dateObj: null, dateOnly: "" };

const fallbackDate = extractDateFromFilename(sourceFileName);

  const fixtureEvent = extractFixture(lines);
  let { selection, marketDetail } = extractSelectionAndMarket(lines, sourceText);

// strip trailing odds like "+130" or "-145"
selection = selection.replace(/\s+[+-]\d{2,5}\s*$/i, "").trim();
selection = selection
  .replace(/[=&%$#]+/g, " ")
  .replace(/\s{2,}/g, " ")
  .trim();
  
if (/ - (Over|Under)\s+\d+(\.\d+)?/i.test(selection)) {
  const parts = selection.split(" - ");
  const player = parts[0] || "";
  const rest = parts[1] || "";

  const md = `${marketDetail} ${sourceText} ${selection}`.toLowerCase();

  let stat = "";

if (/rebound/i.test(md)) stat = "rebounds";
else if (/assist/i.test(md)) stat = "assists";
else if (/point/i.test(md)) stat = "points";
else if (/three|3pt|3-point/i.test(md)) stat = "threes";
else if (/shot/i.test(md)) stat = "shots";
else if (/goal/i.test(md)) stat = "goals";

  selection = stat
    ? `${player} ${rest.toLowerCase()} ${stat}`
    : `${player} ${rest.toLowerCase()}`;

  selection = selection.replace(/\s{2,}/g, " ").trim();
}

// final fallback: if still no stat but looks like player prop
if (
  /under|over/i.test(selection) &&
  !/rebounds|assists|points|threes|shots|goals/i.test(selection)
) {
  const md = `${marketDetail} ${sourceText}`.toLowerCase();

  if (/rebound/i.test(md)) selection += " rebounds";
  else if (/assist/i.test(md)) selection += " assists";
  else if (/point/i.test(md)) selection += " points";
  else if (/three|3pt/i.test(md)) selection += " threes";
  else if (/shot/i.test(md)) selection += " shots";
  else if (/goal/i.test(md)) selection += " goals";
}

  let oddsUS =
  extractOddsUS(selection) ||
  extractOddsUS(sourceText) ||
  extractOddsUSFallback(sourceText);

  const stake = extractStake(sourceText);
  const toWin = extractToWin(sourceText);
  const betType = classifyBetType(selection, marketDetail);

  const sportLeague =
    detectLeague({
      cleaned: sourceText,
      marketDetail,
      fixtureEvent,
      selection,
      isParlay: false,
    }) || "";

  const status = typeof detectStatus === "function" ? detectStatus(sourceText) : "";
  const betId = typeof extractBetId === "function" ? extractBetId(sourceText) : "";

  const reviewLater =
    !selection || !stake || !oddsUS ? "Y" : "N";

  const row = {
    eventDate: placed.dateOnly || fallbackDate || "",
    betDate: placed.dateOnly || fallbackDate || "",
    bookmaker: "bet365",
    sportLeague,
    selection,
    betType,
    fixtureEvent,
    stake,
    oddsUS,
    oddsSource: oddsUS ? "OCR" : "",
    oddsMissingReason: oddsUS ? "" : "bet365_odds_missing",
    live: "N",
    bonusBet: "N",
    win: "",
    marketDetail,
    payout: "",
    toWin,
    rawPlacedDate: placed.raw || "",
    status,
    parseWarning: reviewLater === "Y" ? "bet365_needs_review" : "",
    duplicateWarning: "",
    sourceFileName,
    sourceText,
    sourceImageUrl: "",
    reviewNotes: "",
    betId,
    accountOwner: "Me",
    betSourceTag: "",
    impliedProbability: "",
    confidenceFlag: selection && stake && oddsUS ? "Medium" : "Low",
    likelyParserIssue: reviewLater === "Y" ? "Y" : "N",
    reviewLater,
    duplicateIgnored: "N",
    reviewResolved: "N",
    debugTrace,
  };

  pushTrace(debugTrace, "bet365_result", {
    selection: row.selection,
    betType: row.betType,
    fixtureEvent: row.fixtureEvent,
    stake: row.stake,
    oddsUS: row.oddsUS,
    sportLeague: row.sportLeague,
    reviewLater: row.reviewLater,
  });

  return typeof enrichRow === "function" ? enrichRow(row) : row;
}