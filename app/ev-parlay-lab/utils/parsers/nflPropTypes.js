// Full-game NFL markets only. Scoring a TD is not throwing a TD pass.
const definitions = [
  ["player_passing_yards", ["passing yards", "pass yards"]],
  ["player_passing_touchdowns", ["passing touchdowns", "passing tds", "pass tds", "touchdown passes"]],
  ["player_passing_attempts", ["pass attempts", "passing attempts"]],
  ["player_passing_completions", ["pass completions", "passing completions", "completions"]],
  ["player_passing_interceptions", ["interceptions", "interceptions thrown", "passing interceptions"]],
  ["player_rushing_yards", ["rushing yards", "rush yards"]],
  ["player_rushing_attempts", ["rush attempts", "rushing attempts", "carries"]],
  ["player_receiving_yards", ["receiving yards", "rec yards"]],
  ["player_receptions", ["receptions"]],
  ["player_rushing_receiving_yards", ["rushing + receiving yards", "rush + rec yards", "rushing and receiving yards"]],
  ["player_passing_rushing_yards", ["passing + rushing yards", "pass + rush yards"]],
  ["player_touchdowns", ["touchdowns", "touchdowns scored", "anytime touchdown scorer", "anytime touchdown scorers", "anytime touchdowns", "anytime touchdown", "anytime td scorer"]],
];
export const NFL_PROP_TYPES = definitions.map(([type]) => type);
export function getNflPropType(value = "") {
  let text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (NFL_PROP_TYPES.includes(text)) return text;
  // Never turn a period, first/last TD, team, live, or season market into a full-game player prop.
  if (/\b(first|last|half|quarter|1st|2nd|3rd|4th|live|season|team|longest|defensive)\b/.test(text)) return "";
  text = text.replace(/\s*\(o\s*\/\s*u\)\s*$/, "").replace(/\s+o\s*\/\s*u$/, "")
    .replace(/^player\s+/, "").replace(/^total\s+/, "");
  return definitions.find(([, labels]) => labels.includes(text))?.[0] || "";
}
