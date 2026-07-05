"use client";

const wrapStyle = {
  display: "grid",
  gap: 10,
  padding: 12,
  border: "2px solid #166534",
  borderRadius: 12,
  background: "#f0fdf4",
};

const rowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const selectStyle = {
  padding: "7px 10px",
  border: "1px solid #86efac",
  borderRadius: 8,
  background: "#fff",
  color: "#14532d",
  fontWeight: 800,
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
  border: "1px solid rgba(0,0,0,0.08)",
};

const pillColors = {
  green: { background: "#dcfce7", color: "#166534" },
  darkGreen: { background: "#166534", color: "#ecfdf5" },
  red: { background: "#fee2e2", color: "#991b1b" },
  orange: { background: "#ffedd5", color: "#9a3412" },
  yellow: { background: "#fef3c7", color: "#92400e" },
  blue: { background: "#dbeafe", color: "#1d4ed8" },
  purple: { background: "#f3e8ff", color: "#6b21a8" },
  gray: { background: "#f3f4f6", color: "#374151" },
};

function CountBadge({ children, color = "gray" }) {
  return (
    <span
      style={{
        minWidth: 22,
        padding: "2px 7px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 900,
        background: pillColors[color]?.color || "#374151",
        color: "#fff",
        display: "inline-flex",
        justifyContent: "center",
      }}
    >
      {children}
    </span>
  );
}

function FilterButton({ active, color = "gray", label, count, onClick }) {
  const activeColors = {
    green: { background: "#166534", color: "#ecfdf5", border: "#14532d" },
    red: { background: "#dc2626", color: "#fef2f2", border: "#991b1b" },
    orange: { background: "#ea580c", color: "#fff7ed", border: "#9a3412" },
    yellow: { background: "#ca8a04", color: "#fefce8", border: "#92400e" },
    blue: { background: "#2563eb", color: "#eff6ff", border: "#1d4ed8" },
    purple: { background: "#7c3aed", color: "#f5f3ff", border: "#6d28d9" },
    gray: { background: "#374151", color: "#f9fafb", border: "#1f2937" },
  };

  const inactive = pillColors[color] || pillColors.gray;
  const activeStyle = activeColors[color] || activeColors.gray;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...pillStyle,
        cursor: "pointer",
        background: active ? activeStyle.background : inactive.background,
        color: active ? activeStyle.color : inactive.color,
        border: `1px solid ${active ? activeStyle.border : "rgba(0,0,0,0.08)"}`,
      }}
    >
      {label}
      <CountBadge color={active ? "gray" : color}>{count || 0}</CountBadge>
    </button>
  );
}

function SummaryPill({ label, value, color = "gray" }) {
  return (
    <span
      style={{
        ...pillStyle,
        ...(pillColors[color] || pillColors.gray),
      }}
    >
      {label}: {value}
    </span>
  );
}

export default function FilterBar({
  tableMode,
  setTableMode,
  showReviewLaterOnly,
  setShowReviewLaterOnly,
  showLowConfidenceOnly,
  setShowLowConfidenceOnly,
  showLikelyParserIssuesOnly,
  setShowLikelyParserIssuesOnly,
  showNeedsReviewOnly,
  setShowNeedsReviewOnly,
  showHedgesOnly,
  setShowHedgesOnly,
  showGuaranteedProfitOnly,
  setShowGuaranteedProfitOnly,
  showHedgeCriticalOnly,
  setShowHedgeCriticalOnly,
  showArchivedRows,
  setShowArchivedRows,
  reviewMode,
  setReviewMode,
  smartReviewMode,
  setSmartReviewMode,
  counts,
}) {
  const reviewQueueCount = (counts?.needsReview || 0) + (counts?.reviewLater || 0);

  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <label style={{ fontWeight: 900, color: "#14532d" }}>
          View{" "}
          <select
            value={tableMode}
            onChange={(e) => setTableMode(e.target.value)}
            style={selectStyle}
          >
            <option value="debug">Debug</option>
            <option value="simplified">Simplified</option>
          </select>
        </label>

        <FilterButton
          active={reviewMode}
          color="green"
          label="Review Mode"
          count={reviewQueueCount}
          onClick={() => setReviewMode((v) => !v)}
        />

        <FilterButton
          active={showHedgeCriticalOnly}
          color="orange"
          label="Hedge-Critical"
          count={counts?.hedgeCritical || 0}
          onClick={() => setShowHedgeCriticalOnly((v) => !v)}
        />

        <button
          type="button"
          onClick={() => setSmartReviewMode((v) => !v)}
          style={{
            ...pillStyle,
            cursor: "pointer",
            background: smartReviewMode ? "#166534" : "#ffffff",
            color: smartReviewMode ? "#f0fdf4" : "#14532d",
            border: "1px solid #86efac",
          }}
        >
          Smart Review {smartReviewMode ? "On" : "Off"}
        </button>
      </div>

      <div style={rowStyle}>
        <FilterButton
          active={showNeedsReviewOnly}
          color="red"
          label="Needs Review"
          count={counts?.needsReview || 0}
          onClick={() => setShowNeedsReviewOnly((v) => !v)}
        />

        <FilterButton
          active={showHedgesOnly}
          color="blue"
          label="Hedges"
          count={counts?.hedges || 0}
          onClick={() => setShowHedgesOnly((v) => !v)}
        />

        <SummaryPill
          color="yellow"
          label="Payout Match"
          value={counts?.payoutMatchedHedges || 0}
        />

        <FilterButton
          active={showGuaranteedProfitOnly}
          color="green"
          label="Guaranteed Profit"
          count={counts?.guaranteedProfit || 0}
          onClick={() => setShowGuaranteedProfitOnly((v) => !v)}
        />

        <FilterButton
          active={showLikelyParserIssuesOnly}
          color="purple"
          label="Parser Issues"
          count={counts?.parserIssues || 0}
          onClick={() => setShowLikelyParserIssuesOnly((v) => !v)}
        />
      </div>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 800, color: "#14532d" }}>
          Advanced filters
        </summary>

        <div style={{ ...rowStyle, marginTop: 8 }}>
          <FilterButton
            active={showReviewLaterOnly}
            color="orange"
            label="Review Later"
            count={counts?.reviewLater || 0}
            onClick={() => setShowReviewLaterOnly((v) => !v)}
          />

          <FilterButton
            active={showLowConfidenceOnly}
            color="yellow"
            label="Low Confidence"
            count={counts?.lowConfidence || 0}
            onClick={() => setShowLowConfidenceOnly((v) => !v)}
          />

          <FilterButton
            active={showArchivedRows}
            color="gray"
            label="Archived"
            count={counts?.archived || 0}
            onClick={() => setShowArchivedRows((v) => !v)}
          />
        </div>
      </details>

      <div style={rowStyle}>
        <SummaryPill color="gray" label="Rows" value={counts?.total || 0} />
        <SummaryPill color="blue" label="Visible" value={counts?.visible || 0} />
        <SummaryPill
          color="green"
          label="Reviewed"
          value={`${counts?.reviewed || 0} / ${counts?.exportable || 0}`}
        />
        <SummaryPill color="gray" label="Selected" value={counts?.selected || 0} />
      </div>

      <div style={{ color: "#166534", fontWeight: 700, fontSize: 12 }}>
        Keyboard: W = win, L = loss, ↑/↓ = move rows
      </div>
    </div>
  );
}
