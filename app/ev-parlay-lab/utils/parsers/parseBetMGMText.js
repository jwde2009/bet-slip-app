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

    // Main lines are safe.
    rows.push(...parseMainLines(lines, detailEvent.startIndex, event, detailEvent.away, detailEvent.home, sport));

    // Full-game O/U props are allowed only when the section does not drift into
    // quarter/half props. The parser below stops before partial-game markers.
    rows.push(...parseOverUnderPlayerProps(lines, detailEvent.startIndex, event, sport));

    // SAFETY LOCK:
    // Keep these disabled for now. BetMGM ladders like 10+, 15+, 20+, 25+, 30+, 35+, 40+
    // can create false lines like 39.5, and visible fallback sections can still mix
    // full-game labels with 1Q/half content.
    //
    // rows.push(...parseYesNoPlayerProps(lines, detailEvent.startIndex, event, sport));
    // rows.push(...parsePlusLadders(lines, detailEvent.startIndex, event, sport));
    // rows.push(...parseVisibleBetMgmOverUnderBlocks(lines, detailEvent.startIndex, event, sport));
  }

  if (rows.length === 0) {
    rows.push(...parseLandingGames(lines, sport));
  }

  return dedupeRows(rows);
}

function parseLandingGames(lines, sport) {
  const rows = [];

  for (let i = 0; i < lines.length - 8; i += 1) {
    const vsLine = normalizeLine(lines[i]);
    if (!isLikelyVsLine(vsLine)) continue;

    const parsedVs = parseVsLine(vsLine);
    if (!parsedVs.away || !parsedVs.home) continue;

    const block = lines.slice(i, Math.min(lines.length, i + 45));
    const parsed = parseLandingMainBlockFromVsCard(block, parsedVs.away, parsedVs.home);

    if (!parsed) continue;

    const event = `${parsedVs.away} @ ${parsedVs.home}`;
    rows.push(...buildMainRows(event, parsedVs.away, parsedVs.home, sport, parsed));
  }

  for (let i = 0; i < lines.length - 8; i += 1) {
    if (!/^All Wagers$/i.test(normalizeLine(lines[i]))) continue;

    const block = lines.slice(i, i + 20);
    const parsedGame = parseLandingGameFromAllWagersBlock(block);
    if (!parsedGame) continue;

    const { away, home, parsed } = parsedGame;
    const event = `${away} @ ${home}`;
    rows.push(...buildMainRows(event, away, home, sport, parsed));
    i += 8;
  }

  return rows;
}

function parseLandingMainBlockFromVsCard(block, away, home) {
  const working = block
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !isSkippableLine(line));

  const spreadIdx = working.findIndex((line) => /^Spread$/i.test(line));
  const totalIdx = working.findIndex((line) => /^Total$/i.test(line));
  const moneyIdx = working.findIndex((line) => /^Money$/i.test(line));

  if (spreadIdx === -1 || totalIdx === -1 || moneyIdx === -1) return null;

  const awayIdx = working.findIndex((line) => normalizeLine(line) === normalizeLine(away));
  const homeIdx = working.findIndex(
    (line, idx) => idx > awayIdx && normalizeLine(line) === normalizeLine(home)
  );

  if (awayIdx === -1 || homeIdx === -1) return null;

  // BetMGM landing card format:
  // Spread
  // Total
  // Money
  // Away
  // Home
  // +1.5
  // -118
  // -1.5
  // -102
  // O 228.5
  // -110
  // U 228.5
  // -110
  // -110
  // -110
  let oddsStartIdx = homeIdx + 1;

  // NHL landing cards may include team records after team names:
  // Penguins
  // 41-25-16
  // Flyers
  // 43-27-12
  // +1.5
  // -250
  while (
    oddsStartIdx < working.length &&
    !/^[+-]\d+(\.\d+)?$/.test(normalizeLine(working[oddsStartIdx]))
  ) {
    oddsStartIdx += 1;
  }

  const spreadA = parseSignedNumber(working[oddsStartIdx]);
  const spreadAOdds = parseAmericanOdds(working[oddsStartIdx + 1]);
  const spreadB = parseSignedNumber(working[oddsStartIdx + 2]);
  const spreadBOdds = parseAmericanOdds(working[oddsStartIdx + 3]);
  const totalOver = parseTotalToken(working[oddsStartIdx + 4], "O");
  const totalOverOdds = parseAmericanOdds(working[oddsStartIdx + 5]);
  const totalUnder = parseTotalToken(working[oddsStartIdx + 6], "U");
  const totalUnderOdds = parseAmericanOdds(working[oddsStartIdx + 7]);
  const moneylineA = parseAmericanOdds(working[oddsStartIdx + 8]);
  const moneylineB = parseAmericanOdds(working[oddsStartIdx + 9]);

  if (
    spreadA === null ||
    spreadAOdds === null ||
    spreadB === null ||
    spreadBOdds === null ||
    totalOver === null ||
    totalOverOdds === null ||
    totalUnder === null ||
    totalUnderOdds === null ||
    moneylineA === null ||
    moneylineB === null
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

function parseLandingGameFromAllWagersBlock(block) {
  const working = block
    .map(normalizeLine)
    .filter(Boolean);

  const spreadIdx = working.findIndex((line) => /^Spread$/i.test(line));
  const totalIdx = working.findIndex((line) => /^Total$/i.test(line));
  const moneyIdx = working.findIndex((line) => /^Money$/i.test(line));

  if (spreadIdx === -1 || totalIdx === -1 || moneyIdx === -1) return null;

  const postMoney = working.slice(moneyIdx + 1, Math.min(working.length, moneyIdx + 10));
  const teams = postMoney.filter((line) => isLikelyTeamName(line));

  if (teams.length < 2) return null;

  const away = teams[0];
  const home = teams[1];

  const parsed =
    parseLandingMainBlock(working, away, home) ||
    parseMainBlock(working);

  if (!parsed) return null;

  return { away, home, parsed };
}

function parseLandingMainBlock(block, away, home) {
  const working = block.filter((line) => !isSkippableLine(line));

  const awayIdx = working.findIndex((line) => normalizeLine(line) === normalizeLine(away));
  if (awayIdx === -1) return null;

  const homeIdx = working.findIndex(
    (line, idx) => idx > awayIdx && normalizeLine(line) === normalizeLine(home)
  );
  if (homeIdx === -1) return null;

  const spreadA = parseSignedNumber(working[homeIdx + 2]);
  const spreadAOdds = parseAmericanOdds(working[homeIdx + 3]);
  const spreadB = parseSignedNumber(working[homeIdx + 4]);
  const spreadBOdds = parseAmericanOdds(working[homeIdx + 5]);
  const totalOver = parseTotalToken(working[homeIdx + 6], "O");
  const totalOverOdds = parseAmericanOdds(working[homeIdx + 7]);
  const totalUnder = parseTotalToken(working[homeIdx + 8], "U");
  const totalUnderOdds = parseAmericanOdds(working[homeIdx + 9]);
  const moneylineA = parseAmericanOdds(working[homeIdx + 10]);
  const moneylineB = parseAmericanOdds(working[homeIdx + 11]);

  if (
    spreadA === null || spreadAOdds === null ||
    spreadB === null || spreadBOdds === null ||
    totalOver === null || totalOverOdds === null ||
    totalUnder === null || totalUnderOdds === null ||
    moneylineA === null || moneylineB === null
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
  // BetMGM game pages often begin like:
  // Starting in 39 min
  // TBS
  // Penguins
  // Flyers
  for (let i = 0; i < lines.length - 3; i += 1) {
    const line = normalizeLine(lines[i]);

    if (!/^Starting(?: now| in\b.*)$/i.test(line)) continue;

    let cursor = i + 1;

    // Optional broadcast/channel line: TBS, TNT, ABC, ESPN, etc.
    if (isLikelyBroadcastLine(lines[cursor])) {
      cursor += 1;
    }

    const away = normalizeLine(lines[cursor]);
    const home = normalizeLine(lines[cursor + 1]);

    if (
      isLikelyTeamName(away) &&
      isLikelyTeamName(home) &&
      away !== home
    ) {
      return { away, home, startIndex: cursor + 2 };
    }
  }

  // BetMGM older/detail shape:
  // Starts In:
  // ...
  // Team A
  // Team B
  const startsIndex = lines.findIndex((line) => /^Starts In:?$/i.test(line));
  if (startsIndex !== -1) {
    let away = "";
    let home = "";

    for (
      let i = Math.max(0, startsIndex - 8);
      i <= Math.min(lines.length - 1, startsIndex + 12);
      i += 1
    ) {
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

  // Shape:
  // Team A
  // @ / AT / vs
  // Team B
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (
      isLikelyTeamName(lines[i]) &&
      isAtMarker(lines[i + 1]) &&
      isLikelyTeamName(lines[i + 2])
    ) {
      return { away: lines[i], home: lines[i + 2], startIndex: i + 3 };
    }
  }

  // Shape:
  // Penguins vs. Flyers
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (isLikelyVsLine(lines[i])) {
      const parsed = parseVsLine(lines[i]);
      if (parsed.away && parsed.home) {
        return { away: parsed.away, home: parsed.home, startIndex: i + 1 };
      }
    }
  }

  // Shape:
  // Today / Tomorrow
  // 7:40 PM
  // ABC
  // Team A
  // Team B
  for (let i = 0; i < lines.length - 5; i += 1) {
    if (
      /^(Today|Tomorrow)$/i.test(normalizeLine(lines[i])) &&
      isLikelyTimeLine(lines[i + 1]) &&
      isLikelyBroadcastLine(lines[i + 2]) &&
      isLikelyTeamName(lines[i + 3]) &&
      isLikelyTeamName(lines[i + 4]) &&
      lines[i + 3] !== lines[i + 4]
    ) {
      return { away: lines[i + 3], home: lines[i + 4], startIndex: i + 5 };
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
const block = lines.slice(blockStart, Math.min(lines.length, moneyIdx + 20));
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
  if (teamStart + 11 >= working.length) return null;

  const teamA = working[teamStart];
  const spreadA = parseSignedNumber(working[teamStart + 1]);
  const spreadAOdds = parseAmericanOdds(working[teamStart + 2]);
  const totalOver = parseTotalToken(working[teamStart + 3], "O");
  const totalOverOdds = parseAmericanOdds(working[teamStart + 4]);
  const moneylineA = parseAmericanOdds(working[teamStart + 5]);

  const teamB = working[teamStart + 6];
  const spreadB = parseSignedNumber(working[teamStart + 7]);
  const spreadBOdds = parseAmericanOdds(working[teamStart + 8]);
  const totalUnder = parseTotalToken(working[teamStart + 9], "U");
  const totalUnderOdds = parseAmericanOdds(working[teamStart + 10]);
  const moneylineB = parseAmericanOdds(working[teamStart + 11]);

  if (
    !isLikelyTeamName(teamA) ||
    !isLikelyTeamName(teamB) ||
    teamA === teamB ||
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
    ["Player points O/U", "player_points"],
    ["Player rebounds O/U", "player_rebounds"],
    ["Player assists O/U", "player_assists"],
    ["Player three-pointers O/U", "player_threes"],
    ["Player pts + reb + ast O/U", "player_pra"],
    ["Player points + rebounds + assists O/U", "player_pra"],
    ["Player points + rebounds O/U", "player_points_rebounds"],
    ["Player points + assists O/U", "player_points_assists"],
    ["Player rebounds + assists O/U", "player_rebounds_assists"],
    ["Player shots on goal O/U", "player_shots_on_goal"],
    ["Saves O/U", "player_saves"],
    ["Goalie saves O/U", "player_saves"],
    ["Goals against O/U", "goalie_goals_against"],
  ];

  for (const [header, marketType] of sections) {
    const headerPattern = new RegExp(`^${escapeRegExp(header)}$`, "i");

    for (let sectionStart = startIndex; sectionStart < lines.length; sectionStart += 1) {
      if (!headerPattern.test(lines[sectionStart])) continue;

      const end = findNextSectionIndex(lines, sectionStart + 1);
      let i = sectionStart + 1;

      while (i < end - 4) {
        const player = lines[i];

        if (!looksLikePlayerName(player)) {
          i += 1;
          continue;
        }

        // NBA / BetMGM style with Avg:
        const avgMarker = lines[i + 1];
        const avgValue = parseUnsignedNumber(lines[i + 2]);
        const overLineWithAvg = parseTotalToken(lines[i + 3], "O");
        const overOddsWithAvg = parseAmericanOdds(lines[i + 4]);
        const underLineWithAvg = parseTotalToken(lines[i + 5], "U");
        const underOddsWithAvg = parseAmericanOdds(lines[i + 6]);

        if (
          /^Avg:$/i.test(avgMarker) &&
          avgValue !== null &&
          overLineWithAvg !== null &&
          underLineWithAvg !== null &&
          overLineWithAvg === underLineWithAvg &&
          overOddsWithAvg !== null &&
          underOddsWithAvg !== null
        ) {
          rows.push(
            buildRow({
              sport,
              event,
              marketType,
              selection: `${player} Over`,
              lineValue: overLineWithAvg,
              oddsAmerican: overOddsWithAvg,
            })
          );

          rows.push(
            buildRow({
              sport,
              event,
              marketType,
              selection: `${player} Under`,
              lineValue: underLineWithAvg,
              oddsAmerican: underOddsWithAvg,
            })
          );

          i += 7;
          continue;
        }

        // BetMGM NHL style without Avg:
        // Player
        // O 2.5
        // +100
        // U 2.5
        // -135
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
  }

  return rows;
}

function parseVisibleBetMgmOverUnderBlocks(lines, startIndex, event, sport) {
  const rows = [];

  const marketMap = new Map([
    ["player points", "player_points"],
    ["player rebounds", "player_rebounds"],
    ["player assists", "player_assists"],
    ["player three-pointers", "player_threes"],
    ["player shots", "player_shots_on_goal"],
    ["player power play points", "player_power_play_points"],
    ["goalie saves", "player_saves"],
    ["goals against", "goalie_goals_against"],
    ["player points + rebounds + assists", "player_pra"],
    ["player points + assists", "player_points_assists"],
    ["player points + rebounds", "player_points_rebounds"],
    ["player rebounds + assists", "player_rebounds_assists"],
  ]);

  let currentMarketType = "";

  for (let i = Math.max(0, startIndex); i < lines.length - 4; i += 1) {
    const line = normalizeLine(lines[i]);
    const lower = line.toLowerCase();

    if (marketMap.has(lower)) {
      currentMarketType = marketMap.get(lower);
      continue;
    }

    if (!currentMarketType) continue;

    // Stop before legal/footer copy.
    if (isHardStopLine(line) || /^Missouri$/i.test(line)) {
      currentMarketType = "";
      continue;
    }

    const player = line;
    if (!looksLikePlayerName(player)) continue;

    const overLine = parseTotalToken(lines[i + 1], "O");
    const overOdds = parseAmericanOdds(lines[i + 2]);
    const underLine = parseTotalToken(lines[i + 3], "U");
    const underOdds = parseAmericanOdds(lines[i + 4]);

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
        marketType: currentMarketType,
        selection: `${player} Over`,
        lineValue: overLine,
        oddsAmerican: overOdds,
      })
    );

    rows.push(
      buildRow({
        sport,
        event,
        marketType: currentMarketType,
        selection: `${player} Under`,
        lineValue: underLine,
        oddsAmerican: underOdds,
      })
    );

    i += 4;
  }

  return rows;
}

function parseYesNoPlayerProps(lines, startIndex, event, sport) {
  const rows = [];

  const sections = [
    ["Player double-double", "double_double"],
    ["Player triple-double", "triple_double"],
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

    // Expect:
    // Yes
    // No
    // Player
    // odds
    // odds

    while (i < end - 3) {
      const yesMarker = lines[i];
      const noMarker = lines[i + 1];

      if (!/^Yes$/i.test(yesMarker) || !/^No$/i.test(noMarker)) {
        i += 1;
        continue;
      }

      let j = i + 2;

      while (j < end - 2) {
        const player = lines[j];
        if (!looksLikePlayerName(player)) {
          j += 1;
          continue;
        }

        // ensure next line is actually odds
        const nextLine = lines[j + 1];
        if (!/^[+-]\d{2,5}$/.test(String(nextLine || "").trim())) {
          j += 1;
          continue;
        }

        const yesOdds = parseAmericanOdds(lines[j + 1]);
const noOdds = parseAmericanOdds(lines[j + 2]);

if (yesOdds !== null) {
  rows.push(
    buildRow({
      sport,
      event,
      marketType,
      selection: `${player} Yes`,
      lineValue: null,
      oddsAmerican: yesOdds,
      isBinaryMarket: true,
    })
  );
}

if (noOdds !== null) {
  rows.push(
    buildRow({
      sport,
      event,
      marketType,
      selection: `${player} No`,
      lineValue: null,
      oddsAmerican: noOdds,
      isBinaryMarket: true,
    })
  );
}

        j += 3;
      }

      break;
    }
  }

  return rows;
}

function parsePlusLadders(lines, startIndex, event, sport) {
  const rows = [];

  if (lines.some((line) => /^Game Page – Main$/i.test(normalizeLine(line)))) {
    return rows;
  }

  const sections = [
    ["Player points", "player_points"],
    ["Player rebounds", "player_rebounds"],
    ["Player assists", "player_assists"],
    ["Player three-pointers", "player_threes"],
    ["Player hits", "player_hits"],
    ["Player total bases", "player_total_bases"],
    ["Player shots", "player_shots_on_goal"],
    ["Player goals", "player_goals"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findLineIndexAfter(lines, startIndex, new RegExp(`^${escapeRegExp(header)}$`, "i"));
    if (idx === -1) continue;

    const end = findNextSectionIndex(lines, idx + 1);
    let currentThreshold = null;
    let i = idx + 1;

    while (i < end - 4) {
      const token = lines[i];
      const plus = parsePlusToken(token);

      if (plus !== null) {
        currentThreshold = plus;
        i += 1;
        continue;
      }

      const player = lines[i];
      if (!looksLikePlayerName(player) || currentThreshold === null) {
        i += 1;
        continue;
      }

      const avgMarker = lines[i + 1];
      const avgValue = parseUnsignedNumber(lines[i + 2]);
      const yesMarker = lines[i + 3];
      const odds = parseAmericanOdds(lines[i + 4]);

      if (
        /^Avg:$/i.test(avgMarker) &&
        avgValue !== null &&
        /^Yes$/i.test(yesMarker) &&
        odds !== null
      ) {
        rows.push(
          buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Over`,
            lineValue: currentThreshold - 0.5,
            oddsAmerican: odds,
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

  const text = lines.slice(0, 120).join(" ");

  // direct keywords (fallback)
  if (/NBA/i.test(text)) return "NBA";
  if (/NHL/i.test(text)) return "NHL";
  if (/MLB/i.test(text)) return "MLB";

  // NBA team detection
  if (/(hornets|magic|lakers|celtics|knicks|warriors|suns|bucks|heat|nets|raptors|pistons|hawks|spurs|rockets|nuggets|timberwolves|cavaliers|76ers|trail blazers)/i.test(text)) {
    return "NBA";
  }

  // NHL team detection
  if (/(kraken|avalanche|predators|jets|ducks|flames|canucks|oilers|blues|mammoth|kings|sharks|bruins|canadiens|penguins|lightning|golden knights|flyers|sabres|senators|stars|wild|hurricanes|rangers|islanders|devils|panthers|maple leafs|red wings|blue jackets)/i.test(text)) {
    return "NHL";
  }

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
  return /^\d{1,2}:\d{2}\s*[AP]M$/i.test(text);
}

function isLikelyBroadcastLine(value) {
  const text = normalizeLine(value);
  return /^•?\s*(Amazon|ESPN|TNT|TBS|ABC|NBC|CBS|FOX|ESPN2|NHL Network|NBA TV)$/i.test(text);
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
  return /^(all odds|sgp|builder|stats|quick sgp|popular|game lines|player props|points|rebounds|assists|threes|three-pointers|combo stats|defense|shots|goals|player points|player rebounds|player assists|player three-pointers|player shots|player blocked shots|player power play points|player points o\/u|player rebounds o\/u|player assists o\/u|player three-pointers o\/u|points o\/u|rebounds o\/u|assists o\/u|threes o\/u|pts \+ reb \+ ast o\/u|shots on goal o\/u|player points \+ rebounds \+ assists|player points \+ assists|player points \+ rebounds|player rebounds \+ assists|player double-double|player triple-double|betting news|first field goal scorer|first player to record an assist|first player to record a rebound|first player to make a three-pointer|player to score 2\+ goals|player to score 3\+ goals|anytime goalscorer|first goalscorer|goalie saves|goals against|goalie shutouts)$/i.test(text);
}

function findLineIndexAfter(lines, startIndex, pattern) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

function isBetMgmPartialGameMarker(value) {
  const text = normalizeLine(value);

  return (
    /^player .+:\s*(1st|2nd|3rd|4th|first|second|third|fourth)\s+quarter$/i.test(text) ||
    /^player .+:\s*(1st|2nd|first|second)\s+half$/i.test(text) ||
    /\b(1st quarter|2nd quarter|3rd quarter|4th quarter|first quarter|second quarter|third quarter|fourth quarter|1st half|2nd half|first half|second half)\b/i.test(text)
  );
}

function findNextSectionIndex(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (
      isLikelySectionHeader(lines[i]) ||
      isBetMgmPartialGameMarker(lines[i]) ||
      isHardStopLine(lines[i])
    ) {
      return i;
    }
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
