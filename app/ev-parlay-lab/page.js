"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import ImportPanel from "./components/ImportPanel";
import ExtractionGuide from "./components/ExtractionGuide";
import ParsedOddsTable from "./components/ParsedOddsTable";
import MarketMatchPanel from "./components/MarketMatchPanel";
import FairOddsPanel from "./components/FairOddsPanel";
import ParlayFilters from "./components/ParlayFilters";
import ParlayResults from "./components/ParlayResults";

import { SAMPLE_RAW_TEXT, SAMPLE_FILTERS } from "./data/sampleData";
import { parseOddsText } from "./utils/parseOddsText";
import { normalizeParsedRows } from "./utils/normalizeTeams";
import { buildCanonicalMarkets } from "./utils/matchMarkets";
import { calculateFairOddsForMarkets } from "./utils/fairOdds";
import { buildParlayCandidates } from "./utils/parlayEngine";

export default function EVParlayLabPage() {
  const [rawText, setRawText] = useState(SAMPLE_RAW_TEXT);
  const [sportsbook, setSportsbook] = useState("DraftKings");
  const [batchRole, setBatchRole] = useState("target");
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(SAMPLE_FILTERS);
  const [lastParsedAt, setLastParsedAt] = useState(null);

  function handleParse() {
    const parsed = parseOddsText(rawText, {
      sportsbook,
      sourceType: "pasted_text",
    });

    console.log("HANDLE PARSE PARSED", parsed);

    console.log("HANDLE PARSE RESULT", { sportsbook, batchRole, parsed });

    const withBatchRole = applyBatchRoleToRows(parsed, {
      sportsbook,
      batchRole,
    });

    const normalized = normalizeParsedRows(parsed);
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
    setLastParsedAt(null);
  }

  function handleUpdateRow(rowId, patch) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch, userEdited: true } : row))
    );
  }

  function handleDeleteRow(rowId) {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
  }

  const marketBundle = useMemo(() => buildCanonicalMarkets(rows), [rows]);

  const fairOddsBundle = useMemo(() => {
    return calculateFairOddsForMarkets(marketBundle.markets, rows);
  }, [marketBundle.markets, rows]);

  const parlayCandidates = useMemo(() => {
    return buildParlayCandidates({
      rows,
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
      filters,
    });
  }, [rows, marketBundle.markets, fairOddsBundle, filters]);

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

        <ParsedOddsTable
          rows={rows}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={handleDeleteRow}
        />

        <MarketMatchPanel
          markets={marketBundle.markets}
          unmatchedRows={marketBundle.unmatchedRows}
        />

        <FairOddsPanel fairOddsResults={fairOddsBundle} />

        <ParlayFilters filters={filters} setFilters={setFilters} />

        <ParlayResults parlays={parlayCandidates} />
      </div>
    </div>
  );
}