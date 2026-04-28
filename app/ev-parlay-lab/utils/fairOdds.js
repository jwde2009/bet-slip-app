import {
  decimalToAmerican,
  impliedProbabilityFromDecimal,
} from "./odds";
import { normalizeMarketType } from "./marketNormalization";


export function calculateFairOddsForMarkets(markets) {
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

