import { parseDraftKingsText } from "./parsers/parseDraftKingsText";
import { parseFanDuelText } from "./parsers/parseFanDuelText";
import { parseBetMGMText } from "./parsers/parseBetMGMText";
import { parseCaesarsText } from "./parsers/parseCaesarsText";
import { parsePinnacleText } from "./parsers/parsePinnacleText";
import { parseTheScoreText } from "./parsers/parseTheScoreText";

function normalizeSportsbook(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();

  if (["draftkings", "draft kings", "dk"].includes(s)) return "draftkings";
  if (["pinnacle", "pinny"].includes(s)) return "pinnacle";
  if (["fanduel", "fan duel", "fd"].includes(s)) return "fanduel";
  if (["betmgm", "bet mgm", "mgm"].includes(s)) return "betmgm";
  if (["caesars", "caesar's", "czr"].includes(s)) return "caesars";
  if (["thescore", "the score", "score"].includes(s)) return "thescore";

  return s;
}

export function parseOddsText(rawText, context = {}) {
  const normalizedRawText = typeof rawText === "string" ? rawText : "";
  const sportsbook = normalizeSportsbook(context.sportsbook || "Manual");

  console.log("PARSE ROUTER CALLED", {
    sportsbook,
    rawTextLength: normalizedRawText.length,
    rawPreview: normalizedRawText.slice(0, 300),
  });

  if (!normalizedRawText.trim()) {
    console.log("NO RAW TEXT PROVIDED");
    return [];
  }
  
  if (sportsbook === "Pinnacle") {
    return parsePinnacleText(rawText);
  }

  if (sportsbook === "draftkings") {
    const rows = parseDraftKingsText(normalizedRawText, context);
    console.log("DRAFTKINGS PARSER ROW COUNT", rows.length);
    return rows;
  }

  if (sportsbook === "fanduel") {
    const rows = parseFanDuelText(normalizedRawText, context);
    console.log("FANDUEL PARSER ROW COUNT", rows.length);
    return rows;
  }

  if (sportsbook === "betmgm") {
    const rows = parseBetMGMText(normalizedRawText, context);
    console.log("BETMGM PARSER ROW COUNT", rows.length);
    return rows;
  }

  if (sportsbook === "caesars") {
    const rows = parseCaesarsText(normalizedRawText, context);
    console.log("CAESARS PARSER ROW COUNT", rows.length);
    return rows;
  }

  if (sportsbook === "pinnacle") {
    const rows = parsePinnacleText(normalizedRawText, context);
    console.log("PINNACLE PARSER ROW COUNT", rows.length);
    return rows;
  }

  if (sportsbook === "thescore") {
    const rows = parseTheScoreText(normalizedRawText, context);
    console.log("THESCORE PARSER ROW COUNT", rows.length);
    return rows;
  }

  if (
    /sportsbook\s*\/\s*basketball odds/i.test(normalizedRawText) ||
    /\bmore bets\b/i.test(normalizedRawText) ||
    /\b(?:AT|@)\b/.test(normalizedRawText)
  ) {
    const rows = parseDraftKingsText(normalizedRawText, context);
    console.log("AUTO→DRAFTKINGS PARSER ROW COUNT", rows.length);
    return rows;
  }

  console.log("NO PARSER MATCHED");
  return [];
}