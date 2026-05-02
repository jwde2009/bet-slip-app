"use client";

import { useMemo, useState } from "react";

const BOOK_OPTIONS = [
  { value: "DraftKings", label: "DraftKings" },
  { value: "FanDuel", label: "FanDuel" },
  { value: "BetMGM", label: "BetMGM" },
  { value: "TheScore", label: "The Score" },
  { value: "Caesars", label: "Caesars" },
  { value: "Other", label: "Other" },
];

const LEAGUE_OPTIONS = [
  "NBA",
  "NHL",
  "MLB",
  "Soccer",
  "Tennis",
  "Golf",
  "UFC",
  "NFL",
  "NCAAF",
  "Other",
];

function todayEndLocalValue() {
  const date = new Date();
  date.setHours(23, 59, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function makeBoostId() {
  return `boost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getBookDisplayName(value) {
  const match = BOOK_OPTIONS.find((book) => book.value === value);
  return match?.label || String(value || "Book");
}

function buildAutoBoostName(draft = {}) {
  const league = String(draft.league || "NBA").trim();
  const boostPct = Number(draft.boostPct || 0);
  const book = getBookDisplayName(draft.sportsbook || "DraftKings");
  const sgpText = draft.isSgp ? " SGP" : "";

  return `${league} ${boostPct}%${sgpText} ${book}`.replace(/\s+/g, " ").trim();
}

export default function BoostWalletPanel({
  boosts = [],
  filters = {},
  onAddBoost,
  onUpdateBoost,
  onDeleteBoost,
  onLoadBoostIntoFilters,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [draft, setDraft] = useState(() => ({
    sportsbook:
      filters.selectedTargetBook && filters.selectedTargetBook !== "ALL"
        ? filters.selectedTargetBook
        : "DraftKings",
    league:
      filters.selectedSport && filters.selectedSport !== "ALL"
        ? filters.selectedSport
        : "NBA",
    isSgp: filters.forceSameGame === true,
    boostPct: Number(filters.boostPct ?? 20),
    minLegs: Number(filters.maxLegs ?? 3),
    minTotalAmericanOdds: filters.minTotalAmericanOdds ?? 300,
    maxStake: Number(filters.stake ?? 10),
    expiresAt: todayEndLocalValue(),
    notes: "",
  }));

  const activeBoosts = useMemo(
    () => boosts.filter((boost) => boost.status !== "used" && boost.status !== "expired"),
    [boosts]
  );

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function addBoost() {
    const boostPct = Number(draft.boostPct);
    const minLegs = Number(draft.minLegs);
    const maxStake = Number(draft.maxStake);
    const minTotalAmericanOdds = Number(draft.minTotalAmericanOdds);
    const name = buildAutoBoostName(draft);

    const boost = {
      id: makeBoostId(),
      createdAt: new Date().toISOString(),
      status: "available",
      sportsbook: String(draft.sportsbook || "Other").trim(),
      sportsbookLabel: getBookDisplayName(draft.sportsbook || "Other"),
      league: String(draft.league || "Other").trim(),
      isSgp: draft.isSgp === true,
      name,
      boostPct: Number.isFinite(boostPct) ? boostPct : 0,
      minLegs: Number.isFinite(minLegs) ? minLegs : 0,
      minTotalAmericanOdds: Number.isFinite(minTotalAmericanOdds)
        ? minTotalAmericanOdds
        : null,
      maxStake: Number.isFinite(maxStake) ? maxStake : 0,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : "",
      notes: String(draft.notes || "").trim(),
      usedAt: "",
      usedParlayId: "",
    };

    onAddBoost?.(boost);

    setDraft((prev) => ({
      ...prev,
      notes: "",
      expiresAt: todayEndLocalValue(),
    }));
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>6. Boost Wallet</h2>
          <div style={mutedStyle}>
            Available boosts: <strong>{activeBoosts.length}</strong> • Saved boosts: {" "}
            <strong>{boosts.length}</strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          style={toggleButtonStyle}
        >
          {isCollapsed ? "Show Boost Wallet" : "Hide Boost Wallet"}
        </button>
      </div>

      {!isCollapsed ? (
        <>
          <div style={formGridStyle}>
            <label style={{ ...labelStyle, gridColumn: "span 2" }}>
              League
              <select
                value={draft.league}
                onChange={(event) => updateDraft("league", event.target.value)}
                style={inputStyle}
              >
                {LEAGUE_OPTIONS.map((league) => (
                  <option key={league} value={league}>
                    {league}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 2" }}>
              Book
              <select
                value={draft.sportsbook}
                onChange={(event) => updateDraft("sportsbook", event.target.value)}
                style={inputStyle}
              >
                {BOOK_OPTIONS.map((book) => (
                  <option key={book.value} value={book.value}>
                    {book.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...checkboxCardStyle, gridColumn: "span 2" }}>
              <input
                type="checkbox"
                checked={draft.isSgp === true}
                onChange={(event) => updateDraft("isSgp", event.target.checked)}
              />
              Same Game Parlay / SGP boost
            </label>

            <div style={{ ...previewCardStyle, gridColumn: "span 3" }}>
              <div style={previewLabelStyle}>Auto Boost Name</div>
              <div style={previewNameStyle}>{buildAutoBoostName(draft)}</div>
            </div>

            <label style={{ ...labelStyle, gridColumn: "span 1" }}>
              Boost %
              <input
                type="number"
                value={draft.boostPct}
                onChange={(event) => updateDraft("boostPct", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 1" }}>
              Min Legs
              <input
                type="number"
                value={draft.minLegs}
                onChange={(event) => updateDraft("minLegs", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 1" }}>
              Min Total Odds
              <input
                type="number"
                value={draft.minTotalAmericanOdds}
                onChange={(event) => updateDraft("minTotalAmericanOdds", event.target.value)}
                style={inputStyle}
                placeholder="+300"
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 2" }}>
              Max Stake
              <input
                type="number"
                value={draft.maxStake}
                onChange={(event) => updateDraft("maxStake", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 3" }}>
              Expiration
              <input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(event) => updateDraft("expiresAt", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 5" }}>
              Notes
              <input
                value={draft.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
                style={inputStyle}
                placeholder="NBA only, no live bets, etc."
              />
            </label>

            <div style={{ gridColumn: "span 2", display: "flex", alignItems: "end" }}>
              <button type="button" onClick={addBoost} style={primaryButtonStyle}>
                Save Boost
              </button>
            </div>
          </div>

          <div style={boostListStyle}>
            {boosts.length === 0 ? (
              <div style={emptyStyle}>No boosts saved yet.</div>
            ) : (
              boosts.map((boost) => (
                <div key={boost.id} style={boostCardStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={boostTitleStyle}>
                      {boost.name}{" "}
                      <span style={statusPillStyle(boost.status)}>{boost.status || "available"}</span>
                    </div>
                    <div style={boostMetaStyle}>
                      {boost.league || "League"} • {boost.sportsbookLabel || getBookDisplayName(boost.sportsbook)} • {boost.boostPct}% boost{boost.isSgp ? " • SGP" : ""} • {boost.minLegs}+ legs
                      {boost.minTotalAmericanOdds ? ` • min ${formatAmerican(boost.minTotalAmericanOdds)}` : ""}
                      {boost.maxStake ? ` • max $${Number(boost.maxStake).toFixed(2)}` : ""}
                    </div>
                    <div style={boostMetaStyle}>
                      Expires: {formatDateTime(boost.expiresAt)}
                      {boost.notes ? ` • ${boost.notes}` : ""}
                    </div>
                  </div>

                  <div style={boostActionsStyle}>
                    <button
                      type="button"
                      onClick={() => onLoadBoostIntoFilters?.(boost)}
                      style={loadFiltersButtonStyle}
                    >
                      Load Filters
                    </button>

                    {boost.status === "used" ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBoost?.(boost.id, {
                            status: "available",
                            usedAt: "",
                            usedParlayId: "",
                          })
                        }
                        style={secondaryButtonStyle}
                      >
                        Mark Available
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBoost?.(boost.id, {
                            status: "used",
                            usedAt: new Date().toISOString(),
                          })
                        }
                        style={secondaryButtonStyle}
                      >
                        Mark Used
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteBoost?.(boost.id)}
                      style={dangerButtonStyle}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function formatAmerican(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`;
}

function formatDateTime(value) {
  if (!value) return "No expiration";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return String(value);
  }
}

const sectionStyle = {
  background: "#fff",
  border: "1px solid #d6dbe3",
  borderRadius: 14,
  padding: 16,
  marginBottom: 16,
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.05)",
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
  marginTop: 0,
  marginBottom: 4,
};

const mutedStyle = {
  color: "#64748b",
  fontSize: 13,
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 12,
  alignItems: "stretch",
};

const labelStyle = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  minWidth: 0,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  minWidth: 0,
};

const primaryButtonStyle = {
  width: "100%",
  border: "1px solid #86efac",
  borderRadius: 999,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 900,
  background: "#dcfce7",
  color: "#166534",
  cursor: "pointer",
};

const loadFiltersButtonStyle = {
  border: "1px solid #fbbf24",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 900,
  background: "#fffbeb",
  color: "#92400e",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 900,
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
};

const toggleButtonStyle = {
  ...secondaryButtonStyle,
};

const dangerButtonStyle = {
  border: "1px solid #fca5a5",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 900,
  background: "#fff",
  color: "#991b1b",
  cursor: "pointer",
};

const checkboxCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 900,
  color: "#334155",
  background: "#f8fafc",
  minWidth: 0,
};

const previewCardStyle = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 8,
  padding: "8px 10px",
  minWidth: 0,
};

const previewLabelStyle = {
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: 3,
};

const previewNameStyle = {
  fontSize: 14,
  fontWeight: 900,
  overflowWrap: "anywhere",
};

const boostListStyle = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

const boostCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
  background: "#f8fafc",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
};

const boostTitleStyle = {
  fontWeight: 900,
  color: "#0f172a",
};

const boostMetaStyle = {
  color: "#64748b",
  fontSize: 12,
  marginTop: 3,
};

const boostActionsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const emptyStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
  background: "#f8fafc",
  color: "#64748b",
  fontWeight: 700,
};

function statusPillStyle(status) {
  const key = String(status || "available").toLowerCase();

  if (key === "used") {
    return {
      border: "1px solid #fca5a5",
      background: "#fee2e2",
      color: "#991b1b",
      borderRadius: 999,
      padding: "2px 7px",
      fontSize: 10,
      fontWeight: 900,
    };
  }

  if (key === "expired") {
    return {
      border: "1px solid #cbd5e1",
      background: "#f1f5f9",
      color: "#475569",
      borderRadius: 999,
      padding: "2px 7px",
      fontSize: 10,
      fontWeight: 900,
    };
  }

  return {
    border: "1px solid #86efac",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: 999,
    padding: "2px 7px",
    fontSize: 10,
    fontWeight: 900,
  };
}
