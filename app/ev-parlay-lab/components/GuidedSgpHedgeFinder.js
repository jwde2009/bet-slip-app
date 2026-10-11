"use client";

import { useMemo, useState } from "react";
import { analyzeParlayHedge, breakEvenHedgePrices, parseHedgePrice } from "../utils/parlayHedgeMath";
import { findQuickSgpCandidates, parseQuickSgpPromotion, boostedSgpDecimal } from "../utils/quickSgpDiscovery";

const S = {
  box: { padding: 14, border: "1px solid #cbd5e1", borderRadius: 10, background: "white", display: "grid", gap: 11 },
  title: { fontSize: 16, fontWeight: 750, margin: 0 },
  input: { display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", padding: "10px 11px", border: "1px solid #94a3b8",
    borderRadius: 7, color: "#0f172a", background: "#fff", fontSize: 14 },
  label: { fontWeight: 650, display: "grid", gap: 5, fontSize: 13, minWidth: 0 },
  hint: { fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.5 },
  button: { cursor: "pointer", padding: "9px 12px", borderRadius: 7, border: "1px solid #94a3b8",
    color: "#0f172a", background: "#fff", fontWeight: 700, fontSize: 13 },
  primary: { cursor: "pointer", padding: "11px 16px", borderRadius: 7, border: "1px solid #1d4ed8",
    color: "white", background: "#1d4ed8", fontWeight: 700, fontSize: 14 },
  fieldGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
};
function dollars(n) { return "$" + Number(n).toFixed(2); }
function signed(n) { return (n < 0 ? "−" : "+") + dollars(Math.abs(n)); }
function american(decimal) {
  if (!decimal || decimal <= 1) return "—";
  const n = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
  return n > 0 ? "+" + n : String(n);
}
const resetVerification = { primary: false, opposite: false, total: false };

export default function GuidedSgpHedgeFinder({ rows = [] }) {
  const [promotionText, setPromotionText] = useState("");
  const [searchStarted, setSearchStarted] = useState(false);
  const [sport, setSport] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [primaryBook, setPrimaryBook] = useState("");
  const [primaryRawOdds, setPrimaryRawOdds] = useState("");
  const [oppositeBook, setOppositeBook] = useState("");
  const [oppositeOdds, setOppositeOdds] = useState("");
  const [straightBook, setStraightBook] = useState("");
  const [straightOdds, setStraightOdds] = useState("");
  const [stake, setStake] = useState("");
  const [oppositeCap, setOppositeCap] = useState("");
  const [straightCap, setStraightCap] = useState("");
  const [hedgeBudget, setHedgeBudget] = useState("");
  const [maxLoss, setMaxLoss] = useState("0");
  const [confirmed, setConfirmed] = useState(resetVerification);
  const [showMore, setShowMore] = useState(false);
  const [showMoreCandidates, setShowMoreCandidates] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);

  const promo = useMemo(() => parseQuickSgpPromotion(promotionText), [promotionText]);
  const ideas = useMemo(() => searchStarted && !promo.error
    ? findQuickSgpCandidates(rows, { sport, query: search, limit: 150 }) : [],
  [rows, promo.error, searchStarted, sport, search]);
  const selectedStillListed = ideas.some(idea => idea.id === selected?.id);
  const bookNames = useMemo(() => [...new Set(rows.map(row => row.sportsbook || row.bookmaker).filter(Boolean))].sort(), [rows]);

  function choose(idea) {
    setSelected(idea);
    setPrimaryBook("");
    setPrimaryRawOdds("");
    setOppositeBook("");
    setOppositeOdds("");
    setStraightBook(idea.bestStraightBook);
    setStraightOdds(idea.bestStraightOdds);
    setStake(String(promo.maxStake));
    setOppositeCap("");
    setStraightCap("");
    setHedgeBudget("");
    setMaxLoss("0");
    setConfirmed({ ...resetVerification });
    setAcknowledge(false);
    setShowMore(false);
  }
  const boosted = !promo.error && parseHedgePrice(primaryRawOdds)
    ? boostedSgpDecimal(parseHedgePrice(primaryRawOdds), promo.boostPct) : null;
  const priceInputsComplete = !!selected && boosted &&
    parseHedgePrice(oppositeOdds) && parseHedgePrice(straightOdds) &&
    primaryBook.trim() && oppositeBook.trim() && straightBook.trim() &&
    Number(stake) > 0 && Number(stake) <= promo.maxStake &&
    Number(maxLoss) >= 0 && maxLoss !== "";
  const allConfirmed = Object.values(confirmed).every(Boolean);
  const isNfl = selected?.sport === "NFL";
  const mainIds = ["aSame", "bSame", "otherTotal"];
  const scenarios = selected ? [
    { id: "aSame", label: selected.teamA + " wins + " + selected.direction.toUpperCase() + " " + selected.line },
    { id: "bSame", label: selected.teamB + " wins + " + selected.direction.toUpperCase() + " " + selected.line },
    { id: "otherTotal", label: selected.straightLabel + " (any winner)" },
    ...(isNfl ? [{ id: "tieSame", label: "Game ends tied + " + selected.direction.toUpperCase() + " " + selected.line }] : []),
  ] : [];
  const hedgeOptions = priceInputsComplete ? {
    primaryStake: Number(stake), primaryOdds: boosted.toFixed(8) + "x",
    primaryCovers: ["aSame"], scenarios,
    optimizeIds: isNfl ? mainIds : scenarios.map(x => x.id),
    totalHedgeBudget: hedgeBudget,
    hedges: [
      { id: "opposite", book: oppositeBook, label: selected.hedgeLabel, odds: oppositeOdds, maxStake: oppositeCap,
        covers: ["bSame"] },
      { id: "total", book: straightBook, label: selected.straightLabel, odds: straightOdds, maxStake: straightCap,
        covers: ["otherTotal"] },
    ],
  } : null;
  const result = hedgeOptions && allConfirmed ? analyzeParlayHedge(hedgeOptions) : null;
  const qualified = !!result && !result.error && result.allCovered && result.actualMinimum >= -0.005;
  const withinLimit = !!result && !result.error && result.allCovered &&
    result.actualMinimum >= -Number(maxLoss) - 0.005;
  const breakEvens = result && !result.error ? breakEvenHedgePrices(hedgeOptions) : [];
  const selectionChanged = selected && !selectedStillListed;

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={S.box}>
      <h3 style={S.title}>1. Tell me about your boost</h3>
      <label style={S.label}>Promotion description
        <input style={S.input} value={promotionText}
          onChange={e => { setPromotionText(e.target.value); setSearchStarted(false); setSelected(null); }}
          placeholder='SGP parlay 20% odds boost max $250' />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" style={S.button} onClick={() => {
          setPromotionText("SGP parlay 20% odds boost max $250"); setSelected(null); setSearchStarted(true);
        }}>Use example promotion</button>
        <button type="button" style={S.primary} onClick={() => { setSearchStarted(true); setSelected(null); }}
          disabled={!!promo.error}>Find candidate parlays</button>
      </div>
      {promotionText && promo.error && <p style={{ ...S.hint, color: "#991b1b" }}>{promo.error}</p>}
      {!promo.error && <p style={S.hint}>Detected: <strong>{promo.boostPct}% profit boost</strong> on an SGP,
        with a <strong>{dollars(promo.maxStake)} maximum stake</strong>.
        Boost rules, eligible legs, and actual SGP prices must be checked at the sportsbook.</p>}
    </div>

    {searchStarted && !promo.error && <div style={S.box}>
      <h3 style={S.title}>2. Pick a combination worth checking</h3>
      <p style={S.hint}>These are <strong>candidate structures</strong> from your imported full-game moneyline and total markets.
        They're not confirmed +EV bets or guaranteed hedges. No correlated SGP price is guessed.</p>
      <div style={S.fieldGrid}>
        <label style={S.label}>League
          <select value={sport} onChange={e => { setSport(e.target.value); setSelected(null); }} style={S.input}>
            <option value="ALL">All supported leagues</option>
            {["NFL", "NBA", "WNBA", "NCAAM", "NCAAF", "MLB", "NHL"].map(x =>
              <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label style={S.label}>Search game / league
          <input style={S.input} value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }}
            placeholder="Ravens, Falcons, NFL…" />
        </label>
      </div>
      {!ideas.length ? <p style={S.hint}>No matching structures found in your {rows.length} loaded rows.
        Import both teams' moneylines and a matching over/under pair for a full-game market, or try another sport.</p> :
        <>
          <p style={S.hint}>{ideas.length} structures found{ideas.length === 150 ? " (first 150 only)" : ""}.
            Shown by highest available complementary straight price—not estimated parlay value.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {ideas.slice(0, showMoreCandidates ? 40 : 8).map(idea =>
              <div key={idea.id} style={{
                border: "1px solid " + (selected?.id === idea.id ? "#2563eb" : "#cbd5e1"),
                borderRadius: 8, padding: 11, display: "grid", gap: 6, background: selected?.id === idea.id ? "#eff6ff" : "white",
              }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center",
                  justifyContent: "space-between", gap: 7 }}>
                  <strong style={{ fontSize: 14 }}>{idea.sport} · {idea.event}</strong>
                  <button style={S.button} type="button" onClick={() => choose(idea)}>
                    {selected?.id === idea.id ? "Selected" : "Check these odds"}</button>
                </div>
                <div style={{ fontSize: 13 }}>Primary SGP: <strong>{idea.primaryLabel}</strong></div>
                <div style={{ fontSize: 13 }}>Potential hedges: {idea.hedgeLabel} (SGP), plus
                  {" "}{idea.straightLabel} (straight)</div>
                <p style={S.hint}>Complementary straight: {idea.bestStraightOdds} at {idea.bestStraightBook || "imported book"}.
                  This quote must be rechecked.</p>
              </div>)}
          </div>
          {ideas.length > 8 && <button type="button" style={S.button}
            onClick={() => setShowMoreCandidates(!showMoreCandidates)}>
            {showMoreCandidates ? "Show fewer" : "Show more candidates"}</button>}
        </>}
    </div>}

    {searchStarted && selected && !selectionChanged && <div style={S.box}>
      <h3 style={S.title}>3. Confirm the actual sportsbook odds</h3>
      <p style={S.hint}><strong>{selected.event}</strong> — {selected.primaryLabel}.
        These must be the exact sportsbook prices for the combinations shown. The straight odds
        are prefilled from your import as a starting point, not verified live.</p>
      <datalist id="guided-hedge-books">{bookNames.map(book => <option key={book} value={book} />)}</datalist>
      <div style={S.fieldGrid}>
        <label style={S.label}>Boosted SGP sportsbook
          <input list="guided-hedge-books" style={S.input} value={primaryBook}
            placeholder="BetMGM" onChange={e => { setPrimaryBook(e.target.value); setConfirmed(x => ({ ...x, primary: false })); }} />
        </label>
        <label style={S.label}>Raw SGP odds (before boost)
          <input style={S.input} value={primaryRawOdds} placeholder="+250"
            onChange={e => { setPrimaryRawOdds(e.target.value); setConfirmed(x => ({ ...x, primary: false })); }} />
        </label>
        <label style={S.label}>Primary stake ($), max {dollars(promo.maxStake)}
          <input style={S.input} type="number" min="0.01" max={promo.maxStake} step="0.01"
            value={stake} onChange={e => setStake(e.target.value)} />
        </label>
      </div>
      {boosted && <div style={S.hint}>Boosted payout odds: <strong>{american(boosted)}</strong> (decimal {boosted.toFixed(3)}).
        Assuming a {promo.boostPct}% increase to profit, not payout.</div>}
      <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={confirmed.primary}
          onChange={e => setConfirmed(x => ({ ...x, primary: e.target.checked }))} />
        I've checked this exact primary SGP price and boost eligibility at the sportsbook.
      </label>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, display: "grid", gap: 10 }}>
        <strong>Hedge SGP: {selected.hedgeLabel}</strong>
        <div style={S.fieldGrid}>
          <label style={S.label}>Hedge SGP sportsbook
            <input list="guided-hedge-books" style={S.input} value={oppositeBook}
              placeholder="theScore" onChange={e => { setOppositeBook(e.target.value); setConfirmed(x => ({ ...x, opposite: false })); }} />
          </label>
          <label style={S.label}>Actual SGP odds
            <input style={S.input} value={oppositeOdds} placeholder="+120 or 2.20x"
              onChange={e => { setOppositeOdds(e.target.value); setConfirmed(x => ({ ...x, opposite: false })); }} />
          </label>
          <label style={S.label}>Maximum hedge stake ($, optional)
            <input type="number" min="0" step="0.01" style={S.input} value={oppositeCap}
              onChange={e => setOppositeCap(e.target.value)} placeholder="Enter available balance or bet limit" />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={confirmed.opposite}
            onChange={e => setConfirmed(x => ({ ...x, opposite: e.target.checked }))} />
          I've checked this exact opposite SGP price and it is allowed.
        </label>
      </div>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, display: "grid", gap: 10 }}>
        <strong>Complementary straight: {selected.straightLabel}</strong>
        <div style={S.fieldGrid}>
          <label style={S.label}>Straight-bet sportsbook
            <input list="guided-hedge-books" style={S.input} value={straightBook}
              onChange={e => { setStraightBook(e.target.value); setConfirmed(x => ({ ...x, total: false })); }} />
          </label>
          <label style={S.label}>Current straight odds
            <input style={S.input} value={straightOdds}
              onChange={e => { setStraightOdds(e.target.value); setConfirmed(x => ({ ...x, total: false })); }} />
          </label>
          <label style={S.label}>Maximum straight stake ($, optional)
            <input type="number" min="0" step="0.01" style={S.input} value={straightCap}
              onChange={e => setStraightCap(e.target.value)} placeholder="Enter available balance or bet limit" />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={confirmed.total}
            onChange={e => setConfirmed(x => ({ ...x, total: e.target.checked }))} />
          I've checked this exact straight price and full-game settlement rules.
        </label>
      </div>
      <div style={S.fieldGrid}>
        <label style={S.label}>Worst-case loss limit ($)
          <input type="number" style={S.input} min="0" step="1" value={maxLoss}
            onChange={e => setMaxLoss(e.target.value)} />
        </label>
        <label style={S.label}>Maximum combined hedge spending ($, optional)
          <input type="number" style={S.input} min="0" step="0.01"
            value={hedgeBudget} onChange={e => setHedgeBudget(e.target.value)}
            placeholder="Leave blank if unrestricted" />
        </label>
      </div>
      {!allConfirmed && <p style={S.hint}>The hedge calculation appears after all three price confirmations.
        Editing a confirmed price requires confirming it again.</p>}
      {allConfirmed && !priceInputsComplete && <p style={{ ...S.hint, color: "#991b1b" }}>
        Enter valid SGP and straight prices, sportsbook names, and a primary stake within your promotion limit.</p>}
    </div>}

    {searchStarted && selected && result && !result.error && <div style={S.box}>
      <h3 style={S.title}>4. Hedge calculation</h3>
      <div style={{ fontSize: 17, fontWeight: 800, color: qualified ? "#166534" : "#991b1b" }}>
        {qualified ? "QUALIFIED — no loss across modeled outcomes" :
          !result.allCovered ? "NOT QUALIFIED — incomplete outcome coverage" :
            withinLimit ? "Within your chosen loss limit — not a guaranteed profit" :
              "NOT QUALIFIED — exceeds your loss limit"}
      </div>
      <p style={S.hint}>No bets have been placed. A positive result requires exhaustive,
        mutually exclusive settlement outcomes and the actual prices and limits to hold.</p>
      <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
        <div>Boosted SGP: <strong>{dollars(Number(stake))} at {american(boosted)} ({primaryBook})</strong></div>
        {result.hedges.map((h, i) => <div key={h.id}>{h.label}:
          <strong> {dollars(result.stakes[i])} at {h.odds} ({h.book})</strong></div>)}
        <div>Total stake: <strong>{dollars(result.totalStaked)}</strong></div>
      </div>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "grid", gap: 8 }}>
        <strong>Net result by possible outcome</strong>
        {result.outcomes.map(o => <div key={o.id} style={{ display: "flex",
          gap: 10, justifyContent: "space-between", fontSize: 13 }}>
          <span>{o.label}</span>
          <strong style={{ color: o.profit < 0 ? "#991b1b" : "#166534" }}>{signed(o.profit)}</strong>
        </div>)}
      </div>
      <strong style={{ color: result.actualMinimum < 0 ? "#991b1b" : "#166534" }}>
        Worst listed outcome: {signed(result.actualMinimum)}
      </strong>
      {!result.allCovered && <p style={{ ...S.hint, color: "#991b1b" }}>
        Uncovered: {result.uncovered.join("; ")}. This outcome loses all stakes, regardless
        of profits in other outcomes. Do not treat the hedge as risk-free.</p>}
      {breakEvens.length > 0 && <div style={{ ...S.hint, display: "grid", gap: 3 }}>
        <strong>Prices needed to break even across the main three outcomes:</strong>
        {breakEvens.map(t => <div key={t.index}>{result.hedges[t.index]?.label}: {t.requiredDecimal.toFixed(3)}x</div>)}
        {isNfl && <div>Targets do not eliminate the uncovered tie scenario.</div>}
      </div>}
      <button type="button" style={S.button} onClick={() => setShowMore(!showMore)}>
        {showMore ? "Hide" : "Show"} assumptions and details</button>
      {showMore && <p style={S.hint}>This template models a final two-way winner and a half-point total.
        It excludes push/void/partial-settlement cases; NFL ties with the same-side total remain uncovered.
        Confirm overtime, void rules, bet limits, and the primary boost's application before placing any bet.</p>}
      <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={acknowledge} onChange={e => setAcknowledge(e.target.checked)} />
        I understand this is a calculation based on quotes, not an executable betslip.</label>
    </div>}
    {result?.error && <div style={{ ...S.box, color: "#991b1b" }}>{result.error}</div>}
  </div>;
}
