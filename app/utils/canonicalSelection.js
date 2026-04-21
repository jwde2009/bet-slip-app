// app/utils/canonicalSelection.js

import { canonicalizeTeamName, canonicalizeTeamsInText } from "./canonicalTeamNames";
import { canonicalizeFixture } from "./canonicalFixture";
import {
  extractPeriod,
  inferMarketFamily,
  inferSubjectType,
  inferResultTarget,
  buildCanonicalSelectionKey,
  buildCanonicalHedgeKey,
  buildCanonicalOppositeKey,
} from "./canonicalMarket";

function cleanValue(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumberString(value = "") {
  const m = String(value || "").match(/[+-]?\d+(\.\d+)?/);
  if (m) return m[0];

  // 🔥 NEW: handle words like "five and a half"
  const text = String(value || "").toLowerCase();

  if (text.includes("half")) {
    const base = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    if (base) {
      const map = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      };
      return `${map[base[1]] + 0.5}`;
    }
  }

  return "";
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

  if (!m) {
    return { direction: "", line: "" };
  }

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

function splitFixtureTeams(fixtureEvent = "") {
  const canonical = canonicalizeFixture(fixtureEvent);
  const parts = canonical
    .split(/\s+@\s+|\s+vs\.?\s+|\s+v\.?\s+|\s+at\s+/i)
    .map((x) => cleanValue(x))
    .filter(Boolean);

  return parts.length >= 2 ? parts : [];
}

function extractTeamFromSelection(selection = "", fixtureEvent = "") {
  const selectionText = canonicalizeTeamsInText(selection);
  const teams = splitFixtureTeams(fixtureEvent);

  for (const team of teams) {
    if (team && selectionText.toLowerCase().includes(team.toLowerCase())) {
      return canonicalizeTeamName(team);
    }
  }

  return "";
}

function normalizePlayerName(name = "") {
  const cleaned = name
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ");

  if (parts.length === 2 && parts[0].length === 1) {
    // Convert "J Tatum" → "Tatum"
    return parts[1];
  }

  return cleaned;
}

function extractPlayerName(selection = "", marketDetail = "") {
  const base = cleanValue(selection)
    .replace(/\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const market = cleanValue(marketDetail)
    .replace(/\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const combined = `${base} ${market}`.trim();

  let candidate = base;

  candidate = candidate
    .replace(/\b(Over|Under)\b\s*\d+(\.\d+)?/gi, "")
    .replace(/[+-]\d+(\.\d+)?/g, "")
    .replace(/\b(Points|Pts|Rebounds|Rebs|Assists|Asts|Points \+ Rebounds \+ Assists|PRA|Three Pointers|3-Pointers|3 Pointers|Threes|Shots on Goal|Strikeouts|Hits|RBIs|RBI|Home Runs|Home Run|Double-Double|Triple-Double|Anytime Goalscorer|Anytime Scorer)\b/gi, "")
    .replace(/\b(To Record|To Get|To Have|Alt|Alternate)\b/gi, "")
    .replace(/[():]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    candidate &&
    candidate.split(" ").length >= 2 &&
    !/@| vs | v | at /i.test(candidate) &&
    !/\b(over|under|yes|no)\b/i.test(candidate)
  ) {
    return normalizePlayerName(candidate);
  }

  const patterns = [
    /^(.*?)\s+(Over|Under)\s+\d+(\.\d+)?/i,
    /^(.*?)\s+([+-]\d+(\.\d+)?)/i,
    /^(.*?)\s+(Points|Pts|Rebounds|Rebs|Assists|Asts|Points \+ Rebounds \+ Assists|PRA|Three Pointers|3-Pointers|3 Pointers|Threes|Shots on Goal|Strikeouts|Hits|RBIs|RBI|Home Runs|Home Run|Double-Double|Triple-Double|Anytime Goalscorer|Anytime Scorer)/i,
    /^(.*?)\s+(To Record|To Get|To Have)\b/i,
  ];

  for (const pattern of patterns) {
    const m = combined.match(pattern);
    if (m && m[1]) {
      const name = cleanValue(m[1])
        .replace(/[():]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (
        name &&
        name.split(" ").length >= 2 &&
        !/@| vs | v | at /i.test(name) &&
        !/\b(over|under|yes|no)\b/i.test(name)
      ) {
        return normalizePlayerName(name);
      }
    }
  }

  return "";
}

export function canonicalizeSelectionFields(row = {}) {
  let selection = cleanValue(row.selection || "");

  selection = selection
    .toLowerCase()
    .replace(/\bpts\b/g, "points")
    .replace(/\brebs\b/g, "rebounds")
    .replace(/\basts\b/g, "assists");
    selection = selection.replace(/\s+/g, " ").trim();
  const marketDetail = cleanValue(row.marketDetail || "");
  const betType = cleanValue(row.betType || "").toLowerCase();
  const fixtureEvent = cleanValue(row.fixtureEvent || "");
  const canonicalFixtureValue = canonicalizeFixture(fixtureEvent);

  const result = {
    canonicalBookmaker: cleanValue(row.bookmaker || "").replace(/^C-/, ""),
    canonicalFixture: canonicalFixtureValue,
    canonicalSelection: canonicalizeTeamsInText(selection),
    canonicalBetType: betType,
    canonicalMarket: inferMarketLabel(selection, marketDetail, betType),

    canonicalSide: "",
    canonicalLine: "",
    canonicalPlayer: "",
    canonicalTeam: "",

    canonicalPeriod: "",
    canonicalMarketFamily: "",
    canonicalSubjectType: "",
    canonicalResultTarget: "",
    canonicalSelectionKey: "",
    canonicalHedgeKey: "",
    canonicalOppositeKey: "",
  };

  if (betType === "total") {
    const total = extractOverUnder(selection, marketDetail);
    result.canonicalSide = total.direction || "";
    result.canonicalLine = total.line || "";
    result.canonicalTeam = extractTeamFromSelection(selection, fixtureEvent);
    result.canonicalSelection = cleanValue(
      `${result.canonicalTeam ? `${result.canonicalTeam} ` : ""}${
        total.direction ? total.direction[0].toUpperCase() + total.direction.slice(1) : ""
      } ${total.line || ""}`
    );
  } else if (betType === "spread") {
    result.canonicalLine = extractSpreadLine(selection, marketDetail);
    result.canonicalTeam = extractTeamFromSelection(selection, fixtureEvent);
    result.canonicalSide = result.canonicalTeam ? "team" : "";
    result.canonicalSelection = cleanValue(
      `${result.canonicalTeam || ""} ${result.canonicalLine || ""}`
    );
  } else if (betType === "moneyline") {
    result.canonicalTeam = extractTeamFromSelection(selection, fixtureEvent);
    result.canonicalSide = /\byes\b/i.test(selection)
      ? "yes"
      : /\bno\b/i.test(selection)
      ? "no"
      : result.canonicalTeam
      ? "team"
      : "";
    result.canonicalSelection = cleanValue(selection);
  } else {
    const player = extractPlayerName(selection, marketDetail);
    const total = extractOverUnder(selection, marketDetail);
    const spreadLine = extractSpreadLine(selection, marketDetail);

    result.canonicalPlayer = (player || "").toLowerCase();
    result.canonicalTeam = !player ? extractTeamFromSelection(selection, fixtureEvent) : "";
    result.canonicalSide = total.direction || (spreadLine ? "team" : "");
    result.canonicalLine = total.line || spreadLine || "";
    result.canonicalSelection = cleanValue(canonicalizeTeamsInText(selection));
  }

  result.canonicalPeriod = extractPeriod(selection, marketDetail, fixtureEvent);
  result.canonicalMarketFamily = inferMarketFamily({
    betType,
    selection,
    marketDetail,
    canonicalPlayer: result.canonicalPlayer,
    canonicalTeam: result.canonicalTeam,
    fixtureEvent,
  });
  result.canonicalSubjectType = inferSubjectType({
    canonicalPlayer: result.canonicalPlayer,
    canonicalTeam: result.canonicalTeam,
    canonicalMarketFamily: result.canonicalMarketFamily,
  });
  result.canonicalResultTarget = inferResultTarget(
    selection,
    marketDetail,
    result.canonicalMarketFamily
  );

  result.canonicalSelectionKey = buildCanonicalSelectionKey({
    ...row,
    ...result,
  });
  result.canonicalHedgeKey = buildCanonicalHedgeKey({
    ...row,
    ...result,
  });
  result.canonicalOppositeKey = buildCanonicalOppositeKey({
    ...row,
    ...result,
  });

  return result;
}