// Scenario-based parlay hedge optimizer. No assumption of independent legs or SGP price multiplication.
// A scenario is an explicit, mutually exclusive settlement outcome.
// coverage arrays list the scenario IDs in which each ticket pays its full decimal payout.
export function parseHedgePrice(value) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  if (/^(even|evens|evs)$/i.test(raw)) return 2;
  const decimal = raw.match(/^(\d+(?:\.\d+)?)\s*(x)?$/i);
  if (decimal) {
    const n = Number(decimal[1]);
    // An explicit x always means decimal odds, including large multipliers.
    if (decimal[2]) return n > 1 && Number.isFinite(n) ? n : null;
    if (n > 1 && n < 100) return n;
    if (Number.isInteger(n) && n >= 100) return 1 + n / 100;
  }
  if (/^[+-]\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (Math.abs(n) < 100) return null;
    return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  }
  return null;
}

function linearSolve(equations, rhs) {
  const n = rhs.length;
  const rows = equations.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    }
    if (Math.abs(rows[pivot][col]) < 1e-9) return null;
    [rows[pivot], rows[col]] = [rows[col], rows[pivot]];
    const factor = rows[col][col];
    for (let c = col; c <= n; c++) rows[col][c] /= factor;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const scale = rows[r][col];
      for (let c = col; c <= n; c++) rows[r][c] -= scale * rows[col][c];
    }
  }
  return rows.map(row => row[n]);
}

function maximizeMinimum(bases, coefficients, caps, budget) {
  const k = caps.length;
  // x_0 ... x_(k-1) are hedge stakes, t is the least profitable scenario.
  const constraints = [];
  for (let s = 0; s < bases.length; s++) {
    constraints.push({ a: [...coefficients[s].map(v => -v), 1], b: bases[s] });
  }
  for (let j = 0; j < k; j++) {
    const bottom = Array(k + 1).fill(0);
    bottom[j] = -1;
    constraints.push({ a: bottom, b: 0 });
    const top = Array(k + 1).fill(0);
    top[j] = 1;
    constraints.push({ a: top, b: caps[j] });
  }
  if (Number.isFinite(budget)) constraints.push({ a: [...Array(k).fill(1), 0], b: budget });

  const n = k + 1;
  let best = null;
  const pick = [];
  function enumerate(start) {
    if (pick.length === n) {
      const selected = pick.map(i => constraints[i]);
      const solution = linearSolve(selected.map(c => c.a), selected.map(c => c.b));
      if (!solution || solution.some(v => !Number.isFinite(v))) return;
      if (constraints.some(c => c.a.reduce((sum, v, i) => sum + v * solution[i], 0) > c.b + 1e-6)) return;
      if (!best || solution[k] > best[k] + 1e-7 ||
          (Math.abs(solution[k] - best[k]) <= 1e-7 &&
           solution.slice(0, k).reduce((a, b) => a + b, 0) < best.slice(0, k).reduce((a, b) => a + b, 0))) best = solution;
      return;
    }
    for (let i = start; i <= constraints.length - (n - pick.length); i++) {
      pick.push(i);
      enumerate(i + 1);
      pick.pop();
    }
  }
  enumerate(0);
  return best ? best.slice(0, k) : null;
}

export function analyzeParlayHedge({ primaryStake, primaryOdds, primaryCovers, scenarios, hedges, totalHedgeBudget, optimizeIds }) {
  const stake = Number(primaryStake);
  const decimal = parseHedgePrice(primaryOdds);
  if (!Number.isFinite(stake) || stake <= 0 || !decimal) return { error: "Enter a valid positive primary stake and primary odds." };
  if (!Array.isArray(scenarios) || scenarios.length < 2 || scenarios.length > 12 ||
      new Set(scenarios.map(s => s.id)).size !== scenarios.length) return { error: "Choose a valid scenario template." };
  if (!Array.isArray(hedges) || hedges.length > 3) return { error: "A maximum of three hedge tickets is supported in this version." };
  const active = hedges.filter(h => String(h.odds || "").trim());
  if (!active.length) return { error: "Enter at least one hedge price." };
  const parsed = [];
  for (const hedge of active) {
    const price = parseHedgePrice(hedge.odds);
    const cap = hedge.maxStake === "" || hedge.maxStake == null ? stake * 10 : Number(hedge.maxStake);
    if (!price || !Number.isFinite(cap) || cap < 0) return { error: "Check hedge odds and maximum stakes." };
    parsed.push({ ...hedge, price, cap });
  }
  let budget = Infinity;
  if (totalHedgeBudget !== "" && totalHedgeBudget != null) {
    budget = Number(totalHedgeBudget);
    if (!Number.isFinite(budget) || budget < 0) return { error: "Hedge budget must be zero or greater." };
  }
  const focus = new Set(Array.isArray(optimizeIds) && optimizeIds.length ? optimizeIds : scenarios.map(s => s.id));
  const included = scenarios.filter(s => focus.has(s.id));
  if (!included.length) return { error: "No settlement outcomes are selected." };

  const getBase = s => primaryCovers.includes(s.id) ? stake * decimal - stake : -stake;
  const getCoefficients = s => parsed.map(h => (h.covers || []).includes(s.id) ? h.price - 1 : -1);
  const calculated = maximizeMinimum(included.map(getBase), included.map(getCoefficients), parsed.map(h => h.cap), budget);
  if (!calculated) return { error: "Unable to find a valid hedge allocation." };
  const stakes = calculated.map(x => Math.max(0, Math.floor((x + 1e-7) * 100) / 100));
  // Cent-rounding can create fractional-cent discrepancies. Report exact results for executable stakes.
  const totalStaked = stake + stakes.reduce((a, b) => a + b, 0);
  const outcomes = scenarios.map(s => {
    const returnAmount = (primaryCovers.includes(s.id) ? stake * decimal : 0) +
      parsed.reduce((sum, h, i) => sum + ((h.covers || []).includes(s.id) ? stakes[i] * h.price : 0), 0);
    return { ...s, profit: returnAmount - totalStaked, payout: returnAmount,
      covered: primaryCovers.includes(s.id) || parsed.some((h, i) => stakes[i] > 0 && (h.covers || []).includes(s.id)),
      optimized: focus.has(s.id) };
  });
  const focusMinimum = Math.min(...outcomes.filter(s => s.optimized).map(s => s.profit));
  const actualMinimum = Math.min(...outcomes.map(s => s.profit));
  return {
    stakes, hedges: parsed, outcomes, totalStaked,
    focusMinimum, actualMinimum,
    allCovered: outcomes.every(s => s.covered),
    qualified: outcomes.every(s => s.covered) && actualMinimum >= -0.005,
    conditionalPositive: focusMinimum >= -0.005,
    uncovered: outcomes.filter(s => !s.covered).map(s => s.label),
    totalHedgeStake: totalStaked - stake,
  };
}

// Find the smallest single-price improvement that makes optimized scenarios break even.
// This is a quote target, not an available price, and never implies settlement completeness.
export function breakEvenHedgePrices(options) {
  const baseline = analyzeParlayHedge(options);
  if (baseline.error) return [];
  return (options.hedges || []).map((hedge, index) => {
    if (!String(hedge.odds || "").trim()) return null;
    const current = parseHedgePrice(hedge.odds);
    const tryOdds = price => {
      const next = options.hedges.map((h, i) => i === index ? { ...h, odds: price.toFixed(8) + "x" } : h);
      return analyzeParlayHedge({ ...options, hedges: next }).focusMinimum;
    };
    if (baseline.focusMinimum >= -0.005) return null;
    if (tryOdds(1000) < -0.005) return null;
    let low = current, high = 1000;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (tryOdds(mid) >= -0.005) high = mid;
      else low = mid;
    }
    return { index, requiredDecimal: high, improvement: high - current };
  }).filter(Boolean);
}

export function suggestedImportedHedges(rows, eventName, template, line, oppositeTeam) {
  const targetEvent = String(eventName || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!targetEvent) return [];
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (row.excluded || row.isLive || row.isLikelyLive ||
        /(?:live|in.play)/i.test(String(row.marketStatus || ""))) return false;
    const period = String(row.period || "full_game").toLowerCase();
    if (!["full_game", "game", "full game", "match", "full_time"].includes(period)) return false;
    const event = String(row.canonicalEventName || row.eventLabelRaw || row.eventName || row.fixture || "")
      .trim().toLowerCase().replace(/\s+/g, " ");
    if (event !== targetEvent) return false;
    const market = String(row.marketType || "").toLowerCase();
    const selection = String(row.selectionNormalized || row.selectionRaw || "").trim().toLowerCase();
    if (template === "two-way") return /moneyline/.test(market) && selection === String(oppositeTeam || "").trim().toLowerCase();
    return /^(total|totals)$/.test(market) && /^(under|u)(\s|$)/i.test(selection) &&
      Number(row.lineValue) === Number(line);
  }).filter(row => parseHedgePrice(row.oddsAmerican != null ?
    (Number(row.oddsAmerican) >= 0 ? "+" : "") + row.oddsAmerican :
    row.oddsDecimal ? String(row.oddsDecimal) + "x" : "") != null)
    .sort((a, b) => Number(b.oddsDecimal || 0) - Number(a.oddsDecimal || 0))
    .slice(0, 15);
}
