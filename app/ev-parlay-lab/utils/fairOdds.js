import {
  decimalToAmerican,
  impliedProbabilityFromDecimal,
} from "./odds";

export function calculateFairOddsForMarkets(markets) {
  const results = [];

  for (const market of markets) {
    const sharpSelections = market.selections
      .map((selection) => {
        const sharpQuotes = selection.quotes.filter(
          (q) => q.isSharpSource === true && Number.isFinite(q.oddsDecimal) && q.oddsDecimal > 1
        );

        if (!sharpQuotes.length) return null;

        const bestSharpQuote = [...sharpQuotes].sort(
          (a, b) => b.oddsDecimal - a.oddsDecimal
        )[0];

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

    sharpSelections.forEach((selection, idx) => {
      const fairProbability = implieds[idx] / impliedSum;
      const fairDecimal = fairProbability > 0 ? 1 / fairProbability : null;
      const fairAmerican =
        fairDecimal && Number.isFinite(fairDecimal)
          ? decimalToAmerican(fairDecimal)
          : null;

      results.push({
        id: `${market.id}::${selection.selectionId}`,
        marketId: market.id,
        marketDisplayName: market.displayName,
        selectionId: selection.selectionId,
        selectionLabel: selection.selectionLabel,
        fairProbability,
        fairDecimal,
        fairAmerican,
        holdPct,
        sharpSportsbook: selection.sportsbook,
      });
    });
  }

  return results;
}

function getExpectedOutcomeCount(market) {
  const marketType = String(market.marketType || "").trim().toLowerCase();

  if (marketType === "moneyline_3way") return 3;

  if (
    marketType === "moneyline_2way" ||
    marketType === "spread" ||
    marketType === "total" ||
    marketType === "player_points" ||
    marketType === "player_assists" ||
    marketType === "player_rebounds" ||
    marketType === "player_threes" ||
    marketType === "player_pra"
  ) {
    return 2;
  }

  return 2;
}