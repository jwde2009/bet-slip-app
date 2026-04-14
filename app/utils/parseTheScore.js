// app/utils/parseTheScore.js

import { detectLeague } from "./detectLeague";
import {
  detectOddsMissingReason,
  extractBestOdds,
  extractPayouts,
} from "./oddsHelpers";

function clean(value = "") {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLine(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getLines(text = "") {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function repairCommonOcrPlayerNoise(text = "") {
  return cleanLine(text)
    .replace(/\b0ver\b/gi, "Over")
    .replace(/\bUnd3r\b/gi, "Under")
    .replace(/\b0\b/g, "O")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyUiNoise(line = "") {
  const s = cleanLine(line);
  if (!s) return true;

  return (
    /^(home|my bets|live|search|share|betslip|open|settled)$/i.test(s) ||
    /^(straight|parlay|teaser)$/i.test(s) ||
    /^(quick deposit|reward available|keep picks in betslip)$/i.test(s) ||
    /^id:\s*[a-z0-9]+$/i.test(s) ||
    /^placed:/i.test(s) ||
    /^bet to win\b/i.test(s) ||
    /^bonus bet to win\b/i.test(s) ||
    /^credits to win\b/i.test(s) ||
    /^[x×]$/i.test(s) ||
    /^[+-]?\d{2,5}$/.test(s) ||
    /^\$?\d+(?:\.\d{1,2})?$/.test(s)
  );
}

function isLikelyFixtureLine(line = "") {
  const s = cleanLine(line);
  if (!s || isLikelyUiNoise(s)) return false;
  if (/\d/.test(s)) return false;

  return (
    /\b[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*\s*@\s*[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*\b/.test(s) ||
    /\b[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*\s+vs\.?\s+[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*\b/i.test(s)
  );
}

function normalizeFixtureLine(line = "") {
  const s = cleanLine(line)
    .replace(/\s+[x×]\s*$/i, "")
    .replace(/\bToday\b.*$/i, "")
    .trim();
    if (!/[A-Za-z]{3,}/.test(s)) return "";
    if (/\d/.test(s)) return "";

  let m = s.match(/\b(.+?)\s*@\s*(.+?)\b/i);
  if (m) return `${cleanLine(m[1])} @ ${cleanLine(m[2])}`;

  m = s.match(/\b(.+?)\s+vs\.?\s+(.+?)\b/i);
  if (m) return `${cleanLine(m[1])} @ ${cleanLine(m[2])}`;

  return "";
}

function isLikelySelectionLine(line = "") {
  const s = cleanLine(line);
  if (!s || isLikelyUiNoise(s)) return false;

  return (
    /\b(over|under)\b/i.test(s) ||
    /\b\d+\+\b/.test(s) ||
    /\bmoneyline\b/i.test(s) ||
    /\bgame spread\b/i.test(s) ||
    /\b(points|rebounds|assists|pra|3-pointers|three pointers|hits|rbis|home runs|shots on goal|saves|goals|total bases)\b/i.test(s)
  );
}

function scoreSelectionLine(line = "") {
  const s = cleanLine(line);
  let score = 0;

  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(s)) score += 2;
  if (/\b(over|under)\b/i.test(s)) score += 3;
  if (/\b\d+(?:\.\d+)?\b/.test(s)) score += 2;
  if (/\b[+-]\d{2,5}\b|\bEven\b/i.test(s)) score += 2;

  if (
    /\b(points|rebounds|assists|pra|3-pointers|three pointers|hits|rbis|home runs|shots on goal|saves|goals|total bases|moneyline|game spread)\b/i.test(s)
  ) {
    score += 3;
  }

  if (/^[A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,4}\b/.test(s)) {
    score += 1;
  }

  if (/\bplaced:|bet to win|credits to win|quick deposit|my bets|share\b/i.test(s)) {
    score -= 5;
  }

  return score;
}

function findBestFixtureLine(lines = []) {
  const fixtures = lines
    .filter(isLikelyFixtureLine)
    .map((line) => ({
      line,
      fixture: normalizeFixtureLine(line),
      score: /\bvs\.?\b/i.test(line) ? 2 : 3,
    }))
    .filter((x) => x.fixture);

  fixtures.sort((a, b) => b.score - a.score || a.line.length - b.line.length);
  return fixtures[0]?.fixture || "";
}

function findBestSelectionChunk(lines = []) {
  const scored = lines
    .map((line, idx) => ({ idx, line: cleanLine(line), score: scoreSelectionLine(line) }))
    .filter((x) => x.score >= 2);

  if (!scored.length) return "";

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const next = lines[best.idx + 1] ? cleanLine(lines[best.idx + 1]) : "";
  const prev = lines[best.idx - 1] ? cleanLine(lines[best.idx - 1]) : "";

  // Sometimes player + market are split across adjacent lines.
  const candidates = [
  `${best.line} ${next}`.trim(),
  `${prev} ${best.line}`.trim(),
  `${prev} ${best.line} ${next}`.trim(),
  `${next} ${best.line}`.trim(),
  best.line,
];

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

function stripNoise(text = "") {
  return clean(text)
    .replace(/\bQuick Deposit\b/gi, " ")
    .replace(/\bKeep picks in betslip\b/gi, " ")
    .replace(/\bHome My Bets Live Search\b/gi, " ")
    .replace(/\bShare\b/gi, " ")
    .replace(/\bBetslip\b/gi, " ")
    .replace(/\bSTRAIGHT PARLAY TEASER\b/gi, " ")
    .replace(/\bReward Available\b/gi, " ")
    .replace(/\bBonus Bets?\b/gi, " ")
    .replace(/\bCredits To Win\b/gi, " ")
    .replace(/\bCredits:\s*\d+(?:\.\d+)?\b/gi, " ")
    .replace(/\bOpen Settled\b/gi, " ")
    .replace(/\bOPEN SETTLED\b/gi, " ")
    .replace(/\bMy Bets\b/gi, " ")
    .replace(/\bLive Search\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBetId(text = "") {
  const m = text.match(/\bID:\s*([A-Za-z0-9]+)/i);
  return m ? m[1] : "";
}

function extractBetDate(text = "", parsePlacedDate) {
  if (typeof parsePlacedDate === "function") {
    const placed = parsePlacedDate(text);
    if (placed?.dateOnly) return { raw: placed.raw || "", dateOnly: placed.dateOnly };
  }

  const m = text.match(/\bPlaced:\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}[^|]*)/i);
  return {
    raw: m ? m[1].trim() : "",
    dateOnly: "",
  };
}

function extractStake(text = "") {
  const candidates = [
    text.match(/\bBet To Win\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\b/i),
    text.match(/\bBonus Bet To Win\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\b/i),
    text.match(/\bCredits To Win\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\b/i),
  ];

  for (const m of candidates) {
    if (m) return m[1];
  }

  return "";
}

function extractToWin(text = "") {
  const candidates = [
    text.match(/\bBet To Win\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\b/i),
    text.match(/\bBonus Bet To Win\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\b/i),
    text.match(/\bCredits To Win\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\b/i),
  ];

  for (const m of candidates) {
    if (m) return m[2];
  }

  return "";
}

function extractSelectionAndMarket(text = "") {
  const statPattern =
    "(?:Points|Player Total Points|Total Points|Rebounds|Player Total Rebounds|Total Rebounds|Assists|Player Total Assists|Total Assists|Points, Rebounds And Assists|Pts \\+ Reb \\+ Ast|PRA|3-Pointers Made|Total 3-Pointers Made|Three Pointers Made|Hits|Total Hits|RBIs|Total RBIs|Home Runs|Total Home Runs|Shots on Goal|Total Shots on Goal|Saves|Total Saves|Goals|Total Goals|Points/Assists|Total Bases)";

  const patterns = [
    new RegExp(`\\b(Over|Under|\\d\\+)\\s*(\\d+(?:\\.\\d+)?)?\\s*[vV]?\\s*([+-]\\d{2,5}|Even)\\s+([A-Z][A-Za-z.'\\-]+(?:\\s+[A-Z][A-Za-z.'\\-]+){0,3})\\s+(${statPattern})\\b`, "i"),
    new RegExp(`\\b([A-Z][A-Za-z.'\\-]+(?:\\s+[A-Z][A-Za-z.'\\-]+){0,3})\\s+(${statPattern})\\s+(Over|Under|\\d\\+)\\s*(\\d+(?:\\.\\d+)?)?\\s*[vV]?\\s*([+-]\\d{2,5}|Even)\\b`, "i"),
    /\b([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,3})\s+(Moneyline|Game Spread)\s+([+-]\d{2,5}|Even)\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;

    if (m.length >= 6 && /Moneyline|Game Spread/i.test(m[2] || "")) {
      const playerOrTeam = cleanLine(m[1]);
      const marketDetail = cleanLine(m[2]);
      const oddsUS = m[3] === "Even" ? "+100" : m[3];
      return {
        rawSelection: playerOrTeam,
        marketDetail,
        oddsUS,
      };
    }

    if (/Over|Under|\d\+/i.test(m[1])) {
      const side = cleanLine(m[1]);
      const line = cleanLine(m[2] || "");
      const player = cleanLine(m[4]);
      const stat = cleanLine(m[5]);
      const oddsUS = m[3] === "Even" ? "+100" : m[3];

      return {
        rawSelection: `${side} ${line} ${player} ${stat}`.trim(),
        marketDetail: stat,
        oddsUS,
      };
    } else {
      const player = cleanLine(m[1]);
      const stat = cleanLine(m[2]);
      const side = cleanLine(m[3]);
      const line = cleanLine(m[4] || "");
      const oddsUS = m[5] === "Even" ? "+100" : m[5];

      return {
        rawSelection: `${side} ${line} ${player} ${stat}`.trim(),
        marketDetail: stat,
        oddsUS,
      };
    }
  }

  const genericOU = text.match(/\b(Over|Under)\s+(\d+(?:\.\d+)?)\s*[vV]?\s*([+-]\d{2,5}|Even)\b/i);
  if (genericOU) {
    return {
      rawSelection: `${genericOU[1]} ${genericOU[2]}`,
      marketDetail: "",
      oddsUS: genericOU[3] === "Even" ? "+100" : genericOU[3],
    };
  }

  const moneyline = text.match(/\b([A-Z][A-Za-z.'& -]+?)\s+Moneyline\b.*?\b([+-]\d{2,5}|Even)\b/i);
  if (moneyline) {
    return {
      rawSelection: cleanLine(moneyline[1]),
      marketDetail: "Moneyline",
      oddsUS: moneyline[2] === "Even" ? "+100" : moneyline[2],
    };
  }

  return {
    rawSelection: "",
    marketDetail: "",
    oddsUS: "",
  };
}

function classifyBetType(selection = "", marketDetail = "", fixtureEvent = "") {
  const text = clean(`${selection} ${marketDetail} ${fixtureEvent}`).toLowerCase();

  if (/moneyline/.test(text)) return "moneyline";
  if (/spread/.test(text)) return "spread";
  if (/over|under|total|o\/u|saves|hits|rbis|rebounds|assists|points|3-pointers|threes|shots on goal|goals|total bases/.test(text)) {
    if (
      /points|rebounds|assists|hits|rbis|home runs|3-pointers|threes|shots on goal|saves|goals|total bases|pra/.test(text)
    ) {
      return "player prop";
    }
    return "total";
  }

  return "straight";
}

export function parseTheScoreSlip({
  cleaned,
  originalText,
  sourceFileName,
  shared,
  debug = true,
}) {
  const {
    emptyParsed,
    cleanTextLine,
    parsePlacedDate,
    inferEventDate,
    buildPlayerPropSelection,
    detectStatus,
    detectLive,
    enrichRow,
  } = shared;

  const cleanedForLines = cleaned
  .replace(/\s-\s/g, " ")
  .replace(/\r/g, "\n");

  const cleanedAdjusted = cleanedForLines
    .replace(/\s+/g, " ")
    .trim();

  const betId = extractBetId(cleanedAdjusted);
  const placed = extractBetDate(cleanedAdjusted, parsePlacedDate);

  const text = stripNoise(cleanedAdjusted);
const lines = getLines(cleanedForLines).filter((line) => !isLikelyUiNoise(line));

let finalFixture = findBestFixtureLine(lines);

if (finalFixture) {
  const parts = finalFixture.split("@").map((s) => s.trim());

  if (parts.length !== 2 || parts.some((p) => p.length < 3)) {
    finalFixture = "";
  }
}

const selectionChunk = findBestSelectionChunk(lines);

let finalSelectionChunk = selectionChunk;

if (!finalSelectionChunk) {
  const fallback = lines.find((line) =>
  /\b(over|under|moneyline|spread|total|points|rebounds|assists|3-pointers|three pointers|hits|rbis|home runs|shots on goal|saves|goals|total bases)\b/i.test(line)
  ||
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(line)
);

  finalSelectionChunk = fallback || "";
}

const extracted = extractSelectionAndMarket(
  repairCommonOcrPlayerNoise(finalSelectionChunk || text)
);

let rawSelection = cleanTextLine(extracted.rawSelection || "");
let marketDetail = cleanTextLine(extracted.marketDetail || "");

if (!rawSelection && finalFixture) {
  const [teamA, teamB] = finalFixture.split("@").map((s) => s.trim());

  if (teamA && teamB) {
    const matchingLine = lines.find((line) => {
      const lower = line.toLowerCase();
      const aKey = teamA.toLowerCase().split(" ")[0];
      const bKey = teamB.toLowerCase().split(" ")[0];
      return lower.includes(aKey) || lower.includes(bKey);
    });

    if (matchingLine) {
      const lowerLine = matchingLine.toLowerCase();
      const aKey = teamA.toLowerCase().split(" ")[0];
      const bKey = teamB.toLowerCase().split(" ")[0];

      const hasA = lowerLine.includes(aKey);
      const hasB = lowerLine.includes(bKey);

      if (hasA && !hasB) rawSelection = teamA;
      else if (hasB && !hasA) rawSelection = teamB;
      else rawSelection = teamA;
    } else {
      rawSelection = teamA;
    }

    if (/[+-]\d{2,5}/.test(text) && !/over|under/i.test(text)) {
      marketDetail = "Game Spread";
    } else if (/over|under|total/i.test(text)) {
      marketDetail = "Total";
    } else {
      marketDetail = "Moneyline";
    }
  }
}

if (!rawSelection && finalSelectionChunk) {
  rawSelection = finalSelectionChunk.split(" ")[0];
}

  let oddsUS = cleanTextLine(extracted.oddsUS || "");

  const payoutInfo = extractPayouts(text);
  const payout = payoutInfo.payout || "";
  const toWin = extractToWin(text) || payoutInfo.toWin || "";
  const stake = extractStake(text) || "";

  const betType = classifyBetType(rawSelection, marketDetail, finalFixture);

  let selection =
    betType === "player prop"
      ? buildPlayerPropSelection(rawSelection, marketDetail)
      : rawSelection;

  selection = cleanTextLine(selection)
    .replace(/\bToday\b.*$/i, "")
    .replace(/\bBetslip\b.*$/i, "")
    .trim();

  const eventDate = inferEventDate({
    cleaned: text,
    fixtureEvent: finalFixture,
    betDate: placed.dateOnly || "",
  });

  const sportLeague = detectLeague({
    cleaned: text,
    marketDetail,
    fixtureEvent: finalFixture,
    selection,
    isParlay: false,
  });

  const status = /open|accepted|settled/i.test(text)
    ? "Open"
    : detectStatus(text, text);

  const win = status === "Won" ? "Y" : status === "Lost" ? "N" : "";
  const bonusBet = /\bbonus bet\b|credits:/i.test(cleanedAdjusted) ? "Y" : "N";

  let oddsSource = oddsUS ? "OCR" : "";

  const bestOdds = extractBestOdds(text, rawSelection, marketDetail);

  if (!oddsUS) {
    if (typeof bestOdds === "string") {
      oddsUS = bestOdds;
      oddsSource = oddsUS ? "Derived" : "";
    } else if (bestOdds && typeof bestOdds === "object") {
      oddsUS = bestOdds.oddsUS || "";
      oddsSource = bestOdds.oddsSource || (oddsUS ? "Derived" : "");
    }
  }

  const oddsMissingReason = detectOddsMissingReason({
    oddsUS,
    stake,
    payout,
    toWin,
    screenType: "receipt",
  });

  const additionalWarnings = [];
  if (finalSelectionChunk && !rawSelection) additionalWarnings.push("thescore_selection_unparsed");
  if (finalFixture && !/@/.test(finalFixture)) additionalWarnings.push("thescore_fixture_shape_suspect");
  if (rawSelection && /today|share|betslip|my bets/i.test(rawSelection)) additionalWarnings.push("thescore_selection_contains_ui_noise");
  if (!betId) additionalWarnings.push("thescore_bet_id_missing");
  if (!selection) additionalWarnings.push("thescore_selection_missing");
  if (!finalFixture) additionalWarnings.push("thescore_fixture_missing");
  if (!oddsUS) additionalWarnings.push("receipt_detected_but_odds_missing");
  if (!payout && !toWin) additionalWarnings.push("receipt_detected_but_payout_missing");
  if (!stake) additionalWarnings.push("stake_missing");
  if (!placed.dateOnly) additionalWarnings.push("no_bet_date_detected");
  if (!sportLeague) additionalWarnings.push("no_league_detected");

  const parseWarning = additionalWarnings.join(" | ");

  return enrichRow({
    ...emptyParsed,
    eventDate,
    betDate: placed.dateOnly || "",
    bookmaker: "theScore",
    sportLeague,
    selection,
    betType,
    fixtureEvent: finalFixture,
    stake,
    oddsUS,
    oddsSource,
    oddsMissingReason,
    live: detectLive(text),
    bonusBet,
    win,
    marketDetail,
    payout,
    toWin,
    rawPlacedDate: placed.raw || "",
    status,
    parseWarning,
    sourceFileName,
    sourceText: originalText,
    reviewNotes: "",
    betId,
  });
}