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
    canonicalOppositeKey: ""
};

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
  if (!row.selection) return "Y";
  if (!row.fixtureEvent) return "Y";
  if (!row.sportLeague) return "Y";
  if (!row.oddsUS && String(row.bookmaker || "") !== "Kalshi") return "Y";
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

  return reasons.slice(0, 4).join(" â€¢ ");
}

export function enrichRow(row) {
  const normalizedFixture = normalizeTeamNames(row.fixtureEvent);
  const normalizedSelection = normalizeTeamNames(row.selection);
  const normalizedBookmaker = String(row.bookmaker || "").replace(/^C-/, "");

  const canonical = canonicalizeSelectionFields({
    ...row,
    bookmaker: normalizedBookmaker,
    fixtureEvent: normalizedFixture,
    selection: normalizedSelection,
  });

  const confidenceFlag = computeConfidenceFlag(row);
  const likelyParserIssue = computeLikelyParserIssue(row);

  const needsReview =
    row.reviewResolved !== "Y" &&
    (
      row.likelyParserIssue === "Y" ||
      likelyParserIssue === "Y" ||
      !row.sportLeague ||
      (!row.oddsUS && String(normalizedBookmaker || "") !== "Kalshi") ||
      row.oddsSource === "Calculated" ||
      !!row.parseWarning
    );

  const resolvedSportLeague =
    row.sportLeague ||
    detectLeague({
      cleaned: row.sourceText || "",
      selection: normalizedSelection,
      marketDetail: row.marketDetail || "",
      fixtureEvent: normalizedFixture,
      isParlay: String(row.betType || "").toLowerCase() === "parlay",
    });

  const finalReviewLater =
    needsReview || confidenceFlag !== "High" ? "Y" : (row.reviewLater || "N");

  const scoredRow = {
    ...row,
    bookmaker: normalizedBookmaker,
    fixtureEvent: normalizedFixture,
    selection: normalizedSelection,
    sportLeague: resolvedSportLeague,
    confidenceFlag,
    likelyParserIssue,
    reviewLater: finalReviewLater,
    canonicalBookmaker: canonical.canonicalBookmaker || normalizedBookmaker,
    canonicalFixture: canonical.canonicalFixture || canonicalizeFixture(normalizedFixture),
    canonicalFixtureKey: getCanonicalFixtureKey(normalizedFixture),
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

export function parseBetSlip(text, sourceFileName = "", uploadBookmaker = "Auto") {
  const cleaned = normalizeOcrText(text);
  const lowerCleaned = String(cleaned || "").toLowerCase();

  const detectedSportsbook = detectSportsbook(cleaned);
  const sportsbook =
    uploadBookmaker && uploadBookmaker !== "Auto"
      ? uploadBookmaker
      : detectedSportsbook;

  const forcedBook = String(uploadBookmaker || "").trim().toLowerCase();

  let parserName = "DraftKingsLike";

  if (
    forcedBook === "fanduel" ||
    /\bfanduel\b/.test(lowerCleaned) ||
    looksLikeFanDuelText(cleaned)
  ) {
    parserName = "FanDuel";
  } else if (
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
    sportsbook === "bet365" ||
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
    sportsbook === "theScore" ||
    /thescore/i.test(lowerCleaned) ||
    /score bet/i.test(lowerCleaned)
  ) {
    parserName = "theScore";
  } else if (forcedBook === "caesars" || /\bcaesars\b/i.test(lowerCleaned)) {
    parserName = "Caesars";
  } else if (sportsbook === "BetMGM") {
    parserName = "BetMGM";
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
