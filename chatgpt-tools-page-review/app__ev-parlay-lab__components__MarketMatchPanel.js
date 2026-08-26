"use client";

import { useState } from "react";

export default function MarketMatchPanel({ markets, unmatchedRows }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>3. Canonical Market Matching</h2>
          <div style={{ color: "#555" }}>
            Markets: <strong>{markets.length}</strong> | Unmatched Rows:{" "}
            <strong>{unmatchedRows.length}</strong>
          </div>
        </div>

        <button type="button" onClick={() => setCollapsed((prev) => !prev)} style={toggleButtonStyle}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed &&
        (markets.length === 0 ? (
          <p style={mutedStyle}>No canonical markets built yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {markets.map((market) => (
              <div key={market.id} style={cardStyle}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{market.displayName}</div>
                <div style={mutedStyle}>
                  {market.marketType}
                  {market.lineValue !== null && market.lineValue !== undefined
                    ? ` • ${market.lineValue}`
                    : ""}
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {market.selections.map((selection) => {
                    const bookCounts = buildBookCounts(selection.quotes);
                    const sharpQuotes = selection.quotes.filter((q) => q.isSharpSource);
                    const targetQuotes = selection.quotes.filter((q) => q.isTargetBook);
                    const comparison = buildBestQuoteComparison(selection.quotes);

                    return (
                      <div key={selection.id} style={selectionCardStyle}>
                        <div style={{ fontWeight: 700 }}>{selection.label}</div>

                        <div style={metaRowStyle}>
                          <span style={metaPillStyle}>
                            {selection.quotes.length} quote{selection.quotes.length === 1 ? "" : "s"}
                          </span>
                          <span style={metaPillStyle}>Sharp: {sharpQuotes.length}</span>
                          <span style={metaPillStyle}>Target: {targetQuotes.length}</span>
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <div style={subLabelStyle}>By Book</div>
                          <div style={bookListStyle}>
                            {Object.entries(bookCounts).map(([book, count]) => (
                              <span key={book} style={bookPillStyle}>
                                {book}: {count}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <div style={subLabelStyle}>Best Target vs Best Sharp</div>

                          {comparison ? (
                            <div style={comparisonCardStyle}>
                                                            <div style={comparisonGridStyle}>
                                <ComparisonCell
                                  label="Best Target"
                                  value={`${comparison.bestTarget.sportsbook} ${formatAmerican(
                                    comparison.bestTarget.oddsAmerican
                                  )}`}
                                />
                                <ComparisonCell
                                  label="Best Sharp"
                                  value={`${comparison.bestSharp.sportsbook} ${formatAmerican(
                                    comparison.bestSharp.oddsAmerican
                                  )}`}
                                />
                                <ComparisonCell
                                  label="Edge (Cents)"
                                  value={formatEdgeText(comparison.edgeAmerican)}
                                />
                                <ComparisonCell
                                  label="Edge %"
                                  value={formatPct(comparison.edgePct)}
                                />
                                <ComparisonCell
                                  label="Fair Prob"
                                  value={`${(comparison.fairProbability * 100).toFixed(2)}%`}
                                />
                                <ComparisonCell
                                  label="Leg EV %"
                                  value={formatPct(comparison.legEvPct)}
                                />
                              </div>
                            </div>
                          ) : (
                            <div style={mutedStyle}>Need at least one target quote and one sharp quote.</div>
                          )}
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <div style={subLabelStyle}>Quotes</div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {selection.quotes.map((quote) => (
                              <div key={`${selection.id}_${quote.parsedRowId}`} style={quoteRowStyle}>
                                <span>
                                  <strong>{quote.sportsbook}</strong> — {formatAmerican(quote.oddsAmerican)}
                                </span>

                                <span style={quoteBadgeWrapStyle}>
                                  {quote.isSharpSource ? (
                                    <span style={sharpBadgeStyle}>Sharp</span>
                                  ) : null}
                                  {quote.isTargetBook ? (
                                    <span style={targetBadgeStyle}>Target</span>
                                  ) : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}

function ComparisonCell({ label, value }) {
  return (
    <div style={comparisonCellStyle}>
      <div style={comparisonLabelStyle}>{label}</div>
      <div style={comparisonValueStyle}>{value}</div>
    </div>
  );
}

function buildBookCounts(quotes) {
  const counts = {};

  for (const quote of quotes) {
    const book = String(quote.sportsbook || "Unknown");
    counts[book] = (counts[book] || 0) + 1;
  }

  return counts;
}

function buildBestQuoteComparison(quotes) {
  const targetQuotes = quotes.filter(
    (q) => q.isTargetBook && Number.isFinite(q.oddsAmerican)
  );
  const sharpQuotes = quotes.filter(
    (q) => q.isSharpSource && Number.isFinite(q.oddsAmerican)
  );

  if (!targetQuotes.length || !sharpQuotes.length) return null;

  const bestTarget = [...targetQuotes].sort((a, b) => {
    const aDec = americanToDecimal(a.oddsAmerican);
    const bDec = americanToDecimal(b.oddsAmerican);
    return bDec - aDec;
  })[0];

  const bestSharp = [...sharpQuotes].sort((a, b) => {
    const aDec = americanToDecimal(a.oddsAmerican);
    const bDec = americanToDecimal(b.oddsAmerican);
    return bDec - aDec;
  })[0];

  const bestTargetDecimal = americanToDecimal(bestTarget.oddsAmerican);
  const bestSharpDecimal = americanToDecimal(bestSharp.oddsAmerican);
  const fairProbability = 1 / bestSharpDecimal;
  const edgeAmerican = bestTarget.oddsAmerican - bestSharp.oddsAmerican;

  const edgePct = (bestTargetDecimal / bestSharpDecimal) - 1;
  const legEvPct = fairProbability * (bestTargetDecimal - 1) - (1 - fairProbability);

  return {
    bestTarget,
    bestSharp,
    fairProbability,
    edgeAmerican,
    edgePct,
    legEvPct,
  };
}

function americanToDecimal(american) {
  const value = Number(american);
  if (!Number.isFinite(value)) return NaN;
  if (value > 0) return 1 + value / 100;
  return 1 + 100 / Math.abs(value);
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function formatEdgeText(edge) {
  if (!Number.isFinite(edge)) return "—";
  if (edge > 0) return `+${Math.round(edge)} cents`;
  if (edge < 0) return `${Math.round(edge)} cents`;
  return "0 cents";
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

const cardStyle = {
  border: "1px solid #e6e6e6",
  borderRadius: 10,
  padding: 12,
  background: "#fafafa",
};

const selectionCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  background: "#fff",
};

const metaRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8,
};

const metaPillStyle = {
  background: "#f3f4f6",
  color: "#374151",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const subLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#4b5563",
  marginBottom: 6,
  textTransform: "uppercase",
};

const bookListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const bookPillStyle = {
  background: "#ecfeff",
  color: "#155e75",
  border: "1px solid #a5f3fc",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const comparisonCardStyle = {
  border: "1px solid #dbeafe",
  background: "#f8fbff",
  borderRadius: 8,
  padding: 10,
};

const comparisonGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
};

const comparisonCellStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  padding: 8,
};

const comparisonLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "#6b7280",
  marginBottom: 4,
  textTransform: "uppercase",
};

const comparisonValueStyle = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const quoteRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: "1px solid #f1f5f9",
  borderRadius: 8,
  padding: "6px 8px",
  background: "#f8fafc",
};

const quoteBadgeWrapStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const sharpBadgeStyle = {
  background: "#dbeafe",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 800,
};

const targetBadgeStyle = {
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 800,
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