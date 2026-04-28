"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ImportPanel from "./components/ImportPanel";
import ExtractionGuide from "./components/ExtractionGuide";
import ParsedOddsTable from "./components/ParsedOddsTable";
import MarketMatchPanel from "./components/MarketMatchPanel";
import ManualMatchPanel from "./components/ManualMatchPanel";
import FairOddsPanel from "./components/FairOddsPanel";
import TopEdgeBetsPanel from "./components/TopEdgeBetsPanel";
import LoadCoveragePanel from "./components/LoadCoveragePanel";
import ParlayFilters from "./components/ParlayFilters";
import ParlayResults from "./components/ParlayResults";

import { SAMPLE_RAW_TEXT, SAMPLE_FILTERS } from "./data/sampleData";
import { parseOddsText } from "./utils/parseOddsText";
import { normalizeParsedRows } from "./utils/normalizeTeams";
import { buildCanonicalMarkets } from "./utils/matchMarkets";
import { calculateFairOddsForMarkets } from "./utils/fairOdds";
import { buildParlayCandidates } from "./utils/parlayEngine";
import { normalizeMarketType } from "./utils/marketNormalization";

const IMPORT_QUEUE_KEY = "EV_IMPORT_QUEUE";
const SAVED_SESSION_KEY = "EV_PARLAY_LAB_SESSION";
const SAVED_PLACED_PARLAYS_KEY = "EV_PARLAY_LAB_PLACED_PARLAYS";
const SAVED_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function readImportQueue() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMPORT_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeImportQueue(queue) {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
}

function readSavedPlacedParlays() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_PLACED_PARLAYS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeSavedPlacedParlays(parlays) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SAVED_PLACED_PARLAYS_KEY,
    JSON.stringify(Array.isArray(parlays) ? parlays : [])
  );
}

function normalizeLegKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSavedLegKeyFromLeg(leg = {}) {
  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName),
    normalizeLegKeyPart(leg.selectionLabel),
    normalizeLegKeyPart(leg.lineValue),
  ].join("::");
}

function buildSavedLegUsageMap(savedPlacedParlays = []) {
  const usage = new Map();

  for (const parlay of savedPlacedParlays || []) {
    for (const leg of parlay?.legs || []) {
      const key = leg.savedLegKey || buildSavedLegKeyFromLeg(leg);
      if (!key) continue;

      usage.set(key, {
        count: (usage.get(key)?.count || 0) + 1,
        lastUsedAt: parlay.savedAt || "",
        parlayIds: [...(usage.get(key)?.parlayIds || []), parlay.id],
      });
    }
  }

  return usage;
}

function makePlacedParlayRecord(parlay) {
  const savedAt = new Date().toISOString();

  return {
    id: `placed_parlay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    savedAt,
    placedDate: savedAt.slice(0, 10),
    boostPct: Number(parlay?.boostPctUsed || 0),
    rawParlayAmerican: parlay?.rawParlayAmerican ?? null,
    boostedParlayAmerican: parlay?.boostedParlayAmerican ?? null,
    expectedValuePct: parlay?.expectedValuePct ?? null,
    fairHitProbability: parlay?.fairHitProbability ?? null,
    gradeTier: parlay?.gradeTier || "",
    playLabel: parlay?.playLabel || "",
    legs: (parlay?.legs || []).map((leg) => {
      const savedLegKey = buildSavedLegKeyFromLeg(leg);

      return {
        savedLegKey,
        eventName: leg.eventName || "",
        eventDate: leg.eventDate || leg.startTime || "",
        sport: leg.sport || "",
        marketType: leg.marketType || "",
        subjectName: leg.subjectName || "",
        selectionLabel: leg.selectionLabel || "",
        lineValue: leg.lineValue ?? null,
        sportsbook: leg.sportsbook || "",
        oddsAmerican: leg.oddsAmerican ?? null,
      };
    }),
  };
}

function formatSavedDateTime(value) {
  if (!value) return "Unknown time";

  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return String(value);
  }
}


function calculateSingleKellyStake({
  bankroll,
  kellyFraction,
  fairProbability,
  oddsDecimal,
}) {
  const resolvedBankroll = Number(bankroll) || 0;
  const resolvedKellyFraction = Number(kellyFraction) || 0;

  if (
    !(resolvedBankroll > 0) ||
    !(resolvedKellyFraction > 0) ||
    !(fairProbability > 0) ||
    !(fairProbability < 1) ||
    !(oddsDecimal > 1)
  ) {
    return 0;
  }

  const b = oddsDecimal - 1;
  const p = fairProbability;
  const q = 1 - p;

  const fullKellyFraction = (b * p - q) / b;

  if (!(fullKellyFraction > 0)) {
    return 0;
  }

  return resolvedBankroll * resolvedKellyFraction * fullKellyFraction;
}

function extractSubjectNameFromMarket(market) {
  const subjectKey = String(market?.subjectKey || "");

  if (!subjectKey.includes("::")) return "";

  const rawName = subjectKey.split("::").slice(1).join("::").trim();
  if (!rawName) return "";

  return rawName
    .split(/\s+/)
    .map((part) => {
      if (/^[a-z]\.$/i.test(part)) return part.toUpperCase();
      if (/^mj$/i.test(part)) return "MJ";
      if (/^jr\.?$/i.test(part)) return "Jr.";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function buildTopSingleEdgeBets({ markets, fairOddsResults, filters }) {
  const fairMap = new Map(
    fairOddsResults.map((result) => [`${result.marketId}::${result.selectionId}`, result])
  );

  const bets = [];

  for (const market of markets) {
    for (const selection of market.selections) {
      const fair = fairMap.get(`${market.id}::${selection.id}`);
      if (!fair) continue;

      const targetQuotes = selection.quotes.filter(
        (q) =>
          q.isTargetBook === true &&
          Number.isFinite(q.oddsDecimal) &&
          q.oddsDecimal > 1
      );

      const sharpQuotes = selection.quotes.filter(
        (q) =>
          q.isSharpSource === true &&
          Number.isFinite(q.oddsDecimal) &&
          q.oddsDecimal > 1
      );

      if (!targetQuotes.length || !sharpQuotes.length) continue;

      const bestTargetQuote = [...targetQuotes].sort(
        (a, b) => b.oddsDecimal - a.oddsDecimal
      )[0];

      const bestSharpQuote = [...sharpQuotes].sort((a, b) => {
        const priority = (quote) => {
          const book = String(quote.sportsbook || "").trim().toLowerCase();
          if (book === "pinnacle") return 1;
          if (book === "fanduel") return 2;
          return 3;
        };

        const priorityDiff = priority(a) - priority(b);
        if (priorityDiff !== 0) return priorityDiff;

        return b.oddsDecimal - a.oddsDecimal;
      })[0];

      const fairProbability = fair.fairProbability;
      const evPct =
        fairProbability * (bestTargetQuote.oddsDecimal - 1) -
        (1 - fairProbability);

      if (!(evPct > 0)) continue;

      const edgePct =
        bestTargetQuote.oddsDecimal / bestSharpQuote.oddsDecimal - 1;

      bets.push({
        marketId: market.id,
        selectionId: selection.id,
        eventName: market.displayName,
        sport: market.sport || "",
        marketType: market.marketType,
        subjectName: extractSubjectNameFromMarket(market),
        lineValue: market.lineValue,
        selectionLabel: selection.label,
        targetSportsbook: bestTargetQuote.sportsbook,
        targetOddsAmerican: bestTargetQuote.oddsAmerican,
        sharpSportsbook: bestSharpQuote.sportsbook,
        sharpOddsAmerican: bestSharpQuote.oddsAmerican,
        fairProbability: fair.fairProbability,
        fairAmerican: fair.fairAmerican,
        edgePct,
        evPct,
        suggestedKellyStake: calculateSingleKellyStake({
          bankroll: filters?.bankroll,
          kellyFraction: filters?.kellyFraction,
          fairProbability: fair.fairProbability,
          oddsDecimal: bestTargetQuote.oddsDecimal,
        }),
      });
    }
  }

  return bets.sort((a, b) => b.evPct - a.evPct).slice(0, 12);
}

export default function EVParlayLabPage() {
  const [rawText, setRawText] = useState(SAMPLE_RAW_TEXT);
  const [sportsbook, setSportsbook] = useState("DraftKings");
  const [batchRole, setBatchRole] = useState("target");
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(SAMPLE_FILTERS);
  const [manualMatches, setManualMatches] = useState([]);
  const [lastParsedAt, setLastParsedAt] = useState(null);
  const [showParsedTable, setShowParsedTable] = useState(false);
  const [showManualMatchPanel, setShowManualMatchPanel] = useState(false);
  const [pendingUrlImport, setPendingUrlImport] = useState(null);
  const [pendingImports, setPendingImports] = useState([]);
  const [savedPlacedParlays, setSavedPlacedParlays] = useState([]);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  function refreshPendingImports() {
    setPendingImports(readImportQueue());
  }

  function handleLoadNewestImport({ append = false } = {}) {
    const queue = readImportQueue();
    if (!queue.length) {
      alert("No pending imports found.");
      return;
    }

    const newest = queue[queue.length - 1];
    const incomingText = String(newest?.text || "");

    if (!incomingText.trim()) {
      alert("Newest import is empty.");
      return;
    }

    setRawText((prev) => {
      if (!append || !String(prev || "").trim()) return incomingText;
      return `${String(prev).trim()}\n\n${incomingText}`;
    });

    if (newest?.source) {
      setSportsbook(String(newest.source));
    }

    refreshPendingImports();
  }

  function handleClearPendingImports() {
    writeImportQueue([]);
    setPendingImports([]);
  }

  function handleClearSavedSession() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(SAVED_SESSION_KEY);
      localStorage.removeItem(IMPORT_QUEUE_KEY);
    }

    setRows([]);
    setManualMatches([]);
    setLastParsedAt(null);
    setPendingUrlImport(null);
    setPendingImports([]);
    setRawText("");
    setShowParsedTable(false);
    setShowManualMatchPanel(false);
  }

   function handleParse() {
  const inputText = typeof rawText === "string" ? rawText : "";

  console.log("RAW TEXT AT PARSE", {
    length: inputText.length,
    preview: inputText.slice(0, 300),
  });

  if (!inputText.trim()) {
    alert("Input is empty.");
    return;
  }

  const parsed = parseOddsText(inputText, {
    sportsbook,
    sourceType: "pasted_text",
  });

  console.log("HANDLE PARSE PARSED", parsed);
  console.log("HANDLE PARSE RESULT", {
    sportsbook,
    batchRole,
    parsedCount: parsed.length,
  });

  const withBatchRole = applyBatchRoleToRows(parsed, {
    sportsbook,
    batchRole,
  });

  const parsedAt = Date.now();

  const normalized = (normalizeParsedRows(withBatchRole) || []).map((row, index) => ({
    ...row,
    id: makeParsedRowId(row, parsedAt, index),
  }));

console.log("HANDLE PARSE NORMALIZED", normalized);

  setRows((prev) => {
    const existingKeys = new Set(prev.map((row) => makeRowMergeKey(row)));

    const additions = normalized.filter((row) => {
      const key = makeRowMergeKey(row);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });

    return [...prev, ...additions];
  });

  setLastParsedAt(new Date().toISOString());
  alert(`Parsed rows: ${normalized.length}`);
}

  function applyBatchRoleToRows(parsedRows, { sportsbook, batchRole }) {
    return (parsedRows || []).map((row) => {
      const resolvedRole =
        batchRole ||
        (String(sportsbook || "").trim().toLowerCase() === "pinnacle"
          ? "fair_odds"
          : "target");

      if (resolvedRole === "fair_odds") {
        return {
          ...row,
          batchRole: "fair_odds",
          isSharpSource: true,
          isTargetBook: false,
        };
      }

      return {
        ...row,
        batchRole: "target",
        isSharpSource: false,
        isTargetBook: true,
      };
    });
  }

    function makeParsedRowId(row, parsedAt, index) {
      return [
        row.sportsbook || "book",
        row.batchRole || "role",
        row.sport || "sport",
        row.eventLabelRaw || "event",
        row.marketType || "market",
        row.selectionNormalized || row.selectionRaw || "selection",
        row.lineValue ?? "line",
        row.oddsAmerican ?? "odds",
        parsedAt,
        index,
      ]
        .map((part) =>
          String(part)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
        )
        .join("__");
    }

  function makeRowMergeKey(row) {
    return [
      String(row.batchRole || "").trim().toLowerCase(),
      String(row.sportsbook || "").trim().toLowerCase(),
      String(row.sport || "").trim().toLowerCase(),
      String(row.eventLabelRaw || "").trim().toLowerCase(),
      String(row.marketType || "").trim().toLowerCase(),
      String(row.selectionNormalized || "").trim().toLowerCase(),
      row.lineValue ?? "",
      row.oddsAmerican ?? "",
    ].join("::");
  }

  function handleClearInput() {
    setRawText("");
  }

  function handleClearParsedRows() {
    setRows([]);
    setManualMatches([]);
    setLastParsedAt(null);
    setShowParsedTable(false);
    setShowManualMatchPanel(false);
  }

function handleSavePlacedParlay(parlay) {
    if (!parlay || !Array.isArray(parlay.legs) || parlay.legs.length === 0) {
      alert("No parlay legs found to save.");
      return;
    }

    const record = makePlacedParlayRecord(parlay);

    setSavedPlacedParlays((prev) => {
      const next = [record, ...(prev || [])].slice(0, 250);
      writeSavedPlacedParlays(next);
      return next;
    });
  }

  function handleClearSavedPlacedParlays() {
    const ok = window.confirm(
      "Clear all saved placed parlays? This only clears the EV Lab saved-parlay ledger."
    );

    if (!ok) return;

    setSavedPlacedParlays([]);
    writeSavedPlacedParlays([]);
  }

  function handleDeleteSavedPlacedParlay(parlayId) {
    setSavedPlacedParlays((prev) => {
      const next = (prev || []).filter((parlay) => parlay.id !== parlayId);
      writeSavedPlacedParlays(next);
      return next;
    });
  }

  function handleUpdateRow(rowId, patch) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch, userEdited: true } : row))
    );
  }

  function handleDeleteRow(rowId) {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
    setManualMatches((prev) =>
      prev.filter((match) => match.sourceRowId !== rowId && match.targetRowId !== rowId)
    );
  }

    const rowsWithManualMatches = useMemo(
  () => applyManualMatchOverrides(rows, manualMatches),
  [rows, manualMatches]
);

  const rowsForAnalysis = useMemo(() => {
  const selectedSport = String(filters?.selectedSport || "ALL").trim().toUpperCase();
  const enforceNoLiveGames = filters?.enforceNoLiveGames !== false;

  return (rowsWithManualMatches || []).filter((row) => {
    const sport = String(row.sport || "").trim().toUpperCase();

    if (selectedSport !== "ALL" && sport !== selectedSport) {
      return false;
    }

    if (enforceNoLiveGames && isLikelyLiveRow(row)) {
      return false;
    }

    return true;
  });
}, [rowsWithManualMatches, filters]);

  function handleDeleteRows(rowIds = []) {
    const ids = new Set(rowIds);

    setRows((prev) => prev.filter((row) => !ids.has(row.id)));

    setManualMatches((prev) =>
      prev.filter(
        (match) => !ids.has(match.sourceRowId) && !ids.has(match.targetRowId)
      )
    );
  }

const manualMatchCandidates = useMemo(() => {
  if (!showManualMatchPanel) return [];
  if (!Array.isArray(rows) || !rows.length) return [];

  return buildManualMatchCandidates(rows, manualMatches);
}, [showManualMatchPanel, rows, manualMatches]);

const savedLegUsageMap = useMemo(
  () => buildSavedLegUsageMap(savedPlacedParlays),
  [savedPlacedParlays]
);

const marketBundle = useMemo(() => {
  if (!rowsForAnalysis.length) {
    return { markets: [], unmatchedRows: [] };
  }

  return buildCanonicalMarkets(rowsForAnalysis);
}, [rowsForAnalysis]);

  const fairOddsBundle = useMemo(() => {
    if (!marketBundle.markets.length) return [];
    return calculateFairOddsForMarkets(marketBundle.markets, rowsForAnalysis);
    }, [marketBundle.markets, rowsForAnalysis]);

  const topSingleEdgeBets = useMemo(() => {
    if (!marketBundle.markets.length || !fairOddsBundle.length) return [];

    return buildTopSingleEdgeBets({
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
      filters,
    });
  }, [marketBundle.markets, fairOddsBundle, filters]);

  const parlayEngineOutput = useMemo(() => {
    if (!rowsForAnalysis.length || !marketBundle.markets.length || !fairOddsBundle.length) {
      return {
        parlays: [],
        counts: {
          eligibleLegs: 0,
          eligibleMarkets: 0,
          generatedCombos: 0,
          rejections: {
            noFairOdds: 0,
            noTargetQuote: 0,
            belowLegThreshold: 0,
            sameSportBlocked: 0,
            sameGameBlocked: 0,
            repeatsBlocked: 0,
            nonPositiveParlayEv: 0,
          },
        },
      };
    }

    return buildParlayCandidates({
      rows: rowsForAnalysis,
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
      filters,
      savedLegUsageMap,
    });
  }, [rowsForAnalysis, marketBundle.markets, fairOddsBundle, filters, savedLegUsageMap]);



  useEffect(() => {
    refreshPendingImports();

    if (typeof window === "undefined") {
      setHasRestoredSession(true);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const safeReset = params.get("evSafe") === "1" || params.get("evReset") === "1";

    if (safeReset) {
      localStorage.removeItem(SAVED_SESSION_KEY);
      localStorage.removeItem(IMPORT_QUEUE_KEY);
      sessionStorage.clear();

      setRawText("");
      setRows([]);
      setManualMatches([]);
      setLastParsedAt(null);
      setPendingUrlImport(null);
      setPendingImports([]);
      setSavedPlacedParlays(readSavedPlacedParlays());

      params.delete("evSafe");
      params.delete("evReset");

      const newUrl =
        window.location.pathname + (params.toString() ? `?${params.toString()}` : "");

      window.history.replaceState({}, "", newUrl);
      setHasRestoredSession(true);
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_SESSION_KEY) || "null");

      if (!saved || typeof saved !== "object") {
        setHasRestoredSession(true);
        return;
      }

      const savedAt = Number(saved.savedAt || 0);
      if (savedAt && Date.now() - savedAt > SAVED_SESSION_TTL_MS) {
        localStorage.removeItem(SAVED_SESSION_KEY);
        setHasRestoredSession(true);
        return;
      }

      if (typeof saved.rawText === "string") setRawText(saved.rawText);
      if (typeof saved.sportsbook === "string") setSportsbook(saved.sportsbook);
      if (typeof saved.batchRole === "string") setBatchRole(saved.batchRole);
      if (Array.isArray(saved.rows)) setRows(saved.rows);
      if (saved.filters && typeof saved.filters === "object") setFilters(saved.filters);
      if (Array.isArray(saved.manualMatches)) setManualMatches(saved.manualMatches);
      setSavedPlacedParlays(readSavedPlacedParlays());
      if (typeof saved.lastParsedAt === "string" || saved.lastParsedAt === null) {
        setLastParsedAt(saved.lastParsedAt);
      }
    } catch (err) {
      console.warn("Failed to restore EV Parlay Lab session", err);
    } finally {
      setHasRestoredSession(true);
    }
  }, []);

    useEffect(() => {
    if (typeof window === "undefined") return;

    function processQueuedImports() {
      const queue = readImportQueue();
      if (!queue.length) {
        refreshPendingImports();
        return;
      }

      const newest = queue[queue.length - 1];
      const incomingText = String(newest?.text || "");

      if (!incomingText.trim()) {
        refreshPendingImports();
        return;
      }

      setPendingUrlImport(incomingText);
      setRawText(incomingText);

      if (newest?.source) {
        const sourceName = String(newest.source);
        setSportsbook(sourceName);

        if (/^pinnacle$/i.test(sourceName) || /^fanduel$/i.test(sourceName)) {
          setBatchRole("fair_odds");
        } else {
          setBatchRole("target");
        }
      }

      writeImportQueue([]);
      setPendingImports([]);
      setSavedPlacedParlays(readSavedPlacedParlays());
      window.__evParlayAutoParsePending = true;
    }

    processQueuedImports();

    window.addEventListener("ev-parlay-import-queued", processQueuedImports);

    return () => {
      window.removeEventListener("ev-parlay-import-queued", processQueuedImports);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasRestoredSession) return;

    const safeRows = (rows || []).map((row) => {
      const {
        _allRowsInEvent,
        ...rest
      } = row || {};

      return rest;
    });

    const payload = {
      rawText,
      sportsbook,
      batchRole,
      rows: safeRows,
      filters,
      manualMatches,
      lastParsedAt,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to save EV Parlay Lab session", err);
    }
  }, [hasRestoredSession, rawText, sportsbook, batchRole, rows, filters, manualMatches, lastParsedAt]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const imported = params.get("import");
    const source = params.get("source");
    const mode = params.get("mode");
    const autoParse = params.get("autoparse");

    if (!imported) return;

    const decoded = imported;

    if (decoded && decoded.trim()) {
      setPendingUrlImport(decoded);

      setRawText((prev) => {
        if (mode === "append" && String(prev || "").trim()) {
          return `${String(prev).trim()}\n\n${decoded}`;
        }
        return decoded;
      });

      if (source && String(source).trim()) {
        const normalizedSource = String(source).trim();
        if (/^thescore$/i.test(normalizedSource)) {
          setSportsbook("TheScore");
        } else {
          setSportsbook(normalizedSource);
        }
      }

      if (autoParse === "1") {
        window.__evParlayAutoParsePending = true;
      }
    }

    params.delete("import");
    params.delete("source");
    params.delete("mode");
    params.delete("autoparse");
    const newUrl =
      window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", newUrl);
  }, []);

    useEffect(() => {
      if (typeof window === "undefined") return;
      if (!window.__evParlayAutoParsePending) return;
      if (!rawText || !String(rawText).trim()) return;

      window.__evParlayAutoParsePending = false;
      handleParse();
    }, [rawText, sportsbook, batchRole]);

  const parlayCandidates = Array.isArray(parlayEngineOutput)
    ? parlayEngineOutput
    : parlayEngineOutput?.parlays || [];

  const parlayCounts = Array.isArray(parlayEngineOutput)
    ? { eligibleLegs: 0, eligibleMarkets: 0, generatedCombos: 0 }
    : parlayEngineOutput?.counts || {
        eligibleLegs: 0,
        eligibleMarkets: 0,
        generatedCombos: 0,
      };

  return (
    <div
      style={{
        padding: 20,
        color: "#111",
        background: "#f7f7f8",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div>
  <h1 style={{ marginTop: 0, marginBottom: 8 }}>EV Parlay Lab</h1>
  <p style={{ marginTop: 0, color: "#555", marginBottom: 0 }}>
    Import odds, review parsed rows, compare to sharp prices, and rank possible EV parlays.
  </p>
</div>

<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <Link
    href="/tools"
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 14px",
      borderRadius: 8,
      background: "#fff",
      color: "#166534",
      border: "1px solid #86efac",
      textDecoration: "none",
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
    Tools
  </Link>

  <Link
    href="/"
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 14px",
      borderRadius: 8,
      background: "#166534",
      color: "#f0fdf4",
      textDecoration: "none",
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
    ← Back to Bet Slip App
  </Link>
</div>
</div>

        <ImportPanel
          rawText={rawText}
          setRawText={setRawText}
          sportsbook={sportsbook}
          setSportsbook={setSportsbook}
          batchRole={batchRole}
          setBatchRole={setBatchRole}
          onParse={handleParse}
          onClearInput={handleClearInput}
          onClearParsedRows={handleClearParsedRows}
          hasRows={rows.length > 0}
          lastParsedAt={lastParsedAt}
        />

        <ExtractionGuide sportsbook={sportsbook} />

        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            background: "#ecfdf5",
            border: "1px solid #86efac",
          }}
        >
          <div style={{ fontWeight: 800, color: "#166534", marginBottom: 8 }}>
            Pending scraped imports: {pendingImports.length}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleLoadNewestImport({ append: false })}
              style={{
                background: "#166534",
                color: "#f0fdf4",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Load newest import
            </button>

            <button
              type="button"
              onClick={() => handleLoadNewestImport({ append: true })}
              style={{
                background: "#fff",
                color: "#166534",
                border: "1px solid #86efac",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Append newest import
            </button>

            <button
              type="button"
              onClick={handleClearPendingImports}
              style={{
                background: "#fff",
                color: "#991b1b",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Clear pending imports
            </button>

            <button
              type="button"
              onClick={handleClearSavedSession}
              style={{
                background: "#fff",
                color: "#7c2d12",
                border: "1px solid #fdba74",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Clear saved session
            </button>
          </div>
        </div>

        {pendingUrlImport ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              background: "#ecfdf5",
              border: "1px solid #86efac",
              color: "#166534",
              fontWeight: 700,
            }}
          >
            Imported scraped text from URL. Review or click Parse.
          </div>
        ) : null}

        <div style={{ marginBottom: 12, fontWeight: 700, color: "#166534" }}>
          Debug: rows in state = {rows.length}
        </div>

        <LoadCoveragePanel rows={rows} />

        <TopEdgeBetsPanel bets={topSingleEdgeBets} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowParsedTable((prev) => !prev)}
            style={{
              background: "#166534",
              color: "#f0fdf4",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {showParsedTable ? "Hide Parsed Review" : "Show Parsed Review"}
          </button>

          <button
            type="button"
            onClick={() => setShowManualMatchPanel((prev) => !prev)}
            style={{
              background: "#fff",
              color: "#166534",
              border: "1px solid #86efac",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {showManualMatchPanel ? "Hide Manual Match Review" : "Show Manual Match Review"}
          </button>
        </div>

        {showParsedTable ? (
          <ParsedOddsTable
            rows={rows}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onDeleteRows={handleDeleteRows}
          />
        ) : null}

        {showManualMatchPanel ? (
          <ManualMatchPanel
            candidates={manualMatchCandidates}
            manualMatches={manualMatches}
            onApplyMatch={(match) => {
              setManualMatches((prev) => {
                const filtered = prev.filter((item) => item.sourceRowId !== match.sourceRowId);
                return [...filtered, match];
              });
            }}
            onRemoveMatch={(sourceRowId) => {
              setManualMatches((prev) => prev.filter((item) => item.sourceRowId !== sourceRowId));
            }}
          />
        ) : null}

        {/* <MarketMatchPanel
          markets={marketBundle.markets}
          unmatchedRows={marketBundle.unmatchedRows}
        /> */}

        <FairOddsPanel fairOddsResults={fairOddsBundle} />


        <ParlayFilters filters={filters} setFilters={setFilters} />

        <ParlayResults
          parlays={parlayCandidates}
          counts={parlayCounts}
          savedPlacedParlays={savedPlacedParlays}
          savedLegUsageMap={savedLegUsageMap}
          onSavePlacedParlay={handleSavePlacedParlay}
          onClearSavedParlays={handleClearSavedPlacedParlays}
          onDeleteSavedParlay={handleDeleteSavedPlacedParlay}
          formatSavedDateTime={formatSavedDateTime}
        />
      </div>
    </div>
  );
}
function applyManualMatchOverrides(rows, manualMatches) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!Array.isArray(manualMatches) || !manualMatches.length) return rows;

  const sourceById = new Map(rows.map((row) => [row.id, row]));
  const overrideByTargetRowId = new Map();

  for (const match of manualMatches) {
    const sourceRow = sourceById.get(match.sourceRowId);
    if (!sourceRow) continue;

    overrideByTargetRowId.set(match.targetRowId, {
      selectionRaw: sourceRow.selectionRaw,
      selectionNormalized: sourceRow.selectionNormalized,
      marketType: sourceRow.marketType,
      lineValue: sourceRow.lineValue,
      manualMatchSourceRowId: sourceRow.id,
      manualMatchSourceSelection: sourceRow.selectionNormalized,
      manualMatchApplied: true,
      parseWarnings: [
        ...(Array.isArray(sourceRow.parseWarnings) ? sourceRow.parseWarnings : []),
        `Manual match source: ${sourceRow.selectionNormalized}`,
      ],
    });
  }

  return rows.map((row) => {
    const override = overrideByTargetRowId.get(row.id);
    if (!override) return row;

    return {
      ...row,
      ...override,
    };
  });
}


function buildManualMatchCandidates(rows, manualMatches) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const matchedSourceIds = new Set((manualMatches || []).map((match) => match.sourceRowId));

  const rowsWithManualMatches = applyManualMatchOverrides(rows, manualMatches || []);

  const sharpRows = rowsWithManualMatches.filter((row) => row.isSharpSource === true);
  const targetRows = rowsWithManualMatches.filter((row) => row.isTargetBook === true);

  const candidates = [];

  for (const sourceRow of sharpRows) {
    if (matchedSourceIds.has(sourceRow.id)) continue;

    const sourceEventKey = normalizeManualMatchEventKey(sourceRow.eventLabelRaw);
    const sourceBaseKey = buildSelectionBaseKey(sourceRow);
    const sourceThresholdKey = buildSelectionThresholdKey(sourceRow);
    const sourceFamilyKey = buildSelectionFamilyKey(sourceRow);
    const sourceDirection = buildSelectionDirectionKey(sourceRow);

    if (!sourceEventKey || !sourceBaseKey) continue;

    const alreadyMatchedExact = targetRows.some((targetRow) => {
      if (normalizeManualMatchEventKey(targetRow.eventLabelRaw) !== sourceEventKey) return false;
      if (String(normalizeMarketType(targetRow.marketType) || "") !== String(normalizeMarketType(sourceRow.marketType) || "")) return false;
      if (buildSelectionFamilyKey(targetRow) !== sourceFamilyKey) return false;
      if (buildSelectionDirectionKey(targetRow) !== sourceDirection) return false;
      return buildSelectionThresholdKey(targetRow) === sourceThresholdKey;
    });

    if (alreadyMatchedExact) continue;

    const possibleTargets = targetRows.filter((targetRow) => {
      if (targetRow.id === sourceRow.id) return false;
      if (normalizeManualMatchEventKey(targetRow.eventLabelRaw) !== sourceEventKey) return false;
      if (String(normalizeMarketType(targetRow.marketType) || "") !== String(normalizeMarketType(sourceRow.marketType) || "")) return false;

      const targetBaseKey = buildSelectionBaseKey(targetRow);
      if (!targetBaseKey) return false;

      if (!hasMeaningfulBaseOverlap(sourceBaseKey, targetBaseKey)) return false;

      const targetFamilyKey = buildSelectionFamilyKey(targetRow);
      if (sourceFamilyKey && targetFamilyKey && sourceFamilyKey !== targetFamilyKey) return false;

      const targetDirection = buildSelectionDirectionKey(targetRow);
      if (sourceDirection && targetDirection && sourceDirection !== targetDirection) return false;

      const targetThresholdKey = buildSelectionThresholdKey(targetRow);

      return targetThresholdKey !== sourceThresholdKey;
    });

    if (!possibleTargets.length) continue;

    const groupedByBook = new Map();

    for (const row of possibleTargets) {
      const book = String(row.sportsbook || "Unknown");
      if (!groupedByBook.has(book)) {
        groupedByBook.set(book, []);
      }

      groupedByBook.get(book).push({
        rowId: row.id,
        selectionLabel: buildManualSelectionLabel(row),
        thresholdSortValue: buildThresholdSortValue(row),
        matchScore: computeMatchScore(sourceRow, row),
      });
    }

    const targetBooks = Array.from(groupedByBook.entries()).map(([sportsbook, options]) => ({
      sportsbook,
      options: options
        .sort((a, b) => {
          if (a.matchScore !== b.matchScore) {
            return a.matchScore - b.matchScore;
          }
          if (a.thresholdSortValue !== b.thresholdSortValue) {
            return a.thresholdSortValue - b.thresholdSortValue;
          }
          return a.selectionLabel.localeCompare(b.selectionLabel);
        })
        .map(({ rowId, selectionLabel }) => ({ rowId, selectionLabel })),
    }));

    candidates.push({
      sourceRowId: sourceRow.id,
      sourceSportsbook: sourceRow.sportsbook,
      sourceSelectionLabel: buildManualSelectionLabel(sourceRow),
      eventName: sourceRow.eventLabelRaw || "Unknown Event",
      marketType: sourceRow.marketType,
      targetBooks,
    });
  }

  return candidates.sort((a, b) => {
    if (a.eventName !== b.eventName) return a.eventName.localeCompare(b.eventName);
    if (a.marketType !== b.marketType) return a.marketType.localeCompare(b.marketType);
    return a.sourceSelectionLabel.localeCompare(b.sourceSelectionLabel);
  });
}

function normalizeManualMatchEventKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSelectionBaseKey(row) {
  const text = String(row.selectionNormalized || row.selectionRaw || "")
    .toLowerCase()
    .replace(/−/g, "-")
    .replace(/\b(over|under)\b/g, " ")
    .replace(/\b\d+(\.\d+)?\+\b/g, " ")
    .replace(/[+-]?\d+(\.\d+)?/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function buildSelectionThresholdKey(row) {
  const label = String(row.selectionNormalized || row.selectionRaw || "").toLowerCase();

  const plusMatch = label.match(/(\d+(?:\.\d+)?)\+/);
  if (plusMatch) return `plus:${plusMatch[1]}`;

  const overUnderMatch = label.match(/\b(over|under)\s+(\d+(?:\.\d+)?)/);
  if (overUnderMatch) return `${overUnderMatch[1]}:${overUnderMatch[2]}`;

  if (Number.isFinite(row.lineValue)) {
    return `line:${row.lineValue}`;
  }

  return label.replace(/\s+/g, " ").trim();
}

function buildSelectionFamilyKey(row) {
  const marketType = normalizeMarketType(row.marketType);
  const selection = String(row.selectionNormalized || row.selectionRaw || "")
    .toLowerCase()
    .replace(/âˆ’/g, "-");

  if (marketType === "player_points") return "points";
  if (marketType === "player_assists") return "assists";
  if (marketType === "player_rebounds") return "rebounds";
  if (marketType === "player_threes") return "threes";
  if (marketType === "player_pra") return "pra";
  if (marketType === "player_points_rebounds") return "points_rebounds";
  if (marketType === "player_points_assists") return "points_assists";
  if (marketType === "player_rebounds_assists") return "rebounds_assists";
  if (marketType === "double_double") return "double_double";
  if (marketType === "triple_double") return "triple_double";
  if (marketType === "player_shots_on_goal") return "shots_on_goal";
  if (marketType === "player_saves") return "saves";
  if (marketType === "player_power_play_points") return "power_play_points";
  if (marketType === "goalie_goals_against") return "goals_against";
  if (marketType === "player_shutout") return "shutout";
  if (marketType === "anytime_goalscorer") return "anytime_goalscorer";

  if (/\bpts\s*\+\s*reb\s*\+\s*ast\b|\bpts & rebs & asts\b|\bpra\b/.test(selection)) {
    return "pra";
  }

  if (/\bpts\s*\+\s*reb\b/.test(selection)) return "points_rebounds";
  if (/\bpts\s*\+\s*ast\b/.test(selection)) return "points_assists";
  if (/\breb\s*\+\s*ast\b/.test(selection)) return "rebounds_assists";

  if (/\bdouble[\s-]?double\b/.test(selection)) return "double_double";
  if (/\btriple[\s-]?double\b/.test(selection)) return "triple_double";

  if (/\bshots on goal\b/.test(selection)) return "shots_on_goal";
  if (/\bsaves\b/.test(selection)) return "saves";
  if (/\bpower play points\b/.test(selection)) return "power_play_points";
  if (/\bgoals against\b/.test(selection)) return "goals_against";
  if (/\bshutout\b/.test(selection)) return "shutout";
  if (/\bany ?time goal scorer\b|\banytime goalscorer\b/.test(selection)) return "anytime_goalscorer";

  if (/\bpoints\b/.test(selection)) return "points";
  if (/\bassists\b/.test(selection)) return "assists";
  if (/\brebounds\b/.test(selection)) return "rebounds";
  if (/\bthrees\b|\b3\+ pointers\b|\bthree pointers\b|\bthrees made\b/.test(selection)) return "threes";

  return marketType;
}


function buildSelectionDirectionKey(row) {
  const selection = String(row.selectionNormalized || row.selectionRaw || "").toLowerCase();

  if (/\bover\b/.test(selection)) return "over";
  if (/\bunder\b/.test(selection)) return "under";
  return "";
}

function buildThresholdSortValue(row) {
  if (Number.isFinite(row.lineValue)) {
    return Number(row.lineValue);
  }

  const label = String(row.selectionNormalized || row.selectionRaw || "").toLowerCase();

  const plusMatch = label.match(/(\d+(?:\.\d+)?)\+/);
  if (plusMatch) return Number(plusMatch[1]);

  const overUnderMatch = label.match(/\b(?:over|under)\s+(\d+(?:\.\d+)?)/);
  if (overUnderMatch) return Number(overUnderMatch[1]);

  return Number.POSITIVE_INFINITY;
}

function computeMatchScore(sourceRow, targetRow) {
  const sourceVal = buildThresholdSortValue(sourceRow);
  const targetVal = buildThresholdSortValue(targetRow);

  if (!Number.isFinite(sourceVal) || !Number.isFinite(targetVal)) {
    return Number.POSITIVE_INFINITY;
  }

  if (targetVal >= sourceVal) {
    return targetVal - sourceVal;
  }

  return (sourceVal - targetVal) + 0.5;
}


function hasMeaningfulBaseOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function buildManualSelectionLabel(row) {
  const selection = String(row.selectionNormalized || row.selectionRaw || "Unknown");
  const lineValue =
    Number.isFinite(row.lineValue) &&
    row.marketType !== "moneyline_2way" &&
    row.marketType !== "moneyline_3way"
      ? ` | line ${row.lineValue}`
      : "";

  const odds =
    Number.isFinite(row.oddsAmerican)
      ? ` | ${row.oddsAmerican > 0 ? `+${row.oddsAmerican}` : row.oddsAmerican}`
      : "";

  return `${selection}${lineValue}${odds}`;
}

function isLikelyLiveRow(row) {
  const text = [
    row.eventLabelRaw,
    row.startTimeRaw,
    row.rawText,
    row.sourceTag,
    ...(Array.isArray(row.parseWarnings) ? row.parseWarnings : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\blive\b/.test(text) ||
    /\btop\s+\d/.test(text) ||
    /\bbottom\s+\d/.test(text) ||
    /\bend\s+\d/.test(text) ||
    /\bperiod\b/.test(text) ||
    /\bquarter\b/.test(text) ||
    /\bhalf\b/.test(text) ||
    /\bb:\d\b/.test(text) ||
    /\bs:\d\b/.test(text) ||
    /\bo:\d\b/.test(text)
  );
}