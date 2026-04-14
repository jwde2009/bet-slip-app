import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `dk_row_${nextId++}`;
}

export function parseDraftKingsText(rawText, context = {}) {
  console.log("parseDraftKingsText CALLED", {
    rawTextLength: rawText?.length || 0,
    sportsbook: context?.sportsbook,
  });

  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  console.log("DK NORMALIZED LINE COUNT", lines.length);
  console.log("DK FIRST 80 LINES", lines.slice(0, 80));

  const rows = [];

  const selectedGame = findSelectedGameFromDetailPage(lines);

  if (selectedGame) {
    const { away, home, startIndex } = selectedGame;
    const event = `${away} @ ${home}`;
    const block = collectDetailPageMarketBlock(lines, startIndex);
    const parsed = parseGameBlock(block);

    console.log("DK DETAIL PAGE GAME", {
      event,
      startIndex,
      block,
      parsed,
    });

    pushParsedRows(rows, {
      event,
      away,
      home,
      parsed,
      context,
    });
  }

  if (rows.length === 0) {
    for (let i = 0; i < lines.length; i += 1) {
      const listGame = findDraftKingsListGameStart(lines, i);
      if (!listGame) continue;

      const { away, home, nextIndex } = listGame;
      const event = `${away} @ ${home}`;
      const block = collectListPageMarketBlock(lines, nextIndex);
      const parsed = parseGameBlock(block);

      console.log("DK LIST PAGE GAME", {
        i,
        event,
        block,
        parsed,
      });

      pushParsedRows(rows, {
        event,
        away,
        home,
        parsed,
        context,
      });

      i = Math.max(i, nextIndex + block.length - 1);
    }
  }

  const deduped = dedupeRows(rows);

  console.log("DK FINAL ROW COUNT", deduped.length);
  console.log("DK FINAL ROWS", deduped);

  return deduped;
}

function pushParsedRows(rows, { event, away, home, parsed, context }) {
  const isThreeWay = parsed.mlDraw !== null;

  if (parsed.mlAway !== null) {
    rows.push(
      makeRow({
        event,
        selection: away,
        marketType: isThreeWay ? "moneyline_3way" : "moneyline_2way",
        lineValue: null,
        oddsAmerican: parsed.mlAway,
        context,
        sportHint: event,
      })
    );
  }

  if (parsed.mlDraw !== null) {
    rows.push(
      makeRow({
        event,
        selection: "Draw",
        marketType: "moneyline_3way",
        lineValue: null,
        oddsAmerican: parsed.mlDraw,
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
        marketType: isThreeWay ? "moneyline_3way" : "moneyline_2way",
        lineValue: null,
        oddsAmerican: parsed.mlHome,
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
}

function findSelectedGameFromDetailPage(lines) {
  const titleLine = lines.find((line) =>
    /Sportsbook\s*\/.*Odds\s*\/.*\bvs\b.*Odds$/i.test(line)
  );

  const titleMatch = titleLine?.match(/\/\s*([^/]+?)\s+vs\s+([^/]+?)\s+Odds$/i);

  const headerTeamA = titleMatch?.[1] ? normalizeTeamName(titleMatch[1]) : "";
  const headerTeamB = titleMatch?.[2] ? normalizeTeamName(titleMatch[2]) : "";

  const startsInIndex = lines.findIndex((line) => /^Starts In:?$/i.test(line));
  if (startsInIndex === -1) return null;
  console.log("DK DETAIL HEADER MATCH", { titleLine, headerTeamA, headerTeamB, startsInIndex });
  
  for (let i = Math.max(0, startsInIndex - 8); i <= Math.min(lines.length - 1, startsInIndex + 12); i += 1) {
    const line = lines[i];
    if (!looksLikeTeamLine(line)) continue;

    const normalized = normalizeTeamName(line);

    if (headerTeamA && normalized === headerTeamA) {
      for (let j = startsInIndex + 1; j <= Math.min(lines.length - 1, startsInIndex + 12); j += 1) {
        const candidate = lines[j];
        if (!looksLikeTeamLine(candidate)) continue;

        const candidateNormalized = normalizeTeamName(candidate);
        if (candidateNormalized === headerTeamB) {
          return {
            away: headerTeamA,
            home: headerTeamB,
            startIndex: j + 1,
          };
        }
      }
    }

    if (headerTeamB && normalized === headerTeamB) {
      for (let j = startsInIndex + 1; j <= Math.min(lines.length - 1, startsInIndex + 12); j += 1) {
        const candidate = lines[j];
        if (!looksLikeTeamLine(candidate)) continue;

        const candidateNormalized = normalizeTeamName(candidate);
        if (candidateNormalized === headerTeamA) {
          return {
            away: headerTeamA,
            home: headerTeamB,
            startIndex: j + 1,
          };
        }
      }
    }
  }

  for (let i = startsInIndex + 1; i < Math.min(lines.length - 1, startsInIndex + 12); i += 1) {
    const away = lines[i];
    const home = lines[i + 1];

    if (!looksLikeTeamLine(away) || !looksLikeTeamLine(home)) continue;
    if (isLikelyNonGameLabel(away) || isLikelyNonGameLabel(home)) continue;

    return {
      away,
      home,
      startIndex: i + 2,
    };
  }

  return null;
}

function findDraftKingsListGameStart(lines, startIndex) {
  for (let i = startIndex; i < Math.min(lines.length - 2, startIndex + 8); i += 1) {
    const away = lines[i];
    if (!looksLikeTeamLine(away)) continue;

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j += 1) {
      const middle = lines[j];

      if (!isAtMarker(middle)) continue;

      for (let k = j + 1; k <= Math.min(lines.length - 1, j + 3); k += 1) {
        const home = lines[k];
        if (!looksLikeTeamLine(home)) continue;

        return {
          away,
          home,
          nextIndex: k + 1,
        };
      }
    }
  }

  return null;
}

function collectDetailPageMarketBlock(lines, startIndex) {
  const block = [];
  let started = false;

  for (let i = startIndex; i < lines.length; i += 1) {
    const text = lines[i];

    if (!started) {
      if (isDetailTabOrHeader(text)) {
        started = true;
      } else {
        continue;
      }
    }

    if (block.length > 0 && isHardStopLine(text)) break;
    if (block.length > 0 && looksLikeAnotherEventHeader(lines, i)) break;

    if (!isIgnorableMarketLine(text)) {
      block.push(text);
    }

    if (block.length >= 40 && hasEnoughForGame(block)) break;
  }

  return block;
}

function collectListPageMarketBlock(lines, startIndex) {
  const block = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const current = lines[i];

    if (block.length > 0 && looksLikeNewGameStart(lines, i)) break;
    if (block.length > 0 && isHardStopLine(current)) break;

    if (!isIgnorableMarketLine(current)) {
      block.push(current);
    }

    if (block.length >= 24 && hasEnoughForGame(block)) break;
  }

  return block;
}

function looksLikeAnotherEventHeader(lines, i) {
  const a = lines[i];
  const b = lines[i + 1];
  const c = lines[i + 2];

  return (
    isDateLine(a) &&
    looksLikeTeamLine(b) &&
    looksLikeTeamLine(c)
  );
}

function looksLikeNewGameStart(lines, i) {
  const a = lines[i];
  const b = lines[i + 1];
  const c = lines[i + 2];
  const d = lines[i + 3];

  return (
    (looksLikeTeamLine(a) && isAtMarker(b) && looksLikeTeamLine(c)) ||
    (looksLikeTeamLine(a) && isSkippableBetweenTeams(b) && isAtMarker(c) && looksLikeTeamLine(d))
  );
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

  const cleaned = block
    .map((line) => normalizeLine(line))
    .filter((line) => !isIgnorableMarketLine(line));

  console.log("DK CLEANED BLOCK", cleaned);

  for (let i = 0; i < cleaned.length - 1; i += 1) {
    const current = cleaned[i];
    const next = cleaned[i + 1];
    const next2 = cleaned[i + 2];

    // 🔥 NEW: label-based moneyline parsing
    if (/^moneyline$/i.test(current)) {
  for (let j = i + 1; j < Math.min(cleaned.length, i + 10); j += 1) {
    const label = cleaned[j];
    const odds = cleaned[j + 1];

    if (!label || !odds) continue;

    if (parseAmericanOdds(odds) !== null) {
      if (/^draw$/i.test(label)) {
        result.mlDraw = parseAmericanOdds(odds);
      } else if (result.mlAway === null) {
        result.mlAway = parseAmericanOdds(odds);
      } else if (result.mlHome === null) {
        result.mlHome = parseAmericanOdds(odds);
      }

      j += 1;
    }
  }
}

    // existing numeric fallback
    if (
      result.mlAway === null &&
      parseAmericanOdds(current) !== null
    ) {
      result.mlAway = parseAmericanOdds(current);
      continue;
    }

    if (
      result.mlHome === null &&
      parseAmericanOdds(current) !== null
    ) {
      result.mlHome = parseAmericanOdds(current);
      continue;
    }

    // totals (detail page often "Over 3.5 Total Goals")
    if (/^over\s+\d+(\.\d+)?/i.test(current) && parseAmericanOdds(next) !== null) {
      const match = current.match(/\d+(\.\d+)?/);
      if (match) {
        result.totalLine = Number(match[0]);
        result.overOdds = parseAmericanOdds(next);
      }
    }

    if (/^under\s+\d+(\.\d+)?/i.test(current) && parseAmericanOdds(next) !== null) {
      const match = current.match(/\d+(\.\d+)?/);
      if (match) {
        result.totalLine = Number(match[0]);
        result.underOdds = parseAmericanOdds(next);
      }
    }
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
  if (/premier league|chelsea|arsenal|tottenham|brighton|liverpool|man city|man utd|newcastle|everton|west ham|aston villa|nottingham forest|burnley|wolves|fulham|bournemouth|crystal palace|brentford|leeds|sunderland/i.test(text)) {
    return "SOCCER";
  }
  if (/nba|wizards|lakers|warriors|celtics|knicks|heat|bucks|mavericks|rockets|timberwolves|pelicans|spurs|trail blazers|cavaliers|hawks|bulls|jazz|thunder|suns/i.test(text)) {
    return "NBA";
  }
  if (/nhl|bruins|rangers|canucks|penguins/i.test(text)) return "NHL";
  if (/mlb|yankees|dodgers|phillies|giants|twins/i.test(text)) return "MLB";
  return "UNKNOWN";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/−/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamName(value) {
  return normalizeLine(value)
    .replace(/\s+Odds$/i, "")
    .trim();
}

function looksLikeTeamLine(line) {
  const text = normalizeLine(line);
  if (!text) return false;

  if (
    text.length < 2 ||
    isScoreLine(text) ||
    parseAmericanOdds(text) !== null ||
    parseSpreadLine(text) !== null ||
    parseTotalNumber(text) !== null ||
    isOverMarker(text) ||
    isUnderMarker(text)
  ) {
    return false;
  }

  if (isLikelyNonGameLabel(text)) return false;
  if (isDateLine(text)) return false;

  return /[A-Za-z]/.test(text);
}

function isLikelyNonGameLabel(text) {
  return /log in|a-z sports|sportsbook|all odds|sgp|builder|quick sgp|stats|popular|match lines|halves|match props|player props|same game parlay|more bets|featured|live now|upcoming|starts in:?|game lines|boosts|promos|news|standings|results|tables|fixtures|schedule|draftkings inc|about draftkings|careers|privacy policy|responsible gaming|how to bet/i.test(
    text
  );
}

function isDateLine(text) {
  return /^(mon|tue|wed|thu|fri|sat|sun)\s+[a-z]{3}\s+\d{1,2}(st|nd|rd|th)?\s+\d{1,2}:\d{2}\s*(am|pm)$/i.test(
    text
  );
}

function isScoreLine(line) {
  return /^\d{1,3}$/.test(normalizeLine(line));
}

function parseAmericanOdds(line) {
  const text = normalizeLine(line);
  if (!/^[+-]\d{2,5}$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseSpreadLine(line) {
  const text = normalizeLine(line);
  if (!/^[+-]\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseTotalNumber(line) {
  const text = normalizeLine(line);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isOverMarker(line) {
  return /^(o|over)$/i.test(normalizeLine(line));
}

function isUnderMarker(line) {
  return /^(u|under)$/i.test(normalizeLine(line));
}

function isAtMarker(line) {
  return /^(AT|@|vs\.?|v\.?)$/i.test(normalizeLine(line));
}

function isSkippableBetweenTeams(line) {
  const text = normalizeLine(line);
  return isScoreLine(text) || isDateLine(text) || /^\d{1,2}:\d{2}$/.test(text);
}

function isDetailTabOrHeader(line) {
  const text = normalizeLine(line);
  return /^(all odds|sgp|builder|quick sgp|stats|popular|match lines|halves|match props)$/i.test(text);
}

function isIgnorableMarketLine(line) {
  const text = normalizeLine(line);
  return (
    /^more bets$/i.test(text) ||
    /^all odds$/i.test(text) ||
    /^sgp$/i.test(text) ||
    /^builder$/i.test(text) ||
    /^quick sgp$/i.test(text) ||
    /^stats$/i.test(text) ||
    /^popular$/i.test(text) ||
    /^match lines$/i.test(text) ||
    /^halves$/i.test(text) ||
    /^match props$/i.test(text) ||
    /\b(?:am|pm)\b/i.test(text) ||
    /^(mon|tue|wed|thu|fri|sat|sun)\b/i.test(text)
  );
}

function isHardStopLine(line) {
  const text = normalizeLine(line);
  return /view full article|author|today's .* odds|popular .* events|how to read .* odds|popular .* betting types|always wager responsibly|draftkings inc|about draftkings|privacy policy|responsible gaming/i.test(
    text
  );
}

function hasEnoughForGame(block) {
  const americanCount = block.filter((line) => parseAmericanOdds(line) !== null).length;
  const spreadCount = block.filter((line) => parseSpreadLine(line) !== null).length;
  const totalMarkers = block.filter((line) => isOverMarker(line) || isUnderMarker(line)).length;
  return americanCount >= 2 || (spreadCount >= 2 && totalMarkers >= 2);
}

function dedupeRows(rows) {
  const seen = new Set();

  return rows.filter((row) => {
    const key = [
      row.sportsbook,
      row.eventLabelRaw,
      row.marketType,
      row.selectionNormalized,
      row.lineValue,
      row.oddsAmerican,
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}