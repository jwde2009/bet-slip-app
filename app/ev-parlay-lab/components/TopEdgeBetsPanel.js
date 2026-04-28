"use client";
 
import Link from "next/link";
 
export default function TopEdgeBetsPanel({ bets = [] }) {
  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>5. Top Single-Edge Bets</h2>
 
      {bets.length === 0 ? (
        <div style={emptyStyle}>No positive single-bet edges found.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {bets.map((bet, idx) => (
            <div
              key={`${bet.marketId || "market"}_${bet.selectionId || "selection"}_${idx}`}
              style={cardStyle}
            >
              <div style={cardHeaderStyle}>
                <div>
                  <div style={singleBetHeadlineStyle}>
                    #{idx + 1} — {formatSingleBetSelection(bet)}
                  </div>
                  <div style={subtleStyle}>
                    {bet.eventName || "Unknown Event"} • {formatMarketLabel(bet.marketType, bet.sport)}
                  </div>
                </div>
 
                <div style={edgeBadgeStyle}>EV {formatPct(bet.evPct)}</div>
              </div>
 
              <div style={topEdgeActionRowStyle}>
                <Link href={buildToolsLink(bet)} style={toolsLinkStyle}>
                  Send to Tools
                </Link>
 
                <Link href={buildBoostTargetingLink(bet)} style={secondaryToolsLinkStyle}>
                  Use for Boost Targeting
                </Link>
              </div>
 
              <div style={metricsGridStyle}>
                <MetricCard
                  label="Best Target"
                  value={`${bet.targetSportsbook || "Target"} ${formatAmerican(bet.targetOddsAmerican)}`}
                />
                <MetricCard
                  label="Best Sharp"
                  value={`${bet.sharpSportsbook || "Sharp"} ${formatAmerican(bet.sharpOddsAmerican)}`}
                />
                <MetricCard label="Edge %" value={formatPct(bet.edgePct)} />
                <MetricCard label="Fair Prob" value={formatPct(bet.fairProbability)} />
                <MetricCard label="Fair Odds" value={formatAmerican(bet.fairAmerican)} />
                <MetricCard
                  label="Suggested Kelly Stake"
                  value={`$${Number(bet.suggestedKellyStake || 0).toFixed(2)}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
 
function formatSingleBetSelection(bet) {
  const marketLabel = formatMarketLabel(bet.marketType, bet.sport);
  const selection = String(bet.selectionLabel || "Selection");
  const subjectName = String(bet.subjectName || "").trim();
  const lineText = formatLineValue(bet.lineValue, {
    signed: bet.marketType === "spread",
  });
 
  if (subjectName) {
    return `${subjectName} ${selection}${lineText ? ` ${lineText}` : ""} ${marketLabel}`.trim();
  }
 
  if (bet.marketType === "spread") {
    return `${selection}${lineText ? ` ${lineText}` : ""}`.trim();
  }
 
  if (bet.marketType === "total") {
    return `${selection}${lineText ? ` ${lineText}` : ""}`.trim();
  }
 
  return `${selection}${lineText ? ` ${lineText}` : ""}`.trim();
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
    player_points_rebounds: "Points + Rebounds",
    player_points_assists: "Points + Assists",
    player_rebounds_assists: "Rebounds + Assists",
    double_double: "Double-Double",
    triple_double: "Triple-Double",
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
    pitcher_walks_allowed: "Walks Allowed",
    player_goals: "Goals",
    player_shots_on_goal: "Shots On Goal",
    player_saves: "Saves",
    player_power_play_points: "Power Play Points",
    player_blocked_shots: "Blocked Shots",
  };
 
  return labels[text] || text.replace(/_/g, " ");
}
 
function buildToolsLink(bet) {
  const formattedSelection = formatSingleBetSelection(bet);
 
  const row = `${bet.eventName || "Unknown Event"} — ${formattedSelection} | ${formatAmerican(
    bet.targetOddsAmerican
  )} | ${formatAmerican(bet.fairAmerican)}`;
 
  const params = new URLSearchParams();
  params.set("edgeRows", row);
  params.set("edgeMinPct", "0");
  params.set("singleOdds", formatAmerican(bet.targetOddsAmerican));
  params.set(
    "singleProb",
    Number.isFinite(bet.fairProbability) ? bet.fairProbability.toFixed(4) : ""
  );
  params.set(
    "singleStake",
    Number.isFinite(bet.suggestedKellyStake)
      ? Math.max(0, bet.suggestedKellyStake).toFixed(2)
      : "25"
  );
  params.set("singleBankroll", "6000");
  params.set("singleKellyFraction", "0.25");
  params.set("singleLabel", `${bet.eventName || "Unknown Event"} — ${formattedSelection}`);
 
  return `/tools?${params.toString()}`;
}
 
function buildBoostTargetingLink(bet) {
  const formattedSelection = formatSingleBetSelection(bet);
  const candidate = `${bet.eventName || "Unknown Event"} — ${formattedSelection} | ${formatAmerican(
    bet.targetOddsAmerican
  )} | ${Number.isFinite(bet.fairProbability) ? bet.fairProbability.toFixed(4) : ""}`;
 
  const params = new URLSearchParams();
  params.set("boostCandidates", candidate);
  params.set("boostPct", "30");
 
  return `/tools?${params.toString()}`;
}
 
function MetricCard({ label, value }) {
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
 
const h2Style = {
  marginTop: 0,
  marginBottom: 12,
};
 
const emptyStyle = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: 12,
  fontWeight: 800,
};
 
const cardStyle = {
  border: "1px solid #e5e7eb",
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
  marginBottom: 10,
};
 
const singleBetHeadlineStyle = {
  fontWeight: 900,
  fontSize: 16,
  color: "#111827",
};
 
const subtleStyle = {
  color: "#666",
  fontSize: 13,
};
 
const edgeBadgeStyle = {
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
};
 
const topEdgeActionRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
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
 
const secondaryToolsLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 8,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  textDecoration: "none",
  fontWeight: 700,
};
 
const metricsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
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
