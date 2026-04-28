import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `fd_row_${nextId++}`;
}

export function parseFanDuelText(rawText = "", context = {}) {
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
    rows.push(...parseYesOnlyPlayerProps(lines, detailEvent.startIndex, event, sport));
    rows.push(...parsePlusLadders(lines, detailEvent.startIndex, event, sport));
  }

  if (rows.length === 0) {
    rows.push(...parseLandingGames(lines, sport));
  }

  return dedupeRows(rows);
}

function parseLandingGames(lines, sport) {
  const rows = [];

  for (let i = 0; i < lines.length - 11; i += 1) {
    const away = lines[i];
    const home = lines[i + 1];

    if (!isLikelyTeamName(away) || !isLikelyTeamName(home)) continue;
    if (away === home) continue;

    const parsed = parseFanDuelMarketBlockFromTeams(lines, i);
    if (!parsed) continue;

    const event = `${away} @ ${home}`;
    rows.push(...buildMainRows(event, away, home, sport, parsed));
    i += 8;
  }

  return rows;
}function parseFanDuelMarketBlockFromTeams(lines, teamStartIndex) {
  const spreadA = parseSignedNumber(lines[teamStartIndex + 2]);
  const spreadAOdds = parseAmericanOdds(lines[teamStartIndex + 3]);
  const moneylineA = parseAmericanOdds(lines[teamStartIndex + 4]);
  const totalOver = parseTotalToken(lines[teamStartIndex + 5], "O");
  const totalOverOdds = parseAmericanOdds(lines[teamStartIndex + 6]);

  const spreadB = parseSignedNumber(lines[teamStartIndex + 7]);
  const spreadBOdds = parseAmericanOdds(lines[teamStartIndex + 8]);
  const moneylineB = parseAmericanOdds(lines[teamStartIndex + 9]);
  const totalUnder = parseTotalToken(lines[teamStartIndex + 10], "U");
  const totalUnderOdds = parseAmericanOdds(lines[teamStartIndex + 11]);

  if (
    spreadA === null || spreadAOdds === null ||
    moneylineA === null ||
    totalOver === null || totalOverOdds === null ||
    spreadB === null || spreadBOdds === null ||
    moneylineB === null ||
    totalUnder === null || totalUnderOdds === null ||
    totalOver !== totalUnder
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

function findDetailEvent(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    const m = line.match(/^(.+?)\s+@\s+(.+?)\s+Odds$/i);
    if (m) {
      return {
        away: m[1].trim(),
        home: m[2].trim(),
        startIndex: i + 1,
      };
    }
  }

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

  return null;
}

function parseMainLines(lines, startIndex, event, away, home, sport) {
  const gameLinesIdx = findLineIndexAfter(lines, startIndex, /^Game Lines$/i);
  if (gameLinesIdx === -1) return [];

  for (let i = gameLinesIdx; i < Math.min(lines.length - 11, gameLinesIdx + 30); i += 1) {
    if (
      normalizeLine(lines[i]) === normalizeLine(away) &&
      normalizeLine(lines[i + 1]) === normalizeLine(home)
    ) {
      const parsed = parseFanDuelMarketBlockFromTeams(lines, i);
      if (!parsed) return [];
      return buildMainRows(event, away, home, sport, parsed);
    }
  }

  return [];
}

function parseMainBlock(block) {
  const working = block.filter((line) => !isSkippableLine(line));

  const atIdx = working.findIndex((line) => isAtMarker(line));
  if (atIdx === -1 || atIdx + 10 >= working.length) return null;

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
    ["Player Points", "player_points"],
    ["Player Rebounds", "player_rebounds"],
    ["Player Assists", "player_assists"],
    ["Player Made Threes", "player_threes"],
    ["Player Pts + Reb + Ast", "player_pra"],
    ["Player Pts + Reb", "player_points_rebounds"],
    ["Player Pts + Ast", "player_points_assists"],
    ["Player Reb + Ast", "player_rebounds_assists"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findLineIndexAfter(
      lines,
      startIndex,
      new RegExp(`^${escapeRegExp(header)}$`, "i")
    );
    if (idx === -1) continue;

    const end = findNextSectionIndex(lines, idx + 1);
    let i = idx + 1;

    while (i < end - 4) {
      const player = lines[i];
      if (!looksLikePlayerName(player)) {
        i += 1;
        continue;
      }

      const overLine = parseTotalToken(lines[i + 1], "O");
      const overOdds = parseAmericanOdds(lines[i + 2]);
      const underLine = parseTotalToken(lines[i + 3], "U");
      const underOdds = parseAmericanOdds(lines[i + 4]);

      if (
        overLine !== null &&
        underLine !== null &&
        overLine === underLine &&
        overOdds !== null &&
        underOdds !== null
      ) {
        rows.push(
          buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Over`,
            lineValue: overLine,
            oddsAmerican: overOdds,
          })
        );

        rows.push(
          buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Under`,
            lineValue: underLine,
            oddsAmerican: underOdds,
          })
        );

        i += 5;
        continue;
      }

      i += 1;
    }
  }

  return rows;
}

function parseYesOnlyPlayerProps(lines, startIndex, event, sport) {
  const rows = [];

  const sections = [
    ["To Record A Double Double", "double_double"],
    ["To Record A Triple Double", "triple_double"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findLineIndexAfter(
      lines,
      startIndex,
      new RegExp(`^${escapeRegExp(header)}$`, "i")
    );
    if (idx === -1) continue;

    let i = idx + 1;

    while (i < lines.length - 1) {
      const text = normalizeLine(lines[i]);

      if (
        /^Show more$/i.test(text) ||
        /^1st /i.test(text) ||
        /^2nd /i.test(text) ||
        /^3rd /i.test(text) ||
        /^4th /i.test(text) ||
        /^Player /i.test(text) ||
        /^Game Lines$/i.test(text) ||
        /^First Basket$/i.test(text) ||
        /^First Team Basket Scorer$/i.test(text) ||
        /^Alternate /i.test(text) ||
        /^Win Margin$/i.test(text) ||
        /^Winning Margin/i.test(text) ||
        /^Total Points Odd \/ Even$/i.test(text) ||
        /^First Half Winner \/ Full Time Winner Parlay$/i.test(text)
      ) {
        break;
      }

      const player = lines[i];

      if (
        !looksLikePlayerName(player) ||
        /\b(tie|over|under)\b/i.test(player)
      ) {
        i += 1;
        continue;
      }

      const yesOdds = parseAmericanOdds(lines[i + 1]);

      if (yesOdds !== null) {
        rows.push(
          buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Yes`,
            lineValue: null,
            oddsAmerican: yesOdds,
          })
        );

        i += 2;
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
  ["Player Points", "player_points"],
  ["Player Rebounds", "player_rebounds"],
  ["Player Assists", "player_assists"],
  ["Player Made Threes", "player_threes"],
  ["Player Pts + Reb + Ast", "player_pra"],
  ["Player Pts + Reb", "player_points_rebounds"],
  ["Player Pts + Ast", "player_points_assists"],
  ["Player Reb + Ast", "player_rebounds_assists"],
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

  if (/(76ers|celtics|knicks|hawks|lakers|warriors|suns|raptors|cavaliers|pistons|spurs|rockets|nuggets|timberwolves)/i.test(text)) {
    return "NBA";
  }
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
  return /^(all odds|sgp|builder|stats|quick sgp|popular|game lines|player props|points|rebounds|assists|threes|combos|shots|goals|player points|player rebounds|player assists|player made threes|player pts \+ reb \+ ast|player pts \+ reb|player pts \+ ast|player reb \+ ast|to record a double double|to record a triple double|betting news)$/i.test(text);
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
    sportsbook: "FanDuel",
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