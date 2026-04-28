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
  goalie_goals_against: 26,
  player_total_bases: 27,
  player_home_runs: 28,
  player_rbis: 29,
  pitcher_strikeouts: 30,
  pitcher_outs_recorded: 31,
  pitcher_hits_allowed: 32,
  pitcher_earned_runs_allowed: 33,
};
 
const MAX_ROWS_PER_PLAYER_GROUP = 50;
const TABLE_COLUMN_COUNT = 13;
 
export default function ParsedOddsTable({ rows, onUpdateRow, onDeleteRow, onDeleteRows }) {
  const groupedRows = useMemo(() => buildGroupedRows(rows), [rows]);
  const [collapsedEvents, setCollapsedEvents] = useState({});
  const [collapsedMarkets, setCollapsedMarkets] = useState({});
  const [collapsedPlayers, setCollapsedPlayers] = useState({});
 
  function toggleEvent(eventKey) {
    setCollapsedEvents((prev) => {
      const currentlyCollapsed = prev[eventKey] !== false;
 
      return {
        ...prev,
        [eventKey]: !currentlyCollapsed,
      };
    });
  }
 
  function toggleMarket(eventKey, marketName) {
    const key = `${eventKey}__${marketName}`;
 
    setCollapsedMarkets((prev) => {
      const currentlyCollapsed = prev[key] !== false;
 
      return {
        ...prev,
        [key]: !currentlyCollapsed,
      };
    });
  }
 
  function togglePlayer(eventKey, marketName, playerName) {
    const key = `${eventKey}__${marketName}__${playerName}`;
 
    setCollapsedPlayers((prev) => {
      const currentlyCollapsed = prev[key] !== false;
 
      return {
        ...prev,
        [key]: !currentlyCollapsed,
      };
    });
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
              Expand All Carefully
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
                    onDeleteRows={onDeleteRows}
                    key={eventGroup.key}
                    eventGroup={eventGroup}
                    isCollapsed={collapsedEvents[eventGroup.key] !== false}
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
  onDeleteRows,
  isCollapsed,
  onToggle,
  collapsedMarkets,
  collapsedPlayers,
  onToggleMarket,
  onTogglePlayer,
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
        <td colSpan={TABLE_COLUMN_COUNT} style={eventHeaderStyle}>
          <div style={groupHeaderActionWrapStyle}>
            <button type="button" onClick={onToggle} style={eventToggleStyle}>
              <span>{isCollapsed ? "Show" : "Hide"}</span>
              <span style={eventTitleStyle}>{eventGroup.event}</span>
              <span style={eventMetaStyle}>
                {eventGroup.markets.length} markets • {totalRowsInEvent} rows
              </span>
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();

                const rowIds = eventGroup.markets.flatMap((market) =>
                  market.rows.map((row) => row.id)
                );

                if (
                  window.confirm(
                    `Delete all ${rowIds.length} rows for ${eventGroup.event}?`
                  )
                ) {
                  onDeleteRows?.(rowIds);
                }
              }}
              style={smallDangerButtonStyle}
            >
              Delete Event
            </button>
          </div>
        </td>
      </tr>
 
      {!isCollapsed &&
        eventGroup.markets.map((marketGroup) => {
          const marketCollapseKey = `${eventGroup.key}__${marketGroup.market}`;
 
          return (
            <MarketGroup
              key={marketCollapseKey}
              eventKey={eventGroup.key}
              eventName={eventGroup.event}
              marketGroup={marketGroup}
              isCollapsed={collapsedMarkets[marketCollapseKey] !== false}
              collapsedPlayers={collapsedPlayers}
              onToggle={() => onToggleMarket(eventGroup.key, marketGroup.market)}
              onTogglePlayer={onTogglePlayer}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onDeleteRows={onDeleteRows}
            />
          );
        })}
    </>
  );
}
 
function MarketGroup({
  eventKey,
  eventName,
  marketGroup,
  isCollapsed,
  collapsedPlayers,
  onToggle,
  onTogglePlayer,
  onUpdateRow,
  onDeleteRow,
  onDeleteRows,
}) {
  return (
    <>
      <tr>
        <td colSpan={TABLE_COLUMN_COUNT} style={marketHeaderStyle}>
          <div style={groupHeaderActionWrapStyle}>
            <button type="button" onClick={onToggle} style={marketToggleStyle}>
              <span>{isCollapsed ? "Show" : "Hide"}</span>
              <span style={marketTitleStyle}>{formatMarketLabel(marketGroup.market)}</span>
              <span style={marketMetaStyle}>
                {marketGroup.players.length} players • {marketGroup.rows.length} rows
              </span>
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();

                const rowIds = marketGroup.rows.map((row) => row.id);
                const marketLabel = formatMarketLabel(marketGroup.market);

                if (
                  window.confirm(
                    `Delete ${rowIds.length} ${marketLabel} rows for ${eventName}?`
                  )
                ) {
                  onDeleteRows?.(rowIds);
                }
              }}
              style={smallDangerButtonStyle}
            >
              Delete Market
            </button>
          </div>
        </td>
      </tr>
 
      {!isCollapsed &&
        marketGroup.players.map((playerGroup) => {
          const playerCollapseKey = `${eventKey}__${marketGroup.market}__${playerGroup.player}`;
 
          return (
            <PlayerGroup
              key={playerCollapseKey}
              playerGroup={playerGroup}
              isCollapsed={collapsedPlayers[playerCollapseKey] !== false}
              onToggle={() => onTogglePlayer(eventKey, marketGroup.market, playerGroup.player)}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
            />
          );
        })}
    </>
  );
}
 
function PlayerGroup({ playerGroup, isCollapsed, onToggle, onUpdateRow, onDeleteRow }) {
  const visibleRows = playerGroup.rows.slice(0, MAX_ROWS_PER_PLAYER_GROUP);
 
  return (
    <>
      <tr>
        <td colSpan={TABLE_COLUMN_COUNT} style={playerHeaderStyle}>
          <button type="button" onClick={onToggle} style={playerToggleStyle}>
            <span>{isCollapsed ? "Show" : "Hide"}</span>
            <span style={playerTitleStyle}>{playerGroup.player}</span>
            <span style={playerMetaStyle}>{playerGroup.rows.length} rows</span>
          </button>
        </td>
      </tr>
 
      {!isCollapsed ? (
        <>
          {visibleRows.map((row, rowIndex) => {
            const zebraBg = rowIndex % 2 === 0 ? "#ffffff" : "#fcfcfe";
            const lineState = parseEditableLineState(row.lineValue);
            const oddsState = parseEditableAmericanOddsState(row.oddsAmerican);
            const warnings = formatWarnings(row.parseWarnings);
 
            const rowKey = [
              row.id,
              row.sportsbook,
              row.batchRole,
              row.sport,
              row.eventLabelRaw,
              row.marketType,
              row.selectionNormalized || row.selectionRaw,
              row.lineValue ?? "",
              row.oddsAmerican ?? "",
              rowIndex,
            ]
              .map((part) => String(part ?? "").trim())
              .join("::");
 
            return (
              <tr key={rowKey}>
                <td style={{ ...tdStyle, background: zebraBg }}>{formatBatchRole(row)}</td>
                <td style={{ ...tdStyle, background: zebraBg }}>{row.sportsbook || "—"}</td>
                <td style={{ ...tdStyle, background: zebraBg }}>{row.sport || "—"}</td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <div style={eventCellStyle}>
                    <span style={smallLabelStyle}>Event</span>
                    <textarea
                      value={row.eventLabelRaw || ""}
                      onChange={(event) =>
                        onUpdateRow(row.id, {
                          eventLabelRaw: event.target.value,
                        })
                      }
                      rows={2}
                      style={eventTextAreaStyle}
                    />
                  </div>
                </td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <div style={canonicalEventStyle}>{buildCanonicalEventPreview(row) || "—"}</div>
                </td>
                <td style={{ ...tdStyle, background: zebraBg }}>{formatMarketLabel(row.marketType)}</td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <textarea
                    value={normalizeSelectionForEditor(row)}
                    onChange={(event) =>
                      onUpdateRow(row.id, {
                        selectionRaw: event.target.value,
                        selectionNormalized: event.target.value,
                      })
                    }
                    rows={2}
                    style={selectionTextAreaStyle}
                  />
                </td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <input
                    value={lineState.text}
                    placeholder="e.g. -1.5"
                    onChange={(event) => {
                      const next = parseEditableLineState(event.target.value);
                      onUpdateRow(row.id, { lineValue: next.value });
                    }}
                    style={smallInputStyle}
                  />
                </td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <input
                    value={oddsState.text}
                    placeholder="e.g. -110"
                    onChange={(event) => {
                      const next = parseEditableAmericanOddsState(event.target.value);
                      onUpdateRow(row.id, { oddsAmerican: next.value });
                    }}
                    style={smallInputStyle}
                  />
                </td>
                <td style={{ ...tdStyle, background: zebraBg }}>{row.isSharpSource ? "Y" : "—"}</td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <span style={getConfidencePillStyle(row.confidence)}>{row.confidence || "medium"}</span>
                </td>
                <td style={{ ...tdStyle, background: zebraBg }}>{warnings}</td>
                <td style={{ ...tdStyle, background: zebraBg }}>
                  <button type="button" onClick={() => onDeleteRow(row.id)} style={dangerButtonStyle}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
 
          {playerGroup.rows.length > MAX_ROWS_PER_PLAYER_GROUP ? (
            <tr>
              <td colSpan={TABLE_COLUMN_COUNT} style={tdStyle}>
                Showing first {MAX_ROWS_PER_PLAYER_GROUP} rows for this player/group. Use event and market summaries for the full count.
              </td>
            </tr>
          ) : null}
        </>
      ) : null}
    </>
  );
}
 
function buildGroupedRows(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
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
        _marketMap: new Map(),
      });
    }
 
    const eventGroup = eventMap.get(eventKey);
    if (eventLabel.length > eventGroup.event.length) {
      eventGroup.event = eventLabel;
    }
 
    if (!eventGroup._marketMap.has(row.marketType)) {
      const marketGroup = {
        market: row.marketType,
        rows: [],
        players: [],
        _playerMap: new Map(),
      };
 
      eventGroup._marketMap.set(row.marketType, marketGroup);
      eventGroup.markets.push(marketGroup);
      eventGroup.markets.sort((a, b) => (MARKET_ORDER[a.market] || 99) - (MARKET_ORDER[b.market] || 99));
    }
 
    const marketGroup = eventGroup._marketMap.get(row.marketType);
    marketGroup.rows.push(row);
 
    const playerKey = getPlayerGroupKey(row);
    const playerLabel = getPlayerGroupLabel(row);
 
    if (!marketGroup._playerMap.has(playerKey)) {
      const playerGroup = {
        key: playerKey,
        player: playerLabel,
        rows: [],
      };
 
      marketGroup._playerMap.set(playerKey, playerGroup);
      marketGroup.players.push(playerGroup);
      marketGroup.players.sort((a, b) => a.player.localeCompare(b.player));
    }
 
    marketGroup._playerMap.get(playerKey).rows.push(row);
  }
 
  return Array.from(eventMap.values()).map((eventGroup) => ({
    key: eventGroup.key,
    event: eventGroup.event,
    markets: eventGroup.markets.map((marketGroup) => ({
      market: marketGroup.market,
      rows: marketGroup.rows,
      players: marketGroup.players,
    })),
  }));
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
    .replace(/\s+Total Power Play Points$/i, "")
    .replace(/\s+Total Saves$/i, "")
    .replace(/\s+Total Shots On Goal$/i, "")
    .replace(/\s+Total Goals$/i, "")
    .trim();
 
  return stripped || selection || "Selection";
}
 
function getPlayerGroupKey(row) {
  const rawName = getPlayerNameForGrouping(row);
  return normalizeSimplePlayerName(rawName || "Selection");
}
 
function getPlayerGroupLabel(row) {
  return getPlayerNameForGrouping(row) || "Selection";
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
  return expandEventLabel(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
 
    "ari diamondbacks": "Arizona Diamondbacks",
    "atl braves": "Atlanta Braves",
    "bal orioles": "Baltimore Orioles",
    "bos red sox": "Boston Red Sox",
    "chi cubs": "Chicago Cubs",
    "chi white sox": "Chicago White Sox",
    "cin reds": "Cincinnati Reds",
    "cle guardians": "Cleveland Guardians",
    "col rockies": "Colorado Rockies",
    "det tigers": "Detroit Tigers",
    "hou astros": "Houston Astros",
    "kc royals": "Kansas City Royals",
    "la angels": "Los Angeles Angels",
    "la dodgers": "Los Angeles Dodgers",
    "mia marlins": "Miami Marlins",
    "mil brewers": "Milwaukee Brewers",
    "min twins": "Minnesota Twins",
    "ny mets": "New York Mets",
    "ny yankees": "New York Yankees",
    "oak athletics": "Athletics",
    "phi phillies": "Philadelphia Phillies",
    "pit pirates": "Pittsburgh Pirates",
    "sd padres": "San Diego Padres",
    "sf giants": "San Francisco Giants",
    "sea mariners": "Seattle Mariners",
    "stl cardinals": "St. Louis Cardinals",
    "tb rays": "Tampa Bay Rays",
    "tex rangers": "Texas Rangers",
    "tor blue jays": "Toronto Blue Jays",
    "wsh nationals": "Washington Nationals",
 
    "minnesota wild": "Minnesota Wild",
    "dallas stars": "Dallas Stars",
    "montreal canadiens": "Montreal Canadiens",
    "tampa": "Tampa Bay Lightning",
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
  const text = formatLineInput(value);
 
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
  if (!Number.isFinite(value)) return { text: "", value: null };
 
  const text = String(value);
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
 
function formatWarnings(value) {
  if (Array.isArray(value) && value.length) return value.join(", ");
  if (typeof value === "string" && value.trim()) return value;
  return "—";
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
  if (text === "player_total_bases") return "Total Bases";
  if (text === "player_home_runs") return "Home Runs";
  if (text === "player_rbis") return "RBIs";
  if (text === "player_runs") return "Runs";
  if (text === "player_power_play_points") return "Power Play Points";
  if (text === "player_shutout") return "Shutout";
  if (text === "goalie_goals_against") return "Goals Against";
  if (text === "pitcher_strikeouts") return "Pitcher Strikeouts";
  if (text === "pitcher_outs_recorded") return "Pitcher Outs";
  if (text === "pitcher_hits_allowed") return "Hits Allowed";
  if (text === "pitcher_earned_runs_allowed") return "Earned Runs Allowed";
 
  return String(value || "Unknown Market").replace(/_/g, " ");
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
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "visible",
  WebkitOverflowScrolling: "touch",
  paddingBottom: 8,
};
 
const tableWrapStyle = {
  display: "inline-block",
  minWidth: "100%",
};
 
const tableStyle = {
  width: "max-content",
  minWidth: 1250,
  borderCollapse: "collapse",
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

const groupHeaderActionWrapStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "stretch",
  gap: 8,
};

const smallDangerButtonStyle = {
  alignSelf: "center",
  marginRight: 12,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 800,
  whiteSpace: "nowrap",
};