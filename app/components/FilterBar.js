"use client";

const wrapStyle = {
  display: "grid",
  gap: 12,
  padding: 12,
  border: "2px solid #166534",
  borderRadius: 12,
  background: "#f0fdf4",
  minHeight: 160,
  alignContent: "center",
};

const rowStyle = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "center",
};

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
  color: "#14532d",
  fontSize: 14,
};

const selectStyle = {
  padding: "7px 10px",
  border: "1px solid #86efac",
  borderRadius: 8,
  background: "#fff",
  color: "#14532d",
  fontWeight: 700,
};

const basePillStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 26,
  padding: "3px 8px",
  marginLeft: 6,
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  lineHeight: 1,
};

const pillStyles = {
  green: {
    ...basePillStyle,
    background: "#166534",
    color: "#ecfdf5",
  },
  red: {
    ...basePillStyle,
    background: "#dc2626",
    color: "#fef2f2",
  },
  yellow: {
    ...basePillStyle,
    background: "#ca8a04",
    color: "#fefce8",
  },
  orange: {
    ...basePillStyle,
    background: "#ea580c",
    color: "#fff7ed",
  },
  blue: {
    ...basePillStyle,
    background: "#2563eb",
    color: "#eff6ff",
  },
  gray: {
    ...basePillStyle,
    background: "#374151",
    color: "#f9fafb",
  },
};

const summaryPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: 800,
  fontSize: 13,
  border: "1px solid #86efac",
};

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
  showArchivedRows,
  setShowArchivedRows,
  reviewMode,
  setReviewMode,
  counts,
}) {
  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={reviewMode}
            onChange={(e) => setReviewMode(e.target.checked)}
          />
          <span>Review Mode</span>
          <span style={pillStyles.green}>
            {(counts?.needsReview || 0) + (counts?.reviewLater || 0)}
          </span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showNeedsReviewOnly}
            onChange={(e) => setShowNeedsReviewOnly(e.target.checked)}
          />
          <span>Needs Review</span>
          <span style={pillStyles.red}>{counts?.needsReview || 0}</span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showReviewLaterOnly}
            onChange={(e) => setShowReviewLaterOnly(e.target.checked)}
          />
          <span>Review Later</span>
          <span style={pillStyles.orange}>{counts?.reviewLater || 0}</span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showLowConfidenceOnly}
            onChange={(e) => setShowLowConfidenceOnly(e.target.checked)}
          />
          <span>Low Confidence</span>
          <span style={pillStyles.yellow}>{counts?.lowConfidence || 0}</span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showLikelyParserIssuesOnly}
            onChange={(e) => setShowLikelyParserIssuesOnly(e.target.checked)}
          />
          <span>Parser Issues</span>
          <span style={pillStyles.blue}>{counts?.parserIssues || 0}</span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showArchivedRows}
            onChange={(e) => setShowArchivedRows(e.target.checked)}
          />
          <span>Archived</span>
          <span style={pillStyles.gray}>{counts?.archived || 0}</span>
        </label>
      </div>

            <div style={rowStyle}>
        <label style={{ ...checkboxLabelStyle, gap: 10 }}>
          View
          <select
            value={tableMode}
            onChange={(e) => setTableMode(e.target.value)}
            style={selectStyle}
          >
            <option value="debug">Debug</option>
            <option value="simplified">Simplified</option>
          </select>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showHedgesOnly}
            onChange={(e) => setShowHedgesOnly(e.target.checked)}
          />
          <span>Hedges Only</span>
          <span style={pillStyles.blue}>{counts?.hedges || 0}</span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={showGuaranteedProfitOnly}
            onChange={(e) => setShowGuaranteedProfitOnly(e.target.checked)}
          />
          <span>Guaranteed Profit</span>
          <span style={pillStyles.green}>{counts?.guaranteedProfit || 0}</span>
        </label>

        <span style={pillStyles.green}>
          {counts.reviewed} / {counts.exportable} Reviewed
        </span>

        <span style={pillStyles.green}>Rows: {counts.total}</span>
        <span style={pillStyles.blue}>Visible: {counts.visible}</span>
        <span style={pillStyles.red}>Needs Review: {counts.needsReview}</span>
        <span style={pillStyles.gray}>Selected: {counts.selected}</span>
      </div>

      <div style={{ color: "#166534", fontWeight: 700, fontSize: 13 }}>
        Keyboard: W = win, L = loss, ↑/↓ = move rows
      </div>
    </div>
  );
}