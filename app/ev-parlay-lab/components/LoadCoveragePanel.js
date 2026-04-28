"use client";

import { useMemo, useState } from "react";

export default function LoadCoveragePanel({ rows = [] }) {
  const [collapsedBooks, setCollapsedBooks] = useState({});
  const [collapsedSports, setCollapsedSports] = useState({});
  const [collapsedEvents, setCollapsedEvents] = useState({});
  const [showOnlyThin, setShowOnlyThin] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const coverage = useMemo(() => buildCoverage(rows), [rows]);

  const visibleBooks = showOnlyThin
    ? coverage.books
        .map((book) => ({
          ...book,
          sports: book.sports
            .map((sport) => ({
              ...sport,
              events: sport.events.filter((event) => event.isThin),
            }))
            .filter((sport) => sport.events.length > 0),
        }))
        .filter((book) => book.sports.length > 0)
    : coverage.books;

  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <section style={sectionStyle}>
        <div style={headerRowStyle}>
          <div>
            <h2 style={h2Style}>Loaded Coverage</h2>
            <div style={subtleStyle}>
              Import odds to see which books, sports, events, and markets are loaded.
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (panelCollapsed) {
    return (
      <section style={sectionStyle}>
        <div style={headerRowStyle}>
          <div>
            <h2 style={h2Style}>Loaded Coverage</h2>
            <div style={subtleStyle}>
              Hidden for now. Reopen it if you want to check loaded books, leagues, games, and markets again.
            </div>
          </div>

          <div style={headerButtonRowStyle}>
            <span style={summaryPillStyle}>Books: {coverage.bookCount}</span>
            <span style={summaryPillStyle}>Events: {coverage.eventCount}</span>
            <span style={summaryPillStyle}>Markets: {coverage.marketCount}</span>
            <span style={summaryPillStyle}>Rows: {coverage.rowCount}</span>

            <button
              type="button"
              onClick={() => setPanelCollapsed(false)}
              style={showThinButtonStyle}
            >
              Show Loaded Coverage
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>Loaded Coverage</h2>
          <div style={subtleStyle}>
            Use this to spot games or books that only loaded a few markets.
          </div>
        </div>

        <div style={headerButtonRowStyle}>
          <span style={summaryPillStyle}>Books: {coverage.bookCount}</span>
          <span style={summaryPillStyle}>Events: {coverage.eventCount}</span>
          <span style={summaryPillStyle}>Markets: {coverage.marketCount}</span>
          <span style={summaryPillStyle}>Rows: {coverage.rowCount}</span>

          <button
            type="button"
            onClick={() => setShowOnlyThin((prev) => !prev)}
            style={showThinButtonStyle}
          >
            {showOnlyThin ? "Show All" : "Show Thin Only"}
          </button>

          <button
            type="button"
            onClick={() => setPanelCollapsed(true)}
            style={showThinButtonStyle}
          >
            Hide Loaded Coverage
          </button>
        </div>
      </div>

      {visibleBooks.length === 0 ? (
        <div style={emptyThinStyle}>
          No thin/possibly incomplete events found.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visibleBooks.map((book) => {
            const bookKey = book.bookmaker;
            const bookCollapsed = !!collapsedBooks[bookKey];

            return (
              <div key={bookKey} style={bookCardStyle}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedBooks((prev) => ({
                      ...prev,
                      [bookKey]: !prev[bookKey],
                    }))
                  }
                  style={bookHeaderButtonStyle}
                >
                  <span>
                    {bookCollapsed ? "Show" : "Hide"} {book.bookmaker}
                  </span>
                  <span style={bookMetaStyle}>
                    {book.eventCount} events • {book.marketCount} markets • {book.rowCount} rows
                  </span>
                </button>

                {!bookCollapsed ? (
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    {book.sports.map((sport) => {
                      const sportKey = `${bookKey}_${sport.sport}`;
                      const sportCollapsed = !!collapsedSports[sportKey];

                      return (
                        <div key={sportKey} style={sportCardStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedSports((prev) => ({
                                ...prev,
                                [sportKey]: !prev[sportKey],
                              }))
                            }
                            style={sportHeaderButtonStyle}
                          >
                            <span>
                              {sportCollapsed ? "Show" : "Hide"} {sport.sport || "UNKNOWN"} ({sport.eventCount} events)
                            </span>
                            <span style={sportMetaStyle}>
                              {sport.marketCount} markets • {sport.rowCount} rows
                            </span>
                          </button>

                          {!sportCollapsed ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              {sport.events.map((event) => {
                                const eventKey = `${bookKey}::${sport.sport}::${event.eventName}`;
                                const eventCollapsed = !!collapsedEvents[eventKey];

                                return (
                                  <div
                                    key={eventKey}
                                    style={{
                                      ...eventCardStyle,
                                      ...(event.isThin ? thinEventStyle : null),
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCollapsedEvents((prev) => ({
                                          ...prev,
                                          [eventKey]: !prev[eventKey],
                                        }))
                                      }
                                      style={eventHeaderButtonStyle}
                                    >
                                      <span>
                                        {eventCollapsed ? "Show" : "Hide"} {event.eventName}
                                      </span>

                                      <span style={eventMetaWrapStyle}>
                                        {event.isThin ? (
                                          <span style={thinBadgeStyle}>
                                            Possibly incomplete
                                          </span>
                                        ) : null}
                                        <span style={eventMetaStyle}>
                                          {event.marketCount} markets • {event.rowCount} rows
                                        </span>
                                      </span>
                                    </button>

                                    {!eventCollapsed ? (
                                      <div style={marketGridStyle}>
                                        {event.markets.map((market) => (
                                          <div key={`${eventKey}_${market.marketType}`} style={marketPillStyle}>
                                            <span style={marketNameStyle}>{formatMarketLabel(market.marketType)}</span>
                                            <span style={marketCountStyle}>{market.rowCount} rows</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function buildCoverage(rows = []) {
  const bookMap = new Map();
  const uniqueEvents = new Set();
  const uniqueMarkets = new Set();

  for (const row of rows || []) {
    const bookmaker = clean(row.sportsbook || row.bookmaker || "Unknown Book");
    const sport = clean(row.sport || row.league || "UNKNOWN").toUpperCase();
    const eventName = clean(row.eventLabelRaw || row.eventName || row.fixture || "Unknown Event");
    const marketType = clean(row.marketType || row.betType || "unknown_market");

    if (!bookMap.has(bookmaker)) {
      bookMap.set(bookmaker, {
        bookmaker,
        sportsMap: new Map(),
        rowCount: 0,
      });
    }

    const book = bookMap.get(bookmaker);
    book.rowCount += 1;

    if (!book.sportsMap.has(sport)) {
      book.sportsMap.set(sport, {
        sport,
        eventsMap: new Map(),
        rowCount: 0,
      });
    }

    const sportBucket = book.sportsMap.get(sport);
    sportBucket.rowCount += 1;

    if (!sportBucket.eventsMap.has(eventName)) {
      sportBucket.eventsMap.set(eventName, {
        eventName,
        marketsMap: new Map(),
        rowCount: 0,
      });
    }

    const event = sportBucket.eventsMap.get(eventName);
    event.rowCount += 1;

    if (!event.marketsMap.has(marketType)) {
      event.marketsMap.set(marketType, {
        marketType,
        rowCount: 0,
      });
    }

    event.marketsMap.get(marketType).rowCount += 1;

    uniqueEvents.add(`${bookmaker}::${sport}::${eventName}`);
    uniqueMarkets.add(`${bookmaker}::${sport}::${eventName}::${marketType}`);
  }

  const books = Array.from(bookMap.values())
    .map((book) => {
      const sports = Array.from(book.sportsMap.values())
        .map((sport) => {
          const events = Array.from(sport.eventsMap.values())
            .map((event) => {
              const markets = Array.from(event.marketsMap.values()).sort((a, b) =>
                formatMarketLabel(a.marketType).localeCompare(formatMarketLabel(b.marketType))
              );

              const marketCount = markets.length;

              return {
                eventName: event.eventName,
                rowCount: event.rowCount,
                markets,
                marketCount,
                isThin: isThinEvent({ marketCount, rowCount: event.rowCount, markets }),
              };
            })
            .sort((a, b) => {
              if (a.isThin !== b.isThin) return a.isThin ? -1 : 1;
              return a.eventName.localeCompare(b.eventName);
            });

          return {
            sport: sport.sport,
            rowCount: sport.rowCount,
            events,
            eventCount: events.length,
            marketCount: events.reduce((sum, event) => sum + event.marketCount, 0),
          };
        })
        .sort((a, b) => a.sport.localeCompare(b.sport));

      return {
        bookmaker: book.bookmaker,
        rowCount: book.rowCount,
        sports,
        eventCount: sports.reduce((sum, sport) => sum + sport.eventCount, 0),
        marketCount: sports.reduce((sum, sport) => sum + sport.marketCount, 0),
      };
    })
    .sort((a, b) => a.bookmaker.localeCompare(b.bookmaker));

  return {
    books,
    bookCount: books.length,
    eventCount: uniqueEvents.size,
    marketCount: uniqueMarkets.size,
    rowCount: rows.length,
  };
}

function isThinEvent({ marketCount, rowCount, markets }) {
  if (marketCount <= 3) return true;
  if (rowCount <= 6) return true;

  const hasMainLines =
    markets.some((m) => m.marketType === "moneyline_2way" || m.marketType === "moneyline_3way") &&
    markets.some((m) => m.marketType === "spread") &&
    markets.some((m) => m.marketType === "total");

  if (hasMainLines && marketCount === 3) return true;

  return false;
}

function clean(value) {
  return String(value || "").trim();
}

function formatMarketLabel(value) {
  const text = String(value || "");

  const labels = {
    moneyline_2way: "Moneyline",
    moneyline_3way: "3-Way Moneyline",
    spread: "Spread",
    total: "Total",
    player_points: "Points",
    player_assists: "Assists",
    player_rebounds: "Rebounds",
    player_threes: "3-Pointers",
    player_pra: "PRA",
    player_points_rebounds: "Points + Rebounds",
    player_points_assists: "Points + Assists",
    player_rebounds_assists: "Rebounds + Assists",
    double_double: "Double-Double",
    triple_double: "Triple-Double",
    player_goals: "Goals",
    player_shots_on_goal: "Shots on Goal",
    player_saves: "Saves",
    player_power_play_points: "Power Play Points",
    goalie_goals_against: "Goals Against",
    player_blocked_shots: "Blocked Shots",
    anytime_goalscorer: "Anytime Goalscorer",
    first_goalscorer: "First Goalscorer",
    pitcher_strikeouts: "Pitcher Strikeouts",
    pitcher_hits_allowed: "Hits Allowed",
    pitcher_outs_recorded: "Pitcher Outs Recorded",
    pitcher_earned_runs_allowed: "Earned Runs Allowed",
    player_home_runs: "Home Runs",
    player_total_bases: "Total Bases",
    player_hits: "Hits",
    player_rbis: "RBIs",
    player_runs: "Runs",
  };

  return labels[text] || text.replace(/_/g, " ");
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
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const h2Style = {
  margin: 0,
};

const subtleStyle = {
  color: "#666",
  fontSize: 12,
  marginTop: 4,
};

const headerButtonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const summaryPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 800,
  background: "#f9fafb",
  color: "#374151",
};

const showThinButtonStyle = {
  border: "1px solid #86efac",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 900,
  background: "#ecfdf5",
  color: "#166534",
  cursor: "pointer",
};

const emptyThinStyle = {
  border: "1px dashed #d1d5db",
  borderRadius: 10,
  padding: 10,
  color: "#666",
  background: "#f9fafb",
  fontWeight: 700,
};

const bookCardStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: 10,
  background: "#fafafa",
};

const bookHeaderButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
  color: "#111827",
  textAlign: "left",
};

const bookMetaStyle = {
  color: "#4b5563",
  fontSize: 12,
  fontWeight: 800,
};

const sportCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
  background: "#fff",
};

const sportHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  fontWeight: 900,
  marginBottom: 8,
};

const sportHeaderButtonStyle = {
  ...sportHeaderStyle,
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
  color: "#111827",
  textAlign: "left",
};

const sportMetaStyle = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 800,
};

const eventCardStyle = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#e5e7eb",
  borderRadius: 10,
  padding: 9,
  background: "#f9fafb",
};

const thinEventStyle = {
  borderColor: "#f59e0b",
  background: "#fffbeb",
};

const eventHeaderButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
  color: "#111827",
  fontWeight: 900,
};

const eventMetaWrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const thinBadgeStyle = {
  border: "1px solid #f59e0b",
  background: "#fef3c7",
  color: "#92400e",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 11,
  fontWeight: 900,
};

const eventMetaStyle = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 800,
};

const marketGridStyle = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const marketPillStyle = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 999,
  padding: "4px 8px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
};

const marketNameStyle = {
  fontWeight: 900,
  color: "#111827",
};

const marketCountStyle = {
  color: "#6b7280",
  fontWeight: 800,
};