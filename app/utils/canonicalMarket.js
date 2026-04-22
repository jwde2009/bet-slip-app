// app/utils/canonicalMarket.js

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return clean(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPeriod(selection = "", marketDetail = "", fixtureEvent = "") {
  const text = normalizeText(`${selection} ${marketDetail} ${fixtureEvent}`)
  .replace(/\bplayer\b/g, "")
  .replace(/\btotal\b/g, "");

  if (
    /\b1st half\b|\bfirst half\b|\b1h\b/.test(text)
  ) return "1H";

  if (
    /\b2nd half\b|\bsecond half\b|\b2h\b/.test(text)
  ) return "2H";

  if (
    /\b1st quarter\b|\bfirst quarter\b|\b1q\b/.test(text)
  ) return "1Q";

  if (
    /\b2nd quarter\b|\bsecond quarter\b|\b2q\b/.test(text)
  ) return "2Q";

  if (
    /\b3rd quarter\b|\bthird quarter\b|\b3q\b/.test(text)
  ) return "3Q";

  if (
    /\b4th quarter\b|\bfourth quarter\b|\b4q\b/.test(text)
  ) return "4Q";

  if (
    /\b1st period\b|\bfirst period\b|\b1p\b/.test(text)
  ) return "1P";

  if (
    /\b2nd period\b|\bsecond period\b|\b2p\b/.test(text)
  ) return "2P";

  if (
    /\b3rd period\b|\bthird period\b|\b3p\b/.test(text)
  ) return "3P";

  if (/\bregulation\b/.test(text)) return "REG";
  if (/\blive\b|\bin-play\b|\bin play\b/.test(text)) return "LIVE";

  return "FULL_GAME";
}

function inferSubjectType({ canonicalPlayer = "", canonicalTeam = "", canonicalMarketFamily = "" } = {}) {
  if (canonicalPlayer) return "player";
  if (canonicalTeam) return "team";
  if (canonicalMarketFamily === "game_total") return "game";
  if (canonicalMarketFamily === "binary_market") return "market";
  return "";
}

function inferResultTarget(selection = "", marketDetail = "", canonicalMarketFamily = "") {
  const text = normalizeText(`${selection} ${marketDetail}`);

  if (canonicalMarketFamily === "moneyline") return "moneyline";
  if (canonicalMarketFamily === "spread") return "spread";

  if (
    canonicalMarketFamily === "game_total" ||
    canonicalMarketFamily === "team_total"
  ) return "points";

  // 🔥 NORMALIZED TARGETS
  if (/\b(points|pts|total points|player points)\b/.test(text)) return "points";
  if (/\b(rebounds|rebs|total rebounds|player rebounds)\b/.test(text)) return "rebounds";
  if (/\b(assists|asts|total assists|player assists)\b/.test(text)) return "assists";
  if (/\b(points \+ rebounds \+ assists|pra)\b/.test(text)) return "pra";
  if (/\b(three pointers|threes|3-pointers|3 pointers)\b/.test(text)) return "threes";
  if (/\bshots on goal\b/.test(text)) return "shots_on_goal";
  if (/\bstrikeouts\b|\bks\b/.test(text)) return "strikeouts";
  if (/\bhits\b/.test(text)) return "hits";
  if (/\brbis\b|\brbi\b/.test(text)) return "rbis";
  if (/\bhome runs\b|\bhome run\b/.test(text)) return "home_runs";
  if (/\bdouble-double\b/.test(text)) return "double_double";
  if (/\btriple-double\b/.test(text)) return "triple_double";
  if (/\banytime goalscorer\b|\banytime scorer\b/.test(text)) return "anytime_scorer";

  return canonicalMarketFamily || "";
}

function inferMarketFamily({
  betType = "",
  selection = "",
  marketDetail = "",
  canonicalPlayer = "",
  canonicalTeam = "",
  fixtureEvent = ""
} = {}) {
  const bt = clean(betType).toLowerCase();
  const text = normalizeText(`${selection} ${marketDetail} ${fixtureEvent}`)
  .replace(/\bplayer\b/g, "")
  .replace(/\btotal\b/g, "");

  if (/\byes\b|\bno\b/.test(clean(selection)) && !canonicalTeam && !canonicalPlayer) {
    return "binary_market";
  }

  if (bt === "moneyline") return "moneyline";
  if (bt === "spread") return "spread";

  if (bt === "total") {
    return canonicalTeam ? "team_total" : "game_total";
  }

  if (canonicalPlayer) {
    if (/\bpoints \+ rebounds \+ assists\b|\bpra\b/.test(text)) return "player_pra";
    if (/\bpoints\b|\bpts\b/.test(text)) return "player_points";
    if (/\brebounds\b|\brebs\b/.test(text)) return "player_rebounds";
    if (/\bassists\b|\basts\b/.test(text)) return "player_assists";
    if (/\bthree pointers\b|\b3-pointers\b|\b3 pointers\b|\bthrees\b/.test(text)) return "player_threes";
    if (/\bshots on goal\b/.test(text)) return "player_shots_on_goal";
    if (/\bstrikeouts\b|\bks\b/.test(text)) return "player_strikeouts";
    if (/\bhits\b/.test(text)) return "player_hits";
    if (/\brbis\b|\brbi\b/.test(text)) return "player_rbis";
    if (/\bhome runs\b|\bhome run\b/.test(text)) return "player_home_runs";
    if (/\bdouble-double\b/.test(text)) return "player_double_double";
    if (/\btriple-double\b/.test(text)) return "player_triple_double";
    if (/\banytime goalscorer\b|\banytime scorer\b/.test(text)) return "player_anytime_scorer";
  }

  if (/\bto win by\b|\bwinning method\b|\bmethod of victory\b/.test(text)) return "method_of_victory";

  return bt || "";
}

function buildCanonicalSelectionKey(row = {}) {
  return [
    clean(row.canonicalSport || row.sportLeague || ""),
    clean(row.canonicalFixtureKey || ""),
    clean(row.canonicalPeriod || ""),
    clean(row.canonicalMarketFamily || row.canonicalMarket || ""),
    clean(row.canonicalSubjectType || ""),
    clean(row.canonicalTeam || ""),
    clean(row.canonicalPlayer || ""),
    clean(row.canonicalResultTarget || ""),
    clean(row.canonicalSide || ""),
    clean(row.canonicalLine || "")
  ].join("|");
}

function flipSide(side = "") {
  const s = clean(side).toLowerCase();
  if (s === "over") return "under";
  if (s === "under") return "over";
  if (s === "yes") return "no";
  if (s === "no") return "yes";
  return s;
}

function buildCanonicalOppositeKey(row = {}) {
  return [
    clean(row.canonicalSport || row.sportLeague || ""),
    clean(row.canonicalFixtureKey || ""),
    clean(row.canonicalPeriod || ""),
    clean(row.canonicalMarketFamily || row.canonicalMarket || ""),
    clean(row.canonicalSubjectType || ""),
    clean(row.canonicalTeam || ""),
    clean(row.canonicalPlayer || ""),
    clean(row.canonicalResultTarget || ""),
    clean(flipSide(row.canonicalSide || "")),
    clean(row.canonicalLine || "")
  ].join("|");
}

function buildCanonicalHedgeKey(row = {}) {
  return [
    clean(row.canonicalSport || row.sportLeague || ""),
    clean(row.canonicalFixtureKey || ""),
    clean(row.canonicalPeriod || ""),
    clean(row.canonicalMarketFamily || row.canonicalMarket || ""),
    clean(row.canonicalSubjectType || ""),
    clean(row.canonicalTeam || ""),
    clean(row.canonicalPlayer || ""),
    clean(row.canonicalResultTarget || ""),
    clean(row.canonicalLine || "")
  ].join("|");
}

export {
  clean,
  normalizeText,
  extractPeriod,
  inferMarketFamily,
  inferSubjectType,
  inferResultTarget,
  buildCanonicalSelectionKey,
  buildCanonicalHedgeKey,
  buildCanonicalOppositeKey
};