"use client";

import Link from "next/link";
import { useState } from "react";

export default function ParlayResults({
  parlays,
  counts,
  savedPlacedParlays = [],
  savedLegUsageMap,
  onSavePlacedParlay,
  onClearSavedParlays,
  onDeleteSavedParlay,
  formatSavedDateTime,
}) {  const [converterInput, setConverterInput] = useState("");
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
      <h2 style={h2Style}>7. Parlay Results</h2>

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
      Same-Sport Blocked: {counts.rejections.sameSportBlocked ?? 0}
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

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => onSavePlacedParlay?.(parlay)}
                      style={savePlacedButtonStyle}
                    >
                      Save Placed Parlay
                    </button>

                    <button type="button" onClick={() => toggleParlay(parlay.id)} style={toggleButtonStyle}>
                      {isCollapsed ? "Show" : "Hide"}
                    </button>
                  </div>
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
                            • {leg.eventName} — {formatLegSelection(leg)}
                            {getSavedLegUsage(leg, savedLegUsageMap)?.count ? (
                              <span style={usedLegBadgeStyle}>
                                Used {getSavedLegUsage(leg, savedLegUsageMap).count}x
                              </span>
                            ) : null}
                          </div>
                          <div style={legBreakdownMetaStyle}>
                            Target {formatAmerican(leg.oddsAmerican)} at {leg.sportsbook}
                            {" "}• Sharp {formatAmerican(leg.sharpOddsAmerican)} at {leg.sharpSportsbook || "sharp source"}
                            {" "}• Fair {formatAmerican(leg.fairAmerican)}
                            {" "}• Leg EV{" "}
                            <span
                              style={
                                Number(leg.legEvPct) >= 0
                                  ? legBreakdownEvStyle
                                  : legBreakdownEvNegativeStyle
                              }
                            >
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
                      <MetricRow label="Boosted EV %" value={formatPct(parlay.expectedValuePct)} />
                      <MetricRow label="Raw EV %" value={formatPct(parlay.rawExpectedValuePct)} />
                      <MetricRow label="Avg Leg EV %" value={formatPct(parlay.averageLegEvPct)} />
                      <MetricRow label="Expected $" value={`$${(parlay.expectedProfitAtStake ?? 0).toFixed(2)}`} />
                      <MetricRow label="Grade" value={`${parlay.gradeTier} / ${parlay.playLabel}`} />
                      <MetricRow
                        label="Boosted Kelly"
                        value={`$${Number(parlay.boostedSuggestedKellyStake ?? parlay.suggestedKellyStake ?? 0).toFixed(2)}`}
                      />
                      <MetricRow
                        label="Raw Kelly"
                        value={`$${Number(parlay.rawSuggestedKellyStake ?? 0).toFixed(2)}`}
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

      <div style={savedParlaysPanelStyle}>
        <div style={savedParlaysHeaderStyle}>
          <div>
            <h3 style={{ margin: 0 }}>Saved / Placed Parlays</h3>
            <div style={savedParlaysSubtleStyle}>
              Saved parlays persist across refreshes so you can avoid repeating legs later today or tomorrow.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClearSavedParlays?.()}
            disabled={!savedPlacedParlays.length}
            style={{
              ...clearSavedButtonStyle,
              opacity: savedPlacedParlays.length ? 1 : 0.55,
              cursor: savedPlacedParlays.length ? "pointer" : "not-allowed",
            }}
          >
            Clear Saved Parlays
          </button>
        </div>

        {savedPlacedParlays.length === 0 ? (
          <div style={savedParlaysEmptyStyle}>
            No saved placed parlays yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {savedPlacedParlays.slice(0, 20).map((saved) => (
              <div key={saved.id} style={savedParlayCardStyle}>
                <div style={savedParlayTopRowStyle}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {saved.gradeTier || "Saved"} / {saved.playLabel || "Placed Parlay"}
                      {" "}• {formatAmerican(saved.boostedParlayAmerican)}
                    </div>
                    <div style={savedParlaysSubtleStyle}>
                      Saved {formatSavedDateTime ? formatSavedDateTime(saved.savedAt) : saved.savedAt}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteSavedParlay?.(saved.id)}
                    style={deleteSavedButtonStyle}
                  >
                    Delete
                  </button>
                </div>

                <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                  {(saved.legs || []).map((leg, idx) => (
                    <div key={`${saved.id}_${idx}`} style={savedLegLineStyle}>
                      • {leg.eventName} — {formatSavedLeg(leg)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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

function getSavedLegUsage(leg, usageMap) {
  if (!usageMap) return null;

  const key = leg.savedLegKey || buildSavedLegKeyFromLeg(leg);
  if (typeof usageMap.get === "function") return usageMap.get(key) || null;
  return usageMap[key] || null;
}

function formatSavedLeg(leg) {
  const lineText =
    leg.lineValue !== null && leg.lineValue !== undefined && leg.lineValue !== ""
      ? ` ${leg.lineValue}`
      : "";

  const subject = String(leg.subjectName || "").trim();
  const selection = String(leg.selectionLabel || "").trim();

  if (subject) {
    return `${subject} ${selection}${lineText} (${formatMarketLabel(leg.marketType, leg.sport)})`;
  }

  return `${selection}${lineText} (${formatMarketLabel(leg.marketType, leg.sport)})`;
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
      const lineSuffix =
        leg.lineValue !== null && leg.lineValue !== undefined ? ` ${leg.lineValue}` : "";
      if (eventName && selectionLabel) return `${eventName} — ${selectionLabel}${lineSuffix}`;
      return `${selectionLabel || eventName || ""}${lineSuffix}`.trim();
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

function formatLegSelection(leg) {
  const marketLabel = formatMarketLabel(leg.marketType, leg.sport);
  const selection = String(leg.selectionLabel || "Selection");
  const subjectName = String(leg.subjectName || "").trim();
  const lineText = formatLineValue(leg.lineValue, {
    signed: leg.marketType === "spread",
  });

  if (subjectName) {
    return `${subjectName} ${selection}${lineText ? ` ${lineText}` : ""} ${marketLabel}`.trim();
  }

  if (leg.marketType === "spread") {
    return `${selection}${lineText ? ` ${lineText}` : ""}`;
  }

  if (leg.marketType === "total") {
    return `${selection}${lineText ? ` ${lineText}` : ""}`;
  }

  return `${selection}${lineText ? ` ${lineText}` : ""}`;
}

function formatLineValue(value, { signed = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "";
  }

  const n = Number(value);
  return signed && n > 0 ? `+${n}` : `${n}`;
}

function formatMarketLabel(value, sport = "") {
  const text = String(value || "");
  const sportKey = String(sport || "").trim().toUpperCase();

  if (text === "spread" && sportKey === "MLB") return "Run Line";
  if (text === "spread") return "Spread";
  if (text === "total" && sportKey === "MLB") return "Total Runs";
  if (text === "total") return "Total";

  const labels = {
    moneyline_2way: "Moneyline",
    moneyline_3way: "3-Way Moneyline",
    player_points: "Points",
    player_assists: "Assists",
    player_rebounds: "Rebounds",
    player_threes: "Threes",
    player_pra: "PRA",
    player_home_runs: "Home Runs",
    player_total_bases: "Total Bases",
    player_hits: "Hits",
    player_rbis: "RBIs",
    player_runs: "Runs",
    player_singles: "Singles",
    player_doubles: "Doubles",
    player_walks: "Walks",
    player_hits_runs_rbis: "Hits + Runs + RBIs",
    pitcher_strikeouts: "Pitcher Strikeouts",
    pitcher_outs_recorded: "Pitcher Outs",
    pitcher_hits_allowed: "Hits Allowed",
    pitcher_earned_runs_allowed: "Earned Runs Allowed",
    player_goals: "Goals",
    player_shots_on_goal: "Shots On Goal",
    player_saves: "Saves",
    player_power_play_points: "Power Play Points",
    player_blocked_shots: "Blocked Shots",
  };

  return labels[text] || text.replace(/_/g, " ");
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

const legBreakdownEvNegativeStyle = {
  fontWeight: 800,
  color: "#b45309",
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

const savePlacedButtonStyle = {
  border: "1px solid #86efac",
  background: "#166534",
  color: "#f0fdf4",
  borderRadius: 8,
  padding: "8px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const usedLegBadgeStyle = {
  display: "inline-block",
  marginLeft: 8,
  padding: "2px 7px",
  borderRadius: 999,
  background: "#fef3c7",
  border: "1px solid #f59e0b",
  color: "#92400e",
  fontSize: 11,
  fontWeight: 900,
};

const savedParlaysPanelStyle = {
  marginTop: 16,
  borderTop: "1px solid #e5e7eb",
  paddingTop: 14,
};

const savedParlaysHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
};

const savedParlaysSubtleStyle = {
  color: "#666",
  fontSize: 12,
};

const clearSavedButtonStyle = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 8,
  padding: "8px 10px",
  fontWeight: 800,
};

const savedParlaysEmptyStyle = {
  border: "1px dashed #d1d5db",
  background: "#f9fafb",
  borderRadius: 10,
  padding: 10,
  color: "#666",
  fontWeight: 700,
};

const savedParlayCardStyle = {
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  borderRadius: 10,
  padding: 10,
};

const savedParlayTopRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const deleteSavedButtonStyle = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#991b1b",
  borderRadius: 8,
  padding: "6px 8px",
  fontWeight: 800,
  cursor: "pointer",
};

const savedLegLineStyle = {
  fontSize: 12,
  color: "#374151",
  lineHeight: 1.35,
};
