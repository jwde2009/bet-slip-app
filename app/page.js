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
import TopActionGrid from "./components/TopActionGrid";
import FilterBar from "./components/FilterBar";
import UploadDropZone from "./components/UploadDropZone";
import UploadBatchStatus from "./components/UploadBatchStatus";
import ReviewLegend from "./components/ReviewLegend";
import Tesseract from "tesseract.js";

import { detectLeague } from "./utils/detectLeague";

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

function getReviewPassStatus(row = {}) {
  const status = String(row.status || "").toLowerCase();

  if (row.betDateNeedsConfirm === "Y" || !row.betDate) return "Date Confirm";
  if (!row.stake || !row.oddsUS) return "Parser Issue";
  if (!row.selection) return "Parser Issue";

if (!row.win && !["open", "cashed out", "voided", "void", "push"].includes(status)) {
    return "Parser Issue";
  }

  if (
    rowHasUnresolvedHedgeReview(row) ||
    (
      String(row.betType || "").toLowerCase().includes("player prop") &&
      (!row.playerLastName || !row.propMarket)
    )
  ) {
    return "Hedge Check";
  }

  if (!row.sportLeague || !row.fixtureEvent) return "Context Needed";
  if (row.reviewResolved === "Y") return "Export Ready";

  return "Clean";
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

  const possibleHedge = rowHasUnresolvedHedgeReview(row);

  const playerPropMissingContext =
    betType.includes("player prop") &&
    (!row.playerLastName || !row.propMarket);

  const teamSportMissingContext =
    !row.participantANormalized &&
    !row.participantBNormalized &&
    !row.fixtureEvent;

  return !!(
    missingCore ||
    possibleHedge ||
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
  };

  const blockers = [
    counts.unconfirmedDates ? `${counts.unconfirmedDates} unconfirmed copied dates` : "",
    counts.missingDates ? `${counts.missingDates} missing dates` : "",
    counts.missingMoney ? `${counts.missingMoney} rows missing stake/odds` : "",
    counts.missingResult ? `${counts.missingResult} rows missing result` : "",
    counts.reviewLater ? `${counts.reviewLater} rows marked Review Later` : "",
    counts.unreviewed ? `${counts.unreviewed} unreviewed rows` : "",
    counts.possibleHedgesNotReviewed ? `${counts.possibleHedgesNotReviewed} possible hedges not confirmed/denied` : "",
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
    escapeCsv(""),
    escapeCsv(row.betSourceTag),
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

export default function Home() {
  const [rows, setRows] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showArchivedRows, setShowArchivedRows] = useState(false);
  const [showNeedsReviewOnly, setShowNeedsReviewOnly] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [showReviewLaterOnly, setShowReviewLaterOnly] = useState(false);
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);
  const [showLikelyParserIssuesOnly, setShowLikelyParserIssuesOnly] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [showLegacySelectedRowEditor, setShowLegacySelectedRowEditor] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: "betDate", direction: "desc" });
  const [tableMode, setTableMode] = useState("debug");
  const [uploadBatches, setUploadBatches] = useState([]);
  const [savedFilterView, setSavedFilterView] = useState("default");
  const [showHedgesOnly, setShowHedgesOnly] = useState(false);
  const [smartReviewMode, setSmartReviewMode] = useState(true);
  const [showGuaranteedProfitOnly, setShowGuaranteedProfitOnly] = useState(false);
  const [showHedgeCriticalOnly, setShowHedgeCriticalOnly] = useState(false);  const [columnWidths, setColumnWidths] = useState({
    select: 52,
    edit: 84,
    image: 96,
    sourceFileName: 180,
    accountOwner: 90,
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
  ]);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("betSlipAppStateV1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.rows)) setRows(parsed.rows);
      if (typeof parsed.uploadOwner === "string") setUploadOwner(parsed.uploadOwner);
      if (typeof parsed.uploadBookmaker === "string") setUploadBookmaker(parsed.uploadBookmaker);
      if (Array.isArray(parsed.changelog)) setChangelog(parsed.changelog);
    } catch (error) {
      console.error("Could not load local app state", error);
    }
  }, []);

  useEffect(() => {
    applySavedFilterView("review_queue");
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem(
        "betSlipAppStateV1",
        JSON.stringify({ rows, uploadOwner, uploadBookmaker, changelog })
      );
    } catch (error) {
      console.error("Could not save local app state", error);
    }
  }, [rows, uploadOwner, uploadBookmaker, changelog]);

    const rowsWithWarnings = useMemo(() => {
    const enriched = rows.map(enrichRow);

    // Step 1: duplicates
    const withDuplicates = addDuplicateWarnings(enriched);

    // Step 2: hedge detection (CRITICAL FIX)
    const withHedges = addLikelyHedgeFlags(withDuplicates);

    // Step 3: GUARANTEE hedge fields persist
    return withHedges.map(row => ({
      ...row,
      likelyHedge: row.likelyHedge || "N",
      hedgeClusterId: row.hedgeClusterId || "",
      guaranteedProfit: row.guaranteedProfit || "N",
    }));
  }, [rows]);

  
  function rowNeedsReview(row) {
    const parseWarningText = String(row?.parseWarning || "").toLowerCase();

    return (
      row.reviewResolved !== "Y" &&
      (
        row.betDateNeedsConfirm === "Y" ||
        row.likelyParserIssue === "Y" ||
        rowIsHedgeCritical(row) ||
        !row.sportLeague ||
        !row.oddsUS ||
        !row.stake ||
        row.oddsSource === "Calculated" ||
        !!row.parseWarning ||
        parseWarningText.includes("stake_missing") ||
        parseWarningText.includes("selection_missing") ||
        parseWarningText.includes("fixture_missing")
      )
    );
  }

  const visibleRows = useMemo(() => {
    let next = rowsWithWarnings;

    if (!showArchivedRows) next = next.filter((row) => row.archived !== "Y");
    if (showReviewLaterOnly) next = next.filter((row) => row.reviewLater === "Y");
    if (showLowConfidenceOnly) next = next.filter((row) => row.confidenceFlag === "Low");
    if (showLikelyParserIssuesOnly) next = next.filter((row) => row.likelyParserIssue === "Y");
    if (showNeedsReviewOnly) next = next.filter((row) => rowNeedsReview(row));
    if (showHedgesOnly) next = next.filter((row) => row.likelyHedge === "Y");
    if (showGuaranteedProfitOnly) next = next.filter((row) => row.guaranteedProfit === "Y");
    if (showHedgeCriticalOnly) next = next.filter((row) => rowIsHedgeCritical(row));
    if (reviewMode) {
      next = next.filter((row) => rowNeedsReview(row) || row.reviewLater === "Y");
    }

    if (smartReviewMode) {
      next = next.filter(
        (row) => row.reviewLater === "Y" || Number(row.reviewPriority || 0) >= 3
      );
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

    return groupHedgeRowsTogether(next);
  }, [
    rowsWithWarnings,
    showArchivedRows,
    showReviewLaterOnly,
    showLowConfidenceOnly,
    showLikelyParserIssuesOnly,
    showNeedsReviewOnly,
    showHedgesOnly,
    showGuaranteedProfitOnly,
    showHedgeCriticalOnly,
    reviewMode,
    smartReviewMode,
  ]);

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
  (row) => row.archived !== "Y"
).length;

const counts = {
  total: rowsWithWarnings.length,
  visible: visibleRows.length,
  needsReview: rowsWithWarnings.filter((row) => rowNeedsReview(row)).length,
  reviewLater: rowsWithWarnings.filter((row) => row.reviewLater === "Y").length,
  lowConfidence: rowsWithWarnings.filter((row) => row.confidenceFlag === "Low").length,
  parserIssues: rowsWithWarnings.filter((row) => row.likelyParserIssue === "Y").length,
  archived: rowsWithWarnings.filter((row) => row.archived === "Y").length,
  hedges: rowsWithWarnings.filter((row) => row.likelyHedge === "Y").length,
  guaranteedProfit: rowsWithWarnings.filter((row) => row.guaranteedProfit === "Y").length,
  hedgeCritical: rowsWithWarnings.filter((row) => rowIsHedgeCritical(row)).length,
  unconfirmedDates: rowsWithWarnings.filter((row) => row.betDateNeedsConfirm === "Y").length,
  exportReady: rowsWithWarnings.filter((row) => getReviewPassStatus(row) === "Export Ready").length,
  payoutMatchedHedges: rowsWithWarnings.filter((row) =>
    String(row.hedgeQuality || "").toLowerCase().includes("payout match")
  ).length,
  possibleHedgesNotReviewed: rowsWithWarnings.filter(rowHasUnresolvedHedgeReview).length,
  selected: selectedIds.length,
  reviewed: reviewedCount,
  exportable: exportableCount,
};

const activeLoadedRowsCount = rowsWithWarnings.filter((row) => row.archived !== "Y").length;
const filterBaseCount = showArchivedRows ? rowsWithWarnings.length : activeLoadedRowsCount;
const hiddenByFiltersCount = Math.max(0, filterBaseCount - visibleRows.length);
const visibleNeedsReviewCount = visibleRows.filter((row) => rowNeedsReview(row)).length;
const visibleReviewedCount = visibleRows.filter((row) => row.reviewResolved === "Y").length;
const visibleReviewLaterCount = visibleRows.filter((row) => row.reviewLater === "Y").length;
const visibleHedgeCount = visibleRows.filter((row) => row.likelyHedge === "Y").length;
const visibleParserIssueCount = visibleRows.filter((row) => row.likelyParserIssue === "Y").length;

const activeFilterLabels = [
  savedFilterView && savedFilterView !== "default"
    ? `View: ${savedFilterView.replace(/_/g, " ")}`
    : "",
  reviewMode ? "Review Mode" : "",
  smartReviewMode ? "Smart Review" : "",
  showNeedsReviewOnly ? "Needs Review" : "",
  showReviewLaterOnly ? "Review Later" : "",
  showLowConfidenceOnly ? "Low Confidence" : "",
  showLikelyParserIssuesOnly ? "Parser Issues" : "",
  showHedgesOnly ? "Hedges" : "",
  showGuaranteedProfitOnly ? "Guaranteed Profit" : "",
  showHedgeCriticalOnly ? "Hedge-Critical" : "",
  showArchivedRows ? "Including Archived" : "Active Only",
].filter(Boolean);

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

  function areLikelyOpposites(rowA, rowB) {
  if (!rowA || !rowB) return false;
  if (rowA.id === rowB.id) return false;

  const bookmakerA = String(rowA.bookmaker || "").trim().toLowerCase();
  const bookmakerB = String(rowB.bookmaker || "").trim().toLowerCase();
  if (bookmakerA && bookmakerB && bookmakerA === bookmakerB) return false;
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
    const text = String(value || "").trim().toLowerCase();

    if (!text) return "";
    if (text === "baseball" || text === "mlb") return "mlb";
    if (text === "nba") return "nba";
    if (text === "wnba") return "wnba";
    if (text === "nhl") return "nhl";
    if (text === "nfl") return "nfl";
    if (text === "mma" || text === "ufc") return "mma";
    if (text === "soccer" || text === "mls" || text === "epl" || text === "premier league" || text === "la liga" || text === "serie a" || text === "bundesliga" || text === "ligue 1") return "soccer";
    if (text === "tennis" || text === "atp" || text === "wta") return "tennis";

    return text;
  }

  function rowsHaveCompatibleHedgeLeagues(rowA = {}, rowB = {}) {
    const leagueA = normalizeLeagueForHedge(rowA.sportLeague);
    const leagueB = normalizeLeagueForHedge(rowB.sportLeague);

    // If either league is missing, allow the review system to surface the row.
    // Once both leagues are known, different leagues should never match.
    if (!leagueA || !leagueB) return true;

    return leagueA === leagueB;
  }

  function getPayoutMatch(rowA = {}, rowB = {}) {
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

    // Keep this as a rescue layer. If context is strong, exact/canonical hedge
    // logic should be the primary way to match.
    if (!weakContext) return null;

    const summary = computeTwoWayProfitSummary(rowA, rowB);

    let quality = "Payout Match - Needs Review";

    if (summary) {
      if (summary.low >= 0) {
        quality = "Payout Match - Guaranteed Profit";
      } else if (summary.high <= 0 && summary.low >= -SMALL_GUARANTEED_LOSS_LIMIT) {
        quality = "Payout Match - Small Guaranteed Loss";
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
      if (isIgnoredHedgePair(row, other)) continue;
      if (!rowsHaveCompatibleHedgeLeagues(row, other)) continue;

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

  for (const cluster of pairClusters) {
    const clusterId = buildClusterId(cluster.clusterRows);

    for (const clusterRow of cluster.clusterRows) {
      const current = clusterMap.get(clusterRow.id);

      // Prefer exact/canonical matches over payout-only weak matches.
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
      return {
        ...row,
        likelyHedge: "N",
        autoLikelyHedge: "N",
        hedgeClusterId: "",
        hedgeClusterSize: "",
        hedgePartnerBookmaker: "",
        hedgeConfidence: "",
        hedgeQuality: "",
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
        showNotice("Reviewed ✓");
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
        showNotice("Reviewed ✓");
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
    setSavedFilterView(nextView);

    if (nextView === "default") {
      setReviewMode(false);
      setShowNeedsReviewOnly(false);
      setShowReviewLaterOnly(false);
      setShowLowConfidenceOnly(false);
      setShowLikelyParserIssuesOnly(false);
      setShowArchivedRows(false);
      return;
    }

    if (nextView === "review_queue") {
      setReviewMode(true);
      setShowNeedsReviewOnly(false);
      setShowReviewLaterOnly(false);
      setShowLowConfidenceOnly(false);
      setShowLikelyParserIssuesOnly(false);
      setShowArchivedRows(false);
      return;
    }

    if (nextView === "needs_review") {
      setReviewMode(false);
      setShowNeedsReviewOnly(true);
      setShowReviewLaterOnly(false);
      setShowLowConfidenceOnly(false);
      setShowLikelyParserIssuesOnly(false);
      setShowArchivedRows(false);
      return;
    }

    if (nextView === "parser_issues") {
      setReviewMode(false);
      setShowNeedsReviewOnly(false);
      setShowReviewLaterOnly(false);
      setShowLowConfidenceOnly(false);
      setShowLikelyParserIssuesOnly(true);
      setShowArchivedRows(false);
      return;
    }

    if (nextView === "archived") {
      setReviewMode(false);
      setShowNeedsReviewOnly(false);
      setShowReviewLaterOnly(false);
      setShowLowConfidenceOnly(false);
      setShowLikelyParserIssuesOnly(false);
      setShowArchivedRows(true);
    }
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

  const handleRowFieldChange = (id, field, value) =>
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );

  const toggleSelected = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !selectedVisibleIds.includes(id))
        : Array.from(new Set([...prev, ...selectedVisibleIds]))
    );

  const deleteRow = (id) => {
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
    setRows([]);
    setSelectedIds([]);
    setSelectedRowId("");
    showNotice("All rows cleared");
  };

  function normalizeImageMatchKey(value = "") {
    return String(value || "")
      .replace(/\\/g, "/")
      .toLowerCase()
      .trim()
      .split("/")
      .filter(Boolean)
      .join("/");
  }

  function getImagePathSuffixes(value = "") {
    const normalized = normalizeImageMatchKey(value);
    if (!normalized) return [];

    const parts = normalized.split("/").filter(Boolean);
    const suffixes = [];

    for (let i = 0; i < parts.length; i += 1) {
      suffixes.push(parts.slice(i).join("/"));
    }

    return Array.from(new Set(suffixes));
  }

  function buildScreenshotFileIndex(fileList = []) {
    const imageFiles = Array.from(fileList || []).filter((file) =>
      String(file.type || "").startsWith("image/")
    );

    const index = new Map();

    for (const file of imageFiles) {
      const relativePath = file.webkitRelativePath || file.name;
      const keys = [
        ...getImagePathSuffixes(relativePath),
        ...getImagePathSuffixes(file.name),
      ];

      for (const key of keys) {
        if (key && !index.has(key)) {
          index.set(key, file);
        }
      }
    }

    return { imageFiles, index };
  }

  function getScreenshotMatchKeysForRow(row = {}) {
    const candidates = [
      row.sourceRelativePath,
      row.sourceFileName,
    ].filter(Boolean);

    const keys = [];

    for (const candidate of candidates) {
      keys.push(...getImagePathSuffixes(candidate));
    }

    return Array.from(new Set(keys));
  }

  function findScreenshotFileForRow(row = {}, fileIndex = new Map()) {
    const keys = getScreenshotMatchKeysForRow(row);

    for (const key of keys) {
      const match = fileIndex.get(key);

      if (match) return match;
    }

    return null;
  }

  function reattachScreenshots(fileList) {
    const { imageFiles, index } = buildScreenshotFileIndex(fileList);

    if (!imageFiles.length) {
      showNotice("No image files selected for reattach");
      return;
    }

    if (!rows.length) {
      showNotice("No rows loaded to reattach screenshots to");
      return;
    }

    const matchesByRowId = new Map();

    for (const row of rows) {
      const match = findScreenshotFileForRow(row, index);

      if (match) {
        matchesByRowId.set(row.id, match);
      }
    }

    if (!matchesByRowId.size) {
      showNotice("No screenshot matches found. Choose the same staged week folder.");
      return;
    }

    const reattachedAt = new Date().toISOString();

    setRows((prev) =>
      prev.map((row) => {
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
        };
      })
    );

    const rowsWithSourceNames = rows.filter(
      (row) => row.sourceFileName || row.sourceRelativePath
    ).length;

    const unmatched = Math.max(0, rowsWithSourceNames - matchesByRowId.size);

    showNotice(
      `Reattached ${matchesByRowId.size} screenshot${matchesByRowId.size === 1 ? "" : "s"}${
        unmatched ? ` (${unmatched} loaded row${unmatched === 1 ? "" : "s"} not in selected folder)` : ""
      }`
    );
  }

  const setWinStatusForRow = (id, winValue, advance = false) => {
  setRows((prev) =>
    prev.map((row) => {
      if (row.id !== id) return row;

      const next = {
        ...row,
        win: winValue,
        status: winValue === "Y" ? "Won" : "Lost",
        reviewResolved: "Y",
        reviewLater: "N",
      };

      return enrichRow(next);
    })
  );

  showNotice(winValue === "Y" ? "Marked win ✓" : "Marked loss ✓");

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
      rows,
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

function clearArchiveFlags() {
  const archivedCount = rows.filter((row) => row.archived === "Y").length;

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
      (row) =>
        row.archived !== "Y" &&
        row.reviewResolved === "Y" &&
        row.betDateNeedsConfirm !== "Y"
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
        row.archived !== "Y" &&
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

  function runManualHedgeScan() {
    if (!rows.length) {
      showNotice("No rows loaded for hedge scan");
      return;
    }

    const enriched = rows.map(enrichRow);
    const scanned = addLikelyHedgeFlags(addDuplicateWarnings(enriched));

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

    // Touch rows so rowsWithWarnings recomputes, but do not overwrite manual edits.
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        lastHedgeScanAt: stamp,
      }))
    );

    setShowHedgesOnly(true);
    setShowNeedsReviewOnly(false);
    setSavedFilterView("default");

    showNotice(
      `Hedge scan: ${hedgeRows} rows, ${clusters.size} clusters, ${payoutMatches} payout-match rows`
    );
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

    function getRowsForUploadBatch(batchId, includeArchived = true) {
    const batchRows = rowsWithWarnings.filter(
      (row) =>
        row.uploadBatchId === batchId &&
        (includeArchived || row.archived !== "Y")
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
      (row) => selectedIds.includes(row.id) && row.archived !== "Y"
    );

    if (!selectedRows.length) return showNotice("No selected active rows to export");

    const groupedRows = groupHedgeRowsTogether(selectedRows);

    const unreviewed = groupedRows.filter(
      (row) => row.reviewResolved !== "Y"
    );

    if (unreviewed.length > 0) {
      showNotice(`⚠️ ${unreviewed.length} rows not reviewed`);
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
        padding: 20,
        fontFamily: "Arial, sans-serif",
        maxWidth: 1600,
        margin: "0 auto",
        backgroundColor: "#ffffff",
        color: "#000000",
        minHeight: "100vh",
      }}
    >
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
      Open EV Parlay Lab →
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
      Open Tools →
    </Link>
  </div>
</div>

            <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
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
        <label style={{ color: "#14532d", display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
  Filter View
  <select
    value={savedFilterView}
    onChange={(e) => applySavedFilterView(e.target.value)}
    style={{ ...selectStyle, width: 160, padding: "6px 8px" }}
  >
    <option value="default">Default</option>
    <option value="review_queue">Review Queue</option>
    <option value="needs_review">Needs Review</option>
    <option value="parser_issues">Parser Issues</option>
    <option value="archived">Archived</option>
  </select>
</label>
      </div>

            <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(520px, 700px) minmax(340px, 1fr)",
          gap: 16,
          alignItems: "stretch",
          marginBottom: 12,
        }}
      >
        
        <TopActionGrid
          hasRows={rowsWithWarnings.length > 0}
          hasSelectedRows={selectedIds.length > 0}
          onUpload={handleUpload}
          onExportCsv={exportStandardCsv}
          onExportDebugCsv={exportDebugCsv}
          onExportSelectedCsv={exportSelectedCsv}
          onExportSelectedDebugCsv={exportSelectedCsv}
          onExportAppState={exportAppState}
          onImportAppState={importAppState}
          onAddChangelogEntry={addChangelogEntry}
          onDeleteSelected={deleteSelected}
          onMarkSelectedWin={() => setWinStatusForSelected("Y")}
          onMarkSelectedLoss={() => setWinStatusForSelected("N")}
          onClearAll={clearAll}
          onRunHedgeScan={runManualHedgeScan}
          nextBestReviewRow={nextBestReviewRow}
          jumpToNextBestReviewRow={() => {
            if (nextBestReviewRow) setSelectedRowId(nextBestReviewRow.id);
          }}
        />

                <FilterBar
          tableMode={tableMode}
          setTableMode={setTableMode}
          showReviewLaterOnly={showReviewLaterOnly}
          setShowReviewLaterOnly={setShowReviewLaterOnly}
          showLowConfidenceOnly={showLowConfidenceOnly}
          setShowLowConfidenceOnly={setShowLowConfidenceOnly}
          showLikelyParserIssuesOnly={showLikelyParserIssuesOnly}
          setShowLikelyParserIssuesOnly={setShowLikelyParserIssuesOnly}
          showNeedsReviewOnly={showNeedsReviewOnly}
          setShowNeedsReviewOnly={setShowNeedsReviewOnly}
          showHedgesOnly={showHedgesOnly}
          setShowHedgesOnly={setShowHedgesOnly}
          showGuaranteedProfitOnly={showGuaranteedProfitOnly}
          setShowGuaranteedProfitOnly={setShowGuaranteedProfitOnly}
          showHedgeCriticalOnly={showHedgeCriticalOnly}
          setShowHedgeCriticalOnly={setShowHedgeCriticalOnly}
          showArchivedRows={showArchivedRows}
          setShowArchivedRows={setShowArchivedRows}
          reviewMode={reviewMode}
          setReviewMode={setReviewMode}
          smartReviewMode={smartReviewMode}
          setSmartReviewMode={setSmartReviewMode}
          counts={counts}
        />
      </div>

<div
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
    reattachScreenshots(event.target.files);
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

        const activeCount = batchRows.filter((row) => row.archived !== "Y").length;
        const archivedCount = batchRows.filter((row) => row.archived === "Y").length;
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
              {batchRows.length} rows · {activeCount} active · {archivedCount} archived · {hedgeCount} hedge
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

<div
  style={{
    marginTop: 10,
    marginBottom: 10,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  }}
>
  <button
    type="button"
    onClick={() => {
      setShowArchivedRows(true);
      setReviewMode(false);
      setSmartReviewMode(false);
      setSavedFilterView("archived");
      showNotice("Showing archived rows");
    }}
    style={smallButtonStyle}
  >
    Show Archived Rows
  </button>

  <button
    type="button"
    onClick={() => reattachScreenshotsInputRef.current?.click()}
    style={{
      ...smallButtonStyle,
      border: "1px solid #2563eb",
      background: "#eff6ff",
      color: "#1d4ed8",
      fontWeight: 700,
    }}
    title="Choose the same staged week folder to restore screenshot previews without OCR"
  >
    Reattach Screenshots
  </button>

  <button
    type="button"
    onClick={clearArchiveFlags}
    style={smallButtonStyle}
  >
    Clear Archive Flags
  </button>
  <button
    type="button"
    onClick={confirmDatesForVisibleRows}
    style={smallButtonStyle}
  >
    Confirm Visible Dates
  </button>

  <button
    type="button"
    onClick={runPreExportChecklist}
    style={smallButtonStyle}
  >
    Pre-Export Checklist
  </button>

  <button
    type="button"
    onClick={runManualHedgeScan}
    style={{
      ...smallButtonStyle,
      border: "1px solid #7c3aed",
      background: "#f5f3ff",
      color: "#4c1d95",
      fontWeight: 700,
    }}
  >
    Run Hedge Scan
  </button>

  <button
    type="button"
    onClick={exportReviewedRowsOnly}
    style={smallButtonStyle}
  >
    Export Reviewed Only
  </button>

  <button
    type="button"
    onClick={archiveExportedReviewedRows}
    style={smallButtonStyle}
  >
    Archive Exported Reviewed
  </button>

</div>

      {saveNotice && <div style={noticeStyle}>{saveNotice}</div>}
      {processing && <div style={noticeStyle}>{processingMessage || "Reading images..."}</div>}

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

          <button onClick={archiveSelectedRows} style={smallButtonStyle}>
            Archive Selected
          </button>

          <button onClick={unarchiveSelectedRows} style={smallButtonStyle}>
            Unarchive Selected
          </button>

          <button onClick={clearArchiveFlags} style={smallButtonStyle}>
            Clear Archive Flags
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

      {selectedRow && (
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowLegacySelectedRowEditor((prev) => !prev)}
            style={smallButtonStyle}
          >
            {showLegacySelectedRowEditor
              ? "Hide Legacy Bottom Editor"
              : "Show Legacy Bottom Editor"}
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
          Hedges in view: <strong>{visibleHedgeCount}</strong>
        </span>

        <span>
          Parser issues in view: <strong>{visibleParserIssueCount}</strong>
        </span>

        <span style={{ color: "#475569" }}>
          Filters: {activeFilterLabels.length ? activeFilterLabels.join(" · ") : "None"}
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
          {activeFilterLabels.length ? ` Active filters: ${activeFilterLabels.join(" · ")}` : ""}
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
          tableMode={tableMode}
          getRowAttentionLevel={getRowAttentionLevel}
          rowNeedsReview={rowNeedsReview}
          allRows={rowsWithWarnings}
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
              <strong>Fixture / Event:</strong> {selectedRow.fixtureEvent || "—"}
            </div>
            <div>
              <strong>Selection:</strong> {selectedRow.selection || "—"}
            </div>
            <div>
              <strong>Bet Type:</strong> {selectedRow.betType || "—"}
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
      {selectedRow.hedgePartnerBookmaker || "—"}
    </div>
    <div>
      <strong>Hedge Stake:</strong>{" "}
      {selectedRow.hedgeStake ? `$${selectedRow.hedgeStake}` : "—"}
    </div>
    <div>
      <strong>Profit Range:</strong>{" "}
      {selectedRow.hedgeProfitLow && selectedRow.hedgeProfitHigh
        ? `$${selectedRow.hedgeProfitLow} → $${selectedRow.hedgeProfitHigh}`
        : "—"}
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
                  nextValue === "Y" ? "Reviewed ✓ moving to next" : "Marked unresolved"
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