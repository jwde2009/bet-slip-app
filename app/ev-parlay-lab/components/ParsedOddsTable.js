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
  player_points_rebounds: 15,
  player_points_assists: 16,
  player_rebounds_assists: 17,
  double_double: 18,
  triple_double: 19,
  player_goals: 20,
  player_shots_on_goal: 21,
  player_saves: 22,
  player_hits: 23,
  player_power_play_points: 24,
  player_shutout: 25,
};

export default function ParsedOddsTable({ rows, onUpdateRow, onDeleteRow }) {
  const groupedRows = useMemo(() => buildGroupedRows(rows), [rows]);
  const [collapsedEvents, setCollapsedEvents] = useState({});
  const [collapsedMarkets, setCollapsedMarkets] = useState({});
  const [collapsedPlayers, setCollapsedPlayers] = useState({});

  function toggleEvent(eventKey) {
    setCollapsedEvents((prev) => ({
      ...prev,
      [eventKey]: !prev[eventKey],
    }));
  }

  function toggleMarket(eventKey, marketName) {
    const key = `${eventKey}__${marketName}`;
    setCollapsedMarkets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function togglePlayer(eventKey, marketName, playerName) {
    const key = `${eventKey}__${marketName}__${playerName}`;
    setCollapsedPlayers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function collapseAll() {
    const nextEvents = {};
    const nextMarkets = {};
    const nextPlayers = {};

    for (const eventGroup of groupedRows) {
      nextEvents[eventGroup.key] = true;

      for (const marketGroup of eventGroup.markets) {
        nextMarkets[`${eventGroup.key}__${marketGroup.market}`] = true;

        for (const playerGroup of marketGroup.players) {
          nextPlayers[`${eventGroup.key}__${marketGroup.market}__${playerGroup.player}`] = true;
        }
      }
    }

    setCollapsedEvents(nextEvents);
    setCollapsedMarkets(nextMarkets);
    setCollapsedPlayers(nextPlayers);
  }

  function expandAll() {
    const nextEvents = {};
    const nextMarkets = {};
    const nextPlayers = {};

    for (const eventGroup of groupedRows) {
      nextEvents[eventGroup.key] = false;

      for (const marketGroup of eventGroup.markets) {
        nextMarkets[`${eventGroup.key}__${marketGroup.market}`] = false;

        for (const playerGroup of marketGroup.players) {
          nextPlayers[`${eventGroup.key}__${marketGroup.market}__${playerGroup.player}`] = false;
        }
      }
    }

    setCollapsedEvents(nextEvents);
    setCollapsedMarkets(nextMarkets);
    setCollapsedPlayers(nextPlayers);
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
                  <th style={thStyle}>Sharp?</th>
                  <th style={thStyle}>Confidence</th>
                  <th style={thStyle}>Warnings</th>
                  <th style={thStyle}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((eventGroup) => (
                  <EventGroup
                    key={eventGroup.key}
                    eventGroup={eventGroup}
                    isCollapsed={!!collapsedEvents[eventGroup.key]}
                    onToggle={() => toggleEvent(eventGroup.key)}
                    collapsedMarkets={collapsedMarkets}
                    collapsedPlayers={collapsedPlayers}
                    onToggleMarket={toggleMarket}
                    onTogglePlayer={togglePlayer}
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
  collapsedMarkets,
  collapsedPlayers,
  onToggleMarket,
  onTogglePlayer,
  onUpdateRow,
  onDeleteRow,
}) {
  const totalRowsInEvent = eventGroup.markets.reduce((sum, marketGroup) => sum + marketGroup.rows.length, 0);

  return (
    <>
      <tr>
        <td colSpan={13} style={eventHeaderStyle}>
          <button type="button" onClick={onToggle} style={eventToggleStyle}>
            <span>{isCollapsed ? "Show" : "Hide"}</span>
            <span style={eventTitleStyle}>{eventGroup.event}</span>
            <span style={eventMetaStyle}>
              {eventGroup.markets.length} markets • {totalRowsInEvent} rows
            </span>
          </button>
        </td>
      </tr>

      {!isCollapsed &&
        eventGroup.markets.map((marketGroup) => (
          <MarketGroup
            key={`${eventGroup.key}__${marketGroup.market}`}
            eventKey={eventGroup.key}
            marketGroup={marketGroup}
            isCollapsed={!!collapsedMarkets[`${eventGroup.key}__${marketGroup.market}`]}
            collapsedPlayers={collapsedPlayers}
            onToggle={() => onToggleMarket(eventGroup.key, marketGroup.market)}
            onTogglePlayer={onTogglePlayer}
            onUpdateRow={onUpdateRow}
            onDeleteRow={onDeleteRow}
          />
        ))}
    </>
  );
}

function MarketGroup({
  eventKey,
  marketGroup,
  isCollapsed,
  collapsedPlayers,
  onToggle,
  onTogglePlayer,
  onUpdateRow,
  onDeleteRow,
}) {
  return (
    <>
      <tr>
        <td colSpan={13} style={marketHeaderStyle}>
          <button type="button" onClick={onToggle} style={marketToggleStyle}>
            <span>{isCollapsed ? "Show" : "Hide"}</span>
            <span style={marketTitleStyle}>{formatMarketLabel(marketGroup.market)}</span>
            <span style={marketMetaStyle}>
              {marketGroup.players.length} players • {marketGroup.rows.length} rows
            </span>
          </button>
        </td>
      </tr>

      {!isCollapsed &&
        marketGroup.players.map((playerGroup) => (
          <PlayerGroup
            key={`${eventKey}__${marketGroup.market}__${playerGroup.player}`}
            eventKey={eventKey}
            marketName={marketGroup.market}
            playerGroup={playerGroup}
            isCollapsed={!!collapsedPlayers[`${eventKey}__${marketGroup.market}__${playerGroup.player}`]}
            onToggle={() => onTogglePlayer(eventKey, marketGroup.market, playerGroup.player)}
            onUpdateRow={onUpdateRow}
            onDeleteRow={onDeleteRow}
          />
        ))}
    </>
  );
}

function PlayerGroup({ playerGroup, isCollapsed, onToggle, onUpdateRow, onDeleteRow }) {
  return (
    <>
      <tr>
        <td colSpan={13} style={playerHeaderStyle}>
          <button type="button" onClick={onToggle} style={playerToggleStyle}>
            <span>{isCollapsed ? "Show" : "Hide"}</span>
            <span style={playerTitleStyle}>{playerGroup.player}</span>
            <span style={playerMetaStyle}>{playerGroup.rows.length} rows</span>
          </button>
        </td>
      </tr>

      {!isCollapsed &&
        playerGroup.rows.map((row, rowIndex) => {
          const zebraBg = rowIndex % 2 === 0 ? "#ffffff" : "#fcfcfe";

          return (
            <tr key={row.id}>
              <td style={{ ...tdStyle, background: zebraBg }}>{formatBatchRole(row)}</td>
              <td style={{ ...tdStyle, background: zebraBg }}>{row.sportsbook || "—"}</td>
              <td style={{ ...tdStyle, background: zebraBg }}>{row.sport || "—"}</td>

              <td style={{ ...tdStyle, background: zebraBg }}>
                <div style={eventCellStyle}>
                  <div style={smallLabelStyle}>Event</div>
                  <textarea
                    value={row.eventLabelRaw || ""}
                    onChange={(e) => onUpdateRow(row.id, { eventLabelRaw: e.target.value })}
                    style={eventTextAreaStyle}
                    rows={2}
                  />
                </div>
              </td>

              <td style={{ ...tdStyle, background: zebraBg }}>
                <div style={canonicalEventStyle}>{buildCanonicalEventPreview(row) || "—"}</div>
              </td>

              <td style={{ ...tdStyle, background: zebraBg }}>{formatMarketLabel(row.marketType)}</td>

              <td style={{ ...tdStyle, background: zebraBg }}>
                <textarea
                  value={normalizeSelectionForEditor(row) || ""}
                  onChange={(e) => {
                    const next = String(e.target.value || "");
                    onUpdateRow(row.id, {
                      selectionRaw: next,
                      selectionNormalized: next,
                    });
                  }}
                  style={selectionTextAreaStyle}
                  rows={2}
                />
              </td>

              <td style={{ ...tdStyle, background: zebraBg }}>
                <input
                  type="text"
                  value={typeof row.lineValueInput === "string" ? row.lineValueInput : formatLineInput(row.lineValue)}
                  onChange={(e) => {
                    const next = parseEditableLineState(e.target.value);
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
                      ? row.oddsAmerican > 0
                        ? `+${row.oddsAmerican}`
                        : String(row.oddsAmerican)
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

              <td style={{ ...tdStyle, background: zebraBg, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={!!row.isSharpSource}
                  onChange={(e) => onUpdateRow(row.id, { isSharpSource: e.target.checked })}
                />
              </td>

              <td style={{ ...tdStyle, background: zebraBg }}>
                <span style={getConfidencePillStyle(row.confidence)}>{row.confidence || "—"}</span>
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
    const eventA = buildEventGroupKey(a);
    const eventB = buildEventGroupKey(b);
    if (eventA !== eventB) return eventA.localeCompare(eventB);

    const marketA = MARKET_ORDER[a.marketType] || 99;
    const marketB = MARKET_ORDER[b.marketType] || 99;
    if (marketA !== marketB) return marketA - marketB;

    const playerA = getPlayerNameForGrouping(a).toLowerCase();
    const playerB = getPlayerNameForGrouping(b).toLowerCase();
    if (playerA !== playerB) return playerA.localeCompare(playerB);

    const lineA = Number.isFinite(a.lineValue) ? a.lineValue : Number.POSITIVE_INFINITY;
    const lineB = Number.isFinite(b.lineValue) ? b.lineValue : Number.POSITIVE_INFINITY;
    if (lineA !== lineB) return lineA - lineB;

    const oddsA = Number.isFinite(a.oddsAmerican) ? a.oddsAmerican : 0;
    const oddsB = Number.isFinite(b.oddsAmerican) ? b.oddsAmerican : 0;
    return oddsA - oddsB;
  });

  const eventMap = new Map();

  for (const row of sorted) {
    const eventKey = buildEventGroupKey(row);
    const eventLabel = buildEventDisplayLabel(row);

    if (!eventMap.has(eventKey)) {
      eventMap.set(eventKey, {
        key: eventKey,
        event: eventLabel,
        markets: [],
      });
    }

    const eventGroup = eventMap.get(eventKey);
    if (eventLabel.length > eventGroup.event.length) {
      eventGroup.event = eventLabel;
    }

    let marketGroup = eventGroup.markets.find((item) => item.market === row.marketType);
    if (!marketGroup) {
      marketGroup = {
        market: row.marketType,
        rows: [],
        players: [],
      };
      eventGroup.markets.push(marketGroup);
      eventGroup.markets.sort((a, b) => (MARKET_ORDER[a.market] || 99) - (MARKET_ORDER[b.market] || 99));
    }

    marketGroup.rows.push(row);

    const allRowsForEventMarket = sorted.filter(
      (item) =>
        buildEventGroupKey(item) === eventKey &&
        item.marketType === row.marketType
    );

    const playerKey = getPlayerGroupKey(row, eventKey, allRowsForEventMarket);
    const playerLabel = getPlayerGroupLabel(row, eventKey, allRowsForEventMarket);

    let playerGroup = marketGroup.players.find((item) => item.key === playerKey);
    if (!playerGroup) {
      playerGroup = {
        key: playerKey,
        player: playerLabel,
        rows: [],
      };
      marketGroup.players.push(playerGroup);
      marketGroup.players.sort((a, b) => a.player.localeCompare(b.player));
    }

    playerGroup.rows.push(row);
  }

  return Array.from(eventMap.values());
}

function buildEventGroupKey(row) {
  const preview = buildCanonicalEventPreview(row);
  return normalizeEventLabel(preview || row.eventLabelRaw || "Unknown Event");
}

function buildEventDisplayLabel(row) {
  const preview = buildCanonicalEventPreview(row);
  if (preview) return expandEventLabel(preview);
  return expandEventLabel(String(row.eventLabelRaw || "Unknown Event"));
}

function getPlayerNameForGrouping(row) {
  const selection = normalizeSelectionForEditor(row);

  if (row.marketType === "moneyline_2way" || row.marketType === "moneyline_3way") {
    return selection || "Selection";
  }

  if (row.marketType === "spread" || row.marketType === "total") {
    return selection || "Selection";
  }

  const stripped = selection
    .replace(/\s+\|\s+(Over|Under)$/i, "")
    .replace(/\s+(Over|Under)$/i, "")
    .trim();

  return stripped || selection || "Selection";
}

function getPlayerGroupKey(row, eventKey, marketRows) {
  const rawName = getPlayerNameForGrouping(row);
  const resolved = resolvePlayerNameWithinEvent(rawName, eventKey, marketRows);
  return normalizeSimplePlayerName(resolved || rawName || "Selection");
}

function getPlayerGroupLabel(row, eventKey, marketRows) {
  const rawName = getPlayerNameForGrouping(row);
  const resolved = resolvePlayerNameWithinEvent(rawName, eventKey, marketRows);

  if (!resolved) return rawName || "Selection";
  if (normalizeSimplePlayerName(resolved) === normalizeSimplePlayerName(rawName)) {
    return resolved;
  }

  return `${resolved} (${rawName})`;
}

function resolvePlayerNameWithinEvent(rawName, eventKey, marketRows) {
  const baseName = String(rawName || "").trim();
  if (!baseName) return "";

  if (!looksLikeAbbreviatedPlayerName(baseName)) {
    return baseName;
  }

  const candidates = [...new Set(
    (marketRows || [])
      .map((row) => getPlayerNameForGrouping(row))
      .filter(Boolean)
      .map((name) => String(name).trim())
      .filter((name) => !looksLikeAbbreviatedPlayerName(name))
  )];

  const normalizedBase = normalizeSimplePlayerName(baseName);
  const baseParts = normalizedBase.split(" ").filter(Boolean);
  if (baseParts.length < 2) return baseName;

  const baseFirst = baseParts[0];
  const baseLast = baseParts[baseParts.length - 1];

  const matches = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeSimplePlayerName(candidate);
    const candidateParts = normalizedCandidate.split(" ").filter(Boolean);
    if (candidateParts.length < 2) return false;

    const candidateFirst = candidateParts[0];
    const candidateLast = candidateParts[candidateParts.length - 1];

    return candidateLast === baseLast && candidateFirst.startsWith(baseFirst);
  });

  const longerMatches = matches.filter((candidate) => {
    const normalizedCandidate = normalizeSimplePlayerName(candidate);
    const candidateFirst = normalizedCandidate.split(" ").filter(Boolean)[0] || "";
    return candidateFirst.length > baseFirst.length;
  });

  if (longerMatches.length === 1) {
    return longerMatches[0];
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return baseName;
}

function looksLikeAbbreviatedPlayerName(name) {
  const text = String(name || "").trim();
  if (!text) return false;

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;

  const first = parts[0].replace(/\./g, "");
  return first.length <= 2 || /\.$/.test(parts[0]);
}

function normalizeSimplePlayerName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSelectionForEditor(row) {
  const selection = String(row.selectionNormalized || row.selectionRaw || "");

  if (
    row.marketType === "double_double" ||
    row.marketType === "triple_double" ||
    row.marketType === "player_shutout"
  ) {
    return selection;
  }

  return selection.replace(/\s+\|\s+/g, " ");
}

function formatBatchRole(row) {
  if (row.isSharpSource) return "Sharp";
  if (row.isTargetBook) return "Target";
  if (row.batchRole === "fair_odds") return "Sharp";
  return "Target";
}

function buildCanonicalEventPreview(row) {
  const away = normalizeTeamToken(row.awayTeam || row.awayTeamRaw || "");
  const home = normalizeTeamToken(row.homeTeam || row.homeTeamRaw || "");
  if (away && home) return `${away} @ ${home}`;

  const raw = String(row.eventLabelRaw || "").trim();
  if (!raw) return "";

  const parts = raw.split(/\s@\s|\svs\.?\s/i).map((item) => item.trim()).filter(Boolean);
  if (parts.length === 2) {
    return `${normalizeTeamToken(parts[0])} @ ${normalizeTeamToken(parts[1])}`;
  }

  return expandEventLabel(raw);
}

function normalizeEventLabel(value) {
  const text = expandEventLabel(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return text;
}

function expandEventLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(/\s@\s|\svs\.?\s/i).map((item) => item.trim()).filter(Boolean);
  if (parts.length === 2) {
    return `${normalizeTeamToken(parts[0])} @ ${normalizeTeamToken(parts[1])}`;
  }
  return normalizeTeamToken(raw);
}

function normalizeTeamToken(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const teamMap = {
    "atl hawks": "Atlanta Hawks",
    "ny knicks": "New York Knicks",
    "cha hornets": "Charlotte Hornets",
    "orl magic": "Orlando Magic",
    "hou rockets": "Houston Rockets",
    "la lakers": "Los Angeles Lakers",
    "phi 76ers": "Philadelphia 76ers",
    "bos celtics": "Boston Celtics",
    "por trail blazers": "Portland Trail Blazers",
    "sa spurs": "San Antonio Spurs",
    "pho suns": "Phoenix Suns",
    "phx suns": "Phoenix Suns",
    "okc thunder": "Oklahoma City Thunder",
    "cle cavaliers": "Cleveland Cavaliers",
    "tor raptors": "Toronto Raptors",
    "den nuggets": "Denver Nuggets",
    "min timberwolves": "Minnesota Timberwolves",
    "minnesota wild": "Minnesota Wild",
    "dallas stars": "Dallas Stars",
    "montreal canadiens": "Montreal Canadiens",
    "tampa bay lightning": "Tampa Bay Lightning",
    "boston bruins": "Boston Bruins",
    "buffalo sabres": "Buffalo Sabres",
    "utah mammoth": "Utah Mammoth",
    "vegas golden knights": "Vegas Golden Knights",
    "los angeles kings": "Los Angeles Kings",
    "colorado avalanche": "Colorado Avalanche",
    "pittsburgh penguins": "Pittsburgh Penguins",
    "philadelphia flyers": "Philadelphia Flyers",
  };

  const direct = teamMap[text.toLowerCase()];
  if (direct) return direct;

  return text;
}

function formatLineInput(value) {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

function parseEditableLineState(value) {
  const text = String(value || "").trim();

  if (!text) {
    return { text: "", value: null };
  }

  const normalized = text.replace(/[^\d+.\-]/g, "");
  const num = Number(normalized);

  return {
    text,
    value: Number.isFinite(num) ? num : null,
  };
}

function parseEditableAmericanOddsState(value) {
  const text = String(value || "").trim();

  if (!text) {
    return { text: "", value: null };
  }

  const normalized = text.replace(/[^\d+\-]/g, "");
  if (!/^[+-]?\d+$/.test(normalized)) {
    return { text, value: null };
  }

  const num = Number(normalized);
  return {
    text,
    value: Number.isFinite(num) ? num : null,
  };
}

function formatMarketLabel(value) {
  const text = String(value || "").trim().toLowerCase();

  if (text === "moneyline_2way") return "Moneyline";
  if (text === "moneyline_3way") return "3-Way Moneyline";
  if (text === "spread") return "Spread";
  if (text === "total") return "Total";

  if (text === "player_points") return "Points";
  if (text === "player_assists") return "Assists";
  if (text === "player_rebounds") return "Rebounds";
  if (text === "player_threes") return "3-Pointers";
  if (text === "player_pra") return "Points + Rebounds + Assists";
  if (text === "player_points_rebounds") return "Points + Rebounds";
  if (text === "player_points_assists") return "Points + Assists";
  if (text === "player_rebounds_assists") return "Rebounds + Assists";
  if (text === "double_double") return "Double-Double";
  if (text === "triple_double") return "Triple-Double";
  if (text === "player_goals") return "Goals";
  if (text === "player_shots_on_goal") return "Shots on Goal";
  if (text === "player_saves") return "Saves";
  if (text === "player_hits") return "Hits";
  if (text === "player_power_play_points") return "Power Play Points";
  if (text === "player_shutout") return "Shutout";

  return String(value || "Unknown Market");
}

function getConfidencePillStyle(confidence) {
  const key = String(confidence || "").toLowerCase();

  if (key === "high") {
    return { ...confidencePillBaseStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  }

  if (key === "medium") {
    return { ...confidencePillBaseStyle, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
  }

  if (key === "low") {
    return { ...confidencePillBaseStyle, background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" };
  }

  return { ...confidencePillBaseStyle, background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" };
}

const sectionStyle = {
  background: "#fff",
  border: "1px solid #d6dbe3",
  borderRadius: 14,
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)",
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
};

const h2Style = { marginTop: 0, marginBottom: 8 };
const mutedStyle = { color: "#4b5563", fontSize: 14 };

const scrollFrameStyle = {
  overflowX: "auto",
};

const tableWrapStyle = {
  minWidth: 1280,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 14,
};

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #dbe3ea",
  padding: "10px 8px",
  background: "#f8fafc",
  position: "sticky",
  top: 0,
  zIndex: 1,
  fontWeight: 800,
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: 8,
  verticalAlign: "top",
};

const eventHeaderStyle = {
  background: "linear-gradient(180deg, #ecfdf5 0%, #dcfce7 100%)",
  borderTop: "1px solid #86efac",
  borderBottom: "1px solid #86efac",
  padding: 0,
};

const marketHeaderStyle = {
  background: "linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%)",
  borderBottom: "1px solid #bbf7d0",
  padding: 0,
};

const playerHeaderStyle = {
  background: "#e5e7eb",
  borderBottom: "1px solid #cbd5e1",
  padding: 0,
};

const eventToggleStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "72px 1fr auto",
  gap: 14,
  alignItems: "center",
  padding: "16px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontWeight: 800,
  color: "#14532d",
};

const marketToggleStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "72px 1fr auto",
  gap: 14,
  alignItems: "center",
  padding: "13px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontWeight: 800,
  color: "#166534",
};

const playerToggleStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "72px 1fr auto",
  gap: 14,
  alignItems: "center",
  padding: "11px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontWeight: 800,
  color: "#1f2937",
};

const eventTitleStyle = {
  fontSize: 18,
  lineHeight: 1.2,
};

const marketTitleStyle = {
  fontSize: 16,
  lineHeight: 1.2,
};

const playerTitleStyle = {
  fontSize: 15,
  lineHeight: 1.2,
  fontWeight: 800,
};

const eventMetaStyle = {
  color: "#166534",
  fontWeight: 800,
  fontSize: 12,
};

const marketMetaStyle = {
  color: "#166534",
  fontWeight: 800,
  fontSize: 12,
};

const playerMetaStyle = {
  color: "#374151",
  fontWeight: 800,
  fontSize: 12,
};

const eventCellStyle = {
  display: "grid",
  gap: 6,
};

const smallLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#6b7280",
};

const eventTextAreaStyle = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  padding: 8,
  fontSize: 13,
  resize: "vertical",
  minWidth: 220,
};

const selectionTextAreaStyle = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  padding: 8,
  fontSize: 13,
  resize: "vertical",
  minWidth: 180,
};

const canonicalEventStyle = {
  fontSize: 13,
  color: "#1f2937",
  lineHeight: 1.45,
  minWidth: 200,
  fontWeight: 700,
};

const smallInputStyle = {
  width: "100%",
  minWidth: 92,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 13,
  background: "#fff",
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

const dangerButtonStyle = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const confidencePillBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};
