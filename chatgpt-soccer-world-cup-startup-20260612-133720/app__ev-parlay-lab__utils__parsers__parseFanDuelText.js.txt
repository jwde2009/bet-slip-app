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

  // FanDuel landing/home pages contain multiple sports, promos, futures,
  // parlay-builder sections, and unrelated player/team names.
  // On that shape, only parse the NBA main-line table.
  if (isFanDuelNbaLandingPage(lines)) {
    return dedupeRows(parseFanDuelNbaLandingMainLines(lines));
  }

  const sport = inferSport(lines, context);
  const rows = [];

  const detailEvent = findDetailEvent(lines);
  if (detailEvent) {
    const event = `${detailEvent.away} @ ${detailEvent.home}`;
    rows.push(...parseMainLines(lines, detailEvent.startIndex, event, detailEvent.away, detailEvent.home, sport));

    // Safe visible full-game O/U parser for FanDuel NBA/NHL.
    rows.push(...parseFanDuelVisibleOverUnderBlocks(lines, detailEvent.startIndex, event, sport));
    rows.push(...parseFanDuelDirectOverUnderBlocks(lines, detailEvent.startIndex, event, sport));
    rows.push(...parseFanDuelWnbaNamedOverUnderBlocks(lines, detailEvent.startIndex, event, sport));

    // Scope helper:
    // NBA: main lines + visible O/U player props + double-double/triple-double only.
    // NHL: main lines + goals, points, assists, shots on goal, saves only.
    // Do NOT parse generic ladders here. Ladders created false NBA rows like
    // Player Points 4.5/5+ and false NHL SOG ladder rows.
    // rows.push(...parseFanDuelVisibleLadderSections(lines, detailEvent.startIndex, event, sport));

    // Safe visible NHL extras: goalscorer, points/assists milestones, SOG, saves.
    rows.push(...parseFanDuelNhlVisibleProps(lines, detailEvent.startIndex, event, sport));

    // Keep yes-only binary markets available if a clean section is expanded.
    rows.push(...parseYesOnlyPlayerProps(lines, detailEvent.startIndex, event, sport));

    // Disabled for now. FanDuel alt ladders and period props can create noisy rows.
    // rows.push(...parseOverUnderPlayerProps(lines, detailEvent.startIndex, event, sport));
    // rows.push(...parsePlusLadders(lines, detailEvent.startIndex, event, sport));
  }

  if (rows.length === 0) {
    rows.push(...parseLandingGames(lines, sport));
  }

  return dedupeRows(rows);
}

function isFanDuelNbaLandingPage(lines) {
  const text = (lines || []).join(" ");

  return (
    /\bNBA Odds\b/i.test(text) &&
    /\bSPREAD\b/i.test(text) &&
    /\bMONEY\b/i.test(text) &&
    /\bTOTAL\b/i.test(text) &&
    /\bMore wagers\b/i.test(text) &&
    (
      /\bPopular Same Game Parlay/i.test(text) ||
      /\bNBA Finals Odds\b/i.test(text) ||
      /\bMLB Odds\b/i.test(text) ||
      /\bNHL Odds\b/i.test(text) ||
      /\bEnglish Premier League Odds\b/i.test(text)
    ) &&
    !/\bBasketball\s*\/\s*NBA Odds\s*\/.+?\s+@\s+.+?\s+Odds\s*\//i.test(text)
  );
}

function parseFanDuelNbaLandingMainLines(lines) {
  const rows = [];
  const sport = "NBA";

  const startIndex = findFanDuelNbaLandingMainLinesStart(lines);
  if (startIndex === -1) return rows;

  const endIndex = findFanDuelNbaLandingMainLinesEnd(lines, startIndex);

  for (let i = startIndex; i < Math.min(lines.length - 11, endIndex); i += 1) {
    const away = normalizeLine(lines[i]);
    const home = normalizeLine(lines[i + 1]);

    if (!isLikelyTeamName(away) || !isLikelyTeamName(home)) continue;
    if (away === home) continue;

    const parsed = parseFanDuelMarketBlockFromTeams(lines, i);
    if (!parsed) continue;

    const normalizedAway = normalizeFanDuelLandingTeamName(away);
    const normalizedHome = normalizeFanDuelLandingTeamName(home);
    const event = `${normalizedAway} @ ${normalizedHome}`;

    rows.push(...buildMainRows(event, normalizedAway, normalizedHome, sport, parsed));

    i += 11;
  }

  return rows;
}

function findFanDuelNbaLandingMainLinesStart(lines) {
  for (let i = 0; i < lines.length - 4; i += 1) {
    if (
      /^NBA$/i.test(normalizeLine(lines[i])) &&
      /^SPREAD$/i.test(normalizeLine(lines[i + 1])) &&
      /^MONEY$/i.test(normalizeLine(lines[i + 2])) &&
      /^TOTAL$/i.test(normalizeLine(lines[i + 3]))
    ) {
      return i + 4;
    }
  }

  return -1;
}

function findFanDuelNbaLandingMainLinesEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (
      /^To Score /i.test(line) ||
      /^First Basket/i.test(line) ||
      /^NBA Finals Odds$/i.test(line) ||
      /^2025-26 NBA Finals Winner$/i.test(line) ||
      /^World Series Odds$/i.test(line) ||
      /^MLB Odds$/i.test(line) ||
      /^NHL Odds$/i.test(line) ||
      /^English Premier League Odds$/i.test(line) ||
      /^UEFA Champions League Odds$/i.test(line) ||
      /^NCAAF Odds$/i.test(line) ||
      /^NFL /i.test(line) ||
      /^WNBA Odds$/i.test(line) ||
      /^Live Tennis Odds$/i.test(line) ||
      /^UFC Fight Odds$/i.test(line) ||
      /^Legal Sports Betting Online/i.test(line)
    ) {
      return i;
    }
  }

  return lines.length;
}

function normalizeFanDuelLandingTeamName(value) {
  const text = normalizeLine(value);

  const aliases = new Map([
    ["NY Knicks", "New York Knicks"],
    ["ATL Hawks", "Atlanta Hawks"],
    ["BOS Celtics", "Boston Celtics"],
    ["PHI 76ers", "Philadelphia 76ers"],
    ["DEN Nuggets", "Denver Nuggets"],
    ["MIN Timberwolves", "Minnesota Timberwolves"],
    ["DET Pistons", "Detroit Pistons"],
    ["ORL Magic", "Orlando Magic"],
    ["CLE Cavaliers", "Cleveland Cavaliers"],
    ["TOR Raptors", "Toronto Raptors"],
    ["LA Lakers", "Los Angeles Lakers"],
    ["LAL Lakers", "Los Angeles Lakers"],
    ["HOU Rockets", "Houston Rockets"],
    ["Boston Celtics", "Boston Celtics"],
    ["Philadelphia 76ers", "Philadelphia 76ers"],
    ["Denver Nuggets", "Denver Nuggets"],
    ["Minnesota Timberwolves", "Minnesota Timberwolves"],
    ["Detroit Pistons", "Detroit Pistons"],
    ["Orlando Magic", "Orlando Magic"],
    ["Cleveland Cavaliers", "Cleveland Cavaliers"],
    ["Toronto Raptors", "Toronto Raptors"],
    ["Los Angeles Lakers", "Los Angeles Lakers"],
    ["Houston Rockets", "Houston Rockets"],
  ]);

  return aliases.get(text) || text;
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
      const away = m[1].trim();
      const home = m[2]
        .trim()
        .replace(/\s+(Goals|Shots|Points\/Assists|Goalies|Game Props|Popular|Quick Hits)$/i, "")
        .trim();

      return {
        away,
        home,
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
    {
      headers: [
        "To Record A Double Double",
        "To Record a Double Double",
        "To Record A Double-Double",
        "To Record a Double-Double",
        "Double Double",
        "Double-Double",
      ],
      marketType: "double_double",
    },
    {
      headers: [
        "To Record A Triple Double",
        "To Record a Triple Double",
        "To Record A Triple-Double",
        "To Record a Triple-Double",
        "Triple Double",
        "Triple-Double",
      ],
      marketType: "triple_double",
    },
  ];

  const stopLinePattern =
    /^(Show more|Show less|1st |2nd |3rd |4th |Player |Game Lines|First Basket|First Team Basket Scorer|Alternate |Win Margin|Winning Margin|Total Points Odd \/ Even|First Half Winner \/ Full Time Winner Parlay|Los Angeles Lakers @|Oklahoma City Thunder @|Bet on |Verifying location|ABOUT|Register|All Sports|Promotions|Support|FOLLOW FANDUEL|Back to top|Betslip)$/i;

  for (const section of sections) {
    const { headers, marketType } = section;
    const headerPattern = new RegExp(`^(${headers.map(escapeRegExp).join("|")})$`, "i");

    for (let idx = Math.max(0, startIndex); idx < lines.length - 1; idx += 1) {
      if (!headerPattern.test(lines[idx])) continue;

      let i = idx + 1;

      while (i < lines.length - 1) {
        const text = normalizeLine(lines[i]);

        // Stop when the next market starts. This lets us skip empty collapsed sections
        // and continue scanning for a later expanded section with actual player rows.
        if (stopLinePattern.test(text)) {
          break;
        }

        // If we hit another yes-only header, let the outer loop handle it.
        if (headerPattern.test(text)) {
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
function parseFanDuelVisibleOverUnderBlocks(lines, startIndex, event, sport) {
  const rows = [];

  const marketMap = new Map([
    ["player points", "player_points"],
    ["player rebounds", "player_rebounds"],
    ["player assists", "player_assists"],
    ["player made threes", "player_threes"],
    ["player threes", "player_threes"],
    ["player pts + reb + ast", "player_pra"],
    ["player points + rebounds + assists", "player_pra"],
    ["player pts + reb", "player_points_rebounds"],
    ["player points + rebounds", "player_points_rebounds"],
    ["player pts + ast", "player_points_assists"],
    ["player points + assists", "player_points_assists"],
    ["player reb + ast", "player_rebounds_assists"],
    ["player rebounds + assists", "player_rebounds_assists"],
  ]);

  for (let i = Math.max(0, startIndex); i < lines.length - 5; i += 1) {
    const header = normalizeLine(lines[i]);
    const marketType = marketMap.get(header.toLowerCase());

    if (!marketType) continue;
    if (isFanDuelPartialGameHeader(header)) continue;

    const end = findFanDuelVisibleSectionEnd(lines, i + 1);

    for (let j = i + 1; j < end - 4; j += 1) {
      const player = normalizeLine(lines[j]);

      if (/^(OVER|UNDER)$/i.test(player)) continue;
      if (/^Show less$/i.test(player)) continue;
      if (!looksLikePlayerName(player)) continue;

      const overLine = parseTotalToken(lines[j + 1], "O");
      const overOdds = parseAmericanOdds(lines[j + 2]);
      const underLine = parseTotalToken(lines[j + 3], "U");
      const underOdds = parseAmericanOdds(lines[j + 4]);

      if (
        overLine === null ||
        underLine === null ||
        Math.abs(overLine - underLine) > 0.0001 ||
        overOdds === null ||
        underOdds === null
      ) {
        continue;
      }

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

      j += 4;
    }
  }

  return rows;
}

function parseFanDuelDirectOverUnderBlocks(lines, startIndex, event, sport) {
  const rows = [];

  const sections = [
    ["Player Points", "player_points"],
    ["Player Rebounds", "player_rebounds"],
    ["Player Assists", "player_assists"],
    ["Player Made Threes", "player_threes"],
    ["Player Threes", "player_threes"],
    ["Player Pts + Reb + Ast", "player_pra"],
    ["Player Points + Rebounds + Assists", "player_pra"],
    ["Player Pts + Reb", "player_points_rebounds"],
    ["Player Points + Rebounds", "player_points_rebounds"],
    ["Player Pts + Ast", "player_points_assists"],
    ["Player Points + Assists", "player_points_assists"],
    ["Player Reb + Ast", "player_rebounds_assists"],
    ["Player Rebounds + Assists", "player_rebounds_assists"],
  ];

  for (let i = Math.max(0, startIndex); i < lines.length - 7; i += 1) {
    const header = normalizeLine(lines[i]);
    const found = sections.find(([label]) => normalizeLine(label).toLowerCase() === header.toLowerCase());

    if (!found) continue;

    const marketType = found[1];

    // Require the actual O/U table shape. This avoids matching the top nav tab.
    if (!/^OVER$/i.test(normalizeLine(lines[i + 1]))) continue;
    if (!/^UNDER$/i.test(normalizeLine(lines[i + 2]))) continue;

    let j = i + 3;

    while (j < lines.length - 4) {
      const token = normalizeLine(lines[j]);

      if (isFanDuelDirectOverUnderStopLine(token)) break;

      if (!looksLikePlayerName(token)) {
        j += 1;
        continue;
      }

      const player = token;
      const overLine = parseTotalToken(lines[j + 1], "O");
      const overOdds = parseAmericanOdds(lines[j + 2]);
      const underLine = parseTotalToken(lines[j + 3], "U");
      const underOdds = parseAmericanOdds(lines[j + 4]);

      if (
        overLine === null ||
        underLine === null ||
        Math.abs(overLine - underLine) > 0.0001 ||
        overOdds === null ||
        underOdds === null
      ) {
        j += 1;
        continue;
      }

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

      j += 5;
    }
  }

  return rows;
}

function isFanDuelDirectOverUnderStopLine(value) {
  const text = normalizeLine(value);

  if (!text) return false;
  if (/^Show less$/i.test(text)) return true;
  if (/^Show more$/i.test(text)) return true;

  return (
    /^Player Points$/i.test(text) ||
    /^Player Rebounds$/i.test(text) ||
    /^Player Assists$/i.test(text) ||
    /^Player Made Threes$/i.test(text) ||
    /^Player Threes$/i.test(text) ||
    /^Player Pts \+ Reb \+ Ast$/i.test(text) ||
    /^Player Points \+ Rebounds \+ Assists$/i.test(text) ||
    /^Player Pts \+ Reb$/i.test(text) ||
    /^Player Points \+ Rebounds$/i.test(text) ||
    /^Player Pts \+ Ast$/i.test(text) ||
    /^Player Points \+ Assists$/i.test(text) ||
    /^Player Reb \+ Ast$/i.test(text) ||
    /^Player Rebounds \+ Assists$/i.test(text) ||
    /^To Score \d+(?:\.\d+)?\+ Points$/i.test(text) ||
    /^\d+(?:\.\d+)?\+ Made Threes$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Rebounds$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Assists$/i.test(text) ||
    /^To Record /i.test(text) ||
    /^.+ @ .+ Odds$/i.test(text) ||
    /^Bet on .+ odds/i.test(text) ||
    /^Verifying location/i.test(text) ||
    /^ABOUT$/i.test(text) ||
    /^Back to top$/i.test(text) ||
    /^Betslip/i.test(text) ||
    isHardStopLine(text)
  );
}

function parseFanDuelVisibleLadderSections(lines, startIndex, event, sport) {
  const rows = [];

  for (let i = Math.max(0, startIndex); i < lines.length - 2; i += 1) {
    const header = normalizeLine(lines[i]);
    const parsed = parseFanDuelVisibleLadderHeader(header);

    if (!parsed) continue;
    if (isFanDuelPartialGameHeader(header)) continue;

    const end = findFanDuelVisibleSectionEnd(lines, i + 1);

    for (let j = i + 1; j < end - 1; j += 1) {
      const player = normalizeLine(lines[j]);
      const odds = parseAmericanOdds(lines[j + 1]);

      if (/^Show less$/i.test(player)) continue;
      if (/^Tap a player/i.test(player)) continue;
      if (!looksLikePlayerName(player) || odds === null) continue;

      rows.push(
        buildRow({
          sport,
          event,
          marketType: parsed.marketType,
          selection: `${player} Over`,
          lineValue: parsed.lineValue,
          oddsAmerican: odds,
        })
      );

      j += 1;
    }
  }

  return rows;
}

function parseFanDuelVisibleLadderHeader(header) {
  const text = normalizeLine(header);

  let m = text.match(/^To Score (\d+(?:\.\d+)?)\+ Points$/i);
  if (m) {
    return {
      marketType: "player_points",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^(\d+(?:\.\d+)?)\+ Made Threes$/i);
  if (m) {
    return {
      marketType: "player_threes",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^To Record (\d+(?:\.\d+)?)\+ Rebounds$/i);
  if (m) {
    return {
      marketType: "player_rebounds",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^To Record (\d+(?:\.\d+)?)\+ Assists$/i);
  if (m) {
    return {
      marketType: "player_assists",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^To Record (\d+(?:\.\d+)?)\+ Pts \+ Reb \+ Ast$/i);
  if (m) {
    return {
      marketType: "player_pra",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^To Record (\d+(?:\.\d+)?)\+ Pts \+ Reb$/i);
  if (m) {
    return {
      marketType: "player_points_rebounds",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^To Record (\d+(?:\.\d+)?)\+ Pts \+ Ast$/i);
  if (m) {
    return {
      marketType: "player_points_assists",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  m = text.match(/^To Record (\d+(?:\.\d+)?)\+ Reb \+ Ast$/i);
  if (m) {
    return {
      marketType: "player_rebounds_assists",
      lineValue: Number(m[1]) - 0.5,
    };
  }

  return null;
}

function parseFanDuelWnbaNamedOverUnderBlocks(lines, startIndex, event, sport) {
  const rows = [];
  const sportKey = String(sport || "").toUpperCase();
  const pageText = lines.slice(0, 240).join(" ");

  const looksLikeWnba =
    sportKey === "WNBA" ||
    /\bWNBA Odds\b/i.test(pageText) ||
    /\b(Liberty|Mercury|Fever|Valkyries|Dream|Lynx|Aces|Wings|Sky|Sun|Storm|Mystics|Sparks)\b/i.test(pageText);

  if (!looksLikeWnba) return rows;

  const marketSuffixMap = new Map([
    ["points", "player_points"],
    ["rebounds", "player_rebounds"],
    ["assists", "player_assists"],
    ["threes", "player_threes"],
    ["made threes", "player_threes"],
    ["pts + reb + ast", "player_pra"],
    ["points + rebounds + assists", "player_pra"],
    ["pts + reb", "player_points_rebounds"],
    ["points + rebounds", "player_points_rebounds"],
    ["pts + ast", "player_points_assists"],
    ["points + assists", "player_points_assists"],
    ["reb + ast", "player_rebounds_assists"],
    ["rebounds + assists", "player_rebounds_assists"],
  ]);

  for (let i = Math.max(0, startIndex); i < lines.length - 6; i += 1) {
    const header = normalizeLine(lines[i]);
    const headerMatch = header.match(/^(.+?)\s+-\s+(.+)$/);

    if (!headerMatch) continue;

    const player = normalizeLine(headerMatch[1]);
    const suffix = normalizeLine(headerMatch[2]).toLowerCase();
    const marketType = marketSuffixMap.get(suffix);

    if (!marketType) continue;
    if (!looksLikePlayerName(player)) continue;
    if (/\b(1st|2nd|3rd|4th)\s+qtr\b/i.test(header)) continue;

    const overLabel = normalizeLine(lines[i + 1]);
    const overLine = parseTotalToken(lines[i + 2], "O");
    const overOdds = parseAmericanOdds(lines[i + 3]);
    const underLabel = normalizeLine(lines[i + 4]);
    const underLine = parseTotalToken(lines[i + 5], "U");
    const underOdds = parseAmericanOdds(lines[i + 6]);

    if (
      !new RegExp(`^${escapeRegExp(player)}\\s+Over$`, "i").test(overLabel) ||
      !new RegExp(`^${escapeRegExp(player)}\\s+Under$`, "i").test(underLabel) ||
      overLine === null ||
      underLine === null ||
      Math.abs(overLine - underLine) > 0.0001 ||
      overOdds === null ||
      underOdds === null
    ) {
      continue;
    }

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

    i += 6;
  }

  return rows;
}


function parseFanDuelNhlVisibleProps(lines, startIndex, event, sport) {
  const rows = [];
  const text = lines.slice(0, 260).join(" ");

  const looksLikeNhl =
    String(sport || "").toUpperCase() === "NHL" ||
    /\bHockey\b/i.test(text) ||
    /\bNHL Odds\b/i.test(text) ||
    /\bShots on Goal\b/i.test(text) ||
    /\bAny Time Goal Scorer\b/i.test(text) ||
    /\bTotal Saves\b/i.test(text) ||
    /\bPowerplay Points\b/i.test(text) ||
    /\bBlocked Shots\b/i.test(text) ||
    /(canadiens|lightning|bruins|sabres|penguins|flyers|oilers|ducks|stars|wild|avalanche|kings|rangers|islanders|devils|panthers|maple leafs|jets|canucks|kraken|senators|hurricanes|golden knights|mammoth)/i.test(text);

  if (!looksLikeNhl) return rows;

  const resolvedSport = "NHL";

  rows.push(...parseFanDuelNhlAnytimeGoalScorer(lines, startIndex, event, resolvedSport));
  rows.push(...parseFanDuelNhlMilestoneSections(lines, startIndex, event, resolvedSport));
  rows.push(...parseFanDuelNhlOverUnderSections(lines, startIndex, event, resolvedSport));

  // Do not parse alt-save ladders. Full-game saves should come from:
  // 60 Min Player Name Total Saves -> Player - Over / Player - Under.
  // rows.push(...parseFanDuelNhlAltSavesSections(lines, startIndex, event, resolvedSport));

  return rows;
}

function parseFanDuelNhlAnytimeGoalScorer(lines, startIndex, event, sport) {
  const rows = [];
  const headerPattern = /^(Any Time Goal Scorer|Anytime Goal Scorer)$/i;

  // Scan every occurrence. Multi-pass FanDuel raw can include:
  // - collapsed game-page copies with no player odds
  // - Goals-page copies with player odds
  // - either "Player" then "+135" on the next line, or "Player +135" on one line
  for (let idx = Math.max(0, startIndex); idx < lines.length; idx += 1) {
    if (!headerPattern.test(normalizeLine(lines[idx]))) continue;

    const end = findFanDuelVisibleSectionEnd(lines, idx + 1);

    for (let i = idx + 1; i < end; i += 1) {
      const line = normalizeLine(lines[i]);

      if (
        !line ||
        /^(Show more|Show less)$/i.test(line) ||
        /^Tap a player name/i.test(line) ||
        /^Settled inclusive/i.test(line) ||
        /^Game Specials/i.test(line) ||
        /^First/i.test(line) ||
        /^Player to Score/i.test(line) ||
        /^Any Time Goal Scorer/i.test(line) ||
        /^Anytime Goal Scorer/i.test(line) ||
        /^Game to Reach/i.test(line) ||
        /^Will There/i.test(line)
      ) {
        continue;
      }

      const combined = line.match(/^(.+?)\s+([+-]\d{2,5})$/);

      if (combined) {
        const player = normalizeLine(combined[1]);
        const odds = parseAmericanOdds(combined[2]);

        if (!looksLikePlayerName(player) || odds === null) continue;

        rows.push(
          buildRow({
            sport,
            event,
            marketType: "player_goals",
            selection: `${player} Over`,
            lineValue: 0.5,
            oddsAmerican: odds,
          })
        );

        continue;
      }

      const player = line;
      const odds = parseAmericanOdds(lines[i + 1]);

      if (!looksLikePlayerName(player) || odds === null) continue;

      rows.push(
        buildRow({
          sport,
          event,
          marketType: "player_goals",
          selection: `${player} Over`,
          lineValue: 0.5,
          oddsAmerican: odds,
        })
      );

      i += 1;
    }
  }

  return rows;
}

function parseFanDuelNhlMilestoneSections(lines, startIndex, event, sport) {
  const rows = [];

  for (let i = Math.max(0, startIndex); i < lines.length - 2; i += 1) {
    const header = normalizeLine(lines[i]);
    const parsed = parseFanDuelNhlMilestoneHeader(header);

    if (!parsed) continue;
    if (isFanDuelPartialGameHeader(header)) continue;

    const end = findFanDuelVisibleSectionEnd(lines, i + 1);

    for (let j = i + 1; j < end - 1; j += 1) {
      const player = normalizeLine(lines[j]);
      const odds = parseAmericanOdds(lines[j + 1]);

      if (!looksLikePlayerName(player) || odds === null) continue;

      rows.push(
        buildRow({
          sport,
          event,
          marketType: parsed.marketType,
          selection: `${player} Over`,
          lineValue: parsed.lineValue,
          oddsAmerican: odds,
        })
      );

      j += 1;
    }
  }

  return rows;
}

function parseFanDuelNhlMilestoneHeader(header) {
  const text = normalizeLine(header);

  // Do NOT parse 60 Min 1+/2+/3+ Shots on Goal here.
  // Those are ladders. NHL shots on goal should come from the player O/U drawers:
  // 60 Min Player Name Shots on Goal -> Player - Over / Player - Under.

  let m =
    text.match(/^Player (\d+)\+ Points$/i) ||
    text.match(/^(\d+)\+ Points$/i);

  if (m) {
    const threshold = Number(m[1]);

    // Keep only 1+ points.
    if (threshold !== 1) return null;

    return {
      marketType: "player_points",
      lineValue: threshold - 0.5,
    };
  }

  m =
    text.match(/^Player (\d+)\+ Assists$/i) ||
    text.match(/^(\d+)\+ Assists$/i);

  if (m) {
    const threshold = Number(m[1]);

    // Keep only 1+ assists.
    if (threshold !== 1) return null;

    return {
      marketType: "player_assists",
      lineValue: threshold - 0.5,
    };
  }

  // Do not parse 2+/3+ goals, powerplay points, blocked shots, or SOG ladders.
  return null;
}


function parseFanDuelNhlOverUnderSections(lines, startIndex, event, sport) {
  const rows = [];

  for (let i = Math.max(0, startIndex); i < lines.length - 6; i += 1) {
    const header = normalizeLine(lines[i]);
    const parsed = parseFanDuelNhlOverUnderHeader(header);

    if (!parsed) continue;
    if (isFanDuelPartialGameHeader(header)) continue;

    let overIndex = -1;
    let underIndex = -1;

    for (let j = i + 1; j < Math.min(lines.length, i + 18); j += 1) {
      const token = normalizeLine(lines[j]);

      if (isFanDuelVisibleSectionBoundary(token) && j > i + 1) break;

      if (
        overIndex === -1 &&
        new RegExp(`^${escapeRegExp(parsed.player)}\\s+-\\s+Over$`, "i").test(token)
      ) {
        overIndex = j;
        continue;
      }

      if (
        underIndex === -1 &&
        new RegExp(`^${escapeRegExp(parsed.player)}\\s+-\\s+Under$`, "i").test(token)
      ) {
        underIndex = j;
        continue;
      }
    }

    if (overIndex === -1 || underIndex === -1) continue;

    const overLine = parseTotalToken(lines[overIndex + 1], "O");
    const overOdds = parseAmericanOdds(lines[overIndex + 2]);
    const underLine = parseTotalToken(lines[underIndex + 1], "U");
    const underOdds = parseAmericanOdds(lines[underIndex + 2]);

    if (
      overLine === null ||
      underLine === null ||
      Math.abs(overLine - underLine) > 0.0001 ||
      overOdds === null ||
      underOdds === null
    ) {
      continue;
    }

    rows.push(
      buildRow({
        sport,
        event,
        marketType: parsed.marketType,
        selection: `${parsed.player} Over`,
        lineValue: overLine,
        oddsAmerican: overOdds,
      })
    );

    rows.push(
      buildRow({
        sport,
        event,
        marketType: parsed.marketType,
        selection: `${parsed.player} Under`,
        lineValue: underLine,
        oddsAmerican: underOdds,
      })
    );

    i = Math.max(i, underIndex + 2);
  }

  return rows;
}

function parseFanDuelNhlAltSavesSections(lines, startIndex, event, sport) {
  const rows = [];

  for (let i = Math.max(0, startIndex); i < lines.length - 2; i += 1) {
    const header = normalizeLine(lines[i]);
    const m = header.match(/^(.+?)\s+-\s+60 Min Alt Saves$/i);

    if (!m) continue;

    const playerFromHeader = m[1].trim();
    if (!looksLikePlayerName(playerFromHeader)) continue;

    const end = findFanDuelVisibleSectionEnd(lines, i + 1);

    for (let j = i + 1; j < end - 1; j += 1) {
      const line = normalizeLine(lines[j]);
      const rowMatch = line.match(/^(.+?)\s+-\s+(\d+(?:\.\d+)?)\+$/i);

      if (!rowMatch) continue;

      const player = rowMatch[1].trim();
      const threshold = Number(rowMatch[2]);
      const odds = parseAmericanOdds(lines[j + 1]);

      if (
        !looksLikePlayerName(player) ||
        player.toLowerCase() !== playerFromHeader.toLowerCase() ||
        !Number.isFinite(threshold) ||
        odds === null
      ) {
        continue;
      }

      rows.push(
        buildRow({
          sport,
          event,
          marketType: "player_saves",
          selection: `${player} Over`,
          lineValue: threshold - 0.5,
          oddsAmerican: odds,
        })
      );

      j += 1;
    }
  }

  return rows;
}

function parseFanDuelNhlOverUnderHeader(header) {
  const text = normalizeLine(header);

  let m = text.match(/^60 Min (.+?) Shots on Goal$/i);
  if (m && looksLikePlayerName(m[1])) {
    return { player: m[1].trim(), marketType: "player_shots_on_goal" };
  }

  m = text.match(/^60 Min (.+?) Total Saves$/i);
  if (m && looksLikePlayerName(m[1])) {
    return { player: m[1].trim(), marketType: "player_saves" };
  }

  m = text.match(/^60 Min (.+?) Total Goals$/i);
  if (m && looksLikePlayerName(m[1])) {
    return { player: m[1].trim(), marketType: "player_goals" };
  }

  m = text.match(/^(.+?) Total Goals$/i);
  if (m && looksLikePlayerName(m[1])) {
    return { player: m[1].trim(), marketType: "player_goals" };
  }

  return null;
}

function findFanDuelVisibleSectionEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (isFanDuelVisibleSectionBoundary(line)) return i;
  }

  return lines.length;
}

function isFanDuelPartialGameHeader(value) {
  const text = normalizeLine(value);

  return (
    /^(1st|2nd|3rd|4th)\s+(Quarter|Period)\b/i.test(text) ||
    /\b(1st|2nd|3rd|4th)\s+(Quarter|Period)\b/i.test(text) ||
    /\b(1st|2nd)\s+Half\b/i.test(text) ||
    /^Overtime\b/i.test(text)
  );
}

function isFanDuelVisibleSectionBoundary(value) {
  const text = normalizeLine(value);

  if (!text) return false;
  if (/^Show less$/i.test(text)) return false;
  if (/^(OVER|UNDER)$/i.test(text)) return false;

  return (
    isHardStopLine(text) ||
    /^Bet on .+ Odds/i.test(text) ||
    /^Verifying location/i.test(text) ||
    /^ABOUT$/i.test(text) ||
    /^Back to top$/i.test(text) ||
    /^Betslip/i.test(text) ||
    /^Same Game Parlay/i.test(text) ||
    /^Popular$/i.test(text) ||
    /^Quick Bets$/i.test(text) ||
    /^Quick Hits$/i.test(text) ||
    /^Period Player Props$/i.test(text) ||
    /^Goals$/i.test(text) ||
    /^Shots$/i.test(text) ||
    /^Points\/Assists$/i.test(text) ||
    /^Goalies$/i.test(text) ||
    /^Game Props$/i.test(text) ||
    /^Player Points$/i.test(text) ||
    /^Player Made Threes$/i.test(text) ||
    /^Player Rebounds$/i.test(text) ||
    /^Player Assists$/i.test(text) ||
    /^Player Pts \+ Reb \+ Ast$/i.test(text) ||
    /^Player Pts \+ Reb$/i.test(text) ||
    /^Player Pts \+ Ast$/i.test(text) ||
    /^Player Reb \+ Ast$/i.test(text) ||
    /^To Record A Double Double$/i.test(text) ||
    /^To Record A Triple Double$/i.test(text) ||
    /^To Score \d+(?:\.\d+)?\+ Points$/i.test(text) ||
    /^\d+(?:\.\d+)?\+ Made Threes$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Rebounds$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Assists$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Pts \+ Reb \+ Ast$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Pts \+ Reb$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Pts \+ Ast$/i.test(text) ||
    /^To Record \d+(?:\.\d+)?\+ Reb \+ Ast$/i.test(text) ||
    /^(Any Time Goal Scorer|Anytime Goal Scorer)$/i.test(text) ||
    /^\d+\+ Points$/i.test(text) ||
    /^\d+\+ Assists$/i.test(text) ||
    /^Player \d+\+ Points$/i.test(text) ||
    /^Player \d+\+ Assists$/i.test(text) ||
    /^Player \d+\+ Point Each Period/i.test(text) ||
    /^Player to Record \d+\+ Powerplay Points$/i.test(text) ||
    /^Player to Record \d+\+ Blocked Shots$/i.test(text) ||
    /^Player to Score \d+\+ Goals$/i.test(text) ||
    /^First Goal Scorer$/i.test(text) ||
    /^First Home Team Goal Scorer$/i.test(text) ||
    /^First Away Team Goal Scorer$/i.test(text) ||
    /^Second Goal Scorer$/i.test(text) ||
    /^Third Goal Scorer$/i.test(text) ||
    /^Any Time Goal Scorer \/ Team to Win Parlay$/i.test(text) ||
    /^First Basket$/i.test(text) ||
    /^First Team Basket Scorer$/i.test(text) ||
    /^Alternate /i.test(text) ||
    /^.+ Alt Total Goals$/i.test(text) ||
    /^.+ - Alt /i.test(text) ||
    /^Win Margin/i.test(text) ||
    /^Winning Margin/i.test(text) ||
    /^Total Points Odd \/ Even$/i.test(text) ||
    /^60 Min Player to Record \d+\+ Shots on Goal$/i.test(text) ||
    /^60 Min \d+\+ Shots on Goal$/i.test(text) ||
    /^60 Min .+ Shots on Goal$/i.test(text) ||
    /^60 Min .+ Total Saves$/i.test(text) ||
    /^60 Min .+ Total Goals$/i.test(text) ||
    /^.+ - 60 Min Alt Saves$/i.test(text) ||
    isFanDuelPartialGameHeader(text)
  );
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

  const normalizedLines = (lines || []).map((line) => normalizeLine(line));
  const text = normalizedLines.slice(0, 320).join(" ");

  function hasBreadcrumbSport(sportLabel, oddsLabel) {
    for (let i = 0; i < normalizedLines.length; i += 1) {
      if (!new RegExp(`^${sportLabel}$`, "i").test(normalizedLines[i])) continue;

      const nearby = normalizedLines.slice(i, i + 12).join(" ");
      if (new RegExp(`\\b${oddsLabel}\\b`, "i").test(nearby)) {
        return true;
      }
    }

    return false;
  }

  // FanDuel pages include sidebar league names like NBA / WNBA / NHL / MLB.
  // Breadcrumbs are more reliable than sidebar words.
  if (hasBreadcrumbSport("Basketball", "WNBA Odds")) return "WNBA";
  if (hasBreadcrumbSport("Basketball", "NBA Odds")) return "NBA";
  if (hasBreadcrumbSport("Hockey", "NHL Odds")) return "NHL";
  if (hasBreadcrumbSport("Baseball", "MLB Odds")) return "MLB";

  // WNBA page/event/team clues.
  if (
    /\bWNBA Odds\b/i.test(text) ||
    /\bWomen's Basketball\b/i.test(text) ||
    /(dream|chicago sky|connecticut sun|dallas wings|golden state valkyries|valkyries|indiana fever|las vegas aces|los angeles sparks|minnesota lynx|new york liberty|phoenix mercury|portland fire|seattle storm|toronto tempo|washington mystics)/i.test(text)
  ) {
    return "WNBA";
  }

  // NBA page/event/team clues.
  if (
    /\bDenver Nuggets @ Minnesota Timberwolves\b/i.test(text) ||
    /\bHouston Rockets @ Los Angeles Lakers\b/i.test(text) ||
    /\bNew York Knicks @ Atlanta Hawks\b/i.test(text) ||
    /\bOrlando Magic @ Detroit Pistons\b/i.test(text) ||
    /\bToronto Raptors @ Cleveland Cavaliers\b/i.test(text) ||
    /\bBoston Celtics @ Philadelphia 76ers\b/i.test(text) ||
    /\bPlayer Points\b/i.test(text) ||
    /\bPlayer Rebounds\b/i.test(text) ||
    /\bPlayer Assists\b/i.test(text) ||
    /\bPlayer Made Threes\b/i.test(text) ||
    /\bPlayer Pts \+ Reb \+ Ast\b/i.test(text) ||
    /(76ers|celtics|knicks|hawks|lakers|warriors|suns|raptors|cavaliers|pistons|spurs|rockets|nuggets|timberwolves|magic|hornets|trail blazers|thunder|mavericks|clippers|grizzlies|bucks|heat|pacers|bulls|wizards|nets|jazz|pelicans)/i.test(text)
  ) {
    return "NBA";
  }

  // NHL page/event/team clues.
  if (
    /\bShots on Goal\b/i.test(text) ||
    /\bGoalies\b/i.test(text) ||
    /\bAny Time Goal Scorer\b/i.test(text) ||
    /\bTotal Saves\b/i.test(text) ||
    /\bPowerplay Points\b/i.test(text) ||
    /\bBlocked Shots\b/i.test(text) ||
    /(canadiens|lightning|bruins|sabres|penguins|flyers|oilers|ducks|stars|wild|avalanche|kings|rangers|islanders|devils|panthers|maple leafs|jets|canucks|kraken|senators|hurricanes|golden knights|mammoth|utah|vgk)/i.test(text)
  ) {
    return "NHL";
  }

  if (/\bBaseball\b/i.test(text) || /\bMLB Odds\b/i.test(text) || /\bHome Runs\b/i.test(text)) {
    return "MLB";
  }

  if (/\bNBA Odds\b/i.test(text)) return "NBA";
  if (/\bNHL Odds\b/i.test(text)) return "NHL";
  if (/\bMLB Odds\b/i.test(text)) return "MLB";

  return "UNKNOWN";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/âˆ’|\u2212|Ã¢Ë†â€™/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    // FanDuel sometimes appends team abbreviations to player names:
    // Sebastian Aho (CAR), Connor McDavid (EDM), etc.
    // Strip only trailing all-caps team codes so player-name checks and
    // canonical matching still use the clean player name.
    .replace(/\s+\([A-Z]{2,4}\)$/g, "")
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