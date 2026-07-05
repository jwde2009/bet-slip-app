import { detectLeague } from "./detectLeague";
import {
  americanOddsFromStakeAndProfit,
  americanOddsFromStakeAndReturn,
  detectOddsMissingReason,
} from "./oddsHelpers";

function getDateFromSourceFileName(sourceFileName) {
  const m = String(sourceFileName || "").match(/Screenshot_(\d{4})(\d{2})(\d{2})-/i);
  if (!m) return "";

  const [, y, mo, d] = m;
  return `${mo}/${d}/${y}`;
}

function normalizeBetMgmMoneyValue(value = "") {
  const cleaned = String(value || "")
    .replace(/,/g, "")
    .replace(/[^0-9.]/g, "")
    .trim();

  if (!cleaned) return "";

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "";

  return n.toFixed(2);
}

function normalizeLine(value = "") {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLines(text = "") {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
}

function isStatusLine(line = "") {
  const text = String(line || "").trim();

  if (!text) return false;
  if (/\b(To Win|Win:|Win \$|Stake|Risk|Payout|Returns?)\b/i.test(text)) return false;

  return /^(WON|WIN|LOST|LOSS|LOSE|VOID|VOIDED|PUSH|CASHED OUT|OPEN|CANCELLED|CANCELED)\b/i.test(text);
}

function statusFromText(text = "") {
  const raw = String(text || "").toLowerCase();

  if (/\bwon\b|\bwin\b/.test(raw)) return { status: "Won", win: "Y" };
  if (/\blost\b|\bloss\b|\blose\b/.test(raw)) return { status: "Lost", win: "N" };
  if (/\bvoided\b|\bvoid\b|\bpush\b|\bcancelled\b|\bcanceled\b/.test(raw)) {
   return { status: "Voided", win: "" };
  }
  if (/\bcashed out\b/.test(raw)) return { status: "Cashed Out", win: "" };
  if (/\bopen\b/.test(raw)) return { status: "Open", win: "" };

  return { status: "", win: "" };
}

function isBetMgmNoiseLine(line) {
  if (!line) return true;

  return (
    /your bet has been accepted|good luck|promotion used|odds boost|incl\. boosted winnings/i.test(line) ||
    /^balance\s*:/i.test(line) ||
    /^close$/i.test(line) ||
    /^sports$/i.test(line) ||
    /^search sports$/i.test(line) ||
    /^resources\.?$/i.test(line) ||
    /^current time:/i.test(line) ||
    /^copyright/i.test(line) ||
    /^all\s+[A-Za-z]/i.test(line) ||
    /^today\s*-/i.test(line) ||
    /^starting in\b/i.test(line) ||
    /^login duration:/i.test(line) ||
    /^my bets$/i.test(line) ||
    /^open bets$/i.test(line) ||
    /^settled bets$/i.test(line) ||
    /^cash out$/i.test(line) ||
    /^betmgm$/i.test(line) ||
    /espn\d?/i.test(line) ||
    /spread total money/i.test(line) ||
    /keep placed bets in bet slip|share my bet/i.test(line)
  );
}

function isMoneyLine(line = "") {
  return /\b(Stake|Risk|Total Payout|Payout|Returns?|To Win|Win)\b/i.test(String(line || ""));
}

function hasOdds(line = "") {
  return /(^|\s)([+-]\d{2,5})(?=\s|$)/.test(String(line || ""));
}

function extractOdds(line = "") {
  const matches = [...String(line || "").matchAll(/(^|\s)([+-]\d{2,5})(?=\s|$)/g)];
  return matches.length ? matches[matches.length - 1][2] : "";
}

function cleanSelectionLine(line = "") {
  let text = normalizeLine(line);

  text = text
    .replace(/\b(WON|WIN|LOST|LOSS|LOSE|VOID|VOIDED|PUSH|CASHED OUT|OPEN)\b/gi, " ")
    .replace(/\bBETMGM\b/gi, " ")
    .replace(/[|]/g, " ")
    .replace(/(^|\s)[+-]\d{2,5}(?=\s|$)/g, " ")
    .replace(/\s+-\s*ol\b/gi, " ")
    .replace(/\bol\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove common OCR junk left from the top banner/status area.
  text = text
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+#\d+\s*$/i, "")
    .replace(/\s+[Hh][Oo]\s*$/i, "")
    .trim();

  return text;
}

function looksLikeMarketLine(line = "") {
  return /\b(spread|moneyline|total|run line|puck line|games spread|match result|fight result|anytime|goal scorer|goalscorer|player assists|player points|player rebounds|points|rebounds|assists|shots on goal|shots|saves|strikeouts|total bases|home runs|rbis|hits|double-double|triple-double|submission|decision|ko\/tko|method)\b/i.test(
    String(line || "")
  );
}

function looksLikeFixtureLine(line = "") {
  const text = String(line || "");
  if (isMoneyLine(text)) return false;
  if (isBetMgmNoiseLine(text)) return false;
  if (/^placed\b/i.test(text)) return false;

  return (
    /\s+at\s+/i.test(text) ||
    /\s*@\s*/i.test(text) ||
    /\s+vs\.?\s+/i.test(text) ||
    /\s+-\s/.test(text)
  );
}

function cleanFixtureLine(line = "") {
  let text = normalizeLine(line)
    .replace(/\b(Stake|Risk|Total Payout|Payout|Returns?|To Win|Win)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!looksLikeFixtureLine(text)) return "";

  return text;
}

function getBetMgmTopBetText(cleaned = "") {
  const lines = getLines(cleaned);

  const firstMoneyIndex = lines.findIndex((line) =>
    /\b(Stake|Risk|Total Payout|Payout|Returns?|To Win|Win)\b/i.test(line)
  );

  if (firstMoneyIndex === -1) return cleaned;

  const start = Math.max(0, firstMoneyIndex - 10);
  let end = Math.min(lines.length, firstMoneyIndex + 10);

  for (let i = firstMoneyIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];

    const looksLikeNextBet =
      i > firstMoneyIndex + 2 &&
      (
        /\b(Stake|Risk)\b.*\$?\d/i.test(line) ||
        /\b(Straight|Parlay|Same Game Parlay|SGP)\b/i.test(line)
      );

    if (looksLikeNextBet) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

function findBestBetMgmSelectionLine(lines = []) {
  const moneyIndex = lines.findIndex((line) => isMoneyLine(line));
  const end = moneyIndex !== -1 ? moneyIndex : lines.length;

  const candidates = [];

  for (let i = 0; i < end; i += 1) {
    const line = lines[i];

    if (!hasOdds(line)) continue;
    if (isMoneyLine(line)) continue;
    if (isBetMgmNoiseLine(line)) continue;

    const cleaned = cleanSelectionLine(line);

    if (!cleaned || cleaned.length < 2) continue;
    if (/^betmgm$/i.test(cleaned)) continue;
    if (/^(won|lost|void|open)$/i.test(cleaned)) continue;

    candidates.push({ line, index: i, cleaned });
  }

  if (!candidates.length) {
    return { line: "", index: -1 };
  }

  const preferred =
    candidates.find((candidate) =>
      /[A-Za-z]/.test(candidate.cleaned) &&
      !/^\d+$/.test(candidate.cleaned)
    ) || candidates[0];

  return {
    line: preferred.line,
    index: preferred.index,
  };
}

function parseBetMgmSettledReceipt(cleaned = "") {
  const lines = getLines(cleaned);

  const statusIndex = lines.findIndex((line) => isStatusLine(line));
  const statusInfo = statusIndex !== -1 ? statusFromText(lines[statusIndex]) : { status: "", win: "" };

  const moneyIndex = lines.findIndex((line) => isMoneyLine(line));
  const searchStart = statusIndex !== -1 ? statusIndex : 0;
  const searchEnd = moneyIndex !== -1 ? moneyIndex : lines.length;

  let selectionLine = "";
  let selectionIndex = -1;

  const bestSelection = findBestBetMgmSelectionLine(lines);

  if (bestSelection.line) {
    selectionLine = bestSelection.line;
    selectionIndex = bestSelection.index;
  } else if (statusIndex !== -1 && hasOdds(lines[statusIndex])) {
    const candidate = cleanSelectionLine(lines[statusIndex]);

    if (candidate && !/^betmgm$/i.test(candidate)) {
      selectionLine = lines[statusIndex];
      selectionIndex = statusIndex;
    }
  }

  const oddsUS = extractOdds(selectionLine);
  let rawSelection = cleanSelectionLine(selectionLine);

  let marketDetail = "";
  let fixtureEvent = "";

  if (selectionIndex !== -1) {
    const detailSearchEnd = moneyIndex !== -1 ? moneyIndex : lines.length;

    for (let i = selectionIndex + 1; i < detailSearchEnd; i += 1) {
      const line = lines[i];
      if (!line || isBetMgmNoiseLine(line) || isMoneyLine(line) || isStatusLine(line)) continue;
      if (hasOdds(line)) continue;

      if (!fixtureEvent && looksLikeFixtureLine(line)) {
        fixtureEvent = cleanFixtureLine(line);
        continue;
      }

      if (!marketDetail && looksLikeMarketLine(line)) {
        marketDetail = line;
        continue;
      }

      // If market came before fixture and this looks like plain market text, use it.
      if (!marketDetail && !fixtureEvent && !looksLikeFixtureLine(line)) {
        marketDetail = line;
      }
    }
  }

  if (!fixtureEvent) {
    const fixtureLine = lines.find((line) => looksLikeFixtureLine(line));
    fixtureEvent = cleanFixtureLine(fixtureLine || "");
  }

  // If the player and prop are in the market line, make a better player prop selection.
  // Example:
  // selection: Over 0.5
  // market: Josh Norris (BUF): Points
  if (
    /^(over|under)\s+\d+(?:\.\d+)?$/i.test(rawSelection) &&
    /:/.test(marketDetail)
  ) {
    const m = marketDetail.match(/^(.+?):\s*(.+)$/);
    if (m) {
      const player = String(m[1] || "")
        .replace(/\s*\([A-Z]{2,4}\)\s*$/i, "")
        .trim();
      const prop = String(m[2] || "").trim();

      if (player && prop) {
        rawSelection = `${player} ${rawSelection}`;
        marketDetail = prop;
      }
    }
  }

  return {
    ...statusInfo,
    rawSelection,
    marketDetail,
    fixtureEvent,
    oddsUS,
  };
}

function extractBetMgmMoneyFields(text = "", status = "") {
  const source = String(text || "").replace(/\r/g, "\n");
  const lines = getLines(source);

  const joined = lines.join("\n");

  const stake =
    normalizeBetMgmMoneyValue(
      joined.match(/\bStake:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    normalizeBetMgmMoneyValue(
      joined.match(/\bRisk:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    "";

  let payout =
    normalizeBetMgmMoneyValue(
      joined.match(/\bTotal\s*payout:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    normalizeBetMgmMoneyValue(
      joined.match(/\bPayout:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    normalizeBetMgmMoneyValue(
      joined.match(/\bReturns?:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    "";

  let toWinDirect =
    normalizeBetMgmMoneyValue(
      joined.match(/\bTo\s*win:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    normalizeBetMgmMoneyValue(
      joined.match(/\bWin:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] || ""
    ) ||
    "";

  const statusLower = String(status || "").toLowerCase();

  if (statusLower === "lost") {
    payout = "0.00";
    toWinDirect = "0.00";
  }

  if (statusLower === "voided" && !payout) {
    payout = "0.00";
    toWinDirect = "0.00";
  }

  return {
    stake,
    payout,
    toWinDirect,
  };
}

export function parseBetMgmSlip({
  cleaned,
  originalText,
  sourceFileName = "",
  sportsbook = "BetMGM",
  shared,
}) {
  const {
    emptyParsed,
    cleanTextLine,
    getMatch,
    parsePlacedDate,
    inferEventDate,
    buildPlayerPropSelection,
    detectStatus,
    detectLive,
    extractBetId,
    enrichRow,
  } = shared;

  const stakeCount = (cleaned.match(/\bStake[: ]*\$/gi) || []).length;
  const payoutCount = (cleaned.match(/\b(Total Payout|Payout)[: ]*\$/gi) || []).length;
  const isMultiBetScreen = stakeCount > 1 || payoutCount > 1;

  const multiBetWarning = isMultiBetScreen
    ? "betmgm_multiple_bets_detected_parsed_top_only"
    : "";

  if (isMultiBetScreen) {
    cleaned = getBetMgmTopBetText(cleaned);
  }

  const betId = extractBetId(cleaned);
  const settled = parseBetMgmSettledReceipt(cleaned);
  const money = extractBetMgmMoneyFields(cleaned, settled.status);

  const stake = money.stake;
  const payout = money.payout;
  const toWinDirect = money.toWinDirect;

  let oddsUS = settled.oddsUS || "";
  let oddsSource = oddsUS ? "OCR" : "";

  if (!oddsUS && stake && payout && String(payout) !== "0.00") {
    const calc = americanOddsFromStakeAndReturn(stake, payout);
    if (calc) {
      oddsUS = calc;
      oddsSource = "Calculated";
    }
  }

  if (!oddsUS && stake && toWinDirect && String(toWinDirect) !== "0.00") {
    const calc = americanOddsFromStakeAndProfit(stake, toWinDirect);
    if (calc) {
      oddsUS = calc;
      oddsSource = "Calculated";
    }
  }

  let rawSelection = cleanTextLine(settled.rawSelection || "");
  let marketDetail = cleanTextLine(settled.marketDetail || "");
  let fixtureEvent = cleanTextLine(settled.fixtureEvent || "");

  if (!fixtureEvent) {
    fixtureEvent =
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s+at\s+[A-Za-z0-9 .&'()\/-]+)/i) ||
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s*@\s*[A-Za-z0-9 .&'()\/-]+)/i) ||
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s+vs\.?\s+[A-Za-z0-9 .&'()\/-]+)/i) ||
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s-\s[A-Za-z0-9 .&'()\/-]+)/i) ||
      "";
  }

  fixtureEvent = cleanTextLine(fixtureEvent);

  if (!looksLikeFixtureLine(fixtureEvent)) {
    fixtureEvent = "";
  }

  const placedInfo = parsePlacedDate(cleaned);
  const betDate = placedInfo.dateOnly || getDateFromSourceFileName(sourceFileName);
  const eventDate = inferEventDate(cleaned, placedInfo.dateObj);

  const status =
    settled.status ||
    (/accepted|open/i.test(cleaned) ? "Open" : detectStatus(cleaned, cleaned));

  const win =
    settled.win ||
    (status === "Won" ? "Y" : status === "Lost" ? "N" : "");

  const lowerTypeText = [rawSelection, marketDetail, cleaned].join(" ").toLowerCase();

  const isParlay =
    /\bparlay\b|\bsame game parlay\b|\bsgp\b/i.test(cleaned);

  const isFuture =
    /\bfutures?\b|\bmvp\b|\bdivision winner\b|\bconference winner\b|\bchampionship\b|\bto win the\b|\baward\b|\bseason wins\b/i.test(
      cleaned
    );

  const isPlayerProp =
    /\bpoints?\b|\brebounds?\b|\bassists?\b|\bthree pointers?\b|\bshots on goal\b|\bsaves?\b|\bgoalscorer\b|\bgoal scorer\b|\bdouble-double\b|\btriple-double\b|\bhome runs?\b|\brbis?\b|\bhits?\b|\bstrikeouts?\b|\bearned runs\b|\btotal bases?\b|\bsubmission\b|\bdecision\b|\bko\/tko\/dq\b/i.test(
      lowerTypeText
    );

  const isMoneyline = !isPlayerProp && /\bmoneyline\b/i.test(lowerTypeText);
  const isSpread = !isPlayerProp && /\bspread\b|\brun line\b|\bpuck line\b|\bgames spread\b/i.test(lowerTypeText);
  const isTotal = !isPlayerProp && /\btotal\b|\bover\b|\bunder\b/i.test(lowerTypeText);

  let betType = "straight";
  if (isParlay) betType = "parlay";
  else if (isFuture) betType = "futures";
  else if (isPlayerProp) betType = "player prop";
  else if (isMoneyline) betType = "moneyline";
  else if (isSpread) betType = "spread";
  else if (isTotal) betType = "total";

  let selection = isPlayerProp
    ? buildPlayerPropSelection(rawSelection, marketDetail)
    : rawSelection;

  selection = cleanTextLine(selection)
    .replace(/\s+[+-]?\d{1,5}\s*$/i, "")
    .replace(/\s+[Hh][Oo]\s*$/i, "")
    .replace(/\s+#\d+\s*$/i, "")
    .replace(/\s+\d{3,4}\s*$/i, "")
    .replace(/\s+\+\d+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const sportLeague = detectLeague({
    cleaned,
    marketDetail,
    fixtureEvent,
    selection,
    isParlay,
  });

  const bonusBet = /\bbonus bet\b|promotion used/i.test(cleaned) ? "Y" : "N";

  const toWin =
    status === "Lost"
      ? "0.00"
      : toWinDirect ||
        (() => {
          const wager = parseFloat((stake || "").replace(/,/g, ""));
          const pay = parseFloat((payout || "").replace(/,/g, ""));
          if (!Number.isNaN(wager) && !Number.isNaN(pay) && pay >= wager) {
            return (pay - wager).toFixed(2);
          }
          return "";
        })();

  const finalPayout = status === "Lost" ? "0.00" : payout;

  const oddsMissingReason = detectOddsMissingReason({
    oddsUS,
    stake,
    payout: finalPayout,
    toWin,
    screenType: "receipt",
  });

  const additionalWarnings = [];
  if (multiBetWarning) additionalWarnings.push(multiBetWarning);
  if (!oddsUS) additionalWarnings.push("betmgm_odds_missing");
  if (!finalPayout && !toWin) additionalWarnings.push("betmgm_payout_missing");
  if (!betDate) additionalWarnings.push("no_bet_date_detected");
  if (!sportLeague) additionalWarnings.push("no_league_detected");
  if (!selection) additionalWarnings.push("betmgm_selection_missing");
  if (!fixtureEvent && betType !== "futures") additionalWarnings.push("betmgm_event_missing");

  const parseWarning = additionalWarnings.join(" | ");

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
    payout: finalPayout,
    toWin,
    rawPlacedDate: placedInfo.raw,
    status,
    parseWarning,
    sourceFileName,
    sourceText: originalText,
    reviewNotes: "",
    betId,
  });
}
