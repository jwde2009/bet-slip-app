export function parseFanDuelText(rawText = "") {
  const lines = rawText
    .split("\n")
    .map((l) => normalizeLine(l))
    .filter(Boolean);

  const rows = [];
  let i = 0;

  while (i < lines.length) {
    const teamA = lines[i];
    const teamB = lines[i + 1];

    if (!isLikelyTeamName(teamA) || !isLikelyTeamName(teamB)) {
      i++;
      continue;
    }

    const spreadA = parseSignedNumber(lines[i + 2]);
    const spreadAOdds = parseAmericanOdds(lines[i + 3]);
    const moneylineA = parseAmericanOdds(lines[i + 4]);
    const totalOver = parseTotalToken(lines[i + 5], "O");
    const totalOverOdds = parseAmericanOdds(lines[i + 6]);

    const spreadB = parseSignedNumber(lines[i + 7]);
    const spreadBOdds = parseAmericanOdds(lines[i + 8]);
    const moneylineB = parseAmericanOdds(lines[i + 9]);
    const totalUnder = parseTotalToken(lines[i + 10], "U");
    const totalUnderOdds = parseAmericanOdds(lines[i + 11]);

    const hasMainBlock =
      spreadA !== null &&
      spreadAOdds !== null &&
      moneylineA !== null &&
      totalOver !== null &&
      totalOverOdds !== null &&
      spreadB !== null &&
      spreadBOdds !== null &&
      moneylineB !== null &&
      totalUnder !== null &&
      totalUnderOdds !== null;

    if (!hasMainBlock) {
      i++;
      continue;
    }

    const event = `${teamA} vs ${teamB}`;

    rows.push(
      buildRow({
        event,
        marketType: "spread",
        selection: teamA,
        lineValue: spreadA,
        oddsAmerican: spreadAOdds,
      })
    );

    rows.push(
      buildRow({
        event,
        marketType: "moneyline_2way",
        selection: teamA,
        lineValue: null,
        oddsAmerican: moneylineA,
      })
    );

    rows.push(
      buildRow({
        event,
        marketType: "total",
        selection: "Over",
        lineValue: totalOver,
        oddsAmerican: totalOverOdds,
      })
    );

    rows.push(
      buildRow({
        event,
        marketType: "spread",
        selection: teamB,
        lineValue: spreadB,
        oddsAmerican: spreadBOdds,
      })
    );

    rows.push(
      buildRow({
        event,
        marketType: "moneyline_2way",
        selection: teamB,
        lineValue: null,
        oddsAmerican: moneylineB,
      })
    );

    rows.push(
      buildRow({
        event,
        marketType: "total",
        selection: "Under",
        lineValue: totalUnder,
        oddsAmerican: totalUnderOdds,
      })
    );

    // Skip past the parsed market block.
    i += 12;

    // Skip trailing metadata/noise until the next likely team name pair.
    while (i < lines.length) {
      if (isLikelyTeamName(lines[i]) && isLikelyTeamName(lines[i + 1])) {
        break;
      }
      i++;
    }
  }

  return rows.filter(Boolean);
}

/* ================= HELPERS ================= */

function normalizeLine(value) {
  return String(value || "")
    .replace(/âˆ’/g, "-")
    .replace(/\u2212/g, "-")
    .trim();
}

function parseAmericanOdds(value) {
  const text = normalizeLine(value);
  if (!/^[+-]\d{2,5}$/.test(text)) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseSignedNumber(value) {
  const text = normalizeLine(value);
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseTotalToken(value, expectedSide) {
  const text = normalizeLine(value);
  const match = text.match(/^([OU])\s*(\d+(\.\d+)?)$/i);
  if (!match) return null;

  const side = match[1].toUpperCase();
  if (expectedSide && side !== String(expectedSide).toUpperCase()) return null;

  const n = Number(match[2]);
  return Number.isFinite(n) ? n : null;
}

function isLikelyTeamName(value) {
  const text = normalizeLine(value);
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;

  if (
    /^(nba betting odds|more info|log in|invite friends|games|parlay builder|nba finals|futures sgp|awards|playoffs|conference|nba odds|nba|spread|money|total|stats|more|sportsbook odds \/ nba odds|today's nba odds|popular ways to bet on nba|bet on nba odds all year at fanduel sportsbook|live betting and live odds|how to read nba odds|how nba point spreads work|how nba moneylines work|basketball betting faqs|about|register|promotions|support|about us|how to bet|responsible gaming|accessibility|privacy|terms of use|press & media|back to top|all sports|other links|fantasy|in person sportsbook)$/i.test(
      text
    )
  ) {
    return false;
  }

  if (/^(mon|tue|wed|thu|fri|sat|sun)\b/i.test(text)) return false;
  if (/\d{1,2}:\d{2}\s*(am|pm)?/i.test(text)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  if (/^[OU]\s*\d+(\.\d+)?$/i.test(text)) return false;

  return true;
}

/* ================= NORMALIZED ROW ================= */

function buildRow({
  event,
  marketType,
  selection,
  lineValue,
  oddsAmerican,
}) {
  return {
    id: crypto.randomUUID(),
    sportsbook: "FanDuel",
    sport: "NBA",
    eventLabelRaw: event,
    marketType,
    selectionNormalized: selection,
    lineValue,
    oddsAmerican,
    isSharpSource: false,
    isTargetBook: true,
    batchRole: "target",
    confidence: "high",
    parseWarnings: [],
  };
}