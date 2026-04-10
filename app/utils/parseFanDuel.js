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

function parseFanDuelBetDate(text = "") {
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
  if (m) {
    return `${m[2]}/${m[3]}/${m[1]}`;
  }

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

function normalizeMoneySpacing(text = "") {
  return String(text)
    .replace(/\$\s+/g, "$")
    .replace(/\+\s+(\d{2,5})\b/g, "+$1")
    .replace(/-\s+(\d{2,5})\b/g, "-$1");
}

function cleanFanDuelSelection(text = "") {
  let s = cleanLine(text);

  s = s.replace(/^[^A-Za-z0-9]+/, "");
  s = s.replace(/([A-Za-z])([+-]\d)/g, "$1 $2");

  // 🔥 NEW — remove embedded odds early
  s = s.replace(/\s+[+-]\d{2,5}(?=\s|$)/g, "");

  s = s.replace(
    /\s+(Ice\)|RELY|TEE\]|\[P5\)|\|P5\)|P5\)|Er\]|EXE|BEX\)|BED\)|REE\)|SKE\]|x1e¥4|R1e14|R1eY|RIetd|cele\)|cele\]|sacieiel|sacs\]|ret|Sette\)|Se¥id|BFE\)|FEY|EN\)|EL\)|B39|BEY\)|ELE\]|Ee\]|SELEY|RETT|xieTeY)\s*$/i,
    ""
  );

  s = s.replace(/\s[+-]\d{2,5}\)?\s*$/i, "");
  s = s.replace(/\s["“”']?\d{3}\)?\s*$/i, "");
  s = s.replace(/\s+-\s+(Over|Under)\b/i, " $1");
  s = s.replace(/^\d+\s+(?=[A-Z][a-z])/, "");

  // Remove trailing odds again (safe redundancy)
  s = s.replace(/\s+[+-]\d{2,5}\s*$/i, "");

  // Remove bracket junk
  s = s.replace(/[\[\(\{].*?[\]\)\}]/g, "");

  // Remove common OCR garbage tokens
  s = s.replace(/\b(Ele|RELI|SELEY|BFE|E24|ED|EE|GD|TF)\b/gi, "");

  // Remove stray symbols / quotes
  s = s.replace(/["'=~®©]/g, "");

  // Final cleanup
  s = s.replace(/\s+/g, " ").trim();

  return s;
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

  m = s.match(/^(.*?)(\s["“”']?(\d{3}))\)?\s*$/);
  if (m) {
    const main = m[1].trim();
    const trailingDigits = m[3].trim();

    if (
      /\b(over|under)\b/i.test(main) ||
      /[+-]\d+(\.\d+)?/.test(main) ||
      /\b(points|rebounds|assists|threes|three-pointers|hits|rbis|home runs|shots|shots on goal|strikeouts|touchdowns|goals)\b/i.test(
        main
      )
    ) {
      return {
        text: main,
        odds: `-${trailingDigits}`,
      };
    }
  }

  return { text: s, odds: "" };
}

function isLikelyEventLine(line = "") {
  if (!line || line.length < 6) return false;

  const cleaned = cleanLine(line);

  // ❌ reject obvious non-event lines
  if (
    /\b(wager|risk|stake|odds|to win|total payout|cash out|same game parlay|sgp)\b/i.test(cleaned)
  ) {
    return false;
  }

  if (/\$/.test(cleaned)) return false;

  // FanDuel often uses simpler matchup lines, so loosen requirements
  const hasMatchupShape =
    /\s@\s/.test(cleaned) ||
    /\bvs\.?\b/i.test(cleaned) ||
    /\bv\b/i.test(cleaned) ||
    /\bat\b/i.test(cleaned);

  if (!hasMatchupShape) return false;

  // ❌ basic sanity checks (but looser than Caesars)
  const parts = cleaned.split(/@|vs\.?|v|at/i).map((p) => p.trim());
  if (parts.length < 2) return false;

  const [left, right] = parts;

  if (!left || !right) return false;

  // much looser than Caesars
  if (left.length < 2 || right.length < 2) return false;

  return true;
}

function cleanEventLine(line = "") {
  return cleanLine(line)
    .replace(/\b\d{1,2}:\d{2}\s*(AM|PM)\s*(ET|CT|MT|PT)?\b/gi, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFanDuelFinancials(cleaned = "", rawSelection = "") {
  const text = normalizeMoneySpacing(cleaned);

  const stake =
    toMoneyNumber(getMatch(text, /\bwager\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)) ||
    toMoneyNumber(getMatch(text, /\bstake\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)) ||
    toMoneyNumber(getMatch(text, /\brisk\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i));

  const toWin = toMoneyNumber(
    getMatch(text, /\bto win\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
  );

  const payout = toMoneyNumber(
    getMatch(text, /\btotal payout\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
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
  if (/\b(wager|odds|to win|total payout|share bet|cash out)\b/.test(l)) score -= 5;
  if (isLikelyEventLine(line)) score -= 4;

  return score;
}
function parseDateFromScreenshotFileName(sourceFileName = "") {
  const s = String(sourceFileName || "");

  // Matches: Screenshot_20260303-170021.png
  let m = s.match(/Screenshot_(\d{4})(\d{2})(\d{2})-\d{6}/i);
  if (m) {
    return `${m[2]}/${m[3]}/${m[1]}`;
  }

  // Slightly looser fallback
  m = s.match(/(\d{4})(\d{2})(\d{2})[-_]\d{6}/);
  if (m) {
    return `${m[2]}/${m[3]}/${m[1]}`;
  }

  return "";
}
export function parseFanDuelSlip({
  cleaned,
  originalText,
  sourceFileName = "",
  sportsbook = "FanDuel",
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

  const text = normalizeMoneySpacing(cleaned);
  const lines = text.split("\n").map(cleanLine).filter(Boolean);

  const betId = typeof extractBetId === "function" ? extractBetId(text) : "";
  const status = typeof detectStatus === "function" ? detectStatus(text) : "";
  const liveFlag = typeof detectLive === "function" ? detectLive(text) : "N";

const parsedBetDate =
  typeof parsePlacedDate === "function" ? parsePlacedDate(text) : "";

const betDate =
  toDateOnly(parsedBetDate) ||
  parseFanDuelBetDate(text) ||
  parseDateFromScreenshotFileName(sourceFileName);

  let fixture = "";
  for (const line of lines) {
    if (isLikelyEventLine(line)) {
      fixture = cleanEventLine(line);
      break;
    }
  }

    if (!fixture) {
    for (const line of lines) {
      const cleaned = cleanLine(line);

      if (/\s@\s/.test(cleaned) || /\bvs\b/i.test(cleaned)) {
        fixture = cleaned;
        break;
      }
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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line &&
      !isLikelyEventLine(line) &&
      !/\$/.test(line) &&
      line.length > 3
    ) {
      selectionCandidate = line;
      break;
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
  let selection = cleanFanDuelSelection(splitSelection.text || selectionCandidate);
  
  if (debug) {
  debugTrace.push({
    stage: "selection_cleaned",
    rawSelectionCandidate: selectionCandidate,
    splitSelection,
    cleanedSelection: selection,
  });
}

  const { stake, toWin, payout, odds } = extractFanDuelFinancials(
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
    impliedOdds =
      americanOddsFromStakeAndProfit(Number(stake), Number(toWin)) || "";
  }
  
  if (debug) {
  debugTrace.push({
    stage: "implied_odds",
    splitOdds: splitSelection.odds,
    extractedOdds: odds,
    finalImpliedOdds: impliedOdds,
  });
}

  const marketDetail = selection;
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
          id: fallbackId || `fanduel|${sourceFileName}|${Date.now()}`,
        };
  
  const row = {
    ...baseRow,
    id: baseRow.id || fallbackId || `fanduel|${sourceFileName}|${Date.now()}`,
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