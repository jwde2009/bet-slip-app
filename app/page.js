"use client";
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

const BOOKMAKER_UPLOAD_OPTIONS = [
  "Auto",
  "DraftKings",
  "BetMGM",
  "FanDuel",
  "Caesars",
  "Fanatics",
  "theScore",
  "bet365",
  "Circa",
  "Kalshi",
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

function getRowAttentionLevel(row) {
  if (!row) return "";

  const parseWarningText = String(row.parseWarning || "").toLowerCase();
  const duplicateWarningText = String(row.duplicateWarning || "").toLowerCase();
  const confidence = String(row.confidenceFlag || "").toLowerCase();

  const hasCriticalMoneyIssue =
    !row.stake ||
    !row.oddsUS ||
    parseWarningText.includes("stake_missing") ||
    parseWarningText.includes("odds_missing") ||
    parseWarningText.includes("payout_missing");

  if (row.reviewResolved === "Y") {
    return hasCriticalMoneyIssue ? "resolved-critical" : "resolved";
  }

  if (duplicateWarningText.includes("duplicate")) return "duplicate";

  if (
    confidence === "low" ||
    hasCriticalMoneyIssue ||
    parseWarningText.includes("selection_missing") ||
    parseWarningText.includes("fixture_missing") ||
    parseWarningText.includes("no_bet_date_detected") ||
    parseWarningText.includes("payout_estimated") ||
    parseWarningText.includes("payout_mismatch")
  ) {
    return "warning";
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

function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
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
  const [columnWidths, setColumnWidths] = useState({
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
    const withDuplicates = addDuplicateWarnings(enriched);
    return addLikelyHedgeFlags(withDuplicates);
  }, [rows]);
  
  function rowNeedsReview(row) {
    const parseWarningText = String(row?.parseWarning || "").toLowerCase();

    return (
      row.reviewResolved !== "Y" &&
      (
        row.likelyParserIssue === "Y" ||
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
  if (reviewMode) {
    next = next.filter((row) => rowNeedsReview(row) || row.reviewLater === "Y");
  }

  return next;
}, [
  rowsWithWarnings,
  showArchivedRows,
  showReviewLaterOnly,
  showLowConfidenceOnly,
  showLikelyParserIssuesOnly,
  showNeedsReviewOnly,
  showHedgesOnly,
  reviewMode,
]);

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
  selected: selectedIds.length,
  reviewed: reviewedCount,
  exportable: exportableCount,
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

  function areLikelyOpposites(rowA, rowB) {
  if (!rowA || !rowB) return false;
  if (rowA.id === rowB.id) return false;

  const eventA = String(rowA.fixtureEvent || "").toLowerCase().trim();
  const eventB = String(rowB.fixtureEvent || "").toLowerCase().trim();
  if (!eventA || !eventB || eventA !== eventB) return false;

  const typeA = String(rowA.betType || "").toLowerCase().trim();
  const typeB = String(rowB.betType || "").toLowerCase().trim();
  if (!typeA || !typeB || typeA !== typeB) return false;

  const keyA = classifySideKey(rowA);
  const keyB = classifySideKey(rowB);
  if (!keyA || !keyB || keyA === keyB) return false;

  if (typeA === "total") {
    const pair =
      (keyA.startsWith("total:over:") && keyB === keyA.replace("total:over:", "total:under:")) ||
      (keyA.startsWith("total:under:") && keyB === keyA.replace("total:under:", "total:over:"));
    if (pair) return true;
  }

  if (typeA === "moneyline") {
    return true;
  }

  if (typeA === "spread") {
    const spreadA = String(rowA.selection || "").match(/([+-]\d+(?:\.\d+)?)/);
    const spreadB = String(rowB.selection || "").match(/([+-]\d+(?:\.\d+)?)/);
    if (spreadA && spreadB) {
      return Number(spreadA[1]) === -Number(spreadB[1]);
    }
  }

  return false;
}

function addLikelyHedgeFlags(rowsInput) {
  function impliedProb(odds) {
    const o = Number(odds);
    if (!o) return 0;
    return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
  }

  return rowsInput.map((row) => {
    const match = rowsInput.find((other) => areLikelyOpposites(row, other));

    if (!match) {
      return {
        ...row,
        likelyHedge: "N",
        hedgePartnerBookmaker: "",
        hedgeQuality: "",
        hedgeStake: "",
        hedgeProfitLow: "",
        hedgeProfitHigh: "",
      };
    }

    const oddsA = Number(row.oddsUS);
    const oddsB = Number(match.oddsUS);
    const stakeA = Number(row.stake);

    let hedgeQuality = "Basic";
    let hedgeStake = "";
    let hedgeProfitLow = "";
    let hedgeProfitHigh = "";

    if (oddsA && oddsB && stakeA) {
      const probA = impliedProb(oddsA);
      const probB = impliedProb(oddsB);
      const total = probA + probB;

      if (total < 0.98) hedgeQuality = "🔥 Arb";
      else if (total < 1.02) hedgeQuality = "Strong";
      else hedgeQuality = "Weak";

      // --- hedge sizing ---
      const decimalA = oddsA > 0 ? 1 + oddsA / 100 : 1 + 100 / Math.abs(oddsA);
      const decimalB = oddsB > 0 ? 1 + oddsB / 100 : 1 + 100 / Math.abs(oddsB);

      const hedge = (stakeA * decimalA) / decimalB;

      const payoutA = stakeA * decimalA;
      const payoutB = hedge * decimalB;

      const profitIfA = payoutA - stakeA - hedge;
      const profitIfB = payoutB - stakeA - hedge;

      hedgeStake = hedge.toFixed(2);
      hedgeProfitLow = Math.min(profitIfA, profitIfB).toFixed(2);
      hedgeProfitHigh = Math.max(profitIfA, profitIfB).toFixed(2);
    }

    return {
      ...row,
      likelyHedge: "Y",
      hedgePartnerBookmaker: getDisplayedBookmaker(match),
      hedgeQuality,
      hedgeStake,
      hedgeProfitLow,
      hedgeProfitHigh,
    };
  });
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
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedRowId, visibleRows]);

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
  return id;
}

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

    const batchBookmaker = uploadBookmaker;
    const batchOwner = uploadOwner;

    const batchId = createUploadBatch(files, batchBookmaker);
    showNotice(`Accepted ${files.length} image${files.length === 1 ? "" : "s"} for upload`);

    setProcessing(true);
    setProcessingMessage(`Processing 0 of ${files.length}...`);
    updateUploadBatch(batchId, { status: "processing" });

    let errorCount = 0;
    const newRows = [];
    const concurrency = 3;

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

        const result = await Tesseract.recognize(file, "eng", { logger: () => {} });
        const extractedText = result.data.text || "";
        const parsed = parseBetSlip(extractedText, file.name, batchBookmaker);

        const forcedBookmaker =
          batchBookmaker && batchBookmaker !== "Auto"
            ? batchBookmaker
            : parsed.bookmaker;

        const row = enrichRow({
          ...parsed,
          bookmaker: forcedBookmaker,
          folder,
          parentFolder,
          parserId: parsed.id || "",
          id: crypto.randomUUID(),
          accountOwner: batchOwner,
          sourceImageUrl: URL.createObjectURL(file),
        });

        newRows.push(row);

        updateUploadBatch(batchId, {
          status: "processing",
          processedCount: index + 1,
          rowsCreated: newRows.length,
          errorCount,
        });
      } catch (error) {
        console.error(error);
        errorCount += 1;

        updateUploadBatch(batchId, {
          status: "processing",
          processedCount: index + 1,
          rowsCreated: newRows.length,
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

      setRows((prev) => [...prev, ...newRows]);
      if (newRows[0]) setSelectedRowId(newRows[0].id);

      updateUploadBatch(batchId, {
        status: errorCount > 0 ? (newRows.length > 0 ? "partial" : "failed") : "complete",
        processedCount: files.length,
        rowsCreated: newRows.length,
        errorCount,
      });

      showNotice(
        `Batch complete: ${newRows.length} row${newRows.length === 1 ? "" : "s"} created`
      );
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
      prev.map((row) => (row.id === id ? enrichRow({ ...row, [field]: value }) : row))
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
        "Hedge Quality",
        "Hedge Partner Bookmaker",
        "Hedge Stake",
        "Hedge Profit Low",
        "Hedge Profit High",
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
        escapeCsv(row.hedgeQuality),
        escapeCsv(row.hedgePartnerBookmaker),
        escapeCsv(row.hedgeStake),
        escapeCsv(row.hedgeProfitLow),
        escapeCsv(row.hedgeProfitHigh),
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
    downloadCsv(
      debug ? "bet-slip-selected-debug-data.csv" : "bet-slip-selected-data.csv",
      buildCsvData(rowsToExport, debug)
    );
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

  function exportSelectedRowsToCsv() {
    const selectedRows = rowsWithWarnings.filter(
      (row) => selectedIds.includes(row.id) && row.archived !== "Y"
    );

    if (!selectedRows.length) return showNotice("No selected active rows to export");

    const unreviewed = selectedRows.filter(
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
    ];

    const csv = [
      headers.join(","),
      ...selectedRows.map((row) =>
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
    showNotice(`Exported ${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"} in current batch`);
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
      <h1>Bet Slip Reader</h1>

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
          showArchivedRows={showArchivedRows}
          setShowArchivedRows={setShowArchivedRows}
          reviewMode={reviewMode}
          setReviewMode={setReviewMode}
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

          <button
            onClick={() => {
              setRows((prev) =>
                prev.map((row) =>
                  selectedIds.includes(row.id)
                    ? enrichRow({ ...row, reviewResolved: "Y", reviewLater: "N" })
                    : row
                )
              );
              showNotice("Selected rows marked reviewed");
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