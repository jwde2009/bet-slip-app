"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";

const emptyParsed = {
  eventDate: "",
  betDate: "",
  bookmaker: "",
  sportLeague: "",
  selection: "",
  betType: "",
  fixtureEvent: "",
  stake: "",
  oddsUS: "",
  oddsSource: "",
  oddsMissingReason: "",
  live: "",
  bonusBet: "",
  win: "",
  marketDetail: "",
  payout: "",
  toWin: "",
  rawPlacedDate: "",
  status: "",
  parseWarning: "",
  duplicateWarning: "",
  sourceFileName: "",
  sourceText: "",
  sourceImageUrl: "",
  reviewNotes: "",
  betId: "",
  accountOwner: "Me",
  betSourceTag: "",
  impliedProbability: "",
  confidenceFlag: "",
  likelyParserIssue: "N",
  reviewLater: "N",
  duplicateIgnored: "N",
};

const BET_TYPE_OPTIONS = ["", "straight", "moneyline", "spread", "total", "player prop", "game prop", "parlay", "futures"];
const BET_SOURCE_OPTIONS = ["", "EV", "Promo", "Boost", "Arb/Hedge", "Fun"];
const ACCOUNT_OPTIONS = ["Me", "Wife"];

function cleanTextLine(value) {
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

function formatDateMMDDYYYY(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const y = String(dateObj.getFullYear());
  return `${m}/${d}/${y}`;
}

function normalizeDateString(raw) {
  if (!raw) return "";
  return raw.replace(/(\d)(AM|PM)$/i, "$1 $2").replace(/\s+/g, " ").trim();
}

function nextWeekdayFromDate(baseDate, weekdayIndex) {
  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  const current = result.getDay();
  let diff = weekdayIndex - current;
  if (diff < 0) diff += 7;
  result.setDate(result.getDate() + diff);
  return result;
}

function getMatch(text, regex) {
  const match = text.match(regex);
  return match ? (match[1] || "").trim() : "";
}

function parsePlacedDate(cleaned) {
  const raw =
    getMatch(cleaned, /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}(?:AM|PM))/i) ||
    getMatch(cleaned, /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}(?:AM|PM))/i) ||
    getMatch(cleaned, /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/i) ||
    "";
  if (!raw) return { raw: "", normalized: "", dateObj: null, dateOnly: "" };
  const normalized = normalizeDateString(raw);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return { raw, normalized, dateObj: null, dateOnly: "" };
  return { raw, normalized, dateObj: parsed, dateOnly: formatDateMMDDYYYY(parsed) };
}

function parseMonthDayEventDate(cleaned, placedDateObj) {
  if (!placedDateObj) return "";
  const monthDayMatch = cleaned.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (!monthDayMatch) return "";
  const parsed = new Date(`${monthDayMatch[1]} ${monthDayMatch[2]} ${placedDateObj.getFullYear()}`);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatDateMMDDYYYY(parsed);
}

function inferEventDate(cleaned, placedDateObj) {
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
    if (idx !== undefined) return formatDateMMDDYYYY(nextWeekdayFromDate(placedDateObj, idx));
  }
  return "";
}

function detectSportsbook(cleaned) {
  const containsAny = (patterns) => patterns.some((pattern) => pattern.test(cleaned));
  return containsAny([/draftkings/i, /braftkings/i, /dk\d+/i, /\bmybets\b/i, /\bdkne\b/i, /the crown is yours/i])
    ? "DraftKings"
    : /betmgm/i.test(cleaned)
    ? "BetMGM"
    : /caesars/i.test(cleaned)
    ? "Caesars"
    : /fanduel/i.test(cleaned)
    ? "FanDuel"
    : /fanatics/i.test(cleaned)
    ? "Fanatics"
    : /thescore|score bet/i.test(cleaned)
    ? "theScore"
    : /bet365/i.test(cleaned)
    ? "bet365"
    : /circa/i.test(cleaned)
    ? "Circa"
    : /kalshi/i.test(cleaned)
    ? "Kalshi"
    : "";
}

function singularizeStat(label) {
  const lower = label.toLowerCase();
  if (lower === "home runs") return "home run";
  if (lower === "three pointers made") return "threes";
  return label;
}

function detectLeague({ cleaned, marketDetail, fixtureEvent, selection, isParlay }) {
  const text = [cleaned, marketDetail, fixtureEvent, selection].filter(Boolean).join(" ").toLowerCase();
  const hasBaseball = /mlb|baseball|world baseball|wbc|spring training|run line|home runs|rbis|hits|strikeouts|earned runs|puerto rico|chinese taipei|australia|red sox|cubs|braves|giants|reds|astros|yankees|dodgers|phillies|mets|padres|mariners/.test(text);
  const hasNBA = /\bnba\b|points|rebounds|assists|three pointers|triple-double|double-double/.test(text);
  const hasNCAAM = /college basketball \(m\)|cbb \(m\)|ncaam|men'?s college basketball|college hulkey|southern university|alabama state|grambling|alabama a&m|army @ bucknell|eastern michigan|buffalo|clemson @ north carolina/.test(text);
  const hasNCAAW = /college basketball \(w\)|cbb \(w\)|ncaaw|women'?s college basketball|georgia tech @ california/.test(text);
  const hasNHL = /\bnhl\b|hockey|goalscorer|shots on goal|puck line|mats zuccarello|evander kane/.test(text);
  const hasTennis = /tennis|atp|wta|total games|games spread/.test(text);
  const hasSoccer = /soccer|mls|premier league|champions league|la liga|serie a|bundesliga|ligue 1|concacaf|orlando city|inter miami/.test(text);
  const hasMMA = /\bufc\b|mma|ko\/tko\/dq|submission|decision|max holloway|oliveira/.test(text);
  const hits = [hasBaseball, hasNBA, hasNCAAM, hasNCAAW, hasNHL, hasTennis, hasSoccer, hasMMA].filter(Boolean).length;
  if (isParlay && hits > 1) return "Multi";
  if (hasNCAAM) return "NCAAM";
  if (hasNCAAW) return "NCAAW";
  if (hasNBA) return "NBA";
  if (hasNHL) return "NHL";
  if (hasBaseball) return "Baseball";
  if (hasMMA) return "MMA";
  if (hasTennis) return "Tennis";
  if (hasSoccer) return "Soccer";
  return "";
}

function buildPlayerPropSelection(rawSelection, marketDetail) {
  const cleanedSelection = cleanTextLine(rawSelection);
  const cleanedMarket = cleanTextLine(marketDetail);
  const overUnderMatch = cleanedSelection.match(/\b(Over|Under)\s*([\d.]+)/i);
  if (overUnderMatch) {
    const direction = overUnderMatch[1].toLowerCase();
    const line = overUnderMatch[2];
    const propPatterns = [
      { regex: /^(.*)\s+Rebounds O\/U$/i, label: "rebounds" },
      { regex: /^(.*)\s+Points O\/U$/i, label: "points" },
      { regex: /^(.*)\s+Assists O\/U$/i, label: "assists" },
      { regex: /^(.*)\s+Three Pointers Made(?: O\/U| Made O\/U)?$/i, label: "threes" },
      { regex: /^(.*)\s+Points \+ Rebounds \+ Assists(?: O\/U)?$/i, label: "points + rebounds + assists" },
      { regex: /^(.*)\s+Passing Yards$/i, label: "passing yards" },
      { regex: /^(.*)\s+Rushing Yards$/i, label: "rushing yards" },
      { regex: /^(.*)\s+Receiving Yards$/i, label: "receiving yards" },
      { regex: /^(.*)\s+Shots on Goal$/i, label: "shots on goal" },
      { regex: /^(.*)\s+Strikeouts$/i, label: "strikeouts" },
      { regex: /^(.*)\s+Hits$/i, label: "hits" },
      { regex: /^(.*)\s+RBIs$/i, label: "RBIs" },
      { regex: /^(.*)\s+Earned Runs Allowed(?: O\/U)?$/i, label: "earned runs" },
    ];
    for (const item of propPatterns) {
      const m = cleanedMarket.match(item.regex);
      if (m) return `${m[1]} ${direction} ${line} ${item.label}`.trim();
    }
  }
  if (/triple-double/i.test(cleanedMarket)) return `${cleanedSelection} triple-double`.trim();
  if (/double-double/i.test(cleanedMarket)) return `${cleanedSelection} double-double`.trim();
  if (/ko\/tko\/dq/i.test(cleanedMarket)) return `${cleanedSelection} by KO/TKO/DQ`.trim();
  if (/submission/i.test(cleanedMarket)) return `${cleanedSelection} by submission`.trim();
  if (/decision/i.test(cleanedMarket)) return `${cleanedSelection} by decision`.trim();
  const plusMatch = cleanedSelection.match(/^(\d+)\+$/i);
  if (plusMatch) {
    const n = plusMatch[1];
    const propPatterns = [
      { regex: /^(.*)\s+Three Pointers Made(?: O\/U| Made O\/U)?$/i, label: "three pointers made" },
      { regex: /^(.*)\s+Home Runs$/i, label: "home runs" },
      { regex: /^(.*)\s+Hits$/i, label: "hits" },
      { regex: /^(.*)\s+RBIs$/i, label: "RBIs" },
      { regex: /^(.*)\s+Strikeouts$/i, label: "strikeouts" },
      { regex: /^(.*)\s+Shots on Goal$/i, label: "shots on goal" },
    ];
    for (const item of propPatterns) {
      const m = cleanedMarket.match(item.regex);
      if (m) return `${m[1]} ${n}+ ${singularizeStat(item.label)}`.trim();
    }
  }
  if (/Anytime Goalscorer/i.test(cleanedMarket) && cleanedSelection) return `${cleanedSelection} anytime goal`;
  if (/First Goalscorer/i.test(cleanedMarket) && cleanedSelection) return `${cleanedSelection} first goal`;
  if (/Last Goalscorer/i.test(cleanedMarket) && cleanedSelection) return `${cleanedSelection} last goal`;
  if (/Anytime Touchdown Scorer/i.test(cleanedMarket) && cleanedSelection) return `${cleanedSelection} anytime touchdown`;
  if (/First Touchdown Scorer/i.test(cleanedMarket) && cleanedSelection) return `${cleanedSelection} first touchdown`;
  if (cleanedMarket && !cleanedSelection) return cleanedMarket;
  return cleanedSelection;
}

function detectStatus(cleaned, receiptWindowText) {
  const windowText = receiptWindowText || cleaned;
  if (/\bCashed Out\b/i.test(windowText) || /\bPaid:\s*\$/i.test(windowText)) return "Cashed Out";
  if (/Bet Settled/i.test(windowText)) {
    if (/\bWon\b/i.test(windowText)) return "Won";
    if (/\bLost\b/i.test(windowText)) return "Lost";
  }
  if (/\bOpen\b/i.test(windowText) && !/Bet Settled/i.test(windowText)) return "Open";
  return "";
}

function detectLive(text) {
  const livePatterns = [/\bLive\b/i, /\bLive Moneyline\b/i, /\b1st Quarter\b/i, /\b2nd Quarter\b/i, /\b3rd Quarter\b/i, /\b4th Quarter\b/i, /\bQ1\b/i, /\bQ2\b/i, /\bQ3\b/i, /\bQ4\b/i, /\b1st Period\b/i, /\b2nd Period\b/i, /\b3rd Period\b/i, /\b1st Inning\b/i, /\b2nd Inning\b/i, /\b3rd Inning\b/i, /\b4th Inning\b/i, /\b5th Inning\b/i, /\b6th Inning\b/i, /\b7th Inning\b/i, /\b8th Inning\b/i, /\b9th Inning\b/i, /\bSet 1\b/i, /\bSet 2\b/i, /\bSet 3\b/i, /\bQuarter\b/i, /\bPeriod\b/i, /\binnings?\b/i];
  return livePatterns.some((re) => re.test(text)) ? "Y" : "N";
}

function americanOddsFromStakeAndReturn(stakeValue, totalReturnValue) {
  const stake = Number(String(stakeValue || "").replace(/,/g, ""));
  const payout = Number(String(totalReturnValue || "").replace(/,/g, ""));
  if (!Number.isFinite(stake) || !Number.isFinite(payout) || stake <= 0 || payout <= stake) return "";
  const decimalOdds = payout / stake;
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return "";
  if (decimalOdds >= 2) return `+${Math.round((decimalOdds - 1) * 100)}`;
  return `${Math.round(-100 / (decimalOdds - 1))}`;
}

function americanOddsFromStakeAndProfit(stakeValue, profitValue) {
  const stake = Number(String(stakeValue || "").replace(/,/g, ""));
  const profit = Number(String(profitValue || "").replace(/,/g, ""));
  if (!Number.isFinite(stake) || !Number.isFinite(profit) || stake <= 0 || profit <= 0) return "";
  if (profit >= stake) return `+${Math.round((profit / stake) * 100)}`;
  return `${Math.round(-(100 / (profit / stake)))}`;
}

function detectOddsMissingReason({ oddsUS, stake, payout, toWin }) {
  if (oddsUS) return "";
  if (!stake) return "No stake shown";
  if (!payout && !toWin) return "No payout or to-win shown";
  if (!payout) return "No payout shown";
  if (!toWin) return "No to-win shown";
  return "No odds detected";
}

function extractBetId(text) {
  return getMatch(text, /\b(DK\d{12,})\b/i) || getMatch(text, /\b(ID:?\s*[A-Z0-9\-]{8,})\b/i) || "";
}

function parseVisibleTeamMatchup(lines) {
  const teamLines = [];
  for (const line of lines) {
    const cleaned = cleanTextLine(line);
    if (!cleaned) continue;
    if (/\bTrail Blazers\b|\bNuggets\b|\bBucks\b|\bClippers\b|\bHornets\b|\bCeltics\b|\bPacers\b|\bBulls\b|\bMIL\b|\bPOR\b|\bDEN\b|\bIND\b|\bLA Clippers\b/i.test(cleaned)) teamLines.push(cleaned.replace(/\s+\d+.*$/, "").trim());
  }
  const deduped = [];
  for (const t of teamLines) if (!deduped.includes(t)) deduped.push(t);
  if (deduped.length >= 2) return `${deduped[0]} @ ${deduped[1]}`;
  return "";
}

function parseMyBetsCards(lines) {
  const cards = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\b(Wager:|Wager Amount:)\s*\$?/i.test(line)) continue;
    const windowStart = Math.max(0, i - 3);
    const windowEnd = Math.min(lines.length, i + 6);
    const cardLines = lines.slice(windowStart, windowEnd);
    const cardText = cardLines.join("\n");
    const selectionLine = cardLines.find((l) => /[+-]\d{2,5}.*(?:Open|Cashed Out|Won|Lost|Paid)?/i.test(l)) || "";
    const marketLine = cardLines.find((l) => /\b(Moneyline|Live Moneyline|Points O\/U|Assists O\/U|Rebounds O\/U|Three Pointers Made(?: O\/U| Made O\/U)?|Total Games|Games Spread|Triple-Double|Double-Double|Earned Runs Allowed(?: O\/U)?)\b/i.test(l)) || "";
    const wagerLine = cardLines.find((l) => /\bWager:\s*\$?/i.test(l)) || "";
    const payoutLine = cardLines.find((l) => /\b(To Pay:|Paid:)\s*\$?/i.test(l)) || "";
    const eventLine = cardLines.find((l) => /\b(Today|Tomorrow|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i.test(l)) || "";
    const visibleMatchup = parseVisibleTeamMatchup(cardLines);
    cards.push({
      rawSelection: cleanTextLine(selectionLine).replace(/\b(?:Open|Cashed Out|Won|Lost)\b/gi, "").replace(/[+-]\d{2,5}.*$/i, "").trim(),
      marketDetail: cleanTextLine(marketLine),
      fixtureEvent: cleanTextLine(eventLine || visibleMatchup),
      stake: getMatch(wagerLine, /Wager:\s*\$?([\d,]+(?:\.\d{1,2})?)/i) || getMatch(cardText, /Wager:\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
      payout: getMatch(payoutLine, /(?:To Pay:|Paid:)\s*\$?([\d,]+(?:\.\d{1,2})?)/i) || getMatch(cardText, /(?:To Pay:|Paid:)\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
      oddsUS: getMatch(selectionLine, /([+-]\d{2,5})/) || getMatch(cardText, /([+-]\d{2,5})\s+(?:Open|Cashed Out|Won|Lost)\b/i) || "",
      status: /\bCashed Out\b/i.test(cardText) ? "Cashed Out" : /\bOpen\b/i.test(cardText) ? "Open" : /\bWon\b/i.test(cardText) ? "Won" : /\bLost\b/i.test(cardText) ? "Lost" : "",
      live: detectLive(cardText),
      sourceText: cardText,
    });
  }
  const unique = [];
  const seen = new Set();
  for (const card of cards) {
    const key = [card.rawSelection, card.marketDetail, card.stake, card.payout, card.oddsUS, card.status].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }
  return unique;
}

function normalizeTeamNames(text) {
  const replacements = [
    [/\bLA Clippers\b/gi, "Los Angeles Clippers"],
    [/\bLA Lakers\b/gi, "Los Angeles Lakers"],
    [/\bGS Warriors\b|\bGolden St Warriors\b/gi, "Golden State Warriors"],
    [/\bNY Knicks\b/gi, "New York Knicks"],
    [/\bOKC Thunder\b/gi, "Oklahoma City Thunder"],
    [/\bMavs\b/gi, "Mavericks"],
    [/\bT-Wolves\b|\bTWolves\b/gi, "Timberwolves"],
  ];
  let result = String(text || "");
  for (const [regex, replacement] of replacements) result = result.replace(regex, replacement);
  return result.replace(/\s{2,}/g, " ").trim();
}

function impliedProbabilityFromAmericanOdds(odds) {
  const raw = String(odds || "").trim();
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return "";
  const p = n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  return `${(p * 100).toFixed(1)}%`;
}

function getDisplayedBookmaker(row) {
  const base = String(row.bookmaker || "").replace(/^C-/, "");
  if (!base) return "";
  return row.accountOwner === "Wife" ? `C-${base}` : base;
}

function computeConfidence(row) {
  let score = 0;
  if (row.bookmaker) score += 1;
  if (row.selection) score += 1;
  if (row.betType) score += 1;
  if (row.stake) score += 1;
  if (row.oddsUS) score += 1;
  if (row.fixtureEvent) score += 1;
  if (row.betDate || row.eventDate) score += 1;
  if (row.parseWarning) score -= 2;
  if (!row.selection || !row.bookmaker) score -= 1;
  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

function makeDuplicateKey(row) {
  return [String(getDisplayedBookmaker(row) || "").trim().toLowerCase(), String(row.fixtureEvent || "").trim().toLowerCase(), String(row.selection || "").trim().toLowerCase(), String(row.stake || "").trim().toLowerCase(), String(row.oddsUS || "").trim().toLowerCase(), String(row.betId || "").trim().toLowerCase()].join("|");
}

function enrichRow(row) {
  const normalizedFixture = normalizeTeamNames(row.fixtureEvent);
  const normalizedSelection = normalizeTeamNames(row.selection);
  const normalizedBookmaker = String(row.bookmaker || "").replace(/^C-/, "");
  const confidenceFlag = computeConfidence({ ...row, fixtureEvent: normalizedFixture, selection: normalizedSelection, bookmaker: normalizedBookmaker });
  const weirdFixture = /log in|sign up|add more|bet slip|cash out|deposit|withdraw|place bet|responsible gaming/i.test(normalizedFixture || "");
  const missingCore = !normalizedBookmaker || !normalizedSelection || !row.betType;
  const likelyParserIssue = row.parseWarning || confidenceFlag === "Low" || weirdFixture || missingCore ? "Y" : "N";
  return { ...row, bookmaker: normalizedBookmaker, fixtureEvent: normalizedFixture, selection: normalizedSelection, impliedProbability: impliedProbabilityFromAmericanOdds(row.oddsUS), confidenceFlag, likelyParserIssue };
}

function parseBetSlip(text, sourceFileName = "") {
  const cleaned = text.replace(/\r/g, "").trim();
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const looksLikeActiveBetSlip = /\bBet Slip\b/i.test(cleaned) && /\bAdd More\b/i.test(cleaned);
  const looksLikeReceipt = /\bBet Placed\b/i.test(cleaned) || /\bBet Settled\b/i.test(cleaned) || /\bReceipt\b/i.test(cleaned) || /\bMy Bets\b/i.test(cleaned);
  if (!looksLikeReceipt && looksLikeActiveBetSlip) {
    return enrichRow({ ...emptyParsed, parseWarning: "Unsupported screen type: active bet slip, not a receipt.", sourceFileName, sourceText: text });
  }

  const sportsbook = detectSportsbook(cleaned);
  const betId = extractBetId(cleaned);
  const receiptIndex = lines.findIndex((line) => /^Bet Placed$|^Bet Settled$/i.test(line));
  const receiptBlock = receiptIndex !== -1 ? lines.slice(receiptIndex, Math.min(lines.length, receiptIndex + 20)) : lines;
  const receiptText = receiptBlock.join("\n");
  let parseWarning = "";
  const wagerCount = (receiptText.match(/\bWager Amount:/gi) || []).length + (receiptText.match(/\bWager:/gi) || []).length;
  if (wagerCount > 1) parseWarning = "Multiple bets detected in one screenshot. Results may reflect only one bet.";
  const stopWords = [/^Wager Amount:/i, /^Wager:/i, /^Total Payout:/i, /^To Win:/i, /^To Pay:/i, /^Paid:/i, /^Bet With Friends/i, /^\+ Create Group/i, /^Keep Picks/i, /^in Bet Slip/i, /^Receipt/i, /^Cash\/Out/i, /^Cash Out/i];
  const isStopLine = (line) => stopWords.some((re) => re.test(line));
  let rawSelection = "";
  let marketDetail = "";
  let fixtureEvent = "";
  if (receiptIndex !== -1) {
    const after = lines.slice(receiptIndex + 1);
    rawSelection = cleanTextLine(after[0] || "");
    marketDetail = cleanTextLine(after[1] || "");
    let eventStartIndex = 2;
    if (/O\/$/i.test(marketDetail) && cleanTextLine(after[2] || "").toLowerCase() === "u") {
      marketDetail = `${marketDetail} U`;
      eventStartIndex = 3;
    }
    const eventLines = [];
    for (let i = eventStartIndex; i < after.length; i++) {
      const line = after[i];
      if (!line || isStopLine(line)) break;
      if (/^Market settled based on/i.test(line) || /^In the event of/i.test(line) || /^If a match does not reach/i.test(line) || /^If the bet is cashed out/i.test(line) || /^Any bets placed after/i.test(line) || /^There will be no push/i.test(line)) break;
      if (i === eventStartIndex && cleanTextLine(line).toLowerCase() === "u") continue;
      eventLines.push(line);
    }
    fixtureEvent = eventLines.join(" ");
  }
  if (!rawSelection) rawSelection = getMatch(receiptText, /Bet Placed\s+([\s\S]*?)\s+(?:Moneyline|Live Moneyline|Spread|Run Line|Puck Line|Games Spread|Total|Total Games|Anytime Goalscorer|First Goalscorer|Last Goalscorer|Anytime Touchdown Scorer|First Touchdown Scorer|Parlay|Same Game Parlay|SGP|KO\/TKKO\/DQ|Submission|Decision)/i) || "";
  rawSelection = cleanTextLine(rawSelection);
  if (!marketDetail) {
    const knownMarketPatterns = [/Moneyline/i, /Live Moneyline/i, /Spread/i, /Run Line/i, /Puck Line/i, /Games Spread/i, /Total/i, /Total Games/i, /Anytime Goalscorer/i, /First Goalscorer/i, /Last Goalscorer/i, /Anytime Touchdown Scorer/i, /First Touchdown Scorer/i, /Points O\/U/i, /Rebounds O\/U/i, /Assists O\/U/i, /Three Pointers Made(?: O\/U| Made O\/U)?/i, /Triple-Double/i, /Double-Double/i, /Points \+ Rebounds \+ Assists/i, /Shots on Goal/i, /Passing Yards/i, /Rushing Yards/i, /Receiving Yards/i, /Strikeouts/i, /Hits/i, /RBIs/i, /Home Runs/i, /Earned Runs Allowed(?: O\/U)?/i, /KO\/TKO\/DQ/i, /Submission/i, /Decision/i, /^Parlay$/i, /^Same Game Parlay$/i, /^SGP$/i, /^\d+\s*Pick Parlay$/i];
    const foundLine = receiptBlock.find((line) => knownMarketPatterns.some((re) => re.test(line)));
    if (foundLine) marketDetail = cleanTextLine(foundLine);
  }
  if (!fixtureEvent) fixtureEvent = getMatch(receiptText, /([A-Za-z0-9 .&'()\/-]+\s*@\s*[A-Za-z0-9 .&'()\/-]+)/i) || getMatch(receiptText, /([A-Za-z0-9 .&'()\/-]+\s+vs\s+[A-Za-z0-9 .&'()\/-]+)/i);
  fixtureEvent = cleanTextLine(fixtureEvent).replace(/,\s*[A-Z]{2}\b/, "").replace(/\s{2,}/g, " ").trim();
  const stake = getMatch(receiptText, /Wager Amount:\s*\$?([\d,]+(?:\.\d{1,2})?)/i) || getMatch(receiptText, /Wager:\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  const payout = getMatch(receiptText, /Total Payout:\s*\$?([\d,]+(?:\.\d{1,2})?)/i) || getMatch(receiptText, /To Pay:\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  const toWinDirect = getMatch(receiptText, /To Win:\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  let oddsUS = (rawSelection.match(/([+-]\d{2,5})\s*$/i) || [])[1] || getMatch(receiptText, /Odds:\s*([+-]\d{2,5})/i) || getMatch(receiptText, /(?:CASH\s*OUT|ASH\s*OUT)?\s*([+-]\d{2,5})\b/i) || "";
  let oddsSource = oddsUS ? "OCR" : "";
  if (!oddsUS && stake && payout) {
    const calc = americanOddsFromStakeAndReturn(stake, payout);
    if (calc) {
      oddsUS = calc;
      oddsSource = "Calculated";
    }
  }
  if (!oddsUS && stake && toWinDirect) {
    const calc = americanOddsFromStakeAndProfit(stake, toWinDirect);
    if (calc) {
      oddsUS = calc;
      oddsSource = "Calculated";
    }
  }
  const placedInfo = parsePlacedDate(cleaned);
  const betDate = placedInfo.dateOnly;
  const eventDate = inferEventDate(receiptText || cleaned, placedInfo.dateObj);
  const bonusBet = /\bBonus Bet\b/i.test(receiptText) ? "Y" : "N";
  const toWin = toWinDirect || (() => {
    const wager = parseFloat((stake || "").replace(/,/g, ""));
    const pay = parseFloat((payout || "").replace(/,/g, ""));
    if (!Number.isNaN(wager) && !Number.isNaN(pay) && pay >= wager) return (pay - wager).toFixed(2);
    return "";
  })();
  const oddsMissingReason = detectOddsMissingReason({ oddsUS, stake, payout, toWin });
  const status = detectStatus(cleaned, receiptText);
  const win = status === "Won" ? "Y" : status === "Lost" ? "N" : "";
  const lowerMarketDetail = (marketDetail || "").toLowerCase();
  const isParlay = /^parlay$/i.test(marketDetail) || /^same game parlay$/i.test(marketDetail) || /^sgp$/i.test(marketDetail) || /^\d+\s*pick parlay$/i.test(marketDetail);
  const isFuture = /\bfutures?\b|\bmvp\b|\bdivision winner\b|\bconference winner\b|\bchampionship\b|\bto win the\b|\baward\b|\bseason wins\b/i.test(receiptText);
  const isPlayerProp = /\bplayer\b/i.test(receiptText) || /\bpoints?\b|\brebounds?\b|\bassists?\b|\bthree pointers made\b|\bmade o\/u\b|\bgoalscorer\b|\btouchdown scorer\b|\bshots on goal\b|\bpassing yards\b|\brushing yards\b|\breceiving yards\b|\bstrikeouts?\b|\bhits?\b|\brbis?\b|\bstolen bases?\b|\bhome runs?\b|\btriple-double\b|\bdouble-double\b|\bearned runs\b|\bko\/tko\/dq\b|\bsubmission\b|\bdecision\b/i.test(lowerMarketDetail);
  const isMoneyline = !isPlayerProp && /\bmoneyline\b|\blive moneyline\b/i.test(lowerMarketDetail);
  const isSpread = !isPlayerProp && /\bspread\b|\brun line\b|\bpuck line\b|\bgames spread\b/i.test(lowerMarketDetail);
  const isTotal = !isPlayerProp && /\btotal\b|\btotal games\b/i.test(lowerMarketDetail);
  let betType = "straight";
  if (isParlay) betType = "parlay";
  else if (isFuture) betType = "futures";
  else if (isPlayerProp) betType = "player prop";
  else if (isMoneyline) betType = "moneyline";
  else if (isSpread) betType = "spread";
  else if (isTotal) betType = "total";
  let selection = isPlayerProp ? buildPlayerPropSelection(rawSelection, marketDetail) : rawSelection;
  selection = cleanTextLine(selection).replace(/\s+[+-]\d{2,5}\s*$/i, "").trim();
  const sportLeague = detectLeague({ cleaned: receiptText || cleaned, marketDetail, fixtureEvent, selection, isParlay });
  if (isParlay) {
    const parlayLabel = sportLeague === "Multi" ? "multi-sport parlay" : sportLeague ? `${sportLeague} parlay` : "Parlay";
    selection = parlayLabel;
    fixtureEvent = parlayLabel;
  }
  return enrichRow({ ...emptyParsed, eventDate, betDate, bookmaker: sportsbook, sportLeague, selection, betType, fixtureEvent, stake, oddsUS, oddsSource, oddsMissingReason, live: detectLive(cleaned), bonusBet, win, marketDetail, payout, toWin, rawPlacedDate: placedInfo.raw, status, parseWarning, sourceFileName, sourceText: text, reviewNotes: "", betId });
}

function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function addDuplicateWarnings(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (row.duplicateIgnored === "Y") continue;
    const key = makeDuplicateKey(row);
    if (key === "|||||") continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return rows.map((row) => {
    const key = makeDuplicateKey(row);
    const isDuplicate = row.duplicateIgnored !== "Y" && key !== "|||||" && (counts.get(key) || 0) > 1;
    return { ...row, duplicateWarning: isDuplicate ? "Possible duplicate" : "", impliedProbability: impliedProbabilityFromAmericanOdds(row.oddsUS), confidenceFlag: computeConfidence(row) };
  });
}

const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#fff", color: "#000" };
const selectStyle = { width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#fff", color: "#000" };
const textAreaStyle = { width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#fff", color: "#000", minHeight: 90, resize: "vertical" };
const buttonStyle = { padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#f5f5f5", cursor: "pointer" };
const smallButtonStyle = { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#f5f5f5", cursor: "pointer" };
const noticeStyle = { marginTop: 8, padding: "8px 12px", border: "1px solid #c8e6c9", borderRadius: 4, backgroundColor: "#e8f5e9", color: "#1b5e20", display: "inline-block" };
const warningStyle = { marginTop: 8, padding: "8px 12px", border: "1px solid #ffe082", borderRadius: 4, backgroundColor: "#fff8e1", color: "#7a5a00", display: "inline-block" };
const duplicateStyle = { marginTop: 8, padding: "8px 12px", border: "1px solid #ffccbc", borderRadius: 4, backgroundColor: "#fff3e0", color: "#a84300", display: "inline-block" };
const cellStyle = { border: "1px solid #ccc", padding: 8, verticalAlign: "top", background: "#fff", color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

export default function Home() {
  const [rows, setRows] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [showReviewLaterOnly, setShowReviewLaterOnly] = useState(false);
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);
  const [showLikelyParserIssuesOnly, setShowLikelyParserIssuesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadOwner, setUploadOwner] = useState("Me");
  const [changelog, setChangelog] = useState([
    "v1: initial OCR parser and CSV export",
    "v2: editor, duplicate handling, account owner, source tags, implied probability, confidence",
    "v3: upload owner toggle, editor above table, league and prop detection expanded, QA helpers",
    "v4: local storage, app state import/export, changelog, improved league and prop classification",
    "v5: odds missing reason, stronger college/soccer league fallbacks, image thumbnails, improved upload button and review table",
  ]);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("betSlipAppStateV1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.rows)) setRows(parsed.rows);
      if (typeof parsed.uploadOwner === "string") setUploadOwner(parsed.uploadOwner);
      if (Array.isArray(parsed.changelog)) setChangelog(parsed.changelog);
    } catch (error) {
      console.error("Could not load local app state", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("betSlipAppStateV1", JSON.stringify({ rows, uploadOwner, changelog }));
    } catch (error) {
      console.error("Could not save local app state", error);
    }
  }, [rows, uploadOwner, changelog]);

  const rowsWithWarnings = useMemo(() => addDuplicateWarnings(rows.map(enrichRow)), [rows]);
  const visibleRows = useMemo(() => {
    let next = rowsWithWarnings;
    if (showReviewLaterOnly) next = next.filter((row) => row.reviewLater === "Y");
    if (showLowConfidenceOnly) next = next.filter((row) => row.confidenceFlag === "Low");
    if (showLikelyParserIssuesOnly) next = next.filter((row) => row.likelyParserIssue === "Y");
    return next;
  }, [rowsWithWarnings, showReviewLaterOnly, showLowConfidenceOnly, showLikelyParserIssuesOnly]);

  const selectedRow = rowsWithWarnings.find((row) => row.id === selectedRowId) || null;
  const selectedVisibleIds = visibleRows.map((row) => row.id);
  const allVisibleSelected = selectedVisibleIds.length > 0 && selectedVisibleIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    if (!selectedRowId && visibleRows.length > 0) setSelectedRowId(visibleRows[0].id);
    if (selectedRowId && rowsWithWarnings.length > 0 && !rowsWithWarnings.some((row) => row.id === selectedRowId)) setSelectedRowId(visibleRows[0]?.id || rowsWithWarnings[0]?.id || "");
    if (rowsWithWarnings.length === 0) setSelectedRowId("");
  }, [rowsWithWarnings, visibleRows, selectedRowId]);

  const showNotice = (message) => {
    setSaveNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setSaveNotice("");
      noticeTimerRef.current = null;
    }, 2000);
  };

  const moveSelection = (delta) => {
    if (visibleRows.length === 0) return;
    const index = visibleRows.findIndex((row) => row.id === selectedRowId);
    if (index === -1) return setSelectedRowId(visibleRows[0].id);
    const nextIndex = Math.min(Math.max(index + delta, 0), visibleRows.length - 1);
    setSelectedRowId(visibleRows[nextIndex].id);
  };

  const selectNextAfter = (id) => {
    const index = visibleRows.findIndex((row) => row.id === id);
    if (index === -1) return;
    const next = visibleRows[index + 1] || visibleRows[index - 1] || null;
    if (next) setSelectedRowId(next.id);
  };

  useEffect(() => {
    const handler = (event) => {
      if (!selectedRowId) return;
      const tag = String(event.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        setWinStatusForRow(selectedRowId, "Y", true);
      } else if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setWinStatusForRow(selectedRowId, "N", true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedRowId, visibleRows]);

  const handleUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setProcessing(true);
    const newRows = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessingMessage(`Reading ${i + 1} of ${files.length}: ${file.name}`);
        const result = await Tesseract.recognize(file, "eng", { logger: () => {} });
        const extractedText = result.data.text || "";
        const parsed = parseBetSlip(extractedText, file.name);
        newRows.push({ id: crypto.randomUUID(), ...parsed, accountOwner: uploadOwner, sourceImageUrl: URL.createObjectURL(file) });
      }
      setRows((prev) => [...prev, ...newRows]);
      if (newRows[0]) setSelectedRowId(newRows[0].id);
      showNotice(`${newRows.length} row${newRows.length === 1 ? "" : "s"} added`);
    } catch (error) {
      console.error(error);
      showNotice("Could not read one or more images");
    } finally {
      setProcessing(false);
      setProcessingMessage("");
    }
  };

  const handleRowFieldChange = (id, field, value) => setRows((prev) => prev.map((row) => (row.id === id ? enrichRow({ ...row, [field]: value }) : row)));
  const toggleSelected = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSelectAllVisible = () => setSelectedIds((prev) => (allVisibleSelected ? prev.filter((id) => !selectedVisibleIds.includes(id)) : Array.from(new Set([...prev, ...selectedVisibleIds]))));

  const deleteRow = (id) => {
    selectNextAfter(id);
    setRows((prev) => prev.filter((row) => row.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    showNotice("Row deleted");
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return showNotice("No selected rows to delete");
    const currentId = selectedRowId;
    setRows((prev) => prev.filter((row) => !selectedIds.includes(row.id)));
    setSelectedIds([]);
    if (selectedIds.includes(currentId)) setSelectedRowId("");
    showNotice("Selected rows deleted");
  };

  const clearAll = () => {
    setRows([]);
    setSelectedIds([]);
    setSelectedRowId("");
    showNotice("All rows cleared");
  };

  const setWinStatusForRow = (id, winValue, advance = false) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, win: winValue };
      if (winValue === "Y") next.status = "Won";
      if (winValue === "N") next.status = "Lost";
      return enrichRow(next);
    }));
    if (advance) selectNextAfter(id);
  };

  const ignoreDuplicateForRow = (id) => {
    setRows((prev) => prev.map((row) => (row.id === id ? enrichRow({ ...row, duplicateIgnored: row.duplicateIgnored === "Y" ? "N" : "Y" }) : row)));
    showNotice("Duplicate preference updated");
  };

  const mergeDuplicatesIntoSelected = () => {
    if (!selectedRow) return showNotice("Select a row first");
    const key = makeDuplicateKey(selectedRow);
    const duplicateIds = rowsWithWarnings.filter((row) => row.id !== selectedRow.id && makeDuplicateKey(row) === key).map((row) => row.id);
    if (duplicateIds.length === 0) return showNotice("No duplicates to merge");
    setRows((prev) => prev.filter((row) => !duplicateIds.includes(row.id)));
    setSelectedIds((prev) => prev.filter((id) => !duplicateIds.includes(id)));
    showNotice(`Merged ${duplicateIds.length} duplicate row${duplicateIds.length === 1 ? "" : "s"}`);
  };

  const buildCsvData = (rowsToExport, debug = false) => {
    if (debug) {
      const headers = ["Row ID", "Bet ID", "Source File Name", "Account Owner", "EventDate", "Bet Date", "Bookmaker", "Sport / League", "Selection", "Bet Type", "Bet Source Tag", "Fixture / Event", "Stake", "Odds (US)", "Odds Source", "Odds Missing Reason", "Implied Probability", "Confidence", "Live", "Bonus Bet", "Win", "Review Later", "Market Detail", "Payout", "To Win", "Raw Placed Date", "Status", "Parse Warning", "Duplicate Warning", "Review Notes", "OCR Text"];
      const csvRows = rowsToExport.map((row) => [escapeCsv(row.id), escapeCsv(row.betId), escapeCsv(row.sourceFileName), escapeCsv(row.accountOwner), escapeCsv(row.eventDate), escapeCsv(row.betDate), escapeCsv(getDisplayedBookmaker(row)), escapeCsv(row.sportLeague), escapeCsv(row.selection), escapeCsv(row.betType), escapeCsv(row.betSourceTag), escapeCsv(row.fixtureEvent), escapeCsv(row.stake), escapeCsv(row.oddsUS), escapeCsv(row.oddsSource), escapeCsv(row.oddsMissingReason), escapeCsv(row.impliedProbability), escapeCsv(row.confidenceFlag), escapeCsv(row.live), escapeCsv(row.bonusBet), escapeCsv(row.win), escapeCsv(row.reviewLater), escapeCsv(row.marketDetail), escapeCsv(row.payout), escapeCsv(row.toWin), escapeCsv(row.rawPlacedDate), escapeCsv(row.status), escapeCsv(row.parseWarning), escapeCsv(row.duplicateWarning), escapeCsv(row.reviewNotes), escapeCsv(row.sourceText)]);
      return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    }
    const headers = ["EventDate", "Bet Date", "Bookmaker", "Sport / League", "Selection", "Bet Type", "Bet Source Tag", "Fixture / Event", "Stake", "Odds (US)", "Odds Source", "Odds Missing Reason", "Implied Probability", "Confidence", "Live", "Bonus Bet", "Win"];
    const csvRows = rowsToExport.map((row) => [escapeCsv(row.eventDate), escapeCsv(row.betDate), escapeCsv(getDisplayedBookmaker(row)), escapeCsv(row.sportLeague), escapeCsv(row.selection), escapeCsv(row.betType), escapeCsv(row.betSourceTag), escapeCsv(row.fixtureEvent), escapeCsv(row.stake), escapeCsv(row.oddsUS), escapeCsv(row.oddsSource), escapeCsv(row.oddsMissingReason), escapeCsv(row.impliedProbability), escapeCsv(row.confidenceFlag), escapeCsv(row.live), escapeCsv(row.bonusBet), escapeCsv(row.win)]);
    return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
  };

  const downloadCsv = (filename, content) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportStandardCsv = () => {
    if (rowsWithWarnings.length === 0) return showNotice("No rows to export");
    downloadCsv("bet-slip-data.csv", buildCsvData(rowsWithWarnings, false));
    showNotice("Standard CSV exported");
  };
  const exportDebugCsv = () => {
    if (rowsWithWarnings.length === 0) return showNotice("No rows to export");
    downloadCsv("bet-slip-debug-data.csv", buildCsvData(rowsWithWarnings, true));
    showNotice("Debug CSV exported");
  };
  const exportSelectedCsv = (debug = false) => {
    const rowsToExport = rowsWithWarnings.filter((row) => selectedIds.includes(row.id));
    if (rowsToExport.length === 0) return showNotice("No selected rows to export");
    downloadCsv(debug ? "bet-slip-selected-debug-data.csv" : "bet-slip-selected-data.csv", buildCsvData(rowsToExport, debug));
    showNotice(`Exported ${rowsToExport.length} selected row${rowsToExport.length === 1 ? "" : "s"}`);
  };

  const copySelectedOcr = async () => {
    if (!selectedRow?.sourceText) return showNotice("No OCR text to copy");
    try {
      await navigator.clipboard.writeText(selectedRow.sourceText);
      showNotice("OCR text copied");
    } catch (error) {
      console.error(error);
      showNotice("Could not copy OCR text");
    }
  };

  const exportAppState = () => {
    const payload = { exportedAt: new Date().toISOString(), rows, uploadOwner, changelog };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bet-slip-app-state.json";
    link.click();
    URL.revokeObjectURL(url);
    showNotice("App state exported");
  };

  const importAppState = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.rows)) setRows(parsed.rows);
      if (typeof parsed.uploadOwner === "string") setUploadOwner(parsed.uploadOwner);
      if (Array.isArray(parsed.changelog)) setChangelog(parsed.changelog);
      showNotice("App state imported");
    } catch (error) {
      console.error(error);
      showNotice("Could not import app state");
    }
  };

  const addChangelogEntry = () => {
    const entry = window.prompt("Add a changelog entry");
    if (!entry) return;
    setChangelog((prev) => [`${new Date().toLocaleDateString()} - ${entry}`, ...prev]);
    showNotice("Changelog updated");
  };

  const editorFields = [["eventDate", "EventDate"], ["betDate", "Bet Date"], ["bookmaker", "Bookmaker"], ["sportLeague", "Sport / League"], ["selection", "Selection"], ["fixtureEvent", "Fixture / Event"], ["stake", "Stake"], ["oddsUS", "Odds (US)"], ["marketDetail", "Market Detail (helper)"], ["payout", "Payout (helper)"], ["toWin", "To Win (helper)"], ["rawPlacedDate", "Raw Placed Date (helper)"], ["status", "Status (helper)"], ["parseWarning", "Parse Warning (helper)"], ["sourceFileName", "Source File Name (helper)"], ["betId", "Bet ID (helper)"]];

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 1600, margin: "0 auto", backgroundColor: "#ffffff", color: "#000000", minHeight: "100vh" }}>
      <h1>Bet Slip Reader</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <label style={{ color: "#000", display: "flex", alignItems: "center", gap: 8 }}>
          Upload owner
          <select value={uploadOwner} onChange={(e) => setUploadOwner(e.target.value)} style={{ ...selectStyle, width: 120, padding: "6px 8px" }}>
            <option value="Me">Me</option>
            <option value="Wife">Wife</option>
          </select>
        </label>
        <label style={{ ...buttonStyle, backgroundColor: "#111827", color: "#fff", borderColor: "#111827", fontWeight: 700 }}>
          Upload Bet Slips
          <input type="file" accept="image/*" multiple onChange={(e) => handleUpload(e.target.files)} style={{ display: "none" }} />
        </label>
        <button onClick={exportStandardCsv} style={buttonStyle} disabled={rowsWithWarnings.length === 0}>Export CSV</button>
        <button onClick={exportDebugCsv} style={buttonStyle} disabled={rowsWithWarnings.length === 0}>Export Debug CSV</button>
        <button onClick={() => exportSelectedCsv(false)} style={buttonStyle} disabled={selectedIds.length === 0}>Export Selected CSV</button>
        <button onClick={() => exportSelectedCsv(true)} style={buttonStyle} disabled={selectedIds.length === 0}>Export Selected Debug</button>
        <button onClick={exportAppState} style={buttonStyle}>Export App State</button>
        <label style={{ ...buttonStyle, display: "inline-flex", alignItems: "center" }}>
          Import App State
          <input type="file" accept="application/json" onChange={(e) => importAppState(e.target.files)} style={{ display: "none" }} />
        </label>
        <button onClick={addChangelogEntry} style={buttonStyle}>Add Changelog Note</button>
        <button onClick={deleteSelected} style={buttonStyle} disabled={selectedIds.length === 0}>Delete Selected</button>
        <button onClick={clearAll} style={buttonStyle} disabled={rowsWithWarnings.length === 0}>Clear All</button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={showReviewLaterOnly} onChange={(e) => setShowReviewLaterOnly(e.target.checked)} />Show review-later only</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={showLowConfidenceOnly} onChange={(e) => setShowLowConfidenceOnly(e.target.checked)} />Show low confidence only</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={showLikelyParserIssuesOnly} onChange={(e) => setShowLikelyParserIssuesOnly(e.target.checked)} />Show likely parser issues only</label>
        <span>Keyboard: W = win, L = loss, ↑/↓ = move rows</span>
      </div>

      {saveNotice && <div style={noticeStyle}>{saveNotice}</div>}
      {processing && <div style={noticeStyle}>{processingMessage || "Reading images..."}</div>}

      <div style={{ marginTop: 18, marginBottom: 12, color: "#000" }}>Rows in review: <strong>{rowsWithWarnings.length}</strong> | Visible: <strong>{visibleRows.length}</strong></div>

      <div style={{ marginTop: 8, marginBottom: 16, padding: 12, border: "1px solid #ddd", borderRadius: 6, background: "#fafafa" }}>
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Changelog</div>
        <div style={{ display: "grid", gap: 4 }}>{changelog.map((entry, index) => <div key={`${entry}-${index}`}>{entry}</div>)}</div>
      </div>

      {selectedRow && (
        <div style={{ marginTop: 20, marginBottom: 20, padding: 16, border: "1px solid #ddd", borderRadius: 8, background: "#fafafa" }}>
          <h3 style={{ color: "#000", marginTop: 0 }}>Selected Row Editor</h3>
          {selectedRow.parseWarning && <div style={warningStyle}>{selectedRow.parseWarning}</div>}
          {selectedRow.duplicateWarning && <div style={duplicateStyle}>{selectedRow.duplicateWarning}</div>}
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setWinStatusForRow(selectedRow.id, "Y", true)} style={smallButtonStyle}>Mark Win + Next</button>
            <button onClick={() => setWinStatusForRow(selectedRow.id, "N", true)} style={smallButtonStyle}>Mark Loss + Next</button>
            <button onClick={() => handleRowFieldChange(selectedRow.id, "reviewLater", selectedRow.reviewLater === "Y" ? "N" : "Y")} style={smallButtonStyle}>{selectedRow.reviewLater === "Y" ? "Clear Review Later" : "Review Later"}</button>
            <button onClick={() => ignoreDuplicateForRow(selectedRow.id)} style={smallButtonStyle}>{selectedRow.duplicateIgnored === "Y" ? "Unignore Duplicate" : "Ignore Duplicate"}</button>
            <button onClick={mergeDuplicatesIntoSelected} style={smallButtonStyle}>Merge Duplicates Into This Row</button>
            <button onClick={() => moveSelection(-1)} style={smallButtonStyle}>Prev Row</button>
            <button onClick={() => moveSelection(1)} style={smallButtonStyle}>Next Row</button>
          </div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "240px 1fr", gap: 8, alignItems: "center" }}>
            <label style={{ fontWeight: "bold" }}>Account Owner</label>
            <select value={selectedRow.accountOwner || "Me"} onChange={(e) => handleRowFieldChange(selectedRow.id, "accountOwner", e.target.value)} style={selectStyle}>{ACCOUNT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <label style={{ fontWeight: "bold" }}>Bet Type</label>
            <select value={selectedRow.betType || ""} onChange={(e) => handleRowFieldChange(selectedRow.id, "betType", e.target.value)} style={selectStyle}>{BET_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option || "--"}</option>)}</select>
            <label style={{ fontWeight: "bold" }}>Bet Source Tag</label>
            <select value={selectedRow.betSourceTag || ""} onChange={(e) => handleRowFieldChange(selectedRow.id, "betSourceTag", e.target.value)} style={selectStyle}>{BET_SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option || "--"}</option>)}</select>
            <label style={{ fontWeight: "bold" }}>Win</label>
            <select value={selectedRow.win || ""} onChange={(e) => handleRowFieldChange(selectedRow.id, "win", e.target.value)} style={selectStyle}><option value="">--</option><option value="Y">Y</option><option value="N">N</option></select>
            <label style={{ fontWeight: "bold" }}>Odds Missing Reason (helper)</label>
            <input type="text" value={selectedRow.oddsMissingReason || ""} readOnly style={inputStyle} />
            <label style={{ fontWeight: "bold" }}>Implied Probability (helper)</label>
            <input type="text" value={selectedRow.impliedProbability || ""} readOnly style={inputStyle} />
            <label style={{ fontWeight: "bold" }}>Confidence (helper)</label>
            <input type="text" value={selectedRow.confidenceFlag || ""} readOnly style={inputStyle} />
            <label style={{ fontWeight: "bold" }}>Likely Parser Issue (helper)</label>
            <input type="text" value={selectedRow.likelyParserIssue || ""} readOnly style={inputStyle} />
            {editorFields.map(([key, label]) => (
              <div key={key} style={{ display: "contents" }}>
                <label style={{ fontWeight: "bold" }}>{label}</label>
                <input type="text" value={selectedRow[key] || ""} onChange={(e) => handleRowFieldChange(selectedRow.id, key, e.target.value)} style={inputStyle} />
              </div>
            ))}
            <label style={{ fontWeight: "bold" }}>Image</label>
            <div>{selectedRow.sourceImageUrl ? <a href={selectedRow.sourceImageUrl} target="_blank" rel="noreferrer"><img src={selectedRow.sourceImageUrl} alt={selectedRow.sourceFileName} style={{ maxWidth: 260, maxHeight: 260, objectFit: "contain", border: "1px solid #ccc", borderRadius: 6 }} /></a> : <div>No image in session</div>}</div>
            <label style={{ fontWeight: "bold" }}>Review Notes</label>
            <textarea value={selectedRow.reviewNotes || ""} onChange={(e) => handleRowFieldChange(selectedRow.id, "reviewNotes", e.target.value)} style={textAreaStyle} />
            <label style={{ fontWeight: "bold" }}>OCR Text</label>
            <div><button onClick={copySelectedOcr} style={{ ...smallButtonStyle, marginBottom: 8 }}>Copy OCR</button><textarea value={selectedRow.sourceText || ""} readOnly style={{ ...textAreaStyle, minHeight: 220 }} /></div>
          </div>
        </div>
      )}

      {visibleRows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: "#000" }}>Review Queue</h3>
          <div style={{ overflowX: "auto", maxHeight: 520, border: "1px solid #ddd", borderRadius: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", backgroundColor: "#fff", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  {[
                    <input key="all" type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />,
                    "Select",
                    "Image",
                    "Source File",
                    "Owner",
                    "Bookmaker",
                    "Bet ID",
                    "EventDate",
                    "Bet Date",
                    "Sport / League",
                    "Selection",
                    "Bet Type",
                    "Source Tag",
                    "Fixture / Event",
                    "Stake",
                    "Odds",
                    "Odds Note",
                    "Imp Prob",
                    "Confidence",
                    "QA",
                    "Live",
                    "Review",
                    "Warnings",
                    "Actions",
                  ].map((header, idx) => <th key={typeof header === "string" ? header : `hdr-${idx}`} style={{ border: "1px solid #ccc", padding: 8, background: "#f0f0f0", color: "#000", textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2 }}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} onClick={() => setSelectedRowId(row.id)} style={{ backgroundColor: row.id === selectedRowId ? "#f7fbff" : row.confidenceFlag === "Low" ? "#fffaf0" : "#fff", cursor: "pointer" }}>
                    <td style={cellStyle}><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td style={cellStyle}><button onClick={(e) => { e.stopPropagation(); setSelectedRowId(row.id); }} style={smallButtonStyle}>{row.id === selectedRowId ? "Selected" : "Edit"}</button></td>
                    <td style={cellStyle}>{row.sourceImageUrl ? <a href={row.sourceImageUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><img src={row.sourceImageUrl} alt={row.sourceFileName} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, border: "1px solid #ccc" }} /></a> : ""}</td>
                    <td style={cellStyle}>{row.sourceFileName}</td>
                    <td style={cellStyle}>{row.accountOwner}</td>
                    <td style={cellStyle}>{getDisplayedBookmaker(row)}</td>
                    <td style={cellStyle}>{row.betId}</td>
                    <td style={cellStyle}>{row.eventDate}</td>
                    <td style={cellStyle}>{row.betDate}</td>
                    <td style={cellStyle}>{row.sportLeague}</td>
                    <td style={cellStyle}>{row.selection}</td>
                    <td style={cellStyle}>{row.betType}</td>
                    <td style={cellStyle}>{row.betSourceTag}</td>
                    <td style={cellStyle}>{row.fixtureEvent}</td>
                    <td style={cellStyle}>{row.stake}</td>
                    <td style={cellStyle}>{row.oddsUS}</td>
                    <td style={cellStyle}>{row.oddsMissingReason}</td>
                    <td style={cellStyle}>{row.impliedProbability}</td>
                    <td style={cellStyle}>{row.confidenceFlag}</td>
                    <td style={cellStyle}>{row.likelyParserIssue === "Y" ? "Check" : ""}</td>
                    <td style={cellStyle}>{row.live}</td>
                    <td style={cellStyle}>{row.reviewLater}</td>
                    <td style={cellStyle}>{row.parseWarning && <div>{row.parseWarning}</div>}{row.duplicateWarning && <div>{row.duplicateWarning}</div>}</td>
                    <td style={cellStyle}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button onClick={(e) => { e.stopPropagation(); setWinStatusForRow(row.id, "Y", true); }} style={smallButtonStyle}>Win</button><button onClick={(e) => { e.stopPropagation(); setWinStatusForRow(row.id, "N", true); }} style={smallButtonStyle}>Loss</button><button onClick={(e) => { e.stopPropagation(); deleteRow(row.id); }} style={smallButtonStyle}>Delete</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
