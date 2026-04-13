import { parseDraftKingsText } from "./parseDraftKingsText";
import { parseFanDuelText } from "./parseFanDuelText";
import { parseBetMGMText } from "./parseBetMGMText";
import { parseCaesarsText } from "./parseCaesarsText";
import { parsePinnacleText } from "./parsePinnacleText";
import { parseTheScoreBetText } from "./parseTheScoreBetText";

export function parseOddsText(rawText, context = {}) {
  const sportsbook = String(context.sportsbook || "Manual").trim().toLowerCase();

  if (sportsbook === "draftkings") {
    return parseDraftKingsText(rawText, context);
  }

  if (sportsbook === "fanduel") {
    return parseFanDuelText(rawText, context);
  }

  if (sportsbook === "betmgm") {
    return parseBetMGMText(rawText, context);
  }

  if (sportsbook === "caesars") {
    return parseCaesarsText(rawText, context);
  }

  if (sportsbook === "pinnacle") {
    return parsePinnacleText(rawText, context);
  }

  if (sportsbook === "thescorebet") {
  return parseTheScoreBetText(rawText, context);
  }

  if (
    /sportsbook\s*\/\s*basketball odds\s*\/\s*nba odds/i.test(rawText) ||
    /more bets/i.test(rawText) ||
    /\bAT\b/.test(rawText)
  ) {
    return parseDraftKingsText(rawText, context);
  }

  return [];
}