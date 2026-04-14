"use client";

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
  function updateField(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>5. Parlay Filters</h2>

      <div style={gridStyle}>
        <label style={labelStyle}>
          Max Legs
          <input
            type="number"
            value={filters.maxLegs}
            onChange={(e) => updateField("maxLegs", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Min Total Odds (American)
          <input
            type="text"
            list="american-odds-suggestions"
            value={String(filters.minTotalAmericanOdds ?? "")}
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
            value={filters.boostPct}
            onChange={(e) => updateField("boostPct", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Stake
          <input
            type="number"
            value={filters.stake}
            onChange={(e) => updateField("stake", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Bankroll
          <input
            type="number"
            value={filters.bankroll}
            onChange={(e) => updateField("bankroll", Number(e.target.value))}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Kelly Fraction
          <input
            type="number"
            step="0.01"
            value={filters.kellyFraction}
            onChange={(e) => updateField("kellyFraction", Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
  <label>
    <input
      type="checkbox"
      checked={filters.forceSameGame === true}
      onChange={(e) => {
        const checked = e.target.checked;
        updateField("forceSameGame", checked);
        if (checked) {
          updateField("allowSameGame", true);
        }
      }}
    />{" "}
    Force same-game parlay
  </label>

  <label>
    <input
      type="checkbox"
      checked={filters.allowSameGame === true}
      onChange={(e) => {
        const checked = e.target.checked;
        updateField("allowSameGame", checked);
        if (!checked) {
          updateField("forceSameGame", false);
        }
      }}
    />{" "}
    Allow same game
  </label>

  <label>
    <input
      type="checkbox"
      checked={filters.allowRepeats === true}
      onChange={(e) => updateField("allowRepeats", e.target.checked)}
    />{" "}
    Allow repeated teams
  </label>
</div>

      <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>
          Minimum Leg EV %
          <input
            type="number"
            step="0.5"
            value={(((Number.isFinite(filters.minLegEvPct) ? filters.minLegEvPct : -0.02) * 100)).toFixed(1)}
            onChange={(e) => {
              const raw = Number(e.target.value);
              updateField("minLegEvPct", Number.isFinite(raw) ? raw / 100 : -0.02);
            }}
            style={inputStyle}
          />
        </label>
        <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
          Example: -2 allows slightly negative legs; 0 requires each leg to be positive EV.
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

const h2Style = { marginTop: 0, marginBottom: 8 };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
};

const inputStyle = {
  padding: 8,
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
};