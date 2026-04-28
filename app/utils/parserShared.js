// app/utils/parserShared.js

export function cleanTextLine(value) {
  return String(value || "")
    .replace(/\bCASH\s*OUT\b/gi, "")
    .replace(/\bASH\s*OUT\b/gi, "")
    .replace(/\bASHOUT\b/gi, "")
    .replace(/\bCASHOUT\b/gi, "")
    .replace(/[®™«»©]/g, "")
    .replace(/[()\[\]{}]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[^\w\s@.+\-/:&'#,]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/O\/\s*U/gi, "O/U")
    .replace(/([+-])\s+(\d{2,5})\b/g, "$1$2")
    .replace(/\bCASH\s+OUT\b/gi, "CASH OUT")
    .replace(/\bASH\s+OUT\b/gi, "ASH OUT")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatDateMMDDYYYY(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const y = String(dateObj.getFullYear());
  return `${m}/${d}/${y}`;
}

export function normalizeDateString(raw) {
  if (!raw) return "";
  return raw
    .replace(/,\s*/g, ", ")
    .replace(/(\d)(AM|PM)$/i, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function nextWeekdayFromDate(baseDate, weekdayIndex) {
  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  const current = result.getDay();
  let diff = weekdayIndex - current;
  if (diff < 0) diff += 7;
  result.setDate(result.getDate() + diff);
  return result;
}

export function getMatch(text, regex) {
  const match = String(text || "").match(regex);
  return match ? (match[1] || "").trim() : "";
}

export function parsePlacedDate(cleaned) {
  const raw =
    getMatch(
      cleaned,
      /([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4},\s*\d{1,2}:\d{2}:\d{2}(?:AM|PM))/i
    ) ||
    getMatch(
      cleaned,
      /([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4},\s*\d{1,2}:\d{2}(?:AM|PM))/i
    ) ||
    getMatch(cleaned, /([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})/i) ||
    "";

  if (!raw) return { raw: "", normalized: "", dateObj: null, dateOnly: "" };

  const normalized = normalizeDateString(raw);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return { raw, normalized, dateObj: null, dateOnly: "" };
  }

  return {
    raw,
    normalized,
    dateObj: parsed,
    dateOnly: formatDateMMDDYYYY(parsed),
  };
}

export function parseMonthDayEventDate(cleaned, placedDateObj) {
  if (!placedDateObj) return "";
  const monthDayMatch = cleaned.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (!monthDayMatch) return "";
  const parsed = new Date(
    `${monthDayMatch[1]} ${monthDayMatch[2]} ${placedDateObj.getFullYear()}`
  );
  if (Number.isNaN(parsed.getTime())) return "";
  return formatDateMMDDYYYY(parsed);
}

export function inferEventDate(cleaned, placedDateObj) {
  if (!placedDateObj) return "";
  const monthDay = parseMonthDayEventDate(cleaned, placedDateObj);
  if (monthDay) return monthDay;
  if (/\bToday\b/i.test(cleaned)) return formatDateMMDDYYYY(placedDateObj);
  if (/\bTomorrow\b/i.test(cleaned)) {
    const next = new Date(placedDateObj);
    next.setDate(next.getDate() + 1);
    return formatDateMMDDYYYY(next);
  }
  const weekdayMatch = cleaned.match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i);
  if (weekdayMatch) {
    const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const idx = map[weekdayMatch[1].toLowerCase()];
    if (idx !== undefined) {
      return formatDateMMDDYYYY(nextWeekdayFromDate(placedDateObj, idx));
    }
  }
  return "";
}

export function detectSportsbook(cleaned) {
  const text = String(cleaned || "");

  const isDraftKings =
    /draftkings/i.test(text) ||
    /braftkings/i.test(text) ||
    /\bDK\d{6,}\b/i.test(text) ||
    /the crown is yours/i.test(text);

  const isBet365 =
    /bet365/i.test(text) ||
    (
      /\bBet Placed\b/i.test(text) &&
      /\bBet Ref\b/i.test(text) &&
      /\bReuse Selections\b/i.test(text) &&
      /\bWager To Return\b/i.test(text) &&
      /\bAll Sports Live My Bets Search\b/i.test(text)
    );

  const isBetMGM = /betmgm/i.test(text);
  const isCaesars = /caesars/i.test(text);
  const isFanDuel = /fanduel/i.test(text);
  const isFanatics = /fanatics/i.test(text);
  const isTheScore = /thescore|score bet/i.test(text);
  const isCirca = /circa/i.test(text);
  const isKalshi = /kalshi/i.test(text);

  if (isBet365) return "bet365";
  if (isDraftKings) return "DraftKings";
  if (isBetMGM) return "BetMGM";
  if (isCaesars) return "Caesars";
  if (isFanDuel) return "FanDuel";
  if (isFanatics) return "Fanatics";
  if (isTheScore) return "theScore";
  if (isCirca) return "Circa";
  if (isKalshi) return "Kalshi";

  return "";
}

export function looksLikeFanDuelText(text = "") {
  const t = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  let score = 0;

  if (/\bfanduel\b/.test(t)) score += 10;
  if (/\bshare bet\b/.test(t)) score += 4;
  if (/\bwager\s*\$?\s*\d/.test(t)) score += 3;
  if (/\bodds\s*[+-]\s*\d{2,4}\b/.test(t)) score += 3;
  if (/\bto win\s*\$?\s*\d/.test(t)) score += 3;
  if (/\btotal payout\s*\$?\s*\d/.test(t)) score += 3;
  if (/\bbetslip close\b/.test(t)) score += 1;
  if (/\bbalance\s*:/.test(t)) score += 1;
  if (/\bremove all selections\b/.test(t)) score += 1;
  if (/\baccept odds movements\b/.test(t)) score += 1;

  if (/@/.test(t) && /\b\d{1,2}:\d{2}\s*(am|pm)\s*(ct|et|mt|pt)?\b/i.test(t)) {
    score += 2;
  }

  const hasCoreReceiptShape =
    /\bwager\s*\$?\s*\d/i.test(t) &&
    /\bodds\s*[+-]\s*\d{2,4}\b/i.test(t) &&
    /\bto win\s*\$?\s*\d/i.test(t);

  if (hasCoreReceiptShape) score += 2;

  return score >= 8;
}

export function detectStatus(cleaned, receiptWindowText) {
  const windowText = receiptWindowText || cleaned;

  // 🔥 ONLY true cash-out
  if (/\bCashed Out\b/i.test(windowText)) {
    return "Cashed Out";
  }

  if (/Bet Settled/i.test(windowText)) {
    if (/\bWon\b/i.test(windowText)) return "Won";
    if (/\bLost\b/i.test(windowText)) return "Lost";
  }

  if (/\bOpen\b/i.test(windowText) && !/Bet Settled/i.test(windowText)) {
    return "Open";
  }

  return "";
}

export function detectLive(text) {
  const livePatterns = [
    /\bLive\b/i,
    /\bLive Moneyline\b/i,
    /\b1st Quarter\b/i,
    /\b2nd Quarter\b/i,
    /\b3rd Quarter\b/i,
    /\b4th Quarter\b/i,
    /\bQ1\b/i,
    /\bQ2\b/i,
    /\bQ3\b/i,
    /\bQ4\b/i,
    /\b1st Period\b/i,
    /\b2nd Period\b/i,
    /\b3rd Period\b/i,
    /\b1st Inning\b/i,
    /\b2nd Inning\b/i,
    /\b3rd Inning\b/i,
    /\b4th Inning\b/i,
    /\b5th Inning\b/i,
    /\b6th Inning\b/i,
    /\b7th Inning\b/i,
    /\b8th Inning\b/i,
    /\b9th Inning\b/i,
    /\bSet 1\b/i,
    /\bSet 2\b/i,
    /\bSet 3\b/i,
    /\bQuarter\b/i,
    /\bPeriod\b/i,
    /\binnings?\b/i,
  ];
  return livePatterns.some((re) => re.test(text)) ? "Y" : "N";
}

export function extractBetId(text) {
  return (
    getMatch(text, /\b(DK\d{12,})\b/i) ||
    getMatch(text, /\b(ID:?\s*[A-Z0-9\-]{8,})\b/i) ||
    ""
  );
}

export function classifyScreenType(cleaned) {
  const hasReceipt =
    /\bBet Placed\b/i.test(cleaned) ||
    /\bBet Settled\b/i.test(cleaned) ||
    /\bReceipt\b/i.test(cleaned);

  const hasMyBets = /\bMy Bets\b/i.test(cleaned);
  const hasAddMore = /\bAdd More\b/i.test(cleaned);
  const hasBetSlip = /\bBet Slip\b/i.test(cleaned);
  const wagerCount =
    (cleaned.match(/\bWager Amount:/gi) || []).length +
    (cleaned.match(/\bWager:/gi) || []).length;

  if (hasBetSlip && hasAddMore && !hasReceipt) return "active_bet_slip";
  if (wagerCount > 1 && hasMyBets) return "multi_bet_screenshot";
  if (hasReceipt) return "receipt";
  if (hasMyBets) return "my_bets_card";
  if (/\bCash Out\b/i.test(cleaned) && /\bOpen\b|\bCashed Out\b|\bPaid:\b/i.test(cleaned))
    return "live_open_card";
  return "unknown";
}

export function extractReceiptWindow(lines) {
  const receiptIndex = lines.findIndex((line) => /^Bet Placed$|^Bet Settled$/i.test(line));
  if (receiptIndex !== -1) {
    return {
      receiptIndex,
      receiptBlock: lines.slice(receiptIndex, Math.min(lines.length, receiptIndex + 30)),
    };
  }
  return {
    receiptIndex: -1,
    receiptBlock: lines,
  };
}