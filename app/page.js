"use client";
import Link from "next/link";
import { parseBetSlip, enrichRow } from "./utils/parser";
import {
  americanOddsFromStakeAndProfit,
  americanOddsFromStakeAndReturn,
  detectOddsMissingReason,
  extractBestOdds,
  extractPayouts,
} from "./utils/oddsHelpers";

import {
  addDuplicateWarnings,
  computeConfidence,
  getDisplayedBookmaker,
  impliedProbabilityFromAmericanOdds,
  makeDuplicateKey,
} from "./utils/tableHelpers";

import { useEffect, useMemo, useRef, useState } from "react";
import ReviewTable from "./components/ReviewTable";
import UploadDropZone from "./components/UploadDropZone";
import UploadBatchStatus from "./components/UploadBatchStatus";
import ReviewLegend from "./components/ReviewLegend";
import Tesseract from "tesseract.js";

import { detectLeague } from "./utils/detectLeague";
import { isRecognizedPlayerPropMarket } from "./utils/propMarketRecognition";
import { TEAM_ALIASES_BY_SPORT } from "./ev-parlay-lab/data/teamAliases";
import {
  applyMyVariableDefaults,
  getMyVariableState,
  getSuggestedMyVariable,
} from "./utils/myVariable";
import {
  CORE_REVIEW_FIELDS,
  addManualLockedFields,
  appendAuditTrail,
  getBatchQaIssues,
  getActiveReviewDataIssues,
  mergeFieldSources,
  preserveLockedAndReviewedFields,
} from "./utils/reviewGovernance";

const APP_UI_SCALE = 0.94;

const evLabButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 8,
  background: "#166534",
  color: "#f0fdf4",
  textDecoration: "none",
  fontWeight: 700,
  border: "2px solid #14532d",
};

const BOOKMAKER_UPLOAD_OPTIONS = [
  "Auto",

  // Core / Missouri / regular books
  "Bet365",
  "BetMGM",
  "Caesars",
  "Circa",
  "DraftKings",
  "Fanatics",
  "FanDuel",
  "Kalshi",
  "The Score",

  // Offshore / text-ticket style books
  "My Bookie",
  "SportsBetting.ag",
  "Lucky Rebel",
  "bet105",
  "Bovada",
  "BetOnline",
  "BetUS",
  "LowVig",
  "NoVig",
  "Prophet X",
  "Fliff",

  // Illinois
  "IL-Bet365",
  "IL-BetMGM",
  "IL-Caesars",
  "IL-FanDuel",
  "IL-Fanatics",
  "IL-DraftKings",
  "IL-Hard Rock",
  "IL-BetRivers",
  "IL-Circa",

  // Indiana
  "IN-Bet365",
  "IN-BetMGM",
  "IN-Caesars",
  "IN-FanDuel",
  "IN-Fanatics",
  "IN-DraftKings",
  "IN-BetRivers",
  "IN-Hard Rock",
  "IN-Bally",
  "IN-SBK",
  "IN-Betr",

  // Ohio
  "OH-Bet365",
  "OH-BetMGM",
  "OH-Caesars",
  "OH-FanDuel",
  "OH-Fanatics",
  "OH-DraftKings",
  "OH-BetRivers",
  "OH-Hard Rock",
  "OH-Bally",
  "OH-Prime Sports",
  "OH-Betr",
  "OH-BetJack",
  "OH-Betly",

  // Kentucky
  "KY-Bet365",
  "KY-BetMGM",
  "KY-Caesars",
  "KY-FanDuel",
  "KY-Fanatics",
  "KY-DraftKings",
  "KY-Prime Sports",
  "KY-Circa",

  // Michigan
  "MI-Bet365",
  "MI-BetMGM",
  "MI-Caesars",
  "MI-FanDuel",
  "MI-Fanatics",
  "MI-Hard Rock",
  "MI-BetRivers",
  "MI-DraftKings",
  "MI-Golden Nugget",
  "MI-Four Winds",
  "MI-Firekeepers",
  "MI-Play Gun Lake",
  "MI-PlayEagle",
];

const BET_TYPE_OPTIONS = [
  "",
  "straight",
  "moneyline",
  "spread",
  "total",
  "player prop",
  "game prop",
  "parlay",
  "futures",
];

const BET_SOURCE_OPTIONS = [
  "",
  "EV",
  "Promo",
  "Boost",
  "Parlay",
  "Hedge",
  "Middle",
  "Live",
  "Fun",
  "Manual Fix",
  "Needs Check",
];

const ACCOUNT_OPTIONS = ["Me", "Wife"];

function normalizeUploadBookmakerLabel(value = "") {
  const text = String(value || "").trim();

  if (!text) return "";
  if (text === "Auto") return "Auto";

  return text
    .replace(/(^|-)bet365\b/gi, "$1Bet365")
    .replace(/(^|-)thescore\b/gi, "$1The Score")
    .replace(/(^|-)the score\b/gi, "$1The Score");
}

function inferBookmakerFromSourceName(sourceName = "") {
  const raw = String(sourceName || "");
  const text = raw
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Prefixes from the staging script are usually:
  // Book__Owner__OriginalFileName
  // The folder path may also include Owner/Book/Month/Week.
  if (/\bdraft\s*kings\b|\bdraftkings\b/.test(text)) return "DraftKings";
  if (/\bfan\s*duel\b|\bfanduel\b/.test(text)) return "FanDuel";
  if (/\bbet\s*mgm\b|\bbetmgm\b/.test(text)) return "BetMGM";
  if (/\bcaesars\b/.test(text)) return "Caesars";
  if (/\bcirca\b/.test(text)) return "Circa";
  if (/\bkalshi\b/.test(text)) return "Kalshi";
  if (/\bbet\s*365\b|\bbet365\b/.test(text)) return "Bet365";
  if (/\bthe\s*score\b|\bthescore\b/.test(text)) return "The Score";
  if (/\bfanatics\b/.test(text)) return "Fanatics";

  // Offshore / text-ticket books
  if (/\bmy\s*bookie\b|\bmybookie\b/.test(text)) return "My Bookie";
  if (/\bsportsbetting\.?ag\b|\bsports\s*betting\b/.test(text)) return "SportsBetting.ag";
  if (/\blucky\s*rebel\b/.test(text)) return "Lucky Rebel";
  if (/\bbet\s*105\b|\bbet105\b/.test(text)) return "bet105";
  if (/\bbovada\b/.test(text)) return "Bovada";
  if (/\bbet\s*online\b|\bbetonline\b/.test(text)) return "BetOnline";
  if (/\bbet\s*us\b|\bbetus\b/.test(text)) return "BetUS";
  if (/\blow\s*vig\b|\blowvig\b/.test(text)) return "LowVig";
  if (/\bno\s*vig\b|\bnovig\b/.test(text)) return "NoVig";
  if (/\bprophet\s*x\b|\bprophetx\b/.test(text)) return "Prophet X";
  if (/\bfliff\b/.test(text)) return "Fliff";

  return "";
}

function safeFilePart(value = "batch") {
  return (
    String(value || "batch")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "batch"
  );
}

function removeDateConfirmWarnings(existing = "") {
  const dateWarningTerms = [
    "bet_date_copied_from_previous_upload_row_needs_confirm",
    "bet_date_missing_needs_confirm",
    "no_bet_date_detected",
    "date_missing",
    "date needs confirm",
    "date_needs_confirm",
    "needs date confirm",
  ];

  return String(existing || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const lower = part.toLowerCase();
      return !dateWarningTerms.some((term) => lower.includes(term));
    })
    .join(" | ");
}

function rowHasUnresolvedHedgeReview(row = {}) {
  const likely =
    row.likelyHedge === "Y" ||
    row.autoLikelyHedge === "Y" ||
    !!row.hedgeClusterId;

  if (!likely) return false;

  const override = String(row.hedgeOverride || "").trim();

  // Confirm Hedge Pair sets Y. Not This Match should remove/ignore the pair.
  // Blank only matters when the app actually thinks this row is a hedge candidate.
  return override !== "Y" && override !== "N";
}

function getStrongMainLineMarketForValidation(row = {}) {
  const primaryText = [
    row.selection,
    row.rawSelection,
    row.marketDetail,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!primaryText) return "";

  // Explicit sportsbook/main-line wording in the parsed selection is authoritative
  // over stale player-prop metadata. This repairs rows such as
  // "Pacers 1st half moneyline" that previously remained tagged player prop.
  if (/\b(?:moneyline|match winner)\b/.test(primaryText)) return "moneyline";
  if (/\b(?:spread|run line|puck line|asian handicap|handicap)\b/.test(primaryText)) return "spread";
  if (
    /\b(?:game total|team total|total|over\/?under|o\/?u)\b/.test(primaryText) &&
    /\b(?:over|under|o|u)\b/.test(primaryText)
  ) {
    return "total";
  }

  return "";
}

function rowIsPlayerPropForValidation(row = {}) {
  // Manual review classification is authoritative. Once the reviewer chooses
  // a type, heuristic main-line/player-prop inference may warn but may not
  // silently reinterpret the row.
  if (String(row.reviewBetKindManual || "").toUpperCase() === "Y") {
    return String(row.reviewBetKind || "").trim() === "player_prop";
  }

  // A clearly identified main-line selection beats stale parser metadata only
  // when the reviewer has not manually classified this row.
  if (getStrongMainLineMarketForValidation(row)) return false;

  const text = [
    row.betType,
    row.reviewBetKind,
    row.canonicalMarketContext,
    row.reviewMarketType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /player[ _-]*prop/.test(text) ||
    (!!String(row.propMarket || "").trim() &&
      !!String(row.canonicalSubject || row.canonicalPlayer || row.playerLastName || "").trim())
  );
}

function rowHasRecognizedPlayerPropMarket(row = {}) {
  if (!rowIsPlayerPropForValidation(row)) return true;
  return isRecognizedPlayerPropMarket(row.propMarket || "");
}

function getReviewPassStatus(row = {}) {
  const issues = getActiveReviewDataIssues(row, { includeAdvisory: true });

  if (issues.some((issue) => ["missing_bet_date", "bet_date_needs_confirm"].includes(issue.code))) {
    return "Date Confirm";
  }

  if (issues.some((issue) => issue.severity === "high")) return "Parser Issue";
  if (issues.length) return "Context Needed";
  if (row.reviewResolved === "Y") return "Export Ready";
  return "Clean";
}

function rowIsExportReady(row = {}) {
  return getReviewPassStatus(row) === "Export Ready";
}

function rowNeedsReviewAllQueue(row = {}) {
  if (!row) return false;

  // Review All is strictly bet-data review. Hedge-only state never keeps a
  // clean confirmed row here. Confirmed rows re-enter only when current saved
  // data has a real QA/data mismatch that has not been explicitly overridden.
  const currentIssues = getActiveReviewDataIssues(row, { includeAdvisory: true });
  return row.reviewResolved !== "Y" || currentIssues.length > 0;
}

function rowIsHedgeCritical(row = {}) {
  const betType = String(row.betType || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();

  const missingCore =
    row.betDateNeedsConfirm === "Y" ||
    !row.betDate ||
    !row.bookmaker ||
    !row.stake ||
    !row.oddsUS ||
    !row.win && !["open", "cashed out", "voided", "void", "push"].includes(status) ||
    !row.sportLeague;

  // Hedge-pair decisions now live exclusively in the dedicated Hedge Review queue.
  // Normal Full-Page Review should only be blocked by the bet's own missing/invalid data.

  const playerPropMissingContext =
    rowIsPlayerPropForValidation(row) &&
    (!row.playerLastName || !rowHasRecognizedPlayerPropMarket(row));

  const teamSportMissingContext =
    !row.participantANormalized &&
    !row.participantBNormalized &&
    !row.fixtureEvent;

  return !!(
    missingCore ||
    playerPropMissingContext ||
    teamSportMissingContext
  );
}

function buildPreExportChecklist(rowsToCheck = []) {
  const activeRows = rowsToCheck.filter((row) => row.archived !== "Y");

  const counts = {
    active: activeRows.length,
    unreviewed: activeRows.filter((row) => row.reviewResolved !== "Y").length,
    reviewLater: activeRows.filter((row) => row.reviewLater === "Y").length,
    unconfirmedDates: activeRows.filter((row) => row.betDateNeedsConfirm === "Y").length,
    missingDates: activeRows.filter((row) => !row.betDate).length,
    missingMoney: activeRows.filter((row) => !row.stake || !row.oddsUS).length,
    missingResult: activeRows.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return !row.win && !["open", "cashed out", "voided", "void", "push"].includes(status);
    }).length,
    missingLeague: activeRows.filter((row) => !row.sportLeague).length,
    possibleHedgesNotReviewed: activeRows.filter(
      (row) => row.likelyHedge === "Y" && row.hedgeOverride !== "Y" && row.hedgeOverride !== "N"
    ).length,
    unrecognizedPropMarkets: activeRows.filter(
      (row) => !rowHasRecognizedPlayerPropMarket(row)
    ).length,
  };

  const blockers = [
    counts.unconfirmedDates ? `${counts.unconfirmedDates} unconfirmed copied dates` : "",
    counts.missingDates ? `${counts.missingDates} missing dates` : "",
    counts.missingMoney ? `${counts.missingMoney} rows missing stake/odds` : "",
    counts.missingResult ? `${counts.missingResult} rows missing result` : "",
    counts.reviewLater ? `${counts.reviewLater} rows marked Review Later` : "",
    counts.unreviewed ? `${counts.unreviewed} unreviewed rows` : "",
    // Hedge decisions are deliberately excluded from export/review blockers.
    counts.unrecognizedPropMarkets ? `${counts.unrecognizedPropMarkets} player props have an unrecognized prop market` : "",
  ].filter(Boolean);

  return {
    counts,
    blockers,
    okToExport: blockers.length === 0,
    message:
      blockers.length === 0
        ? `Pre-export check passed. ${counts.active} active rows ready.`
        : `Pre-export warnings:\n- ${blockers.join("\n- ")}\n\nExport anyway?`,
  };
}


function getRowAttentionLevel(row) {
  if (!row) return "";

  const parseWarningText = String(row.parseWarning || "").toLowerCase();
  const duplicateWarningText = String(row.duplicateWarning || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();
  const confidence = String(row.confidenceFlag || "").toLowerCase();

const hasCopiedDateConfirmIssue =
  !!row.betDate &&
  (
    row.betDateNeedsConfirm === "Y" ||
    parseWarningText.includes("bet_date_copied_from_previous_upload_row_needs_confirm")
  );

const hasMissingDateConfirmIssue =
  !row.betDate &&
  (
    row.betDateNeedsConfirm === "Y" ||
    parseWarningText.includes("bet_date_missing_needs_confirm")
  );


  const hasCriticalMoneyIssue =
    !row.stake ||
    !row.oddsUS ||
    parseWarningText.includes("stake_missing") ||
    parseWarningText.includes("odds_missing");

  const hasCriticalIdentityIssue =
    !row.selection ||
    parseWarningText.includes("selection_missing");

  const hasResultIssue =
    !row.win &&
    !["open", "cashed out", "voided", "void", "push"].includes(status);

  const hasSoftIssue =
    !row.fixtureEvent ||
    !row.betDate ||
    !row.sportLeague ||
    confidence === "low" ||
    confidence === "medium" ||
    parseWarningText.includes("fixture_missing") ||
    parseWarningText.includes("no_bet_date_detected") ||
    parseWarningText.includes("payout_estimated") ||
    parseWarningText.includes("multiple_bets_detected") ||
    parseWarningText.includes("cashout_layout_detected") ||
    parseWarningText.includes("payout_missing");

  if (row.reviewResolved === "Y") {
    return hasCriticalMoneyIssue || hasCriticalIdentityIssue || hasResultIssue
      ? "resolved-critical"
      : "resolved";
  }

  if (duplicateWarningText.includes("duplicate")) return "duplicate";

if (hasMissingDateConfirmIssue || hasCriticalMoneyIssue || hasCriticalIdentityIssue || hasResultIssue) {
  return "critical";
}

if (hasCopiedDateConfirmIssue) {
  return "date-confirm";
}

  if (hasSoftIssue) {
    return "soft";
  }

  return "";
}

function cleanTextLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getMatch(text, regex, group = 1) {
  const match = String(text || "").match(regex);
  return match ? String(match[group] || "").trim() : "";
}

function detectLive(text) {
  return /\blive\b/i.test(String(text || "")) ? "Y" : "N";
}

function parseVisibleTeamMatchup(lines) {
  const teamLines = [];
  for (const line of lines) {
    const cleaned = cleanTextLine(line);
    if (!cleaned) continue;
    if (
      /\bTrail Blazers\b|\bNuggets\b|\bBucks\b|\bClippers\b|\bHornets\b|\bCeltics\b|\bPacers\b|\bBulls\b|\bMIL\b|\bPOR\b|\bDEN\b|\bIND\b|\bLA Clippers\b/i.test(
        cleaned
      )
    ) {
      teamLines.push(cleaned.replace(/\s+\d+.*$/, "").trim());
    }
  }
  const deduped = [];
  for (const t of teamLines) {
    if (!deduped.includes(t)) deduped.push(t);
  }
  if (deduped.length >= 2) return `${deduped[0]} @ ${deduped[1]}`;
  return "";
}

function parseMyBetsCards(lines) {
  const cards = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\b(Wager:|Wager Amount:)\s*\$?/i.test(line)) continue;

    const windowStart = Math.max(0, i - 4);
    const windowEnd = Math.min(lines.length, i + 8);
    const cardLines = lines.slice(windowStart, windowEnd);
    const cardText = cardLines.join("\n");

    const selectionLine =
      cardLines.find((l) => /[+-]\d{2,5}.*(?:Open|Cashed Out|Won|Lost|Paid)?/i.test(l)) || "";
    const marketLine =
      cardLines.find((l) =>
        /\b(Moneyline|Live Moneyline|Points O\/U|Assists O\/U|Rebounds O\/U|Three Pointers(?: Made)?(?: O\/U| Made O\/U)?|Total Games|Games Spread|Triple-Double|Double-Double|Earned Runs(?: Allowed)?(?: O\/U)?|Anytime Goalscorer)\b/i.test(
          l
        )
      ) || "";
    const wagerLine = cardLines.find((l) => /\bWager:\s*\$?|\bWager Amount:\s*\$?/i.test(l)) || "";
    const payoutLine = cardLines.find((l) => /\b(To Pay:|Paid:|Total Payout:)\s*\$?/i.test(l)) || "";
    const eventLine =
      cardLines.find((l) => /\b(Today|Tomorrow|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i.test(l)) || "";
    const visibleMatchup = parseVisibleTeamMatchup(cardLines);

    const rawSelection = cleanTextLine(selectionLine)
      .replace(/\b(?:Open|Cashed Out|Won|Lost)\b/gi, "")
      .replace(/[+-]\d{2,5}.*$/i, "")
      .trim();

    const extractedPayouts = extractPayouts(cardText);

    cards.push({
      rawSelection,
      marketDetail: cleanTextLine(marketLine),
      fixtureEvent: cleanTextLine(eventLine || visibleMatchup),
      stake:
        getMatch(wagerLine, /(?:Wager:|Wager Amount:)\s*\$?([\d,]+(?:\.\d{1,2})?)/i) ||
        getMatch(cardText, /(?:Wager:|Wager Amount:)\s*\$?([\d,]+(?:\.\d{1,2})?)/i),
      payout: extractedPayouts.payout,
      oddsUS:
        getMatch(selectionLine, /([+-]\d{2,5})/) ||
        getMatch(cardText, /([+-]\d{2,5})\s+(?:Open|Cashed Out|Won|Lost)\b/i) ||
        "",
      status: /\bCashed Out\b/i.test(cardText)
        ? "Cashed Out"
        : /\bOpen\b/i.test(cardText)
        ? "Open"
        : /\bWon\b/i.test(cardText)
        ? "Won"
        : /\bLost\b/i.test(cardText)
        ? "Lost"
        : "",
      live: detectLive(cardText),
      sourceText: cardText,
      screenType: "my_bets_card",
    });
  }

  const unique = [];
  const seen = new Set();
  for (const card of cards) {
    const key = [
      card.rawSelection,
      card.marketDetail,
      card.stake,
      card.payout,
      card.oddsUS,
      card.status,
    ].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }
  return unique;
}

function getImageBitmapFromFile(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };

    img.src = url;
  });
}

async function makeFooterOcrBlobs(file) {
  const blobs = [];

  async function makeOneFooterBlob({ footerRatio, scale, filter }) {
    try {
      const bitmap = await getImageBitmapFromFile(file);

      const width = bitmap.width || bitmap.naturalWidth;
      const height = bitmap.height || bitmap.naturalHeight;

      if (!width || !height) return null;

      const footerHeight = Math.max(90, Math.floor(height * footerRatio));
      const sourceY = Math.max(0, height - footerHeight);

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = footerHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.filter = filter;
      ctx.drawImage(
        bitmap,
        0,
        sourceY,
        width,
        footerHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    } catch (error) {
      console.warn("Footer OCR crop failed", error);
      return null;
    }
  }

  const attempts = [
    {
      footerRatio: 0.30,
      scale: 4,
      filter: "grayscale(1) contrast(2.8) brightness(1.2)",
    },
    {
      footerRatio: 0.45,
      scale: 4,
      filter: "grayscale(1) contrast(3.2) brightness(1.25)",
    },
    {
      footerRatio: 0.60,
      scale: 3,
      filter: "grayscale(1) contrast(2.6) brightness(1.15)",
    },
  ];

  for (const attempt of attempts) {
    const blob = await makeOneFooterBlob(attempt);
    if (blob) blobs.push(blob);
  }

  return blobs;
}

function textContainsPlacedDate(text = "") {
  return /\bPlaced:?\s*[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/i.test(String(text || ""));
}

function extractFooterDateHints(text = "") {
  const raw = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return [];

  const hints = [];

  const placedMatches = raw.match(
    /\bPlaced:?\s*[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)\b/gi
  ) || [];

  for (const match of placedMatches) {
    hints.push(match.replace(/\s+/g, " ").trim());
  }

  const dateTimeMatches = raw.match(
    /\b[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)\b/gi
  ) || [];

  for (const match of dateTimeMatches) {
    const cleaned = match.replace(/\s+/g, " ").trim();

    if (!hints.some((hint) => hint.includes(cleaned))) {
      hints.push(`Placed: ${cleaned}`);
    }
  }

  return Array.from(new Set(hints));
}

async function readOcrTextForFile(file) {
  const fullResult = await Tesseract.recognize(file, "eng", { logger: () => {} });
  const fullText = fullResult.data.text || "";

  // If the normal OCR already caught the placed date, do not append noisy footer OCR.
  if (textContainsPlacedDate(fullText)) {
    return fullText;
  }

  const footerBlobs = await makeFooterOcrBlobs(file);

  if (!footerBlobs.length) {
    return fullText;
  }

  const dateHints = [];

  for (let i = 0; i < footerBlobs.length; i += 1) {
    try {
      const footerResult = await Tesseract.recognize(footerBlobs[i], "eng", {
        logger: () => {},
      });

      const footerText = footerResult.data.text || "";
      const hints = extractFooterDateHints(footerText);

      for (const hint of hints) {
        if (!dateHints.includes(hint)) {
          dateHints.push(hint);
        }
      }
    } catch (error) {
      console.warn("Footer OCR pass failed", error);
    }
  }

  if (!dateHints.length) return fullText;

  return `${fullText}\n\n--- DATE OCR ---\n${dateHints.join("\n")}`;
}



function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function americanOddsFromProbabilityValue(value) {
  const p = Number(value);

  if (!Number.isFinite(p) || p <= 0 || p >= 1) return "";

  if (p > 0.5) {
    return `${Math.round((-100 * p) / (1 - p))}`;
  }

  return `+${Math.round((100 * (1 - p)) / p)}`;
}

function getTrackerOdds(row) {
  if (row.oddsUS) return row.oddsUS;

  const bookmaker = String(getDisplayedBookmaker(row) || row.bookmaker || "").toLowerCase();

  if (bookmaker.includes("kalshi") && row.impliedProbability) {
    return americanOddsFromProbabilityValue(row.impliedProbability);
  }

  return "";
}

function buildTrackerCsvData(rowsToExport) {
  const headers = [
    "Event Date",
    "Bet Date",
    "Sportsbook",
    "League",
    "Selection",
    "Bet Type",
    "Tipper",
    "My variable",
    "Event",
    "Live Score",
    "Result",
    "Stake",
    "Odds",
    "Bonus Bet",
    "Win",
    "Potential return",
  ];

  const csvRows = rowsToExport.map((row) => [
    escapeCsv(row.eventDate),
    escapeCsv(row.betDate),
    escapeCsv(getDisplayedBookmaker(row)),
    escapeCsv(row.sportLeague),
    escapeCsv(row.selection),
    escapeCsv(row.betType),
    escapeCsv(row.tipper || ""),
    escapeCsv(getSuggestedMyVariable(row)),
    escapeCsv(row.fixtureEvent),
    escapeCsv(""),
    escapeCsv(""),
    escapeCsv(row.stake),
    escapeCsv(getTrackerOdds(row)),
    escapeCsv(row.bonusBet),
    escapeCsv(row.win),
    escapeCsv(""),
  ]);

  return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
}


const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
  backgroundColor: "#fff",
  color: "#000",
};

const selectStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
  backgroundColor: "#fff",
  color: "#000",
};

const textAreaStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
  backgroundColor: "#fff",
  color: "#000",
  minHeight: 90,
  resize: "vertical",
};

const buttonStyle = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: 4,
  backgroundColor: "#f5f5f5",
  cursor: "pointer",
};

const smallButtonStyle = {
  padding: "6px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
  backgroundColor: "#f5f5f5",
  cursor: "pointer",
};

const noticeStyle = {
  marginTop: 8,
  padding: "8px 12px",
  border: "1px solid #c8e6c9",
  borderRadius: 4,
  backgroundColor: "#e8f5e9",
  color: "#1b5e20",
  display: "inline-block",
};

const warningStyle = {
  marginTop: 8,
  padding: "8px 12px",
  border: "1px solid #ffe082",
  borderRadius: 4,
  backgroundColor: "#fff8e1",
  color: "#7a5a00",
  display: "inline-block",
};

const duplicateStyle = {
  marginTop: 8,
  padding: "8px 12px",
  border: "1px solid #ffccbc",
  borderRadius: 4,
  backgroundColor: "#fff3e0",
  color: "#a84300",
  display: "inline-block",
};

const cellStyle = {
  border: "1px solid #ccc",
  padding: 8,
  verticalAlign: "top",
  background: "#fff",
  color: "#000",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const PAYOUT_MATCH_TOLERANCE_DOLLARS = 10;
const SMALL_HEDGE_LOSS_TOLERANCE_DOLLARS = 5;
const HEDGE_DATE_WINDOW_DAYS = 7;
const LARGE_STAKE_HEDGE_THRESHOLD_DOLLARS = 250;

const APP_STATE_STORAGE_KEY = "betSlipAppStateV1";
const APP_AUTOSAVE_STORAGE_KEY = "betSlipAppAutosavesV1";
const MAX_AUTOSAVE_SNAPSHOTS = 1;
const AUTOSAVE_COMPLETED_ROW_INTERVAL = 20;
const APP_STATE_SAVE_DEBOUNCE_MS = 1200;

const HEDGE_SCAN_FIELDS = [
  "likelyHedge",
  "autoLikelyHedge",
  "hedgeOverride",
  "hedgeClusterId",
  "hedgeClusterSize",
  "hedgePartnerBookmaker",
  "hedgeConfidence",
  "hedgeQuality",
  "guaranteedProfit",
  "guaranteedProfitAmount",
  "hedgeStake",
  "hedgeProfitLow",
  "hedgeProfitHigh",
  "hedgeProfitIfThisWins",
  "hedgeProfitIfOtherWins",
  "ignoredHedgePartnerIds",
  "hedgeCandidateIds",
  "hedgeCandidateCount",
  "confirmedHedgePartnerIds",
  "everHedgeCandidate",
  "everLikelyHedge",
  "hedgeHistoryReason",
  "parseWarning",
];

const HEDGE_CRITICAL_EDIT_FIELDS = new Set([
  "sportLeague",
  "stake",
  "oddsUS",
  "payout",
  "toWin",
  "selection",
  "fixtureEvent",
  "betType",
  "marketType",
  "marketDetail",
  "propMarket",
  "canonicalMarketContext",
  "canonicalSubject",
  "canonicalPlayer",
  "playerLastName",
  "participantA",
  "participantB",
  "participantANormalized",
  "participantBNormalized",
  "mainLineSide",
  "mainLineLine",
]);

export default function Home() {
  const [rows, setRows] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showArchivedRows, setShowArchivedRows] = useState(false);
  const [showNeedsReviewOnly, setShowNeedsReviewOnly] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [backgroundTaskMessage, setBackgroundTaskMessage] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [showReviewLaterOnly, setShowReviewLaterOnly] = useState(false);
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);
  const [showLikelyParserIssuesOnly, setShowLikelyParserIssuesOnly] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [showLegacySelectedRowEditor, setShowLegacySelectedRowEditor] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: "betDate", direction: "desc" });
  const [tableMode, setTableMode] = useState("simplified");
  const [uploadBatches, setUploadBatches] = useState([]);
  const [savedFilterView, setSavedFilterView] = useState("review_all");
  const [hedgeReviewLaunchToken, setHedgeReviewLaunchToken] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const [showBatchQa, setShowBatchQa] = useState(false);
  const [reviewSessionStartedAt, setReviewSessionStartedAt] = useState(() => Date.now());
  const [reviewSessionStartingCount, setReviewSessionStartingCount] = useState(0);
  const undoCaptureRef = useRef({ rowId: "", at: 0 });
  const [rowSearchQuery, setRowSearchQuery] = useState("");
  const [showHedgesOnly, setShowHedgesOnly] = useState(false);
  const [smartReviewMode, setSmartReviewMode] = useState(true);
  const [showGuaranteedProfitOnly, setShowGuaranteedProfitOnly] = useState(false);
  const [showHedgeCriticalOnly, setShowHedgeCriticalOnly] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [storageStats, setStorageStats] = useState({ appKb: 0, autosaveKb: 0, totalKb: 0, screenshots: 0 });
  const [columnWidths, setColumnWidths] = useState({
    select: 52,
    edit: 84,
    image: 96,
    sourceFileName: 180,
    accountOwner: 90,
    myVariable: 120,
    bookmaker: 110,
    betId: 150,
    eventDate: 105,
    betDate: 105,
    sportLeague: 110,
    selection: 220,
    betType: 110,
    betSourceTag: 110,
    fixtureEvent: 220,
    stake: 90,
    oddsUS: 90,
    oddsMissingReason: 150,
    impliedProbability: 90,
    confidenceFlag: 95,
    likelyParserIssue: 80,
    live: 70,
    bonusBet: 75,
    reviewLater: 75,
    warnings: 220,
    actions: 170,
  });

  const resizeStateRef = useRef(null);
  const reattachScreenshotsInputRef = useRef(null);
  const reattachScreenshotsScopeRef = useRef("needed");
  const reattachSingleScreenshotInputRef = useRef(null);
  const reattachSingleScreenshotRowIdRef = useRef("");
  const lastAutosaveAtRef = useRef(0);
  const completedSinceAutosaveRef = useRef(0);
  const lastReviewedCountForAutosaveRef = useRef(null);
  const [uploadOwner, setUploadOwner] = useState("Me");
  const [uploadBookmaker, setUploadBookmaker] = useState("Auto");
  const [changelog, setChangelog] = useState([
    "v1: initial OCR parser and CSV export",
    "v2: editor, duplicate handling, account owner, source tags, implied probability, confidence",
    "v3: upload owner toggle, editor above table, league and prop detection expanded, QA helpers",
    "v4: local storage, app state import/export, changelog, improved league and prop classification",
    "v5: odds missing reason, stronger college/soccer league fallbacks, image thumbnails, improved upload button and review table",
    "v6: screen type classification, stronger odds/payout fallback, parlay summaries, improved DK hardening",
    "v10: modular action grid + filter bar foundation",
"v11: preview panel cleanup, review-mode UX, cleaner control layout",
    "v12: streamlined Review All / Hedge Review workflow controls",
    "v13: cleaner full-page review, persistent queue reasons, and My Variable tracking",
  ]);
  const noticeTimerRef = useRef(null);
  const appStateSaveTimerRef = useRef(null);
  const enrichedRowCacheRef = useRef(new WeakMap());
  const stableRowsWithWarningsRef = useRef(new Map());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APP_STATE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const loadedRows = Array.isArray(parsed?.rows) ? parsed.rows : [];

      if (loadedRows.length) {
        setRows(loadedRows);
      } else {
        const latestAutosave = getLatestAutosaveSnapshot();

        if (latestAutosave?.rows?.length) {
          setTimeout(() => {
            const savedAt = latestAutosave.savedAt
              ? new Date(latestAutosave.savedAt).toLocaleString()
              : "recent autosave";

            const shouldRestore = window.confirm(
              `No active rows were found in the main saved state, but an autosave has ${latestAutosave.rows.length} row(s) from ${savedAt}. Restore that autosave?`
            );

            if (shouldRestore) {
              restoreAutosaveSnapshot(latestAutosave);
            }
          }, 300);
        }
      }

      if (typeof parsed?.uploadOwner === "string") setUploadOwner(parsed.uploadOwner);
      if (typeof parsed?.uploadBookmaker === "string") setUploadBookmaker(parsed.uploadBookmaker);
      if (Array.isArray(parsed?.changelog)) setChangelog(parsed.changelog);
    } catch (error) {
      console.error("Could not load local app state", error);
    }
  }, []);

  useEffect(() => {
    applySavedFilterView("review_all");
  }, []);

  function refreshStorageStats() {
    try {
      const appKb = Math.round((localStorage.getItem(APP_STATE_STORAGE_KEY)?.length || 0) / 1024);
      const autosaveKb = Math.round((localStorage.getItem(APP_AUTOSAVE_STORAGE_KEY)?.length || 0) / 1024);
      const screenshots = rows.filter((row) => !!row.sourceImageUrl).length;
      setStorageStats({ appKb, autosaveKb, totalKb: appKb + autosaveKb, screenshots });
    } catch (error) {
      setStorageStats((prev) => ({ ...prev, error: "storage_unavailable" }));
    }
  }

  useEffect(() => {
    refreshStorageStats();
    const interval = setInterval(refreshStorageStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(refreshStorageStats, 600);
    return () => clearTimeout(timeout);
  }, [rows]);


  useEffect(() => {
    if (appStateSaveTimerRef.current) {
      clearTimeout(appStateSaveTimerRef.current);
    }

    appStateSaveTimerRef.current = setTimeout(() => {
      saveMainAppState({ silent: true });
      appStateSaveTimerRef.current = null;
    }, APP_STATE_SAVE_DEBOUNCE_MS);

    return () => {
      if (appStateSaveTimerRef.current) {
        clearTimeout(appStateSaveTimerRef.current);
        appStateSaveTimerRef.current = null;
      }
    };
  }, [rows, uploadOwner, uploadBookmaker, changelog]);

  useEffect(() => {
    // Old full autosave arrays can stay in localStorage even after new code is loaded.
    // Compact once on startup so they do not keep eating quota or slowing saves.
    const timeout = setTimeout(() => {
      compactAutosaveStorage({ silent: true });
      saveMainAppState({ silent: true });
    }, 600);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const reviewedCount = rows.filter((row) => row.reviewResolved === "Y").length;

    if (lastReviewedCountForAutosaveRef.current === null) {
      lastReviewedCountForAutosaveRef.current = reviewedCount;
      return;
    }

    const newlyCompleted = Math.max(0, reviewedCount - lastReviewedCountForAutosaveRef.current);
    lastReviewedCountForAutosaveRef.current = reviewedCount;

    if (!newlyCompleted) return;

    completedSinceAutosaveRef.current += newlyCompleted;

    if (completedSinceAutosaveRef.current >= AUTOSAVE_COMPLETED_ROW_INTERVAL) {
      completedSinceAutosaveRef.current = 0;
      saveAutosaveSnapshot("20_completed_rows", { force: true, silent: true });
    }
  }, [rows]);

  useEffect(() => {
    const hasReviewedScreenshots = rows.some(
      (row) => rowShouldDropScreenshotAfterReview(row) && row.sourceImageUrl
    );

    if (!hasReviewedScreenshots) return;

    const timeout = setTimeout(() => {
      clearScreenshotsForReviewedRows({ silent: true });
    }, 250);

    return () => clearTimeout(timeout);
  }, [rows]);

  const rowsWithWarnings = useMemo(() => {
    // Most row edits replace only one row object. Cache enrichRow by object identity
    // so Confirm + Next does not re-enrich every loaded bet before the next image paints.
    const enriched = rows.map((row) => {
      const cached = enrichedRowCacheRef.current.get(row);
      if (cached) return cached;

      const enrichedRow = enrichRow(row);
      const next = preserveLockedAndReviewedFields(row, enrichedRow);

      // Manual review fields are authoritative. Parser/enrichment may fill blanks,
      // but it must never rewrite a league/team/structured prop value the reviewer
      // explicitly saved. This is especially important for NCAAM vs Baseball.
      if (row.sportLeagueManual === "Y" && String(row.sportLeague || "").trim()) {
        next.sportLeague = row.sportLeague;
        next.sportLeagueManual = "Y";
        next.leagueMismatchOverrideKey = row.leagueMismatchOverrideKey || next.leagueMismatchOverrideKey || "";
      }

      if (row.participantAManual === "Y" && String(row.participantA || "").trim()) {
        next.participantA = row.participantA;
        next.participantANormalized = row.participantANormalized || row.participantA;
        next.participantAManual = "Y";
      }

      if (row.participantBManual === "Y" && String(row.participantB || "").trim()) {
        next.participantB = row.participantB;
        next.participantBNormalized = row.participantBNormalized || row.participantB;
        next.participantBManual = "Y";
      }

      if (row.playerSubjectUserEdited === "Y" && String(row.canonicalSubject || row.canonicalPlayer || "").trim()) {
        next.canonicalSubject = row.canonicalSubject || row.canonicalPlayer;
        next.canonicalPlayer = row.canonicalPlayer || row.canonicalSubject;
        next.playerLastName = row.playerLastName || next.playerLastName || "";
        next.playerSubjectManual = "Y";
        next.playerSubjectUserEdited = "Y";
      }

      if (row.propSideManual === "Y") {
        next.propSide = row.propSide || "";
        next.propSideManual = "Y";
      }

      if (row.propLineManual === "Y") {
        next.propLine = row.propLine || "";
        next.propLineManual = "Y";
      }

      enrichedRowCacheRef.current.set(row, next);
      return next;
    });

    // Duplicate detection still sees the complete set, but the final reconciliation
    // below reuses prior row objects when their visible values did not change.
    const withDuplicates = addDuplicateWarnings(enriched);

    // Keep existing/manual hedge fields without cloning every unchanged row.
    const withStoredHedges = normalizeStoredHedgeFields(withDuplicates).map((row) => {
      const stakeAmount = moneyNumber(row.stake);
      const isLargeStakeHedgeReview = stakeAmount > LARGE_STAKE_HEDGE_THRESHOLD_DOLLARS;
      const nextLargeStake = isLargeStakeHedgeReview ? "Y" : "N";
      const nextThreshold = isLargeStakeHedgeReview
        ? String(LARGE_STAKE_HEDGE_THRESHOLD_DOLLARS)
        : "";

      let nextRow = row;

      if (
        String(row.largeStakeHedgeReview || "N") !== nextLargeStake ||
        String(row.largeStakeHedgeThreshold || "") !== nextThreshold
      ) {
        nextRow = {
          ...row,
          largeStakeHedgeReview: nextLargeStake,
          largeStakeHedgeThreshold: nextThreshold,
        };
      }

      return applyMyVariableDefaults(nextRow);
    });

    const previousById = stableRowsWithWarningsRef.current;
    const nextById = new Map();

    const stableRows = withStoredHedges.map((nextRow) => {
      const previousRow = previousById.get(nextRow.id);

      if (previousRow) {
        const previousKeys = Object.keys(previousRow);
        const nextKeys = Object.keys(nextRow);

        if (
          previousKeys.length === nextKeys.length &&
          nextKeys.every(
            (key) => String(previousRow[key] ?? "") === String(nextRow[key] ?? "")
          )
        ) {
          nextById.set(previousRow.id, previousRow);
          return previousRow;
        }
      }

      nextById.set(nextRow.id, nextRow);
      return nextRow;
    });

    stableRowsWithWarningsRef.current = nextById;
    return stableRows;
  }, [rows]);

  
  function getCompactAppStatePayload() {
    return {
      rows: prepareRowsForPersistentStorage(rows, { light: true }),
      uploadOwner,
      uploadBookmaker,
      changelog,
      savedAt: new Date().toISOString(),
      lightStorageMode: true,
    };
  }

  function saveMainAppState(options = {}) {
    const { silent = true } = options;

    try {
      localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(getCompactAppStatePayload()));
      if (!silent) showNotice("Progress saved and browser storage compacted");
      return true;
    } catch (error) {
      console.error("Could not save compact local app state", error);

      try {
        compactAutosaveStorage({ silent: true, removeIfTooLarge: true });
        localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(getCompactAppStatePayload()));
        if (!silent) showNotice("Progress saved after clearing oversized backups");
        return true;
      } catch (fallbackError) {
        console.error("Could not save compact local app state after cleanup", fallbackError);
        if (!silent) showNotice("Could not save progress. Export App State before continuing.");
        return false;
      }
    }
  }

  function compactAutosaveStorage(options = {}) {
    const { silent = false, removeIfTooLarge = false } = options;

    try {
      const latest = getLatestAutosaveSnapshot();

      if (!latest?.rows?.length) {
        localStorage.removeItem(APP_AUTOSAVE_STORAGE_KEY);
        if (!silent) showNotice("Old autosave backups cleared");
        return true;
      }

      const compactSnapshot = {
        id: latest.id || crypto.randomUUID(),
        savedAt: latest.savedAt || new Date().toISOString(),
        reason: latest.reason || "compacted",
        rowCount: latest.rows.length,
        uploadOwner: latest.uploadOwner || uploadOwner,
        uploadBookmaker: latest.uploadBookmaker || uploadBookmaker,
        changelog: [],
        compacted: true,
        lightStorageFallback: true,
        rows: prepareRowsForPersistentStorage(latest.rows, { light: true }),
      };

      localStorage.removeItem(APP_AUTOSAVE_STORAGE_KEY);
      localStorage.setItem(APP_AUTOSAVE_STORAGE_KEY, JSON.stringify([compactSnapshot]));

      if (!silent) showNotice(`Autosave storage compacted to 1 lightweight backup (${compactSnapshot.rowCount} rows)`);
      return true;
    } catch (error) {
      console.error("Could not compact autosave storage", error);

      if (removeIfTooLarge) {
        try {
          localStorage.removeItem(APP_AUTOSAVE_STORAGE_KEY);
          if (!silent) showNotice("Oversized autosave backup removed");
          return true;
        } catch (removeError) {
          console.error("Could not remove oversized autosave backup", removeError);
        }
      }

      if (!silent) showNotice("Could not compact autosave storage");
      return false;
    }
  }

  function clearAutosaveBackups() {
    const confirmed = window.confirm(
      "Clear autosave backups? This does not delete current rows. Use Export App State first if you want an outside backup."
    );

    if (!confirmed) return;

    try {
      localStorage.removeItem(APP_AUTOSAVE_STORAGE_KEY);
      showNotice("Autosave backups cleared");
    } catch (error) {
      console.error("Could not clear autosave backups", error);
      showNotice("Could not clear autosave backups");
    }
  }

  function prepareRowsForPersistentStorage(rowsInput = [], options = {}) {
    const { light = false } = options;

    return (rowsInput || []).map((row) => {
      const next = {
        ...row,
        // Blob URLs do not survive refresh and can make saved state noisy.
        // Reattach uses sourceFileName/sourceRelativePath instead.
        sourceImageUrl: "",
      };

      if (light) {
        next.sourceText = "";
        next.debugTrace = [];
      }

      return next;
    });
  }

  function getAutosaveSnapshots() {
    try {
      const raw = localStorage.getItem(APP_AUTOSAVE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => Array.isArray(item?.rows)) : [];
    } catch (error) {
      console.error("Could not read autosaves", error);
      return [];
    }
  }

  function getLatestAutosaveSnapshot() {
    return getAutosaveSnapshots().sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0] || null;
  }

  function saveAutosaveSnapshot(reason = "manual", options = {}) {
    const { silent = false, force = false } = options;

    if (!rows.length) {
      if (!silent) showNotice("No rows to back up");
      return false;
    }

    const now = Date.now();

    if (!force && now - lastAutosaveAtRef.current < 1000) {
      return false;
    }

    const snapshot = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      reason,
      rowCount: rows.length,
      uploadOwner,
      uploadBookmaker,
      changelog,
      lightStorageFallback: true,
      // Keep backups small. OCR text, debug traces, and blob image URLs are the
      // main browser-storage pressure points and are not needed to restore row progress.
      rows: prepareRowsForPersistentStorage(rows, { light: true }),
    };

    try {
      // Replace old autosaves instead of stacking them. This avoids the browser
      // localStorage quota errors that happened when several full snapshots accumulated.
      localStorage.removeItem(APP_AUTOSAVE_STORAGE_KEY);
      localStorage.setItem(APP_AUTOSAVE_STORAGE_KEY, JSON.stringify([snapshot].slice(0, MAX_AUTOSAVE_SNAPSHOTS)));
      lastAutosaveAtRef.current = now;
      if (!silent) showNotice(`Backup saved: ${rows.length} row${rows.length === 1 ? "" : "s"}`);
      return true;
    } catch (error) {
      console.error("Could not save autosave snapshot", error);

      try {
        // Last-resort ultra-light backup: keep the fields needed to continue review/export,
        // but drop raw OCR/debug/changelog if storage is still tight.
        const ultraLightRows = prepareRowsForPersistentStorage(rows, { light: true }).map((row) => ({
          ...row,
          sourceText: "",
          debugTrace: [],
        }));

        const ultraLightSnapshot = {
          ...snapshot,
          changelog: [],
          ultraLightStorageFallback: true,
          rows: ultraLightRows,
        };

        localStorage.removeItem(APP_AUTOSAVE_STORAGE_KEY);
        localStorage.setItem(APP_AUTOSAVE_STORAGE_KEY, JSON.stringify([ultraLightSnapshot]));
        lastAutosaveAtRef.current = now;
        if (!silent) showNotice("Small backup saved because browser storage was tight");
        return true;
      } catch (fallbackError) {
        console.error("Could not save ultra-light autosave snapshot", fallbackError);
        if (!silent) showNotice("Backup failed. Export App State manually before continuing.");
        return false;
      }
    }
  }

  function restoreAutosaveSnapshot(snapshot) {
    if (!snapshot?.rows?.length) {
      showNotice("No autosave rows found");
      return;
    }

    setRows(snapshot.rows);
    if (typeof snapshot.uploadOwner === "string") setUploadOwner(snapshot.uploadOwner);
    if (typeof snapshot.uploadBookmaker === "string") setUploadBookmaker(snapshot.uploadBookmaker);
    if (Array.isArray(snapshot.changelog)) setChangelog(snapshot.changelog);

    const savedAt = snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString() : "autosave";
    showNotice(`Restored ${snapshot.rows.length} row${snapshot.rows.length === 1 ? "" : "s"} from ${savedAt}`);
  }

  function restoreLatestAutosave() {
    const latest = getLatestAutosaveSnapshot();

    if (!latest?.rows?.length) {
      showNotice("No autosave backups found");
      return;
    }

    const savedAt = latest.savedAt ? new Date(latest.savedAt).toLocaleString() : "latest autosave";
    const confirmed = window.confirm(
      `Restore autosave from ${savedAt} with ${latest.rows.length} row(s)? This replaces the rows currently loaded in the app.`
    );

    if (!confirmed) return;
    restoreAutosaveSnapshot(latest);
  }

  function rowShouldDropScreenshotAfterReview(row = {}) {
    // If a screenshot was manually reattached, keep it visible until the user
    // deletes it manually.
    if (row.sourceImageReattachedKeep === "Y") return false;

    if (row.reviewResolved !== "Y" || row.betDateNeedsConfirm === "Y") return false;

    // Hedge Review now operates only on bets that already completed normal
    // review, so keep screenshots until the post-review hedge scan has run and
    // any unresolved candidate pairs have been decided. Non-candidates can be
    // released immediately after a fresh scan.
    if (row.hedgeScanNeedsRefresh === "Y") return false;
    if (rowNeedsHedgeReview(row)) return false;

    return true;
  }

  function clearScreenshotForRow(row = {}, clearedAt = new Date().toISOString()) {
    if (row.sourceImageUrl && String(row.sourceImageUrl).startsWith("blob:")) {
      try {
        URL.revokeObjectURL(row.sourceImageUrl);
      } catch (error) {
        // Safe to ignore stale blob URLs.
      }
    }

    return {
      ...row,
      sourceImageUrl: "",
      sourceImageClearedSourceName:
        row.sourceImageClearedSourceName ||
        row.sourceRelativePath ||
        row.sourceFileName ||
        row.sourceImageReattachedName ||
        "",
      sourceImageClearedAfterReview: "Y",
      sourceImageClearedAt: clearedAt,
      sourceImageReattachedKeep: "N",
    };
  }

  function clearScreenshotsForRows(rowFilter, options = {}) {
    const { silent = false, label = "screenshots" } = options;
    const clearedAt = new Date().toISOString();
    let clearedCount = 0;

    setRows((prev) =>
      prev.map((row) => {
        if (!row.sourceImageUrl || !rowFilter(row)) return row;
        clearedCount += 1;
        return {
          ...clearScreenshotForRow(row, clearedAt),
          sourceImageClearedManually: "Y",
        };
      })
    );

    if (!silent) {
      showNotice(
        clearedCount
          ? `Deleted ${clearedCount} ${label}${clearedCount === 1 ? "" : "s"}`
          : `No ${label} to delete`
      );
    }

    return clearedCount;
  }

  function clearScreenshotsForReviewedRows(options = {}) {
    return clearScreenshotsForRows(
      (row) => rowShouldDropScreenshotAfterReview(row),
      { ...options, label: "reviewed screenshot" }
    );
  }

  function clearScreenshotsForVisibleRows() {
    const visibleIds = new Set(visibleRows.map((row) => row.id));

    if (!visibleIds.size) {
      showNotice("No visible rows to delete screenshots from");
      return;
    }

    const confirmed = window.confirm(
      `Delete screenshot previews from ${visibleIds.size} visible row${visibleIds.size === 1 ? "" : "s"}? Row data and source filenames stay saved.`
    );

    if (!confirmed) return;

    clearScreenshotsForRows(
      (row) => visibleIds.has(row.id),
      { label: "visible screenshot" }
    );
  }

  function clearScreenshotsForAllRows() {
    const rowsWithScreenshots = rows.filter((row) => row.sourceImageUrl).length;

    if (!rowsWithScreenshots) {
      showNotice("No screenshot previews are currently attached");
      return;
    }

    const confirmed = window.confirm(
      `Delete all ${rowsWithScreenshots} attached screenshot preview${rowsWithScreenshots === 1 ? "" : "s"}? Row data and source filenames stay saved.`
    );

    if (!confirmed) return;

    clearScreenshotsForRows(
      () => true,
      { label: "attached screenshot" }
    );
  }

  function normalizeStoredHedgeFields(rowsInput = []) {
    return (rowsInput || []).map((row) => {
      const confirmed = String(row.hedgeOverride || "").trim().toUpperCase() === "Y";
      const likely =
        confirmed ||
        row.likelyHedge === "Y" ||
        row.autoLikelyHedge === "Y" ||
        !!row.hedgeClusterId ||
        row.guaranteedProfit === "Y";

      const normalized = {
        likelyHedge: likely ? "Y" : "N",
        autoLikelyHedge: likely ? row.autoLikelyHedge || "Y" : "N",
        hedgeClusterId: row.hedgeClusterId || "",
        hedgeClusterSize: row.hedgeClusterSize || "",
        hedgePartnerBookmaker: row.hedgePartnerBookmaker || "",
        hedgeConfidence: row.hedgeConfidence || (confirmed ? "Confirmed" : ""),
        hedgeQuality: row.hedgeQuality || (confirmed ? "Confirmed Hedge" : ""),
        guaranteedProfit: row.guaranteedProfit || "N",
        guaranteedProfitAmount: row.guaranteedProfitAmount || "",
        hedgeStake: row.hedgeStake || "",
        hedgeProfitLow: row.hedgeProfitLow || "",
        hedgeProfitHigh: row.hedgeProfitHigh || "",
        hedgeProfitIfThisWins: row.hedgeProfitIfThisWins || "",
        hedgeProfitIfOtherWins: row.hedgeProfitIfOtherWins || "",
      };

      const changed = Object.entries(normalized).some(
        ([field, value]) => String(row[field] ?? "") !== String(value ?? "")
      );

      return changed ? { ...row, ...normalized } : row;
    });
  }

  function getHedgeFieldsFromScannedRow(scannedRow = {}, originalRow = {}) {
    const next = {};

    HEDGE_SCAN_FIELDS.forEach((field) => {
      if (field in scannedRow) next[field] = scannedRow[field];
    });

    // Preserve manual confirmation metadata if the scan no longer finds a pair.
    if (String(originalRow.hedgeOverride || "").trim().toUpperCase() === "Y" && next.likelyHedge !== "Y") {
      next.likelyHedge = "Y";
      next.autoLikelyHedge = originalRow.autoLikelyHedge || "Y";
      next.hedgeQuality = originalRow.hedgeQuality || "Confirmed Hedge";
      next.hedgeConfidence = originalRow.hedgeConfidence || "Confirmed";
    }

    return next;
  }

    
  function rowNeedsReview(row) {
    if (!row) return false;
    const issues = getActiveReviewDataIssues(row, { includeAdvisory: true });
    return row.reviewResolved !== "Y" || issues.length > 0;
  }

  function rowEligibleForHedgePairing(row = {}) {
    if (!row || rowIsArchived(row)) return false;
    if (row.reviewResolved !== "Y") return false;
    return getActiveReviewDataIssues(row, { includeAdvisory: true }).length === 0;
  }

  function getHedgeIdList(value = "") {
    return String(value || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getUnhandledHedgeCandidateIds(row = {}) {
    const candidateIds = getHedgeIdList(row.hedgeCandidateIds);

    if (!candidateIds.length) return [];

    const ignoredIds = new Set(getHedgeIdList(row.ignoredHedgePartnerIds));
    const confirmedIds = new Set(
      getHedgeIdList(row.confirmedHedgePartnerIds || row.hedgePartnerIds)
    );

    return candidateIds.filter(
      (id) => id && !ignoredIds.has(id) && !confirmedIds.has(id)
    );
  }

  function rowHasAllStoredHedgeCandidatesHandled(row = {}) {
    const candidateIds = getHedgeIdList(row.hedgeCandidateIds);

    if (!candidateIds.length) return false;

    return getUnhandledHedgeCandidateIds(row).length === 0;
  }

  function rowHasConfirmedHedge(row = {}) {
    const sourceTag = String(row.betSourceTag || "").toLowerCase();

    return !!(
      row.hedgeOverride === "Y" ||
      sourceTag === "hedge" ||
      sourceTag === "middle" ||
      getHedgeIdList(row.confirmedHedgePartnerIds || row.hedgePartnerIds).length > 0
    );
  }

  function rowHasDeniedOrHiddenHedgeDecision(row = {}) {
    return !!(
      row.hedgeOverride === "N" ||
      getHedgeIdList(row.ignoredHedgePartnerIds).length > 0 ||
      rowHasAllStoredHedgeCandidatesHandled(row)
    );
  }

  function rowNeedsHedgeReview(row = {}) {
    if (!rowEligibleForHedgePairing(row)) return false;
    if (rowHasConfirmedHedge(row)) return false;
    if (row.hedgeOverride === "N") return false;
    if (rowHasAllStoredHedgeCandidatesHandled(row)) return false;

    // Dedicated Hedge Review is pair-based. A reviewed row enters only when it
    // has at least one unresolved stored candidate from a fresh scan. Large
    // stake alone is not a pair and belongs nowhere in normal Review All.
    return getUnhandledHedgeCandidateIds(row).length > 0;
  }

  function getUnresolvedHedgePairKeys(rowsInput = []) {
    const byId = new Map((rowsInput || []).map((row) => [row.id, row]));
    const pairKeys = new Set();

    (rowsInput || []).forEach((row) => {
      if (!rowEligibleForHedgePairing(row) || rowHasConfirmedHedge(row)) return;
      getUnhandledHedgeCandidateIds(row).forEach((partnerId) => {
        const partner = byId.get(partnerId);
        if (!partner || !rowEligibleForHedgePairing(partner) || rowHasConfirmedHedge(partner)) return;
        const key = [row.id, partner.id].sort().join("__");
        pairKeys.add(key);
      });
    });

    return [...pairKeys];
  }

  function rowWasEverHedgeCandidate(row = {}) {
    if (!row || rowIsArchived(row)) return false;

    const quality = String(row.hedgeQuality || "").toLowerCase();
    const sourceTag = String(row.betSourceTag || "").toLowerCase();
    const candidateIds = String(row.hedgeCandidateIds || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const ignoredIds = String(row.ignoredHedgePartnerIds || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);

    return !!(
      row.everHedgeCandidate === "Y" ||
      row.everLikelyHedge === "Y" ||
      row.likelyHedge === "Y" ||
      row.autoLikelyHedge === "Y" ||
      row.hedgeOverride === "Y" ||
      row.hedgeOverride === "N" ||
      row.guaranteedProfit === "Y" ||
      !!row.hedgeClusterId ||
      candidateIds.length > 0 ||
      ignoredIds.length > 0 ||
      !!row.lastHedgePairDecisionAt ||
      quality.includes("hedge") ||
      quality.includes("middle") ||
      quality.includes("payout match") ||
      sourceTag === "hedge" ||
      sourceTag === "middle"
    );
  }

  function rowIsArchived(row = {}) {
    const value = row?.archived;
    const text = String(value ?? "").trim().toLowerCase();

    return value === true || ["y", "yes", "true", "1", "archived"].includes(text);
  }

  function normalizeRowSearchValue(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[\xe2\u20ac\u2122]/g, "'")
      .replace(/[^a-z0-9+.'-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getRowSearchHaystack(row = {}) {
    return normalizeRowSearchValue([
      row.selection,
      row.fixtureEvent,
      row.eventName,
      row.sportLeague,
      row.bookmaker,
      getDisplayedBookmaker(row),
      row.accountOwner,
      row.betType,
      row.betSourceTag,
      row.myVariable,
      getSuggestedMyVariable(row),
      row.marketType,
      row.marketDetail,
      row.canonicalMarketContext,
      row.propMarket,
      row.participantA,
      row.participantANormalized,
      row.participantB,
      row.participantBNormalized,
      row.mainLineSide,
      row.canonicalSubject,
      row.canonicalPlayer,
      row.playerLastName,
      row.status,
      row.win,
      row.stake,
      row.oddsUS,
      row.payout,
      row.betDate,
      row.eventDate,
      row.betId,
      row.sourceFileName,
      row.sourceRelativePath,
      row.uploadBatchLabel,
      row.uploadBatchFolder,
      row.parentFolder,
      row.folder,
      row.hedgePartnerBookmaker,
      row.hedgeQuality,
      row.hedgeConfidence,
      row.hedgeCandidateSummary,
      row.hedgeCandidateIds,
      row.confirmedHedgePartnerIds,
      row.ignoredHedgePartnerIds,
      row.parseWarning,
      row.reviewNotes,
    ].filter(Boolean).join(" "));
  }

  function rowMatchesSearch(row = {}, rawQuery = "") {
    const query = normalizeRowSearchValue(rawQuery);
    if (!query) return true;

    const haystack = getRowSearchHaystack(row);
    if (!haystack) return false;

    return query
      .split(/\s+/)
      .filter(Boolean)
      .every((term) => haystack.includes(term));
  }

  const visibleRows = useMemo(() => {
    let next = rowsWithWarnings;
    const view = savedFilterView || "review_all";

    if (view === "archived") {
      next = next.filter((row) => rowIsArchived(row));
    } else {
      next = next.filter((row) => !rowIsArchived(row));
    }

    const activeSearchQuery = String(rowSearchQuery || "").trim();

    if (activeSearchQuery) {
      // Search intentionally scans all rows in the current archive scope rather than
      // only the current workflow queue. This makes it useful for finding whether a
      // hedge partner was uploaded even after that row was reviewed/resolved.
      next = next.filter((row) => rowMatchesSearch(row, activeSearchQuery));
    } else if (view === "review_all" || view === "review_queue" || view === "needs_review") {
      next = next.filter((row) => rowNeedsReviewAllQueue(row));
    } else if (view === "hedge_review") {
      next = next.filter((row) => rowNeedsHedgeReview(row));
    } else if (view === "hedge_history") {
      next = next.filter((row) => rowWasEverHedgeCandidate(row));
    } else if (view === "parser_issues") {
      next = next.filter((row) => row.likelyParserIssue === "Y");
    } else if (view === "all_active" || view === "default") {
      // Show all active rows.
    }

    next = [...next].sort((a, b) => {
      const bucketOrder = { Critical: 0, High: 1, Standard: 2, Later: 3 };

      const bucketA = bucketOrder[a.reviewBucket] ?? 99;
      const bucketB = bucketOrder[b.reviewBucket] ?? 99;
      if (bucketA !== bucketB) return bucketA - bucketB;

      const priorityA = Number(a.reviewPriority || 0);
      const priorityB = Number(b.reviewPriority || 0);
      if (priorityA !== priorityB) return priorityB - priorityA;

      const dateA = String(a.betDate || a.eventDate || "");
      const dateB = String(b.betDate || b.eventDate || "");
      return dateB.localeCompare(dateA);
    });

    return groupHedgeRowsTogether(next);
  }, [rowsWithWarnings, savedFilterView, rowSearchQuery]);

const startHedgeReviewMode = async () => {
  if (hedgeEligibleRowCount < 2) {
    showNotice("Need at least two clean Confirm + Next bets before Hedge Review can build pairs.");
    return;
  }

  setRowSearchQuery("");
  await runManualHedgeScan({ launchAfterScan: true });
};


const startReviewSession = () => {
  setReviewSessionStartedAt(Date.now());
  setReviewSessionStartingCount(reviewAllCount);
  applySavedFilterView("review_all");
};

const captureUndoSnapshot = (label = "Review change", rowId = "") => {
  const now = Date.now();
  const last = undoCaptureRef.current;

  // Group rapid edits on the same row into one undo step so typing does not
  // create dozens of nearly identical snapshots.
  if (last.rowId === rowId && now - last.at < 1200) {
    undoCaptureRef.current = { rowId, at: now };
    return;
  }

  undoCaptureRef.current = { rowId, at: now };
  const snapshot = {
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    at: now,
    rows,
  };

  setUndoStack((prev) => [...prev, snapshot].slice(-15));
};

const undoLastReviewChange = () => {
  const last = undoStack[undoStack.length - 1];
  if (!last) {
    showNotice("Nothing to undo");
    return;
  }

  setRows(last.rows);
  setUndoStack((prev) => prev.slice(0, -1));
  showNotice(`Undid: ${last.label}`);
};


const nextBestReviewRow = useMemo(() => {
  return visibleRows.find((row) => row.reviewLater === "Y") || visibleRows[0] || null;
}, [visibleRows]);

const jumpToNextBestReviewRow = () => {
  if (nextBestReviewRow) {
    setSelectedRowId(nextBestReviewRow.id);
  }
};

const reviewedCount = rowsWithWarnings.filter(
  (row) => row.reviewResolved === "Y"
).length;

const exportableCount = rowsWithWarnings.filter(
  (row) => !rowIsArchived(row)
).length;

const activeRowsForWorkflow = rowsWithWarnings.filter((row) => !rowIsArchived(row));
const reviewAllCount = activeRowsForWorkflow.filter(rowNeedsReviewAllQueue).length;
const hedgeReviewCount = getUnresolvedHedgePairKeys(activeRowsForWorkflow).length;
const hedgeEligibleRowCount = activeRowsForWorkflow.filter(rowEligibleForHedgePairing).length;
const hedgeHistoryCount = activeRowsForWorkflow.filter(rowWasEverHedgeCandidate).length;
const exportReadyCount = activeRowsForWorkflow.filter(rowIsExportReady).length;
const cleanNotMarkedReviewedCount = activeRowsForWorkflow.filter(
  (row) => getReviewPassStatus(row) === "Clean"
).length;
const archivedCount = rowsWithWarnings.filter(rowIsArchived).length;
const hedgeScanStaleCount = rowsWithWarnings.filter((row) => row.hedgeScanNeedsRefresh === "Y").length;

const counts = {
  total: rowsWithWarnings.length,
  visible: visibleRows.length,
  reviewAll: reviewAllCount,
  hedgeReview: hedgeReviewCount,
  hedgeHistory: hedgeHistoryCount,
  largeStakeHedgeReview: rowsWithWarnings.filter((row) => row.largeStakeHedgeReview === "Y" || moneyNumber(row.stake) > LARGE_STAKE_HEDGE_THRESHOLD_DOLLARS).length,
  needsReview: rowsWithWarnings.filter((row) => rowNeedsReview(row)).length,
  reviewLater: rowsWithWarnings.filter((row) => row.reviewLater === "Y").length,
  lowConfidence: rowsWithWarnings.filter((row) => row.confidenceFlag === "Low").length,
  parserIssues: rowsWithWarnings.filter((row) => row.likelyParserIssue === "Y").length,
  archived: rowsWithWarnings.filter(rowIsArchived).length,
  hedges: rowsWithWarnings.filter((row) => row.likelyHedge === "Y").length,
  guaranteedProfit: rowsWithWarnings.filter((row) => row.guaranteedProfit === "Y").length,
  hedgeCritical: rowsWithWarnings.filter((row) => rowIsHedgeCritical(row)).length,
  unconfirmedDates: rowsWithWarnings.filter((row) => row.betDateNeedsConfirm === "Y").length,
  exportReady: rowsWithWarnings.filter(rowIsExportReady).length,
  cleanNotMarkedReviewed: cleanNotMarkedReviewedCount,
  payoutMatchedHedges: rowsWithWarnings.filter((row) =>
    String(row.hedgeQuality || "").toLowerCase().includes("payout match")
  ).length,
  possibleHedgesNotReviewed: rowsWithWarnings.filter(rowHasUnresolvedHedgeReview).length,
  selected: selectedIds.length,
  reviewed: reviewedCount,
  exportable: exportableCount,
};

const archivedLoadedRowsCount = rowsWithWarnings.filter(rowIsArchived).length;
const activeLoadedRowsCount = rowsWithWarnings.filter((row) => !rowIsArchived(row)).length;
const filterBaseCount =
  savedFilterView === "archived"
    ? archivedLoadedRowsCount
    : showArchivedRows
    ? rowsWithWarnings.length
    : activeLoadedRowsCount;
const hiddenByFiltersCount = Math.max(0, filterBaseCount - visibleRows.length);
const visibleNeedsReviewCount = visibleRows.filter((row) => rowNeedsReview(row)).length;
const visibleReviewedCount = visibleRows.filter((row) => row.reviewResolved === "Y").length;
const visibleReviewLaterCount = visibleRows.filter((row) => row.reviewLater === "Y").length;
const visibleArchivedCount = visibleRows.filter(rowIsArchived).length;
const visibleHedgeCount = visibleRows.filter((row) => row.likelyHedge === "Y").length;
const visibleParserIssueCount = visibleRows.filter((row) => row.likelyParserIssue === "Y").length;

const getWorkflowViewLabel = (view = savedFilterView) => {
  if (view === "review_all" || view === "review_queue" || view === "needs_review") return "Review All";
  if (view === "hedge_review") return "Hedge Review";
  if (view === "all_active" || view === "default") return "All Active";
  if (view === "archived") return "Archived";
  if (view === "parser_issues") return "Parser Issues";
  return String(view || "Review All").replace(/_/g, " ");
};

const activeFilterLabels = [
  `View: ${getWorkflowViewLabel()}`,
  rowSearchQuery.trim() ? `Search: ${rowSearchQuery.trim()}` : "",
  tableMode === "simplified" ? "Simplified table" : "Debug table",
  savedFilterView === "archived" ? "Archived Only" : "Active Only",
].filter(Boolean);

const busyMessage = processing
  ? processingMessage || "Reading images..."
  : backgroundTaskMessage;
const isHedgeScanRunning = /hedge scan/i.test(backgroundTaskMessage);
const batchQaIssues = getBatchQaIssues(activeRowsForWorkflow);
const batchQaHighCount = batchQaIssues.filter((issue) => issue.severity === "high").length;
const reviewSessionElapsedMinutes = Math.max(0, Math.floor((Date.now() - reviewSessionStartedAt) / 60000));
const reviewSessionCompleted = Math.max(0, reviewSessionStartingCount - reviewAllCount);
const reviewSessionCounts = {
  missingDate: activeRowsForWorkflow.filter((row) => !row.betDate || row.betDateNeedsConfirm === "Y").length,
  missingContext: activeRowsForWorkflow.filter((row) => !row.sportLeague || !row.fixtureEvent).length,
  parserIssue: activeRowsForWorkflow.filter((row) => row.likelyParserIssue === "Y").length,
  simpleConfirm: activeRowsForWorkflow.filter((row) => getReviewPassStatus(row) === "Clean").length,
};

  const selectedRow =
    rowsWithWarnings.find((row) => row.id === selectedRowId) || null;

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  };

  const selectedVisibleIds = visibleRows.map((row) => row.id);
  const allVisibleSelected =
    selectedVisibleIds.length > 0 && selectedVisibleIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    if (!selectedRowId && visibleRows.length > 0) setSelectedRowId(visibleRows[0].id);
    if (
      selectedRowId &&
      rowsWithWarnings.length > 0 &&
      !rowsWithWarnings.some((row) => row.id === selectedRowId)
    ) {
      setSelectedRowId(visibleRows[0]?.id || rowsWithWarnings[0]?.id || "");
    }
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

  const selectNextNeedsReviewAfter = (id) => {
    const index = visibleRows.findIndex((row) => row.id === id);
    if (index === -1) return;

    const after = visibleRows.slice(index + 1);
    const before = visibleRows.slice(0, index).reverse();

    const nextNeedsReview =
      after.find((row) => rowNeedsReview(row) || row.reviewLater === "Y") ||
      before.find((row) => rowNeedsReview(row) || row.reviewLater === "Y") ||
      after[0] ||
      before[0] ||
      null;

    if (nextNeedsReview) setSelectedRowId(nextNeedsReview.id);
  };

  const selectNextHedgeRow = () => {
    const next = visibleRows.find(
      (row) => row.likelyHedge === "Y" && row.reviewResolved !== "Y"
    );
    if (next) setSelectedRowId(next.id);
  };


  function classifySideKey(row) {
    const selection = String(row?.selection || "").toLowerCase().trim();
    const marketDetail = String(row?.marketDetail || "").toLowerCase().trim();
    const betType = String(row?.betType || "").toLowerCase().trim();

    if (!selection && !marketDetail) return "";

    if (betType === "moneyline") {
      return `moneyline:${selection}`;
    }

    if (betType === "spread") {
      return `spread:${selection}`;
    }

    if (betType === "total") {
      const totalText = `${selection} ${marketDetail}`.toLowerCase();

      const noOver = totalText.match(/\bno on over\s+(\d+(?:\.\d+)?)/i);
      if (noOver) return `total:under:${noOver[1]}`;

      const noUnder = totalText.match(/\bno on under\s+(\d+(?:\.\d+)?)/i);
      if (noUnder) return `total:over:${noUnder[1]}`;

      const over = totalText.match(/\bover\s+(\d+(?:\.\d+)?)/i);
      if (over) return `total:over:${over[1]}`;

      const under = totalText.match(/\bunder\s+(\d+(?:\.\d+)?)/i);
      if (under) return `total:under:${under[1]}`;
    }

    return `${betType}:${selection}`;
  }

  function normalizeSimpleHedgeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePropMarketForHedge(value = "") {
    const text = normalizeSimpleHedgeText(value);

    if (!text) return "";

    if (/assist/.test(text)) return "assists";
    if (/rebound/.test(text)) return "rebounds";
    if (/\bpoints?\b|\bpts\b/.test(text)) return "points";
    if (/three|3 pointer|3 pointers|threes/.test(text)) return "threes";
    if (/double double/.test(text)) return "double-double";
    if (/triple double/.test(text)) return "triple-double";
    if (/shot.*goal|sog/.test(text)) return "shots-on-goal";
    if (/anytime.*goal|goalscorer|goal scorer|player goals|\bgoals?\b/.test(text)) return "goals";
    if (/save/.test(text)) return "saves";
    if (/strikeout|ks\b/.test(text)) return "strikeouts";
    if (/total base/.test(text)) return "total-bases";
    if (/home run|homer/.test(text)) return "home-runs";
    if (/hit\b|hits\b/.test(text)) return "hits";
    if (/rbi/.test(text)) return "rbis";

    return text;
  }

  function getPlayerLastNameForHedge(row = {}) {
    const raw =
      row.playerLastName ||
      row.canonicalSubject ||
      row.canonicalPlayer ||
      row.canonicalTeam ||
      "";

    const cleaned = normalizeSimpleHedgeText(raw);
    if (!cleaned) return "";

    const parts = cleaned.split(" ").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  function makePossiblePlayerPropHedgeKey(row = {}) {
    const betDate = String(row.betDate || "").trim();
    if (!betDate) return "";

    const bookmaker = String(row.bookmaker || "").trim();
    if (!bookmaker) return "";

    const marketSource =
      row.propMarket ||
      row.canonicalMarketContext ||
      row.marketDetail ||
      row.canonicalMarketFamily ||
      "";

    const propMarket = normalizePropMarketForHedge(marketSource);
    const lastName = getPlayerLastNameForHedge(row);

    if (!lastName || !propMarket) return "";

    // This intentionally does NOT require fixture/event because this is a weak possible-hedge rescue.
    // Exact hedge logic can still use canonical fixture/side/line when available.
    const league = String(row.sportLeague || "").trim().toLowerCase();

    return [betDate, league, lastName, propMarket].join("||");
  }

    function moneyNumber(value = "") {
    const n = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function getPotentialReturnAmount(row = {}) {
    const payout = moneyNumber(row.payout);
    const stake = moneyNumber(row.stake);
    const toWin = moneyNumber(row.toWin);
    const odds = Number(row.oddsUS);

    // Actual positive payout or potential return.
    if (payout > 0) return payout;

    // stake + toWin is the cleanest fallback.
    if (stake > 0 && toWin > 0) return stake + toWin;

    // Calculate potential return from American odds.
    if (stake > 0 && Number.isFinite(odds) && odds !== 0) {
      const profit =
        odds > 0
          ? (stake * odds) / 100
          : (stake * 100) / Math.abs(odds);

      return stake + profit;
    }

    return 0;
  }

  function parseRowDate(value = "") {
    const s = String(value || "").trim();
    if (!s) return null;

    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  function getRowDateCandidates(row = {}) {
    return [row.betDate, row.eventDate]
      .map(parseRowDate)
      .filter(Boolean);
  }

  function rowsWithinDateWindow(rowA = {}, rowB = {}, maxDays = HEDGE_DATE_WINDOW_DAYS) {
    const datesA = getRowDateCandidates(rowA);
    const datesB = getRowDateCandidates(rowB);

    // If a parser missed date, do not allow payout-only matching.
    if (!datesA.length || !datesB.length) return false;

    for (const a of datesA) {
      for (const b of datesB) {
        const diffDays = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= maxDays) return true;
      }
    }

    return false;
  }

  function hasWeakHedgeContext(row = {}) {
    const selection = normalizeSimpleHedgeText(row.selection);
    const marketDetail = normalizeSimpleHedgeText(row.marketDetail);
    const fixture = normalizeSimpleHedgeText(row.fixtureEvent);
    const league = normalizeSimpleHedgeText(row.sportLeague);
    const betType = normalizeSimpleHedgeText(row.betType);
    const warning = normalizeSimpleHedgeText(row.parseWarning);

    if (!selection || !fixture || !league) return true;

    // Generic selections often happen when the book/settled screen hides the full line.
    if (
      /^(yes|no|over|under|o|u|win|won|lost|points|spread|moneyline|total)$/.test(
        selection
      )
    ) {
      return true;
    }

    // "Under 5.5" without player/team/fixture context is weak.
    if (/^(over|under)\s+\d+(?:\.\d+)?$/.test(selection) && (!fixture || !marketDetail)) {
      return true;
    }

    if (warning.includes("missing") || warning.includes("needs review")) return true;

    if (
      betType.includes("player prop") &&
      (!row.playerLastName || !row.propMarket)
    ) {
      return true;
    }

    return false;
  }

  function classifyPayoutMatchedWeakHedge(rowA = {}, rowB = {}) {
    const bookmakerA = String(rowA.bookmaker || "").trim().toLowerCase();
    const bookmakerB = String(rowB.bookmaker || "").trim().toLowerCase();

    if (!bookmakerA || !bookmakerB || bookmakerA === bookmakerB) return "";

    const stakeA = moneyNumber(rowA.stake);
    const stakeB = moneyNumber(rowB.stake);
    const returnA = getPotentialReturnAmount(rowA);
    const returnB = getPotentialReturnAmount(rowB);

    if (stakeA <= 0 || stakeB <= 0 || returnA <= 0 || returnB <= 0) return "";
    if (!rowsWithinDateWindow(rowA, rowB)) return "";

    const returnDiff = Math.abs(returnA - returnB);
    if (returnDiff > PAYOUT_MATCH_TOLERANCE_DOLLARS) return "";

    // Make this a rescue rule. It should not flood clean, fully-contexted rows.
    if (!hasWeakHedgeContext(rowA) && !hasWeakHedgeContext(rowB)) return "";

    const totalStake = stakeA + stakeB;
    const profitA = returnA - totalStake;
    const profitB = returnB - totalStake;
    const lowProfit = Math.min(profitA, profitB);

    if (lowProfit >= 0) return "PAYOUT_MATCH_GUARANTEED_PROFIT";

    // Rollover hedges can intentionally lock in a small loss.
    if (lowProfit >= -SMALL_HEDGE_LOSS_TOLERANCE_DOLLARS) {
      return "PAYOUT_MATCH_SMALL_GUARANTEED_LOSS";
    }

    return "PAYOUT_MATCH_NEEDS_REVIEW";
  }

  function getClusterProfitSummary(clusterRows = [], currentRow = {}) {
    const totalStake = clusterRows.reduce((sum, row) => sum + moneyNumber(row.stake), 0);
    const outcomeProfits = clusterRows
      .map((row) => ({
        row,
        returnAmount: getPotentialReturnAmount(row),
      }))
      .filter((item) => item.returnAmount > 0)
      .map((item) => ({
        row: item.row,
        profit: item.returnAmount - totalStake,
      }));

    if (!outcomeProfits.length || totalStake <= 0) {
      return {
        totalStake: "",
        low: "",
        high: "",
        ifThisWins: "",
        ifOtherWins: "",
        guaranteedProfit: "N",
        guaranteedProfitAmount: "",
      };
    }

    const profits = outcomeProfits.map((item) => item.profit);
    const low = Math.min(...profits);
    const high = Math.max(...profits);

    const currentOutcome = outcomeProfits.find((item) => item.row.id === currentRow.id);
    const otherOutcome = outcomeProfits.find((item) => item.row.id !== currentRow.id);

    return {
      totalStake: totalStake.toFixed(2),
      low: low.toFixed(2),
      high: high.toFixed(2),
      ifThisWins: currentOutcome ? currentOutcome.profit.toFixed(2) : "",
      ifOtherWins: otherOutcome ? otherOutcome.profit.toFixed(2) : "",
      guaranteedProfit: low >= 0 ? "Y" : "N",
      guaranteedProfitAmount: low.toFixed(2),
    };
  }

  function appendWarning(existing = "", warning = "") {
    if (!warning) return existing || "";

    const parts = String(existing || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.includes(warning)) parts.push(warning);

    return parts.join(" | ");
  }

  function normalizeHedgeEntityText(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[\xe2\u20ac\u0153\xe2\u20ac\x9d]/g, '"')
      .replace(/[\xe2\u20ac\u2122]/g, "'")
      .replace(/\bneutral\s+(?:venue|site|court|field|stadium|arena|ice|location)\b/g, " ")
      .replace(/\b(?:university\s+of|univ\s+of)\b/g, " ")
      .replace(/\b(?:university|college)\b/g, " ")
      .replace(/\b(?:moneyline|ml|spread|run\s*line|puck\s*line|total|game\s*total)\b/g, " ")
      .replace(/\b(?:over|under|yes|no|win|wins|winner)\b/g, " ")
      .replace(/[+-]?\d+(?:\.\d+)?\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeHedgeEventText(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[\xe2\u20ac\u0153\xe2\u20ac\x9d]/g, '"')
      .replace(/[\xe2\u20ac\u2122]/g, "'")
      .replace(/\bneutral\s+(?:venue|site|court|field|stadium|arena|ice|location)\b/g, " ")
      .replace(/[^a-z0-9@]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseEventParticipantsForHedge(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return [];

    const parts = raw
      .split(/\s+(?:@|vs\.?|v\.?|at)\s+/i)
      .map(normalizeHedgeEntityText)
      .filter(Boolean);

    return parts.length >= 2 ? parts.slice(0, 2) : [];
  }

  function getParticipantSetForHedge(row = {}) {
    const direct = [
      row.participantANormalized || row.participantA,
      row.participantBNormalized || row.participantB,
    ]
      .map(normalizeHedgeEntityText)
      .filter(Boolean);

    if (direct.length >= 2) {
      return Array.from(new Set(direct.slice(0, 2))).sort();
    }

    const fromFixture = parseEventParticipantsForHedge(row.fixtureEvent || row.eventName || "");
    if (fromFixture.length >= 2) {
      return Array.from(new Set(fromFixture.slice(0, 2))).sort();
    }

    return [];
  }

  function rowsHaveSameEventRegardlessOfOrder(rowA = {}, rowB = {}) {
    const eventA = normalizeHedgeEventText(rowA.fixtureEvent || rowA.eventName || "");
    const eventB = normalizeHedgeEventText(rowB.fixtureEvent || rowB.eventName || "");

    if (eventA && eventB && eventA === eventB) return true;

    const setA = getParticipantSetForHedge(rowA);
    const setB = getParticipantSetForHedge(rowB);

    if (setA.length >= 2 && setB.length >= 2) {
      return setA.length === setB.length && setA.every((value, index) => value === setB[index]);
    }

    return false;
  }

  function normalizeMainLineMarketForHedge(row = {}) {
    const text = normalizeSimpleHedgeText([
      row.reviewMarketType,
      row.betType,
      row.canonicalMarketFamily,
      row.canonicalMarketContext,
      row.marketDetail,
      row.selection,
    ].filter(Boolean).join(" "));

    if (!text) return "";
    if (/moneyline|match winner|winner/.test(text)) return "moneyline";
    if (/spread|run line|puck line|handicap/.test(text)) return "spread";
    if (/total|over under|o u|game total/.test(text)) return "total";

    return "";
  }

  function normalizeMainLineSideForHedge(row = {}, market = "") {
    const sideText = [
      row.mainLineSide,
      row.canonicalTeam,
      row.canonicalResultTarget,
      row.selection,
    ].filter(Boolean).join(" ");

    if (market === "total") {
      const side = String(sideText || row.marketDetail || "").toLowerCase();
      if (/\bover\b|^o\b/.test(side)) return "over";
      if (/\bunder\b|^u\b/.test(side)) return "under";
      return "";
    }

    return normalizeHedgeEntityText(sideText);
  }

  function getMainLineNumberForHedge(row = {}) {
    const sources = [
      row.mainLineLine,
      row.canonicalLine,
      row.selection,
      row.marketDetail,
    ];

    for (const source of sources) {
      const text = String(source || "").trim();
      if (!text) continue;
      const match = text.match(/[+-]?\d+(?:\.\d+)?/);
      if (!match) continue;
      const n = Number(match[0]);
      if (Number.isFinite(n)) return n;
    }

    return NaN;
  }

  function lineNumbersAreSame(valueA, valueB) {
    return Number.isFinite(valueA) && Number.isFinite(valueB) && Math.abs(valueA - valueB) < 0.0001;
  }

  function lineNumbersAreOpposite(valueA, valueB) {
    return Number.isFinite(valueA) && Number.isFinite(valueB) && Math.abs(valueA + valueB) < 0.0001;
  }

  function classifyOrderInsensitiveMainLineHedge(rowA = {}, rowB = {}) {
    const marketA = normalizeMainLineMarketForHedge(rowA);
    const marketB = normalizeMainLineMarketForHedge(rowB);

    if (!marketA || !marketB || marketA !== marketB) return false;
    if (!rowsHaveSameEventRegardlessOfOrder(rowA, rowB)) return false;

    const sideA = normalizeMainLineSideForHedge(rowA, marketA);
    const sideB = normalizeMainLineSideForHedge(rowB, marketB);

    if (!sideA || !sideB || sideA === sideB) return false;

    if (marketA === "moneyline") {
      return "EXACT_HEDGE";
    }

    const lineA = getMainLineNumberForHedge(rowA);
    const lineB = getMainLineNumberForHedge(rowB);

    if (marketA === "total") {
      const oppositeTotalSide =
        (sideA === "over" && sideB === "under") ||
        (sideA === "under" && sideB === "over");

      if (!oppositeTotalSide) return false;
      if (lineNumbersAreSame(lineA, lineB)) return "EXACT_HEDGE";
      if (Number.isFinite(lineA) && Number.isFinite(lineB)) return "MIDDLE";
      return "POSSIBLE_PLAYER_PROP_HEDGE";
    }

    if (marketA === "spread") {
      // Exact spread hedge should be order-insensitive and college-safe:
      // Houston +1.5 vs Arizona -1.5 is an exact opposite even if the event is
      // stored as Houston @ Arizona on one row and Arizona @ Houston on the other.
      if (lineNumbersAreOpposite(lineA, lineB)) return "EXACT_HEDGE";

      // Some books/OCR normalize spread lines without signs or with inconsistent signs.
      // If the rows are on opposite sides of the same event and the absolute line is
      // identical, keep it as a likely hedge instead of missing it.
      if (
        Number.isFinite(lineA) &&
        Number.isFinite(lineB) &&
        Math.abs(Math.abs(lineA) - Math.abs(lineB)) < 0.0001
      ) {
        return "EXACT_HEDGE";
      }

      if (Number.isFinite(lineA) && Number.isFinite(lineB)) return "MIDDLE";
      return "POSSIBLE_PLAYER_PROP_HEDGE";
    }

    return false;
  }

  function rowIsExcludedFromAutomaticHedgeMatching(row = {}) {
    // My Variable is intentionally NOT consulted here. A bet may begin as EV+
    // and later be identified as a matched hedge; hedge discovery then changes
    // My Variable to matched rather than My Variable suppressing the scan.
    const values = [
      row.betType,
      row.reviewBetKind,
      row.reviewMarketType,
      row.canonicalMarketContext,
      row.canonicalMarket,
      row.canonicalMarketFamily,
    ]
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/[._-]+/g, " ")
          .replace(/\s+/g, " ")
      )
      .filter(Boolean);

    return values.some((value) =>
      [
        "parlay",
        "same game parlay",
        "sgp",
        "promo special",
        "sportsbook special",
        "promotion special",
      ].includes(value)
    );
  }

  function normalizeHedgeMarketText(value = "") {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function getHedgeMarketIdentity(row = {}) {
    const text = normalizeHedgeMarketText([
      row.reviewBetKind,
      row.betType,
      row.reviewMarketType,
      row.canonicalMarketContext,
      row.canonicalMarketFamily,
      row.marketType,
      row.marketDetail,
    ].filter(Boolean).join(" "));

    const propMarket = normalizePropMarketForHedge(
      row.propMarket || row.canonicalMarketContext || row.marketDetail || ""
    );
    const subject = normalizeSimpleHedgeText(
      row.canonicalSubject || row.canonicalPlayer || row.playerLastName || ""
    );

    if (/player\s*prop/.test(text) || (propMarket && subject)) {
      return { family: "player_prop", market: propMarket, subject };
    }

    const mainLine = normalizeMainLineMarketForHedge(row);
    if (mainLine) return { family: mainLine, market: mainLine, subject: "" };

    if (/game\s*prop|other/.test(text)) {
      return {
        family: "game_prop",
        market: normalizeSimpleHedgeText(
          row.reviewMarketType || row.canonicalMarketContext || row.marketDetail || row.selection || ""
        ),
        subject: "",
      };
    }

    return {
      family: text || "unknown",
      market: normalizeSimpleHedgeText(row.canonicalMarketFamily || row.marketType || ""),
      subject,
    };
  }

  function rowsHaveCompatibleHedgeMarkets(rowA = {}, rowB = {}) {
    const a = getHedgeMarketIdentity(rowA);
    const b = getHedgeMarketIdentity(rowB);

    if (!a.family || !b.family || a.family === "unknown" || b.family === "unknown") {
      return false;
    }

    if (a.family === b.family) {
      if (a.family === "player_prop") {
        const genericMarkets = new Set(["", "player prop", "prop"]);
        if (genericMarkets.has(a.market) || genericMarkets.has(b.market)) return false;
        if (a.market !== b.market) return false;
        if (!a.subject || !b.subject || a.subject !== b.subject) return false;
      }

      if (a.family === "game_prop") {
        const genericMarkets = new Set(["", "game prop", "other"]);
        if (genericMarkets.has(a.market) || genericMarkets.has(b.market)) return false;
        if (a.market !== b.market) return false;
      }

      return true;
    }

    // Narrow exception: a moneyline can occasionally hedge an opposite-side
    // +/-0.5 spread/Asian-handicap style market. Keep this conservative by
    // requiring the exact same event and a half-goal/half-point spread.
    const mlSpreadPair = new Set([a.family, b.family]);
    if (mlSpreadPair.has("moneyline") && mlSpreadPair.has("spread")) {
      if (!rowsHaveSameEventRegardlessOfOrder(rowA, rowB)) return false;
      const spreadRow = a.family === "spread" ? rowA : rowB;
      const spreadLine = getMainLineNumberForHedge(spreadRow);
      if (!Number.isFinite(spreadLine) || Math.abs(Math.abs(spreadLine) - 0.5) > 0.0001) return false;

      const mlRow = a.family === "moneyline" ? rowA : rowB;
      const mlSide = normalizeMainLineSideForHedge(mlRow, "moneyline");
      const spreadSide = normalizeMainLineSideForHedge(spreadRow, "spread");
      return !!mlSide && !!spreadSide && mlSide !== spreadSide;
    }

    return false;
  }

  function areLikelyOpposites(rowA, rowB) {
  if (!rowA || !rowB) return false;
  if (rowA.id === rowB.id) return false;
  if (
    rowIsExcludedFromAutomaticHedgeMatching(rowA) ||
    rowIsExcludedFromAutomaticHedgeMatching(rowB)
  ) return false;

  const bookmakerA = String(rowA.bookmaker || "").trim().toLowerCase();
  const bookmakerB = String(rowB.bookmaker || "").trim().toLowerCase();
  if (bookmakerA && bookmakerB && bookmakerA === bookmakerB) return false;
  if (!rowsHaveCompatibleHedgeMarkets(rowA, rowB)) return false;

  // A/B order should never decide hedge eligibility. This fallback catches
  // Team A @ Team B vs Team B @ Team A and Participant A/B reversals before
  // older canonical keys can block the match.
  const orderInsensitiveMainLineType = classifyOrderInsensitiveMainLineHedge(rowA, rowB);
  if (orderInsensitiveMainLineType) return orderInsensitiveMainLineType;

  if (
  rowA.canonicalResultTarget &&
  rowB.canonicalResultTarget &&
  rowA.canonicalResultTarget !== rowB.canonicalResultTarget
) return false;
  if (rowA.canonicalSubjectType !== rowB.canonicalSubjectType) return false;
  if (rowA.canonicalMarketFamily !== rowB.canonicalMarketFamily) return false;

  const possiblePropKeyA = makePossiblePlayerPropHedgeKey(rowA);
  const possiblePropKeyB = makePossiblePlayerPropHedgeKey(rowB);

  if (
    possiblePropKeyA &&
    possiblePropKeyB &&
    possiblePropKeyA === possiblePropKeyB
  ) {
    return "POSSIBLE_PLAYER_PROP_HEDGE";
  }


  const sideA = String(rowA.canonicalSide || "").toLowerCase();
  const sideB = String(rowB.canonicalSide || "").toLowerCase();

  // Exact hedge: opposite side, same exact selection line/market
  if (
    rowA.canonicalOppositeKey &&
    rowB.canonicalSelectionKey &&
    rowA.canonicalOppositeKey === rowB.canonicalSelectionKey
  ) {
    if (sideA === sideB) return false;
    return "EXACT_HEDGE";
  }

  // Middle: same market shell, opposite O/U sides, different lines
  if (
    rowA.canonicalHedgeKey &&
    rowB.canonicalHedgeKey &&
    rowA.canonicalHedgeKey === rowB.canonicalHedgeKey
  ) {
    const lineA = parseFloat(rowA.canonicalLine);
    const lineB = parseFloat(rowB.canonicalLine);

    if (
      Number.isFinite(lineA) &&
      Number.isFinite(lineB) &&
      lineA !== lineB &&
      (
        (sideA === "over" && sideB === "under") ||
        (sideA === "under" && sideB === "over")
      )
    ) {
      return "MIDDLE";
    }
  }

  return false;
}

function makeHedgeDedupKey(row) {
  return [
    row.canonicalSelectionKey || "",
    row.bookmaker || "",
    row.betId || `${row.stake}|${row.oddsUS}`
  ].join("|");
}

function addLikelyHedgeFlags(rowsInput) {
  const PAYOUT_MATCH_TOLERANCE = 10;
  const PAYOUT_MATCH_DATE_WINDOW_DAYS = 7;
  const SMALL_GUARANTEED_LOSS_LIMIT = 5;

  function impliedProb(odds) {
    const o = Number(odds);
    if (!o) return 0;
    return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
  }

  function moneyNumber(value) {
    const cleaned = String(value ?? "")
      .replace(/,/g, "")
      .replace(/[^0-9.-]/g, "")
      .trim();

    if (!cleaned) return null;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function getStakeForHedge(row = {}) {
    const stake = moneyNumber(row.stake);
    return Number.isFinite(stake) && stake > 0 ? stake : null;
  }

  function getPotentialReturnForHedge(row = {}) {
    const payout = moneyNumber(row.payout);
    if (Number.isFinite(payout) && payout > 0) return payout;

    const stake = getStakeForHedge(row);
    const toWin = moneyNumber(row.toWin);

    if (Number.isFinite(stake) && stake > 0 && Number.isFinite(toWin) && toWin > 0) {
      return stake + toWin;
    }

    const odds = Number(row.oddsUS);

    if (Number.isFinite(stake) && stake > 0 && Number.isFinite(odds) && odds !== 0) {
      const profit = odds > 0 ? (stake * odds) / 100 : (stake * 100) / Math.abs(odds);
      return stake + profit;
    }

    return null;
  }

  function parseAppDate(value = "") {
    const s = String(value || "").trim();
    if (!s) return null;

    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const mm = Number(m[1]);
      const dd = Number(m[2]);
      const yy = Number(m[3]);
      const yyyy = yy < 100 ? 2000 + yy : yy;
      const d = new Date(yyyy, mm - 1, dd);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function rowDates(row = {}) {
    return [row.betDate, row.eventDate]
      .map(parseAppDate)
      .filter(Boolean);
  }

  function minDaysBetweenRows(rowA = {}, rowB = {}) {
    const datesA = rowDates(rowA);
    const datesB = rowDates(rowB);

    if (!datesA.length || !datesB.length) return null;

    let min = Infinity;

    for (const a of datesA) {
      for (const b of datesB) {
        const days = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
        if (days < min) min = days;
      }
    }

    return Number.isFinite(min) ? min : null;
  }

  function hasWeakHedgeContext(row = {}) {
    const warning = String(row.parseWarning || "").toLowerCase();
    const selection = String(row.selection || "").trim();
    const fixture = String(row.fixtureEvent || "").trim();
    const league = String(row.sportLeague || "").trim();

    return (
      !selection ||
      !fixture ||
      !league ||
      row.reviewLater === "Y" ||
      row.likelyParserIssue === "Y" ||
      warning.includes("missing") ||
      warning.includes("needs_review") ||
      warning.includes("manual_review") ||
      warning.includes("context")
    );
  }

  function computeTwoWayProfitSummary(rowA = {}, rowB = {}) {
    const stakeA = getStakeForHedge(rowA);
    const stakeB = getStakeForHedge(rowB);
    const returnA = getPotentialReturnForHedge(rowA);
    const returnB = getPotentialReturnForHedge(rowB);

    if (
      !Number.isFinite(stakeA) ||
      !Number.isFinite(stakeB) ||
      !Number.isFinite(returnA) ||
      !Number.isFinite(returnB)
    ) {
      return null;
    }

    const totalStake = stakeA + stakeB;
    const profitIfA = returnA - totalStake;
    const profitIfB = returnB - totalStake;
    const low = Math.min(profitIfA, profitIfB);
    const high = Math.max(profitIfA, profitIfB);

    return {
      totalStake,
      returnA,
      returnB,
      profitIfA,
      profitIfB,
      low,
      high,
    };
  }

  function formatMoneyValue(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "";
  }

  function buildClusterId(rows) {
    return rows
      .map((r) => r.id)
      .sort()
      .join("__");
  }

  function getIgnoredHedgePartnerIds(row = {}) {
    return String(row.ignoredHedgePartnerIds || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function isIgnoredHedgePair(rowA = {}, rowB = {}) {
    if (!rowA?.id || !rowB?.id) return false;

    const ignoredByA = getIgnoredHedgePartnerIds(rowA);
    const ignoredByB = getIgnoredHedgePartnerIds(rowB);

    return ignoredByA.includes(rowB.id) || ignoredByB.includes(rowA.id);
  }

  function normalizeLeagueForHedge(value = "") {
    const text = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ");

    if (!text) return "";
    if (text === "baseball" || text === "mlb") return "mlb";
    if (text === "nba") return "nba";
    if (text === "wnba") return "wnba";
    if (text === "nhl") return "nhl";
    if (text === "nfl") return "nfl";
    if (text === "mma" || text === "ufc") return "mma";
    if (text === "soccer" || text === "mls" || text === "epl" || text === "premier league" || text === "la liga" || text === "serie a" || text === "bundesliga" || text === "ligue 1") return "soccer";
    if (text === "tennis" || text === "atp" || text === "wta") return "tennis";

    if (["ncaam", "ncaa mbb", "mens college basketball", "men college basketball", "men's college basketball", "cbb"].includes(text)) return "ncaam";
    if (["ncaaw", "ncaa wbb", "womens college basketball", "women college basketball", "women's college basketball"].includes(text)) return "ncaaw";
    if (["ncaaf", "college football", "cfb"].includes(text)) return "ncaaf";
    if (["ncaa", "ncaab", "college", "college basketball"].includes(text)) return "ncaa";

    return text;
  }

  function isCollegeHedgeLeagueKey(value = "") {
    const key = normalizeLeagueForHedge(value);
    return key === "ncaa" || key === "ncaam" || key === "ncaaw" || key === "ncaaf";
  }

  function getAliasSportKeyForHedgeLeague(value = "") {
    const key = normalizeLeagueForHedge(value);
    if (key === "mlb") return "MLB";
    if (key === "nba") return "NBA";
    if (key === "wnba") return "WNBA";
    if (key === "nhl") return "NHL";
    if (key === "nfl") return "NFL";
    return "";
  }

  function normalizeHedgeTeamLookup(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function teamValueMatchesLeagueDatabase(value = "", league = "") {
    const sportKey = getAliasSportKeyForHedgeLeague(league);
    const aliasMap = TEAM_ALIASES_BY_SPORT?.[sportKey] || null;
    if (!sportKey || !aliasMap) return null;

    const lookup = normalizeHedgeTeamLookup(value);
    if (!lookup) return null;

    for (const [alias, canonical] of Object.entries(aliasMap)) {
      const aliasKey = normalizeHedgeTeamLookup(alias);
      const canonicalKey = normalizeHedgeTeamLookup(canonical);
      if (!aliasKey && !canonicalKey) continue;

      if (lookup === aliasKey || lookup === canonicalKey) return true;

      // For longer OCR strings, require a reasonably specific multi-word team
      // token rather than a single ambiguous city word.
      const candidates = [aliasKey, canonicalKey].filter(
        (candidate) => candidate && candidate.split(" ").length >= 2 && candidate.length >= 6
      );
      if (candidates.some((candidate) => ` ${lookup} `.includes(` ${candidate} `))) return true;
    }

    return false;
  }

  function getIdentifiedTeamValuesForHedge(row = {}) {
    const direct = [
      row.participantANormalized || row.participantA,
      row.participantBNormalized || row.participantB,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (direct.length) return Array.from(new Set(direct));

    return parseEventParticipantsForHedge(row.fixtureEvent || row.eventName || "");
  }

  function rowTeamEvidenceContradictsLeague(row = {}, knownLeague = "") {
    const sportKey = getAliasSportKeyForHedgeLeague(knownLeague);
    if (!sportKey || !TEAM_ALIASES_BY_SPORT?.[sportKey]) return false;

    const teamValues = getIdentifiedTeamValuesForHedge(row);
    if (!teamValues.length) return false;

    const specificValues = teamValues.filter((value) => {
      const normalized = normalizeHedgeTeamLookup(value);
      return normalized.split(" ").length >= 2 || normalized.length >= 8;
    });
    if (!specificValues.length) return false;

    const matches = specificValues.map((value) =>
      teamValueMatchesLeagueDatabase(value, knownLeague)
    );

    // If identifiable teams are present and none belongs to the reviewed
    // league's team database, this is a hard cross-league incompatibility.
    return matches.every((match) => match === false);
  }

  function rowsHaveCompatibleHedgeLeagues(rowA = {}, rowB = {}) {
    const leagueA = normalizeLeagueForHedge(rowA.sportLeague);
    const leagueB = normalizeLeagueForHedge(rowB.sportLeague);

    // A blank league is no longer automatically compatible with everything.
    // If the other row has a known pro-league team database, use identified
    // team names as a hard contradiction check before allowing a candidate.
    if (!leagueA && leagueB) {
      if (rowTeamEvidenceContradictsLeague(rowA, leagueB)) return false;
      return true;
    }
    if (!leagueB && leagueA) {
      if (rowTeamEvidenceContradictsLeague(rowB, leagueA)) return false;
      return true;
    }
    if (!leagueA && !leagueB) return true;

    if (leagueA === leagueB) return true;

    // Allow a generic NCAA/college label to match a more specific NCAA league,
    // but never allow NCAA to match NBA/NHL/MLB/etc.
    if (leagueA === "ncaa" && isCollegeHedgeLeagueKey(leagueB)) return true;
    if (leagueB === "ncaa" && isCollegeHedgeLeagueKey(leagueA)) return true;

    return false;
  }

  function rowsShareCollegeHedgeLeague(rowA = {}, rowB = {}) {
    const leagueA = normalizeLeagueForHedge(rowA.sportLeague);
    const leagueB = normalizeLeagueForHedge(rowB.sportLeague);

    return (
      rowsHaveCompatibleHedgeLeagues(rowA, rowB) &&
      isCollegeHedgeLeagueKey(leagueA) &&
      isCollegeHedgeLeagueKey(leagueB)
    );
  }

  function normalizeCollegeHedgeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/\bneutral\s+(?:venue|site|court|field|stadium|arena|ice|location)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getCollegeHedgeTokens(row = {}) {
    const combined = [
      row.fixtureEvent,
      row.eventName,
      row.selection,
      row.participantA,
      row.participantB,
      row.participantANormalized,
      row.participantBNormalized,
    ].filter(Boolean).join(" ");

    const stop = new Set([
      "university",
      "college",
      "state",
      "the",
      "of",
      "at",
      "vs",
      "v",
      "and",
      "men",
      "mens",
      "women",
      "womens",
      "basketball",
      "football",
      "spread",
      "moneyline",
      "total",
      "over",
      "under",
    ]);

    return normalizeCollegeHedgeText(combined)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stop.has(token));
  }

  function rowsHaveCollegeHedgeContextOverlap(rowA = {}, rowB = {}) {
    const eventA = normalizeCollegeHedgeText(rowA.fixtureEvent || rowA.eventName || "");
    const eventB = normalizeCollegeHedgeText(rowB.fixtureEvent || rowB.eventName || "");

    if (eventA && eventB && eventA === eventB) return true;

    const tokensA = new Set(getCollegeHedgeTokens(rowA));
    const tokensB = new Set(getCollegeHedgeTokens(rowB));

    const shared = [...tokensA].filter((token) => tokensB.has(token));

    // One distinctive shared team/city token is enough only if both rows also
    // have an event. Otherwise require two tokens to avoid noisy same-league matches.
    if (eventA && eventB && shared.length >= 1) return true;

    return shared.length >= 2;
  }

  function getPayoutMatch(rowA = {}, rowB = {}) {
    if (
      rowIsExcludedFromAutomaticHedgeMatching(rowA) ||
      rowIsExcludedFromAutomaticHedgeMatching(rowB)
    ) return null;

    if (!rowsHaveCompatibleHedgeMarkets(rowA, rowB)) return null;
    if (!rowsHaveCompatibleHedgeLeagues(rowA, rowB)) return null;

    const bookA = String(rowA.bookmaker || "").trim().toLowerCase();
    const bookB = String(rowB.bookmaker || "").trim().toLowerCase();

    if (!bookA || !bookB || bookA === bookB) return null;

    const days = minDaysBetweenRows(rowA, rowB);

    if (days === null || days > PAYOUT_MATCH_DATE_WINDOW_DAYS) return null;

    const returnA = getPotentialReturnForHedge(rowA);
    const returnB = getPotentialReturnForHedge(rowB);

    if (!Number.isFinite(returnA) || !Number.isFinite(returnB) || returnA <= 0 || returnB <= 0) {
      return null;
    }

    const returnDiff = Math.abs(returnA - returnB);

    if (returnDiff > PAYOUT_MATCH_TOLERANCE) return null;

    const weakContext = hasWeakHedgeContext(rowA) || hasWeakHedgeContext(rowB);
    const collegePayoutContext =
      rowsShareCollegeHedgeLeague(rowA, rowB) &&
      rowsHaveCollegeHedgeContextOverlap(rowA, rowB);

    // Keep payout matching as a rescue layer. For NCAA rows, canonical team
    // aliases are intentionally manual, so allow same-date/same-college-context
    // payout matches even when the normal context fields look complete.
    if (!weakContext && !collegePayoutContext) return null;

    const summary = computeTwoWayProfitSummary(rowA, rowB);

    const prefix = collegePayoutContext ? "NCAA Payout Match" : "Payout Match";
    let quality = `${prefix} - Needs Review`;

    if (summary) {
      if (summary.low >= 0) {
        quality = `${prefix} - Guaranteed Profit`;
      } else if (summary.high <= 0 && summary.low >= -SMALL_GUARANTEED_LOSS_LIMIT) {
        quality = `${prefix} - Small Guaranteed Loss`;
      }
    }

    return {
      quality,
      confidence: "Low",
      returnDiff,
      days,
      summary,
    };
  }

  const pairClusters = [];

  for (let i = 0; i < rowsInput.length; i += 1) {
    for (let j = i + 1; j < rowsInput.length; j += 1) {
      const row = rowsInput[i];
      const other = rowsInput[j];

      if (!row || !other || row.id === other.id) continue;
      // Hedge candidate generation happens only after both bets have completed
      // normal review. This makes league/market/team compatibility authoritative.
      if (!rowEligibleForHedgePairing(row) || !rowEligibleForHedgePairing(other)) continue;
      if (isIgnoredHedgePair(row, other)) continue;
      if (!rowsHaveCompatibleHedgeLeagues(row, other)) continue;
      if (!rowsHaveCompatibleHedgeMarkets(row, other)) continue;

      const rowDedupKey = makeHedgeDedupKey(row);
      const otherDedupKey = makeHedgeDedupKey(other);

      if (rowDedupKey === otherDedupKey) continue;

      const exactType = areLikelyOpposites(row, other);

      if (exactType) {
        pairClusters.push({
          priority: 3,
          matchType: exactType,
          clusterRows: [row, other],
          confidence: exactType === "EXACT_HEDGE" ? "High" : "Medium",
          quality:
            exactType === "EXACT_HEDGE"
              ? "Exact Hedge"
              : exactType === "MIDDLE"
              ? "Middle"
              : "Possible Player Prop Hedge",
          payoutMatch: null,
        });

        continue;
      }

      const payoutMatch = getPayoutMatch(row, other);

      if (payoutMatch) {
        pairClusters.push({
          priority: 1,
          matchType: "PAYOUT_MATCH",
          clusterRows: [row, other],
          confidence: payoutMatch.confidence,
          quality: payoutMatch.quality,
          payoutMatch,
        });
      }
    }
  }

  const clusterMap = new Map();
  const candidateIdsByRowId = new Map();

  function addCandidateIdForRow(rowId = "", partnerId = "") {
    if (!rowId || !partnerId || rowId === partnerId) return;
    if (!candidateIdsByRowId.has(rowId)) candidateIdsByRowId.set(rowId, new Set());
    candidateIdsByRowId.get(rowId).add(partnerId);
  }

  for (const cluster of pairClusters) {
    const clusterId = buildClusterId(cluster.clusterRows);

    for (const clusterRow of cluster.clusterRows) {
      cluster.clusterRows.forEach((candidateRow) => {
        if (candidateRow?.id && candidateRow.id !== clusterRow.id) {
          addCandidateIdForRow(clusterRow.id, candidateRow.id);
        }
      });

      const current = clusterMap.get(clusterRow.id);

      // Prefer exact/canonical matches over payout-only weak matches for the primary card,
      // but keep every candidate id so the full-page review can inspect all possible pairs.
      if (!current || cluster.priority > current.priority) {
        clusterMap.set(clusterRow.id, {
          ...cluster,
          clusterId,
        });
      }
    }
  }

  return rowsInput.map((row) => {
    const cluster = clusterMap.get(row.id);

    if (!cluster) {
      const manuallyConfirmedHedge = String(row.hedgeOverride || "").trim().toUpperCase() === "Y";
      const confirmedTag = String(row.betSourceTag || "").trim().toLowerCase();

      // Manual confirmations must survive recomputation. Otherwise a confirmed hedge can
      // disappear from the Review Queue after rowsWithWarnings recalculates hedge flags.
      const candidateIds = Array.from(candidateIdsByRowId.get(row.id) || []);
      const hadPriorHedgeSignal =
        row.everHedgeCandidate === "Y" ||
        row.everLikelyHedge === "Y" ||
        row.likelyHedge === "Y" ||
        row.autoLikelyHedge === "Y" ||
        !!row.hedgeClusterId ||
        !!row.hedgeCandidateIds ||
        !!row.ignoredHedgePartnerIds ||
        row.hedgeOverride === "Y" ||
        row.hedgeOverride === "N";

      if (manuallyConfirmedHedge) {
        return {
          ...row,
          likelyHedge: "Y",
          autoLikelyHedge: row.autoLikelyHedge || "Y",
          hedgeClusterId: row.hedgeClusterId || "",
          hedgeClusterSize: row.hedgeClusterSize || "",
          hedgePartnerBookmaker: row.hedgePartnerBookmaker || "",
          hedgeConfidence: row.hedgeConfidence || "Confirmed",
          hedgeQuality: row.hedgeQuality || (confirmedTag === "middle" ? "Confirmed Middle" : "Confirmed Hedge"),
          hedgeCandidateIds: candidateIds.length ? candidateIds.join(",") : row.hedgeCandidateIds || "",
          hedgeCandidateCount: candidateIds.length ? String(candidateIds.length) : row.hedgeCandidateCount || "",
          everHedgeCandidate: "Y",
          everLikelyHedge: "Y",
          hedgeHistoryReason: row.hedgeHistoryReason || "Confirmed hedge",
          guaranteedProfit: row.guaranteedProfit || "N",
          guaranteedProfitAmount: row.guaranteedProfitAmount || "",
          hedgeStake: row.hedgeStake || "",
          hedgeProfitLow: row.hedgeProfitLow || "",
          hedgeProfitHigh: row.hedgeProfitHigh || "",
          hedgeProfitIfThisWins: row.hedgeProfitIfThisWins || "",
          hedgeProfitIfOtherWins: row.hedgeProfitIfOtherWins || "",
        };
      }

      return {
        ...row,
        likelyHedge: "N",
        autoLikelyHedge: "N",
        hedgeClusterId: "",
        hedgeClusterSize: "",
        hedgePartnerBookmaker: "",
        hedgeConfidence: "",
        hedgeQuality: "",
        hedgeCandidateIds: candidateIds.join(","),
        hedgeCandidateCount: candidateIds.length ? String(candidateIds.length) : "",
        everHedgeCandidate: hadPriorHedgeSignal || candidateIds.length ? "Y" : row.everHedgeCandidate || "",
        everLikelyHedge: hadPriorHedgeSignal ? "Y" : row.everLikelyHedge || "",
        hedgeHistoryReason: hadPriorHedgeSignal || candidateIds.length ? (row.hedgeHistoryReason || "Previously flagged possible hedge") : row.hedgeHistoryReason || "",
        guaranteedProfit: "N",
        guaranteedProfitAmount: "",
        hedgeStake: "",
        hedgeProfitLow: "",
        hedgeProfitHigh: "",
        hedgeProfitIfThisWins: "",
        hedgeProfitIfOtherWins: "",
      };
    }

    const otherRows = cluster.clusterRows.filter((r) => r.id !== row.id);

    const otherBooks = otherRows
      .map((r) => getDisplayedBookmaker(r))
      .filter(Boolean);

    const clusterSize = cluster.clusterRows.length;

    const allOdds = cluster.clusterRows
      .map((r) => Number(r.oddsUS))
      .filter((n) => Number.isFinite(n));

    let quality = cluster.quality || "Likely Hedge";

    if (cluster.matchType !== "PAYOUT_MATCH" && allOdds.length >= 2) {
      const impliedTotal = allOdds.reduce(
        (acc, odds) => acc + impliedProb(odds),
        0
      );

      if (impliedTotal < 1) {
        quality = "Possible Arbitrage";
      }
    }

    const firstOther = otherRows[0] || {};
    const summary = computeTwoWayProfitSummary(row, firstOther);
    const otherStake = getStakeForHedge(firstOther);

    let guaranteedProfit = "N";
    let guaranteedProfitAmount = "";
    let hedgeProfitLow = "";
    let hedgeProfitHigh = "";
    let hedgeProfitIfThisWins = "";
    let hedgeProfitIfOtherWins = "";

    if (summary) {
      hedgeProfitLow = formatMoneyValue(summary.low);
      hedgeProfitHigh = formatMoneyValue(summary.high);
      hedgeProfitIfThisWins = formatMoneyValue(summary.profitIfA);
      hedgeProfitIfOtherWins = formatMoneyValue(summary.profitIfB);

      if (summary.low >= 0) {
        guaranteedProfit = "Y";
        guaranteedProfitAmount = formatMoneyValue(summary.low);
      }
    }

    const priorWarning = String(row.parseWarning || "");
    const addWarning =
      cluster.matchType === "PAYOUT_MATCH" &&
      !priorWarning.toLowerCase().includes("payout_matched_possible_hedge")
        ? "payout_matched_possible_hedge"
        : "";

    return {
      ...row,
      likelyHedge: "Y",
      autoLikelyHedge: "Y",
      hedgeClusterId: cluster.clusterId,
      hedgeClusterSize: clusterSize,
      hedgePartnerBookmaker: otherBooks.join(", "),
      hedgeConfidence: cluster.confidence || (clusterSize >= 3 ? "High" : "Medium"),
      hedgeQuality: quality,
      guaranteedProfit,
      guaranteedProfitAmount,
      hedgeStake: Number.isFinite(otherStake) ? otherStake.toFixed(2) : "",
      hedgeProfitLow,
      hedgeProfitHigh,
      hedgeProfitIfThisWins,
      hedgeProfitIfOtherWins,
      hedgeCandidateIds: Array.from(candidateIdsByRowId.get(row.id) || []).join(","),
      hedgeCandidateCount: String((candidateIdsByRowId.get(row.id) || new Set()).size || ""),
      everHedgeCandidate: "Y",
      everLikelyHedge: "Y",
      hedgeHistoryReason: row.hedgeHistoryReason || quality || "Possible hedge candidate",
      parseWarning: [priorWarning, addWarning].filter(Boolean).join(" | "),
    };
  });
}

function groupHedgeRowsTogether(rowsInput) {
  const grouped = [];
  const used = new Set();

  const clusters = new Map();

  for (const row of rowsInput) {
    if (!row.hedgeClusterId) continue;

    if (!clusters.has(row.hedgeClusterId)) {
      clusters.set(row.hedgeClusterId, []);
    }

    clusters.get(row.hedgeClusterId).push(row);
  }

  for (const row of rowsInput) {
    if (used.has(row.id)) continue;

    if (
      row.likelyHedge === "Y" &&
      row.hedgeClusterId &&
      clusters.has(row.hedgeClusterId)
    ) {
      const clusterRows = clusters.get(row.hedgeClusterId);

      for (const clusterRow of clusterRows) {
        grouped.push(clusterRow);
        used.add(clusterRow.id);
      }

      continue;
    }

    grouped.push(row);
    used.add(row.id);
  }

  return grouped;
}

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
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        setRows((prev) =>
          prev.map((row) =>
            row.id === selectedRowId
              ? enrichRow({
                  ...row,
                  reviewResolved: "Y",
                  reviewLater: "N",
                })
              : row
          )
        );
        showNotice("Reviewed");
        setTimeout(() => selectNextNeedsReviewAfter(selectedRowId), 0);
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        setRows((prev) =>
          prev.map((row) =>
            row.id === selectedRowId
              ? enrichRow({
                  ...row,
                  reviewLater: row.reviewLater === "Y" ? "N" : "Y",
                  reviewResolved: "N",
                })
              : row
          )
        );
        showNotice("Review later toggled");
        setTimeout(() => selectNextNeedsReviewAfter(selectedRowId), 0);
      } else if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setRows((prev) =>
          prev.map((row) =>
            row.id === selectedRowId
              ? enrichRow({
                  ...row,
                  reviewResolved: "Y",
                  reviewLater: "N",
                  exported: "Y",
                })
              : row
          )
        );
        showNotice("Reviewed + exported");
        setTimeout(() => selectNextNeedsReviewAfter(selectedRowId), 0);
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        setRows((prev) =>
          prev.map((row) =>
            row.id === selectedRowId
              ? enrichRow({
                  ...row,
                  reviewResolved: "Y",
                  reviewLater: "N",
                  archived: "Y",
                })
              : row
          )
        );
        showNotice("Reviewed + archived");
        setTimeout(() => selectNextNeedsReviewAfter(selectedRowId), 0);
      } else if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        selectNextHedgeRow();
      }
       else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        setRows((prev) =>
          prev.map((row) =>
            row.id === selectedRowId
              ? enrichRow({
                  ...row,
                  reviewResolved: "Y",
                  reviewLater: "N",
                })
              : row
          )
        );
        showNotice("Reviewed");
        setTimeout(() => selectNextNeedsReviewAfter(selectedRowId), 0);
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        setRows((prev) =>
          prev.map((row) =>
            row.id === selectedRowId
              ? enrichRow({
                  ...row,
                  reviewLater: row.reviewLater === "Y" ? "N" : "Y",
                  reviewResolved: "N",
                })
              : row
          )
        );
        showNotice("Review later toggled");
        setTimeout(() => selectNextNeedsReviewAfter(selectedRowId), 0);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedRowId, visibleRows]);

function fillMissingBetDatesFromPreviousUploadRows(rowsInput = []) {
  let lastKnownBetDate = "";

  return (rowsInput || [])
    .filter(Boolean)
    .map((row) => {
      if (row.betDate) {
        lastKnownBetDate = row.betDate;

        return enrichRow({
          ...row,
          betDateInferred: row.betDateInferred || "N",
          betDateNeedsConfirm: row.betDateNeedsConfirm || "N",
          betDateConfirmed: row.betDateConfirmed || "Y",
        });
      }

      if (lastKnownBetDate) {
        return enrichRow({
          ...row,
          betDate: lastKnownBetDate,
          eventDate: row.eventDate || lastKnownBetDate,
          betDateInferred: "Y",
          betDateNeedsConfirm: "Y",
          betDateConfirmed: "N",
          reviewLater: "Y",
          reviewResolved: "N",
          parseWarning: [
            row.parseWarning,
            "bet_date_copied_from_previous_upload_row_needs_confirm",
          ]
            .filter(Boolean)
            .join(" | "),
        });
      }

      return enrichRow({
        ...row,
        betDateInferred: "N",
        betDateNeedsConfirm: "Y",
        betDateConfirmed: "N",
        reviewLater: "Y",
        reviewResolved: "N",
        parseWarning: [row.parseWarning, "bet_date_missing_needs_confirm"]
          .filter(Boolean)
          .join(" | "),
      });
    });
}


 function createUploadBatch(files, batchBookmaker) {
  const id = crypto.randomUUID();

  let folder = "";
  let parentFolder = "";

  if (files[0]?.webkitRelativePath) {
    const parts = files[0].webkitRelativePath.split("/");

    if (parts.length >= 2) {
      folder = parts[parts.length - 2];
    }

    if (parts.length >= 3) {
      parentFolder = parts[parts.length - 3];
    }
  }

  const batch = {
    id,
    label: `Batch ${uploadBatches.length + 1}`,
    status: "queued",
    fileCount: files.length,
    processedCount: 0,
    rowsCreated: 0,
    errorCount: 0,
    fileNames: files.map((file) => file.name),
    folder,
    parentFolder,
    uploadBookmaker: batchBookmaker,
    createdAt: Date.now(),
  };

  setUploadBatches((prev) => [batch, ...prev]);
  return batch;}

  function updateUploadBatch(batchId, updates) {
    setUploadBatches((prev) =>
      prev.map((batch) =>
        batch.id === batchId
          ? { ...batch, ...updates }
          : batch
      )
    );
  }

  function clearUploadHistory() {
    setUploadBatches([]);
  }

  function applySavedFilterView(nextView) {
    const normalizedView =
      nextView === "review_queue" || nextView === "needs_review"
        ? "review_all"
        : nextView === "default"
        ? "all_active"
        : nextView || "review_all";

    setSavedFilterView(normalizedView);

    // The streamlined workflow uses one view at a time. Clear old advanced
    // toggles so they cannot silently combine into an empty table.
    setReviewMode(false);
    setShowNeedsReviewOnly(false);
    setShowReviewLaterOnly(false);
    setShowLowConfidenceOnly(false);
    setShowLikelyParserIssuesOnly(false);
    setShowHedgesOnly(false);
    setShowGuaranteedProfitOnly(false);
    setShowHedgeCriticalOnly(false);
    setSmartReviewMode(false);
    setShowArchivedRows(normalizedView === "archived");
  }

  const handleUpload = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) =>
      String(file.type || "").startsWith("image/")
    );
    if (files.length === 0) return;

    const batchBookmaker = normalizeUploadBookmakerLabel(uploadBookmaker);
    const batchOwner = uploadOwner;

    const batch = createUploadBatch(files, batchBookmaker);
    const batchId = batch.id;
    showNotice(`Accepted ${files.length} image${files.length === 1 ? "" : "s"} for upload`);

    setProcessing(true);
    setProcessingMessage(`Processing 0 of ${files.length}...`);
    updateUploadBatch(batchId, { status: "processing" });

    let errorCount = 0;
    const newRows = [];
    const concurrency = 12;

    async function processOneFile(file, index) {
      let folder = "";
      let parentFolder = "";

      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/");

        if (parts.length >= 2) {
          folder = parts[parts.length - 2];
        }

        if (parts.length >= 3) {
          parentFolder = parts[parts.length - 3];
        }
      }

      try {
        setProcessingMessage(`Processing ${index + 1} of ${files.length}: ${file.name}`);

        const sourceName = file.webkitRelativePath || file.name;
        const sourceBookmaker = inferBookmakerFromSourceName(sourceName);

        const parserBookmaker =
          batchBookmaker && batchBookmaker !== "Auto"
            ? batchBookmaker
            : sourceBookmaker || batchBookmaker;

        const extractedText = await readOcrTextForFile(file);
        const parsed = parseBetSlip(extractedText, sourceName, parserBookmaker);

        const forcedBookmaker =
          batchBookmaker && batchBookmaker !== "Auto"
            ? batchBookmaker
            : sourceBookmaker || parsed.bookmaker;

        const row = enrichRow({
          ...parsed,
          bookmaker: forcedBookmaker,
          folder,
          parentFolder,
          parserId: parsed.id || "",
          id: crypto.randomUUID(),
          accountOwner: batchOwner,
          uploadBatchId: batchId,
          uploadBatchLabel: batch.label,
          uploadBatchFolder: batch.folder,
          uploadBatchParentFolder: batch.parentFolder,
          uploadBatchBookmaker: batchBookmaker,
          sourceBookmakerFromPath: sourceBookmaker,
          sourceImageUrl: URL.createObjectURL(file),
          sourceFileName: sourceName,
          sourceRelativePath: sourceName,
          hedgeScanNeedsRefresh: "Y",
        });

        newRows[index] = row;

        updateUploadBatch(batchId, {
          status: "processing",
          processedCount: index + 1,
          rowsCreated: newRows.filter(Boolean).length,
          errorCount,
        });
      } catch (error) {
        console.error(error);
        errorCount += 1;

        updateUploadBatch(batchId, {
          status: "processing",
          processedCount: index + 1,
          rowsCreated: newRows.filter(Boolean).length,
          errorCount,
        });
      }
    }

    try {
      for (let i = 0; i < files.length; i += concurrency) {
        const chunk = files.slice(i, i + concurrency);
        await Promise.all(
          chunk.map((file, offset) => processOneFile(file, i + offset))
        );
      }

      const orderedNewRows = fillMissingBetDatesFromPreviousUploadRows(newRows);

      setRows((prev) => [...prev, ...orderedNewRows]);
      const uploadedReviewRows = orderedNewRows
        .filter((row) => row.reviewLater === "Y")
        .sort((a, b) => Number(b.reviewPriority || 0) - Number(a.reviewPriority || 0));


      if (uploadedReviewRows[0]?.id) {
        setSelectedRowId(uploadedReviewRows[0].id);
      } else if (orderedNewRows[0]) {
        setSelectedRowId(orderedNewRows[0].id);
      }

      updateUploadBatch(batchId, {
        status: errorCount > 0 ? (orderedNewRows.length > 0 ? "partial" : "failed") : "complete",
        processedCount: files.length,
        rowsCreated: orderedNewRows.length,
        errorCount,
      });

      showNotice(
        `Batch complete: ${orderedNewRows.length} row${orderedNewRows.length === 1 ? "" : "s"} created`      );
    } catch (error) {
      console.error(error);
      updateUploadBatch(batchId, {
        status: "failed",
        processedCount: files.length,
        rowsCreated: newRows.length,
        errorCount: errorCount + 1,
      });
      showNotice("Could not process upload batch");
    } finally {
      setProcessing(false);
      setProcessingMessage("");
    }
  };

  const handleRowFieldsChange = (id, updates = {}) => {
    const rawUpdates = { ...(updates || {}) };
    const manualFields = Array.isArray(rawUpdates.__manualFields)
      ? rawUpdates.__manualFields.filter(Boolean)
      : [];
    const changeReason = String(rawUpdates.__changeReason || "Review edit");
    const changeSource = String(rawUpdates.__changeSource || (manualFields.length ? "manual" : "review"));
    const skipUndo = rawUpdates.__skipUndo === true;

    delete rawUpdates.__manualFields;
    delete rawUpdates.__changeReason;
    delete rawUpdates.__changeSource;
    delete rawUpdates.__skipUndo;

    const cleanUpdates = Object.fromEntries(
      Object.entries(rawUpdates).filter(([field]) => field)
    );

    if (!id || Object.keys(cleanUpdates).length === 0) return;

    if (!skipUndo) captureUndoSnapshot(changeReason, id);

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        let changed = false;
        let next = { ...row };

        for (const [field, value] of Object.entries(cleanUpdates)) {
          const currentValue = row[field] ?? "";
          const nextValue = value ?? "";

          if (String(currentValue) === String(nextValue)) continue;

          next[field] = value;
          changed = true;
        }

        if (!changed && !manualFields.length) return row;

        if (manualFields.length) {
          next.manualLockedFields = addManualLockedFields(next, manualFields);
          const sourceUpdates = Object.fromEntries(
            manualFields.map((field) => [field, "manual review"])
          );
          next.fieldSourcesJson = mergeFieldSources(next, sourceUpdates);
        }

        next.auditTrailJson = appendAuditTrail(row, cleanUpdates, {
          reason: changeReason,
          source: changeSource,
        });

        const hedgeCriticalChanged = Object.keys(cleanUpdates).some((field) =>
          HEDGE_CRITICAL_EDIT_FIELDS.has(field)
        );

        if (hedgeCriticalChanged) {
          next.hedgeScanNeedsRefresh = "Y";
        }

        const qaRelevantChanged = Object.keys(cleanUpdates).some((field) =>
          CORE_REVIEW_FIELDS.includes(field) && !["reviewResolved", "reviewDataLocked"].includes(field)
        );
        if (qaRelevantChanged && !Object.prototype.hasOwnProperty.call(cleanUpdates, "reviewQaOverrideCodes")) {
          // If the underlying reviewed data changes, old "yes, keep as-is" QA
          // acknowledgements no longer apply to the new values.
          next.reviewQaOverrideCodes = "";
          next.reviewQaOverrideAt = "";
        }

        if (cleanUpdates.reviewResolved === "Y") {
          next.reviewDataLocked = "Y";
          // A newly confirmed/corrected bet can change the valid hedge universe.
          next.hedgeScanNeedsRefresh = "Y";
        }

        if (cleanUpdates.reviewResolved === "N") {
          next.reviewDataLocked = "N";
        }

        next = applyMyVariableDefaults(next);

        if (cleanUpdates.reviewResolved === "Y" && rowShouldDropScreenshotAfterReview(next)) {
          next = clearScreenshotForRow(next);
        }

        return next;
      })
    );
  };

  const handleRowFieldChange = (id, field, value, options = {}) =>
    handleRowFieldsChange(id, {
      [field]: value,
      ...(options.manual ? { __manualFields: [field] } : {}),
      ...(options.reason ? { __changeReason: options.reason } : {}),
      ...(options.source ? { __changeSource: options.source } : {}),
    });

  const toggleSelected = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !selectedVisibleIds.includes(id))
        : Array.from(new Set([...prev, ...selectedVisibleIds]))
    );

  const deleteRow = (id) => {
    captureUndoSnapshot("Delete row", id);
    selectNextAfter(id);
    setRows((prev) => prev.filter((row) => row.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    showNotice("Row deleted");
  };

  const setWinStatusForSelected = (winValue) => {
    if (selectedIds.length === 0) {
      showNotice(`No selected rows to mark ${winValue === "Y" ? "win" : "loss"}`);
      return;
    }

    setRows((prev) =>
      prev.map((row) => {
        if (!selectedIds.includes(row.id)) return row;
        const next = {
          ...row,
          win: winValue,
          status: winValue === "Y" ? "Won" : "Lost",
        };
        return enrichRow(next);
      })
    );

    showNotice(
      `${selectedIds.length} row${selectedIds.length === 1 ? "" : "s"} marked ${
        winValue === "Y" ? "win" : "loss"
      }`
    );
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
    saveAutosaveSnapshot("before_clear_all", { force: true, silent: true });
    setRows([]);
    setSelectedIds([]);
    setSelectedRowId("");
    showNotice("All rows cleared. A backup was saved first.");
  };

  function normalizeImageMatchKey(value = "") {
    return String(value || "")
      .replace(/\\/g, "/")
      .toLowerCase()
      .trim()
      .replace(/%20/g, " ")
      .replace(/\s+/g, " ")
      .split("/")
      .filter(Boolean)
      .join("/");
  }

  function stripFileExtension(value = "") {
    return String(value || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  }

  function getBaseNameFromPath(value = "") {
    const normalized = normalizeImageMatchKey(value);
    if (!normalized) return "";
    return normalized.split("/").filter(Boolean).pop() || "";
  }

  function getCompactImageKey(value = "") {
    return stripFileExtension(normalizeImageMatchKey(value))
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function getPossibleStagedOriginalFileNames(value = "") {
    const base = getBaseNameFromPath(value);
    if (!base) return [];

    // Staged files are usually Book__Owner__OriginalFileName, but some batch
    // scripts may add a date/folder prefix first. Keep several suffix guesses so
    // reattach works whether the user chooses the staged folder or the original folder.
    const parts = base.split("__").map((part) => part.trim()).filter(Boolean);
    const names = new Set();

    if (parts.length >= 2) {
      for (let i = 1; i < parts.length; i += 1) {
        names.add(parts.slice(i).join("__"));
      }
    }

    if (parts.length >= 3) names.add(parts.slice(2).join("__"));
    if (parts.length >= 4) names.add(parts.slice(3).join("__"));
    if (parts.length) names.add(parts[parts.length - 1]);

    return Array.from(names).filter(Boolean);
  }

  function getImagePathMatchKeys(value = "") {
    const normalized = normalizeImageMatchKey(value);
    if (!normalized) return [];

    const parts = normalized.split("/").filter(Boolean);
    const keys = new Set();

    for (let i = 0; i < parts.length; i += 1) {
      const suffix = parts.slice(i).join("/");
      if (suffix) keys.add(suffix);
    }

    const base = getBaseNameFromPath(normalized);
    const originalBases = getPossibleStagedOriginalFileNames(base);

    [base, ...originalBases].filter(Boolean).forEach((name) => {
      const cleanName = normalizeImageMatchKey(name);
      if (!cleanName) return;

      const noExt = stripFileExtension(cleanName);
      const noCopy = noExt
        .replace(/\s*\(\d+\)$/i, "")
        .replace(/[-_\s]+copy$/i, "")
        .trim();

      keys.add(cleanName);
      keys.add(noExt);
      keys.add(noCopy);

      const compact = getCompactImageKey(cleanName);
      if (compact && compact.length >= 8) keys.add(`compact:${compact}`);
    });

    return Array.from(keys).filter(Boolean);
  }

  function buildScreenshotFileIndex(fileList = []) {
    const imageFiles = Array.from(fileList || []).filter((file) =>
      String(file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(String(file.name || ""))
    );

    const index = new Map();
    const compactEntries = [];

    for (const file of imageFiles) {
      const relativePath = file.webkitRelativePath || file.name;
      const keys = [
        ...getImagePathMatchKeys(relativePath),
        ...getImagePathMatchKeys(file.name),
      ];

      for (const key of keys) {
        if (!key) continue;

        if (!index.has(key)) {
          index.set(key, file);
        }

        if (key.startsWith("compact:")) {
          compactEntries.push({ key: key.replace(/^compact:/, ""), file });
        }
      }
    }

    return { imageFiles, index, compactEntries };
  }

  function getScreenshotMatchKeysForRow(row = {}) {
    const candidates = [
      row.sourceRelativePath,
      row.sourceFileName,
      row.sourceImageReattachedName,
      row.sourceImageOriginalName,
      row.sourceImageClearedSourceName,
      row.originalSourceFileName,
    ].filter(Boolean);

    const keys = [];

    for (const candidate of candidates) {
      keys.push(...getImagePathMatchKeys(candidate));
    }

    return Array.from(new Set(keys)).filter(Boolean);
  }

  function findScreenshotFileForRow(row = {}, fileIndex = new Map(), compactEntries = []) {
    const keys = getScreenshotMatchKeysForRow(row);

    for (const key of keys) {
      const match = fileIndex.get(key);

      if (match) return match;
    }

    // Fuzzy fallback: if a saved source name and a selected file share the same
    // compact filename, or one compact key contains the other uniquely, use it.
    // This covers renamed staged/original folders without guessing blindly.
    const rowCompactKeys = keys
      .filter((key) => key.startsWith("compact:"))
      .map((key) => key.replace(/^compact:/, ""))
      .filter((key) => key.length >= 10);

    for (const rowKey of rowCompactKeys) {
      const matches = compactEntries
        .filter((entry) =>
          entry.key === rowKey ||
          (entry.key.length >= 10 && rowKey.includes(entry.key)) ||
          (rowKey.length >= 10 && entry.key.includes(rowKey))
        )
        .map((entry) => entry.file);

      const uniqueMatches = Array.from(new Set(matches));

      if (uniqueMatches.length === 1) return uniqueMatches[0];
    }

    return null;
  }

  function getScreenshotSourceLabelForRow(row = {}) {
    return (
      row.sourceRelativePath ||
      row.sourceFileName ||
      row.sourceImageReattachedName ||
      row.sourceImageClearedSourceName ||
      row.uploadBatchFolder ||
      row.folder ||
      row.uploadBatchParentFolder ||
      row.parentFolder ||
      "no saved source filename"
    );
  }

  function getScreenshotFolderHintForRow(row = {}) {
    const parentFolder =
      row.uploadBatchParentFolder ||
      row.parentFolder ||
      "";

    const childFolder =
      row.uploadBatchFolder ||
      row.folder ||
      "";

    if (parentFolder && childFolder) return `${parentFolder}/${childFolder}`;
    if (childFolder) return childFolder;
    if (parentFolder) return parentFolder;

    const sourcePath =
      row.sourceRelativePath ||
      row.sourceFileName ||
      row.sourceImageClearedSourceName ||
      row.sourceImageReattachedName ||
      "";

    const parts = String(sourcePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length >= 3) return `${parts[parts.length - 3]}/${parts[parts.length - 2]}`;
    if (parts.length >= 2) return parts[parts.length - 2];

    return "the same staged week folder";
  }

  function rowNeedsScreenshotReattach(row = {}, scope = "needed") {
    if (!row?.id) return false;
    if (scope === "all") return true;

    const visible = visibleRows.some((visibleRow) => visibleRow.id === row.id);
    if (scope === "visible") return visible;

    const hasScreenshot = !!row.sourceImageUrl;
    const stillNeedsWork =
      rowNeedsReview(row) ||
      row.reviewLater === "Y" ||
      row.likelyHedge === "Y" ||
      row.autoLikelyHedge === "Y" ||
      row.guaranteedProfit === "Y" ||
      rowHasUnresolvedHedgeReview(row) ||
      String(row.hedgeQuality || "").trim() ||
      row.id === selectedRowId ||
      visible;

    // Default: reattach screenshots for rows that are still being worked and
    // do not already have a live screenshot. This avoids pulling every reviewed
    // screenshot back into memory while still making the current/visible queue work.
    return !hasScreenshot && row.archived !== "Y" && !!stillNeedsWork;
  }

  function reattachScreenshots(fileList, options = {}) {
    const scope = options.scope || reattachScreenshotsScopeRef.current || "needed";
    const { imageFiles, index, compactEntries } = buildScreenshotFileIndex(fileList);

    if (!imageFiles.length) {
      showNotice("No image files selected for reattach");
      return;
    }

    if (!rows.length) {
      showNotice("No rows loaded to reattach screenshots to");
      return;
    }

    const candidateRows = rows.filter((row) => rowNeedsScreenshotReattach(row, scope));

    if (!candidateRows.length) {
      showNotice(scope === "all" ? "No rows loaded to reattach" : "No unreviewed rows need screenshots reattached");
      return;
    }

    const candidateIds = new Set(candidateRows.map((row) => row.id));
    const matchesByRowId = new Map();

    for (const row of candidateRows) {
      const match = findScreenshotFileForRow(row, index, compactEntries);

      if (match) {
        matchesByRowId.set(row.id, match);
      }
    }

    if (!matchesByRowId.size) {
      const sampleRows = candidateRows.slice(0, 5).map((row) => {
        const label = getScreenshotSourceLabelForRow(row);
        const firstKeys = getScreenshotMatchKeysForRow(row).slice(0, 4).join(", ");
        return `${label}${firstKeys ? `\n  keys: ${firstKeys}` : ""}`;
      }).join("\n- ");

      const sampleFiles = imageFiles.slice(0, 8)
        .map((file) => file.webkitRelativePath || file.name)
        .join("\n- ");

      window.alert(
        `No screenshot matches found.\n\nRows searched: ${candidateRows.length}\nImages selected: ${imageFiles.length}\n\nChoose the same staged week folder, the original screenshot folder, or use single-row reattach and select the individual file.\n\nFirst saved row source names/keys:\n- ${sampleRows || "none"}\n\nFirst selected image files:\n- ${sampleFiles || "none"}`
      );
      showNotice("No screenshot matches found for the selected folder");
      return;
    }

    const reattachedAt = new Date().toISOString();

    setRows((prev) =>
      prev.map((row) => {
        if (!candidateIds.has(row.id)) return row;
        const match = matchesByRowId.get(row.id);

        if (!match) return row;

        if (row.sourceImageUrl && String(row.sourceImageUrl).startsWith("blob:")) {
          try {
            URL.revokeObjectURL(row.sourceImageUrl);
          } catch (error) {
            // Safe to ignore stale blob URLs after refresh.
          }
        }

        return {
          ...row,
          sourceImageUrl: URL.createObjectURL(match),
          sourceImageReattachedAt: reattachedAt,
          sourceImageReattachedName: match.webkitRelativePath || match.name,
          sourceImageClearedAfterReview: "N",
          sourceImageReattachedKeep: "Y",
        };
      })
    );

    const rowsWithSourceNames = candidateRows.filter(
      (row) => row.sourceFileName || row.sourceRelativePath
    ).length;

    const unmatched = Math.max(0, rowsWithSourceNames - matchesByRowId.size);
    const scopeLabel =
      scope === "all"
        ? "all rows"
        : scope === "visible"
        ? "visible rows"
        : "unreviewed/needed rows";

    showNotice(
      `Reattached ${matchesByRowId.size} screenshot${matchesByRowId.size === 1 ? "" : "s"} for ${scopeLabel}${
        unmatched ? ` (${unmatched} candidate row${unmatched === 1 ? "" : "s"} not in selected folder)` : ""
      }`
    );
  }

  function promptReattachSingleScreenshot(rowId) {
    if (!rowId) return;

    const row = rows.find((item) => item.id === rowId) || rowsWithWarnings.find((item) => item.id === rowId);
    const folderHint = getScreenshotFolderHintForRow(row || {});

    reattachSingleScreenshotRowIdRef.current = rowId;
    showNotice(`Choose ${folderHint}; app will search for this row's screenshot only.`);
    reattachSingleScreenshotInputRef.current?.click();
  }

  function reattachSingleScreenshot(rowId, fileList) {
    if (!rowId) return;

    const row = rows.find((item) => item.id === rowId);

    if (!row) {
      showNotice("That row is no longer loaded");
      return;
    }

    const { imageFiles, index, compactEntries } = buildScreenshotFileIndex(fileList);

    if (!imageFiles.length) {
      showNotice("No image files selected for single screenshot reattach");
      return;
    }

    const match = findScreenshotFileForRow(row, index, compactEntries);
    const folderHint = getScreenshotFolderHintForRow(row);

    if (!match) {
      // If the user picked one individual image instead of a folder, accept it
      // for single-row reattach after confirmation. This does not affect any
      // other row and is useful when source filenames are missing or stale.
      if (imageFiles.length === 1) {
        const onlyFile = imageFiles[0];
        const confirmed = window.confirm(
          `No filename match was found, but you selected exactly one image.\n\nAttach this file to the current row?\n\n${onlyFile.webkitRelativePath || onlyFile.name}`
        );

        if (confirmed) {
          const reattachedAt = new Date().toISOString();
          const nextUrl = URL.createObjectURL(onlyFile);

          setRows((prev) =>
            prev.map((item) => {
              if (item.id !== rowId) return item;

              if (item.sourceImageUrl && String(item.sourceImageUrl).startsWith("blob:")) {
                try {
                  URL.revokeObjectURL(item.sourceImageUrl);
                } catch (error) {
                  // Safe to ignore stale blob URLs.
                }
              }

              return {
                ...item,
                sourceImageUrl: nextUrl,
                sourceImageReattachedAt: reattachedAt,
                sourceImageReattachedName: onlyFile.webkitRelativePath || onlyFile.name,
                sourceImageClearedAfterReview: "N",
                sourceImageReattachedKeep: "Y",
              };
            })
          );

          showNotice("Attached selected screenshot to this row");
          return;
        }
      }

      const rowKeys = getScreenshotMatchKeysForRow(row).slice(0, 8).join("\n- ");
      const sampleFiles = imageFiles.slice(0, 8)
        .map((file) => file.webkitRelativePath || file.name)
        .join("\n- ");

      window.alert(
        `No screenshot match found for this row. Choose ${folderHint}.\n\nSaved source name:\n${getScreenshotSourceLabelForRow(row)}\n\nRow match keys:\n- ${rowKeys || "none"}\n\nImages selected: ${imageFiles.length}\n- ${sampleFiles || "none"}`
      );
      showNotice("No screenshot match found for this row");
      return;
    }

    const reattachedAt = new Date().toISOString();
    const nextUrl = URL.createObjectURL(match);

    setRows((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;

        if (item.sourceImageUrl && String(item.sourceImageUrl).startsWith("blob:")) {
          try {
            URL.revokeObjectURL(item.sourceImageUrl);
          } catch (error) {
            // Safe to ignore stale blob URLs.
          }
        }

        return {
          ...item,
          sourceImageUrl: nextUrl,
          sourceImageReattachedAt: reattachedAt,
          sourceImageReattachedName: match.webkitRelativePath || match.name,
          sourceImageClearedAfterReview: "N",
          sourceImageReattachedKeep: "Y",
        };
      })
    );

    showNotice("Reattached screenshot for this row only");
  }

  const setWinStatusForRow = (id, winValue, advance = false) => {
  captureUndoSnapshot(winValue === "Y" ? "Mark win" : "Mark loss", id);
  setRows((prev) =>
    prev.map((row) => {
      if (row.id !== id) return row;

      let next = {
        ...row,
        win: winValue,
        status: winValue === "Y" ? "Won" : "Lost",
        reviewResolved: "Y",
        reviewLater: "N",
        reviewDataLocked: "Y",
        hedgeScanNeedsRefresh: "Y",
      };
      next.auditTrailJson = appendAuditTrail(row, {
        win: winValue,
        status: winValue === "Y" ? "Won" : "Lost",
        reviewResolved: "Y",
      }, {
        reason: winValue === "Y" ? "Marked Win" : "Marked Loss",
        source: "review",
      });

      if (rowShouldDropScreenshotAfterReview(next)) {
        next = clearScreenshotForRow(next);
      }

      return preserveLockedAndReviewedFields(next, enrichRow(next));
    })
  );

  showNotice(winValue === "Y" ? "Marked win" : "Marked loss");

  if (advance) {
    setTimeout(() => selectNextNeedsReviewAfter(id), 0);
  }
};

  const ignoreDuplicateForRow = (id) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? enrichRow({ ...row, duplicateIgnored: row.duplicateIgnored === "Y" ? "N" : "Y" })
          : row
      )
    );
    showNotice("Duplicate preference updated");
  };

  const mergeDuplicatesIntoSelected = () => {
    if (!selectedRow) return showNotice("Select a row first");
    const key = makeDuplicateKey(selectedRow);
    const duplicateIds = rowsWithWarnings
      .filter((row) => row.id !== selectedRow.id && makeDuplicateKey(row) === key)
      .map((row) => row.id);

    if (duplicateIds.length === 0) return showNotice("No duplicates to merge");

    setRows((prev) => prev.filter((row) => !duplicateIds.includes(row.id)));
    setSelectedIds((prev) => prev.filter((id) => !duplicateIds.includes(id)));
    showNotice(`Merged ${duplicateIds.length} duplicate row${duplicateIds.length === 1 ? "" : "s"}`);
  };

  const buildCsvData = (rowsToExport, debug = false) => {
    if (debug) {
      const headers = [
        "Row ID",
        "Bet ID",
        "Source File Name",
        "Source Relative Path",
        "Upload Batch ID",
        "Upload Batch Label",
        "Upload Batch Folder",
        "Source Bookmaker From Path",
        "Source Image Reattached At",
        "Source Image Reattached Name",
        "Account Owner",
        "EventDate",
        "Bet Date",
        "Bookmaker",
        "Sport / League",
        "Selection",
        "Bet Type",
        "Bet Source Tag",
        "My Variable",
        "My Variable Reviewed",
        "Review Queue Reason",
        "Fixture / Event",
        "Stake",
        "Odds (US)",
        "Odds Source",
        "Odds Missing Reason",
        "Implied Probability",
        "Confidence",
        "Live",
        "Bonus Bet",
        "Win",
        "Review Later",
        "Likely Hedge",
        "Auto Likely Hedge",
        "Hedge Override",
        "Hedge Cluster ID",
        "Hedge Confidence",
        "Hedge Quality",
        "Guaranteed Profit",
        "Guaranteed Profit Amount",
        "Hedge Partner Bookmaker",
        "Ignored Hedge Partner IDs",
        "Hedge Stake",
        "Hedge Profit Low",
        "Hedge Profit High",
        "Hedge Profit If This Wins",
        "Hedge Profit If Other Wins",
        "Market Detail",
        "Payout",
        "To Win",
        "Raw Placed Date",
        "Status",
        "Parse Warning",
        "Duplicate Warning",
        "Review Notes",
        "OCR Text",
        "Debug Trace",
      ];

      const csvRows = rowsToExport.map((row) => [
        escapeCsv(row.id),
        escapeCsv(row.betId),
        escapeCsv(row.sourceFileName),
        escapeCsv(row.sourceRelativePath),
        escapeCsv(row.uploadBatchId),
        escapeCsv(row.uploadBatchLabel),
        escapeCsv(row.uploadBatchFolder),
        escapeCsv(row.sourceBookmakerFromPath),
        escapeCsv(row.sourceImageReattachedAt),
        escapeCsv(row.sourceImageReattachedName),
        escapeCsv(row.accountOwner),
        escapeCsv(row.eventDate),
        escapeCsv(row.betDate),
        escapeCsv(getDisplayedBookmaker(row)),
        escapeCsv(row.sportLeague),
        escapeCsv(row.selection),
        escapeCsv(row.betType),
        escapeCsv(row.betSourceTag),
        escapeCsv(getSuggestedMyVariable(row)),
        escapeCsv(getMyVariableState(row).reviewed ? "Y" : "N"),
        escapeCsv(row.reviewQueueReason || ""),
        escapeCsv(row.fixtureEvent),
        escapeCsv(row.stake),
        escapeCsv(row.oddsUS),
        escapeCsv(row.oddsSource),
        escapeCsv(row.oddsMissingReason),
        escapeCsv(row.impliedProbability),
        escapeCsv(row.confidenceFlag),
        escapeCsv(row.live),
        escapeCsv(row.bonusBet),
        escapeCsv(row.win),
        escapeCsv(row.reviewLater),
        escapeCsv(row.likelyHedge),
        escapeCsv(row.autoLikelyHedge),
        escapeCsv(row.hedgeOverride),
        escapeCsv(row.hedgeClusterId),
        escapeCsv(row.hedgeConfidence),
        escapeCsv(row.hedgeQuality),
        escapeCsv(row.guaranteedProfit),
        escapeCsv(row.guaranteedProfitAmount),
        escapeCsv(row.hedgePartnerBookmaker),
        escapeCsv(row.ignoredHedgePartnerIds),
        escapeCsv(row.hedgeStake),
        escapeCsv(row.hedgeProfitLow),
        escapeCsv(row.hedgeProfitHigh),
        escapeCsv(row.hedgeProfitIfThisWins),
        escapeCsv(row.hedgeProfitIfOtherWins),
        escapeCsv(row.marketDetail),
        escapeCsv(row.payout),
        escapeCsv(row.toWin),
        escapeCsv(row.rawPlacedDate),
        escapeCsv(row.status),
        escapeCsv(row.parseWarning),
        escapeCsv(row.duplicateWarning),
        escapeCsv(row.reviewNotes),
        escapeCsv(row.sourceText),
        escapeCsv(JSON.stringify(row.debugTrace || [])),
      ]);

      return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    }

        const headers = [
      "eventDate",
      "betDate",
      "bookmaker",
      "sportLeague",
      "selection",
      "betType",
      "fixtureEvent",
      "stake",
      "oddsUS",
      "payout",
      "toWin",
      "betId",
      "betSourceTag",
      "accountOwner",
      "likelyHedge",
      "hedgeClusterId",
      "hedgeConfidence",
      "hedgeQuality",
      "guaranteedProfit",
      "guaranteedProfitAmount",
      "hedgePartnerBookmaker",
      "hedgeStake",
      "hedgeProfitIfThisWins",
      "hedgeProfitIfOtherWins",
    ];

    const csvRows = rowsToExport.map((row) => [
      escapeCsv(row.eventDate),
      escapeCsv(row.betDate),
      escapeCsv(getDisplayedBookmaker(row)),
      escapeCsv(row.sportLeague),
      escapeCsv(row.selection),
      escapeCsv(row.betType),
      escapeCsv(row.betSourceTag),
      escapeCsv(row.fixtureEvent),
      escapeCsv(row.stake),
      escapeCsv(row.oddsUS),
      escapeCsv(row.oddsSource),
      escapeCsv(row.oddsMissingReason),
      escapeCsv(row.impliedProbability),
      escapeCsv(row.confidenceFlag),
      escapeCsv(row.live),
      escapeCsv(row.bonusBet),
      escapeCsv(row.win),
    ]);

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

    const activeRows = rowsWithWarnings.filter((row) => row.archived !== "Y");
    const checklist = buildPreExportChecklist(activeRows);

    if (!checklist.okToExport && !window.confirm(checklist.message)) return;

    const groupedRows = groupHedgeRowsTogether(activeRows);
    downloadCsv("betting-tracker-export.csv", buildTrackerCsvData(groupedRows));
    showNotice("Tracker CSV exported");
  };

  const exportDebugCsv = () => {
    if (rowsWithWarnings.length === 0) return showNotice("No rows to export");
    const groupedRows = groupHedgeRowsTogether(rowsWithWarnings);
    downloadCsv("bet-slip-debug-data.csv", buildCsvData(groupedRows, true));
    showNotice("Debug CSV exported");
  };

  const exportSelectedCsv = (debug = false) => {
    const rowsToExport = rowsWithWarnings.filter((row) => selectedIds.includes(row.id));
    if (rowsToExport.length === 0) return showNotice("No selected rows to export");

    const groupedRows = groupHedgeRowsTogether(rowsToExport);

    downloadCsv(
      debug ? "bet-slip-selected-debug-data.csv" : "bet-slip-selected-data.csv",
      buildCsvData(groupedRows, debug)
    );
    showNotice(`Exported ${groupedRows.length} selected row${groupedRows.length === 1 ? "" : "s"}`);
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
    const payload = {
      exportedAt: new Date().toISOString(),
      rows: prepareRowsForPersistentStorage(rows),
      uploadOwner,
      uploadBookmaker,
      changelog,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bet-slip-app-state.json";
    link.click();
    URL.revokeObjectURL(url);
    showNotice("App state exported");
  };

  const exportKnownTeamNames = () => {
    const raw = localStorage.getItem("betSlipKnownTeamNamesByLeagueV1") || "{}";
    let parsed = {};

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      parsed = {};
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      storageKey: "betSlipKnownTeamNamesByLeagueV1",
      knownTeamNamesByLeague: parsed,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bet-slip-known-team-names.json";
    link.click();
    URL.revokeObjectURL(url);
    showNotice("Known team names exported");
  };

  const importAppState = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.rows)) setRows(parsed.rows);
      if (typeof parsed.uploadOwner === "string") setUploadOwner(parsed.uploadOwner);
      if (typeof parsed.uploadBookmaker === "string") setUploadBookmaker(parsed.uploadBookmaker);
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

  const startResize = (event, columnKey) => {
    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      columnKey,
      startX: event.clientX,
      startWidth: columnWidths[columnKey] || 120,
    };

    const onMouseMove = (moveEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;

      const delta = moveEvent.clientX - state.startX;
      const nextWidth = Math.max(60, state.startWidth + delta);

      setColumnWidths((prev) => ({
        ...prev,
        [state.columnKey]: nextWidth,
      }));
    };

    const onMouseUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const editorFields = [
    ["eventDate", "EventDate"],
    ["betDate", "Bet Date"],
    ["bookmaker", "Bookmaker"],
    ["sportLeague", "Sport / League"],
    ["selection", "Selection"],
    ["fixtureEvent", "Fixture / Event"],
    ["stake", "Stake"],
    ["oddsUS", "Odds (US)"],
    ["marketDetail", "Market Detail (helper)"],
    ["payout", "Payout (helper)"],
    ["toWin", "To Win (helper)"],
    ["rawPlacedDate", "Raw Placed Date (helper)"],
    ["status", "Status (helper)"],
    ["parseWarning", "Parse Warning (helper)"],
    ["sourceFileName", "Source File Name (helper)"],
    ["betId", "Bet ID (helper)"],
  ];

function archiveSelectedRows() {
  if (!selectedIds.length) return;
  captureUndoSnapshot("Archive selected rows", selectedIds[0] || "bulk");

  const confirmed = window.confirm(
    `Archive ${selectedIds.length} selected row${selectedIds.length === 1 ? "" : "s"}?`
  );

  if (!confirmed) return;

  setRows((prev) =>
    prev.map((row) =>
      selectedIds.includes(row.id)
        ? { ...row, archived: "Y", exported: row.exported || "N" }
        : row
    )
  );

  setSelectedIds([]);
  showNotice("Selected rows archived");
}

function unarchiveSelectedRows() {
  if (!selectedIds.length) return;
  captureUndoSnapshot("Unarchive selected rows", selectedIds[0] || "bulk");

  setRows((prev) =>
    prev.map((row) =>
      selectedIds.includes(row.id)
        ? { ...row, archived: "N" }
        : row
    )
  );

  setSelectedIds([]);
  showNotice("Selected rows unarchived");
}

function unarchiveVisibleArchivedRows() {
  const visibleArchivedIds = visibleRows
    .filter(rowIsArchived)
    .map((row) => row.id);

  if (!visibleArchivedIds.length) {
    showNotice("No archived rows visible to unarchive");
    return;
  }

  const confirmed = window.confirm(
    `Unarchive ${visibleArchivedIds.length} visible archived row${visibleArchivedIds.length === 1 ? "" : "s"}?`
  );

  if (!confirmed) return;

  setRows((prev) =>
    prev.map((row) =>
      visibleArchivedIds.includes(row.id)
        ? { ...row, archived: "N" }
        : row
    )
  );

  setSelectedIds((prev) => prev.filter((id) => !visibleArchivedIds.includes(id)));
  applySavedFilterView("review_all");
  showNotice(
    `Unarchived ${visibleArchivedIds.length} row${visibleArchivedIds.length === 1 ? "" : "s"} and returned to Review Queue`
  );
}

function clearArchiveFlags() {
  const archivedCount = rows.filter(rowIsArchived).length;

  if (!archivedCount) {
    showNotice("No archived rows to clear");
    return;
  }

  const confirmed = window.confirm(
    `Unarchive all ${archivedCount} archived row${archivedCount === 1 ? "" : "s"}?`
  );

  if (!confirmed) return;

  setRows((prev) =>
    prev.map((row) => ({
      ...row,
      archived: "N",
    }))
  );

  showNotice("Archive flags cleared");
}

  function confirmDatesForRowIds(rowIds = []) {
    if (!rowIds.length) return showNotice("No rows selected");

    setRows((prev) =>
      prev.map((row) =>
        rowIds.includes(row.id)
          ? enrichRow({
              ...row,
              betDateNeedsConfirm: "N",
              betDateConfirmed: "Y",
              betDateInferred: "N",
              parseWarning: removeDateConfirmWarnings(row.parseWarning),
              reviewLater: row.reviewLater === "Y" ? "N" : row.reviewLater,
            })
          : row
      )
    );

    showNotice(`Confirmed dates for ${rowIds.length} row${rowIds.length === 1 ? "" : "s"}`);
  }

  function confirmDatesForSelectedRows() {
    confirmDatesForRowIds(selectedIds);
  }

  function confirmDatesForVisibleRows() {
    const visibleIds = visibleRows
      .filter((row) => row.betDateNeedsConfirm === "Y")
      .map((row) => row.id);

    confirmDatesForRowIds(visibleIds);
  }

  function exportReviewedRowsOnly() {
    const rowsToExport = rowsWithWarnings.filter(
      (row) => !rowIsArchived(row) && rowIsExportReady(row)
    );

    if (!rowsToExport.length) return showNotice("No reviewed rows ready to export");

    const checklist = buildPreExportChecklist(rowsToExport);

    if (!checklist.okToExport && !window.confirm(checklist.message)) return;

    const groupedRows = groupHedgeRowsTogether(rowsToExport);
    downloadCsv("betting-tracker-reviewed-only.csv", buildTrackerCsvData(groupedRows));

    setRows((prev) =>
      prev.map((row) =>
        rowsToExport.some((exportRow) => exportRow.id === row.id)
          ? { ...row, exported: "Y" }
          : row
      )
    );

    showNotice(`Exported ${groupedRows.length} reviewed row${groupedRows.length === 1 ? "" : "s"}`);
  }

  function archiveExportedReviewedRows() {
    const rowsToArchive = rowsWithWarnings.filter(
      (row) =>
        !rowIsArchived(row) &&
        row.reviewResolved === "Y" &&
        row.exported === "Y"
    );

    if (!rowsToArchive.length) return showNotice("No exported reviewed rows to archive");

    const confirmed = window.confirm(
      `Archive ${rowsToArchive.length} exported reviewed row${rowsToArchive.length === 1 ? "" : "s"}?`
    );

    if (!confirmed) return;

    setRows((prev) =>
      prev.map((row) =>
        rowsToArchive.some((archiveRow) => archiveRow.id === row.id)
          ? { ...row, archived: "Y" }
          : row
      )
    );

    showNotice("Exported reviewed rows archived");
  }

  function runPreExportChecklist() {
    const checklist = buildPreExportChecklist(rowsWithWarnings);
    window.alert(checklist.message.replace("\n\nExport anyway?", ""));
  }

  async function runManualHedgeScan(options = {}) {
    const { launchAfterScan = false } = options;
    if (!rows.length) {
      showNotice("No rows loaded for hedge scan");
      return;
    }

    setBackgroundTaskMessage("Running hedge scan...");

    // Let React paint the spinner before the synchronous scan work starts.
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const enriched = rows.map((row) =>
        preserveLockedAndReviewedFields(row, enrichRow(row))
      );
      const scanned = addLikelyHedgeFlags(addDuplicateWarnings(enriched));
      const scannedById = new Map(scanned.map((row) => [row.id, row]));

      const hedgeRows = scanned.filter((row) => row.likelyHedge === "Y").length;
      const clusters = new Set(
        scanned
          .map((row) => row.hedgeClusterId)
          .filter(Boolean)
      );

      const payoutMatches = scanned.filter((row) =>
        String(row.hedgeQuality || "").toLowerCase().includes("payout match")
      ).length;

      const stamp = new Date().toISOString();

      setRows((prev) =>
        prev.map((row) => {
          const scannedRow = scannedById.get(row.id);

          if (!scannedRow) {
            return {
              ...row,
              likelyHedge: row.hedgeOverride === "Y" ? "Y" : "N",
              autoLikelyHedge: row.hedgeOverride === "Y" ? row.autoLikelyHedge || "Y" : "N",
              hedgeClusterId: row.hedgeOverride === "Y" ? row.hedgeClusterId || "" : "",
              lastHedgeScanAt: stamp,
              hedgeScanNeedsRefresh: "N",
            };
          }

          return {
            ...row,
            ...getHedgeFieldsFromScannedRow(scannedRow, row),
            lastHedgeScanAt: stamp,
            hedgeScanNeedsRefresh: "N",
          };
        })
      );

      const unresolvedPairKeys = getUnresolvedHedgePairKeys(scanned);
      const firstHedgeRow = scanned.find((row) => rowNeedsHedgeReview(row));

      applySavedFilterView("hedge_review");

      if (launchAfterScan) {
        if (!firstHedgeRow?.id || !unresolvedPairKeys.length) {
          showNotice("Hedge scan found no unresolved compatible pairs among confirmed bets.");
        } else {
          setSelectedRowId(firstHedgeRow.id);
          window.setTimeout(() => {
            setHedgeReviewLaunchToken((value) => value + 1);
          }, 0);
        }
      }

      showNotice(
        `Hedge scan: ${unresolvedPairKeys.length} unique pair${unresolvedPairKeys.length === 1 ? "" : "s"}, ${hedgeRows} candidate row${hedgeRows === 1 ? "" : "s"}, ${payoutMatches} payout-match row${payoutMatches === 1 ? "" : "s"}`
      );
    } catch (error) {
      console.error(error);
      showNotice("Hedge scan failed. Check the console for details.");
    } finally {
      setBackgroundTaskMessage("");
    }
  }

  function markSelectedRowsExported() {
    if (!selectedIds.length) return;

    setRows((prev) =>
      prev.map((row) =>
        selectedIds.includes(row.id)
          ? { ...row, exported: "Y" }
          : row
      )
    );

    showNotice("Selected rows marked exported");
  }

  function appendUniqueIdString(existing = "", id = "") {
    const parts = String(existing || "")
      .split(/[,|]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (id && !parts.includes(id)) parts.push(id);
    return parts.join(",");
  }

  function removeIdFromString(existing = "", id = "") {
    return String(existing || "")
      .split(/[,|]/)
      .map((part) => part.trim())
      .filter((part) => part && part !== id)
      .join(",");
  }

  function markSelectedRowsAsConfirmedHedgePair() {
    if (selectedIds.length !== 2) {
      showNotice("Select exactly 2 rows to confirm a hedge pair");
      return;
    }

    const [firstId, secondId] = selectedIds;
    const loadedRows = rowsWithWarnings || rows || [];
    const first = loadedRows.find((row) => row.id === firstId);
    const second = loadedRows.find((row) => row.id === secondId);

    if (!first || !second) {
      showNotice("Could not find both selected rows");
      return;
    }

    const clusterId = `manual_hedge_${[firstId, secondId].sort().join("__")}`;

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== firstId && row.id !== secondId) return row;

        const partner = row.id === firstId ? second : first;
        const partnerBook = getDisplayedBookmaker(partner) || partner.bookmaker || "Selected row";

        return {
          ...row,
          likelyHedge: "Y",
          autoLikelyHedge: "Y",
          hedgeOverride: "Y",
          betSourceTag: row.betSourceTag || "Hedge",
          hedgeClusterId: clusterId,
          hedgeClusterSize: "2",
          hedgeConfidence: "Manual",
          hedgeQuality: "Confirmed Hedge",
          hedgePartnerBookmaker: partnerBook,
          confirmedHedgePartnerIds: appendUniqueIdString(row.confirmedHedgePartnerIds, partner.id),
          hedgeCandidateIds: appendUniqueIdString(row.hedgeCandidateIds, partner.id),
          hedgeCandidateCount: row.hedgeCandidateCount || "1",
          ignoredHedgePartnerIds: removeIdFromString(row.ignoredHedgePartnerIds, partner.id),
          everHedgeCandidate: "Y",
          everLikelyHedge: "Y",
          hedgeHistoryReason: row.hedgeHistoryReason || "Manually confirmed selected hedge pair",
          reviewLater: "N",
        };
      })
    );

    setSavedFilterView("hedge_history");
    showNotice(`Confirmed selected hedge pair: ${getDisplayedBookmaker(first) || first.bookmaker || "Row 1"} + ${getDisplayedBookmaker(second) || second.bookmaker || "Row 2"}`);
  }

    function getRowsForUploadBatch(batchId, includeArchived = true) {
    const batchRows = rowsWithWarnings.filter(
      (row) =>
        row.uploadBatchId === batchId &&
        (includeArchived || !rowIsArchived(row))
    );

    return groupHedgeRowsTogether(batchRows);
  }

  function getBatchLabel(batch = {}) {
    const folder = batch.folder ? ` - ${batch.folder}` : "";
    return `${batch.label || "Batch"}${folder}`;
  }

  function exportUploadBatchTrackerCsv(batchId) {
    const batch = uploadBatches.find((item) => item.id === batchId);
    const batchRows = getRowsForUploadBatch(batchId, true);

    if (!batchRows.length) {
      showNotice("No rows found for that batch");
      return;
    }

    const label = safeFilePart(getBatchLabel(batch));
    downloadCsv(`betting-tracker-${label}.csv`, buildTrackerCsvData(batchRows));
    showNotice(`Exported tracker CSV for ${batchRows.length} batch row${batchRows.length === 1 ? "" : "s"}`);
  }

  function exportUploadBatchDebugCsv(batchId) {
    const batch = uploadBatches.find((item) => item.id === batchId);
    const batchRows = getRowsForUploadBatch(batchId, true);

    if (!batchRows.length) {
      showNotice("No rows found for that batch");
      return;
    }

    const label = safeFilePart(getBatchLabel(batch));
    downloadCsv(`bet-slip-debug-${label}.csv`, buildCsvData(batchRows, true));
    showNotice(`Exported debug CSV for ${batchRows.length} batch row${batchRows.length === 1 ? "" : "s"}`);
  }

  function deleteUploadBatchRows(batchId) {
    const batch = uploadBatches.find((item) => item.id === batchId);
    const batchRows = rows.filter((row) => row.uploadBatchId === batchId);

    if (!batchRows.length) {
      showNotice("No rows found for that batch");
      return;
    }

    const label = getBatchLabel(batch);
    const confirmed = window.confirm(
      `Delete ${batchRows.length} row${batchRows.length === 1 ? "" : "s"} from ${label}? This only deletes rows from the app, not image files.`
    );

    if (!confirmed) return;

    setRows((prev) => prev.filter((row) => row.uploadBatchId !== batchId));
    setSelectedIds((prev) =>
      prev.filter((id) => !batchRows.some((row) => row.id === id))
    );

    if (batchRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId("");
    }

    setUploadBatches((prev) =>
      prev.map((item) =>
        item.id === batchId
          ? { ...item, status: "deleted", deletedAt: Date.now() }
          : item
      )
    );

    showNotice(`Deleted ${batchRows.length} row${batchRows.length === 1 ? "" : "s"} from ${label}`);
  }

  function exportSelectedRowsToCsv() {
    const selectedRows = rowsWithWarnings.filter(
      (row) => selectedIds.includes(row.id) && !rowIsArchived(row)
    );

    if (!selectedRows.length) return showNotice("No selected active rows to export");

    const groupedRows = groupHedgeRowsTogether(selectedRows);

    const unreviewed = groupedRows.filter(
      (row) => row.reviewResolved !== "Y"
    );

    if (unreviewed.length > 0) {
      showNotice(`Warning: ${unreviewed.length} rows not reviewed`);
    }

    const headers = [
      "eventDate",
      "betDate",
      "bookmaker",
      "sportLeague",
      "selection",
      "betType",
      "fixtureEvent",
      "stake",
      "oddsUS",
      "payout",
      "toWin",
      "betId",
      "betSourceTag",
      "accountOwner",
      "likelyHedge",
      "hedgeQuality",
      "hedgePartnerBookmaker",
      "hedgeStake",
      "hedgeProfitIfThisWins",
      "hedgeProfitIfOtherWins",
    ];

    const csv = [
      headers.join(","),
      ...groupedRows.map((row) =>
        headers.map((header) => escapeCsv(row[header])).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bet-slip-export-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    markSelectedRowsExported();
    showNotice(`Exported ${groupedRows.length} row${groupedRows.length === 1 ? "" : "s"} in current batch`);
  }

  return (
    <div
      style={{
        padding: 18,
        fontFamily: "Arial, sans-serif",
        fontSize: 13,
        maxWidth: 1700,
        margin: "0 auto",
        backgroundColor: "#ffffff",
        color: "#000000",
        minHeight: "100vh",
        zoom: APP_UI_SCALE,
        transformOrigin: "top center",
      }}
    >
      <style>{`@keyframes betSlipSpinner { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  }}
>
  <div>
    <h1 style={{ margin: 0 }}>Bet Slip Reader</h1>
    <p style={{ margin: "4px 0 0 0", color: "#555" }}>
      Upload bet slips, review parsed data, detect hedges, and export clean records.
    </p>
  </div>

  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
    <Link href="/ev-parlay-lab" style={evLabButtonStyle}>
      {"Open EV Parlay Lab ->"}
    </Link>

    <Link
      href="/tools"
      style={{
        ...evLabButtonStyle,
        background: "#1d4ed8",
        border: "2px solid #1e40af",
        color: "#eff6ff",
      }}
    >
      {"Open Tools ->"}
    </Link>
  </div>
</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, auto) minmax(260px, auto) 1fr",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
          padding: 12,
          border: "1px solid #d1d5db",
          borderRadius: 10,
          background: "#f9fafb",
        }}
      >
        <label style={{ color: "#14532d", display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
          Upload owner
          <select
            value={uploadOwner}
            onChange={(e) => setUploadOwner(e.target.value)}
            style={{ ...selectStyle, width: 120, padding: "6px 8px" }}
          >
            <option value="Me">Me</option>
            <option value="Wife">Wife</option>
          </select>
        </label>

        <label style={{ color: "#14532d", display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
          Upload sportsbook
          <select
            value={uploadBookmaker}
            onChange={(e) => setUploadBookmaker(e.target.value)}
            style={{ ...selectStyle, width: 150, padding: "6px 8px" }}
          >
            {BOOKMAKER_UPLOAD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => document.getElementById("upload-bets-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{
              ...smallButtonStyle,
              border: "1px solid #166534",
              background: "#dcfce7",
              color: "#14532d",
              fontWeight: 900,
              padding: "10px 14px",
            }}
          >
            Upload / Add Bets
          </button>

          <button
            type="button"
            onClick={startReviewSession}
            style={{
              ...smallButtonStyle,
              border: savedFilterView === "review_all" ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
              background: savedFilterView === "review_all" ? "#dbeafe" : "#eff6ff",
              color: "#1e3a8a",
              fontWeight: 950,
              padding: "10px 14px",
            }}
          >
            Review All ({reviewAllCount})
          </button>

          <button
            type="button"
            onClick={undoLastReviewChange}
            disabled={!undoStack.length}
            style={{
              ...smallButtonStyle,
              border: "1px solid #64748b",
              background: undoStack.length ? "#f8fafc" : "#e5e7eb",
              color: undoStack.length ? "#334155" : "#94a3b8",
              fontWeight: 900,
              padding: "10px 14px",
              opacity: undoStack.length ? 1 : 0.65,
            }}
            title={undoStack.length ? `Undo: ${undoStack[undoStack.length - 1].label}` : "Nothing to undo"}
          >
            Undo{undoStack.length ? ` (${undoStack.length})` : ""}
          </button>

          <button
            type="button"
            onClick={() => setShowBatchQa((prev) => !prev)}
            style={{
              ...smallButtonStyle,
              border: batchQaHighCount ? "2px solid #dc2626" : "1px solid #f59e0b",
              background: batchQaHighCount ? "#fef2f2" : "#fffbeb",
              color: batchQaHighCount ? "#991b1b" : "#92400e",
              fontWeight: 950,
              padding: "10px 14px",
            }}
            title="Final sanity check for suspicious rows before export"
          >
            Batch QA ({batchQaIssues.length})
          </button>

          <button
            type="button"
            onClick={startHedgeReviewMode}
            disabled={hedgeEligibleRowCount < 2}
            style={{
              ...smallButtonStyle,
              border: "2px solid #6d28d9",
              background: hedgeEligibleRowCount >= 2 ? "#7c3aed" : "#e5e7eb",
              color: hedgeEligibleRowCount >= 2 ? "#ffffff" : "#6b7280",
              fontWeight: 950,
              padding: "10px 14px",
              opacity: hedgeEligibleRowCount >= 2 ? 1 : 0.65,
            }}
            title="Open the first unresolved hedge pair directly in Hedge Review"
          >
            Start Hedge Review ({hedgeReviewCount} pairs)
          </button>

          <button
            type="button"
            onClick={() => runManualHedgeScan()}
            style={{
              ...smallButtonStyle,
              border: savedFilterView === "hedge_review" ? "2px solid #7c3aed" : "1px solid #c4b5fd",
              background: savedFilterView === "hedge_review" ? "#ede9fe" : "#faf5ff",
              color: "#4c1d95",
              fontWeight: 950,
              padding: "10px 14px",
            }}
          >
            Hedge Queue ({hedgeReviewCount} pairs)
          </button>

          <button
            type="button"
            onClick={() => applySavedFilterView("hedge_history")}
            style={{
              ...smallButtonStyle,
              border: savedFilterView === "hedge_history" ? "2px solid #9a3412" : "1px solid #fed7aa",
              background: savedFilterView === "hedge_history" ? "#ffedd5" : "#fff7ed",
              color: "#9a3412",
              fontWeight: 950,
              padding: "10px 14px",
            }}
            title="Review every row that has ever been flagged, confirmed, denied, or hidden as a possible hedge."
          >
            Hedge History ({hedgeHistoryCount})
          </button>

          <button
            type="button"
            onClick={exportReviewedRowsOnly}
            disabled={!exportReadyCount}
            style={{
              ...smallButtonStyle,
              border: "1px solid #166534",
              background: exportReadyCount ? "#16a34a" : "#e5e7eb",
              color: exportReadyCount ? "#ffffff" : "#6b7280",
              fontWeight: 950,
              padding: "10px 14px",
              opacity: exportReadyCount ? 1 : 0.65,
            }}
          >
            Export Reviewed ({exportReadyCount})
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: 12,
          padding: 12,
          border: "1px solid #bfdbfe",
          borderRadius: 10,
          background: "#eff6ff",
          color: "#1e3a8a",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          fontSize: 14,
        }}
      >
        <strong>Workflow: {getWorkflowViewLabel()}</strong>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 800,
            color: "#1e3a8a",
          }}
        >
          Search rows
          <input
            value={rowSearchQuery}
            onChange={(e) => setRowSearchQuery(e.target.value)}
            placeholder="Houston, player, book, bet ID..."
            style={{
              width: 255,
              padding: "6px 9px",
              border: "1px solid #93c5fd",
              borderRadius: 8,
              background: "#ffffff",
              color: "#0f172a",
              fontWeight: 700,
            }}
          />
        </label>
        {rowSearchQuery.trim() && (
          <button
            type="button"
            onClick={() => setRowSearchQuery("")}
            style={{
              ...smallButtonStyle,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: 900,
            }}
          >
            Clear Search
          </button>
        )}
        <span>Total rows: <strong>{rowsWithWarnings.length}</strong></span>
        <span>Active: <strong>{activeLoadedRowsCount}</strong></span>
        <span>Review All: <strong>{reviewAllCount}</strong></span>
        <span>Hedge Review: <strong>{hedgeReviewCount}</strong></span>
        <span>Hedge History: <strong>{hedgeHistoryCount}</strong></span>
        {hedgeScanStaleCount > 0 && (
          <span style={{ color: "#7c2d12" }}>Hedge scan stale: <strong>{hedgeScanStaleCount}</strong></span>
        )}
        <span>Export Ready: <strong>{exportReadyCount}</strong></span>
        {cleanNotMarkedReviewedCount > 0 && (
          <span>Clean not marked reviewed: <strong>{cleanNotMarkedReviewedCount}</strong></span>
        )}
        <span>Archived: <strong>{archivedCount}</strong></span>
        <span style={{ color: storageStats.totalKb > 4500 ? "#991b1b" : "#475569" }}>
          Storage: <strong>{storageStats.totalKb} KB</strong> | Screenshots: <strong>{storageStats.screenshots}</strong>
        </span>
        <span style={{ color: "#166534" }}>Performance Mode: <strong>On</strong></span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", fontWeight: 800 }}>
          Table
          <select
            value={tableMode}
            onChange={(e) => setTableMode(e.target.value)}
            style={{ ...selectStyle, width: 125, padding: "5px 8px" }}
          >
            <option value="simplified">Simplified</option>
            <option value="debug">Debug</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setShowMoreTools((prev) => !prev)}
          style={{ ...smallButtonStyle, fontWeight: 900 }}
        >
          {showMoreTools ? "Hide More Tools" : "More Tools"}
        </button>
      </div>

<div
  style={{
    marginBottom: 12,
    padding: 12,
    border: "1px solid #c7d2fe",
    borderRadius: 10,
    background: "#f8fafc",
    display: "grid",
    gap: 8,
  }}
>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <strong style={{ color: "#0f172a" }}>Review Session</strong>
    <span style={{ color: "#475569", fontWeight: 800 }}>
      {reviewSessionCompleted} completed this session | {reviewSessionElapsedMinutes} min
    </span>
  </div>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(110px, 1fr))", gap: 8 }}>
    {[
      ["Remaining", reviewAllCount],
      ["Parser Issues", reviewSessionCounts.parserIssue],
      ["Missing Date", reviewSessionCounts.missingDate],
      ["Missing Context", reviewSessionCounts.missingContext],
      ["Simple Confirm", reviewSessionCounts.simpleConfirm],
    ].map(([label, value]) => (
      <div key={`session-${label}`} style={{ padding: 9, border: "1px solid #e2e8f0", borderRadius: 8, background: "#ffffff" }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 850, textTransform: "uppercase" }}>{label}</div>
        <div style={{ marginTop: 3, fontSize: 20, color: "#0f172a", fontWeight: 950 }}>{value}</div>
      </div>
    ))}
  </div>
</div>

{showBatchQa && (
  <div
    style={{
      marginBottom: 12,
      padding: 12,
      border: "1px solid #f59e0b",
      borderRadius: 10,
      background: "#fffbeb",
      display: "grid",
      gap: 8,
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <strong style={{ color: "#92400e" }}>Batch QA — {batchQaIssues.length} issue{batchQaIssues.length === 1 ? "" : "s"}</strong>
      <span style={{ color: batchQaHighCount ? "#991b1b" : "#92400e", fontWeight: 900 }}>
        {batchQaHighCount} high priority
      </span>
    </div>

    {!batchQaIssues.length ? (
      <div style={{ color: "#166534", fontWeight: 900 }}>No suspicious rows found by the current QA checks.</div>
    ) : (
      <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {batchQaIssues.slice(0, 50).map((issue, index) => (
          <button
            key={`${issue.rowId}-${issue.code}-${index}`}
            type="button"
            onClick={() => {
              setSelectedRowId(issue.rowId);
              setRowSearchQuery("");
              applySavedFilterView("all_active");
              showNotice("QA row selected. Open its image/review panel to inspect it.");
            }}
            style={{
              textAlign: "left",
              padding: "8px 10px",
              border: issue.severity === "high" ? "1px solid #fca5a5" : "1px solid #fde68a",
              borderRadius: 8,
              background: issue.severity === "high" ? "#fff1f2" : "#ffffff",
              color: issue.severity === "high" ? "#991b1b" : "#78350f",
              cursor: "pointer",
            }}
          >
            <strong>{issue.severity.toUpperCase()} — {issue.code.replace(/_/g, " ")}</strong>
            <div style={{ marginTop: 2 }}>{issue.message}</div>
          </button>
        ))}
      </div>
    )}
  </div>
)}

<div
  id="upload-bets-section"
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(420px, 1fr) 320px",
    gap: 16,
    alignItems: "stretch",
    marginBottom: 12,
  }}
>
  <UploadDropZone onFiles={handleUpload} />
  <ReviewLegend />
</div>

<UploadBatchStatus
  batches={uploadBatches}
  onClearHistory={clearUploadHistory}
/>

<input
  ref={reattachScreenshotsInputRef}
  type="file"
  multiple
  accept="image/*"
  webkitdirectory="true"
  directory="true"
  style={{ display: "none" }}
  onChange={(event) => {
    reattachScreenshots(event.target.files, { scope: reattachScreenshotsScopeRef.current || "needed" });
    reattachScreenshotsScopeRef.current = "needed";
    event.target.value = "";
  }}
/>

<input
  ref={reattachSingleScreenshotInputRef}
  type="file"
  multiple
  accept="image/*"
  webkitdirectory="true"
  directory="true"
  style={{ display: "none" }}
  onChange={(event) => {
    reattachSingleScreenshot(reattachSingleScreenshotRowIdRef.current, event.target.files);
    reattachSingleScreenshotRowIdRef.current = "";
    event.target.value = "";
  }}
/>

{uploadBatches.some((batch) =>
  rowsWithWarnings.some((row) => row.uploadBatchId === batch.id)
) && (
  <div
    style={{
      marginTop: 10,
      marginBottom: 10,
      padding: 12,
      border: "1px solid #d1d5db",
      borderRadius: 10,
      background: "#f8fafc",
      display: "grid",
      gap: 8,
    }}
  >
    <strong>Upload Batch Tools</strong>

    {uploadBatches
      .filter((batch) =>
        rowsWithWarnings.some((row) => row.uploadBatchId === batch.id)
      )
      .map((batch) => {
        const batchRows = rowsWithWarnings.filter(
          (row) => row.uploadBatchId === batch.id
        );

        const activeCount = batchRows.filter((row) => !rowIsArchived(row)).length;
        const archivedCount = batchRows.filter(rowIsArchived).length;
        const hedgeCount = batchRows.filter((row) => row.likelyHedge === "Y").length;

        return (
          <div
            key={batch.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              padding: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#ffffff",
            }}
          >
            <span style={{ fontWeight: 700 }}>
              {getBatchLabel(batch)}
            </span>

            <span style={{ color: "#555" }}>
              {batchRows.length} rows | {activeCount} active | {archivedCount} archived | {hedgeCount} hedge
            </span>

            <button
              type="button"
              onClick={() => exportUploadBatchTrackerCsv(batch.id)}
              style={smallButtonStyle}
            >
              Export Batch Tracker CSV
            </button>

            <button
              type="button"
              onClick={() => exportUploadBatchDebugCsv(batch.id)}
              style={smallButtonStyle}
            >
              Export Batch Debug CSV
            </button>

            <button
              type="button"
              onClick={() => deleteUploadBatchRows(batch.id)}
              style={{
                ...smallButtonStyle,
                border: "1px solid #dc2626",
                background: "#fef2f2",
                color: "#991b1b",
              }}
            >
              Delete Batch Rows
            </button>
          </div>
        );
      })}
  </div>
)}

{showMoreTools && (
  <div
    style={{
      marginTop: 10,
      marginBottom: 10,
      padding: 12,
      border: "1px solid #d1d5db",
      borderRadius: 10,
      background: "#f8fafc",
      display: "grid",
      gap: 10,
    }}
  >
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <strong style={{ marginRight: 4 }}>More tools</strong>

      <button
        type="button"
        onClick={() => applySavedFilterView("all_active")}
        style={smallButtonStyle}
      >
        All Active Rows
      </button>

      <button
        type="button"
        onClick={() => {
          applySavedFilterView("archived");
          showNotice("Showing archived rows only");
        }}
        style={smallButtonStyle}
      >
        Archived Rows ({archivedCount})
      </button>

      {savedFilterView === "archived" && (
        <button
          type="button"
          onClick={() => applySavedFilterView("review_all")}
          style={{
            ...smallButtonStyle,
            border: "1px solid #2563eb",
            background: "#eff6ff",
            color: "#1d4ed8",
            fontWeight: 800,
          }}
        >
          Back to Review All
        </button>
      )}

      <button
        type="button"
        onClick={unarchiveVisibleArchivedRows}
        disabled={!visibleRows.some(rowIsArchived)}
        style={{
          ...smallButtonStyle,
          border: "1px solid #166534",
          background: visibleRows.some(rowIsArchived) ? "#dcfce7" : "#e5e7eb",
          color: visibleRows.some(rowIsArchived) ? "#14532d" : "#6b7280",
          fontWeight: 800,
          opacity: visibleRows.some(rowIsArchived) ? 1 : 0.65,
        }}
        title="Restore only archived rows currently visible in the table"
      >
        Unarchive Visible Archived
      </button>

      <button
        type="button"
        onClick={() => {
          reattachScreenshotsScopeRef.current = "needed";
          reattachScreenshotsInputRef.current?.click();
        }}
        style={{
          ...smallButtonStyle,
          border: "1px solid #2563eb",
          background: "#eff6ff",
          color: "#1d4ed8",
          fontWeight: 700,
        }}
        title="Choose the same staged week folder. Only unreviewed/needed rows get screenshots reattached."
      >
        Reattach Needed Screenshots
      </button>

      <button
        type="button"
        onClick={() => {
          reattachScreenshotsScopeRef.current = "visible";
          reattachScreenshotsInputRef.current?.click();
        }}
        style={smallButtonStyle}
        title="Choose the same staged week folder and reattach screenshots only for rows currently visible in this view"
      >
        Reattach Visible Screenshots
      </button>

      <button
        type="button"
        onClick={() => {
          reattachScreenshotsScopeRef.current = "all";
          reattachScreenshotsInputRef.current?.click();
        }}
        style={smallButtonStyle}
        title="Choose the same staged week folder and reattach screenshots for every matching row"
      >
        Reattach All Screenshots
      </button>

      <button
        type="button"
        onClick={() => clearScreenshotsForReviewedRows()}
        style={smallButtonStyle}
        title="Free memory by removing screenshot previews from rows already confirmed/reviewed"
      >
        Delete Reviewed Screenshots
      </button>

      <button
        type="button"
        onClick={clearScreenshotsForVisibleRows}
        style={smallButtonStyle}
        title="Delete screenshot previews only for rows currently visible in the table"
      >
        Delete Visible Screenshots
      </button>

      <button
        type="button"
        onClick={clearScreenshotsForAllRows}
        style={{
          ...smallButtonStyle,
          border: "1px solid #dc2626",
          background: "#fef2f2",
          color: "#991b1b",
          fontWeight: 800,
        }}
        title="Delete every attached screenshot preview to free browser memory"
      >
        Delete All Screenshots
      </button>

      <button
        type="button"
        onClick={() => saveAutosaveSnapshot("manual", { force: true })}
        style={smallButtonStyle}
      >
        Save Backup Now
      </button>

      <button
        type="button"
        onClick={restoreLatestAutosave}
        style={smallButtonStyle}
      >
        Restore Latest Autosave
      </button>

      <button
        type="button"
        onClick={() => {
          compactAutosaveStorage({ silent: false, removeIfTooLarge: true });
          saveMainAppState({ silent: false });
          setTimeout(refreshStorageStats, 250);
        }}
        style={smallButtonStyle}
        title="Keep only the latest lightweight autosave and rewrite the main saved state without screenshots/OCR text"
      >
        Compact Browser Storage
      </button>

      <button
        type="button"
        onClick={clearAutosaveBackups}
        style={smallButtonStyle}
        title="Clear autosave backups only; current rows stay loaded"
      >
        Clear Autosave Backup
      </button>

      <button type="button" onClick={confirmDatesForVisibleRows} style={smallButtonStyle}>
        Confirm Visible Dates
      </button>

      <button type="button" onClick={runPreExportChecklist} style={smallButtonStyle}>
        Pre-Export Checklist
      </button>

      <button
        type="button"
        onClick={runManualHedgeScan}
        disabled={isHedgeScanRunning}
        style={{
          ...smallButtonStyle,
          border: "1px solid #7c3aed",
          background: isHedgeScanRunning ? "#ede9fe" : "#f5f3ff",
          color: "#4c1d95",
          fontWeight: 700,
          opacity: isHedgeScanRunning ? 0.75 : 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {isHedgeScanRunning && (
          <span
            aria-hidden="true"
            style={{
              width: 13,
              height: 13,
              border: "2px solid #ddd6fe",
              borderTop: "2px solid #7c3aed",
              borderRadius: "50%",
              display: "inline-block",
              animation: "betSlipSpinner 0.8s linear infinite",
            }}
          />
        )}
        {isHedgeScanRunning ? "Scanning..." : "Run Hedge Scan"}
      </button>

      <button type="button" onClick={archiveExportedReviewedRows} style={smallButtonStyle}>
        Archive Exported Reviewed
      </button>
    </div>

    <div>
      <button
        type="button"
        onClick={() => setShowDebugTools((prev) => !prev)}
        style={{ ...smallButtonStyle, fontWeight: 800 }}
      >
        {showDebugTools ? "Hide Debug / Maintenance" : "Debug / Maintenance"}
      </button>
    </div>

    {showDebugTools && (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={exportStandardCsv} style={smallButtonStyle}>
          Export CSV
        </button>
        <button type="button" onClick={exportDebugCsv} style={smallButtonStyle}>
          Export Debug
        </button>
        <button type="button" onClick={exportAppState} style={smallButtonStyle}>
          Export App State
        </button>
        <button type="button" onClick={exportKnownTeamNames} style={smallButtonStyle}>
          Export Known Teams
        </button>
        <label style={{ ...smallButtonStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Import App State
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              importAppState(event.target.files);
              event.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
        <button type="button" onClick={addChangelogEntry} style={smallButtonStyle}>
          Add Changelog
        </button>
        <button type="button" onClick={clearArchiveFlags} style={smallButtonStyle}>
          Clear Archive Flags
        </button>
        <button type="button" onClick={clearAll} style={{ ...smallButtonStyle, color: "#991b1b" }}>
          Clear All
        </button>
        <button
          type="button"
          onClick={() => setShowLegacySelectedRowEditor((prev) => !prev)}
          style={smallButtonStyle}
        >
          {showLegacySelectedRowEditor ? "Hide Legacy Bottom Editor" : "Show Legacy Bottom Editor"}
        </button>
      </div>
    )}
  </div>
)}

      {saveNotice && <div style={noticeStyle}>{saveNotice}</div>}
      {busyMessage && (
        <div
          style={{
            ...noticeStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 900,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              border: "3px solid #bbf7d0",
              borderTop: "3px solid #166534",
              borderRadius: "50%",
              display: "inline-block",
              animation: "betSlipSpinner 0.8s linear infinite",
            }}
          />
          {busyMessage}
        </div>
      )}

         {selectedIds.length > 0 && (
        <div
          style={{
            marginTop: 16,
            marginBottom: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <strong style={{ alignSelf: "center" }}>
            {selectedIds.length} selected
          </strong>

          <button onClick={exportSelectedRowsToCsv} style={smallButtonStyle}>
            Export Current Batch
          </button>

          <button onClick={markSelectedRowsExported} style={smallButtonStyle}>
            Mark Exported
          </button>

          <button
            onClick={markSelectedRowsAsConfirmedHedgePair}
            disabled={selectedIds.length !== 2}
            style={{
              ...smallButtonStyle,
              border: "1px solid #7c3aed",
              background: selectedIds.length === 2 ? "#f5f3ff" : "#e5e7eb",
              color: selectedIds.length === 2 ? "#4c1d95" : "#64748b",
              fontWeight: 900,
              opacity: selectedIds.length === 2 ? 1 : 0.65,
            }}
            title="Select exactly two rows, then click to mark them as a confirmed hedge pair."
          >
            Confirm Selected Hedge Pair
          </button>

          <button onClick={archiveSelectedRows} style={smallButtonStyle}>
            Archive Selected
          </button>

          <button onClick={unarchiveSelectedRows} style={smallButtonStyle}>
            Unarchive Selected
          </button>


          <button
            onClick={() => {
              const currentSelectedRowId = selectedRowId;

              setRows((prev) =>
                prev.map((row) =>
                  selectedIds.includes(row.id)
                    ? enrichRow({ ...row, reviewResolved: "Y", reviewLater: "N" })
                    : row
                )
              );

              showNotice("Selected rows marked reviewed");

              if (currentSelectedRowId) {
                setTimeout(() => selectNextNeedsReviewAfter(currentSelectedRowId), 0);
              }
            }}
            style={smallButtonStyle}
          >
            Mark Reviewed
          </button>

        </div>
      )}

      <div
        style={{
          marginTop: 16,
          marginBottom: 8,
          padding: "10px 12px",
          border: "1px solid #bfdbfe",
          borderRadius: 10,
          background: "#eff6ff",
          color: "#1e3a8a",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          fontSize: 14,
        }}
      >
        <strong>
          Showing {visibleRows.length} of {filterBaseCount} row{filterBaseCount === 1 ? "" : "s"}
        </strong>

        {hiddenByFiltersCount > 0 && (
          <span>
            {hiddenByFiltersCount} hidden by current filters
          </span>
        )}

        <span>
          Needs review in view: <strong>{visibleNeedsReviewCount}</strong>
        </span>

        <span>
          Reviewed in view: <strong>{visibleReviewedCount}</strong>
        </span>

        <span>
          Review later: <strong>{visibleReviewLaterCount}</strong>
        </span>

        <span>
          Archived in view: <strong>{visibleArchivedCount}</strong>
        </span>

        <span>
          Hedges in view: <strong>{visibleHedgeCount}</strong>
        </span>

        <span>
          Parser issues in view: <strong>{visibleParserIssueCount}</strong>
        </span>

        <span style={{ color: "#475569" }}>
          Filters: {activeFilterLabels.length ? activeFilterLabels.join(" | ") : "None"}
        </span>
      </div>

      {visibleRows.length === 0 && rowsWithWarnings.length > 0 && (
        <div
          style={{
            marginTop: 16,
            marginBottom: 8,
            padding: "10px 12px",
            border: "1px solid #fed7aa",
            borderRadius: 10,
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 14,
          }}
        >
          <strong>No rows match the current filters.</strong>{" "}
          {filterBaseCount > 0 ? `${filterBaseCount} row${filterBaseCount === 1 ? "" : "s"} available before filters.` : ""}
          {activeFilterLabels.length ? ` Active filters: ${activeFilterLabels.join(" | ")}` : ""}
        </div>
      )}

      {visibleRows.length > 0 && (
        <ReviewTable
          rows={visibleRows}
          selectedRowId={selectedRowId}
          setSelectedRowId={setSelectedRowId}
          selectedIds={selectedIds}
          toggleSelected={toggleSelected}
          toggleSelectAllVisible={toggleSelectAllVisible}
          allVisibleSelected={allVisibleSelected}
          sortConfig={sortConfig}
          handleSort={handleSort}
          columnWidths={columnWidths}
          startResize={startResize}
          setWinStatusForRow={setWinStatusForRow}
          deleteRow={deleteRow}
          handleRowFieldChange={handleRowFieldChange}
          handleRowFieldsChange={handleRowFieldsChange}
          tableMode={tableMode}
          getRowAttentionLevel={getRowAttentionLevel}
          rowNeedsReview={rowNeedsReview}
          allRows={rowsWithWarnings}
          workflowView={savedFilterView}
          hedgeReviewLaunchToken={hedgeReviewLaunchToken}
          onCaptureUndoSnapshot={captureUndoSnapshot}
          onReattachSingleScreenshot={promptReattachSingleScreenshot}
          onClearReviewedScreenshots={clearScreenshotsForReviewedRows}
        />
      )}

            {showLegacySelectedRowEditor && selectedRow && (
        <div
          style={{
            marginTop: 24,
            marginBottom: 0,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <h3 style={{ color: "#000", marginTop: 0 }}>Selected Row Editor</h3>

          {selectedRow.parseWarning && <div style={warningStyle}>{selectedRow.parseWarning}</div>}
          {selectedRow.duplicateWarning && <div style={duplicateStyle}>{selectedRow.duplicateWarning}</div>}

          <div
            style={{
              marginTop: 10,
              marginBottom: 10,
              padding: 12,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#ffffff",
              display: "grid",
              gap: 6,
            }}
          >
            <div>
              <strong>Fixture / Event:</strong> {selectedRow.fixtureEvent || "-"}
            </div>
            <div>
              <strong>Selection:</strong> {selectedRow.selection || "-"}
            </div>
            <div>
              <strong>Bet Type:</strong> {selectedRow.betType || "-"}
            </div>
            <div>
  <strong>Likely Hedge:</strong>{" "}
  {selectedRow.likelyHedge === "Y"
    ? `Yes (${selectedRow.hedgeQuality || "Basic"})`
    : "No"}
</div>

{selectedRow.likelyHedge === "Y" && (
  <>
    <div>
      <strong>Hedge Book:</strong>{" "}
      {selectedRow.hedgePartnerBookmaker || "-"}
    </div>
    <div>
      <strong>Hedge Stake:</strong>{" "}
      {selectedRow.hedgeStake ? `$${selectedRow.hedgeStake}` : "-"}
    </div>
    <div>
      <strong>Profit Range:</strong>{" "}
      {selectedRow.hedgeProfitLow && selectedRow.hedgeProfitHigh
        ? `$${selectedRow.hedgeProfitLow} -> $${selectedRow.hedgeProfitHigh}`
        : "-"}
    </div>
  </>
)}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                const nextValue = selectedRow.reviewResolved === "Y" ? "N" : "Y";

                setRows((prev) =>
                  prev.map((row) =>
                    row.id === selectedRow.id
                      ? enrichRow({
                          ...row,
                          reviewResolved: nextValue,
                          reviewLater: nextValue === "Y" ? "N" : row.reviewLater,
                        })
                      : row
                  )
                );

                showNotice(
                  nextValue === "Y" ? "Reviewed - moving to next" : "Marked unresolved"
                );

                if (nextValue === "Y") {
                  setTimeout(() => selectNextNeedsReviewAfter(selectedRow.id), 0);
                }
              }}
              style={smallButtonStyle}
            >
              {selectedRow.reviewResolved === "Y" ? "Mark Unresolved" : "Mark Reviewed / Resolved"}
            </button>

            <button
              onClick={() => setWinStatusForRow(selectedRow.id, "Y", true)}
              style={smallButtonStyle}
            >
              Mark Win + Next
            </button>

            <button
              onClick={() => setWinStatusForRow(selectedRow.id, "N", true)}
              style={smallButtonStyle}
            >
              Mark Loss + Next
            </button>

            <button
              onClick={jumpToNextBestReviewRow}
              style={buttonStyle}
              disabled={!nextBestReviewRow}
            >
              Next Best Row
            </button>

            <button
              onClick={() => {
                const nextValue = selectedRow.reviewLater === "Y" ? "N" : "Y";
                handleRowFieldChange(selectedRow.id, "reviewLater", nextValue);
                showNotice(nextValue === "Y" ? "Marked review later" : "Cleared review later");
              }}
              style={smallButtonStyle}
            >
              {selectedRow.reviewLater === "Y" ? "Clear Review Later" : "Review Later"}
            </button>

            <button onClick={() => ignoreDuplicateForRow(selectedRow.id)} style={smallButtonStyle}>
              {selectedRow.duplicateIgnored === "Y" ? "Unignore Duplicate" : "Ignore Duplicate"}
            </button>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "240px 1fr",
              gap: 8,
              alignItems: "center",
            }}
          >
            <label style={{ fontWeight: "bold" }}>Account Owner</label>
            <select
              value={selectedRow.accountOwner || "Me"}
              onChange={(e) => handleRowFieldChange(selectedRow.id, "accountOwner", e.target.value)}
              style={selectStyle}
            >
              {ACCOUNT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label style={{ fontWeight: "bold" }}>Bet Type</label>
            <select
              value={selectedRow.betType || ""}
              onChange={(e) => handleRowFieldChange(selectedRow.id, "betType", e.target.value)}
              style={selectStyle}
            >
              {BET_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option || "--"}
                </option>
              ))}
            </select>

            <label style={{ fontWeight: "bold" }}>Bet Source Tag</label>
            <select
              value={selectedRow.betSourceTag || ""}
              onChange={(e) => handleRowFieldChange(selectedRow.id, "betSourceTag", e.target.value)}
              style={selectStyle}
            >
              {BET_SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option || "--"}
                </option>
              ))}
            </select>

            <label style={{ fontWeight: "bold" }}>Win</label>
            <select
              value={selectedRow.win || ""}
              onChange={(e) => handleRowFieldChange(selectedRow.id, "win", e.target.value)}
              style={selectStyle}
            >
              <option value="">--</option>
              <option value="Y">Y</option>
              <option value="N">N</option>
            </select>

            <label style={{ fontWeight: "bold" }}>Bonus Bet</label>
            <select
              value={selectedRow.bonusBet || "N"}
              onChange={(e) => handleRowFieldChange(selectedRow.id, "bonusBet", e.target.value)}
              style={selectStyle}
            >
              <option value="N">N</option>
              <option value="Y">Y</option>
            </select>

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
                <input
                  type="text"
                  value={selectedRow[key] || ""}
                  onChange={(e) => handleRowFieldChange(selectedRow.id, key, e.target.value)}
                  style={inputStyle}
                />
              </div>
            ))}

            <label style={{ fontWeight: "bold" }}>Image</label>
            <div>
              {selectedRow.sourceImageUrl ? (
                <a href={selectedRow.sourceImageUrl} target="_blank" rel="noreferrer">
                  <img
                    src={selectedRow.sourceImageUrl}
                    alt={selectedRow.sourceFileName}
                    style={{
                      maxWidth: 260,
                      maxHeight: 260,
                      objectFit: "contain",
                      border: "1px solid #ccc",
                      borderRadius: 6,
                    }}
                  />
                </a>
              ) : (
                <div>No image in session</div>
              )}
            </div>

            <label style={{ fontWeight: "bold" }}>Review Notes</label>
            <textarea
              value={selectedRow.reviewNotes || ""}
              onChange={(e) => handleRowFieldChange(selectedRow.id, "reviewNotes", e.target.value)}
              style={textAreaStyle}
            />

            <label style={{ fontWeight: "bold" }}>Debug Trace</label>
            <textarea
              value={JSON.stringify(selectedRow.debugTrace || [], null, 2)}
              readOnly
              style={{ ...textAreaStyle, minHeight: 220, fontFamily: "monospace" }}
            />

            <label style={{ fontWeight: "bold" }}>OCR Text</label>
            <div>
              <button onClick={copySelectedOcr} style={{ ...smallButtonStyle, marginBottom: 8 }}>
                Copy OCR
              </button>
              <textarea
                value={selectedRow.sourceText || ""}
                readOnly
                style={{ ...textAreaStyle, minHeight: 220 }}
              />
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 28,
          marginBottom: 8,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>Changelog</div>
        <div style={{ display: "grid", gap: 4 }}>
          {changelog.map((entry, index) => (
            <div key={`${entry}-${index}`}>{entry}</div>
          ))}
        </div>
      </div>
    </div>
  );
  }
