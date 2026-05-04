"use client";

import { useMemo } from "react";

const STALE_DEFAULT_MINUTES = 15;

export default function SessionReadinessPanel({
  rows = [],
  filters = {},
  activeBoost = null,
  coverageWarnings = [],
  onDeleteStaleRows,
}) {
  const summary = useMemo(
    () => buildReadinessSummary({ rows, filters, activeBoost, coverageWarnings }),
    [rows, filters, activeBoost, coverageWarnings]
  );

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>Session Checklist</h2>
          <div style={subtleStyle}>
            Use this before trusting parlay results. It checks sharp source, target book, active boost, missing markets, and stale rows.
          </div>
        </div>

        <div style={overallBadgeStyle(summary.ready)}>
          {summary.ready ? "Ready to Search" : "Needs Review"}
        </div>
      </div>

      {activeBoost ? (
        <div style={activeBoostStyle}>
          <div style={activeBoostTitleStyle}>Active Boost</div>
          <div style={activeBoostNameStyle}>{activeBoost.name || "Saved boost"}</div>
          <div style={activeBoostMetaStyle}>
            {activeBoost.league || filters.selectedSport || "Sport"} • {activeBoost.sportsbookLabel || activeBoost.sportsbook || filters.selectedTargetBook || "Book"}
            {activeBoost.boostPct ? ` • ${activeBoost.boostPct}%` : ""}
            {activeBoost.minLegs ? ` • ${activeBoost.minLegs}+ legs` : ""}
            {activeBoost.minTotalAmericanOdds ? ` • min ${formatAmerican(activeBoost.minTotalAmericanOdds)}` : ""}
            {activeBoost.maxStake ? ` • max $${Number(activeBoost.maxStake).toFixed(2)}` : ""}
            {activeBoost.isSgp ? " • SGP" : ""}
          </div>
        </div>
      ) : null}

      <div style={checkGridStyle}>
        <ChecklistItem ok={summary.hasSharp} label="Sharp odds loaded" detail={summary.sharpBooksLabel} />
        <ChecklistItem ok={summary.hasTarget} label="Target book loaded" detail={summary.targetBookLabel} />
        <ChecklistItem ok={!!activeBoost} label="Boost loaded" detail={activeBoost ? activeBoost.name : "No active boost"} />
        <ChecklistItem ok={!summary.warningCount} label="Coverage warnings" detail={`${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}`} />
        <ChecklistItem ok={!summary.staleRows.length} label="Stale rows" detail={`${summary.staleRows.length} row${summary.staleRows.length === 1 ? "" : "s"} older than ${summary.staleMinutes} min`} />
      </div>

      {summary.staleRows.length ? (
        <div style={staleBoxStyle}>
          <div style={staleTitleStyle}>Stale odds warning</div>
          <div style={staleTextStyle}>
            Some rows are older than {summary.staleMinutes} minutes. This can mix stale target prices with fresh sharp odds.
          </div>
          <button
            type="button"
            onClick={() => onDeleteStaleRows?.(summary.staleMinutes)}
            style={dangerButtonStyle}
          >
            Delete stale rows older than {summary.staleMinutes} min
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ChecklistItem({ ok, label, detail }) {
  return (
    <div style={checkItemStyle(ok)}>
      <div style={checkIconStyle(ok)}>{ok ? "✓" : "!"}</div>
      <div>
        <div style={checkLabelStyle}>{label}</div>
        <div style={checkDetailStyle}>{detail || "—"}</div>
      </div>
    </div>
  );
}

function buildReadinessSummary({ rows = [], filters = {}, activeBoost = null, coverageWarnings = [] }) {
  const sharpBooks = new Set();
  const targetBooks = new Set();
  const selectedTargetBook = String(filters.selectedTargetBook || "ALL").trim();

  for (const row of rows || []) {
    if (row?.excluded) continue;

    const book = String(row.sportsbook || row.bookmaker || "").trim();
    if (!book) continue;

    const isSharp = row.isSharpSource === true || String(row.batchRole || "").toLowerCase() === "fair_odds";
    const isTarget = row.isTargetBook === true || String(row.batchRole || "").toLowerCase() === "target";

    if (isSharp) sharpBooks.add(book);
    if (isTarget) targetBooks.add(book);
  }

  const staleMinutes = Number.isFinite(Number(filters.staleWarningMinutes))
    ? Math.max(1, Number(filters.staleWarningMinutes))
    : STALE_DEFAULT_MINUTES;

  const staleRows = getStaleRows(rows, staleMinutes);

  const targetBookLabel = selectedTargetBook === "ALL"
    ? `${targetBooks.size} target book${targetBooks.size === 1 ? "" : "s"}`
    : selectedTargetBook;

  const hasTarget = selectedTargetBook === "ALL"
    ? targetBooks.size > 0
    : Array.from(targetBooks).some((book) => book.toLowerCase() === selectedTargetBook.toLowerCase());

  const warningCount = Array.isArray(coverageWarnings) ? coverageWarnings.length : 0;

  return {
    ready: sharpBooks.size > 0 && hasTarget && !!activeBoost && warningCount === 0 && staleRows.length === 0,
    hasSharp: sharpBooks.size > 0,
    hasTarget,
    sharpBooksLabel: sharpBooks.size ? Array.from(sharpBooks).sort().join(" & ") : "No sharp book loaded",
    targetBookLabel,
    warningCount,
    staleRows,
    staleMinutes,
  };
}

function getStaleRows(rows = [], staleMinutes = STALE_DEFAULT_MINUTES) {
  const cutoff = Date.now() - staleMinutes * 60 * 1000;

  return (rows || []).filter((row) => {
    const loadedAt = row.loadedAt || row.parsedAt || row.importedAt || row.createdAt || "";
    if (!loadedAt) return false;

    const time = new Date(loadedAt).getTime();
    if (!Number.isFinite(time)) return false;

    return time < cutoff;
  });
}

function formatAmerican(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`;
}

const sectionStyle = {
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  padding: 14,
  marginBottom: 16,
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const h2Style = { margin: 0, fontSize: 18 };
const subtleStyle = { color: "#64748b", fontSize: 12, marginTop: 4, fontWeight: 700 };

function overallBadgeStyle(ready) {
  return {
    border: ready ? "1px solid #86efac" : "1px solid #fbbf24",
    background: ready ? "#dcfce7" : "#fffbeb",
    color: ready ? "#166534" : "#92400e",
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 900,
  };
}

const activeBoostStyle = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  borderRadius: 12,
  padding: 10,
  marginBottom: 12,
};
const activeBoostTitleStyle = { color: "#1d4ed8", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const activeBoostNameStyle = { color: "#1e3a8a", fontSize: 16, fontWeight: 900, marginTop: 2 };
const activeBoostMetaStyle = { color: "#475569", fontSize: 12, fontWeight: 800, marginTop: 3 };

const checkGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 };
function checkItemStyle(ok) {
  return {
    display: "flex",
    gap: 8,
    alignItems: "center",
    border: ok ? "1px solid #bbf7d0" : "1px solid #fed7aa",
    background: ok ? "#f0fdf4" : "#fff7ed",
    borderRadius: 10,
    padding: 9,
  };
}
function checkIconStyle(ok) {
  return {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: ok ? "#16a34a" : "#f97316",
    color: "#fff",
    fontWeight: 900,
    flex: "0 0 auto",
  };
}
const checkLabelStyle = { fontSize: 12, fontWeight: 900, color: "#0f172a" };
const checkDetailStyle = { fontSize: 11, fontWeight: 800, color: "#64748b", marginTop: 1 };

const staleBoxStyle = { marginTop: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: 10 };
const staleTitleStyle = { fontSize: 13, fontWeight: 900 };
const staleTextStyle = { fontSize: 12, fontWeight: 700, marginTop: 3, marginBottom: 8 };
const dangerButtonStyle = { border: "1px solid #fca5a5", borderRadius: 999, padding: "6px 10px", background: "#fff", color: "#991b1b", fontWeight: 900, cursor: "pointer" };