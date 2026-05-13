import { normalizeTeamNameBySport } from "../data/teamAliases";
import { americanToDecimal } from "./odds";
import { normalizeMarketType, isPlayerPropMarket } from "./marketNormalization";

export function normalizeParsedRows(rows) {
  const seededRows = (rows || []).map((row) => {
    const sport = String(row.sport || "").toUpperCase();
    const { homeTeam, awayTeam } = inferTeamsFromEvent(row.eventLabelRaw || "");

    const normalizedHome = cleanTeam(homeTeam, sport);
    const normalizedAway = cleanTeam(awayTeam, sport);

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
    const sportKey = buildSportAliasKey(row);
    const rawSelection = String(row.selectionRaw || row.selectionNormalized || "");
    const baseName = extractBasePlayerName(rawSelection);

    if (!looksLikeFullPlayerName(baseName)) continue;

    if (!map.has(eventKey)) {
      map.set(eventKey, []);
    }

    const eventNames = map.get(eventKey);
    if (!eventNames.includes(baseName)) {
      eventNames.push(baseName);
    }

    if (!map.has(sportKey)) {
      map.set(sportKey, []);
    }

    const sportNames = map.get(sportKey);
    if (!sportNames.includes(baseName)) {
      sportNames.push(baseName);
    }
  }

  return map;
}

function buildEventAliasKey(row) {
  const sport = String(row.sport || "").toUpperCase();
  const away = cleanTeam(row.awayTeam || row.awayTeamRaw || "", sport);
  const home = cleanTeam(row.homeTeam || row.homeTeamRaw || "", sport);

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const inferred = inferTeamsFromEvent(row.eventLabelRaw || "");
  const inferredAway = cleanTeam(inferred.awayTeam || "", sport);
  const inferredHome = cleanTeam(inferred.homeTeam || "", sport);

  return `${inferredAway} @ ${inferredHome}`;
}

function buildSportAliasKey(row) {
  const sport = String(row.sport || "").trim().toUpperCase();
  return `__sport__::${sport || "UNKNOWN"}`;
}

function normalizeSelectionWithinEvent(row, rawSelection, aliasMapByEvent) {
  const marketType = normalizeMarketType(row.marketType);
  const sport = String(row.sport || "").toUpperCase();
  const cleanedSelection = String(rawSelection || "").trim();

  if (["moneyline_2way", "moneyline_3way", "spread"].includes(marketType)) {
    return cleanTeam(cleanedSelection, sport);
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
  const sportKey = buildSportAliasKey(row);

  const eventCandidates = Array.from(new Set(aliasMapByEvent.get(eventKey) || []));
  const sportCandidates = Array.from(new Set(aliasMapByEvent.get(sportKey) || []));

  const abbreviated = normalizeSimpleName(trimmed);
  const abbreviatedParts = abbreviated.split(" ").filter(Boolean);
  if (abbreviatedParts.length < 2) return trimmed;

  const abbreviatedFirst = abbreviatedParts[0];
  const abbreviatedLast = abbreviatedParts[abbreviatedParts.length - 1];

  function findUniqueMatch(candidates = []) {
    const matches = candidates.filter((candidate) => {
      const normalizedCandidate = normalizeSimpleName(candidate);
      const candidateParts = normalizedCandidate.split(" ").filter(Boolean);
      if (candidateParts.length < 2) return false;

      const candidateFirst = candidateParts[0];
      const candidateLast = candidateParts[candidateParts.length - 1];

      if (candidateLast !== abbreviatedLast) return false;

      return isFirstNameAbbreviationMatch(abbreviatedFirst, candidateFirst);
    });

    return matches.length === 1 ? matches[0] : "";
  }

  // Safest: same event first.
  const eventMatch = findUniqueMatch(eventCandidates);
  if (eventMatch) return eventMatch;

  // Fallback: same sport. This helps when one book uses abbreviated names and
  // another book has full names, but event normalization is slightly off.
  const sportMatch = findUniqueMatch(sportCandidates);
  if (sportMatch) return sportMatch;

  // Safety rule:
  // If J. Jones could be John Jones or James Jones, do not guess.
  return trimmed;
}


function isFirstNameAbbreviationMatch(shortFirst, fullFirst) {
  const short = normalizeSimpleName(shortFirst);
  const full = normalizeSimpleName(fullFirst);

  if (!short || !full) return false;
  if (short === full) return true;

  // A. Black -> Anthony Black
  if (short.length === 1) {
    return full.charAt(0) === short;
  }

  // Don. Mitchell -> Donovan Mitchell
  // Ja. Walter -> Ja'Kobe Walter, if that shape appears
  return full.startsWith(short);
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

  const firstRaw = parts[0] || "";
  const first = firstRaw.replace(/\./g, "");

  // Do NOT seed the alias map with abbreviated names.
  // Examples that must NOT be treated as full names:
  // Don. Mitchell
  // Aus. Thompson
  // C. Cunningham
  if (firstRaw.includes(".")) return false;

  // A full first name should be more than a one-letter/initial token.
  return first.length > 1;
}

function looksLikeAbbreviatedPlayerName(text) {
  const value = String(text || "").trim();
  if (!value) return false;

  const parts = value.split(/\s+/);
  if (parts.length < 2) return false;

  const firstRaw = parts[0];
  const first = firstRaw.replace(/\./g, "");

  // A. Black / A Black
  if (first.length <= 2) return true;

  // Don. Mitchell / Don Mitchell-style short forms.
  // The period is the safest signal that this is not a complete first name.
  if (firstRaw.includes(".")) return true;

  return false;
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

function cleanTeam(value = "", sport = "") {
  const cleaned = cleanText(value);
  const sportKey = String(sport || "").toUpperCase();

  const direct = normalizeTeamNameBySport(cleaned, sportKey);
  if (direct) return direct;

  if (sportKey === "NBA") {
    const nbaName = normalizeNbaTeamByContainedName(cleaned);
    if (nbaName) return nbaName;
  }

  return cleaned;
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNbaTeamByContainedName(value = "") {
  const text = cleanText(value).toLowerCase();

  if (!text) return "";

  const teams = [
    ["hawks", "atlanta", "atl", "Atlanta Hawks"],
    ["celtics", "boston", "bos", "Boston Celtics"],
    ["nets", "brooklyn", "bkn", "Brooklyn Nets"],
    ["hornets", "charlotte", "cha", "Charlotte Hornets"],
    ["bulls", "chicago", "chi", "Chicago Bulls"],
    ["cavaliers", "cleveland", "cavs", "cle", "Cleveland Cavaliers"],
    ["mavericks", "dallas", "mavs", "dal", "Dallas Mavericks"],
    ["nuggets", "denver", "den", "Denver Nuggets"],
    ["pistons", "detroit", "det", "Detroit Pistons"],
    ["warriors", "golden state", "gsw", "Golden State Warriors"],
    ["rockets", "houston", "hou", "Houston Rockets"],
    ["pacers", "indiana", "ind", "Indiana Pacers"],
    ["clippers", "la clippers", "lac", "Los Angeles Clippers"],
    ["lakers", "la lakers", "lal", "Los Angeles Lakers"],
    ["grizzlies", "memphis", "mem", "Memphis Grizzlies"],
    ["heat", "miami", "mia", "Miami Heat"],
    ["bucks", "milwaukee", "mil", "Milwaukee Bucks"],
    ["timberwolves", "minnesota", "wolves", "min", "Minnesota Timberwolves"],
    ["pelicans", "new orleans", "nop", "no pelicans", "New Orleans Pelicans"],
    ["knicks", "new york", "ny knicks", "nyk", "New York Knicks"],
    ["thunder", "oklahoma city", "okc", "Oklahoma City Thunder"],
    ["magic", "orlando", "orl", "Orlando Magic"],
    ["76ers", "sixers", "philadelphia", "phi", "Philadelphia 76ers"],
    ["suns", "phoenix", "phx", "Phoenix Suns"],
    ["trail blazers", "portland", "por", "Portland Trail Blazers"],
    ["kings", "sacramento", "sac", "Sacramento Kings"],
    ["spurs", "san antonio", "sa spurs", "sas", "San Antonio Spurs"],
    ["raptors", "toronto", "tor", "Toronto Raptors"],
    ["jazz", "utah", "uta", "Utah Jazz"],
    ["wizards", "washington", "wsh", "was", "Washington Wizards"],
  ];

  for (const team of teams) {
    const fullName = team[team.length - 1];
    const aliases = team.slice(0, -1);

    for (const alias of aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");

      if (pattern.test(text)) {
        return fullName;
      }
    }
  }

  return "";
}