"use client";

import { useState } from "react";

export default function ParlayResults({ parlays }) {
  const [collapsedMap, setCollapsedMap] = useState({});

  function toggleParlay(id) {
    setCollapsedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>6. Parlay Results</h2>

      {parlays.length === 0 ? (
        <div style={emptyWarningStyle}>
          No positive EV parlays found with available odds.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {parlays.map((parlay, idx) => {
            const isCollapsed = !!collapsedMap[parlay.id];

            return (
              <div key={parlay.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      Candidate #{idx + 1} — {parlay.gradeTier} / {parlay.playLabel}
                    </div>
                    <div style={subtleStyle}>
                      EV {formatPct(parlay.expectedValuePct)} • Boosted {formatAmerican(parlay.boostedParlayAmerican)}
                    </div>
                  </div>

                  <button type="button" onClick={() => toggleParlay(parlay.id)} style={toggleButtonStyle}>
                    {isCollapsed ? "Show" : "Hide"}
                  </button>
                </div>

                {!isCollapsed && (
                  <>
                    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                      {parlay.legDescriptions.map((leg) => (
                        <div key={leg}>• {leg}</div>
                      ))}
                    </div>

                    <div style={metricsGridStyle}>
                      <MetricRow label="Raw Odds" value={formatAmerican(parlay.rawParlayAmerican)} />
                      <MetricRow label="Boosted Odds" value={formatAmerican(parlay.boostedParlayAmerican)} />
                                            <MetricRow label="Fair Hit %" value={formatPct(parlay.fairHitProbability)} />
                      <MetricRow label="EV %" value={formatPct(parlay.expectedValuePct)} />
                      <MetricRow label="Expected $" value={`$${(parlay.expectedProfitAtStake ?? 0).toFixed(2)}`} />
                      <MetricRow label="Grade" value={`${parlay.gradeTier} / ${parlay.playLabel}`} />
                      <MetricRow
                        label="Kelly Stake"
                        value={`$${(parlay.suggestedKellyStake ?? 0).toFixed(2)}`}
                      />
                    </div>

                    {parlay.notes?.length ? (
                      <div style={notesWrapStyle}>
                        {parlay.notes.map((note) => (
                          <span key={note} style={notePillStyle}>
                            {note}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MetricRow({ label, value }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function formatAmerican(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function formatPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

const sectionStyle = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const h2Style = { marginTop: 0, marginBottom: 8 };
const subtleStyle = { color: "#666", fontSize: 13 };

const cardStyle = {
  border: "1px solid #e6e6e6",
  borderRadius: 10,
  padding: 12,
  background: "#fafafa",
};

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const toggleButtonStyle = {
  background: "#166534",
  color: "#f0fdf4",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const metricsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const metricCardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
};

const metricLabelStyle = {
  fontSize: 12,
  color: "#6b7280",
  fontWeight: 700,
  marginBottom: 4,
  textTransform: "uppercase",
};

const metricValueStyle = {
  fontSize: 15,
  color: "#111827",
  fontWeight: 800,
};

const notesWrapStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
};

const notePillStyle = {
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const emptyWarningStyle = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: 12,
  fontWeight: 800,
};