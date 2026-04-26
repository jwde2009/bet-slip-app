"use client";

import { useEffect, useMemo, useState } from "react";

const ODDS_SUGGESTIONS = [
  "-500",
  "-400",
  "-300",
  "-200",
  "-100",
  "+100",
  "+200",
  "+300",
  "+400",
];

export default function ParlayFilters({ filters, setFilters }) {
  const [draftFilters, setDraftFilters] = useState(filters || {});

  useEffect(() => {
    setDraftFilters(filters || {});
  }, [filters]);

  const hasPendingChanges = useMemo(() => {
    try {
      return JSON.stringify(draftFilters || {}) !== JSON.stringify(filters || {});
    } catch (err) {
      return true;
    }
  }, [draftFilters, filters]);

  function updateField(key, value) {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyFilters() {
    setFilters(draftFilters);
  }

  function resetDraft() {
    setDraftFilters(filters || {});
  }

  const useMinLegEvFilter = draftFilters.useMinLegEvFilter !== false;

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <div>
          <h2 style={h2Style}>5. Parlay Filters</h2>
          <div style={helpTextStyle}>
            Edit filters freely, then click Apply Filters to recalculate parlays.
          </div>
        </div>

        <div style={buttonRowStyle}>
          <button
            type="button"
            onClick={applyFilters}
            disabled={!hasPendingChanges}
            style={{
              ...primaryButtonStyle,
              opacity: hasPendingChanges ? 1 : 0.55,
              cursor: hasPendingChanges ? "pointer" : "not-allowed",
            }}
          >
            Apply Filters
          </button>

          <button
            type="button"
            onClick={resetDraft}
            disabled={!hasPendingChanges}
            style={{
              ...secondaryButtonStyle,
              opacity: hasPendingChanges ? 1 : 0.55,
              cursor: hasPendingChanges ? "pointer" : "not-allowed",
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {hasPendingChanges ? (
        <div style={pendingStyle}>
          Filter changes are pending. Parlay results will update after Apply Filters.
        </div>
      ) : null}

            <div style={gridStyle}>
        <label style={labelStyle}>
          Analyze Sport
          <select
            value={draftFilters.selectedSport || "ALL"}
            onChange={(e) => updateField("selectedSport", e.target.value)}
            style={inputStyle}
          >
            <option value="ALL">All Loaded Sports</option>
            <option value="NBA">NBA</option>
            <option value="NHL">NHL</option>
            <option value="MLB">MLB</option>
            <option value="NFL">NFL</option>
            <option value="TENNIS">Tennis</option>
            <option value="UFC">UFC</option>
            <option value="GOLF">Golf</option>
          </select>
        </label>

        <label style={labelStyle}>
          Sort Results
          <select
            value={draftFilters.parlaySortMode || "best_overall"}
            onChange={(e) => updateField("parlaySortMode", e.target.value)}
            style={inputStyle}
          >
            <option value="best_overall">Best Overall</option>
            <option value="boosted_ev">Boosted EV</option>
            <option value="grade">Grade</option>
            <option value="raw_ev">Raw EV</option>
            <option value="hit_probability">Hit Probability</option>
            <option value="kelly">Boosted Kelly</option>
          </select>
        </label>

        <label style={labelStyle}>
          Max Legs
          <input
            type="number"
            min="1"
            max="6"
            value={draftFilters.maxLegs ?? 2}
            onChange={(e) => updateField("maxLegs", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Min Total Odds (American)
          <input
            type="text"
            list="american-odds-suggestions"
            value={String(draftFilters.minTotalAmericanOdds ?? "")}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const parsed = Number(raw.replace(/[^\d+-]/g, ""));
              updateField("minTotalAmericanOdds", Number.isFinite(parsed) ? parsed : "");
            }}
            style={inputStyle}
            placeholder="+200 or -200"
          />
          <datalist id="american-odds-suggestions">
            {ODDS_SUGGESTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

        <label style={labelStyle}>
          Boost %
          <input
            type="number"
            value={draftFilters.boostPct ?? 20}
            onChange={(e) => updateField("boostPct", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Stake
          <input
            type="number"
            value={draftFilters.stake ?? 10}
            onChange={(e) => updateField("stake", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Bankroll
          <input
            type="number"
            value={draftFilters.bankroll ?? 6000}
            onChange={(e) => updateField("bankroll", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Kelly Fraction
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={draftFilters.kellyFraction ?? 0.25}
            onChange={(e) => updateField("kellyFraction", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Max Candidate Legs
          <input
            type="number"
            min="10"
            max="250"
            value={draftFilters.maxCandidateLegs ?? 40}
            onChange={(e) => updateField("maxCandidateLegs", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Max Candidate Legs Per Event
          <input
            type="number"
            min="1"
            max="20"
            value={draftFilters.maxCandidateLegsPerEvent ?? 2}
            onChange={(e) => updateField("maxCandidateLegsPerEvent", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Max Generated Combos
          <input
            type="number"
            min="100"
            max="10000"
            value={draftFilters.maxGeneratedCombos ?? 1000}
            onChange={(e) => updateField("maxGeneratedCombos", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Max Displayed Parlays
          <input
            type="number"
            min="1"
            max="100"
            value={draftFilters.maxDisplayedParlays ?? 10}
            onChange={(e) => updateField("maxDisplayedParlays", Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>
            <div style={checkboxGridStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draftFilters.forceSameSport !== false}
            onChange={(e) => updateField("forceSameSport", e.target.checked)}
          />
          Force same sport
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draftFilters.enforceNoLiveGames !== false}
            onChange={(e) => updateField("enforceNoLiveGames", e.target.checked)}
          />
          Exclude live games
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draftFilters.forceSameGame === true}
            onChange={(e) => updateField("forceSameGame", e.target.checked)}
          />
          Force same-game parlay
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draftFilters.allowSameGame === true}
            onChange={(e) => updateField("allowSameGame", e.target.checked)}
          />
          Allow same game
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draftFilters.allowRepeats === true}
            onChange={(e) => updateField("allowRepeats", e.target.checked)}
          />
          Allow repeated teams / subjects
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draftFilters.allowPreviouslyUsedLegs === true}
            onChange={(e) => updateField("allowPreviouslyUsedLegs", e.target.checked)}
          />
          Allow previously used legs
        </label>


        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={useMinLegEvFilter}
            onChange={(e) => updateField("useMinLegEvFilter", e.target.checked)}
          />
          Use minimum individual-leg EV filter
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ ...labelStyle, maxWidth: 260 }}>
          Minimum Leg EV %
          <input
            type="number"
            step="0.5"
            disabled={!useMinLegEvFilter}
            value={(
              ((Number.isFinite(draftFilters.minLegEvPct)
                ? draftFilters.minLegEvPct
                : -0.03) * 100)
            ).toFixed(1)}
            onChange={(e) => {
              const raw = Number(e.target.value);
              updateField("minLegEvPct", Number.isFinite(raw) ? raw / 100 : -0.03);
            }}
            style={{
              ...inputStyle,
              opacity: useMinLegEvFilter ? 1 : 0.6,
            }}
          />
        </label>

        <div style={helpTextStyle}>
          Default -3 allows slightly negative legs. Safety filters above can keep mixed-sport and live rows out of recommendations.
        </div>
      </div>
    </section>
  );
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

const h2Style = { marginTop: 0, marginBottom: 4 };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const checkboxGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginTop: 14,
};

const labelStyle = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
};

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle = {
  background: "#166534",
  color: "#f0fdf4",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 800,
};

const secondaryButtonStyle = {
  background: "#fff",
  color: "#166534",
  border: "1px solid #86efac",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 800,
};

const pendingStyle = {
  marginBottom: 12,
  padding: "8px 10px",
  borderRadius: 8,
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  fontWeight: 700,
  fontSize: 13,
};

const helpTextStyle = {
  color: "#666",
  fontSize: 12,
  marginTop: 4,
};