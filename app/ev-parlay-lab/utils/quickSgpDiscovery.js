// Candidate ideas only. Two-leg SGP odds are NEVER inferred from straight prices.
const SUPPORTED_SPORTS = new Set(["NFL", "NBA", "WNBA", "NCAAM", "NCAAF", "MLB", "NHL"]);
const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const fullGame = row => {
  const period = normalize(row.period || "full_game").replace(/[\s-]+/g, "_");
  return ["full_game", "game", "match", "full_time"].includes(period);
};
const eligible = row => row && !row.excluded && !row.isLive && !row.isLikelyLive &&
  !/live|in.play/i.test(String(row.marketStatus || "")) && fullGame(row);
const price = row => {
  const decimal = Number(row.oddsDecimal);
  if (Number.isFinite(decimal) && decimal > 1) return decimal;
  const american = Number(row.oddsAmerican);
  if (!Number.isFinite(american) || Math.abs(american) < 100) return null;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
};
const americanText = row => {
  const a = Number(row.oddsAmerican);
  if (row.oddsAmerican != null && Number.isFinite(a) && Math.abs(a) >= 100) {
    return a > 0 ? "+" + a : String(a);
  }
  return Number(row.oddsDecimal).toFixed(3) + "x";
};

export function parseQuickSgpPromotion(value) {
  const text = String(value || "");
  const isSgp = /\bsgp\b|same[ -]?game\s+parlay/i.test(text);
  const boost = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:(?:odds|profit)\s*)?boost/i) ||
    text.match(/\bboost\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i);
  const cap = text.match(/\bmax(?:imum)?(?:imum)?(?:\s+(?:stake|wager|bet))?\s*(?::|of)?\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  const boostPct = boost ? Number(boost[1]) : NaN;
  const maxStake = cap ? Number(cap[1].replace(/,/g, "")) : NaN;
  if (!isSgp) return { error: "Include SGP or same-game parlay in the promotion." };
  if (!Number.isFinite(boostPct) || boostPct <= 0 || boostPct > 500) {
    return { error: "Include a valid odds boost percentage, such as 20%." };
  }
  if (!Number.isFinite(maxStake) || maxStake <= 0 || maxStake > 1000000) {
    return { error: "Include a maximum stake, such as max $250." };
  }
  return { boostPct, maxStake, kind: "SGP" };
}

// Profit boosts apply to WINNINGS, not to the stake returned.
export function boostedSgpDecimal(rawDecimal, boostPct) {
  const d = Number(rawDecimal);
  const p = Number(boostPct);
  if (!Number.isFinite(d) || d <= 1 || !Number.isFinite(p) || p < 0) return null;
  return 1 + (d - 1) * (1 + p / 100);
}

export function findQuickSgpCandidates(rows, { sport = "ALL", query = "", limit = 80 } = {}) {
  const byEvent = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!eligible(row)) continue;
    const league = String(row.sport || row.league || "").trim().toUpperCase();
    if (!SUPPORTED_SPORTS.has(league) || (sport !== "ALL" && sport !== league)) continue;
    const event = String(row.canonicalEventName || row.eventLabelRaw || row.eventName || row.fixture || "").trim();
    if (!event || (query && !normalize(event + " " + league).includes(normalize(query)))) continue;
    const parts = event.split(/\s+@\s+|\s+vs\.?\s+/i).map(s => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1] || normalize(parts[0]) === normalize(parts[1])) continue;
    const odds = price(row);
    if (!odds) continue;
    const market = normalize(row.marketType);
    if (!["moneyline_2way", "moneyline", "total", "totals"].includes(market)) continue;
    const key = league + "|" + normalize(event);
    if (!byEvent.has(key)) byEvent.set(key, { sport: league, event, teams: parts, winners: new Map(), totals: new Map() });
    const group = byEvent.get(key);
    const selection = normalize(row.selectionNormalized || row.selectionRaw);
    if (market.includes("moneyline")) {
      const team = parts.find(t => normalize(t) === selection);
      if (!team) continue;
      const old = group.winners.get(team);
      if (!old || price(old) < odds) group.winners.set(team, row);
      continue;
    }
    const line = Number(row.lineValue);
    if (!(line > 0) || line % 1 !== 0.5) continue; // avoid pushes/Asian quarter totals
    const side = /^over\b|^o(?=\s|\d)/i.test(selection) ? "over"
      : /^under\b|^u(?=\s|\d)/i.test(selection) ? "under" : "";
    if (!side) continue;
    const totalKey = String(line);
    if (!group.totals.has(totalKey)) group.totals.set(totalKey, { over: null, under: null });
    const marketTotal = group.totals.get(totalKey);
    if (!marketTotal[side] || price(marketTotal[side]) < odds) marketTotal[side] = row;
  }
  const out = [];
  for (const group of byEvent.values()) {
    if (group.winners.size !== 2) continue;
    for (const [lineStr, prices] of group.totals.entries()) {
      if (!prices.over || !prices.under) continue;
      for (const direction of ["over", "under"]) {
        // A primary SGP with winner + total requires:
        // (1) the other winner + same total as a separately quoted SGP,
        // (2) the opposite total as a straight bet.
        const opposite = direction === "over" ? "under" : "over";
        for (const [team, other] of [[group.teams[0], group.teams[1]], [group.teams[1], group.teams[0]]]) {
          const primaryLegQuote = group.winners.get(team);
          const oppositeLegQuote = group.winners.get(other);
          const oppositeTotalQuote = prices[opposite];
          out.push({
            id: [group.sport, group.event, lineStr, direction, team].join("|"),
            sport: group.sport,
            event: group.event,
            teamA: team, teamB: other,
            direction, line: Number(lineStr),
            primaryLabel: team + " + " + direction.toUpperCase() + " " + lineStr,
            hedgeLabel: other + " + " + direction.toUpperCase() + " " + lineStr,
            straightLabel: opposite.toUpperCase() + " " + lineStr,
            primaryLegBook: primaryLegQuote.sportsbook || "",
            primaryLegOdds: americanText(primaryLegQuote),
            otherLegBook: oppositeLegQuote.sportsbook || "",
            otherLegOdds: americanText(oppositeLegQuote),
            bestStraightBook: oppositeTotalQuote.sportsbook || oppositeTotalQuote.bookmaker || "",
            bestStraightOdds: americanText(oppositeTotalQuote),
            bestStraightDecimal: price(oppositeTotalQuote),
            // These are straight quotes for finding markets, not SGP estimates.
            ranking: price(oppositeTotalQuote),
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.ranking - a.ranking || a.event.localeCompare(b.event))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 80)));
}

  
// Source-backed sportsbook suggestions. A book with both straight legs visible
// is worth checking for an SGP but is NOT known to offer that SGP or any payout.
function isMatchingRow(row, candidate) {
  if (!eligible(row)) return false;
  const league = String(row.sport || row.league || "").trim().toUpperCase();
  const event = normalize(row.canonicalEventName || row.eventLabelRaw || row.eventName || row.fixture);
  return league === candidate.sport && event === normalize(candidate.event) && price(row) !== null;
}
function matchingTotal(row, candidate, side) {
  const market = normalize(row.marketType);
  if (market !== "total" && market !== "totals") return false;
  if (Number(row.lineValue) !== Number(candidate.line)) return false;
  const sel = normalize(row.selectionNormalized || row.selectionRaw);
  return side === "over"
    ? /^(over\\b|o(?=\\s|\\d))/.test(sel)
    : /^(under\\b|u(?=\\s|\\d))/.test(sel);
}
function matchingWinner(row, team) {
  const market = normalize(row.marketType);
  return (market === "moneyline_2way" || market === "moneyline") &&
    normalize(row.selectionNormalized || row.selectionRaw) === normalize(team);
}
export function suggestSgpSportsbooks(rows, candidate) {
  if (!candidate) return [];
  const books = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isMatchingRow(row, candidate)) continue;
    const book = String(row.sportsbook || row.bookmaker || "").trim();
    if (!book) continue;
    const key = normalize(book);
    if (!books.has(key)) books.set(key, { book, flags: new Set() });
    const item = books.get(key);
    if (matchingWinner(row, candidate.teamA)) item.flags.add("primaryWinner");
    if (matchingWinner(row, candidate.teamB)) item.flags.add("oppositeWinner");
    if (matchingTotal(row, candidate, candidate.direction)) item.flags.add("sameTotal");
  }
  return [...books.values()]
    .filter(b => b.flags.has("sameTotal") &&
      (b.flags.has("primaryWinner") || b.flags.has("oppositeWinner")))
    .map(b => ({
      book: b.book,
      primaryLegsSeen: b.flags.has("primaryWinner") && b.flags.has("sameTotal"),
      oppositeLegsSeen: b.flags.has("oppositeWinner") && b.flags.has("sameTotal"),
      allThreeLegsSeen: b.flags.has("primaryWinner") && b.flags.has("oppositeWinner") && b.flags.has("sameTotal"),
    }))
    .sort((a, b) =>
      Number(b.oppositeLegsSeen) - Number(a.oppositeLegsSeen) ||
      Number(b.allThreeLegsSeen) - Number(a.allThreeLegsSeen) ||
      a.book.localeCompare(b.book));
}

// Only directly observed quotes for the same event, market, period, and line.
// Best decimal payout at each sportsbook wins. No cross-event / altered lines.
export function suggestStraightHedgeSportsbooks(rows, candidate) {
  if (!candidate) return [];
  const opposite = candidate.direction === "over" ? "under" : "over";
  const quotes = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isMatchingRow(row, candidate) || !matchingTotal(row, candidate, opposite)) continue;
    const book = String(row.sportsbook || row.bookmaker || "").trim();
    if (!book) continue;
    const key = normalize(book);
    const dec = price(row);
    const old = quotes.get(key);
    if (!old || dec > old.decimal) quotes.set(key, {
      book, odds: americanText(row), decimal: dec,
    });
  }
  return [...quotes.values()].sort((a, b) => b.decimal - a.decimal || a.book.localeCompare(b.book));
}
