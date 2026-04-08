import { detectLeague } from "./detectLeague";
import {
  americanOddsFromStakeAndProfit,
  americanOddsFromStakeAndReturn,
  detectOddsMissingReason,
  extractBestOdds,
  extractPayouts,
} from "./oddsHelpers";
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

function normalizeOcrText(text) {
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

function formatDateMMDDYYYY(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const y = String(dateObj.getFullYear());
  return `${m}/${d}/${y}`;
}

function normalizeDateString(raw) {
  if (!raw) return "";
  return raw
    .replace(/,\s*/g, ", ")
    .replace(/(\d)(AM|PM)$/i, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
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
  const match = String(text || "").match(regex);
  return match ? (match[1] || "").trim() : "";
}

function parsePlacedDate(cleaned) {
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

function parseMonthDayEventDate(cleaned, placedDateObj) {
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
    if (idx !== undefined) {
      return formatDateMMDDYYYY(nextWeekdayFromDate(placedDateObj, idx));
    }
  }
  return "";
}

function detectSportsbook(cleaned) {
  const containsAny = (patterns) => patterns.some((pattern) => pattern.test(cleaned));
  return containsAny([
    /draftkings/i,
    /braftkings/i,
    /dk\d+/i,
    /\bmy bets\b/i,
    /\bmybets\b/i,
    /the crown is yours/i,
  ])
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
      {
        regex: /^(.*)\s+Three Pointers(?: Made)?(?: O\/U| Made O\/U)?$/i,
        label: "threes",
      },
      {
        regex: /^(.*)\s+Points \+ Rebounds \+ Assists(?: O\/U)?$/i,
        label: "points + rebounds + assists",
      },
      { regex: /^(.*)\s+Passing Yards$/i, label: "passing yards" },
      { regex: /^(.*)\s+Rushing Yards$/i, label: "rushing yards" },
      { regex: /^(.*)\s+Receiving Yards$/i, label: "receiving yards" },
      { regex: /^(.*)\s+Shots on Goal$/i, label: "shots on goal" },
      { regex: /^(.*)\s+Strikeouts(?: Thrown)?$/i, label: "strikeouts" },
      { regex: /^(.*)\s+Hits(?: O\/U)?$/i, label: "hits" },
      { regex: /^(.*)\s+RBIs$/i, label: "RBIs" },
      { regex: /^(.*)\s+Earned Runs(?: Allowed)?(?: O\/U)?$/i, label: "earned runs" },
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
      { regex: /^(.*)\s+Three Pointers(?: Made)?(?: O\/U| Made O\/U)?$/i, label: "three pointers made" },
      { regex: /^(.*)\s+Home Runs$/i, label: "home runs" },
      { regex: /^(.*)\s+Hits$/i, label: "hits" },
      { regex: /^(.*)\s+RBIs$/i, label: "RBIs" },
      { regex: /^(.*)\s+Strikeouts(?: Thrown)?$/i, label: "strikeouts" },
      { regex: /^(.*)\s+Shots on Goal$/i, label: "shots on goal" },
      { regex: /^(.*)\s+Assists$/i, label: "assists" },
    ];

    for (const item of propPatterns) {
      const m = cleanedMarket.match(item.regex);
      if (m) return `${m[1]} ${n}+ ${singularizeStat(item.label)}`.trim();
    }
  }

  if (/Anytime Goalscorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} anytime goal`;
  if (/First Goalscorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} first goal`;
  if (/Last Goalscorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} last goal`;
  if (/Anytime Touchdown Scorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} anytime touchdown`;
  if (/First Touchdown Scorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} first touchdown`;

  if (/^yes$/i.test(cleanedSelection) && /double-double/i.test(cleanedMarket))
    return `Yes double-double`;
  if (/^no$/i.test(cleanedSelection) && /double-double/i.test(cleanedMarket))
    return `No double-double`;

  if (cleanedMarket && !cleanedSelection) return cleanedMarket;
  return cleanedSelection;
}

function detectStatus(cleaned, receiptWindowText) {
  const windowText = receiptWindowText || cleaned;
  if (/\bCashed Out\b/i.test(windowText) || /\bPaid:\s*\$/i.test(windowText))
    return "Cashed Out";
  if (/Bet Settled/i.test(windowText)) {
    if (/\bWon\b/i.test(windowText)) return "Won";
    if (/\bLost\b/i.test(windowText)) return "Lost";
  }
  if (/\bOpen\b/i.test(windowText) && !/Bet Settled/i.test(windowText)) return "Open";
  return "";
}

function detectLive(text) {
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

function extractBetId(text) {
  return (
    getMatch(text, /\b(DK\d{12,})\b/i) ||
    getMatch(text, /\b(ID:?\s*[A-Z0-9\-]{8,})\b/i) ||
    ""
  );
}

function classifyScreenType(cleaned) {
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

function extractReceiptWindow(lines) {
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
  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function extractParlayInfo(afterLines) {
  const cleanedLines = afterLines.map(cleanTextLine).filter(Boolean);
  const legCountText = cleanedLines.find((line) => /^\d+\s*Pick Parlay$/i.test(line)) || "";
  const legCount = Number((legCountText.match(/^(\d+)/)?.[1] || "").trim()) || 0;

  const legs = [];
  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    const next = cleanedLines[i + 1] || "";

    if (/^(Over|Under)\s+\d+(\.\d+)?$/i.test(line) && next) {
      legs.push(`${line} ${next}`.trim());
      continue;
    }

    if (/^(Yes|No)$/i.test(line) && next) {
      legs.push(`${line} ${next}`.trim());
      continue;
    }

    if (
      /Moneyline|Spread|Run Line|Puck Line|Total|Points O\/U|Rebounds O\/U|Assists O\/U|Three Pointers(?: Made)?(?: O\/U| Made O\/U)?|Double-Double|Triple-Double|Anytime Goalscorer/i.test(
        next
      )
    ) {
      legs.push(`${line} ${next}`.trim());
    }
  }

  const dedupedLegs = Array.from(new Set(legs)).filter(
    (x) =>
      x &&
      !/Bet With Friends|Create Group|Keep Picks|Wager Amount|Total Payout|Mar \d|Apr \d/i.test(x)
  );

  return {
    parlayLegCount: legCount || dedupedLegs.length || 0,
    legsRawText: dedupedLegs.join(" | "),
    selectionSummary: legCount
      ? `${legCount} Pick Parlay`
      : dedupedLegs.length
      ? `${dedupedLegs.length} Leg Parlay`
      : "Parlay",
  };
}
export function enrichRow(row) {
  const normalizedFixture = normalizeTeamNames(row.fixtureEvent);
  const normalizedSelection = normalizeTeamNames(row.selection);
  const normalizedBookmaker = String(row.bookmaker || "").replace(/^C-/, "");

  return {
    ...row,
    bookmaker: normalizedBookmaker,
    fixtureEvent: normalizedFixture,
    selection: normalizedSelection,
  };
}

export function parseBetSlip(text, sourceFileName = "") {
  const cleaned = normalizeOcrText(text);
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const screenType = classifyScreenType(cleaned);
  const sportsbook = detectSportsbook(cleaned);
  const betId = extractBetId(cleaned);

  if (screenType === "active_bet_slip") {
    return enrichRow({
      ...emptyParsed,
      bookmaker: sportsbook,
      betId,
      parseWarning: "Unsupported screen type: active bet slip, not a receipt.",
      sourceFileName,
      sourceText: text,
    });
  }

  let parseWarning = "";
  if (screenType === "multi_bet_screenshot") {
    parseWarning = "Multiple bets detected in one screenshot. Results may reflect only one bet.";
  } else if (screenType === "my_bets_card") {
    parseWarning = "My Bets / cash-out layout detected.";
  }

  const { receiptIndex, receiptBlock } = extractReceiptWindow(lines);
  const receiptText = receiptBlock.join("\n");

  const stopWords = [
    /^Wager Amount:/i,
    /^Wager:/i,
    /^Total Payout:/i,
    /^To Win:/i,
    /^To Pay:/i,
    /^Paid:/i,
    /^Bet With Friends/i,
    /^\+ Create Group/i,
    /^Keep Picks/i,
    /^in Bet Slip/i,
    /^Receipt/i,
    /^Cash\/Out/i,
    /^Cash Out/i,
  ];

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
      if (
        /^Market settled based on/i.test(line) ||
        /^In the event of/i.test(line) ||
        /^If a match does not reach/i.test(line) ||
        /^If the bet is cashed out/i.test(line) ||
        /^Any bets placed after/i.test(line) ||
        /^There will be no push/i.test(line) ||
        /^Refers to the first ten minutes/i.test(line)
      ) {
        break;
      }
      if (i === eventStartIndex && cleanTextLine(line).toLowerCase() === "u") continue;
      eventLines.push(line);
    }
    fixtureEvent = eventLines.join(" ");
  }

  if (!rawSelection) {
    rawSelection =
      getMatch(
        receiptText,
        /Bet Placed\s+([\s\S]*?)\s+(?:Moneyline|Live Moneyline|Spread|Run Line|Puck Line|Games Spread|Total|Total Games|Anytime Goalscorer|First Goalscorer|Last Goalscorer|Anytime Touchdown Scorer|First Touchdown Scorer|Parlay|Same Game Parlay|SGP|KO\/TKO\/DQ|Submission|Decision|Points O\/U|Rebounds O\/U|Assists O\/U|Three Pointers(?: Made)?(?: O\/U| Made O\/U)?|Double-Double|Triple-Double|Hits O\/U|Home Runs|Strikeouts(?: Thrown)?|Earned Runs(?: Allowed)?(?: O\/U)?)/i
      ) ||
      getMatch(
        receiptText,
        /Bet Settled\s+([\s\S]*?)\s+(?:Moneyline|Live Moneyline|Spread|Run Line|Puck Line|Games Spread|Total|Total Games|Anytime Goalscorer|First Goalscorer|Last Goalscorer|Anytime Touchdown Scorer|First Touchdown Scorer|Parlay|Same Game Parlay|SGP|KO\/TKO\/DQ|Submission|Decision|Points O\/U|Rebounds O\/U|Assists O\/U|Three Pointers(?: Made)?(?: O\/U| Made O\/U)?|Double-Double|Triple-Double|Hits O\/U|Home Runs|Strikeouts(?: Thrown)?|Earned Runs(?: Allowed)?(?: O\/U)?)/i
      ) ||
      "";
  }

  rawSelection = cleanTextLine(rawSelection);

  if (!marketDetail) {
    const knownMarketPatterns = [
      /Moneyline/i,
      /Live Moneyline/i,
      /Spread/i,
      /Run Line/i,
      /Puck Line/i,
      /Games Spread/i,
      /Total/i,
      /Total Games/i,
      /Anytime Goalscorer/i,
      /First Goalscorer/i,
      /Last Goalscorer/i,
      /Anytime Touchdown Scorer/i,
      /First Touchdown Scorer/i,
      /Points O\/U/i,
      /Rebounds O\/U/i,
      /Assists O\/U/i,
      /Three Pointers(?: Made)?(?: O\/U| Made O\/U)?/i,
      /Triple-Double/i,
      /Double-Double/i,
      /Points \+ Rebounds \+ Assists/i,
      /Shots on Goal/i,
      /Passing Yards/i,
      /Rushing Yards/i,
      /Receiving Yards/i,
      /Strikeouts(?: Thrown)?/i,
      /Hits(?: O\/U)?/i,
      /RBIs/i,
      /Home Runs/i,
      /Earned Runs(?: Allowed)?(?: O\/U)?/i,
      /KO\/TKO\/DQ/i,
      /Submission/i,
      /Decision/i,
      /^Parlay$/i,
      /^Same Game Parlay$/i,
      /^SGP$/i,
      /^\d+\s*Pick Parlay$/i,
    ];
    const foundLine = receiptBlock.find((line) => knownMarketPatterns.some((re) => re.test(line)));
    if (foundLine) marketDetail = cleanTextLine(foundLine);
  }

  if (!fixtureEvent) {
    fixtureEvent =
      getMatch(receiptText, /([A-Za-z0-9 .&'()\/-]+\s*@\s*[A-Za-z0-9 .&'()\/-]+)/i) ||
      getMatch(receiptText, /([A-Za-z0-9 .&'()\/-]+\s+vs\s+[A-Za-z0-9 .&'()\/-]+)/i) ||
      "";
  }

  fixtureEvent = cleanTextLine(fixtureEvent)
    .replace(/,\s*[A-Z]{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const stake =
    getMatch(receiptText, /Wager Amount:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(receiptText, /Wager:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);

  const { payout, toWinDirect } = extractPayouts(receiptText);

  const oddsInfo = extractBestOdds({
    receiptText,
    rawSelection,
    payout,
    stake,
  });

  let oddsUS = oddsInfo.oddsUS;
  let oddsSource = oddsInfo.oddsSource;

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

  const toWin =
    toWinDirect ||
    (() => {
      const wager = parseFloat((stake || "").replace(/,/g, ""));
      const pay = parseFloat((payout || "").replace(/,/g, ""));
      if (!Number.isNaN(wager) && !Number.isNaN(pay) && pay >= wager) {
        return (pay - wager).toFixed(2);
      }
      return "";
    })();

  const status = detectStatus(cleaned, receiptText);
  const win = status === "Won" ? "Y" : status === "Lost" ? "N" : "";
  const lowerMarketDetail = (marketDetail || "").toLowerCase();

  const isParlay =
    /^parlay$/i.test(marketDetail) ||
    /^same game parlay$/i.test(marketDetail) ||
    /^sgp$/i.test(marketDetail) ||
    /^\d+\s*pick parlay$/i.test(marketDetail) ||
    /^\d+\s*pick parlay$/i.test(rawSelection);

  const isFuture =
    /\bfutures?\b|\bmvp\b|\bdivision winner\b|\bconference winner\b|\bchampionship\b|\bto win the\b|\baward\b|\bseason wins\b/i.test(
      receiptText
    );

  const isPlayerProp =
    /\bplayer\b/i.test(receiptText) ||
    /\bpoints?\b|\brebounds?\b|\bassists?\b|\bthree pointers?\b|\bmade o\/u\b|\bgoalscorer\b|\btouchdown scorer\b|\bshots on goal\b|\bpassing yards\b|\brushing yards\b|\breceiving yards\b|\bstrikeouts?\b|\bhits?\b|\brbis?\b|\bstolen bases?\b|\bhome runs?\b|\btriple-double\b|\bdouble-double\b|\bearned runs\b|\bko\/tko\/dq\b|\bsubmission\b|\bdecision\b|pitcher props|batter props/i.test(
      lowerMarketDetail
    );

  const isMoneyline = !isPlayerProp && /\bmoneyline\b|\blive moneyline\b/i.test(lowerMarketDetail);
  const isSpread =
    !isPlayerProp && /\bspread\b|\brun line\b|\bpuck line\b|\bgames spread\b/i.test(lowerMarketDetail);
  const isTotal = !isPlayerProp && /\btotal\b|\btotal games\b/i.test(lowerMarketDetail);

  let betType = "straight";
  if (isParlay) betType = "parlay";
  else if (isFuture) betType = "futures";
  else if (isPlayerProp) betType = "player prop";
  else if (isMoneyline) betType = "moneyline";
  else if (isSpread) betType = "spread";
  else if (isTotal) betType = "total";

  let selection = isPlayerProp ? buildPlayerPropSelection(rawSelection, marketDetail) : rawSelection;
  selection = cleanTextLine(selection)
    .replace(/\s+[+-]\d{2,5}\s*$/i, "")
    .trim();

  let parlayInfo = { parlayLegCount: 0, legsRawText: "", selectionSummary: "" };
  if (isParlay && receiptIndex !== -1) {
    const after = lines.slice(receiptIndex + 1);
    parlayInfo = extractParlayInfo(after);
    if (!selection || /^parlay$/i.test(selection)) {
      selection = parlayInfo.selectionSummary || "Parlay";
    }
  }

  const sportLeague = detectLeague({
    cleaned: receiptText || cleaned,
    marketDetail,
    fixtureEvent,
    selection,
    isParlay,
  });

  if (isParlay) {
    const parlayLabel =
      sportLeague === "Multi"
        ? "multi-sport parlay"
        : sportLeague
        ? `${sportLeague} parlay`
        : "Parlay";
    fixtureEvent = parlayInfo.legsRawText || fixtureEvent || parlayLabel;
    if (!selection) selection = parlayInfo.selectionSummary || parlayLabel;
  }

  const oddsMissingReason = detectOddsMissingReason({
    oddsUS,
    stake,
    payout,
    toWin,
    screenType,
  });

  const additionalWarnings = [];
  if (screenType === "my_bets_card") additionalWarnings.push("cashout_layout_detected");
  if (screenType === "multi_bet_screenshot") additionalWarnings.push("multiple_bets_detected");
  if (!oddsUS) additionalWarnings.push("receipt_detected_but_odds_missing");
  if (!payout && !toWin) additionalWarnings.push("receipt_detected_but_payout_missing");
  if (!betDate) additionalWarnings.push("no_bet_date_detected");
  if (!sportLeague) additionalWarnings.push("no_league_detected");

  const mergedWarning = [parseWarning, ...additionalWarnings].filter(Boolean).join(" | ");

  return enrichRow({
    ...emptyParsed,
    eventDate,
    betDate,
    bookmaker: sportsbook,
    sportLeague,
    selection,
    betType,
    fixtureEvent,
    stake,
    oddsUS,
    oddsSource,
    oddsMissingReason,
    live: detectLive(cleaned),
    bonusBet,
    win,
    marketDetail,
    payout,
    toWin,
    rawPlacedDate: placedInfo.raw,
    status,
    parseWarning: mergedWarning,
    sourceFileName,
    sourceText: text,
    reviewNotes: "",
    betId,
  });
}