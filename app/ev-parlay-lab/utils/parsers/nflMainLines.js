import { americanToDecimal, decimalToAmerican } from "../odds";
import { TEAM_ALIASES_BY_SPORT } from "../../data/teamAliases";

// Exact NFL names only. City-only aliases (Washington, Arizona, etc.) can be
// college teams; never use the general contained-name lookup to identify a game.
const teams = new Map();
const key = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
for (const [alias, canonical] of Object.entries(TEAM_ALIASES_BY_SPORT.NFL)) {
  const nickname = canonical.split(" ").at(-1);
  teams.set(key(canonical), canonical);
  teams.set(key(nickname), canonical);
  if (alias.length <= 3) {
    teams.set(key(alias), canonical);
    teams.set(key(`${alias} ${nickname}`), canonical);
  }
}
for (const [alias, canonical] of [
  ["NY Giants", "New York Giants"], ["NY Jets", "New York Jets"],
  ["LA Rams", "Los Angeles Rams"], ["LA Chargers", "Los Angeles Chargers"],
]) teams.set(key(alias), canonical);

function clean(value = "") {
  return String(value).replace(/\[([^\]]*)\]\([^\n]*?\)/g, "$1")
    .replace(/[*`]/g, "").replace(/^#+\s*/, "")
    .replace(/\u2212|âˆ’/g, "-").replace(/â€“|â€”/g, "–")
    .replace(/\s+/g, " ").trim();
}

export function resolveNflMainLineTeam(value = "") {
  return teams.get(key(clean(value).replace(/\s+\(?\d+-\d+(?:-\d+)?\)?$/, ""))) || "";
}

function teamPair(value) {
  const withoutRecords = clean(value).replace(/\b\d+-\d+(?:-\d+)?\b/g, "").replace(/\s+/g, " ").trim();
  const words = withoutRecords.split(" ");
  const matches = [];
  for (let split = 1; split < words.length; split += 1) {
    const away = resolveNflMainLineTeam(words.slice(0, split).join(" "));
    const home = resolveNflMainLineTeam(words.slice(split).join(" "));
    if (away && home && away !== home) matches.push([away, home]);
  }
  return matches.length === 1 ? matches[0] : null;
}

function leagueBefore(lines, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const match = lines[i].match(/^(?:(?:USA|United States|Canada)\s*[|/]\s*)?(NFL|NCAAF|NCAA|CFB|CFL|UFL|NBA|WNBA|NHL|MLB|SOCCER)(?:\s+\d+)?$/i);
    if (match) return { league: match[1].toUpperCase(), distance: index - i };
  }
  return { league: "", distance: Infinity };
}

function odds(value) {
  if (/^(EVEN|EVS)$/i.test(value || "")) return { american: 100, decimal: 2 };
  if (/^[+-]\d+$/.test(value || "") && Math.abs(Number(value)) >= 100) {
    return { american: Number(value), decimal: americanToDecimal(Number(value)) };
  }
  if (/^\d+\.\d+$/.test(value || "") && Number(value) > 1) {
    return { american: decimalToAmerican(Number(value)), decimal: Number(value) };
  }
  return null;
}

function spread(value) {
  if (/^(PK|PICK|PICK'EM|0|[+-]0(?:\.0)?)$/i.test(value || "")) return 0;
  return /^[+-]\d+(?:\.\d+)?$/.test(value || "") && Math.abs(Number(value)) < 100 ? Number(value) : null;
}

function total(value, side) {
  const match = String(value || "").match(/^(O|Over|U|Under)\s*(\d+(?:\.\d+)?)$/i);
  return match && match[1][0].toUpperCase() === side && Number(match[2]) > 0 ? Number(match[2]) : null;
}

// Preserve field positions. A locked/missing price is a token, not permission
// to shift following odds into its place. Unknown text ends the current block.
function tokensFromLine(line) {
  if (/^(Show All|Hide All|Show Less|See more|See less|Image|svg|\d+-\d+(?:-\d+)?)$/i.test(line)) return [];
  const team = resolveNflMainLineTeam(line);
  if (team) return [team];
  const pair = teamPair(line);
  if (pair) return pair;
  if (odds(line) || spread(line) !== null || total(line, "O") !== null || total(line, "U") !== null || /^(--?|Locked|Suspended|N\/A)$/i.test(line)) return [line];
  const inline = line.match(/^(.+?)\s+([+-]\d+|\d+\.\d+|EVEN|EVS)$/i);
  if (inline && odds(inline[2])) {
    const label = resolveNflMainLineTeam(inline[1]) || inline[1];
    if (resolveNflMainLineTeam(label) || spread(label) !== null || total(label, "O") !== null || total(label, "U") !== null) return [label, inline[2]];
  }
  return null;
}

function readTokens(lines, start, end) {
  const tokens = [];
  for (let i = start; i < end; i += 1) {
    const next = tokensFromLine(lines[i]);
    if (next === null) break;
    tokens.push(...next);
  }
  return tokens;
}

function row(book, event, marketType, selection, lineValue, price) {
  return {
    sportsbook: book, sport: "NFL", league: "NFL", eventLabelRaw: event,
    marketType, selectionRaw: selection, selectionNormalized: selection,
    lineValue, oddsAmerican: price.american, oddsDecimal: price.decimal,
    period: "full_game", confidence: "high", parseWarnings: [],
    isSharpSource: book === "Pinnacle", isTargetBook: book === "BetMGM",
    batchRole: book === "Pinnacle" ? "fair_odds" : "target",
    excluded: false, userEdited: false,
  };
}

function addPair(rows, book, event, market, selections, lines, prices) {
  const parsedPrices = prices.map(odds);
  if (parsedPrices.some(price => !price)) return;
  if (market === "spread" && (lines.some(line => line === null) || Math.abs(lines[0] + lines[1]) > 0.0001)) return;
  if (market === "total" && (lines.some(line => line === null) || lines[0] !== lines[1])) return;
  rows.push(...selections.map((selection, i) => row(book, event, market, selection, lines[i], parsedPrices[i])));
}

const periodLabel = /^(Game lines|Main lines|Full game|Full time|(?:1st|2nd|3rd|4th|First|Second|Third|Fourth) (?:half|quarter)|[1-4][HQ]|[HQ][1-4]|Regulation(?: time)?)$/i;

function fullGameTable(lines, index) {
  let isGame = true;
  for (let i = 0; i < index; i += 1) {
    if (!periodLabel.test(lines[i])) continue;
    const run = [lines[i]];
    while (i + 1 < index && periodLabel.test(lines[i + 1])) run.push(lines[++i]);
    // BetMGM repeats the selected Game lines label before listing other period
    // choices. A single partial-period heading is never a full-game section.
    const selected = /^Game lines$/i.test(run[0]) && run.length > 1 ? run[1] : run[0];
    isGame = /^(Game lines|Main lines|Full game|Full time)$/i.test(selected);
  }
  return isGame;
}

function parseBetMgmNfl(lines, forced) {
  const rows = [];
  let handled = forced;
  const hasNflLabel = lines.some(line => /\bNFL\b/i.test(line));
  for (let i = 0; i < lines.length - 3; i += 1) {
    if (!/^Spread$/i.test(lines[i]) || !/^Total$/i.test(lines[i + 1]) || !/^(Money|Moneyline|Money line)$/i.test(lines[i + 2])) continue;
    const tokens = readTokens(lines, i + 3, Math.min(lines.length, i + 25));
    const scope = leagueBefore(lines, i);
    if (scope.league === "NFL") handled = true;
    const away = resolveNflMainLineTeam(tokens[0]);
    const columnLayout = Boolean(resolveNflMainLineTeam(tokens[1]));
    const home = resolveNflMainLineTeam(tokens[columnLayout ? 1 : 6]);
    if (!away || !home || away === home) continue;
    const ambiguous = ["New York Giants", "Arizona Cardinals", "New York Jets", "Carolina Panthers"].includes(away) &&
      ["New York Giants", "Arizona Cardinals", "New York Jets", "Carolina Panthers"].includes(home);
    if (!forced && (!hasNflLabel || (scope.league && scope.league !== "NFL" && (scope.distance < 12 || ambiguous)))) continue;
    handled = true;
    if (!fullGameTable(lines, i) || tokens.length !== 12) continue;
    const event = `${away} @ ${home}`;
    if (columnLayout) {
      addPair(rows, "BetMGM", event, "spread", [away, home], [spread(tokens[2]), spread(tokens[4])], [tokens[3], tokens[5]]);
      addPair(rows, "BetMGM", event, "total", ["Over", "Under"], [total(tokens[6], "O"), total(tokens[8], "U")], [tokens[7], tokens[9]]);
      addPair(rows, "BetMGM", event, "moneyline_2way", [away, home], [null, null], [tokens[10], tokens[11]]);
    } else {
      addPair(rows, "BetMGM", event, "spread", [away, home], [spread(tokens[1]), spread(tokens[7])], [tokens[2], tokens[8]]);
      addPair(rows, "BetMGM", event, "total", ["Over", "Under"], [total(tokens[3], "O"), total(tokens[9], "U")], [tokens[4], tokens[10]]);
      addPair(rows, "BetMGM", event, "moneyline_2way", [away, home], [null, null], [tokens[5], tokens[11]]);
    }
  }
  return handled ? rows : null;
}

function parsePinnacleNfl(lines, forced) {
  const rows = [];
  // Older extension exports have no NFL_CAPTURE_LEAGUE marker. A landing
  // card still establishes NFL scope through its league and exact team pair.
  // Until its columns are supported, return no rows instead of letting the
  // generic parser turn "New England" into soccer or "Jets" into hockey.
  let handled = forced || lines.some((line, index) => {
    const away = resolveNflMainLineTeam(line);
    const home = resolveNflMainLineTeam(lines[index + 1]);
    return away && home && away !== home && leagueBefore(lines, index).league === "NFL";
  });
  // A visible matchup is the boundary even if it contains an unknown team.
  // That prevents the preceding game's parser from absorbing another event.
  const games = lines.flatMap((line, index) => {
    if (/\d{1,2}:\d{2}/.test(line)) return [];
    const match = line.match(/^(.+?)\s+(?:@|at|vs\.?)\s+(.+)$/i);
    return match ? [{ index, away: resolveNflMainLineTeam(match[1]), home: resolveNflMainLineTeam(match[2]) }] : [];
  });
  for (let g = 0; g < games.length; g += 1) {
    const { index, away, home } = games[g];
    if (!forced && leagueBefore(lines, index).league !== "NFL") continue;
    handled = true;
    if (!away || !home || away === home) continue;
    const end = games[g + 1]?.index ?? lines.length;
    const event = `${away} @ ${home}`;
    const seenMarkets = new Set();
    for (let i = index + 1; i < end; i += 1) {
      if (/^(FAVOURITES|FAVORITES|TOP SPORTS|A-Z SPORTS|BET SLIP|BETTING RESOURCES)$/i.test(lines[i])) break;
      const header = lines[i].match(/^(Money Line|Moneyline|Handicap|Spread|Total)\s*[–—-]\s*(Game|Full Game|Match|OT Included)$/i);
      if (!header) continue;
      const market = /^Money/i.test(header[1]) ? "moneyline_2way" : /^(Handicap|Spread)$/i.test(header[1]) ? "spread" : "total";
      if (seenMarkets.has(market)) continue;
      const tokens = readTokens(lines, i + 1, end);
      const before = rows.length;
      if (market === "total") {
        addPair(rows, "Pinnacle", event, market, ["Over", "Under"], [total(tokens[0], "O"), total(tokens[2], "U")], [tokens[1], tokens[3]]);
      } else if (market === "moneyline_2way") {
        if (tokens.length === 4 && tokens[0] === away && tokens[2] === home) {
          addPair(rows, "Pinnacle", event, market, [away, home], [null, null], [tokens[1], tokens[3]]);
        } else if (tokens.length === 4 && tokens[0] === away && tokens[1] === home) {
          addPair(rows, "Pinnacle", event, market, [away, home], [null, null], [tokens[2], tokens[3]]);
        }
      } else if (tokens[0] === away && tokens[1] === home) {
        addPair(rows, "Pinnacle", event, market, [away, home], [spread(tokens[2]), spread(tokens[4])], [tokens[3], tokens[5]]);
      } else if (tokens[0] === away && tokens[3] === home) {
        addPair(rows, "Pinnacle", event, market, [away, home], [spread(tokens[1]), spread(tokens[4])], [tokens[2], tokens[5]]);
      }
      if (rows.length > before) seenMarkets.add(market);
    }
  }
  return handled ? rows : null;
}

export function parseNflMainLines(rawText, sportsbook, context = {}) {
  const lines = String(rawText || "").split(/\r?\n|\t/).map(clean).filter(Boolean)
    .flatMap(line => /^Spread\s+Total\s+(Money|Moneyline|Money line)$/i.test(line) ? ["Spread", "Total", "Money"] : [line]);
  const forced = /^NFL$/i.test(context.sport || context.league || "") || lines.some(line => /^NFL_CAPTURE_LEAGUE: NFL$/i.test(line));
  const parsed = sportsbook === "Pinnacle" ? parsePinnacleNfl(lines, forced) : parseBetMgmNfl(lines, forced);
  if (parsed === null) return null;
  const seen = new Set();
  return parsed.filter(item => {
    const identity = [item.eventLabelRaw, item.marketType, item.selectionNormalized, item.lineValue, item.oddsAmerican].join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map((item, i) => ({ ...item, id: `${sportsbook.toLowerCase()}_nfl_${i + 1}` }));
}
