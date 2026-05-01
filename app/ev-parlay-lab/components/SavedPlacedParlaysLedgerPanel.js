"use client";

import { useMemo, useState } from "react";

export default function SavedPlacedParlaysLedgerPanel({
  savedPlacedParlays = [],
  savedLegUsageMap,
  onClearSavedParlays,
  onDeleteSavedParlay,
  onUpdateSavedParlay,
  onConfirmSavedParlayPlaced,
  onSetSavedParlayResult,
  formatSavedDateTime,
}) {
  const [savedCollapsed, setSavedCollapsed] = useState(true);
  const [performanceCollapsed, setPerformanceCollapsed] = useState(true);

  const stats = useMemo(
    () => buildLedgerStats(savedPlacedParlays),
    [savedPlacedParlays]
  );

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0 }}>Saved / Placed Parlays</h3>
          <div style={subtleStyle}>
            Permanent ledger. Saved ideas do not count until Confirm Placed.
          </div>
        </div>

        <button
          type="button"
          onClick={() => onClearSavedParlays?.()}
          disabled={!savedPlacedParlays.length}
          style={{
            ...clearButtonStyle,
            opacity: savedPlacedParlays.length ? 1 : 0.55,
            cursor: savedPlacedParlays.length ? "pointer" : "not-allowed",
          }}
        >
          Clear Saved Parlays
        </button>
      </div>

      <div style={pnlSummaryStyle}>
        <div style={pnlMainStyle}>
          Net P&L: <span style={stats.netProfitLoss >= 0 ? profitStyle : lossStyle}>{formatMoney(stats.netProfitLoss)}</span>
        </div>

        <div style={summaryGridStyle}>
          <SummaryPill label="Placed" value={stats.placedCount} />
          <SummaryPill label="Pending" value={stats.pendingCount} />
          <SummaryPill label="Won" value={stats.wonCount} />
          <SummaryPill label="Lost" value={stats.lostCount} />
          <SummaryPill label="Total Staked" value={formatMoney(stats.totalStaked)} />
          <SummaryPill label="ROI" value={formatPct(stats.roi)} />
        </div>
      </div>

      <div style={toggleRowStyle}>
        <button type="button" onClick={() => setSavedCollapsed((prev) => !prev)} style={toggleButtonStyle}>
          {savedCollapsed ? "Show Saved Parlays" : "Hide Saved Parlays"}
        </button>

        <button type="button" onClick={() => setPerformanceCollapsed((prev) => !prev)} style={toggleButtonStyle}>
          {performanceCollapsed ? "Show Performance Summary" : "Hide Performance Summary"}
        </button>
      </div>

      {!performanceCollapsed ? (
        <div style={performanceBoxStyle}>
          <h4 style={miniHeaderStyle}>Performance Summary</h4>

          <div style={summaryGridStyle}>
            <SummaryPill label="Saved Ideas" value={stats.savedIdeaCount} />
            <SummaryPill label="Confirmed Placed" value={stats.placedCount} />
            <SummaryPill label="Settled" value={stats.settledCount} />
            <SummaryPill label="Push/Void" value={stats.pushVoidCount} />
          </div>

          <div style={performanceTableStyle}>
            <div style={performanceHeaderRowStyle}>
              <strong>Book</strong>
              <strong>Placed</strong>
              <strong>Net</strong>
              <strong>ROI</strong>
            </div>

            {stats.byBook.length ? (
              stats.byBook.map((book) => (
                <div key={book.book} style={performanceRowStyle}>
                  <span>{book.book}</span>
                  <span>{book.count}</span>
                  <span style={book.net >= 0 ? profitStyle : lossStyle}>{formatMoney(book.net)}</span>
                  <span>{formatPct(book.roi)}</span>
                </div>
              ))
            ) : (
              <div style={emptyStyle}>No confirmed placed parlays yet.</div>
            )}
          </div>
        </div>
      ) : null}

      {!savedCollapsed ? (
        savedPlacedParlays.length === 0 ? (
          <div style={emptyStyle}>No saved placed parlays yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {savedPlacedParlays.slice(0, 250).map((saved) => {
              const status = String(saved.status || "saved").toLowerCase();
              const isConfirmed = saved.confirmedPlaced === true || status !== "saved";
              const profitLoss = Number(saved.profitLoss || 0);

              return (
                <div key={saved.id} style={cardStyle}>
                  <div style={cardTopStyle}>
                    <div>
                      <div style={cardTitleStyle}>
                        {saved.gradeTier || "Saved"} / {saved.playLabel || "Placed Parlay"}{" "}
                        <span style={statusPillStyle(status)}>{status}</span>
                      </div>

                      <div style={subtleStyle}>
                        Saved {formatSavedDateTime ? formatSavedDateTime(saved.savedAt) : saved.savedAt}
                        {saved.boostName ? ` • Boost: ${saved.boostName}` : ""}
                      </div>
                    </div>

                    <button type="button" onClick={() => onDeleteSavedParlay?.(saved.id)} style={deleteButtonStyle}>
                      Delete
                    </button>
                  </div>

                  <div style={editGridStyle}>
                    <label style={labelStyle}>
                      Stake
                      <input
                        type="number"
                        value={saved.placedStake ?? ""}
                        onChange={(event) => onUpdateSavedParlay?.(saved.id, { placedStake: Number(event.target.value) })}
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      Placed Odds
                      <input
                        type="number"
                        value={saved.placedOddsAmerican ?? saved.boostedParlayAmerican ?? ""}
                        onChange={(event) => onUpdateSavedParlay?.(saved.id, { placedOddsAmerican: Number(event.target.value) })}
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      Placed Date
                      <input
                        type="date"
                        value={saved.placedDate || ""}
                        onChange={(event) => onUpdateSavedParlay?.(saved.id, { placedDate: event.target.value })}
                        style={inputStyle}
                      />
                    </label>

                    <div style={smallMetricStyle}>
                      <span>P&L</span>
                      <strong style={profitLoss >= 0 ? profitStyle : lossStyle}>{formatMoney(profitLoss)}</strong>
                    </div>
                  </div>

                  <div style={buttonRowStyle}>
                    {!isConfirmed ? (
                      <button type="button" onClick={() => onConfirmSavedParlayPlaced?.(saved.id)} style={confirmButtonStyle}>
                        Confirm Placed
                      </button>
                    ) : null}

                    <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "won")} style={winButtonStyle}>Won</button>
                    <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "lost")} style={lossButtonStyle}>Lost</button>
                    <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "push")} style={neutralButtonStyle}>Push</button>
                    <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "void")} style={neutralButtonStyle}>Void</button>
                    <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "placed")} style={neutralButtonStyle}>Back to Pending</button>
                  </div>

                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {(saved.legs || []).map((leg, idx) => (
                      <div key={`${saved.id}_${idx}`} style={legLineStyle}>
                        • {leg.eventName} — {formatSavedLeg(leg)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}

function SummaryPill({ label, value }) {
  return (
    <div style={summaryPillStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildLedgerStats(parlays = []) {
  const stats = {
    netProfitLoss: 0,
    totalStaked: 0,
    roi: null,
    placedCount: 0,
    pendingCount: 0,
    wonCount: 0,
    lostCount: 0,
    settledCount: 0,
    pushVoidCount: 0,
    savedIdeaCount: 0,
    byBook: [],
  };

  const byBook = new Map();

  for (const parlay of parlays || []) {
    const status = String(parlay.status || "saved").toLowerCase();
    const confirmed = parlay.confirmedPlaced === true || status !== "saved";

    if (!confirmed) {
      stats.savedIdeaCount += 1;
      continue;
    }

    stats.placedCount += 1;

    const stake = Number(parlay.placedStake || 0);
    const pnl = Number(parlay.profitLoss || 0);

    stats.totalStaked += Number.isFinite(stake) ? stake : 0;
    stats.netProfitLoss += Number.isFinite(pnl) ? pnl : 0;

    if (status === "placed" || status === "pending") stats.pendingCount += 1;
    if (status === "won") { stats.wonCount += 1; stats.settledCount += 1; }
    if (status === "lost") { stats.lostCount += 1; stats.settledCount += 1; }
    if (status === "push" || status === "void") { stats.pushVoidCount += 1; stats.settledCount += 1; }

    const book = parlay.boostSportsbook || parlay.legs?.[0]?.sportsbook || "Unknown";
    if (!byBook.has(book)) byBook.set(book, { book, count: 0, stake: 0, net: 0, roi: null });

    const bucket = byBook.get(book);
    bucket.count += 1;
    bucket.stake += Number.isFinite(stake) ? stake : 0;
    bucket.net += Number.isFinite(pnl) ? pnl : 0;
  }

  stats.roi = stats.totalStaked > 0 ? stats.netProfitLoss / stats.totalStaked : null;
  stats.byBook = Array.from(byBook.values())
    .map((item) => ({ ...item, roi: item.stake > 0 ? item.net / item.stake : null }))
    .sort((a, b) => b.net - a.net);

  return stats;
}

function formatMoney(value) {
  const n = Number(value || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

function formatPct(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatSavedLeg(leg) {
  const lineText = leg.lineValue !== null && leg.lineValue !== undefined && leg.lineValue !== "" ? ` ${leg.lineValue}` : "";
  const subject = String(leg.subjectName || "").trim();
  const selection = String(leg.selectionLabel || "").trim();
  return subject ? `${subject} ${selection}${lineText}` : `${selection}${lineText}`.trim();
}

const panelStyle = { border: "1px solid #d1d5db", borderRadius: 12, padding: 12, background: "#fff", marginTop: 16 };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" };
const subtleStyle = { color: "#6b7280", fontSize: 12 };
const pnlSummaryStyle = { marginTop: 10, border: "1px solid #bbf7d0", background: "#ecfdf5", borderRadius: 10, padding: 10 };
const pnlMainStyle = { fontSize: 18, fontWeight: 900, marginBottom: 8 };
const profitStyle = { color: "#166534" };
const lossStyle = { color: "#991b1b" };
const summaryGridStyle = { display: "flex", flexWrap: "wrap", gap: 8 };
const summaryPillStyle = { display: "inline-flex", gap: 6, alignItems: "center", border: "1px solid #d1d5db", background: "#fff", borderRadius: 999, padding: "5px 8px", fontSize: 12 };
const toggleRowStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, marginBottom: 10 };
const toggleButtonStyle = { border: "1px solid #bfdbfe", borderRadius: 999, padding: "6px 10px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" };
const clearButtonStyle = { border: "1px solid #fca5a5", borderRadius: 999, padding: "6px 10px", background: "#fff", color: "#991b1b", fontWeight: 900 };
const performanceBoxStyle = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#f8fafc", marginBottom: 10 };
const miniHeaderStyle = { margin: "0 0 8px" };
const performanceTableStyle = { display: "grid", gap: 4, marginTop: 10 };
const performanceHeaderRowStyle = { display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.8fr 0.6fr", gap: 8, fontSize: 12, color: "#374151" };
const performanceRowStyle = { display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.8fr 0.6fr", gap: 8, fontSize: 12, borderTop: "1px solid #e5e7eb", paddingTop: 4 };
const emptyStyle = { border: "1px dashed #d1d5db", borderRadius: 10, padding: 10, color: "#6b7280", background: "#f9fafb", fontWeight: 700 };
const cardStyle = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#f9fafb" };
const cardTopStyle = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" };
const cardTitleStyle = { fontWeight: 900, color: "#111827" };
function statusPillStyle(status) {
  const key = String(status || "saved").toLowerCase();
  const common = { borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 900, marginLeft: 6 };
  if (key === "won") return { ...common, border: "1px solid #86efac", background: "#dcfce7", color: "#166534" };
  if (key === "lost") return { ...common, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b" };
  if (key === "placed" || key === "pending") return { ...common, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" };
  if (key === "push" || key === "void") return { ...common, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#374151" };
  return { ...common, border: "1px solid #fbbf24", background: "#fffbeb", color: "#92400e" };
}
const editGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginTop: 10 };
const labelStyle = { display: "grid", gap: 3, fontSize: 11, fontWeight: 800, color: "#374151" };
const inputStyle = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 12 };
const smallMetricStyle = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "grid", gap: 3, background: "#fff", fontSize: 12 };
const buttonRowStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 };
const confirmButtonStyle = { border: "1px solid #86efac", background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "6px 10px", fontWeight: 900, cursor: "pointer" };
const winButtonStyle = { ...confirmButtonStyle };
const lossButtonStyle = { border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "6px 10px", fontWeight: 900, cursor: "pointer" };
const neutralButtonStyle = { border: "1px solid #d1d5db", background: "#fff", color: "#374151", borderRadius: 999, padding: "6px 10px", fontWeight: 900, cursor: "pointer" };
const deleteButtonStyle = { border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", borderRadius: 999, padding: "6px 10px", fontWeight: 900, cursor: "pointer" };
const legLineStyle = { color: "#374151", fontSize: 12, fontWeight: 700 };
