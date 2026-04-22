import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `mgm_row_${nextId++}`;
}

export function parseBetMGMText(rawText = "", context = {}) {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const sport = inferSport(lines, context);
  const rows = [];

  const detailEvent = findDetailEvent(lines);
  if (detailEvent) {
    const event = `${detailEvent.away} @ ${detailEvent.home}`;
    rows.push(...parseMainLines(lines, detailEvent.startIndex, event, detailEvent.away, detailEvent.home, sport));
    rows.push(...parseOverUnderPlayerProps(lines, detailEvent.startIndex, event, sport));
    rows.push(...parsePlusLadders(lines, detailEvent.startIndex, event, sport));
  }

  if (rows.length === 0) {
    rows.push(...parseLandingGames(lines, sport));
  }

  return dedupeRows(rows);
}

function parseLandingGames(lines, sport) {
  console.log("LANDING LOOP HIT");
  const rows = [];

  for (let i = 0; i < lines.length - 14; i += 1) {
    if (!isLikelyVsLine(lines[i])) continue;

    const parsedEvent = parseVsLine(lines[i]);
    if (!parsedEvent.away || !parsedEvent.home) continue;

    const block = lines.slice(i, i + 20);
    const parsed = parseMainBlock(block);
    if (!parsed) continue;

    const event = `${parsedEvent.away} @ ${parsedEvent.home}`;
    rows.push(...buildMainRows(event, parsedEvent.away, parsedEvent.home, sport, parsed));
    i += 10;
  }

  return rows;
}

function findDetailEvent(lines) {
  const startsIndex = lines.findIndex((line) => /^Starts In:?$/i.test(line));
  if (startsIndex !== -1) {
    let away = "";
    let home = "";
    for (let i = Math.max(0, startsIndex - 8); i <= Math.min(lines.length - 1, startsIndex + 8); i += 1) {
      if (!away && isLikelyTeamName(lines[i])) {
        away = lines[i];
        continue;
      }
      if (away && !home && isLikelyTeamName(lines[i]) && lines[i] !== away) {
        home = lines[i];
        break;
      }
    }
    if (away && home) return { away, home, startIndex: startsIndex + 1 };
  }

  for (let i = 0; i < lines.length - 2; i += 1) {
    if (isLikelyTeamName(lines[i]) && isAtMarker(lines[i + 1]) && isLikelyTeamName(lines[i + 2])) {
      return { away: lines[i], home: lines[i + 2], startIndex: i + 3 };
    }
  }

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (isLikelyVsLine(lines[i])) {
      const parsed = parseVsLine(lines[i]);
      if (parsed.away && parsed.home) {
        return { away: parsed.away, home: parsed.home, startIndex: i + 1 };
      }
    }
  }

  for (let i = 0; i < lines.length - 4; i += 1) {
    if (
      isLikelyTimeLine(lines[i]) &&
      isLikelyBroadcastLine(lines[i + 1]) &&
      isLikelyTeamName(lines[i + 2]) &&
      isLikelyTeamName(lines[i + 3]) &&
      lines[i + 2] !== lines[i + 3]
    ) {
      return { away: lines[i + 2], home: lines[i + 3], startIndex: i + 4 };
    }
  }

  return null;
}

function parseMainLines(lines, startIndex, event, away, home, sport) {
  console.log("MAIN LINES SEARCH", { startIndex });
  const spreadIdx = findLineIndexAfter(lines, startIndex, /^Spread$/i);
  const totalIdx = findLineIndexAfter(lines, startIndex, /^Total$/i);
  const moneyIdx = findLineIndexAfter(lines, startIndex, /^Money$/i);

  if (spreadIdx === -1 || totalIdx === -1 || moneyIdx === -1) return [];

  const blockStart = Math.max(0, spreadIdx - 2);
  const block = lines.slice(blockStart, Math.min(lines.length, moneyIdx + 12));
  const parsed = parseMainBlock(block);
  if (!parsed) return [];

  return buildMainRows(event, away, home, sport, parsed);
}

function parseMainBlock(block) {
  const working = block.filter((line) => !isSkippableLine(line));

  const atIdx = working.findIndex((line) => isAtMarker(line));
  if (atIdx !== -1 && atIdx + 11 < working.length) {
    const spreadA = parseSignedNumber(working[atIdx + 2]);
    const spreadAOdds = parseAmericanOdds(working[atIdx + 3]);
    const totalOver = parseTotalToken(working[atIdx + 4], "O");
    const totalOverOdds = parseAmericanOdds(working[atIdx + 5]);
    const moneylineA = parseAmericanOdds(working[atIdx + 6]);

    const spreadB = parseSignedNumber(working[atIdx + 7]);
    const spreadBOdds = parseAmericanOdds(working[atIdx + 8]);
    const totalUnder = parseTotalToken(working[atIdx + 9], "U");
    const totalUnderOdds = parseAmericanOdds(working[atIdx + 10]);
    const moneylineB = parseAmericanOdds(working[atIdx + 11]);

    if (
      spreadA !== null && spreadAOdds !== null &&
      totalOver !== null && totalOverOdds !== null &&
      moneylineA !== null && spreadB !== null && spreadBOdds !== null &&
      totalUnder !== null && totalUnderOdds !== null && moneylineB !== null
    ) {
      return {
        spreadA,
        spreadAOdds,
        moneylineA,
        spreadB,
        spreadBOdds,
        moneylineB,
        totalLine: totalOver,
        totalOverOdds,
        totalUnderOdds,
      };
    }
  }

  const spreadIdx = working.findIndex((line) => /^Spread$/i.test(line));
  const totalIdx = working.findIndex((line) => /^Total$/i.test(line));
  const moneyIdx = working.findIndex((line) => /^Money$/i.test(line));

  if (spreadIdx === -1 || totalIdx === -1 || moneyIdx === -1) return null;

  const teamStart = moneyIdx + 1;
  if (teamStart + 7 >= working.length) return null;

  const spreadA = parseSignedNumber(working[teamStart + 1]);
  const spreadAOdds = parseAmericanOdds(working[teamStart + 2]);
  const totalOver = parseTotalToken(working[teamStart + 3], "O");
  const totalOverOdds = parseAmericanOdds(working[teamStart + 4]);
  const moneylineA = parseAmericanOdds(working[teamStart + 5]);

  const spreadB = parseSignedNumber(working[teamStart + 6]);
  const spreadBOdds = parseAmericanOdds(working[teamStart + 7]);
  const totalUnder = parseTotalToken(working[teamStart + 8], "U");
  const totalUnderOdds = parseAmericanOdds(working[teamStart + 9]);
  const moneylineB = parseAmericanOdds(working[teamStart + 10]);

  if (
    spreadA === null || spreadAOdds === null ||
    totalOver === null || totalOverOdds === null ||
    moneylineA === null || spreadB === null || spreadBOdds === null ||
    totalUnder === null || totalUnderOdds === null || moneylineB === null
  ) {
    return null;
  }

  return {
    spreadA,
    spreadAOdds,
    moneylineA,
    spreadB,
    spreadBOdds,
    moneylineB,
    totalLine: totalOver,
    totalOverOdds,
    totalUnderOdds,
  };
}

function parseOverUnderPlayerProps(lines, startIndex, event, sport) {
  const rows = [];
  const sections = [
    ["Points O/U", "player_points"],
    ["Rebounds O/U", "player_rebounds"],
    ["Assists O/U", "player_assists"],
    ["Threes O/U", "player_threes"],
    ["Pts + Reb + Ast O/U", "player_pra"],
    ["Shots on Goal O/U", "player_shots_on_goal"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findLineIndexAfter(lines, startIndex, new RegExp(`^${escapeRegExp(header)}$`, "i"));
    if (idx === -1) continue;

    const end = findNextSectionIndex(lines, idx + 1);
    let i = idx + 1;

    while (i < end - 6) {
      const player = lines[i];
      if (!looksLikePlayerName(player)) {
        i += 1;
        continue;
      }

      const overMarker = lines[i + 1];
      const line1 = parseUnsignedNumber(lines[i + 2]);
      const overOdds = parseAmericanOdds(lines[i + 3]);
      const underMarker = lines[i + 4];
      const line2 = parseUnsignedNumber(lines[i + 5]);
      const underOdds = parseAmericanOdds(lines[i + 6]);

      if (
        /^O$/i.test(overMarker) &&
        /^U$/i.test(underMarker) &&
        line1 !== null && line1 === line2 &&
        overOdds !== null && underOdds !== null
      ) {
        rows.push(buildRow({ sport, event, marketType, selection: `${player} Over`, lineValue: line1, oddsAmerican: overOdds }));
        rows.push(buildRow({ sport, event, marketType, selection: `${player} Under`, lineValue: line1, oddsAmerican: underOdds }));
        i += 7;
        continue;
      }

      i += 1;
    }
  }

  return rows;
}

function parsePlusLadders(lines, startIndex, event, sport) {
  const rows = [];
  const sections = [
    ["Points", "player_points"],
    ["Rebounds", "player_rebounds"],
    ["Assists", "player_assists"],
    ["Threes", "player_threes"],
    ["Hits", "player_hits"],
    ["Total Bases", "player_total_bases"],
    ["Shots", "player_shots_on_goal"],
    ["Goals", "player_goals"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findLineIndexAfter(lines, startIndex, new RegExp(`^${escapeRegExp(header)}$`, "i"));
    if (idx === -1) continue;

    const end = findNextSectionIndex(lines, idx + 1);
    let i = idx + 1;

    while (i < end) {
      const player = lines[i];
      if (!looksLikePlayerName(player)) {
        i += 1;
        continue;
      }

      let j = i + 1;
      let lastPlus = null;

      while (j < end) {
        const token = lines[j];

        if (looksLikePlayerName(token) || isLikelySectionHeader(token)) break;

        const plus = parsePlusToken(token);
        const odds = parseAmericanOdds(token);

        if (plus !== null) {
          lastPlus = plus;
        } else if (odds !== null && lastPlus !== null) {
          rows.push(buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Over`,
            lineValue: lastPlus - 0.5,
            oddsAmerican: odds,
          }));
        }

        j += 1;
      }

      i = Math.max(j, i + 1);
    }
  }

  return rows;
}

function buildMainRows(event, away, home, sport, parsed) {
  return [
    buildRow({ sport, event, marketType: "spread", selection: away, lineValue: parsed.spreadA, oddsAmerican: parsed.spreadAOdds }),
    buildRow({ sport, event, marketType: "moneyline_2way", selection: away, lineValue: null, oddsAmerican: parsed.moneylineA }),
    buildRow({ sport, event, marketType: "total", selection: "Over", lineValue: parsed.totalLine, oddsAmerican: parsed.totalOverOdds }),
    buildRow({ sport, event, marketType: "spread", selection: home, lineValue: parsed.spreadB, oddsAmerican: parsed.spreadBOdds }),
    buildRow({ sport, event, marketType: "moneyline_2way", selection: home, lineValue: null, oddsAmerican: parsed.moneylineB }),
    buildRow({ sport, event, marketType: "total", selection: "Under", lineValue: parsed.totalLine, oddsAmerican: parsed.totalUnderOdds }),
  ];
}

function inferSport(lines, context) {
  if (context?.sport) return String(context.sport).toUpperCase();
  const text = lines.slice(0, 80).join(" ");
  if (/NBA/i.test(text)) return "NBA";
  if (/NHL/i.test(text)) return "NHL";
  if (/MLB/i.test(text)) return "MLB";
  return "UNKNOWN";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/−|\u2212|âˆ’/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyTeamName(value) {
  const text = normalizeLine(value);
  if (!text || !/[A-Za-z]/.test(text)) return false;
  if (/\d{1,2}:\d{2}/.test(text) || /\b(am|pm)\b/i.test(text)) return false;
  if (/^(today|tomorrow|starts in:?|all odds|sgp|builder|stats|quick sgp|popular|game lines|player props|points|rebounds|assists|threes|combos|team props|game props|betting news|view full article|author|more bets)$/i.test(text)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  if (/^[OU]\s*\d+(\.\d+)?$/i.test(text)) return false;
  return true;
}

function looksLikePlayerName(value) {
  const text = normalizeLine(value);
  return /^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}$/.test(text);
}

function isAtMarker(value) {
  return /^(AT|@|vs\.?|v\.?)$/i.test(normalizeLine(value));
}

function isLikelyVsLine(value) {
  const text = normalizeLine(value);
  return /^.+\s+vs\.?\s+.+$/i.test(text);
}

function parseVsLine(value) {
  const text = normalizeLine(value);
  const parts = text.split(/\s+vs\.?\s+/i).map((item) => item.trim()).filter(Boolean);
  if (parts.length !== 2) return { away: "", home: "" };
  return { away: parts[0], home: parts[1] };
}

function isLikelyTimeLine(value) {
  const text = normalizeLine(value);
  return /^(Today|Tomorrow)?\s*•?\s*\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text) || /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text);
}

function isLikelyBroadcastLine(value) {
  const text = normalizeLine(value);
  return /^(Amazon|ESPN|TNT|ABC|NBC|CBS|FOX|ESPN2|NHL Network|NBA TV)$/i.test(text);
}

function isSkippableLine(value) {
  const text = normalizeLine(value);
  return /^Starts In:?$/i.test(text) ||
    /^\d{1,2}:\d{2}:\d{2}$/.test(text) ||
    /\b(today|tomorrow)\b/i.test(text) ||
    /^\d{1,2}:\d{2}\s*(am|pm)$/i.test(text) ||
    isLikelySectionHeader(text);
}

function isLikelySectionHeader(value) {
  const text = normalizeLine(value);
  return /^(all odds|sgp|builder|stats|quick sgp|popular|game lines|player props|points|rebounds|assists|threes|three-pointers|combo stats|defense|shots|goals|player points|player rebounds|player assists|player three-pointers|player shots|player points o\/u|player rebounds o\/u|player assists o\/u|player three-pointers o\/u|points o\/u|rebounds o\/u|assists o\/u|threes o\/u|pts \+ reb \+ ast o\/u|shots on goal o\/u|betting news|first field goal scorer|first player to record an assist|first player to record a rebound|first player to make a three-pointer|player to score 2\+ goals|player to score 3\+ goals|anytime goalscorer|first goalscorer|goalie saves|goals against|goalie shutouts)$/i.test(text);
}

function findLineIndexAfter(lines, startIndex, pattern) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

function findNextSectionIndex(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (isLikelySectionHeader(lines[i]) || isHardStopLine(lines[i])) return i;
  }
  return lines.length;
}

function findNextTeamPair(lines, startIndex) {
  for (let i = startIndex; i < Math.min(lines.length - 2, startIndex + 30); i += 1) {
    if (isLikelyTeamName(lines[i]) && isAtMarker(lines[i + 1]) && isLikelyTeamName(lines[i + 2])) return i;
  }
  return -1;
}

function isHardStopLine(value) {
  return /^(betting news|view full article|author|about|privacy policy|responsible gaming|terms of use|if you or someone you know)/i.test(normalizeLine(value));
}

function parseAmericanOdds(value) {
  const text = normalizeLine(value);
  if (!/^[+-]\d{2,5}$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseSignedNumber(value) {
  const text = normalizeLine(value);
  if (!/^[+-]\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseUnsignedNumber(value) {
  const text = normalizeLine(value);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseTotalToken(value, expectedSide) {
  const text = normalizeLine(value);
  const m = text.match(/^([OU])\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  if (expectedSide && m[1].toUpperCase() !== String(expectedSide).toUpperCase()) return null;
  return Number(m[2]);
}

function parsePlusToken(value) {
  const text = normalizeLine(value);
  const m = text.match(/^(\d+(?:\.\d+)?)\+$/);
  return m ? Number(m[1]) : null;
}

function buildRow({ sport, event, marketType, selection, lineValue, oddsAmerican }) {
  return {
    id: makeId(),
    sportsbook: "BetMGM",
    sport,
    eventLabelRaw: event,
    marketType,
    selectionRaw: selection,
    selectionNormalized: selection,
    lineValue,
    oddsAmerican,
    oddsDecimal: Number.isFinite(oddsAmerican) ? americanToDecimal(oddsAmerican) : null,
    isSharpSource: false,
    isTargetBook: true,
    batchRole: "target",
    confidence: "medium",
    parseWarnings: [],
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.sportsbook, row.sport, row.eventLabelRaw, row.marketType, row.selectionNormalized, row.lineValue ?? "", row.oddsAmerican ?? ""].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
