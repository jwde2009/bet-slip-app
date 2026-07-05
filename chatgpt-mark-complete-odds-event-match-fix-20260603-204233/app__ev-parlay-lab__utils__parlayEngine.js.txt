import { multiplyDecimals } from "./odds";
import { applyProfitBoostToAmerican, applyProfitBoostToDecimal } from "./boostMath";
const DEFAULT_MAX_PARLAY_CANDIDATE_LEGS = 80;
const DEFAULT_MAX_PARLAY_CANDIDATE_LEGS_3_PLUS = 40;

const DEVIG_METHOD_LABELS = {
  power: "Power",
  multiplicative: "Multiplicative / proportional",
  additive: "Additive",
  shin: "Shin-style",
};

function normalizeDevigMethod(method) {
  const value = String(method || "power").trim().toLowerCase();

  if (value === "power") return "power";
  if (value === "multiplicative" || value === "proportional") return "multiplicative";
  if (value === "additive") return "additive";
  if (value === "shin" || value === "shin-style" || value === "shin_style") return "shin";

  return "power";
}

function getDevigMethodLabel(method) {
  return DEVIG_METHOD_LABELS[normalizeDevigMethod(method)] || DEVIG_METHOD_LABELS.power;
}

function normalizeLegKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isMainLineMarket(marketType = "") {
  const type = String(marketType || "").toLowerCase();

  return (
    type === "moneyline_2way" ||
    type === "moneyline_3way" ||
    type === "spread" ||
    type === "total"
  );
}

function normalizeRuleText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w+@. ]+/g, " ")
    .replace(/\s+/g, " ");
}

function legSearchText(leg = {}) {
  return normalizeRuleText(
    [
      leg.eventName,
      leg.sport,
      leg.marketType,
      formatLegMarketLabel(leg.marketType),
      leg.subjectName,
      leg.selectionLabel,
      leg.displayLabel,
      leg.lineValue,
      leg.sportsbook,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
  );
}

function marketSearchText(market = {}, selection = {}) {
  return normalizeRuleText(
    [
      market.displayName,
      market.sport,
      market.marketType,
      formatLegMarketLabel(market.marketType),
      market.subjectKey,
      market.lineValue,
      selection.label,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
  );
}

function legMatchesRuleText(leg = {}, ruleText = "") {
  const normalizedRule = normalizeRuleText(ruleText);
  if (!normalizedRule) return true;

  return legSearchText(leg).includes(normalizedRule);
}

function marketMatchesRuleText(market = {}, selection = {}, ruleText = "") {
  const normalizedRule = normalizeRuleText(ruleText);
  if (!normalizedRule) return true;

  return marketSearchText(market, selection).includes(normalizedRule);
}


function isOuPlayerPropMarket(marketType = "") {
  const type = String(marketType || "").toLowerCase();

  return [
    "player_points",
    "player_assists",
    "player_rebounds",
    "player_threes",
    "player_pra",
    "player_points_rebounds",
    "player_points_assists",
    "player_rebounds_assists",
    "player_goals",
    "player_shots_on_goal",
    "player_saves",
    "player_power_play_points",
    "player_blocked_shots",
    "pitcher_strikeouts",
    "pitcher_outs_recorded",
    "pitcher_hits_allowed",
    "pitcher_earned_runs_allowed",
  ].includes(type);
}


function buildSavedLegKeyFromLeg(leg = {}) {
  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName),
    normalizeLegKeyPart(leg.selectionLabel),
    normalizeLegKeyPart(leg.lineValue),
  ].join("::");
}

function buildSavedLegFamilyKeyFromLeg(leg = {}) {
  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName || leg.selectionLabel),
    normalizeLegKeyPart(leg.selectionLabel),
    normalizeLegKeyPart(leg.lineValue),
  ].join("::");
}

function buildSavedLegRepeatKeyFromLeg(leg = {}) {
  const selection = String(leg.selectionLabel || "").trim().toLowerCase();

  const side =
    /\bover\b/.test(selection)
      ? "over"
      : /\bunder\b/.test(selection)
        ? "under"
        : /\byes\b/.test(selection)
          ? "yes"
          : /\bno\b/.test(selection)
            ? "no"
            : selection;

  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName || leg.selectionLabel),
    normalizeLegKeyPart(side),
  ].join("::");
}

function normalizeLegDisplayForRepeat(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\b/g, " ")
    .replace(/[^\w+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSavedLegDisplayKeyFromLeg(leg = {}) {
  const label =
    leg.displayLabel ||
    buildLegDisplayLabel({
      subjectName: leg.subjectName,
      selectionLabel: leg.selectionLabel,
      lineValue: leg.lineValue,
      marketType: leg.marketType,
    });

  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(label),
  ].join("::");
}

function buildSavedLegDisplayRepeatKeyFromLeg(leg = {}) {
  const label =
    leg.displayLabel ||
    buildLegDisplayLabel({
      subjectName: leg.subjectName,
      selectionLabel: leg.selectionLabel,
      lineValue: leg.lineValue,
      marketType: leg.marketType,
    });

  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegDisplayForRepeat(label),
  ].join("::");
}

function dedupeLegsByFamily(legs) {
  const bestByFamily = new Map();

  for (const leg of legs) {
    const familyKey = [
      leg.eventName,
      leg.marketType,
      leg.selectionLabel,
      leg.sportsbook,
    ].join("||");

    const existing = bestByFamily.get(familyKey);

    if (!existing || (Number.isFinite(leg.legEvPct) && leg.legEvPct > existing.legEvPct)) {
      bestByFamily.set(familyKey, leg);
    }
  }

  return Array.from(bestByFamily.values());
}

function selectCandidateLegsForGeneration(legs, {
  filters,
  desiredLegCount,
  maxCandidateLegs,
}) {
  const sorted = dedupeLegsByFamily(legs).sort((a, b) => {
    if (b.legEvPct !== a.legEvPct) return b.legEvPct - a.legEvPct;
    return b.oddsDecimal - a.oddsDecimal;
  });

  if (filters?.forceSameGame === true || filters?.allowSameGame === true) {
    return sorted.slice(0, maxCandidateLegs);
  }

  const maxPerEvent = Number.isFinite(Number(filters?.maxCandidateLegsPerEvent))
    ? Math.max(1, Number(filters.maxCandidateLegsPerEvent))
    : Math.max(2, desiredLegCount);

  const selected = [];
  const countByEvent = new Map();

  for (const leg of sorted) {
    const eventKey = normalizeEventNameForSameGame(leg.eventName);
    const currentCount = countByEvent.get(eventKey) || 0;

    if (currentCount >= maxPerEvent) continue;

    selected.push(leg);
    countByEvent.set(eventKey, currentCount + 1);

    if (selected.length >= maxCandidateLegs) break;
  }

  if (selected.length >= desiredLegCount) return selected;

  return sorted.slice(0, maxCandidateLegs);
}

export function buildParlayCandidates({
  rows,
  markets,
  fairOddsResults,
  filters,
  savedLegUsageMap = new Map(),
}) {

  const fairMap = new Map(
    fairOddsResults.map((result) => [`${result.marketId}::${result.selectionId}`, result])
  );

  const selectedTargetBook = String(filters?.selectedTargetBook || "ALL")
    .trim()
    .toLowerCase();

  const candidateLegs = [];
  const rejectionCounts = {
    noFairOdds: 0,
    noTargetQuote: 0,
    belowLegThreshold: 0,
    sameSportBlocked: 0,
    sameGameBlocked: 0,
    repeatsBlocked: 0,
    manualBlocked: 0,
    nonPositiveParlayEv: 0,
    filteredByMarketMode: 0,
    filteredByExtremeOdds: 0,
    filteredByBoostRules: 0,
  };

  for (const market of markets) {
    for (const selection of market.selections) {
      const fair = fairMap.get(`${market.id}::${selection.id}`);
      if (!fair) {
        rejectionCounts.noFairOdds += 1;
        continue;
      }

      const preferredMarketMode = String(filters?.preferredMarketMode || "all").toLowerCase();
      const normalizedMarketType = String(market.marketType || "").toLowerCase();

      const forcedEventName = String(filters?.forcedEventName || "").trim();
      const forcedMarketType = String(filters?.forcedMarketType || "").trim();

      if (forcedEventName && !normalizeRuleText(market.displayName).includes(normalizeRuleText(forcedEventName))) {
        rejectionCounts.filteredByBoostRules += 1;
        continue;
      }

      if (forcedMarketType && !marketMatchesRuleText(market, selection, forcedMarketType)) {
        rejectionCounts.filteredByBoostRules += 1;
        continue;
      }

      if (preferredMarketMode === "ou_only" && !isOuPlayerPropMarket(normalizedMarketType)) {
        rejectionCounts.filteredByMarketMode += 1;
        continue;
      }

      if (
        preferredMarketMode === "main_and_ou" &&
        !isMainLineMarket(normalizedMarketType) &&
        !isOuPlayerPropMarket(normalizedMarketType)
      ) {
        rejectionCounts.filteredByMarketMode += 1;
        continue;
      }

      const targetQuotes = selection.quotes.filter((q) => {
        const quoteBook = String(q.sportsbook || "").trim().toLowerCase();

        return (
          q.isTargetBook === true &&
          Number.isFinite(q.oddsDecimal) &&
          q.oddsDecimal > 1 &&
          (selectedTargetBook === "all" || quoteBook === selectedTargetBook)
        );
      });

      if (!targetQuotes.length) {
        rejectionCounts.noTargetQuote += 1;
        continue;
      }

      const bestTargetQuote = [...targetQuotes].sort(
        (a, b) => b.oddsDecimal - a.oddsDecimal
      )[0];

      const maxAbsAmericanOdds = Number.isFinite(Number(filters?.maxAbsAmericanOdds))
        ? Math.max(100, Number(filters.maxAbsAmericanOdds))
        : 1000;

      if (
        Number.isFinite(Number(bestTargetQuote.oddsAmerican)) &&
        Math.abs(Number(bestTargetQuote.oddsAmerican)) > maxAbsAmericanOdds
      ) {
        rejectionCounts.filteredByExtremeOdds += 1;
        continue;
      }

      const sharpQuotes = selection.quotes.filter(
        (q) =>
          q.isSharpSource === true &&
          Number.isFinite(q.oddsDecimal) &&
          q.oddsDecimal > 1
      );

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

      const fairAmerican = Number.isFinite(fair.fairAmerican)
        ? fair.fairAmerican
        : decimalToAmericanSafe(fair.fairDecimal);

      const legWinProfitMultiple = bestTargetQuote.oddsDecimal - 1;
      const legEvPct =
        fair.fairProbability * legWinProfitMultiple - (1 - fair.fairProbability);

      const useMinLegEvFilter = filters?.useMinLegEvFilter !== false;
      const minLegEvPct = Number.isFinite(filters?.minLegEvPct)
        ? filters.minLegEvPct
        : -0.03;

      if (useMinLegEvFilter && legEvPct < minLegEvPct) {
        rejectionCounts.belowLegThreshold += 1;
        continue;
      }

      const savedLegProbe = {
        eventName: market.displayName,
        sport: market.sport || "",
        marketType: market.marketType,
        subjectName: extractSubjectNameFromMarket(market),
        lineValue: market.lineValue,
        selectionLabel: selection.label,
      };

      const legDisplayLabel = buildLegDisplayLabel({
        subjectName: savedLegProbe.subjectName,
        selectionLabel: selection.label,
        lineValue: market.lineValue,
        marketType: market.marketType,
      });

      const savedLegKey = buildSavedLegKeyFromLeg(savedLegProbe);
      const savedLegFamilyKey = buildSavedLegFamilyKeyFromLeg(savedLegProbe);
      const savedLegRepeatKey = buildSavedLegRepeatKeyFromLeg(savedLegProbe);
      const savedLegDisplayKey = buildSavedLegDisplayKeyFromLeg({
        ...savedLegProbe,
        displayLabel: legDisplayLabel,
      });
      const savedLegDisplayRepeatKey = buildSavedLegDisplayRepeatKeyFromLeg({
        ...savedLegProbe,
        displayLabel: legDisplayLabel,
      });

      const savedUsage =
        typeof savedLegUsageMap?.get === "function"
          ? savedLegUsageMap.get(savedLegKey) ||
            savedLegUsageMap.get(savedLegFamilyKey) ||
            savedLegUsageMap.get(savedLegRepeatKey) ||
            savedLegUsageMap.get(savedLegDisplayKey) ||
            savedLegUsageMap.get(savedLegDisplayRepeatKey)
          : null;

      // Manually blocked legs should always stay blocked until removed.
      if (savedUsage?.blocked === true) {
        rejectionCounts.manualBlocked += 1;
        continue;
      }

      const allowPreviouslyUsedLegs = filters?.allowPreviouslyUsedLegs === true;

      // Confirmed active/pending same-day placed parlays only block when the
      // allow-previously-used-legs toggle is OFF.
      // This is intentionally independent from allowRepeats.
      // allowRepeats controls repeated subjects/teams inside one generated candidate.
      // allowPreviouslyUsedLegs controls historical saved/placed/pending legs.
      if (savedUsage?.count && !allowPreviouslyUsedLegs) {
        rejectionCounts.repeatsBlocked += 1;
        continue;
      }

      candidateLegs.push({
        marketId: market.id,
        eventName: market.displayName,
        sport: market.sport || "",
        marketType: market.marketType,
        subjectName: savedLegProbe.subjectName,
        lineValue: market.lineValue,
        selectionId: selection.id,
        selectionLabel: selection.label,

        sportsbook: bestTargetQuote.sportsbook,
        targetParsedRowId: bestTargetQuote.parsedRowId || "",
        oddsAmerican: bestTargetQuote.oddsAmerican,
        oddsDecimal: bestTargetQuote.oddsDecimal,

        sharpParsedRowId: bestSharpQuote?.parsedRowId || "",
        sharpSportsbook: bestSharpQuote?.sportsbook || "",
        sharpOddsAmerican: Number.isFinite(bestSharpQuote?.oddsAmerican)
          ? bestSharpQuote.oddsAmerican
          : fairAmerican,
        sharpDecimal: Number.isFinite(bestSharpQuote?.oddsDecimal)
          ? bestSharpQuote.oddsDecimal
          : null,
        allSharpQuotes: buildAllSharpQuotesForParlayLeg({
          fair,
          selection,
          fallbackSharpQuote: bestSharpQuote,
        }),
        allSharpQuotes: (sharpQuotes || []).map((quote) => ({
          parsedRowId: quote.parsedRowId || "",
          sportsbook: quote.sportsbook || "",
          oddsAmerican: quote.oddsAmerican ?? null,
          oddsDecimal: quote.oddsDecimal ?? null,
        })),

        fairProbability: fair.fairProbability,
        fairDecimal: fair.fairDecimal,
        fairAmerican,
        fairProbabilitiesByMethod: fair.fairProbabilitiesByMethod || {},
        devigMethod: fair.devigMethod || normalizeDevigMethod(filters?.devigMethod),
        devigMethodLabel: fair.devigMethodLabel || getDevigMethodLabel(filters?.devigMethod),

        legEvPct,
        savedLegKey,
        savedLegFamilyKey,
        savedLegRepeatKey,
        savedLegDisplayKey,
        savedLegDisplayRepeatKey,
        displayLabel: legDisplayLabel,
        savedUsageCount: savedUsage?.count || 0,
      });
    }
  }

  const desiredLegCount = Number(filters.maxLegs) || 2;
  const defaultMaxCandidateLegs =
    desiredLegCount <= 2
      ? DEFAULT_MAX_PARLAY_CANDIDATE_LEGS
      : DEFAULT_MAX_PARLAY_CANDIDATE_LEGS_3_PLUS;

  const maxCandidateLegs = Number.isFinite(Number(filters?.maxCandidateLegs))
    ? Math.max(10, Number(filters.maxCandidateLegs))
    : defaultMaxCandidateLegs;

  const dedupedCandidateLegs = selectCandidateLegsForGeneration(candidateLegs, {
    filters,
    desiredLegCount,
    maxCandidateLegs,
  });

  const maxGeneratedCombos = Number.isFinite(Number(filters?.maxGeneratedCombos))
    ? Math.max(100, Number(filters.maxGeneratedCombos))
    : 1000;

  const rawCombinations = generateCombinations(
    dedupedCandidateLegs,
    desiredLegCount,
    maxGeneratedCombos
  ).filter((combo) => combo.length === desiredLegCount);

  const combinations = rawCombinations.filter((combo) => {
        if (filters.forceSameSport !== false && !passesSameSportConstraint(combo)) {
      rejectionCounts.sameSportBlocked += 1;
      return false;
    }
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

    const minUniqueEvents = Number(filters?.minUniqueEvents);
    if (
      Number.isFinite(minUniqueEvents) &&
      minUniqueEvents > 1 &&
      !filters.forceSameGame &&
      uniqueEvents.size < minUniqueEvents
    ) {
      rejectionCounts.filteredByBoostRules += 1;
      return false;
    }


    const byEvent = new Map();

    for (const leg of combo) {
      const key = normalizeEventNameForSameGame(leg.eventName);
      if (!byEvent.has(key)) {
        byEvent.set(key, []);
      }
      byEvent.get(key).push(leg);
    }

    const maxLegsPerGame = Number(filters?.maxLegsPerGame);
    if (
      Number.isFinite(maxLegsPerGame) &&
      maxLegsPerGame > 0 &&
      !filters.forceSameGame
    ) {
      for (const [, eventLegs] of byEvent.entries()) {
        if (eventLegs.length > maxLegsPerGame) {
          rejectionCounts.sameGameBlocked += 1;
          return false;
        }
      }
    }

    for (const [, eventLegs] of byEvent.entries()) {
      const hasOppositeSideConflict = eventLegs.some((leg, idx) =>
        eventLegs.slice(idx + 1).some((other) => {
          if (
            String(leg.marketType || "").trim().toLowerCase() !==
            String(other.marketType || "").trim().toLowerCase()
          ) {
            return false;
          }

          const legLabel = String(leg.selectionLabel || "").toLowerCase();
          const otherLabel = String(other.selectionLabel || "").toLowerCase();

          const legIsOver = /\bover\b/.test(legLabel);
          const legIsUnder = /\bunder\b/.test(legLabel);
          const otherIsOver = /\bover\b/.test(otherLabel);
          const otherIsUnder = /\bunder\b/.test(otherLabel);

          if (!((legIsOver && otherIsUnder) || (legIsUnder && otherIsOver))) {
            return false;
          }

          const legLine = Number.isFinite(leg.lineValue) ? Number(leg.lineValue) : null;
          const otherLine = Number.isFinite(other.lineValue) ? Number(other.lineValue) : null;

          return legLine !== null && otherLine !== null && legLine === otherLine;
        })
      );

      if (hasOppositeSideConflict) {
        rejectionCounts.sameGameBlocked += 1;
        return false;
      }

      const moneylineLegs = eventLegs.filter(
        (leg) => String(leg.marketType || "").trim().toLowerCase() === "moneyline_2way"
      );

      if (moneylineLegs.length >= 2) {
        const uniqueSelections = new Set(
          moneylineLegs.map((leg) => String(leg.selectionLabel || "").trim().toLowerCase())
        );

        if (uniqueSelections.size > 1) {
          rejectionCounts.sameGameBlocked += 1;
          return false;
        }
      }
    }

    if (!filters.allowRepeats) {
      const names = combo.map((leg) => String(leg.selectionLabel || "").toLowerCase());
      if (new Set(names).size !== names.length) {
        rejectionCounts.repeatsBlocked += 1;
        return false;
      }
    }

    const requiredLegText = String(filters?.requiredLegText || "").trim();
    if (requiredLegText && !combo.some((leg) => legMatchesRuleText(leg, requiredLegText))) {
      rejectionCounts.filteredByBoostRules += 1;
      return false;
    }

    const requiredMainLineLegs = Number(filters?.requiredMainLineLegs);
    if (Number.isFinite(requiredMainLineLegs) && requiredMainLineLegs > 0) {
      const mainLineCount = combo.filter((leg) => isMainLineMarket(leg.marketType)).length;

      if (mainLineCount < requiredMainLineLegs) {
        rejectionCounts.filteredByBoostRules += 1;
        return false;
      }
    }

    return true;
  });

  const maxDisplayedParlays = Number.isFinite(Number(filters?.maxDisplayedParlays))
  ? Math.max(1, Number(filters.maxDisplayedParlays))
  : 10;

  const parlays = combinations
    .map((legs, idx) => buildSingleParlayCandidate({ legs, idx, filters }))
    .filter(Boolean)
    .filter((parlay) => {
      if (parlay.expectedValuePct > 0) return true;
      rejectionCounts.nonPositiveParlayEv += 1;
      return false;
    })
      .sort((a, b) => compareParlays(a, b, filters?.parlaySortMode || "best_overall"))
     .slice(0, maxDisplayedParlays);
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
  const selectedDevigMethod = normalizeDevigMethod(filters?.devigMethod || legs?.[0]?.devigMethod || "power");
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

  const rawProfitMultiple = rawParlayDecimal - 1;
  const rawExpectedValuePct =
    fairHitProbability * rawProfitMultiple - (1 - fairHitProbability);

  const averageLegEvPct = average(legs.map((leg) => leg.legEvPct));
  const hasNegativeLegEv = legs.some((leg) => Number(leg.legEvPct) < 0);
  const isBoostOnlyEdge = rawExpectedValuePct <= 0 || hasNegativeLegEv;

  const rawSuggestedKellyStake = calculateSuggestedKellyStake({
    bankroll: Number(filters.bankroll) || 0,
    kellyFraction: Number(filters.kellyFraction) || 0,
    winProbability: fairHitProbability,
    decimalOdds: rawParlayDecimal,
  });

  const boostedSuggestedKellyStake = calculateSuggestedKellyStake({
    bankroll: Number(filters.bankroll) || 0,
    kellyFraction: Number(filters.kellyFraction) || 0,
    winProbability: fairHitProbability,
    decimalOdds: boostedParlayDecimal,
  });

  const suggestedKellyStake = boostedSuggestedKellyStake;

  const varianceScore = calculateVarianceScore({
    fairHitProbability,
    boostedParlayAmerican,
    legs,
  });

  const distribution = summarizeDistribution(legs);
  const correlationRisk = assessCorrelationRisk(legs);

  const grade = gradeParlay({
    expectedValuePct,
    rawExpectedValuePct,
    averageLegEvPct,
    hasNegativeLegEv,
    fairHitProbability,
    boostedParlayAmerican,
    legCount: legs.length,
    varianceScore,
    correlationRisk,
  });

  const notes = buildParlayNotes({
    legs,
    expectedValuePct,
    rawExpectedValuePct,
    averageLegEvPct,
    hasNegativeLegEv,
    isBoostOnlyEdge,
    fairHitProbability,
    boostedParlayAmerican,
    suggestedKellyStake,
    rawSuggestedKellyStake,
    boostedSuggestedKellyStake,
    rawExpectedValuePct,
    stake,
    distribution,
    correlationRisk,
    grade,
    selectedDevigMethod,
  });

  const devigAdvice = buildDevigAdvice({
    selectedDevigMethod,
    legs,
    fairHitProbability,
    rawParlayDecimal,
    boostedParlayDecimal,
    filters,
  });

  return {
    id: `parlay_${idx + 1}`,
    legs,
      legDescriptions: legs.map((leg) => {
            const labelWithLine =
              leg.lineValue !== null && leg.lineValue !== undefined
                ? `${leg.selectionLabel} ${leg.lineValue}`
                : leg.selectionLabel;

            return `${leg.eventName} — ${labelWithLine} (Target ${formatAmerican(
              leg.oddsAmerican
            )} at ${leg.sportsbook}, Sharp ${formatAmerican(
              leg.fairAmerican
            )}, leg EV ${formatPct(leg.legEvPct)})`;
          }),
    rawParlayDecimal,
    boostedParlayDecimal,
    rawParlayAmerican,
    boostedParlayAmerican,
    fairHitProbability,
    expectedValuePct,
    expectedProfitAtStake,
    suggestedKellyStake,
    rawSuggestedKellyStake,
    boostedSuggestedKellyStake,
    kellyBankrollUsed: Number(filters.bankroll) || 0,
    kellyFractionUsed: Number(filters.kellyFraction) || 0,
    rawExpectedValuePct,
    averageLegEvPct,
    hasNegativeLegEv,
    isBoostOnlyEdge,
    varianceScore,
    distribution,
    correlationRisk,
    gradeScore: grade.score,
    gradeTier: grade.tier,
    playLabel: grade.label,
    boostPctUsed: Number(filters.boostPct) || 0,
    devigMethodUsed: selectedDevigMethod,
    devigMethodLabel: getDevigMethodLabel(selectedDevigMethod),
    devigWarning: devigAdvice.warning,
    recommendedDevigMethod: devigAdvice.recommendedMethod,
    recommendedDevigMethodLabel: devigAdvice.recommendedMethodLabel,
    recommendedDevigSnapshot: devigAdvice.snapshot,
    notes,
  };
}

function buildAllSharpQuotesForParlayLeg({ fair, selection, fallbackSharpQuote } = {}) {
  const quotes = [];

  function addQuote(quote = {}) {
    const sportsbook = String(quote.sportsbook || quote.bookmaker || "").trim();
    const oddsAmerican = Number(quote.oddsAmerican);

    if (!sportsbook || !Number.isFinite(oddsAmerican)) return;

    const key = `${sportsbook.toLowerCase()}::${oddsAmerican}`;
    if (quotes.some((existing) => existing.key === key)) return;

    quotes.push({
      key,
      sportsbook,
      oddsAmerican,
      oddsDecimal: Number.isFinite(Number(quote.oddsDecimal)) ? Number(quote.oddsDecimal) : null,
      parsedRowId: quote.parsedRowId || quote.rowId || null,
    });
  }

  for (const quote of fair?.allSharpQuotes || []) {
    addQuote(quote);
  }

  for (const quote of selection?.quotes || []) {
    if (quote?.isSharpSource === true || quote?.batchRole === "fair_odds") {
      addQuote(quote);
    }
  }

  addQuote(fallbackSharpQuote);

  return quotes.map(({ key, ...quote }) => quote);
}


function gradeParlay({
  expectedValuePct,
  rawExpectedValuePct,
  averageLegEvPct,
  hasNegativeLegEv,
  fairHitProbability,
  boostedParlayAmerican,
  legCount,
  varianceScore,
  correlationRisk,
}) {
  let score = 0;

  const boostOnly = rawExpectedValuePct <= 0 || hasNegativeLegEv || averageLegEvPct < 0;

  // Boosted EV matters, but should not dominate the grade alone.
  score += clamp(expectedValuePct / 0.12, -1, 2) * 35;

  // Raw, non-boost EV matters because it tells us whether the bet is good before promo help.
  score += clamp(Math.max(rawExpectedValuePct, 0) / 0.06, 0, 1.5) * 20;

  // Hit rate matters because user wants usable plays, not just lottery tickets.
  score += clamp(fairHitProbability / 0.25, 0, 1.6) * 25;

  // Penalize very long odds / volatility.
  score -= varianceScore * 12;

  // Penalize too many legs.
  score -= Math.max(0, legCount - 2) * 6;

  // Penalize obvious same-game style correlation risk.
  if (correlationRisk === "high") score -= 12;
  if (correlationRisk === "medium") score -= 6;

  // Penalize negative individual-leg quality.
  if (hasNegativeLegEv) score -= 12;
  if (averageLegEvPct < 0) score -= 12;

  // Penalize plays that only become positive because of boost.
  if (rawExpectedValuePct <= 0) score -= 14;

  // Slight penalty for very extreme odds structures.
  if (boostedParlayAmerican >= 1500) score -= 10;
  else if (boostedParlayAmerican >= 800) score -= 5;

  if (boostOnly) {
    if (score >= 44 && expectedValuePct >= 0.06 && fairHitProbability >= 0.15) {
      return { tier: "B", label: "Boost-Only Edge", score };
    }

    if (score >= 30 && expectedValuePct > 0) {
      return { tier: "C", label: "Thin Boost Edge", score };
    }

    return { tier: "D", label: "Promo-Only Longshot", score };
  }

  if (score >= 64 && expectedValuePct >= 0.06 && fairHitProbability >= 0.18) {
    return { tier: "A+", label: "Premium Play", score };
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


function buildDevigAdvice({
  selectedDevigMethod,
  legs,
  rawParlayDecimal,
  boostedParlayDecimal,
  filters,
}) {
  const method = normalizeDevigMethod(selectedDevigMethod);
  const hasLongshotLeg = (legs || []).some((leg) => {
    const sharpAmerican = Number(leg.sharpOddsAmerican);
    const fairProbability = Number(leg.fairProbability);
    return (
      (Number.isFinite(sharpAmerican) && sharpAmerican >= 250) ||
      (Number.isFinite(fairProbability) && fairProbability <= 0.25)
    );
  });

  const hasThreeWayMarket = (legs || []).some(
    (leg) => String(leg.marketType || "").toLowerCase() === "moneyline_3way"
  );

  let warning = "";
  let recommendedMethod = "";

  if (method === "additive" && hasLongshotLeg) {
    warning = "Additive devig can be unstable on longshot-heavy props or anytime markets.";
    recommendedMethod = "power";
  } else if (method === "multiplicative" && (hasLongshotLeg || hasThreeWayMarket)) {
    warning = "Multiplicative devig is simple, but power is usually more stable for longshot-heavy or uneven markets.";
    recommendedMethod = "power";
  } else if (method === "shin" && !hasThreeWayMarket && !hasLongshotLeg) {
    warning = "Shin-style devig is mainly a sensitivity check for asymmetric books; power is cleaner for balanced two-way markets.";
    recommendedMethod = "power";
  }

  const snapshot = recommendedMethod
    ? buildParlaySnapshotForDevigMethod({
        legs,
        method: recommendedMethod,
        rawParlayDecimal,
        boostedParlayDecimal,
        filters,
      })
    : null;

  return {
    warning,
    recommendedMethod,
    recommendedMethodLabel: recommendedMethod ? getDevigMethodLabel(recommendedMethod) : "",
    snapshot,
  };
}

function buildParlaySnapshotForDevigMethod({
  legs,
  method,
  rawParlayDecimal,
  boostedParlayDecimal,
  filters,
}) {
  const resolvedMethod = normalizeDevigMethod(method);
  const fairProbabilities = (legs || []).map((leg) => {
    const byMethod = leg.fairProbabilitiesByMethod || {};
    return Number(byMethod[resolvedMethod]);
  });

  if (
    !fairProbabilities.length ||
    fairProbabilities.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1)
  ) {
    return null;
  }

  const fairHitProbability = fairProbabilities.reduce((acc, p) => acc * p, 1);
  if (!Number.isFinite(fairHitProbability) || fairHitProbability <= 0 || fairHitProbability >= 1) {
    return null;
  }

  const rawExpectedValuePct =
    fairHitProbability * (rawParlayDecimal - 1) - (1 - fairHitProbability);
  const expectedValuePct =
    fairHitProbability * (boostedParlayDecimal - 1) - (1 - fairHitProbability);

  const rawSuggestedKellyStake = calculateSuggestedKellyStake({
    bankroll: Number(filters.bankroll) || 0,
    kellyFraction: Number(filters.kellyFraction) || 0,
    winProbability: fairHitProbability,
    decimalOdds: rawParlayDecimal,
  });

  const boostedSuggestedKellyStake = calculateSuggestedKellyStake({
    bankroll: Number(filters.bankroll) || 0,
    kellyFraction: Number(filters.kellyFraction) || 0,
    winProbability: fairHitProbability,
    decimalOdds: boostedParlayDecimal,
  });

  return {
    method: resolvedMethod,
    methodLabel: getDevigMethodLabel(resolvedMethod),
    fairHitProbability,
    expectedValuePct,
    rawExpectedValuePct,
    rawSuggestedKellyStake,
    boostedSuggestedKellyStake,
  };
}

function buildParlayNotes({
  legs,
  expectedValuePct,
  rawExpectedValuePct,
  averageLegEvPct,
  hasNegativeLegEv,
  isBoostOnlyEdge,
  fairHitProbability,
  boostedParlayAmerican,
  suggestedKellyStake,
  rawSuggestedKellyStake,
  boostedSuggestedKellyStake,
  stake,
  distribution,
  correlationRisk,
  grade,
  selectedDevigMethod,
}) {
  const notes = [];

  notes.push(`${grade.tier} grade — ${grade.label}`);
  notes.push(`Devig: ${getDevigMethodLabel(selectedDevigMethod)}`);

  if (isBoostOnlyEdge) {
    notes.push("Value depends on profit boost");
  }

  if (hasNegativeLegEv) {
    notes.push("Contains negative pre-boost leg EV");
  }

  if (Number.isFinite(rawExpectedValuePct)) {
    notes.push(`Raw EV ${formatPct(rawExpectedValuePct)}`);
  }

  if (Number.isFinite(averageLegEvPct)) {
    notes.push(`Avg leg EV ${formatPct(averageLegEvPct)}`);
  }

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

  if (isBoostOnlyEdge) {
    notes.push(
      `Boosted Kelly stake ≈ $${Number(boostedSuggestedKellyStake || 0).toFixed(2)}`
    );
    notes.push(
      `Raw Kelly stake ≈ $${Number(rawSuggestedKellyStake || 0).toFixed(2)}`
    );
  } else if (Number.isFinite(boostedSuggestedKellyStake) && boostedSuggestedKellyStake > 0) {
    notes.push(`Kelly-style stake ≈ $${boostedSuggestedKellyStake.toFixed(2)}`);
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

function passesSameSportConstraint(legs) {
  const sports = new Set(
    (legs || [])
      .map((leg) => String(leg.sport || "").trim().toUpperCase())
      .filter(Boolean)
  );

  return sports.size <= 1;
}

function normalizeEventNameForSameGame(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateCombinations(items, size, maxResults = Number.POSITIVE_INFINITY) {
  const results = [];

  function backtrack(start, combo) {
    if (results.length >= maxResults) return;

    if (combo.length === size) {
      results.push([...combo]);
      return;
    }

    const remainingNeeded = size - combo.length;
    const lastStart = items.length - remainingNeeded;

    for (let i = start; i <= lastStart; i += 1) {
      if (results.length >= maxResults) break;

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

function compareParlays(a, b, sortMode = "best_overall") {
  const mode = String(sortMode || "best_overall");

  if (mode === "boosted_ev") {
    return compareNumberDesc(a.expectedValuePct, b.expectedValuePct)
      || compareNumberDesc(a.gradeScore, b.gradeScore)
      || compareNumberDesc(a.fairHitProbability, b.fairHitProbability);
  }

  if (mode === "grade") {
    return compareNumberDesc(a.gradeScore, b.gradeScore)
      || compareNumberDesc(a.expectedValuePct, b.expectedValuePct)
      || compareNumberDesc(a.rawExpectedValuePct, b.rawExpectedValuePct)
      || compareNumberDesc(a.fairHitProbability, b.fairHitProbability);
  }

  if (mode === "raw_ev") {
    return compareNumberDesc(a.rawExpectedValuePct, b.rawExpectedValuePct)
      || compareNumberDesc(a.expectedValuePct, b.expectedValuePct)
      || compareNumberDesc(a.gradeScore, b.gradeScore);
  }

  if (mode === "hit_probability") {
    return compareNumberDesc(a.fairHitProbability, b.fairHitProbability)
      || compareNumberDesc(a.expectedValuePct, b.expectedValuePct)
      || compareNumberDesc(a.gradeScore, b.gradeScore);
  }

  if (mode === "kelly") {
    return compareNumberDesc(a.boostedSuggestedKellyStake ?? a.suggestedKellyStake, b.boostedSuggestedKellyStake ?? b.suggestedKellyStake)
      || compareNumberDesc(a.expectedValuePct, b.expectedValuePct)
      || compareNumberDesc(a.gradeScore, b.gradeScore);
  }

  // Best Overall: grade quality first, then boosted EV, raw EV, hit probability, lower variance.
  return compareNumberDesc(a.gradeScore, b.gradeScore)
    || compareNumberDesc(a.expectedValuePct, b.expectedValuePct)
    || compareNumberDesc(a.rawExpectedValuePct, b.rawExpectedValuePct)
    || compareNumberDesc(a.fairHitProbability, b.fairHitProbability)
    || compareNumberAsc(a.varianceScore, b.varianceScore);
}

function compareNumberDesc(a, b) {
  const left = Number.isFinite(Number(a)) ? Number(a) : Number.NEGATIVE_INFINITY;
  const right = Number.isFinite(Number(b)) ? Number(b) : Number.NEGATIVE_INFINITY;

  if (right !== left) return right - left;
  return 0;
}

function compareNumberAsc(a, b) {
  const left = Number.isFinite(Number(a)) ? Number(a) : Number.POSITIVE_INFINITY;
  const right = Number.isFinite(Number(b)) ? Number(b) : Number.POSITIVE_INFINITY;

  if (left !== right) return left - right;
  return 0;
}

function buildLegDisplayLabel({
  subjectName = "",
  selectionLabel = "",
  lineValue = null,
  marketType = "",
}) {
  const subject = String(subjectName || "").trim();
  const selection = String(selectionLabel || "").trim();
  const marketLabel = formatLegMarketLabel(marketType);
  const line =
    lineValue !== null && lineValue !== undefined && lineValue !== ""
      ? String(lineValue)
      : "";

  const side = /\bover\b/i.test(selection)
    ? "Over"
    : /\bunder\b/i.test(selection)
      ? "Under"
      : /^yes$/i.test(selection)
        ? "Yes"
        : /^no$/i.test(selection)
          ? "No"
          : "";

  if (subject && side) {
    return `${subject} ${side}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  if (subject && line && isPlayerPropMarketType(marketType)) {
    return `${subject} Over ${line}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  if (subject && selection && selection.toLowerCase() !== subject.toLowerCase()) {
    return `${subject} ${selection}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  if (selection) {
    return `${selection}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  return `${subject || "Leg"}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
}

function isPlayerPropMarketType(marketType = "") {
  const text = String(marketType || "").toLowerCase();

  return (
    text.startsWith("player_") ||
    text === "double_double" ||
    text === "triple_double"
  );
}

function formatLegMarketLabel(marketType = "") {
  const labels = {
    player_points: "Points",
    player_assists: "Assists",
    player_rebounds: "Rebounds",
    player_threes: "Threes",
    player_pra: "PRA",
    player_points_rebounds: "Points + Rebounds",
    player_points_assists: "Points + Assists",
    player_rebounds_assists: "Rebounds + Assists",
    double_double: "Double-Double",
    triple_double: "Triple-Double",
    spread: "Spread",
    total: "Total",
    moneyline_2way: "Moneyline",
    moneyline_3way: "Moneyline",
  };

  return labels[String(marketType || "")] || String(marketType || "").replace(/_/g, " ");
}


function extractSubjectNameFromMarket(market) {
  const subjectKey = String(market?.subjectKey || "");

  if (!subjectKey.includes("::")) return "";

  const rawName = subjectKey.split("::").slice(1).join("::").trim();
  if (!rawName) return "";

  return rawName
    .split(/\s+/)
    .map((part) => {
      if (/^[a-z]\.$/i.test(part)) return part.toUpperCase();
      if (/^mj$/i.test(part)) return "MJ";
      if (/^jr\.?$/i.test(part)) return "Jr.";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
