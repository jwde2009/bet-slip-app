import { normalizeTeamNameBySport } from "../data/teamAliases";
import { americanToDecimal } from "./odds";

export function normalizeParsedRows(rows) {
  const seededRows = (rows || []).map((row) => {
    const sport = String(row.sport || "").toUpperCase();
    const { homeTeam, awayTeam } = inferTeamsFromEvent(row.eventLabelRaw || "");

    const normalizedHome = normalizeTeamNameBySport(homeTeam, sport) || homeTeam;
    const normalizedAway = normalizeTeamNameBySport(awayTeam, sport) || awayTeam;

    return {
      ...row,
      homeTeamRaw: row.homeTeamRaw || homeTeam,
      awayTeamRaw: row.awayTeamRaw || awayTeam,
      homeTeam: row.homeTeam || normalizedHome,
      awayTeam: row.awayTeam || normalizedAway,
    };
  });

  const aliasMapByEvent = buildEventPlayerAliasMap(seededRows);

  return seededRows.map((row) => {
    const rawSelection = String(row.selectionRaw || row.selectionNormalized || "");
    const selectionNormalized = normalizeSelectionWithinEvent(row, rawSelection, aliasMapByEvent);

    return {
      ...row,
      selectionNormalized,
      oddsDecimal: Number.isFinite(row.oddsAmerican)
        ? americanToDecimal(row.oddsAmerican)
        : row.oddsDecimal,
    };
  });
}

function buildEventPlayerAliasMap(rows) {
  const map = new Map();

  for (const row of rows || []) {
    if (!isPlayerPropMarket(row.marketType)) continue;

    const eventKey = buildEventAliasKey(row);
    const rawSelection = String(row.selectionRaw || row.selectionNormalized || "");
    const baseName = extractBasePlayerName(rawSelection);

    if (!looksLikeFullPlayerName(baseName)) continue;

    if (!map.has(eventKey)) {
      map.set(eventKey, []);
    }

    const current = map.get(eventKey);
    if (!current.includes(baseName)) {
      current.push(baseName);
    }
  }

  return map;
}

function buildEventAliasKey(row) {
  const sport = String(row.sport || "").toUpperCase();
  const away = normalizeTeamNameBySport(row.awayTeam || row.awayTeamRaw || "", sport) || "";
  const home = normalizeTeamNameBySport(row.homeTeam || row.homeTeamRaw || "", sport) || "";

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const inferred = inferTeamsFromEvent(row.eventLabelRaw || "");
  const inferredAway = normalizeTeamNameBySport(inferred.awayTeam || "", sport) || inferred.awayTeam || "";
  const inferredHome = normalizeTeamNameBySport(inferred.homeTeam || "", sport) || inferred.homeTeam || "";

  return `${inferredAway} @ ${inferredHome}`;
}

function normalizeSelectionWithinEvent(row, rawSelection, aliasMapByEvent) {
  const marketType = String(row.marketType || "").toLowerCase();
  const sport = String(row.sport || "").toUpperCase();
  const cleanedSelection = String(rawSelection || "").trim();

  if (/^(moneyline_2way|moneyline_3way|spread)$/i.test(marketType)) {
    return normalizeTeamNameBySport(cleanedSelection, sport) || cleanedSelection;
  }

  if (/^total$/i.test(marketType)) {
    if (/^over$/i.test(cleanedSelection)) return "Over";
    if (/^under$/i.test(cleanedSelection)) return "Under";
    return cleanedSelection;
  }

  if (!isPlayerPropMarket(marketType)) {
    return cleanedSelection;
  }

  const side = detectSelectionSide(cleanedSelection);
  const baseName = extractBasePlayerName(cleanedSelection);
  const resolvedName = resolvePlayerNameWithinEvent(row, baseName, aliasMapByEvent);

  if (side) {
    return `${resolvedName} ${side}`;
  }

  return resolvedName;
}

function resolvePlayerNameWithinEvent(row, baseName, aliasMapByEvent) {
  const trimmed = String(baseName || "").trim();
  if (!trimmed) return trimmed;
  if (!looksLikeAbbreviatedPlayerName(trimmed)) return trimmed;

  const eventKey = buildEventAliasKey(row);
  const candidates = aliasMapByEvent.get(eventKey) || [];

  const abbreviated = normalizeSimpleName(trimmed);
  const abbreviatedParts = abbreviated.split(" ").filter(Boolean);
  if (abbreviatedParts.length < 2) return trimmed;

  const abbreviatedFirst = abbreviatedParts[0];
  const abbreviatedLast = abbreviatedParts[abbreviatedParts.length - 1];

  const matches = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeSimpleName(candidate);
    const candidateParts = normalizedCandidate.split(" ").filter(Boolean);
    if (candidateParts.length < 2) return false;

    const candidateFirst = candidateParts[0];
    const candidateLast = candidateParts[candidateParts.length - 1];

    return (
      candidateLast === abbreviatedLast &&
      candidateFirst.startsWith(abbreviatedFirst)
    );
  });

  if (matches.length === 1) {
    return matches[0];
  }

  return trimmed;
}

function extractBasePlayerName(text) {
  return String(text || "")
    .replace(/\|/g, " ")
    .replace(/\b(over|under)\b/gi, " ")
    .replace(/\bto record a\b/gi, " ")
    .replace(/\bdouble double\b/gi, " ")
    .replace(/\btriple double\b/gi, " ")
    .replace(/\bplayer shutout\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\+?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSelectionSide(text) {
  if (/\bover\b/i.test(text)) return "Over";
  if (/\bunder\b/i.test(text)) return "Under";
  return "";
}

function normalizeSimpleName(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFullPlayerName(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (!/\s/.test(value)) return false;

  const parts = value.split(/\s+/);
  if (parts.length < 2) return false;

  const first = parts[0].replace(/\./g, "");
  return first.length > 1;
}

function looksLikeAbbreviatedPlayerName(text) {
  const value = String(text || "").trim();
  if (!value) return false;

  const parts = value.split(/\s+/);
  if (parts.length < 2) return false;

  const first = parts[0].replace(/\./g, "");
  return first.length <= 2;
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
    "player_shutout",
  ].includes(String(marketType || "").toLowerCase());
}

function normalizePlayerName(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\b(over|under)\b/g, "")
    .replace(/\b\d+(\.\d+)?\+?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTeamsFromEvent(eventLabelRaw = "") {
  const label = eventLabelRaw.trim();

  if (label.includes("@")) {
    const [away, home] = label.split("@").map((s) => s.trim());
    return { homeTeam: home || "", awayTeam: away || "" };
  }

  if (/\bvs\b/i.test(label)) {
    const [away, home] = label.split(/\bvs\b/i).map((s) => s.trim());
    return { homeTeam: home || "", awayTeam: away || "" };
  }

  return { homeTeam: "", awayTeam: "" };
}