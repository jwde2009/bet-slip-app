// app/utils/canonicalSelection.js

import { canonicalizeTeamName, canonicalizeTeamsInText } from "./canonicalTeamNames";
import { canonicalizeFixture } from "./canonicalFixture";

function cleanValue(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumberString(value = "") {
  const m = String(value || "").match(/[+-]?\d+(\.\d+)?/);
  return m ? m[0] : "";
}

function inferMarketLabel(selection = "", marketDetail = "", betType = "") {
  const text = `${selection} | ${marketDetail}`.toLowerCase();

  if (betType === "moneyline") return "moneyline";
  if (betType === "spread") return "spread";
  if (betType === "total") return "total";
  if (betType === "parlay") return "parlay";
  if (betType === "futures") return "futures";

  if (/points \+ rebounds \+ assists|\bpra\b/.test(text)) return "pra";
  if (/rebounds/.test(text)) return "rebounds";
  if (/assists/.test(text)) return "assists";
  if (/points/.test(text)) return "points";
  if (/three pointers|threes|3-pointers|3 pointers/.test(text)) return "threes";
  if (/shots on goal/.test(text)) return "shots on goal";
  if (/strikeouts/.test(text)) return "strikeouts";
  if (/hits/.test(text)) return "hits";
  if (/rbis/.test(text)) return "rbis";
  if (/home runs|home run/.test(text)) return "home runs";
  if (/double-double/.test(text)) return "double-double";
  if (/triple-double/.test(text)) return "triple-double";
  if (/anytime goalscorer/.test(text)) return "anytime goalscorer";

  return betType || "";
}

function extractOverUnder(selection = "", marketDetail = "") {
  const joined = `${selection} ${marketDetail}`;
  const m = joined.match(/\b(Over|Under)\s+(\d+(\.\d+)?)/i);
  if (!m) return { direction: "", line: "" };

  return {
    direction: m[1].toLowerCase(),
    line: m[2],
  };
}

function extractSpreadLine(selection = "", marketDetail = "") {
  const joined = `${selection} ${marketDetail}`;
  const m = joined.match(/([+-]\d+(\.\d+)?)/);
  return m ? m[1] : "";
}

function extractPlayerName(selection = "", marketDetail = "") {
  const base = cleanValue(selection);
  const market = cleanValue(marketDetail);

  const combined = `${base} ${market}`.trim();

  const patterns = [
    /^(.*?)\s+(Over|Under)\s+\d+(\.\d+)?/i,
    /^(.*?)\s+(Points|Rebounds|Assists|Points \+ Rebounds \+ Assists|Three Pointers|Shots on Goal|Strikeouts|Hits|RBIs|Home Runs)/i,
  ];

  for (const pattern of patterns) {
    const m = combined.match(pattern);
    if (m && m[1]) {
      const name = cleanValue(m[1]);
      if (name && !/@| vs | v | at /i.test(name)) return name;
    }
  }

  return "";
}

function extractTeamFromSelection(selection = "", fixtureEvent = "") {
  const cleanedSelection = canonicalizeTeamsInText(selection);
  const cleanedFixture = canonicalizeFixture(fixtureEvent);

  const teams = cleanedFixture.split(/\s+@\s+/).map(cleanValue).filter(Boolean);
  for (const team of teams) {
    if (team && cleanedSelection.toLowerCase().includes(team.toLowerCase())) {
      return canonicalizeTeamName(team);
    }
  }

  const fallbackPatterns = TEAM_NAME_FALLBACKS.map((x) => x);
  for (const candidate of fallbackPatterns) {
    if (cleanedSelection.toLowerCase().includes(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return "";
}

const TEAM_NAME_FALLBACKS = [
  "Golden State Warriors",
  "Oklahoma City Thunder",
  "Dallas Mavericks",
  "Minnesota Timberwolves",
  "New York Knicks",
  "Phoenix Suns",
  "Boston Celtics",
  "Los Angeles Lakers",
  "Los Angeles Clippers",
  "Denver Nuggets",
  "Milwaukee Bucks",
  "Florida Panthers",
  "New York Rangers",
];

export function canonicalizeSelectionFields(row = {}) {
  const selection = cleanValue(row.selection || "");
  const marketDetail = cleanValue(row.marketDetail || "");
  const betType = cleanValue(row.betType || "");
  const fixtureEvent = cleanValue(row.fixtureEvent || "");

  const canonicalFixture = canonicalizeFixture(fixtureEvent);
  const canonicalMarket = inferMarketLabel(selection, marketDetail, betType);

  const result = {
    canonicalBookmaker: cleanValue(row.bookmaker || "").replace(/^C-/, ""),
    canonicalFixture,
    canonicalSelection: canonicalizeTeamsInText(selection),
    canonicalBetType: betType,
    canonicalMarket,
    canonicalSide: "",
    canonicalLine: "",
    canonicalPlayer: "",
    canonicalTeam: "",
  };

  if (betType === "total") {
    const total = extractOverUnder(selection, marketDetail);
    result.canonicalSide = total.direction;
    result.canonicalLine = total.line;
    result.canonicalSelection = cleanValue(
      `${total.direction ? total.direction[0].toUpperCase() + total.direction.slice(1) : ""} ${total.line}`.trim()
    );
    return result;
  }

  if (betType === "spread") {
    result.canonicalLine = extractSpreadLine(selection, marketDetail);
    result.canonicalTeam = extractTeamFromSelection(selection, fixtureEvent);
    result.canonicalSide = result.canonicalTeam ? "team" : "";
    result.canonicalSelection = cleanValue(
      `${result.canonicalTeam || canonicalizeTeamsInText(selection)} ${result.canonicalLine}`.trim()
    );
    return result;
  }

  if (betType === "moneyline") {
    result.canonicalTeam = extractTeamFromSelection(selection, fixtureEvent);
    result.canonicalSide = result.canonicalTeam ? "team" : "";
    result.canonicalSelection = result.canonicalTeam || canonicalizeTeamsInText(selection);
    return result;
  }

  if (betType === "player prop") {
    const total = extractOverUnder(selection, marketDetail);
    result.canonicalPlayer = extractPlayerName(selection, marketDetail);
    result.canonicalSide = total.direction || "player";
    result.canonicalLine = total.line || toNumberString(selection) || toNumberString(marketDetail);
    result.canonicalSelection = cleanValue(
      `${result.canonicalPlayer} ${result.canonicalMarket} ${result.canonicalSide} ${result.canonicalLine}`.trim()
    );
    return result;
  }

  result.canonicalSelection = canonicalizeTeamsInText(selection);
  return result;
}