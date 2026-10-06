import { americanToDecimal } from "../odds";
import { TEAM_ALIASES_BY_SPORT } from "../../data/teamAliases";

function clean(value = "") {
  return String(value)
    .replace(/\[([^\]]*)\]\([^\n]*?\)/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/^(?:svg)+|(?:svg)+$/gi, "")
    .replace(/\u2212/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function mlbTeam(value = "") {
  const key = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return TEAM_ALIASES_BY_SPORT.MLB?.[key] || "";
}

function findEvent(lines) {
  const events = [];
  for (let i = 1; i < lines.length; i += 1) {
    // Scope to the event breadcrumb, not the mixed-sport sidebar. Full team
    // labels are separate from starting-pitcher labels on this observed page.
    if (!/^MLB$/i.test(lines[i - 1]) || !/^baseball$/i.test(lines[i])) continue;
    const period = lines.findIndex((line, index) => index > i && /^Game Period$/i.test(line));
    if (period < 0 || period > i + 16) continue;
    const teams = lines.slice(i + 1, period).map(mlbTeam).filter(Boolean);
    if (teams.length !== 2 || teams[0] === teams[1]) continue;
    const gameEnd = lines.findIndex((line, index) => index > period && /^(Team Points Game|1st 5 Innings Period|Parlay Builder)$/i.test(line));
    if (gameEnd < 0) continue;
    const repeatedTeams = lines.slice(period + 1, gameEnd).map(mlbTeam).filter(Boolean);
    if (repeatedTeams.length !== 2 || repeatedTeams.some((team, index) => team !== teams[index])) continue;
    events.push({ away: teams[0], home: teams[1], startIndex: period });
  }
  // This parser supports a single game detail page, not a multi-game landing page.
  return events.length === 1 ? events[0] : null;
}

function propHeader(line) {
  const patterns = [
    { regex: /^Total Outs Recorded (.+?) \(([A-Z]{2,3})\)$/i, marketType: "pitcher_outs_recorded", unit: "Outs" },
    { regex: /^(.+?) \(([A-Z]{2,3})\) Total Strikeouts$/i, marketType: "pitcher_strikeouts", unit: "Strikeouts" },
    { regex: /^(.+?) \(([A-Z]{2,3})\) Hits\s*\+\s*Runs\s*\+\s*RBIs$/i, marketType: "player_hits_runs_rbis", unit: "Hits+Runs+RBIs" },
    { regex: /^(.+?) \(([A-Z]{2,3})\) to Hit a Home Run$/i, marketType: "player_home_runs", unit: "", yesNo: true },
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) return { ...pattern, player: match[1].trim(), team: mlbTeam(match[2]) };
  }
  return null;
}

function price(value) {
  if (/^(EVEN|EVS)$/i.test(value || "")) return 100;
  // Unmarked numbers are not prices: 15 outs must never become +15 odds.
  if (!/^[+-]\d+$/.test(value || "")) return null;
  const odds = Number(value);
  return Number.isSafeInteger(odds) && Math.abs(odds) >= 100 ? odds : null;
}

function sideLabel(value) {
  let text = value;
  let odds = null;
  const inline = text.match(/\s+([+-]\d+|EVEN|EVS)$/i);
  if (inline) {
    odds = price(inline[1]);
    text = text.slice(0, inline.index).trim();
  }
  if (/^(Yes|No)$/i.test(text)) return { side: /^Yes$/i.test(text) ? "Over" : "Under", line: 0.5, unit: "", yesNo: true, odds };
  const match = text.match(/^(Over|Under) (\d+(?:\.\d+)?) (.+)$/i);
  if (!match) return null;
  return { side: /^Over$/i.test(match[1]) ? "Over" : "Under", line: Number(match[2]), unit: match[3], yesNo: false, odds };
}

export function inspectBetOnlineText(rawText = "") {
  const lines = String(rawText || "").split(/\r?\n/).map(clean).filter(Boolean);
  const game = findEvent(lines);
  const result = { rows: [], eventLabelRaw: "", recognizedPropMarkets: 0, pricedPropMarkets: 0, incompletePropMarkets: 0 };
  if (!game) return result;
  result.eventLabelRaw = `${game.away} @ ${game.home}`;
  const seen = new Set();

  for (let i = game.startIndex + 1; i < lines.length; i += 1) {
    if (/^(Quick links|About Us|BACK TO TOP)$/i.test(lines[i])) break;
    const meta = propHeader(lines[i]);
    if (!meta || ![game.away, game.home].includes(meta.team)) continue;
    result.recognizedPropMarkets += 1;
    const sides = [];
    let invalid = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      const side = sideLabel(lines[j]);
      // Stop at any new heading, including unsupported pitcher-win markets.
      if (!side) break;
      const normalizedUnit = value => value.toLowerCase().replace(/\s+/g, "");
      if (Boolean(meta.yesNo) !== side.yesNo || normalizedUnit(meta.unit) !== normalizedUnit(side.unit)) invalid = true;
      if (side.odds === null && price(lines[j + 1]) !== null) side.odds = price(lines[++j]);
      if (side.odds === null || !Number.isFinite(side.line)) invalid = true;
      sides.push(side);
    }
    if (invalid || sides.length !== 2 || new Set(sides.map(side => side.side)).size !== 2 || sides[0].line !== sides[1].line) {
      result.incompletePropMarkets += 1;
      continue;
    }
    result.pricedPropMarkets += 1;
    for (const side of sides) {
      const key = [result.eventLabelRaw, meta.player, meta.marketType, side.side, side.line, side.odds].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      result.rows.push({
        id: `bol_row_${result.rows.length + 1}`,
        sportsbook: "BetOnline", sport: "MLB", league: "MLB",
        eventLabelRaw: result.eventLabelRaw,
        marketType: meta.marketType,
        selectionRaw: `${meta.player} ${side.side}`,
        selectionNormalized: `${meta.player} ${side.side}`,
        lineValue: side.line, oddsAmerican: side.odds, oddsDecimal: americanToDecimal(side.odds),
        confidence: "medium", parseWarnings: Number.isInteger(side.line) ? ["Integer line: push possible."] : [],
        isSharpSource: true, isTargetBook: false, batchRole: "fair_odds", excluded: false, userEdited: false,
      });
    }
  }
  return result;
}

export function parseBetOnlineText(rawText = "") {
  return inspectBetOnlineText(rawText).rows;
}
