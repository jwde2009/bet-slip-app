"use client";

import { useState } from "react";

export default function FairOddsPanel({ fairOddsResults }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={h2Style}>4. Fair Odds Engine</h2>

        <button type="button" onClick={() => setCollapsed((prev) => !prev)} style={toggleButtonStyle}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed &&
        (fairOddsResults.length === 0 ? (
          <p style={mutedStyle}>No fair odds calculated yet. Make sure some rows are marked as sharp.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Market</th>
                  <th style={thStyle}>Selection</th>
                  <th style={thStyle}>Fair Prob</th>
                  <th style={thStyle}>Fair American</th>
                  <th style={thStyle}>Hold %</th>
                </tr>
              </thead>
              <tbody>
                {fairOddsResults.map((result) => (
                  <tr key={result.id}>
                    <td style={tdStyle}>{result.marketDisplayName}</td>
                    <td style={tdStyle}>{result.selectionLabel}</td>
                    <td style={tdStyle}>{(result.fairProbability * 100).toFixed(2)}%</td>
                    <td style={tdStyle}>{formatAmerican(result.fairAmerican)}</td>
                    <td style={tdStyle}>
                      {typeof result.holdPct === "number" ? `${result.holdPct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}

function formatAmerican(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

const sectionStyle = {
  background: "#fff",
  border: "1px solid #ddd",
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
  marginBottom: 8,
};

const h2Style = { marginTop: 0, marginBottom: 8 };
const mutedStyle = { color: "#666", fontSize: 14 };

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: 8,
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: 8,
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