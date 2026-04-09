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

function getMatch(text, regex, group = 1) {
  const m = text.match(regex);
  return m ? (m[group] || "").trim() : "";
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
    .replace(/\+\s+(\d{2,4})\b/g, "+$1")
    .replace(/-\s+(\d{2,4})\b/g, "-$1");
}

function cleanFanDuelSelection(text = "") {
  let s = cleanLine(text);

  // Remove leading OCR symbols / garbage
  s = s.replace(/^[^A-Za-z0-9]+/, "");

  // Normalize missing space before line values: "BYU2.5" or "Puerto Rico-2.5"
  s = s.replace(/([A-Za-z])([+-]\d)/g, "$1 $2");

  // Remove common junk endings
  s = s.replace(
    /\s+(Ice\)|RELY|TEE\]|\[P5\)|\|P5\)|P5\)|Er\]|EXE|BEX\)|BED\)|REE\)|SKE\]|x1e¥4|R1e14|R1eY|RIetd|cele\)|cele\]|sacieiel|sacs\]|ret|Sette\)|Se¥id|BFE\)|FEY|EN\)|EL\)|B39|3\)|45|BEY\))\s*$/i,
    ""
  );

  // Remove leftover trailing signed odds if they survived
  s = s.replace(/\s[+-]\d{2,4}\)?\s*$/i, "");

  // Remove leftover trailing unsigned 3-digit odds-like fragments
  s = s.replace(/\s\d{3}\)?\s*$/i, "");

  // Normalize "Player - Over 3.5" -> "Player Over 3.5"
  s = s.replace(/\s+-\s+(Over|Under)\b/i, " $1");

  // Remove leading stray number before player name: "85 Deni Avdija..."
  s = s.replace(/^\d+\s+(?=[A-Z][a-z])/,"");

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

  // Normal signed odds at the end
  let m = s.match(/^(.*?)(\s[+-]\d{2,4})\s*$/);
  if (m) {
    return {
      text: m[1].trim(),
      odds: m[2].trim(),
    };
  }

  // OCR sometimes drops the sign: e.g. "Under 156.5 114"
  // Treat a bare 3-digit ending as negative odds only when the main text
  // already looks like a bet selection.
  m = s.match(/^(.*?)(\s\d{3})\s*$/);
  if (m) {
    const main = m[1].trim();
    const trailing = m[2].trim();

    if (
      /\b(over|under)\b/i.test(main) ||
      /[+-]\d+(\.\d+)?/.test(main) ||
      /\b(points|rebounds|assists|threes|three-pointers|hits|rbis|home runs|shots|shots on goal|strikeouts|touchdowns|goals)\b/i.test(main)
    ) {
      return {
        text: main,
        odds: `-${trailing}`,
      };
    }
  }

  return { text: s, odds: "" };
}

function isLikelyEventLine(line = "") {
  if (!line || line.length < 8) return false;
  if (
    /\b(wager|odds|to win|total payout|share bet|cash out|same game parlay|sgp)\b/i.test(
      line
    )
  )
    return false;
  if (/\$/.test(line)) return false;

  const hasMatchupSeparator =
    /\s@\s/.test(line) ||
    /\bvs\.?\b/i.test(line) ||
    /\bv\b/.test(line) ||
    /\bat\b/i.test(line);

  return hasMatchupSeparator;
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
    toMoneyNumber(getMatch(text, /\bwager\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)) ||
    toMoneyNumber(getMatch(text, /\bstake\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)) ||
    toMoneyNumber(getMatch(text, /\brisk\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i));

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
    getMatch(text, /\bodds\s*([+-]\d{2,5})\b/i);

  return { stake, toWin, payout, odds };
}

function inferBetType(selection = "", marketDetail = "") {
  const s = `${selection} ${marketDetail}`.toLowerCase();

  const hasOverUnder = /\b(over|under)\b/.test(s);
  const hasNamedSelection = /\b[a-z][a-z'.-]+\s+[a-z][a-z'.-]+\b/i.test(selection);
  const hasLine = /[+-]\d+(\.\d+)?/.test(selection);

  const hasPropWords =
    /\b(player|made threes|threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals)\b/.test(
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
    /\b(points|rebounds|assists|threes|hits|rbis|home runs|shots|shots on goal|strikeouts|touchdowns|goals)\b/.test(
      l
    )
  )
    score += 4;

  if (/[+-]\d+(\.\d+)?/.test(line)) score += 3;

  if (/\$/.test(line)) score -= 5;
  if (/\b(wager|odds|to win|total payout|share bet|cash out)\b/.test(l))
    score -= 5;
  if (isLikelyEventLine(line)) score -= 4;

  return score;
}

export function parseFanDuelSlip({
  cleaned,
  originalText,
  sourceFileName = "",
  sportsbook = "FanDuel",
  shared,
}) {
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
  const isLive = typeof detectLive === "function" ? detectLive(text) : false;

  const parsedBetDate =
    typeof parsePlacedDate === "function" ? parsePlacedDate(text) : "";
  const betDate = toDateOnly(parsedBetDate);


  let fixture = "";
  for (const line of lines) {
    if (isLikelyEventLine(line)) {
      fixture = cleanEventLine(line);
      break;
    }
  }

  let selection = "";
  let bestScore = -100;

  for (const line of lines) {
    const score = scoreSelectionLine(line);
    if (score > bestScore) {
      bestScore = score;
      selection = line;
    }
  }

  if (bestScore < 2) {
    selection = "";
  }

  if (!selection) {
    const anchorIndex = lines.findIndex((line) =>
      /\b(wager|odds|to win|total payout)\b/i.test(line)
    );

    if (anchorIndex > 0) {
      const candidate = cleanLine(lines[anchorIndex - 1]);
      if (candidate && !isLikelyEventLine(candidate) && !/\$/.test(candidate)) {
        selection = candidate;
      }
    }
  }

  const { stake, toWin, payout, odds } = extractFanDuelFinancials(text);

  let impliedOdds = odds;

  const splitSelection = splitTrailingOdds(selection);
  selection = splitSelection.text;

  if (!impliedOdds && splitSelection.odds) {
    impliedOdds = splitSelection.odds;
  }

  selection = cleanFanDuelSelection(selection);

  const marketDetail = selection;
  const betType = inferBetType(selection, marketDetail);
  const league = detectLeague(fixture, selection, marketDetail) || "";

  const warnings = [];
  if (!stake) warnings.push("stake_missing");
  if (!payout && !toWin) warnings.push("payout_missing");
  if (!selection) warnings.push("selection_missing");
  if (!fixture) warnings.push("fixture_missing");
  if (!betDate) warnings.push("no_bet_date_detected");

  if (!impliedOdds && stake && toWin) {
    impliedOdds =
      americanOddsFromStakeAndProfit(Number(stake), Number(toWin)) || "";
  }

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
    typeof shared?.emptyParsed === "function"
      ? shared.emptyParsed(sourceFileName)
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
    live: isLive ? "Y" : "N",
    bonusBet: /\bbonus bet\b/i.test(text) ? "Y" : "N",
    reviewLater: warnings.length >= 2 ? "Y" : "N",
    warnings: warnings.join(" | "),
    parseWarning: warnings.join(" | "),
    rawText: originalText || cleaned,
    status,
  };

  return typeof enrichRow === "function" ? enrichRow(row) : row;
}