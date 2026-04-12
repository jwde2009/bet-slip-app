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
  return (
    getMatch(text, /\bOdds[:\s]*([+-]\d{2,5})/i) ||
    getMatch(text, /(^|\s)([+-]\d{2,5})(?=\s|$)/i.replace ? "" : "") ||
    ""
  );
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
    s.includes("settled")
  );
}

function looksLikeFixture(line = "") {
  const s = String(line || "");
  return (
    /@| v | vs | vs\. /i.test(s) ||
    /\b[A-Za-z]+\s+at\s+[A-Za-z]+\b/i.test(s)
  );
}

function extractFixture(lines = []) {
  const match =
    lines.find((line) => looksLikeFixture(line) && !isLikelyMeta(line)) || "";
  return match;
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

  // totals
  const totalLine = nonMeta.find((line) => /\b(Over|Under)\s+\d+(?:\.\d+)?/i.test(line));
  if (totalLine) {
    return {
      selection: clean(totalLine),
      marketDetail: clean(totalLine),
    };
  }

  // team/player + spread
  const spreadLine = nonMeta.find(
    (line) => /[A-Za-z].*\s[+-]\d+(?:\.\d+)?\b/.test(line) && !/\b[+-]\d{2,5}\b/.test(line)
  );
  if (spreadLine) {
    return {
      selection: clean(spreadLine),
      marketDetail: clean(spreadLine),
    };
  }

  // "X to win"
  const winLine = nonMeta.find((line) => /\bto win\b/i.test(line));
  if (winLine) {
    const selection = clean(winLine.replace(/\bto win\b/i, ""));
    return {
      selection,
      marketDetail: clean(winLine),
    };
  }

  // fallback: first non-meta non-fixture line
  const candidate = nonMeta.find((line) => !looksLikeFixture(line));
  return {
    selection: clean(candidate || ""),
    marketDetail: clean(candidate || ""),
  };
}

export function parseBet365Slip(cleaned, shared = {}) {
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

  const fixtureEvent = extractFixture(lines);
  const { selection, marketDetail } = extractSelectionAndMarket(lines, sourceText);

  let oddsUS = extractOddsUS(sourceText);
  if (!oddsUS) oddsUS = extractOddsUSFallback(sourceText);

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
    eventDate: "",
    betDate: placed.dateOnly || "",
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
    sourceFileName: "",
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