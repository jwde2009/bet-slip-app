"use client";

import Link from "next/link";
import { useState } from "react";

export default function ParlayResults({ parlays, counts }) {
  const [converterInput, setConverterInput] = useState("");
const [converterResult, setConverterResult] = useState(null);
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

    <div style={countsRowStyle}>
  <span style={countPillStyle}>
    Eligible Markets: {counts?.eligibleMarkets ?? 0}
  </span>
  <span style={countPillStyle}>
    Eligible Legs: {counts?.eligibleLegs ?? 0}
  </span>
  <span style={countPillStyle}>
    Generated Combos: {counts?.generatedCombos ?? 0}
  </span>
</div>

{counts?.rejections ? (
  <div style={rejectionsRowStyle}>
    <span style={rejectionPillStyle}>
      No Fair Odds: {counts.rejections.noFairOdds ?? 0}
    </span>
    <span style={rejectionPillStyle}>
      No Target Quote: {counts.rejections.noTargetQuote ?? 0}
    </span>
    <span style={rejectionPillStyle}>
      Below Leg Threshold: {counts.rejections.belowLegThreshold ?? 0}
    </span>
    <span style={rejectionPillStyle}>
      Same-Game Blocked: {counts.rejections.sameGameBlocked ?? 0}
    </span>
    <span style={rejectionPillStyle}>
      Repeats Blocked: {counts.rejections.repeatsBlocked ?? 0}
    </span>
    <span style={rejectionPillStyle}>
      Non-Positive EV: {counts.rejections.nonPositiveParlayEv ?? 0}
    </span>
  </div>
) : null}

      <div style={converterBlockStyle}>
      <div style={converterLabelStyle}>Odds Converter</div>
      <div style={converterWrapStyle}>
    <input
      value={converterInput}
      onChange={(e) => {
        const val = e.target.value;
        setConverterInput(val);
        setConverterResult(convertOdds(val));
      }}
      placeholder="+150 or 2.50"
      style={converterInputStyle}
    />

    <div style={converterResultStyle}>
      {converterResult ? (
        converterResult.type === "american_to_decimal" ? (
          <>Decimal: {converterResult.decimal.toFixed(3)}</>
        ) : (
          <>American: {formatAmerican(converterResult.american)}</>
        )
      ) : (
        "—"
      )}
    </div>
  </div>
</div>
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
                    <div style={parlayActionRowStyle}>
                      <Link
                        href={buildToolsLink(parlay)}
                        style={toolsLinkStyle}
                      >
                        Open in Tools
                      </Link>
                    </div>

                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {parlay.legs?.map((leg, legIdx) => (
                        <div key={`${parlay.id}_${legIdx}`} style={legBreakdownRowStyle}>
                          <div style={{ fontWeight: 700 }}>
                            • {leg.eventName} — {leg.selectionLabel}
                          </div>
                          <div style={legBreakdownMetaStyle}>
                            {formatAmerican(leg.oddsAmerican)} at {leg.sportsbook} • Leg EV{" "}
                            <span style={legBreakdownEvStyle}>
                              {formatPct(leg.legEvPct)}
                            </span>
                          </div>
                        </div>
                      )) || null}
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

function buildToolsLink(parlay) {
  const legs = (parlay?.legs || [])
    .map((leg) => formatAmerican(leg.oddsAmerican))
    .filter((value) => value && value !== "—")
    .join(", ");

  const fairProbs = (parlay?.legs || [])
    .map((leg) =>
      Number.isFinite(leg.fairProbability) ? leg.fairProbability.toFixed(4) : ""
    )
    .filter(Boolean)
    .join(", ");

  const labels = (parlay?.legs || [])
    .map((leg) => {
      const eventName = String(leg.eventName || "").trim();
      const selectionLabel = String(leg.selectionLabel || "").trim();
      if (eventName && selectionLabel) return `${eventName} — ${selectionLabel}`;
      return selectionLabel || eventName || "";
    })
    .filter(Boolean)
    .join(" || ");

  const boost = Number.isFinite(parlay?.boostPctUsed)
    ? String(parlay.boostPctUsed)
    : "";

  const params = new URLSearchParams();

  if (legs) params.set("legs", legs);
  if (boost) params.set("boost", boost);
  if (fairProbs) params.set("probs", fairProbs);
  if (labels) params.set("labels", labels);

  return `/tools?${params.toString()}`;
}

function MetricRow({ label, value }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function convertOdds(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  // American → Decimal
  if (/^[+-]\d+/.test(text)) {
    const american = Number(text);
    if (!Number.isFinite(american)) return null;

    const decimal =
      american > 0
        ? 1 + american / 100
        : 1 + 100 / Math.abs(american);

    return {
      type: "american_to_decimal",
      american,
      decimal,
    };
  }

  // Decimal → American
  if (/^\d+(\.\d+)?$/.test(text)) {
    const decimal = Number(text);
    if (!Number.isFinite(decimal) || decimal <= 1) return null;

    const american =
      decimal >= 2
        ? (decimal - 1) * 100
        : -100 / (decimal - 1);

    return {
      type: "decimal_to_american",
      decimal,
      american,
    };
  }

  return null;
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

const parlayActionRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 8,
};

const toolsLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 8,
  background: "#fff",
  color: "#166534",
  border: "1px solid #86efac",
  textDecoration: "none",
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

const legBreakdownRowStyle = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
};

const legBreakdownMetaStyle = {
  marginTop: 4,
  fontSize: 13,
  color: "#4b5563",
};

const legBreakdownEvStyle = {
  fontWeight: 800,
  color: "#166534",
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

const converterBlockStyle = {
  marginBottom: 12,
};

const converterLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#6b7280",
  marginBottom: 6,
  textTransform: "uppercase",
};

const converterWrapStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  marginBottom: 12,
  flexWrap: "wrap",
};

const converterInputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  minWidth: 140,
  fontWeight: 700,
};

const converterResultStyle = {
  fontWeight: 800,
  fontSize: 14,
  color: "#111827",
};

const emptyWarningStyle = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: 12,
  fontWeight: 800,
};
const countsRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const countPillStyle = {
  background: "#f3f4f6",
  color: "#374151",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const rejectionsRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const rejectionPillStyle = {
  background: "#fff7ed",
  color: "#9a3412",
  border: "1px solid #fdba74",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
};