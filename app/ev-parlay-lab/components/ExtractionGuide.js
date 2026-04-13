"use client";

import { useState } from "react";
import { EXTRACTION_GUIDES } from "../data/extractionGuides";

export default function ExtractionGuide({ sportsbook }) {
  const [copyNotice, setCopyNotice] = useState("");
  const [showCommand, setShowCommand] = useState(false);
  const guide = EXTRACTION_GUIDES[sportsbook] || EXTRACTION_GUIDES.Auto;

  async function handleCopyCommand() {
    if (!guide.command) return;

    try {
      await navigator.clipboard.writeText(guide.command);
      setCopyNotice("Copied to clipboard");
      window.setTimeout(() => setCopyNotice(""), 1500);
    } catch (error) {
      console.error(error);
      setCopyNotice("Copy failed");
      window.setTimeout(() => setCopyNotice(""), 1500);
    }
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={h2Style}>Book Extraction Guide</h2>
      </div>

      <div style={gridStyle}>
        <GuideCard label="Best Method" value={guide.bestMethod} />
        <GuideCard label="Fallback" value={guide.fallbackMethod} />
        <GuideCard label="Avoid" value={guide.avoid} />
      </div>

      {guide.command ? (
        <div style={commandRowWrapStyle}>
          <div style={commandControlsStyle}>
            <button type="button" onClick={handleCopyCommand} style={copyButtonStyle}>
              Copy Command
            </button>

            <button
              type="button"
              onClick={() => setShowCommand((prev) => !prev)}
              style={secondaryButtonStyle}
            >
              {showCommand ? "Hide Command" : "Show Command"}
            </button>

            {copyNotice ? <span style={copyNoticeStyle}>{copyNotice}</span> : null}
          </div>

          {showCommand ? (
            <div style={commandWrapStyle}>
              <div style={labelStyle}>Command</div>
              <div style={commandStyle}>{guide.command}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div style={subheadStyle}>Steps</div>
        <ol style={listStyle}>
          {guide.steps.map((step) => (
            <li key={step} style={{ marginBottom: 6 }}>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function GuideCard({ label, value }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

const sectionStyle = {
  background: "#f0fdf4",
  border: "2px solid #166534",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
};

const h2Style = {
  marginTop: 0,
  marginBottom: 0,
  color: "#14532d",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #86efac",
  borderRadius: 10,
  padding: 12,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#166534",
  marginBottom: 6,
  textTransform: "uppercase",
};

const valueStyle = {
  color: "#14532d",
  fontSize: 14,
  lineHeight: 1.4,
};

const subheadStyle = {
  fontWeight: 800,
  color: "#166534",
  marginBottom: 8,
};

const listStyle = {
  margin: 0,
  paddingLeft: 20,
  color: "#14532d",
  lineHeight: 1.5,
};

const commandRowWrapStyle = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const commandControlsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const commandWrapStyle = {
  background: "#ffffff",
  border: "1px solid #86efac",
  borderRadius: 10,
  padding: 12,
};

const commandStyle = {
  fontFamily: "monospace",
  fontSize: 13,
  background: "#f8fafc",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 10,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#111827",
};

const copyButtonStyle = {
  background: "#166534",
  color: "#f0fdf4",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const secondaryButtonStyle = {
  background: "#dcfce7",
  color: "#14532d",
  border: "1px solid #86efac",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const copyNoticeStyle = {
  color: "#166534",
  fontWeight: 700,
  fontSize: 14,
};