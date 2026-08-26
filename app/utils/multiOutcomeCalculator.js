export const MULTI_OUTCOME_PROMO_TYPES = Object.freeze({
  TRADITIONAL_PARLAY: "traditional_parlay",
  AT_LEAST_N: "at_least_n",
  EXACTLY_N: "exactly_n",
  ALL_HIT: "all_hit",
});

const VALID_PROMO_TYPES = new Set(Object.values(MULTI_OUTCOME_PROMO_TYPES));

/**
 * Calculates the fair probability that a multi-outcome promotion wins.
 *
 * Each item in fairDecimalOdds is treated as one complete independent event.
 * If one item represents a same-game parlay or any other correlated bundle,
 * pass the fair decimal odds for that complete bundle as one outcome.
 *
 * @param {object} options
 * @param {string} options.promoType
 * @param {number|string} options.numberRequired
 * @param {Array<number|string>} options.fairDecimalOdds
 * @returns {{
 *   promoType: string,
 *   outcomeCount: number,
 *   numberRequired: number,
 *   outcomeProbabilities: number[],
 *   hitDistribution: number[],
 *   combinedProbability: number
 * } | null}
 */
export function calculateMultiOutcomeProbability({
  promoType,
  numberRequired,
  fairDecimalOdds,
}) {
  const normalizedPromoType = normalizePromoType(promoType);
  const decimals = normalizeFairDecimalOdds(fairDecimalOdds);

  if (!normalizedPromoType || !decimals) return null;

  const outcomeProbabilities = decimals.map((decimalOdds) => 1 / decimalOdds);
  const hitDistribution = buildHitCountDistribution(outcomeProbabilities);
  const outcomeCount = outcomeProbabilities.length;

  let resolvedNumberRequired = outcomeCount;
  let combinedProbability = hitDistribution[outcomeCount];

  if (
    normalizedPromoType === MULTI_OUTCOME_PROMO_TYPES.AT_LEAST_N ||
    normalizedPromoType === MULTI_OUTCOME_PROMO_TYPES.EXACTLY_N
  ) {
    resolvedNumberRequired = normalizeRequiredHits(numberRequired, outcomeCount);
    if (!resolvedNumberRequired) return null;

    if (normalizedPromoType === MULTI_OUTCOME_PROMO_TYPES.EXACTLY_N) {
      combinedProbability = hitDistribution[resolvedNumberRequired];
    } else {
      combinedProbability = hitDistribution
        .slice(resolvedNumberRequired)
        .reduce((sum, probability) => sum + probability, 0);
    }
  }

  if (!(combinedProbability > 0 && combinedProbability < 1)) return null;

  return {
    promoType: normalizedPromoType,
    outcomeCount,
    numberRequired: resolvedNumberRequired,
    outcomeProbabilities,
    hitDistribution,
    combinedProbability,
  };
}

function normalizePromoType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_PROMO_TYPES.has(normalized) ? normalized : null;
}

function normalizeFairDecimalOdds(values) {
  if (!Array.isArray(values) || values.length === 0) return null;

  const decimals = values.map((value) => Number(value));
  if (decimals.some((value) => !Number.isFinite(value) || value <= 1)) {
    return null;
  }

  return decimals;
}

function normalizeRequiredHits(value, outcomeCount) {
  const required = Number(value);
  if (!Number.isInteger(required)) return null;
  if (required < 1 || required > outcomeCount) return null;
  return required;
}

/**
 * Poisson-binomial distribution for independent outcomes.
 * The returned array uses the number of hits as its index:
 * distribution[0] = P(0 hits), distribution[1] = P(1 hit), etc.
 */
function buildHitCountDistribution(probabilities) {
  let distribution = [1];

  for (const probability of probabilities) {
    const next = Array(distribution.length + 1).fill(0);

    for (let hits = 0; hits < distribution.length; hits += 1) {
      const priorProbability = distribution[hits];
      next[hits] += priorProbability * (1 - probability);
      next[hits + 1] += priorProbability * probability;
    }

    distribution = next;
  }

  return distribution;
}
