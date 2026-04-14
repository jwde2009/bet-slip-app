"use client";

const SPORTSBOOK_OPTIONS = [
  "Auto",
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "Pinnacle",
  "TheScore",
  "Manual",
];

export default function ImportPanel({
  rawText,
  setRawText,
  sportsbook,
  setSportsbook,
  batchRole,
  setBatchRole,
  onParse,
  onClearInput,
  onClearParsedRows,
  hasRows,
  lastParsedAt,
}) {
  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>1. Import Odds</h2>
      <p style={mutedStyle}>
        Paste extracted odds text here and choose the source book.
      </p>

      <div style={controlsRowStyle}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Sportsbook</span>
          <select
            value={sportsbook}
            onChange={(e) => {
              const nextBook = e.target.value;
              setSportsbook(nextBook);

              if (nextBook === "Pinnacle") {
                setBatchRole("fair_odds");
              } else if (nextBook !== "Auto") {
                setBatchRole("target");
              }
            }}
            style={inputStyle}
          >
            {SPORTSBOOK_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Batch Role</span>
          <select
            value={batchRole}
            onChange={(e) => setBatchRole(e.target.value)}
            style={inputStyle}
          >
            <option value="target">Target book</option>
            <option value="fair_odds">Fair odds / sharp source</option>
          </select>
        </label>
      </div>

      <textarea
        value={rawText || ""}
        onChange={(e) => setRawText(e.target.value)}
        style={textareaStyle}
        placeholder="Paste odds text here..."
        spellCheck={false}
      />

      <div style={{ marginTop: 8, fontSize: 12, color: "#166534", fontWeight: 700 }}>
        Input chars: {(rawText || "").length}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" onClick={onParse} style={primaryButtonStyle}>
          Parse Input
        </button>

        <button type="button" onClick={onClearInput} style={secondaryButtonStyle}>
          Clear Input
        </button>

        <button
          type="button"
          onClick={onClearParsedRows}
          style={{
            ...dangerButtonStyle,
            ...(hasRows ? {} : disabledButtonStyle),
          }}
          disabled={!hasRows}
        >
          Clear Parsed Rows
        </button>

        <span style={mutedStyle}>
          {lastParsedAt ? `Last parsed: ${new Date(lastParsedAt).toLocaleString()}` : "Not parsed yet"}
        </span>
      </div>
    </section>
  );
}

const sectionStyle = {
  background: "#f0fdf4",
  border: "2px solid #166534",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const h2Style = { marginTop: 0, marginBottom: 8, color: "#14532d" };

const mutedStyle = {
  color: "#166534",
  fontSize: 14,
};

const controlsRowStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 220,
};

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#166534",
  textTransform: "uppercase",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #86efac",
  background: "#fff",
  color: "#14532d",
  fontWeight: 700,
};

const textareaStyle = {
  width: "100%",
  minHeight: 220,
  padding: 12,
  borderRadius: 8,
  border: "1px solid #86efac",
  fontFamily: "monospace",
  fontSize: 14,
  resize: "vertical",
  background: "#fff",
  color: "#111",
};

const baseButtonStyle = {
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const primaryButtonStyle = {
  ...baseButtonStyle,
  background: "#166534",
  color: "#f0fdf4",
};

const secondaryButtonStyle = {
  ...baseButtonStyle,
  background: "#dcfce7",
  color: "#14532d",
  border: "1px solid #86efac",
};

const dangerButtonStyle = {
  ...baseButtonStyle,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
};

const disabledButtonStyle = {
  opacity: 0.45,
  cursor: "not-allowed",
};