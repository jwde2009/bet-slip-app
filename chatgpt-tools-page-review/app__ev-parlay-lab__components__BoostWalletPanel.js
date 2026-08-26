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
  { value: "ALL", label: "All Loaded Sports" },
  { value: "NBA", label: "NBA" },
  { value: "WNBA", label: "WNBA" },
  { value: "NHL", label: "NHL" },
  { value: "MLB", label: "MLB" },
  { value: "Soccer", label: "Soccer" },
  { value: "Tennis", label: "Tennis" },
  { value: "Golf", label: "Golf" },
  { value: "UFC", label: "UFC / MMA" },
  { value: "NFL", label: "NFL" },
  { value: "NCAAF", label: "NCAAF" },
  { value: "Other", label: "Other" },
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

function getLeagueDisplayName(value) {
  const text = String(value || "ALL").trim().toUpperCase();
  if (text === "ALL") return "All Loaded Sports";

  const match = LEAGUE_OPTIONS.find(
    (option) => String(option.value).toUpperCase() === text
  );

  return match?.label || String(value || "League");
}

function buildAutoBoostName(draft = {}) {
  const league = getLeagueDisplayName(draft.league || "ALL");
  const boostPct = Number(draft.boostPct || 0);
  const book = getBookDisplayName(draft.sportsbook || "DraftKings");
  const sgpText = draft.isSgp ? " SGP" : "";

  return `${league} ${boostPct}%${sgpText} ${book}`.replace(/\s+/g, " ").trim();
}

function toLocalDateTimeInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayEndLocalValue();

  const pad = (part) => String(part).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function boostToDraft(boost = {}) {
  return {
    sportsbook: boost.sportsbook || "DraftKings",
    league: String(boost.league || "ALL").trim().toUpperCase(),
    isSgp: boost.isSgp === true,
    boostPct: Number(boost.boostPct ?? 20),
    minLegs: Number(boost.minLegs ?? 2),
    minTotalAmericanOdds: boost.minTotalAmericanOdds ?? 200,
    maxStake: Number(boost.maxStake ?? 10),
    expiresAt: boost.expiresAt ? toLocalDateTimeInputValue(boost.expiresAt) : todayEndLocalValue(),
    notes: boost.notes || "",
    forcedEventName: boost.forcedEventName || "",
    requiredLegText: boost.requiredLegText || "",
    forcedMarketType: boost.forcedMarketType || "",
    requiredMainLineLegs: boost.requiredMainLineLegs ?? "",
  };
}

function getBoostExpirationMeta(boost = {}) {
  const expiresAt = new Date(boost.expiresAt || "").getTime();

  if (!Number.isFinite(expiresAt)) {
    return {
      label: "No expiration",
      color: "#374151",
      background: "#f3f4f6",
      border: "#d1d5db",
      rank: Number.MAX_SAFE_INTEGER,
    };
  }

  const msLeft = expiresAt - Date.now();
  const hoursLeft = msLeft / (60 * 60 * 1000);
  const label = `Expires ${new Date(expiresAt).toLocaleString()}`;

  if (hoursLeft <= 24) {
    return {
      label,
      color: "#991b1b",
      background: "#fee2e2",
      border: "#fecaca",
      rank: expiresAt,
    };
  }

  if (hoursLeft <= 48) {
    return {
      label,
      color: "#92400e",
      background: "#fef3c7",
      border: "#fbbf24",
      rank: expiresAt,
    };
  }

  return {
    label,
    color: "#166534",
    background: "#dcfce7",
    border: "#86efac",
    rank: expiresAt,
  };
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
  const [editingBoostId, setEditingBoostId] = useState("");
  const [boostLeagueFilter, setBoostLeagueFilter] = useState("ALL");
  const [boostBookFilter, setBoostBookFilter] = useState("ALL");
  const [boostSgpFilter, setBoostSgpFilter] = useState("ALL");
  const [boostAmountFilter, setBoostAmountFilter] = useState("ALL");
  const [boostSortMode, setBoostSortMode] = useState("expiration_soonest");

  const [draft, setDraft] = useState(() => ({
    sportsbook:
      filters.selectedTargetBook && filters.selectedTargetBook !== "ALL"
        ? filters.selectedTargetBook
        : "DraftKings",
    league:
      filters.selectedSport && String(filters.selectedSport).trim()
        ? String(filters.selectedSport).trim().toUpperCase()
        : "ALL",
    isSgp: filters.forceSameGame === true,
    boostPct: Number(filters.boostPct ?? 20),
    minLegs: Number(filters.maxLegs ?? 2),
    minTotalAmericanOdds: filters.minTotalAmericanOdds ?? 200,
    maxStake: Number(filters.stake ?? 10),
    expiresAt: todayEndLocalValue(),
    notes: "",
    forcedEventName: "",
    requiredLegText: "",
    forcedMarketType: "",
    requiredMainLineLegs: "",
  }));

  const visibleBoosts = useMemo(() => {
    return (boosts || [])
      .filter((boost) => boost.status !== "expired")
      .filter((boost) => {
        const league = String(boost.league || "ALL").trim().toUpperCase();
        const book = String(boost.sportsbook || "").trim();
        const boostPct = Number(boost.boostPct || 0);

        if (boostLeagueFilter !== "ALL" && league !== boostLeagueFilter) return false;
        if (boostBookFilter !== "ALL" && book !== boostBookFilter) return false;
        if (boostSgpFilter === "SGP" && boost.isSgp !== true) return false;
        if (boostSgpFilter === "NON_SGP" && boost.isSgp === true) return false;
        if (boostAmountFilter !== "ALL" && boostPct !== Number(boostAmountFilter)) return false;

        return true;
      })
      .sort((a, b) => {
        const aMeta = getBoostExpirationMeta(a);
        const bMeta = getBoostExpirationMeta(b);
        const aBoost = Number(a.boostPct || 0);
        const bBoost = Number(b.boostPct || 0);
        const aBook = String(a.sportsbookLabel || a.sportsbook || "");
        const bBook = String(b.sportsbookLabel || b.sportsbook || "");
        const aLeague = getLeagueDisplayName(a.league || "ALL");
        const bLeague = getLeagueDisplayName(b.league || "ALL");

        if (boostSortMode === "expiration_latest") return bMeta.rank - aMeta.rank;
        if (boostSortMode === "boost_high") return bBoost - aBoost || aMeta.rank - bMeta.rank;
        if (boostSortMode === "boost_low") return aBoost - bBoost || aMeta.rank - bMeta.rank;
        if (boostSortMode === "book_az") return aBook.localeCompare(bBook) || aMeta.rank - bMeta.rank;
        if (boostSortMode === "league_az") return aLeague.localeCompare(bLeague) || aMeta.rank - bMeta.rank;
        if (boostSortMode === "sgp_first") return Number(b.isSgp === true) - Number(a.isSgp === true) || aMeta.rank - bMeta.rank;
        if (boostSortMode === "non_sgp_first") return Number(a.isSgp === true) - Number(b.isSgp === true) || aMeta.rank - bMeta.rank;

        // Default: expiring soonest closest to controls.
        if (aMeta.rank !== bMeta.rank) return aMeta.rank - bMeta.rank;

        const statusRank = (boost) => (boost.status === "used" ? 1 : 0);
        return statusRank(a) - statusRank(b);
      });
  }, [boosts, boostLeagueFilter, boostBookFilter, boostSgpFilter, boostAmountFilter, boostSortMode]);
  const activeBoosts = useMemo(
    () => visibleBoosts.filter((boost) => boost.status !== "used"),
    [visibleBoosts]
  );

  const availableBooksForFilter = useMemo(
    () => Array.from(new Set((boosts || []).map((boost) => boost.sportsbook).filter(Boolean))).sort(),
    [boosts]
  );

  const availableAmountsForFilter = useMemo(
    () =>
      Array.from(new Set((boosts || []).map((boost) => Number(boost.boostPct)).filter(Number.isFinite)))
        .sort((a, b) => a - b),
    [boosts]
  );

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function buildBoostPayload(existingId = "") {
    const boostPct = Number(draft.boostPct);
    const minLegs = Number(draft.minLegs);
    const maxStake = Number(draft.maxStake);
    const minTotalAmericanOdds = Number(draft.minTotalAmericanOdds);

    return {
      ...(existingId ? {} : { id: makeBoostId(), createdAt: new Date().toISOString() }),
      status: existingId ? undefined : "available",
      sportsbook: String(draft.sportsbook || "Other").trim(),
      sportsbookLabel: getBookDisplayName(draft.sportsbook || "Other"),
      league: String(draft.league || "ALL").trim().toUpperCase(),
      isSgp: draft.isSgp === true,
      name: buildAutoBoostName(draft),
      boostPct: Number.isFinite(boostPct) ? boostPct : 0,
      minLegs: Number.isFinite(minLegs) ? minLegs : 0,
      minTotalAmericanOdds: Number.isFinite(minTotalAmericanOdds) ? minTotalAmericanOdds : null,
      maxStake: Number.isFinite(maxStake) ? maxStake : 0,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : "",
      notes: String(draft.notes || "").trim(),
      forcedEventName: String(draft.forcedEventName || "").trim(),
      requiredLegText: String(draft.requiredLegText || "").trim(),
      forcedMarketType: String(draft.forcedMarketType || "").trim(),
      requiredMainLineLegs:
        draft.requiredMainLineLegs !== "" && Number.isFinite(Number(draft.requiredMainLineLegs))
          ? Number(draft.requiredMainLineLegs)
          : "",
      usedAt: existingId ? undefined : "",
      usedParlayId: existingId ? undefined : "",
    };
  }

  function cleanUndefinedFields(payload = {}) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  function addBoost() {
    const boost = cleanUndefinedFields(buildBoostPayload());
    onAddBoost?.(boost);

    setDraft((prev) => ({
      ...prev,
      notes: "",
      forcedEventName: "",
      requiredLegText: "",
      forcedMarketType: "",
      requiredMainLineLegs: "",
      expiresAt: todayEndLocalValue(),
    }));
  }

  function beginEditBoost(boost) {
    setEditingBoostId(boost.id || "");
    setDraft(boostToDraft(boost));
    setIsCollapsed(false);
  }

  function cancelEditBoost() {
    setEditingBoostId("");
    setDraft((prev) => ({
      ...prev,
      notes: "",
      forcedEventName: "",
      requiredLegText: "",
      forcedMarketType: "",
      requiredMainLineLegs: "",
      expiresAt: todayEndLocalValue(),
    }));
  }

  function saveEditedBoost() {
    if (!editingBoostId) return;

    onUpdateBoost?.(editingBoostId, cleanUndefinedFields(buildBoostPayload(editingBoostId)));
    setEditingBoostId("");
    setDraft((prev) => ({
      ...prev,
      notes: "",
      forcedEventName: "",
      requiredLegText: "",
      forcedMarketType: "",
      requiredMainLineLegs: "",
      expiresAt: todayEndLocalValue(),
    }));
  }

  function loadBoostAndCopyToDraft(boost) {
    onLoadBoostIntoFilters?.(boost);
    setDraft(boostToDraft(boost));
    setEditingBoostId("");
    setIsCollapsed(false);
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>6. Boost Wallet</h2>
          <div style={mutedStyle}>
            Available boosts: <strong>{activeBoosts.length}</strong> • Saved boosts:{" "}
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
                  <option key={league.value} value={league.value}>
                    {league.label}
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

            <label style={{ ...labelStyle, gridColumn: "span 3" }}>
              Force Specific Game
              <input
                value={draft.forcedEventName}
                onChange={(event) => updateDraft("forcedEventName", event.target.value)}
                placeholder="STL Cardinals @ KC Royals"
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 3" }}>
              Force Individual Leg
              <input
                value={draft.requiredLegText}
                onChange={(event) => updateDraft("requiredLegText", event.target.value)}
                placeholder="Bobby Witt HR / Cade Cunningham points / etc."
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 3" }}>
              Force Market For All Legs
              <input
                value={draft.forcedMarketType}
                onChange={(event) => updateDraft("forcedMarketType", event.target.value)}
                placeholder="Home Runs / NBA Points / UFC Winning Method"
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: "span 3" }}>
              Required Main-Line Legs
              <select
                value={draft.requiredMainLineLegs}
                onChange={(event) => updateDraft("requiredMainLineLegs", event.target.value)}
                style={inputStyle}
              >
                <option value="">No requirement</option>
                <option value="1">At least 1 main-line leg</option>
                <option value="2">At least 2 main-line legs</option>
                <option value="3">At least 3 main-line legs</option>
                <option value="4">At least 4 main-line legs</option>
              </select>
            </label>

            <div style={{ gridColumn: "span 3", display: "flex", gap: 8, alignItems: "end" }}>
              <button
                type="button"
                onClick={editingBoostId ? saveEditedBoost : addBoost}
                style={primaryButtonStyle}
              >
                {editingBoostId ? "Save Boost Edits" : "Save Boost"}
              </button>

              {editingBoostId ? (
                <button type="button" onClick={cancelEditBoost} style={secondaryButtonStyle}>
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </div>

          <div style={filterGridStyle}>
            <label style={miniLabelStyle}>
              Filter League
              <select
                value={boostLeagueFilter}
                onChange={(event) => setBoostLeagueFilter(event.target.value)}
                style={inputStyle}
              >
                <option value="ALL">All leagues</option>
                {LEAGUE_OPTIONS.filter((option) => option.value !== "ALL").map((option) => (
                  <option key={option.value} value={String(option.value).toUpperCase()}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={miniLabelStyle}>
              Filter Book
              <select
                value={boostBookFilter}
                onChange={(event) => setBoostBookFilter(event.target.value)}
                style={inputStyle}
              >
                <option value="ALL">All books</option>
                {availableBooksForFilter.map((book) => (
                  <option key={book} value={book}>
                    {getBookDisplayName(book)}
                  </option>
                ))}
              </select>
            </label>

            <label style={miniLabelStyle}>
              SGP Filter
              <select
                value={boostSgpFilter}
                onChange={(event) => setBoostSgpFilter(event.target.value)}
                style={inputStyle}
              >
                <option value="ALL">All</option>
                <option value="SGP">SGP only</option>
                <option value="NON_SGP">Non-SGP only</option>
              </select>
            </label>

            <label style={miniLabelStyle}>
              Boost Amount
              <select
                value={boostAmountFilter}
                onChange={(event) => setBoostAmountFilter(event.target.value)}
                style={inputStyle}
              >
                <option value="ALL">All amounts</option>
                {availableAmountsForFilter.map((amount) => (
                  <option key={amount} value={amount}>
                    {amount}%
                  </option>
                ))}
              </select>
            </label>

            <label style={miniLabelStyle}>
              Sort Saved Boosts
              <select
                value={boostSortMode}
                onChange={(event) => setBoostSortMode(event.target.value)}
                style={inputStyle}
              >
                <option value="expiration_soonest">Expiration soonest</option>
                <option value="expiration_latest">Expiration latest</option>
                <option value="boost_high">Boost % highest</option>
                <option value="boost_low">Boost % lowest</option>
                <option value="book_az">Book A-Z</option>
                <option value="league_az">League A-Z</option>
                <option value="sgp_first">SGP first</option>
                <option value="non_sgp_first">Non-SGP first</option>
              </select>
            </label>
          </div>


          <div style={boostListStyle}>
            {visibleBoosts.length === 0 ? (
              <div style={emptyStyle}>No saved boosts match these filters.</div>
            ) : (
              visibleBoosts.map((boost) => {
                const expirationMeta = getBoostExpirationMeta(boost);

                return (
                  <div key={boost.id} style={boostCardStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={boostTitleRowStyle}>
                        <span>{boost.name}</span>
                        <span style={statusPillStyle(boost.status)}>{boost.status || "available"}</span>
                        <span
                          style={{
                            ...boostExpirationPillStyle,
                            color: expirationMeta.color,
                            background: expirationMeta.background,
                            borderColor: expirationMeta.border,
                          }}
                        >
                          {expirationMeta.label}
                        </span>
                      </div>

                      <div style={boostMetaStyle}>
                        {getLeagueDisplayName(boost.league)} • {boost.sportsbookLabel || getBookDisplayName(boost.sportsbook)} • {boost.boostPct}% boost{boost.isSgp ? " • SGP" : ""} • {boost.minLegs}+ legs
                        {boost.minTotalAmericanOdds ? ` • min ${formatAmerican(boost.minTotalAmericanOdds)}` : ""}
                        {boost.maxStake ? ` • max $${Number(boost.maxStake).toFixed(2)}` : ""}
                      </div>

                      {(boost.forcedEventName || boost.requiredLegText || boost.forcedMarketType || boost.requiredMainLineLegs) ? (
                        <div style={boostMetaStyle}>
                          {boost.forcedEventName ? `Game: ${boost.forcedEventName}` : ""}
                          {boost.requiredLegText ? ` • Required leg: ${boost.requiredLegText}` : ""}
                          {boost.forcedMarketType ? ` • Market: ${boost.forcedMarketType}` : ""}
                          {boost.requiredMainLineLegs ? ` • Main-line legs: ${boost.requiredMainLineLegs}` : ""}
                        </div>
                      ) : null}

                      {boost.notes ? <div style={boostMetaStyle}>{boost.notes}</div> : null}
                    </div>

                    <div style={boostActionsStyle}>
                      <button
                        type="button"
                        onClick={() => loadBoostAndCopyToDraft(boost)}
                        style={loadFiltersButtonStyle}
                      >
                        Load Filters
                      </button>

                      <button type="button" onClick={() => beginEditBoost(boost)} style={secondaryButtonStyle}>
                        Edit
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

                      <button type="button" onClick={() => onDeleteBoost?.(boost.id)} style={dangerButtonStyle}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
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

const miniLabelStyle = {
  ...labelStyle,
  fontSize: 11,
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

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginTop: 10,
  marginBottom: 10,
  padding: 10,
  borderRadius: 10,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
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

const boostTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  fontWeight: 900,
  color: "#0f172a",
};

const boostExpirationPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 900,
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
  const used = key === "used";

  if (used) {
    return {
      border: "1px solid #fbbf24",
      background: "#fef3c7",
      color: "#92400e",
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 12,
      fontWeight: 900,
    };
  }

  if (key === "expired") {
    return {
      border: "1px solid #cbd5e1",
      background: "#f1f5f9",
      color: "#475569",
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 12,
      fontWeight: 900,
    };
  }

  return {
    border: "1px solid #86efac",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    fontWeight: 900,
  };
}
