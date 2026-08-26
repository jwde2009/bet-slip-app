
import { PARSER_REGISTRY } from "./parserRegistry";
import { canonicalizeTeamsInText } from "./canonicalTeamNames";
import { canonicalizeFixture, getCanonicalFixtureKey } from "./canonicalFixture";
import { canonicalizeSelectionFields } from "./canonicalSelection";
import { detectLeague } from "./detectLeague";
import {
  cleanTextLine,
  normalizeOcrText,
  formatDateMMDDYYYY,
  normalizeDateString,
  nextWeekdayFromDate,
  getMatch,
  parsePlacedDate,
  parseMonthDayEventDate,
  inferEventDate,
  detectSportsbook,
  looksLikeFanDuelText,
  detectStatus,
  detectLive,
  extractBetId,
  classifyScreenType,
  extractReceiptWindow,
} from "./parserShared";

import {
  singularizeStat,
  buildPlayerPropSelection,
  normalizeTeamNames,
  extractParlayInfo,
} from "./parserSelectionHelpers";
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
    tipper: "",
    betId: "",
    accountOwner: "Me",
    betSourceTag: "",
    impliedProbability: "",
    confidenceFlag: "",
    likelyParserIssue: "N",
    reviewLater: "N",
    duplicateIgnored: "N",
    reviewResolved: "N",
    canonicalBookmaker: "",
    canonicalFixture: "",
    canonicalFixtureKey: "",
    canonicalSelection: "",
    canonicalBetType: "",
    canonicalMarket: "",
    canonicalSide: "",
    canonicalLine: "",
    canonicalPlayer: "",
    canonicalTeam: "",
    canonicalPeriod: "",
    canonicalMarketFamily: "",
    canonicalSubjectType: "",
    canonicalResultTarget: "",
    canonicalSelectionKey: "",
    canonicalHedgeKey: "",
    canonicalOppositeKey: "",
    participantA: "",
    participantB: "",
    participantANormalized: "",
    participantBNormalized: "",
    canonicalSubject: "",
    canonicalMarketContext: "",
    contextReviewed: "N",
    playerLastName: "",
    propMarket: "",
    betDateInferred: "N",
    betDateNeedsConfirm: "N",
    betDateConfirmed: "N",
    reviewPassStatus: ""};

function normalizeSportLeagueValue(value = "") {
  const text = String(value || "").trim();

  if (!text) return "";

  if (/^mlb$/i.test(text)) return "Baseball";
  if (/^baseball$/i.test(text)) return "Baseball";

  if (/^nba$/i.test(text)) return "NBA";
  if (/^wnba$/i.test(text)) return "WNBA";
  if (/^nhl$/i.test(text)) return "NHL";
  if (/^ncaam$/i.test(text)) return "NCAAM";
  if (/^ncaaw$/i.test(text)) return "NCAAW";
  if (/^nfl$/i.test(text)) return "NFL";
  if (/^mma$/i.test(text)) return "MMA";
  if (/^soccer$/i.test(text)) return "Soccer";
  if (/^tennis$/i.test(text)) return "Tennis";
  if (/^multi$/i.test(text)) return "Multi";

  return text;
}

function cleanLeadingOcrTokens(value = "") {
  let text = String(value || "").replace(/\s+/g, " ").trim();

  // Drop noisy short OCR prefixes:
  // "S&S Shohei", "1p Andre", "a CLE", "Zc CLE", "fg Alex", "Lo Over", "Ww Kevin", "Qe Paul"
  text = text.replace(
    /^[^A-Za-z0-9]*[A-Za-z0-9&.,:;!?)'"`-]{1,4}\s+(?=[A-Z][a-z]|[A-Z][A-Za-z]+\s+[A-Z][A-Za-z]|Over\b|Under\b|Yes\b|No\b|Draw\b|\d\+\b)/,
    ""
  );

  // Drop leading OCR score/index junk:
  // "43 1+", "5 Michael Harris", "7 Cody Bellinger", "2, Michael Harris"
  text = text.replace(/^\d+[,.]?\s+(?=\d\+\b|[A-Z][a-z])/, "");

  return text.replace(/\s+/g, " ").trim();
}

function normalizeOcrLineNumber(value = "") {
  return String(value || "")
    .replace(/Under\s*3s5/gi, "Under 3.5")
    .replace(/Under\s*3\.s5/gi, "Under 3.5")
    .replace(/Under\s*6s5/gi, "Under 6.5")
    .replace(/Under\s*(\d+)(?=\d)/gi, "Under $1")
    .replace(/Over\s*(\d+)(?=\d)/gi, "Over $1")
    .replace(/\b(Over|Under)(\d+(?:\.\d+)?)\b/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPlusMilestone(value = "") {
  const m = String(value || "").match(/(?:^|\s)(\d+)\+(?:\s|$)/);
  return m ? m[1] : "";
}

function extractPlayerAndStatFromMarket(marketDetail = "") {
  let market = normalizeOcrLineNumber(cleanLeadingOcrTokens(marketDetail))
    .replace(/[|:]+/g, " ")
    .replace(/\bO\/U\b/gi, "")
    .replace(/\bi\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /^(.*?)\s+(To Hit a Home Run|Hit a Home Run|Anytime Home Run|Anytime Homer)\b/i,
    /^(.*?)\s+(Anytime Goalscorer|Anytime Goal Scorer|Goalscorer|To Score a Goal|Score a Goal)\b/i,
    /^(.*?)\s+(Assists|Rebounds|Points|Total Bases|Strikeouts(?: Thrown)?|Home Runs?|RBIs?|Hits|Shots on Goal|Saves|Goals|Double-Double|Triple-Double)\b/i,
  ];

  for (const pattern of patterns) {
    const m = market.match(pattern);
    if (!m) continue;

    let player = cleanLeadingOcrTokens(m[1] || "")
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/^\d+\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

    const stat = String(m[2] || "").replace(/\s+/g, " ").trim();

    if (player && stat) {
      return { player, stat };
    }
  }

  return { player: "", stat: "" };
}

function cleanAnytimePlayerCandidate(value = "") {
  return cleanLeadingOcrTokens(value)
    .replace(/\b(?:anytime\s+goal\s*scorer|anytime\s+goalscorer|goalscorer|goal\s*scorer|to\s+score\s+a\s+goal|score\s+a\s+goal)\b.*$/i, " ")
    .replace(/\b(?:anytime\s+home\s+run|anytime\s+homer|to\s+hit\s+a\s+home\s+run|hit\s+a\s+home\s+run)\b.*$/i, " ")
    .replace(/\b(?:yes|over|under)\b/gi, " ")
    .replace(/\b0?\.5\b/g, " ")
    .replace(/[+-]\d{2,5}\b/g, " ")
    .replace(/[^A-Za-z.'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAnytimeZeroHalfSelection(value = "", marketDetail = "") {
  const selectionText = normalizeOcrLineNumber(cleanLeadingOcrTokens(value));
  const marketText = String(marketDetail || "").replace(/\s+/g, " ").trim();
  const combined = `${selectionText} ${marketText}`.replace(/\s+/g, " ").trim();

  const isAnytimeGoal =
    /\b(?:anytime\s+goal\s*scorer|anytime\s+goalscorer|goalscorer|goal\s*scorer|to\s+score\s+a\s+goal|score\s+a\s+goal)\b/i.test(combined);
  const isAnytimeHomeRun =
    /\b(?:anytime\s+home\s+run|anytime\s+homer|to\s+hit\s+a\s+home\s+run|hit\s+a\s+home\s+run)\b/i.test(combined) ||
    (/\b(?:home run|homer|hr)\b/i.test(combined) && /\byes\b/i.test(combined));

  if (!isAnytimeGoal && !isAnytimeHomeRun) return "";

  const marketParts = extractPlayerAndStatFromMarket(marketText);
  let player = cleanAnytimePlayerCandidate(marketParts.player || "");

  if (!player) {
    player = cleanAnytimePlayerCandidate(selectionText);
  }

  // Some books provide only the player in Selection and the binary market name
  // in Market Detail. Preserve that player rather than keeping sportsbook
  // wording such as "Anytime Goalscorer" or "To Hit a Home Run".
  if (!player && selectionText && !/\b(?:anytime|goal|home run|homer|yes|no|over|under)\b/i.test(selectionText)) {
    player = cleanAnytimePlayerCandidate(selectionText);
  }

  if (!player) return "";

  return isAnytimeGoal
    ? `${player} Over 0.5 Goals`
    : `${player} Over 0.5 Home Runs`;
}

function cleanSelectionDisplay(value = "", marketDetail = "") {
  let text = normalizeOcrLineNumber(cleanLeadingOcrTokens(value));
  const market = String(marketDetail || "").replace(/\s+/g, " ").trim();
  const { player, stat } = extractPlayerAndStatFromMarket(market);
  const anytimeZeroHalf = normalizeAnytimeZeroHalfSelection(text, market);

  if (anytimeZeroHalf) return anytimeZeroHalf;

  const sideLine = text.match(/\b(Over|Under)\s*(\d+(?:\.\d+)?)/i);

  if (player && stat && sideLine) {
    return `${player} ${sideLine[1]} ${sideLine[2]} ${stat}`.trim();
  }

  if (player && /Home Runs?/i.test(stat) && extractPlusMilestone(text)) {
    return `${player} ${extractPlusMilestone(text)}+ Home Runs`;
  }

  if (player && /Strikeouts/i.test(stat) && extractPlusMilestone(text)) {
    return `${player} ${extractPlusMilestone(text)}+ Strikeouts`;
  }

  // If selection OCR only found "1" or "1+" but market has the player/stat,
  // use marketDetail to rebuild the home-run milestone.
  if (player && /Home Runs?/i.test(stat) && /^(?:\d+[,.]?\s*)?1\+?$/.test(text)) {
    return `${player} 1+ Home Runs`;
  }

  if (player && /Anytime Goal/i.test(stat)) {
    return `${player} Over 0.5 Goals`;
  }

  if (player && /Double-Double/i.test(stat) && /\bYes\b/i.test(text)) {
    return `${player} Yes Double-Double`;
  }

  if (player && /Triple-Double/i.test(stat) && /\bYes\b/i.test(text)) {
    return `${player} Yes Triple-Double`;
  }

  // Generic DraftKings home-run OCR:
  // "1+ 7 Cody Bellinger Home Runs" -> "Cody Bellinger 1+ Home Runs"
  const homeRunInline = text.match(/^1\+\s+(.+?)\s+Home Runs?$/i);
  if (homeRunInline) {
    const tokens = String(homeRunInline[1] || "")
      .split(/\s+/)
      .filter(Boolean);

    while (
      tokens.length &&
      (
        /^\d+$/.test(tokens[0]) ||
        /^[+-]?\d{2,5}$/.test(tokens[0]) ||
        /^(ab|a|al|ml|nl|to|hit)$/i.test(tokens[0])
      )
    ) {
      tokens.shift();
    }

    const playerName = tokens.join(" ").trim();

    if (playerName.split(/\s+/).length >= 2) {
      return `${playerName} 1+ Home Runs`;
    }
  }

  text = text
    .replace(/^\s*[A-Za-z]{1,3}\s+(?=CLE\b|BOS\b|DET\b|MEM\b|OKC\b|NY\b|LA\b|North Carolina\b)/, "")
    .replace(/^\s*[#&~@\xc2\xae\xc2\xa9\xc2\xbb>"'`]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function normalizeScoreboardTeamName(value = "") {
  let text = String(value || "")
    .replace(/[|()[\]{}<>]/g, " ")
    .replace(/[\xc2\xae\xc2\xa9@~*]+/g, " ")
    .replace(/[.]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove leading seeds/ranks, but keep sports team abbreviations like ARI / CHI / EDM.
  text = text.replace(/^\d+\s+/, "").trim();

  // Remove trailing scoreboard columns/scores.
  text = text
    .replace(/\s+(?:\d+\s*){2,}$/g, "")
    .replace(/\s+\d+$/g, "")
    .trim();

  // Clean OCR fragments without trying to know every team.
  // These are OCR-shape fixes, not a team database.
  text = text
    .replace(/\bDiamond\b$/i, "Diamondbacks")
    .replace(/\bDback\b$/i, "Diamondbacks")
    .replace(/\bDbacks\b$/i, "Diamondbacks")
    .replace(/\bNvv?yankees\b/i, "NYY Yankees")
    .replace(/\bepM\s+oilers\b/i, "EDM Oilers")
    .replace(/\bcHicubs\b/i, "CHI Cubs")
    .replace(/\bARIDiamondbacks\b/i, "ARI Diamondbacks")
    .replace(/\bCHICubs\b/i, "CHI Cubs")
    .replace(/\s+/g, " ")
    .trim();

  // Remove remaining obvious OCR leading junk if a real word follows,
  // but do NOT remove all-caps sports abbreviations.
  text = text.replace(/^[^A-Za-z0-9]*[a-z0-9]{1,3}\s+(?=[A-Z][a-z])/, "").trim();

  // Reject non-team lines.
  if (!/[A-Za-z]{3,}/.test(text)) return "";

  if (
    /^(Final|Wager|Paid|Share|Placed|Bet ID|Market|The reward|Bonus|Live|My Bets|FOOTER OCR)$/i.test(text)
  ) {
    return "";
  }

  if (/\b(Wager|Paid|Share|Placed|Bet ID|Market|Boost|Payout|Reward)\b/i.test(text)) {
    return "";
  }

  // Reject lines that are mostly numeric.
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const digits = (text.match(/\d/g) || []).length;
  if (digits > letters) return "";

  return text;
}


function extractFixtureFromScoreboardText(sourceText = "", betType = "") {
  const text = String(sourceText || "")
    .split(/---\s*(FOOTER OCR|DATE OCR)\s*---/i)[0]
    .replace(/\r/g, "\n");  
    
    const lines = text
    .split("\n")
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!lines.length) return "";

  // Avoid assigning a single scoreboard fixture to parlays with multiple legs.
  if (/parlay/i.test(String(betType || ""))) {
    return "";
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const isScoreboardHeader =
      /^Final\b/i.test(line) ||
      /^Live\b/i.test(line) ||
      /\b(Q1|Q2|Q3|Q4|H1|H2|P1|P2|P3|OT|HT|T)\b.*\bT\b/i.test(line);

    if (!isScoreboardHeader) continue;

    const candidates = [];

    for (let j = i + 1; j < Math.min(lines.length, i + 10); j += 1) {
      const nextLine = lines[j];

      if (/^--- FOOTER OCR ---$/i.test(nextLine)) break;
      if (/^<\s*Share/i.test(nextLine)) break;
      if (/^Bet ID\b/i.test(nextLine)) break;
      if (/^Placed:/i.test(nextLine)) break;

      const team = normalizeScoreboardTeamName(nextLine);

      if (!team) continue;

      // Avoid duplicate accidental reads.
      if (!candidates.includes(team)) {
        candidates.push(team);
      }

      if (candidates.length >= 2) {
        return `${candidates[0]} @ ${candidates[1]}`;
      }
    }
  }

  return "";
}


function cleanFixtureDisplay(value = "") {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (/---\s*(FOOTER OCR|DATE OCR)\s*---/i.test(text)) return "";


  if (/^@+$/.test(text)) return "";
  if (/^(share|cash out|betslip|my bets)\b/i.test(text)) return "";

  const alphaCount = (text.match(/[A-Za-z]/g) || []).length;
  if (alphaCount < 4) return "";

  const hasFixtureSeparator =
    /\s@\s/.test(text) ||
    /\bvs\.?\b/i.test(text) ||
    /\bv\.?\b/i.test(text) ||
    /\bat\b/i.test(text);

  if (hasFixtureSeparator) {
    const parts = text
      .split(/\s+@\s+|\s+vs\.?\s+|\s+v\.?\s+|\s+at\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const hasBadSide = parts.some((part) => !/[A-Za-z]{2,}/.test(part));
      if (hasBadSide) return "";
    }
  }

  // Blank common OCR junk fixtures like "57 wl - @" or "00 al T @"
  if (/@/.test(text) && !/[A-Za-z]{3,}.*@.*[A-Za-z]{3,}/.test(text)) {
    return "";
  }

  return text;
}

function isWeakGenericLeagueSelection(selection = "", marketDetail = "", betType = "") {
  const text = `${selection} ${marketDetail}`.toLowerCase().trim();

  if (!text) return true;

  if (/^(over|under)\s+\d+(\.\d+)?$/.test(String(selection || "").toLowerCase().trim())) {
    return true;
  }

  if (/^draw$/i.test(String(selection || "").trim())) return false;

  if (/^\d+\s+pick parlay$/i.test(String(selection || "").trim())) return false;

  return false;
}

function inferBasketballLeagueFromCore({
  selection = "",
  marketDetail = "",
  fixtureEvent = "",
  participantA = "",
  participantB = "",
  participantANormalized = "",
  participantBNormalized = "",
  betType = "",
} = {}) {
  const text = [
    selection,
    marketDetail,
    fixtureEvent,
    participantA,
    participantB,
    participantANormalized,
    participantBNormalized,
    betType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return "";

  const hasNbaTeam =
    /\bcavaliers\b|\bcavs\b|\bcle\b|\braptors\b|\btor\b|\bpistons\b|\bdet\b|\bknicks\b|\bnyk\b|\bspurs\b|\bsas\b|\bthunder\b|\bokc\b|\blakers\b|\blal\b|\btimberwolves\b|\bwolves\b|\bmin\b|\bceltics\b|\bbos\b|\bbulls\b|\bchi\b|\bbucks\b|\bmil\b|\bclippers\b|\blac\b|\bpacers\b|\bind\b|\brockets\b|\bhou\b|\btrail blazers\b|\bblazers\b|\bpor\b|\bwarriors\b|\bgsw\b|\bkings\b|\bsac\b|\bsuns\b|\bphx\b|\bmavericks\b|\bmavs\b|\bdal\b|\bnuggets\b|\bden\b|\bgrizzlies\b|\bmem\b|\bpelicans\b|\bnop\b|\bjazz\b|\buta\b|\bheat\b|\bmia\b|\bnets\b|\bbkn\b|\bhornets\b|\bcha\b|\bmagic\b|\borl\b|\bwizards\b|\bwas\b|\b76ers\b|\bsixers\b|\bphi\b/.test(text);

  const hasBasketballMarket =
    /\bpoints\b|\brebounds\b|\bassists\b|\bpra\b|\bpts\b|\brebs\b|\basts\b|\bdouble-double\b|\btriple-double\b|\bthrees\b|\bthree pointers\b|\b3-pointers\b/.test(text);

  if (hasNbaTeam || hasBasketballMarket) return "NBA";

  return "";
}

function shouldClearSuspiciousParsedLeague({ parsedLeague, coreDetectedLeague, selection, marketDetail, fixtureEvent, betType }) {
  if (coreDetectedLeague) return false;
  if (!parsedLeague) return false;
  if (fixtureEvent) return false;

  return isWeakGenericLeagueSelection(selection, marketDetail, betType);
}

function extractTopVisibleOutcomeStatus(sourceText = "") {
  const lines = String(sourceText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    // Ignore navigation/header/rules lines that can contain misleading words like Won.
    if (
      /\b(My Bets|Horse Bets|Betting Groups|My Pools|Live Settled|Live Won|Live Los|THE CROWN IS YOURS|DRAFTKINGS|BRAFTKINGS)\b/i.test(line) ||
      /\b(will be settled as won|will be settled as lost|all other selections will be voided)\b/i.test(line)
    ) {
      continue;
    }

    // Prefer result-bearing selection lines.
    const looksLikeSelectionResult =
      /[|]/.test(line) ||
      /[+-]\d{3,5}/.test(line) ||
      /\bVoid(?:ed)?\b/i.test(line);

    if (!looksLikeSelectionResult) continue;

    if (/\bCashed Out\b/i.test(line)) return "Cashed Out";
    if (/\bVoid(?:ed)?\b/i.test(line)) return "Voided";
    if (/\bLos(?:t|!|:)?\b/i.test(line)) return "Lost";
    if (/\bLost\b/i.test(line)) return "Lost";
    if (/\bWon\b/i.test(line)) return "Won";
    if (/\bOpen\b/i.test(line)) return "Open";
  }

  return "";
}

function extractTopVisibleDraftKingsResultFields(sourceText = "") {
  const lines = String(sourceText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let result = {
    selection: "",
    oddsUS: "",
    status: "",
    stake: "",
    betDate: "",
    rawPlacedDate: "",
  };

  for (const line of lines) {
    if (
      /\b(My Bets|Horse Bets|Betting Groups|My Pools|Live Settled|Live Won|Live Los|THE CROWN IS YOURS|DRAFTKINGS|BRAFTKINGS)\b/i.test(line) ||
      /\b(will be settled as won|will be settled as lost|all other selections will be voided)\b/i.test(line)
    ) {
      continue;
    }

    const hasPipeSelectionShape = /\|/.test(line);
    const hasMilestoneSelectionShape = /\b\d+\+\b/.test(line) && /[+-]\d{3,5}\b|Even\b/i.test(line);
    const hasResultShape = /\b(Won|Lost|Los!|Los:|Los|loc|l0c|Void(?:ed)?|Cashed Out|Open)\b/i.test(line);
    const hasOddsShape = /[+-]\d{3,5}\b|Even\b/i.test(line);

    if ((!hasPipeSelectionShape && !hasMilestoneSelectionShape) || (!hasResultShape && !hasOddsShape)) continue;

    const left = hasPipeSelectionShape
      ? line.split("|")[0] || ""
      : line.replace(/[+-]\d{3,5}\b.*$/i, "");

    const selection = cleanLeadingOcrTokens(left)
      .replace(/^[^A-Za-z0-9]+/, "")
      .trim();

    const oddsTokens = line.match(/[+-]\d{3,5}\b|Even\b/gi) || [];
    let oddsUS = oddsTokens.length ? oddsTokens[oddsTokens.length - 1] : "";
    if (/^even$/i.test(oddsUS)) oddsUS = "+100";

    let status = "";
    if (/\bCashed Out\b/i.test(line)) status = "Cashed Out";
    else if (/\bVoid(?:ed)?\b/i.test(line)) status = "Voided";
    else if (/\b(loc|l0c)\b/i.test(line)) status = "Lost";
    else if (/\bLos(?:t|!|:)?\b/i.test(line)) status = "Lost";
    else if (/\bLost\b/i.test(line)) status = "Lost";
    else if (/\bWon\b/i.test(line)) status = "Won";
    else if (/\bOpen\b/i.test(line)) status = "Open";

    if (selection || oddsUS || status) {
      result = {
        ...result,
        selection,
        oddsUS,
        status,
      };
      break;
    }
  }

  const stake =
    String(sourceText || "").match(/\bWager:\s*\$?([\d,]+(?:\.\d{1,2})?)/i)?.[1] ||
    String(sourceText || "").match(/\$([\d,]+(?:\.\d{1,2})?)\s+BONUS BET\b/i)?.[1] ||
    "";

  if (stake) {
    result.stake = String(stake).replace(/,/g, "");
  }

  const placed = parsePlacedDate(sourceText);
  if (placed?.dateOnly) {
    result.betDate = placed.dateOnly;
    result.rawPlacedDate = placed.raw || "";
  }

  return result;
}

function applySettlementMoneySafety(row = {}) {
  const bookmaker = String(row.bookmaker || "").toLowerCase();

  const dkFields =
    bookmaker.includes("draftkings") || bookmaker.includes("dk")
      ? extractTopVisibleDraftKingsResultFields(row.sourceText || "")
      : {};

  if (dkFields.selection && !row.selection) {
    row = {
      ...row,
      selection: dkFields.selection,
    };
  }

  if (dkFields.oddsUS && !row.oddsUS) {
    row = {
      ...row,
      oddsUS: dkFields.oddsUS,
      oddsSource: row.oddsSource || "OCR",
    };
  }

  if (dkFields.stake && !row.stake) {
    row = {
      ...row,
      stake: dkFields.stake,
    };
  }

  if (dkFields.betDate && !row.betDate) {
    row = {
      ...row,
      betDate: dkFields.betDate,
      eventDate: row.eventDate || dkFields.betDate,
      rawPlacedDate: row.rawPlacedDate || dkFields.rawPlacedDate,
    };
  }

  if (dkFields.status) {
    row = {
      ...row,
      status: dkFields.status,
      win:
        dkFields.status === "Won"
          ? "Y"
          : dkFields.status === "Lost"
          ? "N"
          : ["Voided", "Void", "Push", "Cashed Out", "Open"].includes(dkFields.status)
          ? ""
          : row.win || "",
    };
  }

  const status = String(row.status || "").trim().toLowerCase();

  // If a settled bet is explicitly lost, payout/toWin should be zero.
  // This prevents lower visible cards from leaking their payout into the top lost bet.
  if (status === "lost") {
    return {
      ...row,
      payout: "0.00",
      toWin: "0.00",
    };
  }

  // Voided/pushed bets should not be marked win/loss.
  if (status === "voided" || status === "void" || status === "push") {
    return {
      ...row,
      win: "",
      payout: row.payout || "0.00",
      toWin: row.toWin || "0.00",
    };
  }

  return row;
}

function fillMissingDatesFromSourceText(row = {}) {
  if (row.betDate || !row.sourceText) return row;

  const placed = parsePlacedDate(row.sourceText);

  if (!placed?.dateOnly) return row;

  return {
    ...row,
    betDate: placed.dateOnly,
    eventDate: row.eventDate || placed.dateOnly,
    rawPlacedDate: row.rawPlacedDate || placed.raw || "",
  };
}

function cleanStaleParseWarnings(row = {}) {
  const warnings = String(row.parseWarning || "")
    .split("|")
    .map((warning) => warning.trim())
    .filter(Boolean);

  if (!warnings.length) return row;

  const kept = warnings.filter((warning) => {
    const lower = warning.toLowerCase();

    if (lower.includes("stake_missing") && row.stake) return false;
    if (lower.includes("selection_missing") && row.selection) return false;
    if (lower.includes("fixture_missing") && row.fixtureEvent) return false;
    if (lower.includes("odds_missing") && row.oddsUS) return false;
    if (lower.includes("receipt_detected_but_odds_missing") && row.oddsUS) return false;
    if (lower.includes("receipt_detected_but_payout_missing") && (row.payout || row.toWin)) return false;
    if (lower.includes("payout_missing") && (row.payout || row.toWin)) return false;
    if (lower.includes("no_bet_date_detected") && row.betDate) return false;
    if (lower.includes("no_league_detected") && row.sportLeague) return false;

    return true;
  });

  return {
    ...row,
    parseWarning: kept.join(" | "),
  };
}

function buildManualParticipantFixture(row = {}) {
  const a =
    String(row.participantANormalized || "").trim() ||
    String(row.participantA || "").trim();

  const b =
    String(row.participantBNormalized || "").trim() ||
    String(row.participantB || "").trim();

  if (a && b) return `${a} @ ${b}`;
  return "";
}

function computeConfidenceFlag(row) {
  let score = 0;

  // positive signals
  if (row.selection) score += 3;
  if (row.fixtureEvent) score += 2;
  if (row.betType) score += 1;
  if (row.sportLeague) score += 1;
  if (row.oddsUS) score += 2;

  // negative signals
  if (!row.selection) score -= 4;
  if (!row.fixtureEvent) score -= 3;
  if (!row.sportLeague) score -= 2;

  if (row.parseWarning && String(row.parseWarning).trim()) score -= 2;

  // noisy OCR / UI junk
  const badText = /today|share|betslip|my bets|quick deposit|reward available/i;

  if (badText.test(String(row.selection || ""))) score -= 3;
  if (badText.test(String(row.fixtureEvent || ""))) score -= 3;

  // weak / short values
  if (String(row.selection || "").length < 4) score -= 2;

  // classification
  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

function computeLikelyParserIssue(row) {
  const bookmaker = String(row.bookmaker || "").toLowerCase();

  if (!row.selection) return "Y";
  if (!row.fixtureEvent && !bookmaker.includes("kalshi")) return "Y";
  if (!row.sportLeague) return "Y";
  if (!row.oddsUS && !bookmaker.includes("kalshi")) return "Y";
  if (/today|share|betslip|my bets|quick deposit|reward available/i.test(String(row.selection || ""))) return "Y";
  if (/today|share|betslip|my bets|quick deposit|reward available/i.test(String(row.fixtureEvent || ""))) return "Y";
  if (String(row.parseWarning || "").trim()) return "Y";
  return "N";
}

function computeReviewPriority(row) {
  let score = 0;
  const warnings = String(row.parseWarning || "").trim();

  if (row.likelyParserIssue === "Y") score += 5;
  if (row.confidenceFlag === "Low") score += 4;
  if (row.confidenceFlag === "Medium") score += 2;

  if (!row.selection) score += 4;
  if (!row.fixtureEvent) score += 3;
  if (!row.oddsUS) score += 3;
  if (!row.sportLeague) score += 2;

  if (warnings) score += 2;
  if (row.duplicateWarning) score += 2;

  if (row.hedgeGroupId) score += 4;
if (row.guaranteedProfit === "Y" || row.guaranteedProfit === true) score += 6;

  if (row.reviewed === "Y" || row.reviewStatus === "Reviewed") score -= 4;
  if (row.archived === "Y") score -= 10;

  return score;
}

function computeReviewBucket(row) {
  const score = Number(row.reviewPriority || 0);

  if (score >= 10) return "Critical";
  if (score >= 6) return "High";
  if (score >= 3) return "Standard";
  return "Later";
}

function computeReviewReasons(row) {
  const reasons = [];

  if (row.likelyParserIssue === "Y") reasons.push("Parser issue");
  if (row.confidenceFlag === "Low") reasons.push("Low confidence");
  else if (row.confidenceFlag === "Medium") reasons.push("Medium confidence");

  if (!row.selection) reasons.push("Missing selection");
  if (!row.fixtureEvent) reasons.push("Missing fixture");
  if (!row.oddsUS) reasons.push("Missing odds");
  if (!row.sportLeague) reasons.push("Missing league");

  if (row.duplicateWarning) reasons.push("Possible duplicate");
  if (row.hedgeGroupId) reasons.push("In hedge group");
  if (row.guaranteedProfit === "Y" || row.guaranteedProfit === true) reasons.push("Guaranteed profit");

  return reasons.slice(0, 4).join(" \xc3\xa2\xe2\u201a\xac\xc2\xa2 ");
}

export function enrichRow(row) {
  row = applySettlementMoneySafety(row);
  row = fillMissingDatesFromSourceText(row);

  const cleanedFixture = cleanFixtureDisplay(row.fixtureEvent);
  const scoreboardFixture =
    cleanedFixture ? "" : extractFixtureFromScoreboardText(row.sourceText || "", row.betType || "");
  const cleanedSelection = cleanSelectionDisplay(row.selection, row.marketDetail || "");

  const normalizedFixture = normalizeTeamNames(cleanedFixture || scoreboardFixture);
  const normalizedSelection = normalizeTeamNames(cleanedSelection);
  const normalizedBookmaker = String(row.bookmaker || "").replace(/^C-/, "");

  const normalizedInputRow = {
    ...row,
    bookmaker: normalizedBookmaker,
    fixtureEvent: normalizedFixture,
    selection: normalizedSelection,
    sportLeague: normalizeSportLeagueValue(row.sportLeague),
  };

  const isParlayRow = String(row.betType || "").toLowerCase() === "parlay";

  const coreDetectedLeague = normalizeSportLeagueValue(
    detectLeague({
      cleaned: [normalizedSelection, row.marketDetail || "", normalizedFixture]
        .filter(Boolean)
        .join(" "),
      selection: normalizedSelection,
      marketDetail: row.marketDetail || "",
      fixtureEvent: normalizedFixture,
      isParlay: isParlayRow,
    })
  );

  const parsedLeague = normalizeSportLeagueValue(row.sportLeague);

  const manualLeague = row.sportLeagueManual === "Y" && parsedLeague;

const basketballCoreLeague = inferBasketballLeagueFromCore({
  selection: normalizedSelection,
  marketDetail: row.marketDetail || "",
  fixtureEvent: normalizedFixture,
  participantA: row.participantA || "",
  participantB: row.participantB || "",
  participantANormalized: row.participantANormalized || "",
  participantBNormalized: row.participantBNormalized || "",
  betType: row.betType || "",
});

const parsedLeagueLooksSuspicious =
  parsedLeague === "Soccer" &&
  basketballCoreLeague === "NBA";

const resolvedSportLeague =
  manualLeague
    ? manualLeague
    : parsedLeagueLooksSuspicious
    ? basketballCoreLeague
    : isParlayRow && parsedLeague === "Multi"
    ? parsedLeague
    : shouldClearSuspiciousParsedLeague({
        parsedLeague,
        coreDetectedLeague,
        selection: normalizedSelection,
        marketDetail: row.marketDetail || "",
        fixtureEvent: normalizedFixture,
        betType: row.betType || "",
      })
    ? ""
    : coreDetectedLeague || basketballCoreLeague || parsedLeague;

  let rowForScoring = {
    ...normalizedInputRow,
    sportLeague: resolvedSportLeague,
  };

  // Tennis rows with only a player name are usually moneyline/match winner,
  // not player props.
  if (
    rowForScoring.sportLeague === "Tennis" &&
    (!rowForScoring.betType || rowForScoring.betType === "player prop" || rowForScoring.betType === "straight") &&
    rowForScoring.selection &&
    !/\b(over|under|games|spread|total)\b/i.test(`${rowForScoring.selection} ${rowForScoring.marketDetail || ""}`)
  ) {
    rowForScoring = {
      ...rowForScoring,
      betType: "moneyline",
      marketDetail: rowForScoring.marketDetail || "Moneyline",
    };
  }

  rowForScoring = cleanStaleParseWarnings(rowForScoring);

  const participantFixture = buildManualParticipantFixture(rowForScoring);
  const fixtureForCanonical = participantFixture || normalizedFixture;

  const canonical = canonicalizeSelectionFields({
    ...rowForScoring,
    bookmaker: normalizedBookmaker,
    fixtureEvent: fixtureForCanonical,
    selection: normalizedSelection,
  });

  const confidenceFlag = computeConfidenceFlag(rowForScoring);
  const likelyParserIssue = computeLikelyParserIssue(rowForScoring);

  const needsReview =
    rowForScoring.reviewResolved !== "Y" &&
    (
      rowForScoring.likelyParserIssue === "Y" ||
      likelyParserIssue === "Y" ||
      !resolvedSportLeague ||
      (!rowForScoring.oddsUS && String(normalizedBookmaker || "") !== "Kalshi") ||
      rowForScoring.oddsSource === "Calculated" ||
      !!rowForScoring.parseWarning
    );


  const finalReviewLater =
    needsReview || confidenceFlag !== "High" ? "Y" : (row.reviewLater || "N");

  const scoredRow = {
    ...rowForScoring,
    bookmaker: normalizedBookmaker,
    fixtureEvent: normalizedFixture,
    selection: normalizedSelection,
    sportLeague: resolvedSportLeague,
    confidenceFlag,
    likelyParserIssue,
    reviewLater: finalReviewLater,
    canonicalBookmaker: canonical.canonicalBookmaker || normalizedBookmaker,
    participantA: rowForScoring.participantA || "",
    participantB: rowForScoring.participantB || "",
    participantANormalized: rowForScoring.participantANormalized || "",
    participantBNormalized: rowForScoring.participantBNormalized || "",
    canonicalSubject: rowForScoring.canonicalSubject || "",
    canonicalMarketContext: rowForScoring.canonicalMarketContext || "",
    contextReviewed: rowForScoring.contextReviewed || "N",
    playerLastName: rowForScoring.playerLastName || "",
    propMarket: rowForScoring.propMarket || "",
    betDateInferred: rowForScoring.betDateInferred || "N",
    betDateNeedsConfirm: rowForScoring.betDateNeedsConfirm || "N",
    betDateConfirmed: rowForScoring.betDateConfirmed || "N",
    reviewPassStatus: rowForScoring.reviewPassStatus || "",    canonicalFixture: canonical.canonicalFixture || canonicalizeFixture(fixtureForCanonical),
    canonicalFixtureKey: getCanonicalFixtureKey(fixtureForCanonical),
    canonicalSelection: canonical.canonicalSelection || canonicalizeTeamsInText(normalizedSelection),
    canonicalBetType: canonical.canonicalBetType || row.betType || "",
    canonicalMarket: canonical.canonicalMarket || "",
    canonicalSide: canonical.canonicalSide || "",
    canonicalLine: canonical.canonicalLine || "",
    canonicalPlayer: canonical.canonicalPlayer || "",
    canonicalTeam: canonical.canonicalTeam || "",
    canonicalPeriod: canonical.canonicalPeriod || "",
    canonicalMarketFamily: canonical.canonicalMarketFamily || "",
    canonicalSubjectType: canonical.canonicalSubjectType || "",
    canonicalResultTarget: canonical.canonicalResultTarget || "",
    canonicalSelectionKey: canonical.canonicalSelectionKey || "",
    canonicalHedgeKey: canonical.canonicalHedgeKey || "",
    canonicalOppositeKey: canonical.canonicalOppositeKey || "",
  };

  const reviewPriority = computeReviewPriority(scoredRow);
  const reviewBucket = computeReviewBucket({ ...scoredRow, reviewPriority });
  const reviewReasons = computeReviewReasons({ ...scoredRow, reviewPriority });

  return {
    ...scoredRow,
    reviewPriority,
    reviewBucket,
    reviewReasons,
    reviewLater: finalReviewLater,
    exported: row.exported || "N",
    archived: row.archived || "N",
  };
}

const shared = {
  emptyParsed,
  cleanTextLine,
  normalizeOcrText,
  formatDateMMDDYYYY,
  normalizeDateString,
  nextWeekdayFromDate,
  getMatch,
  parsePlacedDate,
  parseMonthDayEventDate,
  inferEventDate,
  detectSportsbook,
  singularizeStat,
  buildPlayerPropSelection,
  detectStatus,
  detectLive,
  extractBetId,
  classifyScreenType,
  extractReceiptWindow,
  normalizeTeamNames,
  extractParlayInfo,
  enrichRow,
};

function stripBookPrefixes(bookmaker = "") {
  return String(bookmaker || "")
    .replace(/^C-/i, "")
    .replace(/^(IL|IN|OH|KY|MI)-/i, "")
    .trim();
}

function normalizeParserBookName(bookmaker = "") {
  const base = stripBookPrefixes(bookmaker);
  const key = base.toLowerCase();

  const aliases = {
    draftkings: "DraftKings",
    dk: "DraftKings",

    fanduel: "FanDuel",
    fanatics: "Fanatics",

    betmgm: "BetMGM",
    caesars: "Caesars",
    thescore: "theScore",
    "the score": "theScore",
    "score bet": "theScore",

    bet365: "bet365",
    circa: "Circa",
    kalshi: "Kalshi",

    "my bookie": "GenericTextTicket",
    mybookie: "GenericTextTicket",
    "sportsbetting.ag": "GenericTextTicket",
    "lucky rebel": "GenericTextTicket",
    bet105: "GenericTextTicket",
    bovada: "GenericTextTicket",
    betonline: "GenericTextTicket",
    betus: "GenericTextTicket",
    lowvig: "GenericTextTicket",
    novig: "GenericTextTicket",
    "prophet x": "GenericTextTicket",
    fliff: "GenericTextTicket",

    "hard rock": "GenericTextTicket",
    betrivers: "GenericTextTicket",
    bally: "GenericTextTicket",
    sbk: "GenericTextTicket",
    betr: "GenericTextTicket",
    "prime sports": "GenericTextTicket",
    betjack: "GenericTextTicket",
    betly: "GenericTextTicket",
    "golden nugget": "GenericTextTicket",
    "four winds": "GenericTextTicket",
    firekeepers: "GenericTextTicket",
    "play gun lake": "GenericTextTicket",
    playeagle: "GenericTextTicket",
  };

  return aliases[key] || base;
}

function isGenericTextTicketBook(bookmaker = "") {
  return normalizeParserBookName(bookmaker) === "GenericTextTicket";
}



export function parseBetSlip(text, sourceFileName = "", uploadBookmaker = "Auto") {
  const cleaned = normalizeOcrText(text);
  const lowerCleaned = String(cleaned || "").toLowerCase();

  const detectedSportsbook = detectSportsbook(cleaned);

  const sportsbook =
    uploadBookmaker && uploadBookmaker !== "Auto"
      ? uploadBookmaker
      : detectedSportsbook;

  const routeBook =
    uploadBookmaker && uploadBookmaker !== "Auto"
      ? normalizeParserBookName(uploadBookmaker)
      : normalizeParserBookName(detectedSportsbook);

  const forcedBook = String(routeBook || "").trim().toLowerCase();

  let parserName = "DraftKingsLike";

  if (
    forcedBook === "fanduel" ||
    forcedBook === "fanatics" ||
    /\bfanduel\b/.test(lowerCleaned) ||
    looksLikeFanDuelText(cleaned)
  ) {
    parserName = "FanDuel";
  } else if (
    forcedBook === "kalshi" ||
    /kalshi/i.test(lowerCleaned) ||
    /\bmarkets?\s+pay\b/i.test(lowerCleaned) ||
    /\bcost\b/i.test(lowerCleaned) ||
    /\bmax payout\b/i.test(lowerCleaned) ||
    /\bodds\s+\d+% chance\b/i.test(lowerCleaned) ||
    /\bslide to buy\b/i.test(lowerCleaned) ||
    /\border completed\b/i.test(lowerCleaned) ||
    /\bpro basketball\b/i.test(lowerCleaned) ||
    /\bxx dollars\b/i.test(lowerCleaned)
  ) {
    parserName = "Kalshi";
  } else if (
    forcedBook === "circa" ||
    /circa/i.test(lowerCleaned) ||
    /\bwager placed\b/i.test(lowerCleaned) ||
    /\bthank you for playing with circa sports\b/i.test(lowerCleaned)
  ) {
    parserName = "Circa";
  } else if (
    forcedBook === "bet365" ||
    normalizeParserBookName(sportsbook) === "bet365" ||
    /bet365/i.test(lowerCleaned) ||
    (
      /\bbet placed\b/i.test(cleaned) &&
      /\bbet ref\b/i.test(cleaned) &&
      /\breuse selections\b/i.test(cleaned) &&
      /\bwager to return\b/i.test(cleaned) &&
      /\ball sports live my bets search\b/i.test(cleaned)
    )
  ) {
    parserName = "bet365";
  } else if (
    forcedBook === "thescore" ||
    normalizeParserBookName(sportsbook) === "theScore" ||
    /thescore/i.test(lowerCleaned) ||
    /score bet/i.test(lowerCleaned)
  ) {
    parserName = "theScore";
  } else if (
    forcedBook === "caesars" ||
    /\bcaesars\b/i.test(lowerCleaned)
  ) {
    parserName = "Caesars";
  } else if (
    forcedBook === "betmgm" ||
    normalizeParserBookName(sportsbook) === "BetMGM"
  ) {
    parserName = "BetMGM";
  } else if (
    isGenericTextTicketBook(uploadBookmaker) ||
    isGenericTextTicketBook(detectedSportsbook)
  ) {
    parserName = "GenericTextTicket";
  }

  const parser = PARSER_REGISTRY.find((entry) => entry.name === parserName);

  if (!parser) {
    const fallback = PARSER_REGISTRY.find((entry) => entry.name === "DraftKingsLike");

    return fallback.run({
      cleaned,
      originalText: text,
      sourceFileName,
      sportsbook,
      shared,
    });
  }

  return parser.run({
    cleaned,
    originalText: text,
    sourceFileName,
    sportsbook,
    shared,
  });
}


