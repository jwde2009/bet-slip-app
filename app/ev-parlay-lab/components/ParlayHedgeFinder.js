"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyzeParlayHedge,
  breakEvenHedgePrices,
  parseHedgePrice,
  suggestedImportedHedges,
} from "../utils/parlayHedgeMath";

const KEY = "EV_PARLAY_LAB_HEDGE_FINDER_V1";

function freshHedges(template) {
  return template === "two-way"
    ? [{ id: "second", label: "Opposite winner", book: "", odds: "", maxStake: "", covers: ["b"] }]
    : [
        { id: "second", label: "Other winner + Over", book: "", odds: "", maxStake: "", covers: ["bOver"] },
        { id: "under", label: "Under total", book: "", odds: "", maxStake: "", covers: ["under"] },
      ];
}
const initial = {
  template: "team-total-tie", teamA: "Team A", teamB: "Team B", totalLine: "37.5",
  eventName: "", primaryBook: "", primaryOdds: "", primaryStake: "500",
  primaryLabel: "Team A + Over", maxLoss: "0", hedgeBudget: "",
  hedges: freshHedges("team-total-tie"),
};
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 10px",
  border: "1px solid #94a3b8", borderRadius: 7, background: "#fff", color: "#0f172a", fontSize: 14 };
const labelStyle = { display: "grid", gap: 5, minWidth: 0, fontSize: 13, fontWeight: 600 };
const buttonStyle = { border: "1px solid #94a3b8", borderRadius: 7, padding: "7px 11px",
  background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 600 };
const boxStyle = { border: "1px solid #cbd5e1", borderRadius: 9, padding: 12, display: "grid", gap: 10 };
const noteStyle = { color: "#475569", fontSize: 13, lineHeight: 1.45 };
const money = n => (n < 0 ? "−" : "+") + "$" + Math.abs(n).toFixed(2);
const cash = n => "$" + n.toFixed(2);

function scenariosFor(draft) {
  const a = (draft.teamA || "Team A").trim();
  const b = (draft.teamB || "Team B").trim();
  if (draft.template === "two-way") return [
    { id: "a", label: a + " wins" }, { id: "b", label: b + " wins" },
  ];
  const over = "Over " + draft.totalLine;
  const outcomes = [
    { id: "aOver", label: a + " wins + " + over },
    { id: "bOver", label: b + " wins + " + over },
    { id: "under", label: "Under " + draft.totalLine + " (either winner / tie)" },
  ];
  if (draft.template === "team-total-tie") outcomes.push({
    id: "tieOver", label: "Game ends tied + " + over,
  });
  return outcomes;
}

export default function ParlayHedgeFinder({ rows = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object" && Array.isArray(saved.hedges) &&
          saved.hedges.length <= 3) setDraft({ ...initial, ...saved });
    } catch { /* Invalid local data must not break the calculator. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* private mode */ }
  }, [draft, ready]);

  const update = (patch) => setDraft(prev => ({ ...prev, ...patch }));
  const updateHedge = (id, patch) => setDraft(prev => ({
    ...prev, hedges: prev.hedges.map(h => h.id === id ? { ...h, ...patch } : h),
  }));
  const changeTemplate = (template) => update({
    template, hedges: freshHedges(template),
    primaryLabel: template === "two-way" ? "First winner" : "First winner + Over",
  });
  const sample = () => {
    setDraft({
      ...initial, eventName: "Baltimore Ravens @ Atlanta Falcons",
      teamA: "Baltimore Ravens", teamB: "Atlanta Falcons",
      primaryLabel: "Ravens + Over 37.5", primaryBook: "BetMGM",
      primaryOdds: "+300", primaryStake: "500",
      hedges: [
        { id: "second", label: "Falcons + Over 37.5", book: "Second book",
          odds: "2.205084x", maxStake: "", covers: ["bOver"] },
        { id: "under", label: "Under 37.5", book: "Third book",
          odds: "+210", maxStake: "", covers: ["under"] },
      ],
    });
    setExpanded(true);
  };

  const scenarios = useMemo(() => scenariosFor(draft), [draft]);
  const options = useMemo(() => ({
    primaryStake: draft.primaryStake, primaryOdds: draft.primaryOdds,
    primaryCovers: [draft.template === "two-way" ? "a" : "aOver"],
    scenarios, hedges: draft.hedges, totalHedgeBudget: draft.hedgeBudget,
    // Keep unlikely but possible uncovered outcomes visible; do not let them
    // force the optimizer to suggest zero hedge stakes for common outcomes.
    optimizeIds: draft.template === "team-total-tie" ? ["aOver", "bOver", "under"] : scenarios.map(s => s.id),
  }), [draft, scenarios]);
  const analysis = useMemo(() => analyzeParlayHedge(options), [options]);
  const targets = useMemo(() => analysis.error ? [] : breakEvenHedgePrices(options), [options, analysis.error]);
  const eventNames = useMemo(() => [...new Set(rows.map(r =>
    r.canonicalEventName || r.eventLabelRaw || r.eventName || r.fixture || "").filter(Boolean))].sort().slice(0, 500), [rows]);
  const imports = useMemo(() => suggestedImportedHedges(rows, draft.eventName, draft.template,
    draft.totalLine, draft.teamB), [rows, draft.eventName, draft.template, draft.totalLine, draft.teamB]);

  const allowedLoss = Math.max(0, Number(draft.maxLoss) || 0);
  const good = !analysis.error && analysis.allCovered && analysis.actualMinimum >= -allowedLoss - 0.005;
  const incomplete = !analysis.error && !analysis.allCovered;

  function useImported(row) {
    const field = draft.template === "two-way" ? "second" : "under";
    const odd = Number(row.oddsAmerican);
    const odds = Number.isFinite(odd) && odd !== 0
      ? (odd > 0 ? "+" : "") + odd : String(row.oddsDecimal) + "x";
    const book = row.sportsbook || row.bookmaker || "Imported book";
    updateHedge(field, { odds, book, label: draft.template === "two-way"
      ? draft.teamB + " wins" : "Under " + draft.totalLine });
  }

  function copy() {
    if (analysis.error) return;
    const lines = [
      "PARLAY HEDGE — verify all live prices and settlement rules before placing",
      (draft.primaryBook || "Primary book") + ": " + draft.primaryLabel + ", " +
        draft.primaryOdds + ", " + cash(Number(draft.primaryStake)),
      ...analysis.hedges.map((h, i) => (h.book || "Hedge book") + ": " + h.label +
        ", " + h.odds + ", " + cash(analysis.stakes[i])),
      "Total stakes: " + cash(analysis.totalStaked),
      ...analysis.outcomes.map(o => o.label + ": " + money(o.profit)),
      "Full minimum: " + money(analysis.actualMinimum),
      "Uncovered: " + (analysis.uncovered.join("; ") || "None"),
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <section id="ev-section-hedge-finder" style={{ border: "1px solid #cbd5e1",
      background: "#f8fafc", color: "#0f172a", borderRadius: 12, padding: 15,
      margin: "20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Parlay Hedge Finder</h2>
          <p style={{ ...noteStyle, margin: "4px 0" }}>Before-bet hedge coverage, stake optimizer and imported-line suggestions.</p>
        </div>
        <button type="button" style={buttonStyle} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : "Open finder"}
        </button>
      </div>
      {expanded && <div style={{ display: "grid", gap: 13, marginTop: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={buttonStyle} type="button" onClick={sample}>Load Ravens–Falcons example</button>
          <button style={buttonStyle} type="button" onClick={() => setDraft(initial)}>Clear form</button>
        </div>
        <div style={boxStyle}>
          <strong>1. Primary boosted parlay (not yet placed)</strong>
          <label style={labelStyle}>Settlement template
            <select value={draft.template} style={inputStyle} onChange={e => changeTemplate(e.target.value)}>
              <option value="team-total-tie">Winner + Total (tie possible: NFL / regulation markets)</option>
              <option value="team-total-no-tie">Winner + Total (no tie possible: final result)</option>
              <option value="two-way">Two mutually exclusive exhaustive outcomes</option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <label style={labelStyle}>First team / outcome
              <input style={inputStyle} value={draft.teamA} onChange={e => update({ teamA: e.target.value })} />
            </label>
            <label style={labelStyle}>Other team / outcome
              <input style={inputStyle} value={draft.teamB} onChange={e => update({ teamB: e.target.value })} />
            </label>
            {draft.template !== "two-way" && <label style={labelStyle}>Total line
              <input style={inputStyle} value={draft.totalLine} onChange={e => update({ totalLine: e.target.value })} />
            </label>}
            <label style={labelStyle}>Primary sportsbook
              <input style={inputStyle} value={draft.primaryBook} placeholder="BetMGM"
                onChange={e => update({ primaryBook: e.target.value })} />
            </label>
            <label style={labelStyle}>Boosted parlay odds
              <input style={inputStyle} value={draft.primaryOdds} placeholder="+300"
                onChange={e => update({ primaryOdds: e.target.value })} />
            </label>
            <label style={labelStyle}>Primary stake ($)
              <input style={inputStyle} type="number" min="0.01" step="0.01" value={draft.primaryStake}
                onChange={e => update({ primaryStake: e.target.value })} />
            </label>
          </div>
          <label style={labelStyle}>Primary parlay description (wins in first scenario only)
            <input style={inputStyle} value={draft.primaryLabel} onChange={e => update({ primaryLabel: e.target.value })} />
          </label>
          <p style={noteStyle}>The primary parlay is assumed to pay only if the FIRST team wins and the total goes over
            (or the first outcome wins in two-way mode). Choose a different template if that is not accurate.
            Use the sportsbook's actual quoted SGP payout, not multiplied individual prices.</p>
        </div>

        <div style={boxStyle}>
          <strong>2. Hedge tickets (prices and exactly which outcomes each wins)</strong>
          {draft.hedges.map((h, i) => <div key={h.id} style={{ borderTop: i ? "1px solid #cbd5e1" : "none",
            paddingTop: i ? 12 : 0, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Hedge {i + 1}</strong>
              <button type="button" style={buttonStyle} onClick={() => update({ hedges: draft.hedges.filter(x => x.id !== h.id) })}>Remove</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
              <label style={labelStyle}>What is this ticket?
                <input style={inputStyle} value={h.label} onChange={e => updateHedge(h.id, { label: e.target.value })} />
              </label>
              <label style={labelStyle}>Sportsbook
                <input style={inputStyle} value={h.book} onChange={e => updateHedge(h.id, { book: e.target.value })} />
              </label>
              <label style={labelStyle}>Actual odds
                <input style={inputStyle} value={h.odds} placeholder="+210 or 2.21x"
                  onChange={e => updateHedge(h.id, { odds: e.target.value })} />
              </label>
              <label style={labelStyle}>Max available stake ($)
                <input style={inputStyle} type="number" min="0" step="0.01"
                  value={h.maxStake} placeholder="Default: 10× primary" onChange={e => updateHedge(h.id, { maxStake: e.target.value })} />
              </label>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>This ticket pays when:</div>
            <div style={{ display: "grid", gap: 6 }}>
              {scenarios.map(s => <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "start",
                fontSize: 13 }}>
                <input type="checkbox" checked={(h.covers || []).includes(s.id)}
                  onChange={e => updateHedge(h.id, { covers: e.target.checked
                    ? [...(h.covers || []), s.id] : (h.covers || []).filter(id => id !== s.id) })} />
                {s.label}
              </label>)}
            </div>
          </div>)}
          {draft.hedges.length < 3 && <button type="button" style={buttonStyle}
            onClick={() => update({ hedges: [...draft.hedges, {
              id: "custom-" + Date.now(), label: "Additional hedge", book: "",
              odds: "", maxStake: "", covers: [],
            }] })}>+ Add hedge ticket</button>}
          <p style={noteStyle}>Leaving a hedge price blank excludes that ticket. A blank maximum stake defaults to
            10× the primary stake. Confirm whether bets include overtime, and whether a tie results in a loss,
            push, or void. Pushes/voids are not modeled by these templates.</p>
        </div>

        <div style={boxStyle}>
          <strong>3. Search loaded sportsbook odds</strong>
          <label style={labelStyle}>Event name (select an existing import)
            <input list="hedge-event-options" style={inputStyle} value={draft.eventName}
              placeholder="Type or select a loaded event"
              onChange={e => update({ eventName: e.target.value })} />
            <datalist id="hedge-event-options">{eventNames.map(e => <option key={e} value={e} />)}</datalist>
          </label>
          <div style={noteStyle}>{rows.length} imported rows loaded. Only exact event, full-game, matching-line
            straight-bet quotes appear here; no guessed correlated SGP payouts.</div>
          {!imports.length ? <div style={noteStyle}>No matching imported hedge quotes. Add actual SGP or straight prices above,
            or load more sportsbook captures.</div> : <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th align="left">Book</th><th align="left">Selection</th><th align="right">Odds</th><th /></tr></thead>
              <tbody>{imports.map((row, i) => <tr key={String(row.id || i)}>
                <td style={{ padding: 5 }}>{row.sportsbook || row.bookmaker}</td>
                <td style={{ padding: 5 }}>{row.selectionNormalized || row.selectionRaw} {row.lineValue || ""}</td>
                <td align="right" style={{ padding: 5 }}>{row.oddsAmerican >= 0 ? "+" : ""}{row.oddsAmerican}</td>
                <td style={{ padding: 5 }}><button type="button" style={buttonStyle} onClick={() => useImported(row)}>Use</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <p style={noteStyle}>Imports may be stale. Recheck the sportsbook before placing. Import matching is deliberately
            conservative: it will not turn straight-bet odds into a same-game parlay price.</p>
        </div>

        <div style={boxStyle}>
          <strong>4. Risk limits and result</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
            <label style={labelStyle}>Maximum acceptable worst-case loss ($)
              <input style={inputStyle} type="number" min="0" step="1" value={draft.maxLoss}
                onChange={e => update({ maxLoss: e.target.value })} />
            </label>
            <label style={labelStyle}>Combined hedge stake budget ($, optional)
              <input style={inputStyle} type="number" min="0" step="0.01" placeholder="Unlimited, subject to individual caps"
                value={draft.hedgeBudget} onChange={e => update({ hedgeBudget: e.target.value })} />
            </label>
          </div>
          {analysis.error ? <div role="alert" style={{ color: "#991b1b" }}>{analysis.error}</div> : <>
            <div style={{ fontWeight: 750, fontSize: 17, color: good ? "#166534" : "#991b1b" }}>
              {good ? "QUALIFIED — within your configured loss limit" :
                incomplete ? "NOT QUALIFIED — uncovered settlement outcome" :
                "NOT QUALIFIED — exceeds your worst-case loss limit"}
            </div>
            {incomplete && <div role="alert" style={{ color: "#991b1b", fontSize: 13 }}>
              Uncovered: {analysis.uncovered.join("; ")}. An uncovered outcome loses ALL stakes.
              This is not a guaranteed-profit arbitrage, even if the other outcomes show profits.
            </div>}
            <div style={noteStyle}>Optimized hedge stakes to maximize the minimum return across the main
              outcomes. These are calculations, not placement recommendations when NOT QUALIFIED.</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                <tr><th align="left">Primary bet</th><td align="right">{cash(Number(draft.primaryStake))}</td></tr>
                {analysis.hedges.map((h, i) => <tr key={h.id}>
                  <th align="left" style={{ fontWeight: 500 }}>{h.book || h.label || "Hedge " + (i+1)}</th>
                  <td align="right">{cash(analysis.stakes[i])}</td>
                </tr>)}
                <tr style={{ borderTop: "1px solid #cbd5e1" }}><th align="left">Total staked</th>
                  <td align="right">{cash(analysis.totalStaked)}</td></tr>
              </tbody>
            </table>
            <strong>Net profit/loss by settlement outcome</strong>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>{analysis.outcomes.map(o => <tr key={o.id}>
                <td style={{ padding: "5px 0" }}>{o.label}{o.optimized ? "" : " (outside optimization)"}</td>
                <td align="right" style={{ fontWeight: 700, color: o.profit < 0 ? "#991b1b" : "#166534" }}>{money(o.profit)}</td>
              </tr>)}</tbody>
            </table>
            <div style={{ fontSize: 13 }}>Minimum across optimized outcomes: <strong>{money(analysis.focusMinimum)}</strong></div>
            <div style={{ fontSize: 14 }}>Actual minimum across all listed outcomes: <strong>{money(analysis.actualMinimum)}</strong></div>
            {!!targets.length && <div style={boxStyle}>
              <strong>Target prices to break even across optimized outcomes</strong>
              {targets.map(target => <div key={target.index} style={noteStyle}>
                {draft.hedges[target.index]?.label || "Hedge"}:
                {" "}<strong>{target.requiredDecimal.toFixed(3)}x</strong>
                {" "}(currently {draft.hedges[target.index]?.odds}). One price improves at a time.
              </div>)}
              {incomplete && <p style={noteStyle}>These targets do not cover the uncovered settlement scenario
                and do not establish a true arbitrage.</p>}
            </div>}
            <button style={buttonStyle} type="button" onClick={copy}>{copied ? "Copied" : "Copy hedge breakdown"}</button>
          </>}
          <p style={noteStyle}>Verify that scenarios are exhaustive and mutually exclusive, all prices and limits
            are accepted, and settlement rules match. This calculator does not place bets or count points as cash.</p>
        </div>
      </div>}
    </section>
  );
}
