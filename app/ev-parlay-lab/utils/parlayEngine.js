import { multiplyDecimals } from "./odds";
import { applyProfitBoostToAmerican, applyProfitBoostToDecimal } from "./boostMath";

export function buildParlayCandidates({ rows, markets, fairOddsResults, filters }) {
  const fairMap = new Map(
    fairOddsResults.map((result) => [`${result.marketId}::${result.selectionId}`, result])
  );

  const candidateLegs = [];
  const rejectionCounts = {
    noFairOdds: 0,
    noTargetQuote: 0,
    belowLegThreshold: 0,
    sameGameBlocked: 0,
    repeatsBlocked: 0,
    nonPositiveParlayEv: 0,
  };

  for (const market of markets) {
    for (const selection of market.selections) {
      const fair = fairMap.get(`${market.id}::${selection.id}`);
      if (!fair) {
        rejectionCounts.noFairOdds += 1;
        continue;
      }

      const targetQuotes = selection.quotes.filter(
        (q) => q.isTargetBook === true && Number.isFinite(q.oddsDecimal) && q.oddsDecimal > 1
      );

      if (!targetQuotes.length) {
        rejectionCounts.noTargetQuote += 1;
        continue;
      }

      const bestTargetQuote = [...targetQuotes].sort(
        (a, b) => b.oddsDecimal - a.oddsDecimal
      )[0];

      const legWinProfitMultiple = bestTargetQuote.oddsDecimal - 1;
      const legEvPct =
        fair.fairProbability * legWinProfitMultiple - (1 - fair.fairProbability);

      const minLegEvPct = Number.isFinite(filters.minLegEvPct)
        ? filters.minLegEvPct
        : -0.02;

      if (legEvPct < minLegEvPct) {
        rejectionCounts.belowLegThreshold += 1;
        continue;
      }

      candidateLegs.push({
        marketId: market.id,
        eventName: market.displayName,
        marketType: market.marketType,
        selectionId: selection.id,
        selectionLabel: selection.label,
        sportsbook: bestTargetQuote.sportsbook,
        oddsAmerican: bestTargetQuote.oddsAmerican,
        oddsDecimal: bestTargetQuote.oddsDecimal,
        fairProbability: fair.fairProbability,
        fairDecimal: fair.fairDecimal,
        legEvPct,
      });
    }
  }

  const desiredLegCount = Number(filters.maxLegs) || 2;
  const rawCombinations = generateCombinations(candidateLegs, desiredLegCount).filter(
    (combo) => combo.length === desiredLegCount
  );

  const combinations = rawCombinations.filter((combo) => {
  const eventKeys = combo.map((leg) => normalizeEventNameForSameGame(leg.eventName));
  const uniqueEvents = new Set(eventKeys);

  if (filters.forceSameGame) {
    if (uniqueEvents.size !== 1) {
      rejectionCounts.sameGameBlocked += 1;
      return false;
    }
  } else if (!filters.allowSameGame) {
    if (uniqueEvents.size !== combo.length) {
      rejectionCounts.sameGameBlocked += 1;
      return false;
    }
  }

  if (!filters.allowRepeats) {
    const names = combo.map((leg) => String(leg.selectionLabel || "").toLowerCase());
    if (new Set(names).size !== names.length) {
      rejectionCounts.repeatsBlocked += 1;
      return false;
    }
  }

  return true;
});

  const parlays = combinations
    .map((legs, idx) => buildSingleParlayCandidate({ legs, idx, filters }))
    .filter(Boolean)
    .filter((parlay) => {
      if (parlay.expectedValuePct > 0) return true;
      rejectionCounts.nonPositiveParlayEv += 1;
      return false;
    })
    .sort((a, b) => {
      if (b.gradeScore !== a.gradeScore) return b.gradeScore - a.gradeScore;
      if (b.expectedValuePct !== a.expectedValuePct) return b.expectedValuePct - a.expectedValuePct;
      return b.fairHitProbability - a.fairHitProbability;
    });

  return {
    parlays,
    counts: {
      eligibleLegs: candidateLegs.length,
      eligibleMarkets: new Set(candidateLegs.map((leg) => leg.marketId)).size,
      generatedCombos: combinations.length,
      rejections: rejectionCounts,
    },
  };
}

function buildSingleParlayCandidate({ legs, idx, filters }) {
  const rawParlayDecimal = multiplyDecimals(legs.map((leg) => leg.oddsDecimal));
  const boostedParlayDecimal = applyProfitBoostToDecimal(rawParlayDecimal, filters.boostPct);
  const rawParlayAmerican = decimalToAmericanSafe(rawParlayDecimal);
  const boostedParlayAmerican = applyProfitBoostToAmerican(rawParlayDecimal, filters.boostPct);

  if (!Number.isFinite(rawParlayDecimal) || !Number.isFinite(boostedParlayDecimal)) {
    return null;
  }

  if (typeof filters.minTotalAmericanOdds === "number") {
    if (rawParlayAmerican === null || rawParlayAmerican < filters.minTotalAmericanOdds) {
      return null;
    }
  }

  const fairHitProbability = legs.reduce((acc, leg) => acc * leg.fairProbability, 1);
  if (!Number.isFinite(fairHitProbability) || fairHitProbability <= 0 || fairHitProbability >= 1) {
    return null;
  }

  const boostedProfitMultiple = boostedParlayDecimal - 1;
  const expectedValuePct =
    fairHitProbability * boostedProfitMultiple - (1 - fairHitProbability);

  const stake = Number(filters.stake) || 0;
  const expectedProfitAtStake = stake * expectedValuePct;

  const suggestedKellyStake = calculateSuggestedKellyStake({
    bankroll: Number(filters.bankroll) || 0,
    kellyFraction: Number(filters.kellyFraction) || 0,
    winProbability: fairHitProbability,
    decimalOdds: boostedParlayDecimal,
  });

  const varianceScore = calculateVarianceScore({
    fairHitProbability,
    boostedParlayAmerican,
    legs,
  });

  const distribution = summarizeDistribution(legs);
  const correlationRisk = assessCorrelationRisk(legs);

  const grade = gradeParlay({
    expectedValuePct,
    fairHitProbability,
    boostedParlayAmerican,
    legCount: legs.length,
    varianceScore,
    correlationRisk,
  });

  const notes = buildParlayNotes({
    legs,
    expectedValuePct,
    fairHitProbability,
    boostedParlayAmerican,
    suggestedKellyStake,
    stake,
    distribution,
    correlationRisk,
    grade,
  });

  return {
    id: `parlay_${idx + 1}`,
    legs,
    legDescriptions: legs.map(
      (leg) =>
        `${leg.eventName} — ${leg.selectionLabel} (${formatAmerican(leg.oddsAmerican)} at ${leg.sportsbook}, leg EV ${formatPct(leg.legEvPct)})`
    ),
    rawParlayDecimal,
    boostedParlayDecimal,
    rawParlayAmerican,
    boostedParlayAmerican,
    fairHitProbability,
    expectedValuePct,
    expectedProfitAtStake,
    suggestedKellyStake,
    averageLegEvPct: average(legs.map((leg) => leg.legEvPct)),
    varianceScore,
    distribution,
    correlationRisk,
    gradeScore: grade.score,
    gradeTier: grade.tier,
    playLabel: grade.label,
    boostPctUsed: Number(filters.boostPct) || 0,
    notes,
  };
}

function gradeParlay({
  expectedValuePct,
  fairHitProbability,
  boostedParlayAmerican,
  legCount,
  varianceScore,
  correlationRisk,
}) {
  let score = 0;

  // EV is the most important factor.
  score += clamp(expectedValuePct / 0.12, -1, 2) * 45;

  // Hit rate matters because user wants some lower-variance usable plays too.
  score += clamp(fairHitProbability / 0.25, 0, 1.6) * 30;

  // Penalize very long odds / volatility.
  score -= varianceScore * 12;

  // Penalize too many legs.
  score -= Math.max(0, legCount - 2) * 6;

  // Penalize obvious same-game style correlation risk.
  if (correlationRisk === "high") score -= 12;
  if (correlationRisk === "medium") score -= 6;

  // Slight penalty for very extreme odds structures.
  if (boostedParlayAmerican >= 1500) score -= 10;
  else if (boostedParlayAmerican >= 800) score -= 5;

  if (score >= 62 && expectedValuePct >= 0.06 && fairHitProbability >= 0.18) {
    return { tier: "A+", label: "Hammer", score };
  }

  if (score >= 52 && expectedValuePct >= 0.04 && fairHitProbability >= 0.12) {
    return { tier: "A", label: "Strong Play", score };
  }

  if (score >= 40 && expectedValuePct >= 0.025) {
    return { tier: "B", label: "Core Play", score };
  }

  if (score >= 28 && expectedValuePct > 0) {
    return { tier: "C", label: "Thin Edge", score };
  }

  return { tier: "D", label: "Longshot Value", score };
}

function calculateVarianceScore({ fairHitProbability, boostedParlayAmerican, legs }) {
  let score = 0;

  if (fairHitProbability < 0.2) score += 0.7;
  if (fairHitProbability < 0.12) score += 0.9;
  if (fairHitProbability < 0.07) score += 1.1;

  if (boostedParlayAmerican >= 400) score += 0.6;
  if (boostedParlayAmerican >= 800) score += 0.9;
  if (boostedParlayAmerican >= 1500) score += 1.2;

  const underdogLegs = legs.filter((leg) => Number(leg.oddsAmerican) > 0).length;
  const dogShare = legs.length ? underdogLegs / legs.length : 0;
  score += dogShare * 0.8;

  return score;
}

function summarizeDistribution(legs) {
  const underdogCount = legs.filter((leg) => Number(leg.oddsAmerican) > 0).length;
  const favoriteCount = legs.length - underdogCount;

  return {
    favoriteCount,
    underdogCount,
  };
}

function assessCorrelationRisk(legs) {
  const eventCounts = new Map();

  for (const leg of legs) {
    const key = String(leg.eventName || "");
    eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
  }

  const maxEventLegs = Math.max(...eventCounts.values(), 0);

  if (maxEventLegs >= 3) return "high";
  if (maxEventLegs >= 2) return "medium";
  return "low";
}

function buildParlayNotes({
  legs,
  expectedValuePct,
  fairHitProbability,
  boostedParlayAmerican,
  suggestedKellyStake,
  stake,
  distribution,
  correlationRisk,
  grade,
}) {
  const notes = [];

  notes.push(`${grade.tier} grade — ${grade.label}`);

  if (fairHitProbability >= 0.3) {
    notes.push("Low variance profile");
  } else if (fairHitProbability >= 0.15) {
    notes.push("Moderate variance profile");
  } else {
    notes.push("High variance profile");
  }

  if (distribution.underdogCount === 0) {
    notes.push("All favorites");
  } else if (distribution.favoriteCount === 0) {
    notes.push("All underdogs");
  } else {
    notes.push(
      `${distribution.favoriteCount} favorite${distribution.favoriteCount === 1 ? "" : "s"}, ${distribution.underdogCount} underdog${distribution.underdogCount === 1 ? "" : "s"}`
    );
  }

  if (boostedParlayAmerican >= 1000) {
    notes.push("Long-odds structure");
  } else if (boostedParlayAmerican >= 400) {
    notes.push("Mid-odds structure");
  } else {
    notes.push("Shorter-odds structure");
  }

  if (expectedValuePct >= 0.08) {
    notes.push("Strong modeled edge");
  } else if (expectedValuePct >= 0.04) {
    notes.push("Solid modeled edge");
  } else if (expectedValuePct >= 0.02) {
    notes.push("Modest modeled edge");
  } else {
    notes.push("Thin modeled edge");
  }

  if (correlationRisk === "high") {
    notes.push("High same-event correlation risk");
  } else if (correlationRisk === "medium") {
    notes.push("Some same-event correlation risk");
  }

  if (Number.isFinite(suggestedKellyStake) && suggestedKellyStake > 0) {
    notes.push(`Kelly-style stake ≈ $${suggestedKellyStake.toFixed(2)}`);
  }

  if (stake > 0 && Number.isFinite(suggestedKellyStake) && suggestedKellyStake > 0) {
    if (stake > suggestedKellyStake * 1.5) {
      notes.push("Current stake is aggressive versus model");
    } else if (stake < suggestedKellyStake * 0.6) {
      notes.push("Current stake is conservative versus model");
    } else {
      notes.push("Current stake is roughly aligned with model");
    }
  }

  return notes;
}

function calculateSuggestedKellyStake({ bankroll, kellyFraction, winProbability, decimalOdds }) {
  const p = Number(winProbability);
  const d = Number(decimalOdds);
  const b = d - 1;
  const q = 1 - p;

  if (!Number.isFinite(bankroll) || bankroll <= 0) return 0;
  if (!Number.isFinite(kellyFraction) || kellyFraction <= 0) return 0;
  if (!Number.isFinite(p) || !Number.isFinite(d) || b <= 0) return 0;

  const fullKelly = (b * p - q) / b;
  if (!(fullKelly > 0)) return 0;

  return bankroll * fullKelly * kellyFraction;
}

function normalizeEventNameForSameGame(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateCombinations(items, size) {
  const results = [];

  function backtrack(start, combo) {
    if (combo.length === size) {
      results.push([...combo]);
      return;
    }

    for (let i = start; i < items.length; i += 1) {
      combo.push(items[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }

  backtrack(0, []);
  return results;
}

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}

function formatPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function formatAmerican(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function decimalToAmericanSafe(d) {
  if (!Number.isFinite(d) || d <= 1) return null;
  if (d >= 2) return (d - 1) * 100;
  return -100 / (d - 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}