import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `dk_row_${nextId++}`;
}

export function parseDraftKingsText(rawText, context = {}) {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map((line) => normalizeMinus(line).trim())
    .filter(Boolean);

  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const away = lines[i];
    const awayMaybeScore = lines[i + 1];
    const atLine = lines[i + 2] === "AT" ? lines[i + 2] : lines[i + 1];
    const home = atLine === "AT" ? lines[i + 3] : lines[i + 2];
    const homeMaybeScore = atLine === "AT" ? lines[i + 4] : lines[i + 3];

    if (!looksLikeTeamLine(away) || atLine !== "AT" || !looksLikeTeamLine(home)) {
      continue;
    }

    const event = `${away} @ ${home}`;

    let j = atLine === "AT" ? i + 4 : i + 3;

    if (isScoreLine(awayMaybeScore)) j += 1;
    if (isScoreLine(homeMaybeScore)) j += 1;

    // Collect lines until the next game start or obvious section break
    const block = [];
    for (let k = j; k < lines.length; k += 1) {
      const current = lines[k];
      const next = lines[k + 1];
      const nextNext = lines[k + 2];

      const nextStartsGame =
        looksLikeTeamLine(current) &&
        (next === "AT" || nextNext === "AT");

      if (nextStartsGame && block.length > 0) break;
      if (isHardStopLine(current) && block.length > 0) break;

      block.push(current);

      // stop once we've likely captured enough market rows for this game
      if (block.length >= 12 && hasEnoughForGame(block)) break;
    }

    const parsed = parseGameBlock(block);

    if (parsed.mlAway !== null) {
      rows.push(
        makeRow({
          event,
          selection: away,
          marketType: "moneyline_2way",
          lineValue: null,
          oddsAmerican: parsed.mlAway,
          context,
          sportHint: event,
        })
      );
    }

    if (parsed.mlHome !== null) {
      rows.push(
        makeRow({
          event,
          selection: home,
          marketType: "moneyline_2way",
          lineValue: null,
          oddsAmerican: parsed.mlHome,
          context,
          sportHint: event,
        })
      );
    }

    if (parsed.spreadAwayLine !== null && parsed.spreadAwayOdds !== null) {
      rows.push(
        makeRow({
          event,
          selection: away,
          marketType: "spread",
          lineValue: parsed.spreadAwayLine,
          oddsAmerican: parsed.spreadAwayOdds,
          context,
          sportHint: event,
        })
      );
    }

    if (parsed.spreadHomeLine !== null && parsed.spreadHomeOdds !== null) {
      rows.push(
        makeRow({
          event,
          selection: home,
          marketType: "spread",
          lineValue: parsed.spreadHomeLine,
          oddsAmerican: parsed.spreadHomeOdds,
          context,
          sportHint: event,
        })
      );
    }

    if (parsed.totalLine !== null && parsed.overOdds !== null) {
      rows.push(
        makeRow({
          event,
          selection: "Over",
          marketType: "total",
          lineValue: parsed.totalLine,
          oddsAmerican: parsed.overOdds,
          context,
          sportHint: event,
        })
      );
    }

    if (parsed.totalLine !== null && parsed.underOdds !== null) {
      rows.push(
        makeRow({
          event,
          selection: "Under",
          marketType: "total",
          lineValue: parsed.totalLine,
          oddsAmerican: parsed.underOdds,
          context,
          sportHint: event,
        })
      );
    }

    i = Math.max(i, j + block.length - 1);
  }

  return rows;
}

function parseGameBlock(block) {
  const result = {
    spreadAwayLine: null,
    spreadAwayOdds: null,
    spreadHomeLine: null,
    spreadHomeOdds: null,
    totalLine: null,
    overOdds: null,
    underOdds: null,
    mlAway: null,
    mlHome: null,
  };

  const cleaned = block.filter((line) => !isIgnorableMarketLine(line));

  // Pattern we want from DK:
  // spreadAwayLine, spreadAwayOdds, O, totalLine, overOdds, mlAway,
  // spreadHomeLine, spreadHomeOdds, U, totalLine, underOdds, mlHome

  let idx = 0;

  const spreadAwayLine = parseSpreadLine(cleaned[idx]);
  const spreadAwayOdds = parseAmericanOdds(cleaned[idx + 1]);

  if (spreadAwayLine !== null && spreadAwayOdds !== null) {
    result.spreadAwayLine = spreadAwayLine;
    result.spreadAwayOdds = spreadAwayOdds;
    idx += 2;
  }

  if (cleaned[idx] === "O") {
    const totalLine = parseTotalNumber(cleaned[idx + 1]);
    const overOdds = parseAmericanOdds(cleaned[idx + 2]);

    if (totalLine !== null && overOdds !== null) {
      result.totalLine = totalLine;
      result.overOdds = overOdds;
      idx += 3;
    }
  }

  const mlAway = parseAmericanOdds(cleaned[idx]);
  if (mlAway !== null) {
    result.mlAway = mlAway;
    idx += 1;
  }

  const spreadHomeLine = parseSpreadLine(cleaned[idx]);
  const spreadHomeOdds = parseAmericanOdds(cleaned[idx + 1]);

  if (spreadHomeLine !== null && spreadHomeOdds !== null) {
    result.spreadHomeLine = spreadHomeLine;
    result.spreadHomeOdds = spreadHomeOdds;
    idx += 2;
  }

  if (cleaned[idx] === "U") {
    const totalLine2 = parseTotalNumber(cleaned[idx + 1]);
    const underOdds = parseAmericanOdds(cleaned[idx + 2]);

    if (totalLine2 !== null && underOdds !== null) {
      if (result.totalLine === null) result.totalLine = totalLine2;
      result.underOdds = underOdds;
      idx += 3;
    }
  }

  const mlHome = parseAmericanOdds(cleaned[idx]);
  if (mlHome !== null) {
    result.mlHome = mlHome;
  }

  return result;
}

function makeRow({ event, selection, marketType, lineValue, oddsAmerican, context, sportHint }) {
  const safeOdds = Number.isFinite(oddsAmerican) ? oddsAmerican : null;

  return {
    id: makeId(),
    batchId: "dk_batch",
    sportsbook: context.sportsbook || "DraftKings",
    sport: inferSportFromContextOrText(context, sportHint || event),
    league: "",
    eventLabelRaw: event,
    homeTeamRaw: "",
    awayTeamRaw: "",
    homeTeam: "",
    awayTeam: "",
    eventStartTime: "",
    marketType,
    selectionRaw: selection,
    selectionNormalized: selection,
    lineValue: Number.isFinite(lineValue) ? lineValue : null,
    oddsAmerican: safeOdds,
    oddsDecimal: Number.isFinite(safeOdds) ? americanToDecimal(safeOdds) : null,
    marketSide: null,
    confidence: "high",
    parseWarnings: [],
    isSharpSource: false,
    isTargetBook: true,
    excluded: false,
    userEdited: false,
  };
}

function inferSportFromContextOrText(context, text) {
  if (context.sport && typeof context.sport === "string") return context.sport;
  if (/nba|wizards|lakers|warriors|celtics|knicks|heat|bucks|mavericks|rockets|timberwolves|pelicans|spurs|trail blazers|cavaliers|hawks|bulls|jazz|thunder|suns/i.test(text)) {
    return "NBA";
  }
  if (/nhl|bruins|rangers|canucks|penguins/i.test(text)) return "NHL";
  if (/mlb|yankees|dodgers|phillies|giants|twins/i.test(text)) return "MLB";
  if (/arsenal|chelsea|draw|premier league|mls/i.test(text)) return "SOCCER";
  return "UNKNOWN";
}

function looksLikeTeamLine(line) {
  if (!line) return false;

  const text = String(line).trim();

  if (
    text.length < 3 ||
    isScoreLine(text) ||
    parseAmericanOdds(text) !== null ||
    parseSpreadLine(text) !== null ||
    parseTotalNumber(text) !== null ||
    text === "O" ||
    text === "U"
  ) {
    return false;
  }

  if (
    /log in|a-z sports|sportsbook|games|futures|quick sgp|game lines|player props|alt lines|quick hits|today|more bets|nba betting news|view full article|author|server time|parse input|clear input|clear parsed rows|book extraction guide|copy command|best method|fallback|avoid|steps|eastern conference|western conference|draftkings inc|about draftkings|careers|privacy policy|responsible gaming|how to bet/i.test(
      text
    )
  ) {
    return false;
  }

  if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(text)) return false;
  if (/quarter|pm|am|^\d{1,2}:\d{2}/i.test(text)) return false;

  return /[a-zA-Z]/.test(text);
}

function isScoreLine(line) {
  return /^\d{1,3}$/.test(String(line || "").trim());
}

function parseAmericanOdds(line) {
  const text = normalizeMinus(String(line || "").trim());
  if (!/^[+-]\d{2,5}$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseSpreadLine(line) {
  const text = normalizeMinus(String(line || "").trim());
  if (!/^[+-]\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseTotalNumber(line) {
  const text = normalizeMinus(String(line || "").trim());
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isIgnorableMarketLine(line) {
  const text = String(line || "").trim();
  return (
    /^more bets$/i.test(text) ||
    /quarter/i.test(text) ||
    /am|pm/i.test(text) ||
    /^(mon|tue|wed|thu|fri|sat|sun)/i.test(text)
  );
}

function isHardStopLine(line) {
  const text = String(line || "").trim();
  return (
    /nba betting news|view full article|author|today's nba odds|popular nba events|how to read nba odds|popular nba betting types|always wager responsibly|nba teams|draftkings inc/i.test(
      text
    )
  );
}

function hasEnoughForGame(block) {
  const americanCount = block.filter((line) => parseAmericanOdds(line) !== null).length;
  const spreadCount = block.filter((line) => parseSpreadLine(line) !== null).length;
  const totalMarkers = block.filter((line) => line === "O" || line === "U").length;
  return americanCount >= 4 && spreadCount >= 2 && totalMarkers >= 2;
}

function normalizeMinus(value) {
  return String(value || "").replace(/−/g, "-");
}