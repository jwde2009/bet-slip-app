"use client";

import { useMemo, useState } from "react";

const MARKET_ORDER = {
  moneyline_2way: 1,
  moneyline_3way: 2,
  spread: 3,
  total: 4,
  player_points: 10,
  player_assists: 11,
  player_rebounds: 12,
  player_threes: 13,
  player_pra: 14,
};

export default function ParsedOddsTable({ rows, onUpdateRow, onDeleteRow }) {
  const groupedRows = useMemo(() => buildGroupedRows(rows), [rows]);
  const [collapsedEvents, setCollapsedEvents] = useState({});

  function toggleEvent(eventName) {
    setCollapsedEvents((prev) => ({
      ...prev,
      [eventName]: !prev[eventName],
    }));
  }

  function collapseAll() {
    const next = {};
    for (const group of groupedRows) {
      next[group.event] = true;
    }
    setCollapsedEvents(next);
  }

  function expandAll() {
    const next = {};
    for (const group of groupedRows) {
      next[group.event] = false;
    }
    setCollapsedEvents(next);
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>2. Parsed Odds Review</h2>
          <p style={mutedStyle}>
            Parsed rows: <strong>{rows.length}</strong>
          </p>
        </div>

        {rows.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={collapseAll} style={toggleButtonStyle}>
              Collapse All
            </button>
            <button type="button" onClick={expandAll} style={toggleButtonStyle}>
              Expand All
            </button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p style={mutedStyle}>No parsed rows yet.</p>
      ) : (
        <div style={scrollFrameStyle}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Book</th>
                  <th style={thStyle}>Sport</th>
                  <th style={thStyle}>Event</th>
                  <th style={thStyle}>Canonical Event</th>
                  <th style={thStyle}>Market</th>
                  <th style={thStyle}>Selection</th>
                  <th style={thStyle}>Line</th>
                  <th style={thStyle}>Odds</th>
                  <th style={thStyle}>Sharp</th>
                  <th style={thStyle}>Confidence</th>
                  <th style={thStyle}>Warnings</th>
                  <th style={thStyle}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((eventGroup) => (
                  <EventGroup
                    key={eventGroup.event}
                    eventGroup={eventGroup}
                    isCollapsed={!!collapsedEvents[eventGroup.event]}
                    onToggle={() => toggleEvent(eventGroup.event)}
                    onUpdateRow={onUpdateRow}
                    onDeleteRow={onDeleteRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function EventGroup({
  eventGroup,
  isCollapsed,
  onToggle,
  onUpdateRow,
  onDeleteRow,
}) {
  const totalRowsInEvent = eventGroup.markets.reduce(
    (sum, marketGroup) => sum + marketGroup.rows.length,
    0
  );

  return (
    <>
      <tr>
        <td colSpan={13} style={eventHeaderStyle}>
          <div style={eventHeaderInnerStyle}>
            <button type="button" onClick={onToggle} style={collapseButtonStyle}>
              {isCollapsed ? "Show" : "Hide"}
            </button>

            <div style={eventHeaderTextWrapStyle}>
              <div style={eventHeaderTitleStyle}>{eventGroup.event}</div>
              <div style={eventHeaderMetaStyle}>
                {eventGroup.markets.length} market
                {eventGroup.markets.length === 1 ? "" : "s"} • {totalRowsInEvent} row
                {totalRowsInEvent === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </td>
      </tr>

      {!isCollapsed &&
        eventGroup.markets.map((marketGroup) => (
          <MarketGroup
            key={`${eventGroup.event}__${marketGroup.market}`}
            marketGroup={marketGroup}
            onUpdateRow={onUpdateRow}
            onDeleteRow={onDeleteRow}
          />
        ))}
    </>
  );
}

function MarketGroup({ marketGroup, onUpdateRow, onDeleteRow }) {
  return (
    <>
      <tr>
        <td colSpan={13} style={marketHeaderStyle}>
          {marketGroup.market}
        </td>
      </tr>

      {marketGroup.rows.map((row, idx) => {
        const zebraBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

        return (
          <tr key={row.id} style={{ background: zebraBg }}>
            <td style={{ ...tdStyle, background: zebraBg }}>
  {row.batchRole === "fair_odds" ? "Sharp" : "Target"}
</td>

      <td style={{ ...tdStyle, background: zebraBg }}>
  {row.batchRole === "fair_odds" ? "Sharp" : "Target"}
</td>

<td style={{ ...tdStyle, background: zebraBg }}>{row.sportsbook}</td>
<td style={{ ...tdStyle, background: zebraBg }}>{row.sport}</td>

                        <td style={{ ...tdStyle, background: zebraBg }}>
              <div style={eventCellStyle}>
                <div style={eventTextStyle}>{row.eventLabelRaw || "—"}</div>
                  <textarea
                    value={row.eventLabelRaw || ""}
                    onChange={(e) => onUpdateRow(row.id, { eventLabelRaw: e.target.value })}
                    style={eventTextAreaStyle}
                    rows={2}
                  />
              </div>
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <div style={canonicalEventStyle}>
                {buildCanonicalEventPreview(row) || "—"}
              </div>
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <select
                value={row.marketType}
                onChange={(e) => onUpdateRow(row.id, { marketType: e.target.value })}
                style={inputStyle}
              >
                <option value="moneyline_2way">moneyline_2way</option>
                <option value="moneyline_3way">moneyline_3way</option>
                <option value="spread">spread</option>
                <option value="total">total</option>
                <option value="player_points">player_points</option>
                <option value="player_assists">player_assists</option>
                <option value="player_rebounds">player_rebounds</option>
                <option value="player_threes">player_threes</option>
                <option value="player_pra">player_pra</option>
              </select>
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <textarea
                value={row.selectionNormalized || ""}
                onChange={(e) =>
                  onUpdateRow(row.id, { selectionNormalized: e.target.value })
                }
                style={multiLineInputStyle}
                rows={2}
              />
            </td>


            <td style={{ ...tdStyle, background: zebraBg }}>
              <input
                type="text"
                value={
  row.marketType === "moneyline_2way" || row.marketType === "moneyline_3way"
    ? "ML"
    : typeof row.lineValueInput === "string"
    ? row.lineValueInput
    : Number.isFinite(row.lineValue)
    ? String(row.lineValue)
    : ""
}
                onChange={(e) => {
                  if (row.marketType === "moneyline_2way" || row.marketType === "moneyline_3way") {
                    return;
                  }

                  const next = parseEditableSignedNumberState(e.target.value);

                  onUpdateRow(row.id, {
                    lineValueInput: next.text,
                    lineValue: next.value,
                  });
                }}
                placeholder="e.g. -1.5"
                style={smallInputStyle}
              />
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <input
                type="text"
                value={
  typeof row.oddsAmericanInput === "string"
    ? row.oddsAmericanInput
    : Number.isFinite(row.oddsAmerican)
    ? String(row.oddsAmerican)
    : ""
}
                onChange={(e) => {
                  const next = parseEditableAmericanOddsState(e.target.value);

                  onUpdateRow(row.id, {
                    oddsAmericanInput: next.text,
                    oddsAmerican: next.value,
                  });
                }}
                placeholder="+150 or -200"
                style={smallInputStyle}
              />
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <input
                type="checkbox"
                checked={!!row.isSharpSource}
                onChange={(e) =>
                  onUpdateRow(row.id, { isSharpSource: e.target.checked })
                }
              />
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <span style={getConfidencePillStyle(row.confidence)}>{row.confidence}</span>
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              {row.parseWarnings?.length ? row.parseWarnings.join(", ") : "—"}
            </td>

            <td style={{ ...tdStyle, background: zebraBg }}>
              <button onClick={() => onDeleteRow(row.id)} style={dangerButtonStyle}>
                Delete
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function buildGroupedRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    const eventA = String(a.eventLabelRaw || "");
    const eventB = String(b.eventLabelRaw || "");
    if (eventA !== eventB) return eventA.localeCompare(eventB);

    const marketA = MARKET_ORDER[a.marketType] || 99;
    const marketB = MARKET_ORDER[b.marketType] || 99;
    if (marketA !== marketB) return marketA - marketB;

    return String(a.selectionNormalized || "").localeCompare(String(b.selectionNormalized || ""));
  });

  const eventMap = new Map();

  for (const row of sorted) {
    const eventKey = row.eventLabelRaw || "Unknown Event";
    if (!eventMap.has(eventKey)) {
      eventMap.set(eventKey, {
        event: eventKey,
        markets: [],
      });
    }

    const eventGroup = eventMap.get(eventKey);
    let marketGroup = eventGroup.markets.find((m) => m.market === row.marketType);

    if (!marketGroup) {
      marketGroup = {
        market: row.marketType,
        rows: [],
      };
      eventGroup.markets.push(marketGroup);
      eventGroup.markets.sort(
        (a, b) => (MARKET_ORDER[a.market] || 99) - (MARKET_ORDER[b.market] || 99)
      );
    }

    marketGroup.rows.push(row);
  }

  return Array.from(eventMap.values());
}

function buildCanonicalEventPreview(row) {
  const away = String(row.awayTeam || row.awayTeamRaw || "").trim();
  const home = String(row.homeTeam || row.homeTeamRaw || "").trim();

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const event = String(row.eventLabelRaw || "").trim();

  if (event.includes("@")) {
    return event;
  }

  if (/\bvs\b/i.test(event)) {
    const [awaySide, homeSide] = event.split(/\bvs\b/i).map((s) => s.trim());
    if (awaySide && homeSide) {
      return `${awaySide} @ ${homeSide}`;
    }
  }

  return event;
}

function parseEditableSignedNumberState(raw) {
  const text = String(raw ?? "").replace(/−/g, "-").trim();

  if (text === "") {
    return { text: "", value: null };
  }

  if (text === "-" || text === "+" || text === "." || text === "-." || text === "+.") {
    return { text, value: null };
  }

  if (!/^[+-]?\d*(\.\d*)?$/.test(text)) {
    return { text, value: null };
  }

  const value = Number(text);
  return {
    text,
    value: Number.isFinite(value) ? value : null,
  };
}

function parseEditableAmericanOddsState(raw) {
  const text = String(raw ?? "").replace(/−/g, "-").trim();

  if (text === "") {
    return { text: "", value: null };
  }

  if (text === "-" || text === "+") {
    return { text, value: null };
  }

  if (!/^[+-]?\d+$/.test(text)) {
    return { text, value: null };
  }

  const value = Number(text);

  if (!Number.isFinite(value) || value === 0) {
    return { text, value: null };
  }

  return {
    text,
    value,
  };
}

function getConfidencePillStyle(confidence) {
  const value = String(confidence || "").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  if (value === "high") {
    return { ...base, background: "#166534", color: "#ecfdf5" };
  }

  if (value === "medium") {
    return { ...base, background: "#ca8a04", color: "#fefce8" };
  }

  if (value === "low") {
    return { ...base, background: "#dc2626", color: "#fef2f2" };
  }

  return { ...base, background: "#374151", color: "#f9fafb" };
}

const sectionStyle = {
  background: "#fff",
  border: "2px solid #166534",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const h2Style = { marginTop: 0, marginBottom: 6, color: "#14532d" };
const mutedStyle = { color: "#166534", fontSize: 14, margin: 0 };

const scrollFrameStyle = {
  maxHeight: 520,
  overflow: "auto",
  border: "1px solid #d1d5db",
  borderRadius: 10,
};

const tableWrapStyle = {
  minWidth: 1200,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 14,
};

const thStyle = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  textAlign: "left",
  borderBottom: "1px solid #d1d5db",
  padding: 8,
  whiteSpace: "nowrap",
  background: "#dcfce7",
  color: "#14532d",
};

const tdStyle = {
  borderBottom: "1px solid #e5e7eb",
  padding: 8,
  verticalAlign: "top",
};

const eventHeaderStyle = {
  padding: "10px 12px",
  background: "#166534",
  color: "#f0fdf4",
  fontWeight: 800,
  letterSpacing: 0.2,
};

const eventHeaderInnerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  justifyContent: "space-between",
  flexWrap: "wrap",
};

const eventHeaderTextWrapStyle = {
  display: "grid",
  gap: 4,
  flex: 1,
  minWidth: 220,
};

const eventHeaderTitleStyle = {
  fontWeight: 800,
  lineHeight: 1.35,
};

const eventHeaderMetaStyle = {
  fontSize: 12,
  color: "#dcfce7",
  fontWeight: 700,
};

const collapseButtonStyle = {
  background: "#f0fdf4",
  color: "#166534",
  border: "none",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 800,
  whiteSpace: "nowrap",
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

const marketHeaderStyle = {
  padding: "8px 12px",
  background: "#dcfce7",
  color: "#14532d",
  fontWeight: 800,
  textTransform: "uppercase",
  fontSize: 12,
  letterSpacing: 0.4,
};

const inputStyle = {
  width: "100%",
  minWidth: 120,
  padding: 6,
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
};

  const multiLineInputStyle = {
    width: "100%",
    minWidth: 140,
    minHeight: 56,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: "#fff",
    font: "inherit",
    lineHeight: 1.25,
    resize: "vertical",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  };


const smallInputStyle = {
  width: 90,
  padding: 6,
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
};

const eventCellStyle = {
  display: "grid",
  gap: 8,
  minWidth: 260,
};

const eventTextStyle = {
  whiteSpace: "normal",
  wordBreak: "break-word",
  lineHeight: 1.35,
  fontWeight: 700,
  color: "#111827",
};

const canonicalEventStyle = {
  minWidth: 220,
  whiteSpace: "normal",
  wordBreak: "break-word",
  lineHeight: 1.35,
  color: "#374151",
  fontWeight: 700,
};

const eventInputStyle = {
  width: "100%",
  padding: 6,
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
};

const eventTextAreaStyle = {
  width: "100%",
  minHeight: 56,
  padding: 6,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  font: "inherit",
  lineHeight: 1.25,
  resize: "vertical",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};


const dangerButtonStyle = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 700,
};