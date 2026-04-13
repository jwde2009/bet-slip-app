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

  

  const needsReview =
    row.reviewResolved !== "Y" &&
    (
      row.likelyParserIssue === "Y" ||
      !row.sportLeague ||
      (!row.oddsUS && String(row.bookmaker || "") !== "Kalshi") ||
      row.oddsSource === "Calculated" ||
      !!row.parseWarning
    );

  return {
    ...row,
    bookmaker: normalizedBookmaker,
    fixtureEvent: normalizedFixture,
    selection: normalizedSelection,
    
    sportLeague:
    row.sportLeague ||
    detectLeague({
      selection: normalizedSelection,
      marketDetail: row.marketDetail,
      fixtureEvent: normalizedFixture,
    }),

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

    reviewLater: needsReview ? "Y" : (row.reviewLater || "N"),
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