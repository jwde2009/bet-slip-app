import {
  decimalToAmerican,
  impliedProbabilityFromDecimal,
} from "./odds";
import { normalizeMarketType } from "./marketNormalization";

export const DEVIG_METHOD_LABELS = {
  power: "Power",
  multiplicative: "Multiplicative / proportional",
  additive: "Additive",
  shin: "Shin-style",
};

export function normalizeDevigMethod(method) {
  const value = String(method || "power").trim().toLowerCase();

  if (value === "power") return "power";
  if (value === "multiplicative" || value === "proportional") return "multiplicative";
  if (value === "additive") return "additive";
  if (value === "shin" || value === "shin-style" || value === "shin_style") return "shin";

  return "power";
}

export function getDevigMethodLabel(method) {
  return DEVIG_METHOD_LABELS[normalizeDevigMethod(method)] || DEVIG_METHOD_LABELS.power;
}

export function calculateFairOddsForMarkets(markets, options = {}) {
  const selectedMethod = normalizeDevigMethod(
    Array.isArray(options) ? "power" : options?.method || options?.devigMethod || "power"
  );

  const results = [];

  for (const market of markets) {
    const sharpSelections = market.selections
      .map((selection) => {
        const sharpQuotes = selection.quotes.filter(
          (q) => q.isSharpSource === true && Number.isFinite(q.oddsDecimal) && q.oddsDecimal > 1
        );

        if (!sharpQuotes.length) return null;

        const bestSharpQuote = [...sharpQuotes].sort((a, b) => {
          const priority = (quote) => {
            const book = String(quote.sportsbook || "").trim().toLowerCase();
            if (book === "pinnacle") return 1;
            if (book === "fanduel") return 2;
            return 3;
          };

          const priorityDiff = priority(a) - priority(b);
          if (priorityDiff !== 0) return priorityDiff;

          return b.oddsDecimal - a.oddsDecimal;
        })[0];

        return {
          selectionId: selection.id,
          selectionLabel: selection.label,
          decimal: bestSharpQuote.oddsDecimal,
          sportsbook: bestSharpQuote.sportsbook,
        };
      })
      .filter(Boolean);

    const expectedOutcomes = getExpectedOutcomeCount(market);

    if (sharpSelections.length !== expectedOutcomes) continue;

    const implieds = sharpSelections.map((s) =>
      impliedProbabilityFromDecimal(s.decimal)
    );

    if (implieds.some((p) => !Number.isFinite(p) || p <= 0)) continue;

    const impliedSum = implieds.reduce((acc, n) => acc + n, 0);
    if (!(impliedSum > 0)) continue;

    const holdPct = (impliedSum - 1) * 100;
    const probabilitiesByMethod = buildProbabilitiesByMethod(implieds);
    const selectedProbabilities = probabilitiesByMethod[selectedMethod] || probabilitiesByMethod.power;

    sharpSelections.forEach((selection, idx) => {
      const fairProbability = selectedProbabilities[idx];
      const fairDecimal = fairProbability > 0 ? 1 / fairProbability : null;
      const fairAmerican =
        fairDecimal && Number.isFinite(fairDecimal)
          ? decimalToAmerican(fairDecimal)
          : null;

      const fairProbabilitiesByMethod = Object.fromEntries(
        Object.entries(probabilitiesByMethod).map(([method, probabilities]) => [
          method,
          probabilities[idx],
        ])
      );

      results.push({
        id: `${market.id}::${selection.selectionId}`,
        marketId: market.id,
        marketDisplayName: market.displayName,
        selectionId: selection.selectionId,
        selectionLabel: selection.selectionLabel,
        fairProbability,
        fairDecimal,
        fairAmerican,
        fairProbabilitiesByMethod,
        devigMethod: selectedMethod,
        devigMethodLabel: getDevigMethodLabel(selectedMethod),
        holdPct,
        sharpSportsbook: selection.sportsbook,
      });
    });
  }

  return results;
}

function buildProbabilitiesByMethod(implieds = []) {
  return {
    power: normalizeProbabilities(devigPower(implieds)),
    multiplicative: normalizeProbabilities(devigMultiplicative(implieds)),
    additive: normalizeProbabilities(devigAdditive(implieds) || devigPower(implieds)),
    shin: normalizeProbabilities(devigShinStyle(implieds)),
  };
}

function devigMultiplicative(implieds = []) {
  const sum = implieds.reduce((acc, n) => acc + n, 0);
  if (!(sum > 0)) return [];
  return implieds.map((p) => p / sum);
}

function devigAdditive(implieds = []) {
  const sum = implieds.reduce((acc, n) => acc + n, 0);
  if (!(sum > 0) || !implieds.length) return [];

  const adjustment = (sum - 1) / implieds.length;
  const probabilities = implieds.map((p) => p - adjustment);

  if (probabilities.some((p) => !Number.isFinite(p) || p <= 0)) {
    return null;
  }

  return probabilities;
}

function devigPower(implieds = []) {
  if (!implieds.length) return [];

  const sum = implieds.reduce((acc, n) => acc + n, 0);
  if (Math.abs(sum - 1) < 0.000001) return implieds;

  let low = 0.01;
  let high = 10;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const poweredSum = implieds.reduce((acc, p) => acc + Math.pow(p, mid), 0);

    if (poweredSum > 1) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return implieds.map((p) => Math.pow(p, (low + high) / 2));
}

function devigShinStyle(implieds = []) {
  // Lightweight Shin-style sensitivity method. It blends power devig with a
  // stronger longshot discount, useful as an alternate view on asymmetric books.
  if (!implieds.length) return [];
  if (implieds.length <= 2) return devigPower(implieds);

  const power = normalizeProbabilities(devigPower(implieds));
  const longshotDiscount = normalizeProbabilities(implieds.map((p) => Math.pow(p, 1.15)));

  return power.map((p, idx) => p * 0.65 + longshotDiscount[idx] * 0.35);
}

function normalizeProbabilities(probabilities = []) {
  const safe = probabilities.map((p) => Number(p)).filter((p) => Number.isFinite(p) && p > 0);
  const sum = safe.reduce((acc, n) => acc + n, 0);

  if (!safe.length || !(sum > 0)) return probabilities;

  return probabilities.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n / sum;
  });
}

function getExpectedOutcomeCount(market) {
  const marketType = normalizeMarketType(market.marketType);

  if (marketType === "moneyline_3way") return 3;

    if (
    marketType === "moneyline_2way" ||
    marketType === "spread" ||
    marketType === "total" ||

    marketType === "player_points" ||
    marketType === "player_assists" ||
    marketType === "player_rebounds" ||
    marketType === "player_threes" ||
    marketType === "player_pra" ||
    marketType === "player_points_rebounds" ||
    marketType === "player_points_assists" ||
    marketType === "player_rebounds_assists" ||
    marketType === "double_double" ||
    marketType === "triple_double" ||

    marketType === "player_hits" ||
    marketType === "player_total_bases" ||
    marketType === "player_home_runs" ||
    marketType === "player_rbis" ||
    marketType === "player_runs" ||
    marketType === "player_stolen_bases" ||
    marketType === "player_singles" ||
    marketType === "player_doubles" ||
    marketType === "player_walks" ||
    marketType === "player_hits_runs_rbis" ||

    marketType === "pitcher_strikeouts" ||
    marketType === "pitcher_outs_recorded" ||
    marketType === "pitcher_hits_allowed" ||
    marketType === "pitcher_earned_runs_allowed" ||
    marketType === "pitcher_walks_allowed" ||

    marketType === "player_goals" ||
    marketType === "player_shots_on_goal" ||
    marketType === "player_blocked_shots" ||
    marketType === "player_power_play_points" ||
    marketType === "player_saves" ||
    marketType === "goalie_goals_against" ||
    marketType === "player_shutout" ||
    marketType === "anytime_goalscorer" ||
    marketType === "both_teams_to_score"
  ) {
    return 2;
  }

  return 2;
}
