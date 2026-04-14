"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import ImportPanel from "./components/ImportPanel";
import ExtractionGuide from "./components/ExtractionGuide";
import ParsedOddsTable from "./components/ParsedOddsTable";
import MarketMatchPanel from "./components/MarketMatchPanel";
import ManualMatchPanel from "./components/ManualMatchPanel";
import FairOddsPanel from "./components/FairOddsPanel";
import TopEdgeBetsPanel from "./components/TopEdgeBetsPanel";
import ParlayFilters from "./components/ParlayFilters";
import ParlayResults from "./components/ParlayResults";

import { SAMPLE_RAW_TEXT, SAMPLE_FILTERS } from "./data/sampleData";
import { parseOddsText } from "./utils/parseOddsText";
import { normalizeParsedRows } from "./utils/normalizeTeams";
import { buildCanonicalMarkets } from "./utils/matchMarkets";
import { calculateFairOddsForMarkets } from "./utils/fairOdds";
import { buildParlayCandidates } from "./utils/parlayEngine";

function buildTopSingleEdgeBets({ markets, fairOddsResults }) {
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

      const bestSharpQuote = [...sharpQuotes].sort(
        (a, b) => b.oddsDecimal - a.oddsDecimal
      )[0];

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
        marketType: market.marketType,
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

  const normalized = normalizeParsedRows(withBatchRole) || [];
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

const manualMatchCandidates = useMemo(
  () => buildManualMatchCandidates(rows, manualMatches),
  [rows, manualMatches]
);

const marketBundle = useMemo(() => buildCanonicalMarkets(rowsWithManualMatches), [rowsWithManualMatches]);

  const fairOddsBundle = useMemo(() => {
    return calculateFairOddsForMarkets(marketBundle.markets, rowsWithManualMatches);
  }, [marketBundle.markets, rowsWithManualMatches]);

  const topSingleEdgeBets = useMemo(() => {
    return buildTopSingleEdgeBets({
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
    });
  }, [marketBundle.markets, fairOddsBundle]);

  const parlayEngineOutput = useMemo(() => {
    return buildParlayCandidates({
      rows: rowsWithManualMatches,
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
      filters,
    });
  }, [rowsWithManualMatches, marketBundle.markets, fairOddsBundle, filters]);

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

        <div style={{ marginBottom: 12, fontWeight: 700, color: "#166534" }}>
          Debug: rows in state = {rows.length}
        </div>

        <ParsedOddsTable
          rows={rows}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={handleDeleteRow}
        />

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

        {/* <MarketMatchPanel
          markets={marketBundle.markets}
          unmatchedRows={marketBundle.unmatchedRows}
        /> */}

        <FairOddsPanel fairOddsResults={fairOddsBundle} />


        <ParlayFilters filters={filters} setFilters={setFilters} />

        <ParlayResults parlays={parlayCandidates} counts={parlayCounts} />
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

  const sharpRows = rows.filter((row) => row.isSharpSource === true);
  const targetRows = rows.filter((row) => row.isTargetBook === true);

  const candidates = [];

  for (const sourceRow of sharpRows) {
    if (matchedSourceIds.has(sourceRow.id)) continue;

    const sourceEventKey = normalizeManualMatchEventKey(sourceRow.eventLabelRaw);
    const sourceBaseKey = buildSelectionBaseKey(sourceRow);
    const sourceThresholdKey = buildSelectionThresholdKey(sourceRow);
    const sourceFamilyKey = buildSelectionFamilyKey(sourceRow);
    const sourceDirection = buildSelectionDirectionKey(sourceRow);

    if (!sourceEventKey || !sourceBaseKey) continue;

    const possibleTargets = targetRows.filter((targetRow) => {
      if (targetRow.id === sourceRow.id) return false;
      if (normalizeManualMatchEventKey(targetRow.eventLabelRaw) !== sourceEventKey) return false;
      if (String(targetRow.marketType || "") !== String(sourceRow.marketType || "")) return false;

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
  const marketType = String(row.marketType || "").toLowerCase();
  const selection = String(row.selectionNormalized || row.selectionRaw || "")
    .toLowerCase()
    .replace(/−/g, "-");

  if (marketType === "player_points") return "points";
  if (marketType === "player_assists") return "assists";
  if (marketType === "player_rebounds") return "rebounds";
  if (marketType === "player_threes") return "threes";
  if (marketType === "player_pra") return "pra";

  if (/\bpoints\b/.test(selection)) return "points";
  if (/\bassists\b/.test(selection)) return "assists";
  if (/\brebounds\b/.test(selection)) return "rebounds";
  if (/\bthrees\b|\b3\+ pointers\b|\bthree pointers\b|\bthrees made\b/.test(selection)) return "threes";
  if (/\bpts & rebs & asts\b|\bpra\b/.test(selection)) return "pra";

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

  // Key logic:
  // Prefer closest ladder ABOVE source (e.g. 4.5 → 5)
  if (targetVal >= sourceVal) {
    return targetVal - sourceVal;
  }

  // Penalize undershooting ladder (e.g. 4.5 → 4)
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