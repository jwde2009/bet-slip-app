import { resolveNflMainLineTeam } from "./nflMainLines";
import { getNflPropType } from "./nflPropTypes";

const clean = value => String(value || "").replace(/\u2212|âˆ’/g, "-").replace(/\s+/g, " ").trim();
function eventName(value) {
  const parts = clean(value).replace(/^Event:\s*/i, "").split(/\s+@\s+/);
  if (parts.length !== 2) return "";
  const away = resolveNflMainLineTeam(parts[0]), home = resolveNflMainLineTeam(parts[1]);
  return away && home && away !== home ? `${away} @ ${home}` : "";
}
function price(value) {
  const text = clean(value);
  if (/^(EVEN|EVS)$/i.test(text)) return 100;
  return /^[+-]\d+$/.test(text) && Math.abs(Number(text)) >= 100 && Math.abs(Number(text)) <= 1000000 ? Number(text) : null;
}
function playerName(value, market) {
  let text = clean(value);
  const suffix = text.match(/^(.+?) Total (.+)$/i);
  if (suffix) {
    if (getNflPropType(suffix[2]) !== market) return "";
    text = suffix[1];
  }
  if (resolveNflMainLineTeam(text) || /\b(over|under|total|yards|touchdowns|receptions|passing|rushing|receiving|player|scorer|none|neither|field)\b/i.test(text)) return "";
  return text.length <= 80 && /^[\p{L}][\p{L}.'’\-]*(?:\s+[\p{L}][\p{L}.'’\-]*){1,5}$/u.test(text) ? text : "";
}
function makeRow(book, event, marketType, player, side, lineValue, oddsAmerican) {
  const selection = `${player} ${side}`;
  const identity = [book, event, marketType, player, side, lineValue].join("|");
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return {
    id: `${book.toLowerCase()}_nflprop_${hash.toString(16)}`, sportsbook: book,
    sport: "NFL", league: "NFL", eventLabelRaw: event, marketType,
    selectionRaw: selection, selectionNormalized: selection, playerName: player,
    lineValue, oddsAmerican,
    oddsDecimal: oddsAmerican > 0 ? 1 + oddsAmerican / 100 : 1 + 100 / Math.abs(oddsAmerican),
    period: "full_game", confidence: "high",
    parseWarnings: Number.isInteger(lineValue) ? ["Integer prop line: a push is possible."] : [],
    isSharpSource: book === "Pinnacle", isTargetBook: book !== "Pinnacle",
    batchRole: book === "Pinnacle" ? "fair_odds" : "target", excluded: false, userEdited: false,
  };
}
function pair(rows, book, event, type, player, over, under) {
  if (!event || !type || !player || !over || !under || over.line !== under.line || !Number.isFinite(over.line) || over.line < 0) return;
  if (over.odds === null || under.odds === null) return;
  rows.push(makeRow(book, event, type, player, "Over", over.line, over.odds),
    makeRow(book, event, type, player, "Under", under.line, under.odds));
}
function parsePinnacle(lines) {
  if (!lines.some(line => /^(?:NFL|NFL_CAPTURE_LEAGUE: NFL)$/i.test(line))) return [];
  const rows = [];
  let event = "";
  for (let i = 0; i < lines.length; i += 1) {
    if (/\s@\s/.test(lines[i])) { event = eventName(lines[i]); continue; }
    if (/^(?:Live|NCAAF|CFL|UFL|NBA|WNBA|NHL|MLB|SOCCER|BACK TO TOP)$/i.test(lines[i])) { event = ""; continue; }
    const header = lines[i].match(/^(.+?) Total (.+)$/i);
    if (!header || !event) continue;
    const type = getNflPropType(header[2]), player = playerName(header[1], type);
    if (!type || !player) continue;
    const over = (lines[i + 1] || "").match(/^Over (\d+(?:\.\d+)?) (.+)$/i);
    const under = (lines[i + 3] || "").match(/^Under (\d+(?:\.\d+)?) (.+)$/i);
    // Four adjacent cells only; missing prices must never borrow from the next player.
    if (!over || !under || getNflPropType(over[2]) !== type || getNflPropType(under[2]) !== type) continue;
    pair(rows, "Pinnacle", event, type, player,
      { line: Number(over[1]), odds: price(lines[i + 2]) },
      { line: Number(under[1]), odds: price(lines[i + 4]) });
  }
  return rows;
}
function parseTheScore(lines) {
  const rows = [];
  let event = "", sport = "", type = "", header = "", period = "full_game";
  let pending = new Map();
  function flush() {
    for (const item of pending.values()) {
      if (item.invalid) continue;
      pair(rows, "TheScore", item.event, item.type, item.player, item.Over, item.Under);
    }
    pending = new Map();
  }
  for (const line of lines) {
    if (/^THESCORE_STRUCTURED_EXPORT$/i.test(line)) { flush(); event = sport = type = header = ""; period = "full_game"; continue; }
    if (/^Sport:/i.test(line)) { flush(); sport = clean(line.slice(6)).toUpperCase(); type = ""; continue; }
    if (/^Event:/i.test(line)) { flush(); event = eventName(line); type = ""; continue; }
    if (/^Period:/i.test(line)) { flush(); period = clean(line.slice(7)).toLowerCase(); type = ""; continue; }
    if (/^Market:/i.test(line)) { flush(); header = clean(line.slice(7)); type = getNflPropType(header); continue; }
    if (sport !== "NFL" || !event || !type || !["full_game", "full game", "game"].includes(period)) continue;
    const fields = line.split(/\s*\|\s*/);
    const player = playerName(fields[0], type);
    if (!player) continue;
    if (fields.length === 4 && /^(OVER|UNDER)$/i.test(fields[1]) && /^\d+(?:\.\d+)?$/.test(fields[2])) {
      const side = /^OVER$/i.test(fields[1]) ? "Over" : "Under", threshold = Number(fields[2]);
      const k = [event, type, player, threshold].join("|");
      const item = pending.get(k) || { event, type, player };
      const next = { line: threshold, odds: price(fields[3]) };
      if (item[side] && item[side].odds !== next.odds) item.invalid = true;
      item[side] = next; pending.set(k, item);
    } else if (fields.length === 3 && /^\d+\+$/.test(fields[1]) && Number.isSafeInteger(Number(fields[1].slice(0, -1))) && Number(fields[1].slice(0, -1)) >= 1 && price(fields[2]) !== null) {
      // NFL counting stats use integer thresholds: N+ is Over N-0.5, never Over N.
      rows.push(makeRow("TheScore", event, type, player, "Over", Number(fields[1].slice(0, -1)) - 0.5, price(fields[2])));
    } else if (fields.length === 3 && /^(YES|NO)$/i.test(fields[1]) && type === "player_touchdowns" && /anytime/i.test(header) && price(fields[2]) !== null) {
      rows.push(makeRow("TheScore", event, type, player, /^YES$/i.test(fields[1]) ? "Over" : "Under", 0.5, price(fields[2])));
    }
  }
  flush();
  return rows;
}
export function parseNflPlayerProps(rawText = "", sportsbook = "") {
  if (typeof rawText !== "string") return [];
  const lines = rawText.split(/\r?\n/).map(clean).filter(Boolean);
  const rows = sportsbook === "Pinnacle" ? parsePinnacle(lines) : sportsbook === "TheScore" ? parseTheScore(lines) : [];
  // Later snapshots replace older prices, never select the most generous quote.
  const latest = new Map();
  for (const row of rows) latest.set([row.eventLabelRaw, row.marketType, row.playerName, row.lineValue, row.selectionNormalized].join("|"), row);
  return [...latest.values()];
}
