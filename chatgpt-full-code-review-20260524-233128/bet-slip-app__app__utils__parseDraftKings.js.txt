import { detectLeague } from "./detectLeague";
import {
  americanOddsFromStakeAndProfit,
  detectOddsMissingReason,
  extractBestOdds,
  extractPayouts,
} from "./oddsHelpers";

export function parseDraftKingsLikeSlip({
  cleaned,
  originalText,
  sourceFileName = "",
  forcedSportsbook = "",
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
    classifyScreenType,
    extractReceiptWindow,
    extractParlayInfo,
    detectSportsbook,
    enrichRow,
  } = shared;

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const screenType = classifyScreenType(cleaned);
  const sportsbook = forcedSportsbook || detectSportsbook(cleaned);
  const betId = extractBetId(cleaned);

  if (screenType === "active_bet_slip") {
    return enrichRow({
      ...emptyParsed,
      bookmaker: sportsbook,
      betId,
      parseWarning: "Unsupported screen type: active bet slip, not a receipt.",
      sourceFileName,
      sourceText: originalText,
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
    sourceText: originalText,
    reviewNotes: "",
    betId,
  });
}