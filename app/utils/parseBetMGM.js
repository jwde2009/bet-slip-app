import { detectLeague } from "./detectLeague";
import {
  americanOddsFromStakeAndProfit,
  americanOddsFromStakeAndReturn,
  detectOddsMissingReason,
} from "./oddsHelpers";

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

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const betId = extractBetId(cleaned);

  const stake =
    getMatch(cleaned, /\bStake\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(cleaned, /\bRisk\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    "";

  const payout =
    getMatch(cleaned, /\bTotal\s*payout\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(cleaned, /\bReturns?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    "";

  const toWinDirect =
    getMatch(cleaned, /\bTo\s*win\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(cleaned, /\bWin\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    "";

  let oddsUS = "";
  let oddsSource = "";

  if (stake && payout) {
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

  const acceptedIndex = lines.findIndex((line) =>
    /your bet has been accepted|good luck/i.test(line)
  );

  const typeIndex = lines.findIndex((line) =>
    /straights?\s*\(\d+\)|single\s*\(\d+\)|parlay|same game parlay|sgp/i.test(line)
  );

  const eventIndex = lines.findIndex((line) =>
    /\s@\s|\sat\s|\svs\.?\s/i.test(line)
  );

  const ignoredLine = (line) =>
    !line ||
    /your bet has been accepted|good luck|promotion used|odds boost|cash out|edit bet|max payout|share/i.test(line) ||
    /^stake\b/i.test(line) ||
    /^risk\b/i.test(line) ||
    /^total payout\b/i.test(line) ||
    /^returns?\b/i.test(line) ||
    /^to win\b/i.test(line) ||
    /^win\b/i.test(line);

  let rawSelection = "";
  let marketDetail = "";
  let fixtureEvent = "";

  if (eventIndex !== -1) {
    fixtureEvent = cleanTextLine(lines[eventIndex]);

    const candidates = lines
      .slice(
        Math.max(
          0,
          (typeIndex !== -1 ? typeIndex : acceptedIndex !== -1 ? acceptedIndex : 0) + 1
        ),
        eventIndex
      )
      .map(cleanTextLine)
      .filter((line) => !ignoredLine(line));

    if (candidates.length >= 1) rawSelection = candidates[0];
    if (candidates.length >= 2) marketDetail = candidates[1];

    if (!marketDetail && candidates.length >= 3) {
      marketDetail = candidates[candidates.length - 1];
    }
  }

  if (!rawSelection) {
    const candidateLines = lines
      .map(cleanTextLine)
      .filter((line) => !ignoredLine(line));

    rawSelection =
      candidateLines.find((line) => !/\s@\s|\sat\s|\svs\.?\s/i.test(line)) || "";
  }

  if (!fixtureEvent) {
    fixtureEvent =
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s+at\s+[A-Za-z0-9 .&'()\/-]+)/i) ||
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s*@\s*[A-Za-z0-9 .&'()\/-]+)/i) ||
      getMatch(cleaned, /([A-Za-z0-9 .&'()\/-]+\s+vs\.?\s+[A-Za-z0-9 .&'()\/-]+)/i) ||
      "";
  }

  fixtureEvent = cleanTextLine(fixtureEvent);

  const placedInfo = parsePlacedDate(cleaned);
  const betDate = placedInfo.dateOnly;
  const eventDate = inferEventDate(cleaned, placedInfo.dateObj);

  const lowerTypeText = [rawSelection, marketDetail, cleaned].join(" ").toLowerCase();

  const isParlay =
    /\bparlay\b|\bsame game parlay\b|\bsgp\b/i.test(cleaned);

  const isFuture =
    /\bfutures?\b|\bmvp\b|\bdivision winner\b|\bconference winner\b|\bchampionship\b|\bto win the\b|\baward\b|\bseason wins\b/i.test(
      cleaned
    );

  const isPlayerProp =
    /\bpoints?\b|\brebounds?\b|\bassists?\b|\bthree pointers?\b|\bshots on goal\b|\bgoalscorer\b|\bdouble-double\b|\btriple-double\b|\bhome runs?\b|\brbis?\b|\bhits?\b|\bstrikeouts?\b|\bearned runs\b|\bsubmission\b|\bdecision\b|\bko\/tko\/dq\b/i.test(
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
    .replace(/\s+[+-]\d{2,5}\s*$/i, "")
    .trim();

  const sportLeague = detectLeague({
    cleaned,
    marketDetail,
    fixtureEvent,
    selection,
    isParlay,
  });

  const status = /accepted|open/i.test(cleaned) ? "Open" : detectStatus(cleaned, cleaned);
  const win = status === "Won" ? "Y" : status === "Lost" ? "N" : "";
  const bonusBet = /\bbonus bet\b|promotion used/i.test(cleaned) ? "Y" : "N";

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

  const oddsMissingReason = detectOddsMissingReason({
    oddsUS,
    stake,
    payout,
    toWin,
    screenType: "receipt",
  });

  const additionalWarnings = [];
  if (!oddsUS) additionalWarnings.push("betmgm_odds_missing");
  if (!payout && !toWin) additionalWarnings.push("betmgm_payout_missing");
  if (!betDate) additionalWarnings.push("no_bet_date_detected");
  if (!sportLeague) additionalWarnings.push("no_league_detected");
  if (!selection) additionalWarnings.push("betmgm_selection_missing");
  if (!fixtureEvent) additionalWarnings.push("betmgm_event_missing");

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
    payout,
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