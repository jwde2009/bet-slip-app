import { normalizeTeamNameBySport } from "../data/teamAliases";

export function buildCanonicalMarkets(rows) {
  const eligibleRows = rows.filter(
    (row) =>
      !row.excluded &&
      Number.isFinite(row.oddsAmerican) &&
      row.selectionNormalized &&
      row.eventLabelRaw
  );

  const marketMap = new Map();
  const unmatchedRows = [];

  const rowsByEvent = new Map();

  for (const row of eligibleRows) {
    const eventKey = buildCanonicalEventKey(row);

    if (!rowsByEvent.has(eventKey)) {
      rowsByEvent.set(eventKey, []);
    }

    rowsByEvent.get(eventKey).push(row);
  }

  for (const row of eligibleRows) {
    const eventKey = buildCanonicalEventKey(row);
    row._allRowsInEvent = rowsByEvent.get(eventKey) || [];

    const normalizedLineValue = normalizeLineValueForMarket(row);
    const normalizedMarketType = normalizeMarketType(row.marketType);
    const subjectKey = buildSubjectKey(row);

    const marketKey = [
      String(row.sport || "").trim().toUpperCase(),
      eventKey,
      normalizedMarketType,
      subjectKey,
      normalizedLineValue,
    ].join("||");

    if (!marketMap.has(marketKey)) {
      marketMap.set(marketKey, {
        id: marketKey,
        displayName: buildCanonicalDisplayName(row),
        eventKey,
        sport: row.sport,
        marketType: normalizedMarketType,
        subjectKey,
        lineValue: normalizedLineValue === "" ? null : Number(normalizedLineValue),
        selections: [],
      });
    }

    const market = marketMap.get(marketKey);
    const selectionLabel = normalizeSelectionLabel(row);

    let selection = market.selections.find((s) => s.label === selectionLabel);

    if (!selection) {
      selection = {
        id: `${marketKey}::${selectionLabel}`,
        label: selectionLabel,
        quotes: [],
      };
      market.selections.push(selection);
    }

    selection.quotes.push({
      parsedRowId: row.id,
      sportsbook: row.sportsbook,
      oddsAmerican: row.oddsAmerican,
      oddsDecimal: row.oddsDecimal,
      isSharpSource: row.isSharpSource,
      isTargetBook: row.isTargetBook,
      batchRole: row.batchRole || "",
      originalEventLabelRaw: row.eventLabelRaw,
      originalSelectionNormalized: row.selectionNormalized,
      originalMarketType: row.marketType,
      lineValue: row.lineValue,
      subjectKey,
    });
  }

  const markets = Array.from(marketMap.values()).sort((a, b) => {
    if (a.displayName !== b.displayName) {
      return a.displayName.localeCompare(b.displayName);
    }
    if (a.marketType !== b.marketType) {
      return a.marketType.localeCompare(b.marketType);
    }
    if (a.subjectKey !== b.subjectKey) {
      return a.subjectKey.localeCompare(b.subjectKey);
    }
    return String(a.lineValue ?? "").localeCompare(String(b.lineValue ?? ""));
  });

  return { markets, unmatchedRows };
}

function buildCanonicalEventKey(row) {
  const away = cleanTeam(row.awayTeam || row.awayTeamRaw, row.sport);
  const home = cleanTeam(row.homeTeam || row.homeTeamRaw, row.sport);

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const parsed = splitEventLabel(row.eventLabelRaw, row.sport);
  if (parsed.away && parsed.home) {
    return `${parsed.away} @ ${parsed.home}`;
  }

  return cleanText(row.eventLabelRaw);
}

function buildCanonicalDisplayName(row) {
  const away = cleanTeam(row.awayTeam || row.awayTeamRaw, row.sport);
  const home = cleanTeam(row.homeTeam || row.homeTeamRaw, row.sport);

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const parsed = splitEventLabel(row.eventLabelRaw, row.sport);
  if (parsed.away && parsed.home) {
    return `${parsed.away} @ ${parsed.home}`;
  }

  return cleanText(row.eventLabelRaw);
}

function splitEventLabel(eventLabelRaw = "", sport = "") {
  const text = cleanText(eventLabelRaw);

  if (!text) return { away: "", home: "" };

  if (text.includes("@")) {
    const [away, home] = text.split("@").map((s) => cleanTeam(s, sport));
    return { away, home };
  }

  if (/\bvs\b/i.test(text)) {
    const [away, home] = text.split(/\bvs\b/i).map((s) => cleanTeam(s, sport));
    return { away, home };
  }

  if (/\bv\b/i.test(text)) {
    const [away, home] = text.split(/\bv\b/i).map((s) => cleanTeam(s, sport));
    return { away, home };
  }

  return { away: "", home: "" };
}

function normalizeSelectionLabel(row) {
  const marketType = normalizeMarketType(row.marketType);
  const selection = cleanText(row.selectionNormalized || row.selectionRaw);

  if (marketType === "total") {
    if (/^over$/i.test(selection)) return "Over";
    if (/^under$/i.test(selection)) return "Under";
  }

  if (
    marketType === "moneyline_2way" ||
    marketType === "moneyline_3way" ||
    marketType === "spread"
  ) {
    return cleanTeam(selection, row.sport);
  }

  if (isPlayerPropMarket(marketType)) {
    if (/\bover$/i.test(selection)) return "Over";
    if (/\bunder$/i.test(selection)) return "Under";
  }

  if (marketType === "both_teams_to_score") {
    if (/^yes$/i.test(selection)) return "Yes";
    if (/^no$/i.test(selection)) return "No";
  }

  return selection;
}

function normalizeLineValueForMarket(row) {
  const marketType = normalizeMarketType(row.marketType);

  if (
    marketType === "moneyline_2way" ||
    marketType === "moneyline_3way" ||
    marketType === "both_teams_to_score" ||
    marketType === "anytime_goalscorer" ||
    marketType === "anytime_goal_scorer"
  ) {
    return "";
  }

  if (!Number.isFinite(row.lineValue)) {
    return "";
  }

  return Number(row.lineValue).toFixed(1);
}

function normalizeMarketType(value = "") {
  const text = String(value || "").trim().toLowerCase();

  if (text === "player_points") return "player_points";
  if (text === "player_assists") return "player_assists";
  if (text === "player_rebounds") return "player_rebounds";
  if (text === "player_threes") return "player_threes";
  if (text === "player_pra") return "player_pra";
  if (text === "player_points_rebounds") return "player_points_rebounds";
  if (text === "player_points_assists") return "player_points_assists";
  if (text === "player_rebounds_assists") return "player_rebounds_assists";
  if (text === "double_double") return "double_double";
  if (text === "triple_double") return "triple_double";
  if (text === "player_hits") return "player_hits";
  if (text === "player_total_bases") return "player_total_bases";
  if (text === "player_home_runs") return "player_home_runs";
  if (text === "player_rbis") return "player_rbis";
  if (text === "player_strikeouts") return "player_strikeouts";
  if (text === "player_shots_on_goal") return "player_shots_on_goal";
  if (text === "player_power_play_points") return "player_power_play_points";
  if (text === "player_saves") return "player_saves";
  if (text === "anytime_goalscorer") return "anytime_goalscorer";
  if (text === "anytime_goal_scorer") return "anytime_goalscorer";
  if (text === "both_teams_to_score") return "both_teams_to_score";

  return text;
}

function isPlayerPropMarket(marketType = "") {
  return [
    "player_points",
    "player_assists",
    "player_rebounds",
    "player_threes",
    "player_pra",
    "player_points_rebounds",
    "player_points_assists",
    "player_rebounds_assists",
    "double_double",
    "triple_double",
    "player_hits",
    "player_total_bases",
    "player_home_runs",
    "player_rbis",
    "player_strikeouts",
    "player_shots_on_goal",
    "player_power_play_points",
    "player_saves",
  ].includes(marketType);
}

function buildSubjectKey(row) {
  const marketType = normalizeMarketType(row.marketType);

  if (!isPlayerPropMarket(marketType)) return "";

  const eventKey = buildCanonicalEventKey(row);

  let selection = cleanText(row.selectionNormalized || row.selectionRaw);

  selection = selection
    .replace(/\b(over|under)\b/gi, "")
    .replace(/[+-]?\d+(\.\d+)?/g, "")
    .replace(/\bto record a\b/gi, "")
    .replace(/\bdouble double\b/gi, "")
    .replace(/\btriple double\b/gi, "")
    .trim();

  const resolvedName = resolvePlayerNameForGrouping(
    selection,
    eventKey,
    row
  );

  return `${marketType}::${resolvedName.toLowerCase()}`;
}

const playerAliasCache = new Map();

function resolvePlayerNameForGrouping(name, eventKey, row) {
  const normalizedName = normalizeSimpleName(name);
  const cacheKey = `${eventKey}::${normalizedName}`;

  if (playerAliasCache.has(cacheKey)) {
    return playerAliasCache.get(cacheKey);
  }

  const parts = normalizedName.split(" ").filter(Boolean);
  if (parts.length < 2) {
    playerAliasCache.set(cacheKey, name);
    return name;
  }

  const first = parts[0];
  const last = parts[parts.length - 1];

  const candidates = (row._allRowsInEvent || [])
    .map((r) =>
      cleanText(r.selectionNormalized || r.selectionRaw)
        .replace(/\b(over|under)\b/gi, "")
        .replace(/[+-]?\d+(\.\d+)?/g, "")
        .replace(/\bto record a\b/gi, "")
        .replace(/\bdouble double\b/gi, "")
        .replace(/\btriple double\b/gi, "")
        .trim()
    )
    .filter(Boolean);

  const uniqueCandidates = [...new Set(candidates)];

  const matches = uniqueCandidates.filter((candidate) => {
    const candidateNorm = normalizeSimpleName(candidate);
    const cParts = candidateNorm.split(" ").filter(Boolean);
    if (cParts.length < 2) return false;

    const cFirst = cParts[0];
    const cLast = cParts[cParts.length - 1];

    return cLast === last && cFirst.startsWith(first);
  });

  const longerMatches = matches.filter((candidate) => {
    const candidateNorm = normalizeSimpleName(candidate);
    const candidateFirst = candidateNorm.split(" ").filter(Boolean)[0] || "";
    return candidateFirst.length > first.length;
  });

  const resolved =
    longerMatches.length === 1
      ? longerMatches[0]
      : matches.length === 1
      ? matches[0]
      : name;

  playerAliasCache.set(cacheKey, resolved);
  return resolved;
}

function normalizeSimpleName(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTeam(value = "", sport = "") {
  const cleaned = cleanText(value);
  return normalizeTeamNameBySport(cleaned, String(sport || "").toUpperCase()) || cleaned;
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

