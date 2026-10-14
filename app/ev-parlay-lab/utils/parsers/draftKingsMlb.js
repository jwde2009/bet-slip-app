import { TEAM_ALIASES_BY_SPORT } from "../../data/teamAliases";
import { americanToDecimal } from "../odds";

const clean = value => String(value || "").replace(/\[([^\]]*)\]\([^\n]*?\)/g, "$1")
  .replace(/[*`]/g, "").replace(/^#+\s*/, "").replace(/\u2212/g, "-").replace(/\s+/g, " ").trim();
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const teams = new Map(Object.entries(TEAM_ALIASES_BY_SPORT.MLB).map(([alias, team]) => [key(alias), team]));
const team = value => teams.get(key(value)) || "";
const price = value => /^(?:EVEN|EVS)$/i.test(value || "") ? 100
  : /^[+-]\d+$/.test(value || "") && Math.abs(Number(value)) >= 100 ? Number(value) : null;
const number = value => /^[+-]?\d+(?:\.\d+)?$/.test(value || "") && Math.abs(Number(value)) < 100 ? Number(value) : null;
const spread = value => /^(?:PK|PICK|0)$/i.test(value || "") ? 0
  : /^[+-]\d+(?:\.\d+)?$/.test(value || "") ? number(value) : null;
const placeholder = value => /^(?:--?|Locked|Suspended|N\/A)$/i.test(value || "");

function gameTitle(value) {
  const match = value.replace(/^.*\/\s*/, "").replace(/\s+Odds$/i, "").match(/^(.+?)\s+(?:@|vs\.?|at)\s+(.+)$/i);
  const away = match && team(match[1]);
  const home = match && team(match[2]);
  return away && home && away !== home ? `${away} @ ${home}` : "";
}

function row(event, marketType, selection, lineValue, oddsAmerican) {
  return {
    sportsbook: "DraftKings", sport: "MLB", league: "MLB", eventLabelRaw: event,
    marketType, selectionRaw: selection, selectionNormalized: selection, lineValue,
    oddsAmerican, oddsDecimal: americanToDecimal(oddsAmerican), period: "full_game",
    confidence: "high", parseWarnings: [], isSharpSource: false, isTargetBook: true,
    excluded: false, userEdited: false,
  };
}

function addPair(rows, event, market, selections, values, prices) {
  const odds = prices.map(price);
  if (odds.some(value => value === null)) return;
  if (market === "spread" && (values.some(value => value === null) || Math.abs(values[0] + values[1]) > 0.0001)) return;
  if (market === "total" && (values.some(value => value === null || value < 0) || values[0] !== values[1])) return;
  rows.push(...selections.map((selection, i) => row(event, market, selection, values[i], odds[i])));
}

// Keep missing/locked cells in place. Never scan ahead for a replacement price.
function cellsAt(lines, start, count) {
  const cells = [];
  let end = start;
  for (let i = start; i < lines.length && cells.length < count; i += 1) {
    const value = lines[i];
    const ou = value.match(/^(O|Over|U|Under)\s+(\d+(?:\.\d+)?)$/i);
    if (ou) cells.push(ou[1][0].toUpperCase(), ou[2]);
    else if (price(value) !== null || number(value) !== null || placeholder(value) || /^(?:O|U|PK|PICK)$/i.test(value)) cells.push(value);
    else break;
    end = i;
  }
  cells.end = end;
  return cells.length === count ? cells : [];
}

const propTypes = {
  "hits": "player_hits", "batter hits": "player_hits", "total bases": "player_total_bases", "home runs": "player_home_runs",
  "rbis": "player_rbis", "runs": "player_runs", "runs scored": "player_runs",
  "hits + runs + rbis": "player_hits_runs_rbis", "strikeouts": "pitcher_strikeouts",
  "pitcher strikeouts": "pitcher_strikeouts", "outs": "pitcher_outs_recorded",
  "outs recorded": "pitcher_outs_recorded", "hits allowed": "pitcher_hits_allowed",
  "earned runs": "pitcher_earned_runs_allowed", "earned runs allowed": "pitcher_earned_runs_allowed",
  "walks allowed": "pitcher_walks_allowed",
};
function propType(value) {
  // Explicit O/U titles only: unlabelled 1+/2+ grids must not become O/U lines.
  const match = value.match(/^(.+?)\s+(?:O\/U|Over\/Under)$/i);
  return match ? propTypes[match[1].toLowerCase().replace(/\s*\+\s*/g, " + ")] || "" : "";
}
const partial = /^(?:(?:(?:1st|2nd|3rd|4th|5th|First|Last)\s+)?(?:[1-9]\s+)?Innings?(?: Lines)?|First Five(?: Innings)?|Team Totals?|Alternate (?:Run Line|Total)|Live)$/i;


// DRAFTKINGS_MLB_IMPORT_VERSION: 20261013_1
// Strip only the observed MLB navigation run, not real inning-market headings.
// A merged export repeats the run once per pass. Its INNINGS / TEAM choices
// describe available tabs, not the period of the priced table that follows.
const mlbNavigationLabels = new Set([
  "POPULAR", "BATTER", "PITCHER", "BATTER PROPS", "PITCHER PROPS", "1ST INNING",
  "PLATE APPEARANCE", "EITHER/COMBINED", "1ST OF GAME", "1ST X INNINGS",
  "GAME LINES", "GAME TOTALS", "TEAM", "GAME PROPS", "INNINGS", "CORRECT SCORE",
]);
function stripMlbNavigation(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === "POPULAR") {
      let end = i + 1;
      while (end < lines.length && mlbNavigationLabels.has(lines[end])) {
        const last = lines[end++];
        if (last === "CORRECT SCORE") break;
      }
      const run = lines.slice(i, end);
      // Require the observed beginning and a substantial contiguous tab group.
      // Case-sensitive matching stops at the actual title "Game" / "Game Lines".
      if (run.length >= 6 && run.includes("BATTER") && run.includes("PITCHER") &&
          run.includes("GAME LINES") && run.at(-1) === "CORRECT SCORE" && /^(?:Odds|Stats|Stats & Trends|Quick SGP)$/.test(lines[i - 1] || "")) {
        i = end - 1;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

const playerLabel = value => !team(value) &&
  /^[\p{L}][\p{L}.'’ -]*\s+[\p{L}][\p{L}.'’ -]*$/u.test(value || "") &&
  !/\b(?:Odds|Player|Over|Under|Total|Runs|Run Line|Moneyline|Strikeouts|Hits|Bases|Allowed|Game|Inning|Pitcher|Batter|Locked|Suspended)\b/i.test(value);

// Skip only a known statistical annotation attached to this player. Never skip
// a missing price, unknown word, next player or market heading to fill a pair.
function afterPlayerStatistic(lines, start) {
  const label = (lines[start] || "").match(/^(AVG|SLG|HR|RBI|R|H\+R\+RBI|H\/9|K\/9|BBPG|ERA|IP):\s*(\d+(?:\.\d+)?|--)?$/i);
  if (!label) return { start, statistic: "" };
  let next = start + 1;
  while (next < lines.length && next - start <= 160 && /^(?:\d+(?:\.\d+)?|\.|--)$/.test(lines[next])) next += 1;
  if (next - start > 160) return { start: -1, statistic: label[1].toUpperCase() };
  return { start: next, statistic: label[1].toUpperCase() };
}

// The observed detail table includes exactly one named starter under each team.
// Both team cells are still validated; a pitcher can never stand in for a team.
function mainParticipants(lines, i, detailEvent) {
  const away = team(lines[i]);
  if (!away) return null;
  let home = "", start = -1;
  if (/^(?:AT|@|VS\.?)$/i.test(lines[i + 1] || "")) {
    home = team(lines[i + 2]); start = i + 3;
  } else if (playerLabel(lines[i + 1]) && /^(?:AT|@|VS\.?)$/i.test(lines[i + 2] || "") &&
      playerLabel(lines[i + 4])) {
    home = team(lines[i + 3]); start = i + 5;
  }
  if (!home || away === home || detailEvent && detailEvent !== `${away} @ ${home}`) return null;
  return { away, home, start };
}

export function parseDraftKingsMlb(rawText, context = {}) {
  const rawLines = String(rawText || "").split(/\r?\n/).map(clean).filter(Boolean);
  const lines = stripMlbNavigation(rawLines);
  const forced = String(context.league || context.sport || "").toUpperCase() === "MLB" || lines.includes("MLB_CAPTURE_LEAGUE: MLB");
  const breadcrumb = /Sportsbook\s*\/\s*Baseball Odds\s*\/\s*MLB Odds/i;
  if (!forced && !lines.some(line => breadcrumb.test(line))) return null;

  const rows = [];
  // DK also labels a pitcher tab "Hits". A text export listing that tab does
  // not prove which tab was selected; require a typed heading in that case.
  const hasPitcherTabs = rawLines.some(line => /^(?:Pitcher|Pitcher Props)$/i.test(line));
  let active = forced;
  let mainTable = false;
  let fullGame = true;
  let detailEvent = "";
  let market = "";
  let ambiguousHits = false;
  for (let i = 0; i < lines.length; i += 1) {
    const value = lines[i];
    if (/^DRAFTKINGS_(?:CURRENT_CAPTURE|INITIAL_CAPTURE|AUTOPASS_\d+)$/.test(value)) {
      active = forced; mainTable = false; fullGame = true; detailEvent = ""; market = "";
    }
    if (/^Sportsbook\s*\//i.test(value)) {
      active = breadcrumb.test(value);
      mainTable = false; fullGame = true; market = "";
      detailEvent = active ? gameTitle(value) : "";
    }
    if (/^(?:DraftKings Inc\.|BET SLIP|View Bet Details)$/i.test(value)) {
      active = false; mainTable = false; market = "";
    }
    if (!active) continue;
    const title = gameTitle(value);
    if (title) detailEvent = title;
    if (partial.test(value)) { mainTable = false; fullGame = false; market = ""; continue; }
    if (/^(?:Game Lines|Game|Full Game|Main Lines)$/i.test(value)) { fullGame = true; market = ""; }
    if (/^(?:Run Line|Spread)$/i.test(value) && /^Total$/i.test(lines[i + 1] || "") && /^Money\s*line$/i.test(lines[i + 2] || "")) {
      mainTable = fullGame; market = ""; i += 2; continue;
    }
    if (propType(value)) {
      ambiguousHits = hasPitcherTabs && /^Hits\s+(?:O\/U|Over\/Under)$/i.test(value);
      market = fullGame ? propType(value) : ""; mainTable = false; continue;
    }
    // A new unsupported market cannot inherit the previous market's prices.
    if (/^(?:Batter|Pitcher|Player|Game|Team) Props$/i.test(value) || /O\/U$|Over\/Under$|\d+\+$/.test(value) || /^(?:Home Runs|Hits|Total Bases|RBIs|Runs|Strikeouts|Walks|Hits Allowed|Earned Runs|Outs)$/i.test(value)) {
      market = ""; mainTable = false; continue;
    }

    const away = team(value);
    const participants = mainTable ? mainParticipants(lines, i, detailEvent) : null;
    if (participants) {
      const { away, home, start } = participants;
      const cells = cellsAt(lines, start, 12);
      if (cells.length && /^O$/i.test(cells[2]) && /^U$/i.test(cells[8])) {
        const event = `${away} @ ${home}`;
        addPair(rows, event, "spread", [away, home], [spread(cells[0]), spread(cells[6])], [cells[1], cells[7]]);
        addPair(rows, event, "total", ["Over", "Under"], [number(cells[3]), number(cells[9])], [cells[4], cells[10]]);
        addPair(rows, event, "moneyline_2way", [away, home], [null, null], [cells[5], cells[11]]);
        i = cells.end;
      }
    }

    if (!market || !detailEvent) continue;
    if (/^(?:Player|Over|Under)$/i.test(value)) continue;
    if (away || !/^[A-Za-zÀ-ž][A-Za-zÀ-ž.'’ -]+\s+[A-Za-zÀ-ž.'’ -]+$/.test(value)) { market = ""; continue; }
    const annotation = afterPlayerStatistic(lines, i + 1);
    if (annotation.start < 0 || ambiguousHits && annotation.statistic !== "AVG") { market = ""; continue; }
    const cells = cellsAt(lines, annotation.start, 6);
    if (!cells.length || !/^O$/i.test(cells[0]) || !/^U$/i.test(cells[3])) { market = ""; continue; }
    const over = number(cells[1]);
    const under = number(cells[4]);
    if (over === null || over < 0 || over !== under || price(cells[2]) === null || price(cells[5]) === null) continue;
    rows.push(row(detailEvent, market, `${value} Over`, over, price(cells[2])), row(detailEvent, market, `${value} Under`, under, price(cells[5])));
    i = cells.end;
  }
  // Repeated capture passes must not multiply rows; keep the latest price for
  // the same event/market/selection/line, while retaining alternate lines.
  const unique = new Map();
  for (const item of rows) unique.set([item.eventLabelRaw, item.marketType, item.selectionNormalized, item.lineValue].join("|"), item);
  return [...unique.values()];
}
