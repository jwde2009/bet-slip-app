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

  let sport = inferSport(lines, context);

  if (looksLikeBetMgmSoccerVisibleCapture(lines, rawText)) {
    sport = "SOCCER";
  } else if (looksLikeBetMgmWnbaPage(lines)) {
    sport = "WNBA";
  }
  const rows = [];

  const eventBlocks = findBetMgmRealEventBlocks(lines);

  if (eventBlocks.length) {
    for (const eventBlock of eventBlocks) {
      const blockLines = lines.slice(eventBlock.startIndex, eventBlock.endIndex);
      const blockSport = inferSport(blockLines, context) || sport;
      const awayRaw = eventBlock.away;
      const homeRaw = eventBlock.home;
      const away = normalizeBetMgmEventTeamName(awayRaw);
      const home = normalizeBetMgmEventTeamName(homeRaw);
      const event = `${away} @ ${home}`;

      rows.push(...parseMainLines(blockLines, 0, event, awayRaw, homeRaw, blockSport));
      rows.push(...parseOverUnderPlayerProps(blockLines, 0, event, blockSport));
      rows.push(...parseBetMgmNbaVisibleLadders(blockLines, 0, event, blockSport));
      rows.push(...parseBetMgmNbaBinaryProps(blockLines, 0, event, blockSport));
      rows.push(...parseBetMgmNhlVisibleProps(blockLines, 0, event, blockSport));
    }
  } else {
    const detailEvent = findDetailEvent(lines);
    if (detailEvent) {
      const awayRaw = detailEvent.away;
      const homeRaw = detailEvent.home;
      const away = normalizeBetMgmEventTeamName(awayRaw);
      const home = normalizeBetMgmEventTeamName(homeRaw);
      const event = `${away} @ ${home}`;

      rows.push(...parseMainLines(lines, detailEvent.startIndex, event, awayRaw, homeRaw, sport));
      rows.push(...parseOverUnderPlayerProps(lines, detailEvent.startIndex, event, sport));
      rows.push(...parseBetMgmNbaVisibleLadders(lines, detailEvent.startIndex, event, sport));
      rows.push(...parseBetMgmNbaBinaryProps(lines, detailEvent.startIndex, event, sport));
      rows.push(...parseBetMgmNhlVisibleProps(lines, detailEvent.startIndex, event, sport));
    }
  }

  rows.push(...parseBetMgmManualLadderCaptureBlocks(lines, sport));

  // Direct visible game-line parser for BetMGM game/league selected-game cards.
  rows.push(...parseBetMgmVisibleMainLineBlocks(lines, sport));

  // Fallback for manual-expanded BetMGM NHL Player Props pages.
  // This is intentionally after the normal block parser so it fills gaps without
  // changing the main event/main-line parser.
  rows.push(...parseBetMgmNhlVisiblePlayerPropsFallback(lines, sport));

    // Visible soccer page parser. BetMGM soccer uses labels like
  // Match result, Total goals, Both teams to score, Double chance, and Total corners
  // instead of NBA/NHL-style Spread/Total/Money blocks.
  if (String(sport || "").toUpperCase() === "SOCCER") {
    rows.push(...parseBetMgmSoccerVisibleMarkets(lines, sport));
  }
  if (rows.length === 0) {
    rows.push(...parseLandingGames(lines, sport));
  }

  return dedupeRows(rows);
}

function looksLikeBetMgmSoccerVisibleCapture(lines = [], rawText = "") {
  const pageText = `${String(rawText || "")} ${(lines || []).slice(0, 360).join(" ")}`;

  return (
    /BETMGM_SOCCER_VISIBLE_CAPTURE_COMPLETE/i.test(pageText) ||
    (
      /\b(Soccer|World Cup|FIFA)\b/i.test(pageText) &&
      /\bSGP\b/i.test(pageText) &&
      (
        /\bMatch result\b/i.test(pageText) ||
        /\bBoth teams to score\b/i.test(pageText) ||
        /\bTotal goals\b/i.test(pageText) ||
        /\bDouble chance\b/i.test(pageText) ||
        /\bTotal corners\b/i.test(pageText)
      )
    )
  );
}

function looksLikeBetMgmWnbaPage(lines = []) {
  const text = (lines || []).slice(0, 260).join(" ");

  const hasWnbaContext =
    /\bWNBA\b/i.test(text) ||
    /\b(Sky|Wings|Dream|Sun|Valkyries|Fever|Aces|Sparks|Lynx|Liberty|Mercury|Fire|Storm|Tempo|Mystics)\b/i.test(text);

  const hasWnbaPlayerPropContext =
    /\bPlayer props\b/i.test(text) &&
    /\b(Player assists|Player rebounds|Player three-pointers|Alternate player points|First field goal scorer)\b/i.test(text);

  return hasWnbaContext && hasWnbaPlayerPropContext;
}

function isSpreadHeader(value) {
  return /^Spreads?$/i.test(normalizeLine(value));
}

function isTotalHeader(value) {
  return /^Totals?$/i.test(normalizeLine(value));
}

function isMoneyHeader(value) {
  return /^(Money|Moneyline)$/i.test(normalizeLine(value));
}

function parseBetMgmVisibleMainLineBlocks(lines, sport) {
  const rows = [];
  const resolvedSport = String(sport || "").toUpperCase() || "NBA";

  for (let i = 0; i < lines.length - 14; i += 1) {
    if (!isSpreadHeader(lines[i])) continue;
    if (!isTotalHeader(lines[i + 1])) continue;
    if (!isMoneyHeader(lines[i + 2])) continue;

    // Shape A, seen on BetMGM game page:
    // Spread
    // Total
    // Money
    // Knicks
    // -2.5
    // -115
    // O 213.5
    // -118
    // -150
    // Hawks
    // +2.5
    // -105
    // U 213.5
    // -110
    // +125
    const shapeA = parseBetMgmVisibleMainLineShapeA(lines, i, resolvedSport);
    if (shapeA.length) {
      rows.push(...shapeA);
      continue;
    }

    // Shape B, seen on some card layouts:
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
    const shapeB = parseBetMgmVisibleMainLineShapeB(lines, i, resolvedSport);
    if (shapeB.length) {
      rows.push(...shapeB);
    }
  }

  return rows;
}

function parseBetMgmVisibleMainLineShapeA(lines, headerIndex, sport) {
  const awayRaw = normalizeLine(lines[headerIndex + 3]);
  const homeRaw = normalizeLine(lines[headerIndex + 9]);

  if (!isLikelyTeamName(awayRaw) || !isLikelyTeamName(homeRaw) || awayRaw === homeRaw) {
    return [];
  }

  const spreadA = parseSignedNumber(lines[headerIndex + 4]);
  const spreadAOdds = parseAmericanOdds(lines[headerIndex + 5]);
  const totalOver = parseTotalToken(lines[headerIndex + 6], "O");
  const totalOverOdds = parseAmericanOdds(lines[headerIndex + 7]);
  const moneylineA = parseAmericanOdds(lines[headerIndex + 8]);

  const spreadB = parseSignedNumber(lines[headerIndex + 10]);
  const spreadBOdds = parseAmericanOdds(lines[headerIndex + 11]);
  const totalUnder = parseTotalToken(lines[headerIndex + 12], "U");
  const totalUnderOdds = parseAmericanOdds(lines[headerIndex + 13]);
  const moneylineB = parseAmericanOdds(lines[headerIndex + 14]);

  if (
    spreadA === null ||
    spreadAOdds === null ||
    totalOver === null ||
    totalOverOdds === null ||
    moneylineA === null ||
    spreadB === null ||
    spreadBOdds === null ||
    totalUnder === null ||
    totalUnderOdds === null ||
    moneylineB === null ||
    Math.abs(totalOver - totalUnder) > 0.0001
  ) {
    return [];
  }

  const away = normalizeBetMgmMainLineTeamName(awayRaw);
  const home = normalizeBetMgmMainLineTeamName(homeRaw);
  const event = `${away} @ ${home}`;

  return buildMainRows(event, away, home, sport, {
    spreadA,
    spreadAOdds,
    moneylineA,
    spreadB,
    spreadBOdds,
    moneylineB,
    totalLine: totalOver,
    totalOverOdds,
    totalUnderOdds,
  });
}

function parseBetMgmVisibleMainLineShapeB(lines, headerIndex, sport) {
  const awayRaw = normalizeLine(lines[headerIndex + 3]);
  const homeRaw = normalizeLine(lines[headerIndex + 4]);

  if (!isLikelyTeamName(awayRaw) || !isLikelyTeamName(homeRaw) || awayRaw === homeRaw) {
    return [];
  }

  const spreadA = parseSignedNumber(lines[headerIndex + 5]);
  const spreadAOdds = parseAmericanOdds(lines[headerIndex + 6]);
  const spreadB = parseSignedNumber(lines[headerIndex + 7]);
  const spreadBOdds = parseAmericanOdds(lines[headerIndex + 8]);

  const totalOver = parseTotalToken(lines[headerIndex + 9], "O");
  const totalOverOdds = parseAmericanOdds(lines[headerIndex + 10]);
  const totalUnder = parseTotalToken(lines[headerIndex + 11], "U");
  const totalUnderOdds = parseAmericanOdds(lines[headerIndex + 12]);

  const moneylineA = parseAmericanOdds(lines[headerIndex + 13]);
  const moneylineB = parseAmericanOdds(lines[headerIndex + 14]);

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
    moneylineB === null ||
    Math.abs(totalOver - totalUnder) > 0.0001
  ) {
    return [];
  }

  const away = normalizeBetMgmMainLineTeamName(awayRaw);
  const home = normalizeBetMgmMainLineTeamName(homeRaw);
  const event = `${away} @ ${home}`;

  return buildMainRows(event, away, home, sport, {
    spreadA,
    spreadAOdds,
    moneylineA,
    spreadB,
    spreadBOdds,
    moneylineB,
    totalLine: totalOver,
    totalOverOdds,
    totalUnderOdds,
  });
}

function normalizeBetMgmMainLineTeamName(value) {
  const text = normalizeLine(value);

  const aliases = new Map([
    ["Knicks", "New York Knicks"],
    ["Hawks", "Atlanta Hawks"],
    ["Celtics", "Boston Celtics"],
    ["76ers", "Philadelphia 76ers"],
    ["Nuggets", "Denver Nuggets"],
    ["Timberwolves", "Minnesota Timberwolves"],
    ["Pistons", "Detroit Pistons"],
    ["Magic", "Orlando Magic"],
    ["Cavaliers", "Cleveland Cavaliers"],
    ["Raptors", "Toronto Raptors"],
    ["Lakers", "Los Angeles Lakers"],
    ["Rockets", "Houston Rockets"],
  ]);

  return aliases.get(text) || text;
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

  const spreadIdx = working.findIndex((line) => isSpreadHeader(line));
  const totalIdx = working.findIndex((line) => isTotalHeader(line));
  const moneyIdx = working.findIndex((line) => isMoneyHeader(line));

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

function findBetMgmRealEventBlocks(lines) {
  const topEventsIndex = lines.findIndex((line) => /^Top Events$/i.test(normalizeLine(line)));
  const searchStart = topEventsIndex >= 0 ? topEventsIndex : 0;
  const starts = [];

  for (let i = searchStart; i < lines.length - 5; i += 1) {
    const dateLine = normalizeLine(lines[i]);

    if (!/^(Today|Tomorrow|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(dateLine)) continue;
    if (!isLikelyTimeLine(lines[i + 1])) continue;

    let cursor = i + 2;

    if (isLikelyBroadcastLine(lines[cursor])) {
      cursor += 1;
    }

    const away = normalizeLine(lines[cursor]);
    const home = normalizeLine(lines[cursor + 1]);

    if (!isLikelyTeamName(away) || !isLikelyTeamName(home) || away === home) continue;
    if (isFalseBetMgmEventTeamName(away) || isFalseBetMgmEventTeamName(home)) continue;

    const postTeams = lines
      .slice(cursor + 2, Math.min(lines.length, cursor + 42))
      .map(normalizeLine)
      .join(" ");

    const looksLikeSelectedGame =
      /\b(Player props|Game lines|Spread|Total|Money|Points|First FG|Assists|Rebounds|Three-pointers|Combo stats|Defense|Anytime goalscorer|Player shots|Goalie saves)\b/i.test(postTeams);

    if (!looksLikeSelectedGame) continue;

    starts.push({
      away,
      home,
      startIndex: cursor + 2,
      markerIndex: i,
    });
  }

  const unique = [];

  for (const item of starts) {
    const key = `${item.away} @ ${item.home}`;
    if (unique.some((existing) => `${existing.away} @ ${existing.home}` === key)) {
      continue;
    }

    unique.push(item);
  }

  return unique.map((item, index) => {
    const next = unique[index + 1];

    return {
      away: item.away,
      home: item.home,
      startIndex: item.startIndex,
      endIndex: next ? next.markerIndex : lines.length,
    };
  });
}

function isFalseBetMgmEventTeamName(value) {
  const text = normalizeLine(value);

  return (
    /^To Win the Tip\b/i.test(text) ||
    /^First Stat\b/i.test(text) ||
    /^Method of first basket\b/i.test(text) ||
    /\bFirst Stat\b/i.test(text) ||
    /\bMethod of first basket\b/i.test(text)
  );
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
  const spreadIdx = findLineIndexAfter(lines, startIndex, isSpreadHeader);
  const totalIdx = findLineIndexAfter(lines, startIndex, isTotalHeader);
  const moneyIdx = findLineIndexAfter(lines, startIndex, isMoneyHeader);

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

function parseBetMgmManualLadderCaptureBlocks(lines, sport) {
  const rows = [];
  const resolvedSport = String(sport || "").trim().toUpperCase() || "WNBA";

  const configuredThresholds = parseBetMgmLadderThresholdConfig(lines, resolvedSport);

  if (configuredThresholds.length) {
    rows.push(...parseBetMgmConfiguredLadderSections(lines, configuredThresholds, resolvedSport));
  }

  // Backward-compatible support for the older one-marker workflow.
  // The new preferred workflow is BETMGM_LADDER_THRESHOLDS_START/END at the top of the input.
  for (let idx = 0; idx < lines.length; idx += 1) {
    const marker = normalizeLine(lines[idx]);
    if (!/^BETMGM_(?:MANUAL_)?LADDER_CAPTURE\b/i.test(marker)) continue;

    const meta = parseBetMgmManualLadderMarker(marker);
    if (!meta.event || !meta.marketType || meta.threshold === null) continue;

    const end = findBetMgmManualLadderCaptureEnd(lines, idx + 1);

    for (let i = idx + 1; i < end - 1; i += 1) {
      const line = normalizeLine(lines[i]);

      if (!line) continue;
      if (isBetMgmManualLadderNoiseLine(line)) continue;
      if (parsePlusToken(line) !== null) continue;
      if (!looksLikePlayerName(line)) continue;

      const odds = parseAmericanOdds(lines[i + 1]);
      if (odds === null) continue;

      rows.push(
        buildRow({
          sport: meta.sport || resolvedSport,
          event: meta.event,
          marketType: meta.marketType,
          selection: `${line} Over`,
          lineValue: meta.threshold - 0.5,
          oddsAmerican: odds,
        })
      );

      i += 1;
    }
  }

  return rows;
}

function parseBetMgmLadderThresholdConfig(lines, fallbackSport) {
  const configs = [];
  let insideConfig = false;

  for (const rawLine of lines || []) {
    const line = normalizeLine(rawLine);

    if (/^BETMGM_LADDER_THRESHOLDS_START$/i.test(line)) {
      insideConfig = true;
      continue;
    }

    if (/^BETMGM_LADDER_THRESHOLDS_END$/i.test(line)) {
      insideConfig = false;
      continue;
    }

    if (!insideConfig) continue;

    const meta = parseBetMgmManualLadderMarker(line);

    if (!meta.event || !meta.marketType || meta.threshold === null) continue;

    configs.push({
      sport: meta.sport || String(fallbackSport || "WNBA").trim().toUpperCase(),
      event: meta.event,
      marketType: meta.marketType,
      threshold: meta.threshold,
    });
  }

  return configs;
}

function parseBetMgmConfiguredLadderSections(lines, configs, fallbackSport) {
  const rows = [];
  const configByMarket = new Map();

  for (const config of configs || []) {
    if (!config?.marketType || config.threshold === null) continue;

    // One pasted BetMGM WNBA event is expected. If duplicate market configs are present,
    // use the latest one so the helper can replace prior choices.
    configByMarket.set(config.marketType, config);
  }

  if (!configByMarket.size) return rows;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const headerMarketType = getBetMgmManualLadderMarketTypeFromHeader(lines[idx]);
    if (!headerMarketType) continue;

    const meta = configByMarket.get(headerMarketType);
    if (!meta || !meta.event || meta.threshold === null) continue;

    const end = findBetMgmManualLadderCaptureEnd(lines, idx + 1);

    for (let i = idx + 1; i < end - 1; i += 1) {
      const player = normalizeLine(lines[i]);

      if (!player) continue;
      if (isBetMgmManualLadderNoiseLine(player)) continue;
      if (parsePlusToken(player) !== null) continue;
      if (!looksLikePlayerName(player)) continue;

      const odds = parseAmericanOdds(lines[i + 1]);
      if (odds === null) continue;

      rows.push(
        buildRow({
          sport: meta.sport || fallbackSport || "WNBA",
          event: meta.event,
          marketType: meta.marketType,
          selection: `${player} Over`,
          lineValue: meta.threshold - 0.5,
          oddsAmerican: odds,
        })
      );

      i += 1;
    }
  }

  return rows;
}

function parseBetMgmManualLadderMarker(marker) {
  const inline = String(marker || "");

  function getInlineValue(key) {
    const pattern = new RegExp(`${key}\\s*=\\s*([^|]+)`, "i");
    const match = inline.match(pattern);
    return match ? normalizeLine(match[1]) : "";
  }

  return {
    sport: String(getInlineValue("sport") || "").trim().toUpperCase(),
    event: normalizeBetMgmManualEventName(getInlineValue("event")),
    marketType: mapBetMgmManualLadderMarket(getInlineValue("market")),
    threshold: parsePlusToken(getInlineValue("threshold")),
  };
}

function normalizeBetMgmManualEventName(value = "") {
  const text = normalizeLine(value);
  const parts = text.split(/\s+@\s+/).map((part) => normalizeBetMgmEventTeamName(part)).filter(Boolean);

  if (parts.length === 2) return `${parts[0]} @ ${parts[1]}`;

  const vsParts = text.split(/\s+vs\.?\s+/i).map((part) => normalizeBetMgmEventTeamName(part)).filter(Boolean);
  if (vsParts.length === 2) return `${vsParts[0]} @ ${vsParts[1]}`;

  return text;
}

function mapBetMgmManualLadderMarket(value = "") {
  const text = normalizeLine(value).toLowerCase();

  if (text === "player_pra" || /points.*rebounds.*assists|pts.*reb.*ast|pra/.test(text)) return "player_pra";
  if (text === "player_points_rebounds" || /points.*rebounds|pts.*reb/.test(text)) return "player_points_rebounds";
  if (text === "player_points_assists" || /points.*assists|pts.*ast/.test(text)) return "player_points_assists";
  if (text === "player_rebounds_assists" || /rebounds.*assists|reb.*ast/.test(text)) return "player_rebounds_assists";
  if (text === "player_threes" || /three|3-?pointer|threes/.test(text)) return "player_threes";
  if (text === "player_points" || /points/.test(text)) return "player_points";
  if (text === "player_rebounds" || /rebounds/.test(text)) return "player_rebounds";
  if (text === "player_assists" || /assists/.test(text)) return "player_assists";

  return "";
}

function getBetMgmManualLadderMarketTypeFromHeader(value = "") {
  const text = normalizeLine(value).toLowerCase();

  if (!text) return "";

  if (/^(alternate\s+)?player\s+points\s*\+\s*rebounds\s*\+\s*assists$/.test(text)) return "player_pra";
  if (/^(alternate\s+)?player\s+points\s*\+\s*rebounds$/.test(text)) return "player_points_rebounds";
  if (/^(alternate\s+)?player\s+points\s*\+\s*assists$/.test(text)) return "player_points_assists";
  if (/^(alternate\s+)?player\s+rebounds\s*\+\s*assists$/.test(text)) return "player_rebounds_assists";

  if (/^(alternate\s+)?player\s+(?:three-pointers|3-pointers|threes)$/.test(text)) return "player_threes";
  if (/^(alternate\s+)?player\s+points$/.test(text)) return "player_points";
  if (/^(alternate\s+)?player\s+rebounds$/.test(text)) return "player_rebounds";
  if (/^(alternate\s+)?player\s+assists$/.test(text)) return "player_assists";

  return "";
}

function isBetMgmManualLadderSectionHeader(value = "") {
  return !!getBetMgmManualLadderMarketTypeFromHeader(value);
}

function findBetMgmManualLadderCaptureEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (/^BETMGM_(?:MANUAL_)?LADDER_CAPTURE\b/i.test(line)) return i;
    if (/^BETMGM_LADDER_THRESHOLDS_(?:START|END)$/i.test(line)) return i;
    if (isBetMgmManualLadderSectionHeader(line)) return i;
    if (isHardStopLine(line)) return i;
    if (/^(Moneyline|Spread|Total|Game lines|Team props|Game props|Periods|Quarters|Halves)$/i.test(line)) return i;
  }

  return lines.length;
}

function isBetMgmManualLadderNoiseLine(value = "") {
  const text = normalizeLine(value);

  return (
    !text ||
    /^BETMGM_(?:MANUAL_)?LADDER_CAPTURE\b/i.test(text) ||
    /^BETMGM_LADDER_THRESHOLDS_(?:START|END)$/i.test(text) ||
    /^sport\s*=.+\|\s*event\s*=.+\|\s*market\s*=.+\|\s*threshold\s*=/i.test(text) ||
    isBetMgmManualLadderSectionHeader(text) ||
    /^(Player points|Player rebounds|Player assists|Player three-pointers|Player threes|Combo stats)$/i.test(text) ||
    /^(All|Show More|Show Less|Yes|No|Over|Under|Avg:|Missouri)$/i.test(text) ||
    /^[-+]?\d+(?:\.\d+)?$/.test(text) ||
    /^[OU]\s*\d+(?:\.\d+)?$/i.test(text)
  );
}

function parseBetMgmNbaVisibleLadders(lines, startIndex, event, sport) {
  // SAFETY LOCK:
  // BetMGM ladder rows lose horizontal column context in raw text.
  // Example: the page may visually be on 3+, but raw text lists:
  // 1+, 2+, 3+, 4+, 5+, 6+, then player odds.
  // That can falsely parse a 3+ price as Over 0.5.
  // Keep this disabled until we can reliably detect the active ladder column.
  return [];
}

function parseBetMgmNbaBinaryProps(lines, startIndex, event, sport) {
  const rows = [];

  if (!looksLikeBetMgmNbaText(lines, sport)) return rows;

  const sections = [
    ["Player double-double", "double_double"],
    ["Player triple-double", "triple_double"],
  ];

  for (const [header, marketType] of sections) {
    const headerPattern = new RegExp(`^${escapeRegExp(header)}$`, "i");

    for (let idx = Math.max(0, startIndex); idx < lines.length - 2; idx += 1) {
      if (!headerPattern.test(normalizeLine(lines[idx]))) continue;

      const end = findBetMgmNbaVisibleSectionEnd(lines, idx + 1);

      let yesNoHeaderIndex = -1;
      for (let i = idx + 1; i < Math.min(end - 1, idx + 12); i += 1) {
        if (/^Yes$/i.test(normalizeLine(lines[i])) && /^No$/i.test(normalizeLine(lines[i + 1]))) {
          yesNoHeaderIndex = i;
          break;
        }
      }

      if (yesNoHeaderIndex !== -1) {
        for (let i = yesNoHeaderIndex + 2; i < end - 2; i += 1) {
          const player = normalizeLine(lines[i]);
          const yesOdds = parseAmericanOdds(lines[i + 1]);
          const noOdds = parseAmericanOdds(lines[i + 2]);

          if (!looksLikePlayerName(player)) continue;

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

          if (yesOdds !== null || noOdds !== null) {
            i += 2;
          }
        }

        continue;
      }

      for (let i = idx + 1; i < end - 1; i += 1) {
        const player = normalizeLine(lines[i]);
        const odds = parseAmericanOdds(lines[i + 1]);

        if (!looksLikePlayerName(player) || odds === null) continue;

        rows.push(
          buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Yes`,
            lineValue: null,
            oddsAmerican: odds,
            isBinaryMarket: true,
          })
        );

        i += 1;
      }
    }
  }

  return rows;
}

function looksLikeBetMgmNbaText(lines, sport) {
  const text = (lines || []).slice(0, 260).join(" ");
  const sportKey = String(sport || "").toUpperCase();

  return (
    sportKey === "NBA" ||
    sportKey === "WNBA" ||
    /\bNBA\b/i.test(text) ||
    /\bWNBA\b/i.test(text) ||
    /\bPlayer props\b/i.test(text) ||
    /\bPlayer points\b/i.test(text) ||
    /\bPlayer rebounds\b/i.test(text) ||
    /\bPlayer assists\b/i.test(text) ||
    /\bPlayer three-pointers\b/i.test(text) ||
    /(knicks|hawks|celtics|76ers|nuggets|timberwolves|pistons|magic|cavaliers|raptors|lakers|rockets|dream|sky|sun|wings|valkyries|fever|aces|sparks|lynx|liberty|mercury|fire|storm|tempo|mystics)/i.test(text)
  );
}

function findFirstBetMgmThreshold(lines, startIndex, endIndex) {
  for (let i = startIndex; i < endIndex; i += 1) {
    const plus = parsePlusToken(lines[i]);
    if (plus !== null) return plus;

    if (looksLikePlayerName(lines[i])) break;
  }

  return null;
}

function findBetMgmNbaVisibleSectionEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (isBetMgmNbaVisibleSectionBoundary(line)) return i;
  }

  return lines.length;
}

function isBetMgmPartialGameHeader(value) {
  const text = normalizeLine(value);

  return (
    /\b1st quarter\b/i.test(text) ||
    /\b2nd quarter\b/i.test(text) ||
    /\b3rd quarter\b/i.test(text) ||
    /\b4th quarter\b/i.test(text) ||
    /\bquarter\b/i.test(text) ||
    /\bhalf\b/i.test(text)
  );
}

function isBetMgmNbaVisibleSectionBoundary(value) {
  const text = normalizeLine(value);

  if (!text) return false;

  if (/^Show Less$/i.test(text)) return true;
  if (/^Show More$/i.test(text)) return true;

  return (
    isHardStopLine(text) ||
    /^Missouri$/i.test(text) ||
    /^Current time:/i.test(text) ||
    /^Bet slip$/i.test(text) ||
    /^My Bets$/i.test(text) ||
    /^Player points$/i.test(text) ||
    /^Player assists$/i.test(text) ||
    /^Player three-pointers$/i.test(text) ||
    /^Player rebounds$/i.test(text) ||
    /^Player points \+ rebounds \+ assists$/i.test(text) ||
    /^Player points \+ rebounds$/i.test(text) ||
    /^Player points \+ assists$/i.test(text) ||
    /^Player rebounds \+ assists$/i.test(text) ||
    /^Player double-double$/i.test(text) ||
    /^Player triple-double$/i.test(text) ||
    /^Player blocks$/i.test(text) ||
    /^Defense$/i.test(text) ||
    /^First FG$/i.test(text) ||
    /^First field goal scorer$/i.test(text) ||
    /^New York Knicks: First field goal scorer$/i.test(text) ||
    /^Atlanta Hawks: First field goal scorer$/i.test(text) ||
    /^.+: First field goal scorer$/i.test(text) ||
    /^First player /i.test(text) ||
    /^.+: Method of first basket$/i.test(text) ||
    /\bMethod of first basket$/i.test(text) ||
    isBetMgmPartialGameHeader(text)
  );
}

function parseBetMgmSoccerVisibleMarkets(lines, sport) {
  const pageText = (lines || []).join(" ");

  if (!/\b(Soccer|World Cup|FIFA)\b/i.test(pageText)) {
    return [];
  }

  const detailEvent = findBetMgmSoccerVisibleSelectedEvent(lines);
  if (!detailEvent) return [];

  const away = normalizeBetMgmEventTeamName(detailEvent.away);
  const home = normalizeBetMgmEventTeamName(detailEvent.home);
  const event = `${away} @ ${home}`;
  const resolvedSport = "SOCCER";
  const startIndex = detailEvent.startIndex;

  const rows = [];

  rows.push(...parseBetMgmSoccerMatchResult(lines, startIndex, event, away, home, resolvedSport));
  rows.push(...parseBetMgmSoccerTotalSection(lines, startIndex, event, resolvedSport, /^Total goals$/i, "total"));
  rows.push(...parseBetMgmSoccerYesNoSection(lines, startIndex, event, resolvedSport, /^Both teams to score$/i, "both_teams_to_score"));
  rows.push(...parseBetMgmSoccerDoubleChance(lines, startIndex, event, resolvedSport));
  rows.push(...parseBetMgmSoccerTotalSection(lines, startIndex, event, resolvedSport, /^Total corners$/i, "corner_total"));

  return rows;
}

function findBetMgmSoccerVisibleSelectedEvent(lines) {
  function looksLikeBetMgmSelectedSoccerMarketText(value = "") {
    return (
      /\bSGP\b/i.test(value) &&
      (
        /\bMatch result\b/i.test(value) ||
        /\bTotal goals\b/i.test(value) ||
        /\bBoth teams to score\b/i.test(value) ||
        /\bDouble chance\b/i.test(value) ||
        /\bTotal corners\b/i.test(value)
      )
    );
  }

  function isBetMgmSoccerTeamSkipLine(value = "") {
    const text = normalizeLine(value);

    return (
      !text ||
      /^SGP$/i.test(text) ||
      /^(Today|Tomorrow|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(text) ||
      /^Starting in\b/i.test(text) ||
      isLikelyTimeLine(text) ||
      /^(FOX|FS1|FS2|ESPN|ESPN2|ABC|CBS|NBC|TNT|TBS|USA|Peacock|Apple TV|Prime Video)$/i.test(text) ||
      /^World Cup/i.test(text) ||
      /^World \| World Cup/i.test(text) ||
      /^All Countries$/i.test(text) ||
      /^Top Events$/i.test(text)
    );
  }

  function getTwoTeamsBeforeSgp(sgpIndex) {
    const teams = [];

    for (let j = sgpIndex - 1; j >= Math.max(0, sgpIndex - 14); j -= 1) {
      const candidate = normalizeLine(lines[j]);

      if (isBetMgmSoccerTeamSkipLine(candidate)) continue;
      if (!isLikelyTeamName(candidate)) continue;

      teams.unshift(candidate);

      if (teams.length >= 2) {
        return {
          away: teams[0],
          home: teams[1],
        };
      }
    }

    return null;
  }

  // Most reliable selected soccer page shape:
  // Starting in 16 min / FS1 / Turkiye / Paraguay / SGP / Totals / ...
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^SGP$/i.test(normalizeLine(lines[i]))) continue;

    const after = lines
      .slice(i, Math.min(lines.length, i + 260))
      .map(normalizeLine)
      .join(" ");

    if (!looksLikeBetMgmSelectedSoccerMarketText(after)) continue;

    const teams = getTwoTeamsBeforeSgp(i);
    if (!teams?.away || !teams?.home || teams.away === teams.home) continue;

    return {
      away: teams.away,
      home: teams.home,
      startIndex: i + 1,
    };
  }

  // Fallback for pages where the SGP marker is missing from copied text.
  for (let i = 0; i < lines.length - 8; i += 1) {
    const line = normalizeLine(lines[i]);

    if (!/^(Starting in .+|Today|Tomorrow|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(line)) {
      continue;
    }

    let cursor = i + 1;

    while (
      cursor < lines.length &&
      isBetMgmSoccerTeamSkipLine(lines[cursor])
    ) {
      cursor += 1;
    }

    const away = normalizeLine(lines[cursor]);
    const home = normalizeLine(lines[cursor + 1]);

    if (!isLikelyTeamName(away) || !isLikelyTeamName(home) || away === home) continue;

    const after = lines
      .slice(cursor + 2, Math.min(lines.length, cursor + 260))
      .map(normalizeLine)
      .join(" ");

    if (!looksLikeBetMgmSelectedSoccerMarketText(`SGP ${after}`)) continue;

    return {
      away,
      home,
      startIndex: cursor + 2,
    };
  }

  return null;
}

function findBetMgmSoccerSectionIndex(lines, startIndex, headerPattern) {
  for (let i = Math.max(0, startIndex); i < lines.length; i += 1) {
    if (headerPattern.test(normalizeLine(lines[i]))) {
      return i;
    }
  }

  return -1;
}

function findBetMgmSoccerSectionEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const text = normalizeLine(lines[i]);

    if (!text) continue;
    if (isHardStopLine(text)) return i;

    // Show More / Show Less usually marks the end of the visible rows for the currently opened
    // parent market. Stop here so we do not spill into player/team/period markets below it.
    if (/^Show (More|Less)$/i.test(text)) return i;

    // Exact parent-market headers. If another parent starts, stop.
    if (
      /^(Match result|Both teams to score|Total goals|Double chance|Total corners)$/i.test(text)
    ) {
      return i;
    }

    // Hard soccer submarket boundaries. These may contain the same words as the markets we want,
    // but they are not the full-time parent markets.
    if (
      /^(Pre-Built SGPs|Player total shots|Player total shots on target|Player total assists|Player total tackles|Goalscorers|Correct score|Halftime and fulltime|Halftime or fulltime|First team to score|Draw no bet|Most corners|Winning margin|Exact total goals|Total shots|Total shots on target)$/i.test(text)
    ) {
      return i;
    }

    // Team-specific props/totals.
    if (
      /^[A-Za-zÀ-ÿ .'`’&-]+:\s+Total\s+(goals|shots|shots on target|corners|corner bands)/i.test(text) ||
      /^[A-Za-zÀ-ÿ .'`’&-]+:\s+No bet$/i.test(text)
    ) {
      return i;
    }

    // Period / time-window / combo markets.
    if (
      /\b(1st half|2nd half|halftime|half-time|00:00\s*-\s*15:00|first 10 minutes|first 15 minutes)\b/i.test(text) &&
      !/^(Regular time|1st half|2nd half)$/i.test(text)
    ) {
      return i;
    }

    if (
      /^(3-way spread|2-way spread|Gap between teams|Match result and|Both teams to score and|Both teams to score &|Double chance and|Total goal bands|Total corner bands|Both teams to have|Both teams to score both halves|Goal to be scored|Run of play|Win from behind|Win either half|Half with|Half to produce|To happen|Multi goal|Multiple correct score|Match won by|Any team to come|Player to score|Shots on target)$/i.test(text)
    ) {
      return i;
    }

    if (
      /\b(to score in both halves|to win to nil|to lead at anytime|to score$|No bet$)\b/i.test(text)
    ) {
      return i;
    }
  }

  return lines.length;
}

function isBetMgmSoccerDisplayOnlyLine(value = "") {
  const text = normalizeLine(value);

  return (
    /^(Regular time|1st half|2nd half|Over|Under|Show More|Show Less)$/i.test(text)
  );
}

function parseBetMgmSoccerOdds(value) {
  const text = normalizeLine(value);

  if (/^EVEN$/i.test(text)) return 100;

  return parseAmericanOdds(text);
}

function normalizeBetMgmSoccerSelection(value = "") {
  return normalizeLine(value)
    .replace(/\btie\b/gi, "Draw")
    .replace(/\bor\b/gi, "Or")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBetMgmSoccerMatchResult(lines, startIndex, event, away, home, sport) {
  const rows = [];
  const idx = findBetMgmSoccerSectionIndex(lines, startIndex, /^Match result$/i);
  if (idx === -1) return rows;

  const end = findBetMgmSoccerSectionEnd(lines, idx + 1);

  for (let i = idx + 1; i < end - 1; i += 1) {
    const label = normalizeLine(lines[i]);
    if (isBetMgmSoccerDisplayOnlyLine(label)) continue;

    const odds = parseBetMgmSoccerOdds(lines[i + 1]);

    if (odds === null) continue;

    if (normalizeLine(label).toLowerCase() === normalizeLine(away).toLowerCase()) {
      rows.push(buildRow({ sport, event, marketType: "moneyline_3way", selection: away, lineValue: null, oddsAmerican: odds }));
      i += 1;
      continue;
    }

    if (/^(Tie|Draw)$/i.test(label)) {
      rows.push(buildRow({ sport, event, marketType: "moneyline_3way", selection: "Draw", lineValue: null, oddsAmerican: odds }));
      i += 1;
      continue;
    }

    if (normalizeLine(label).toLowerCase() === normalizeLine(home).toLowerCase()) {
      rows.push(buildRow({ sport, event, marketType: "moneyline_3way", selection: home, lineValue: null, oddsAmerican: odds }));
      i += 1;
      continue;
    }
  }

  return rows;
}

function parseBetMgmSoccerTotalSection(lines, startIndex, event, sport, headerPattern, marketType) {
  const rows = [];
  const idx = findBetMgmSoccerSectionIndex(lines, startIndex, headerPattern);
  if (idx === -1) return rows;

  const end = findBetMgmSoccerSectionEnd(lines, idx + 1);

  for (let i = idx + 1; i < end - 3; i += 1) {
    const current = normalizeLine(lines[i]);
    if (isBetMgmSoccerDisplayOnlyLine(current)) continue;

    const overMatch = current.match(/^Over\s+(\d+(?:\.\d+)?)$/i);
    if (!overMatch) continue;

    const overLine = Number(overMatch[1]);
    const overOdds = parseBetMgmSoccerOdds(lines[i + 1]);
    const underMatch = normalizeLine(lines[i + 2]).match(/^Under\s+(\d+(?:\.\d+)?)$/i);
    const underOdds = parseBetMgmSoccerOdds(lines[i + 3]);

    if (
      overOdds === null ||
      !underMatch ||
      underOdds === null
    ) {
      continue;
    }

    const underLine = Number(underMatch[1]);

    if (!Number.isFinite(overLine) || !Number.isFinite(underLine) || Math.abs(overLine - underLine) > 0.0001) {
      continue;
    }

    rows.push(
      buildRow({
        sport,
        event,
        marketType,
        selection: "Over",
        lineValue: overLine,
        oddsAmerican: overOdds,
      }),
      buildRow({
        sport,
        event,
        marketType,
        selection: "Under",
        lineValue: underLine,
        oddsAmerican: underOdds,
      })
    );

    i += 3;
  }

  return rows;
}

function parseBetMgmSoccerYesNoSection(lines, startIndex, event, sport, headerPattern, marketType) {
  const rows = [];
  const idx = findBetMgmSoccerSectionIndex(lines, startIndex, headerPattern);
  if (idx === -1) return rows;

  const end = findBetMgmSoccerSectionEnd(lines, idx + 1);

  for (let i = idx + 1; i < end - 1; i += 1) {
    const label = normalizeLine(lines[i]);
    if (isBetMgmSoccerDisplayOnlyLine(label)) continue;

    const odds = parseBetMgmSoccerOdds(lines[i + 1]);

    if (!/^(Yes|No)$/i.test(label) || odds === null) continue;

    rows.push(
      buildRow({
        sport,
        event,
        marketType,
        selection: /^Yes$/i.test(label) ? "Yes" : "No",
        lineValue: null,
        oddsAmerican: odds,
      })
    );

    i += 1;
  }

  return rows;
}

function parseBetMgmSoccerDoubleChance(lines, startIndex, event, sport) {
  const rows = [];
  const idx = findBetMgmSoccerSectionIndex(lines, startIndex, /^Double chance$/i);
  if (idx === -1) return rows;

  const end = findBetMgmSoccerSectionEnd(lines, idx + 1);

  for (let i = idx + 1; i < end - 1; i += 1) {
    const label = normalizeBetMgmSoccerSelection(lines[i]);
    if (isBetMgmSoccerDisplayOnlyLine(label)) continue;

    const odds = parseBetMgmSoccerOdds(lines[i + 1]);

    if (odds === null) continue;
    if (!/\bOr\b/i.test(label)) continue;

    rows.push(
      buildRow({
        sport,
        event,
        marketType: "double_chance",
        selection: label,
        lineValue: null,
        oddsAmerican: odds,
      })
    );

    i += 1;
  }

  return rows;
}

function parseBetMgmNhlVisiblePlayerPropsFallback(lines, sport) {
  const text = (lines || []).join(" ");

  if (
    !/\bBETMGM_/i.test(text) &&
    !/\bPlayer props\b/i.test(text) &&
    !/\bAnytime goalscorer\b/i.test(text)
  ) {
    return [];
  }

  const looksLikeNhl =
    String(sport || "").toUpperCase() === "NHL" ||
    /\bHockey\b/i.test(text) ||
    /\bNHL\b/i.test(text) ||
    /\bAnytime goalscorer\b/i.test(text) ||
    /\bPlayer shots\b/i.test(text) ||
    /\bGoalie saves\b/i.test(text);

  if (!looksLikeNhl) return [];

  const detailEvent = findBetMgmVisibleSelectedEvent(lines);
  if (!detailEvent) return [];

  const away = normalizeBetMgmEventTeamName(detailEvent.away);
  const home = normalizeBetMgmEventTeamName(detailEvent.home);
  const event = `${away} @ ${home}`;
  const startIndex = detailEvent.startIndex;

  const rows = [];

  rows.push(...parseBetMgmNhlAnytimeGoalscorer(lines, startIndex, event));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Player shots", "player_shots_on_goal"));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Player assists", "player_assists"));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Player points", "player_points"));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Goalie saves", "player_saves"));

  return rows;
}

function findBetMgmVisibleSelectedEvent(lines) {
  for (let i = 0; i < lines.length - 8; i += 1) {
    if (!/^(Today|Tomorrow|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(normalizeLine(lines[i]))) continue;
    if (!isLikelyTimeLine(lines[i + 1])) continue;

    let cursor = i + 2;

    if (isLikelyBroadcastLine(lines[cursor])) {
      cursor += 1;
    }

    const away = normalizeLine(lines[cursor]);
    const home = normalizeLine(lines[cursor + 1]);

    if (!isLikelyTeamName(away) || !isLikelyTeamName(home) || away === home) continue;

    const after = lines.slice(cursor + 2, Math.min(lines.length, cursor + 120)).join(" ");

    if (
      /\bSGP\b/i.test(after) &&
      /\bPlayer props\b/i.test(after) &&
      (
        /\bAnytime goalscorer\b/i.test(after) ||
        /\bPlayer shots\b/i.test(after) ||
        /\bPlayer assists\b/i.test(after) ||
        /\bPlayer points\b/i.test(after) ||
        /\bGoalie saves\b/i.test(after)
      )
    ) {
      return {
        away,
        home,
        startIndex: cursor + 2,
      };
    }
  }

  return null;
}


function parseBetMgmNhlVisibleProps(lines, startIndex, event, sport) {
  const rows = [];
  const text = lines.slice(0, 260).join(" ");

  const looksLikeNhl =
    String(sport || "").toUpperCase() === "NHL" ||
    /\bHockey\b/i.test(text) ||
    /\bNHL\b/i.test(text) ||
    /\bAnytime goalscorer\b/i.test(text) ||
    /\bPlayer shots\b/i.test(text) ||
    /\bGoalie saves\b/i.test(text) ||
    /(canadiens|lightning|penguins|flyers|sabres|bruins|stars|wild|oilers|ducks|golden knights|mammoth)/i.test(text);

  if (!looksLikeNhl) return rows;

  rows.push(...parseBetMgmNhlAnytimeGoalscorer(lines, startIndex, event));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Player shots", "player_shots_on_goal"));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Player assists", "player_assists"));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Player points", "player_points"));
  rows.push(...parseBetMgmNhlOverUnderSection(lines, startIndex, event, "Goalie saves", "player_saves"));

  return rows;
}

function parseBetMgmNhlAnytimeGoalscorer(lines, startIndex, event) {
  const rows = [];
  const idx = findLineIndexAfter(lines, startIndex, /^Anytime goalscorer$/i);

  if (idx === -1) return rows;

  const end = findBetMgmNhlVisibleSectionEnd(lines, idx + 1);

  for (let i = idx + 1; i < end - 1; i += 1) {
    const player = normalizeLine(lines[i]);
    const odds = parseAmericanOdds(lines[i + 1]);

    if (!looksLikePlayerName(player) || odds === null) continue;

    rows.push(
      buildRow({
        sport: "NHL",
        event,
        marketType: "player_goals",
        selection: `${player} Over`,
        lineValue: 0.5,
        oddsAmerican: odds,
      })
    );

    i += 1;
  }

  return rows;
}

function parseBetMgmNhlOverUnderSection(lines, startIndex, event, headerText, marketType) {
  const rows = [];
  const idx = findLineIndexAfter(
    lines,
    startIndex,
    new RegExp(`^${escapeRegExp(headerText)}$`, "i")
  );

  if (idx === -1) return rows;

  const end = findBetMgmNhlVisibleSectionEnd(lines, idx + 1);

  for (let i = idx + 1; i < end - 4; i += 1) {
    const player = normalizeLine(lines[i]);

    if (/^(All|Canadiens|Lightning|Over|Under)$/i.test(player)) continue;
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
        sport: "NHL",
        event,
        marketType,
        selection: `${player} Over`,
        lineValue: overLine,
        oddsAmerican: overOdds,
      })
    );

    rows.push(
      buildRow({
        sport: "NHL",
        event,
        marketType,
        selection: `${player} Under`,
        lineValue: underLine,
        oddsAmerican: underOdds,
      })
    );

    i += 4;
  }

  return rows;
}

function findBetMgmNhlVisibleSectionEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (isBetMgmNhlVisibleSectionBoundary(line)) return i;
  }

  return lines.length;
}

function isBetMgmNhlVisibleSectionBoundary(value) {
  const text = normalizeLine(value);

  if (!text) return false;

  if (
    isHardStopLine(text) ||
    /^Missouri$/i.test(text) ||
    /^Current time:/i.test(text) ||
    /^Bet slip$/i.test(text) ||
    /^My Bets$/i.test(text)
  ) {
    return true;
  }

  if (/^Show Less$/i.test(text)) return false;
  if (/^(All|Over|Under)$/i.test(text)) return false;

  // BetMGM puts team-filter labels inside each market:
  // All / Canadiens / Hurricanes / Over / Under
  // or All / Avalanche / Golden Knights / Over / Under.
  // These are not section boundaries. Use generic team-name detection instead
  // of hard-coding team names.
  if (isLikelyTeamName(text)) return false;

  return (
    /^Anytime goalscorer: Either player$/i.test(text) ||
    /^First goalscorer$/i.test(text) ||
    /^First goalscorer: Either player$/i.test(text) ||
    /^Player to score \d+\+ goals$/i.test(text) ||
    /^Player shots$/i.test(text) ||
    /^Player assists$/i.test(text) ||
    /^Player points$/i.test(text) ||
    /^Player blocked shots$/i.test(text) ||
    /^Player power play points$/i.test(text) ||
    /^Goalie saves$/i.test(text) ||
    /^Goalie shutouts$/i.test(text) ||
    /^Goals against$/i.test(text) ||
    /^.+ : Star player props$/i.test(text) ||
    /^.+: Star player props$/i.test(text) ||
    /^.+: Goalie props$/i.test(text) ||
    /^.+ : Goalie props$/i.test(text)
  );
}


function normalizeBetMgmEventTeamName(value) {
  const text = normalizeLine(value);

  const aliases = new Map([
    ["Knicks", "New York Knicks"],
    ["NY Knicks", "New York Knicks"],
    ["Hawks", "Atlanta Hawks"],
    ["ATL Hawks", "Atlanta Hawks"],

    ["Celtics", "Boston Celtics"],
    ["BOS Celtics", "Boston Celtics"],
    ["76ers", "Philadelphia 76ers"],
    ["PHI 76ers", "Philadelphia 76ers"],

    ["Nuggets", "Denver Nuggets"],
    ["DEN Nuggets", "Denver Nuggets"],
    ["Timberwolves", "Minnesota Timberwolves"],
    ["MIN Timberwolves", "Minnesota Timberwolves"],

    ["Pistons", "Detroit Pistons"],
    ["DET Pistons", "Detroit Pistons"],
    ["Magic", "Orlando Magic"],
    ["ORL Magic", "Orlando Magic"],

    ["Cavaliers", "Cleveland Cavaliers"],
    ["CLE Cavaliers", "Cleveland Cavaliers"],
    ["Raptors", "Toronto Raptors"],
    ["TOR Raptors", "Toronto Raptors"],

    ["Lakers", "Los Angeles Lakers"],
    ["LA Lakers", "Los Angeles Lakers"],
    ["LAL Lakers", "Los Angeles Lakers"],
    ["Rockets", "Houston Rockets"],
    ["HOU Rockets", "Houston Rockets"],

    ["ATL Dream", "Atlanta Dream"],
    ["Dream", "Atlanta Dream"],
    ["CHI Sky", "Chicago Sky"],
    ["Sky", "Chicago Sky"],
    ["CON Sun", "Connecticut Sun"],
    ["CT Sun", "Connecticut Sun"],
    ["Sun", "Connecticut Sun"],
    ["DAL Wings", "Dallas Wings"],
    ["Wings", "Dallas Wings"],
    ["GS Valkyries", "Golden State Valkyries"],
    ["GSV Valkyries", "Golden State Valkyries"],
    ["Valkyries", "Golden State Valkyries"],
    ["IND Fever", "Indiana Fever"],
    ["Fever", "Indiana Fever"],
    ["LV Aces", "Las Vegas Aces"],
    ["LVA Aces", "Las Vegas Aces"],
    ["Aces", "Las Vegas Aces"],
    ["LA Sparks", "Los Angeles Sparks"],
    ["Sparks", "Los Angeles Sparks"],
    ["MIN Lynx", "Minnesota Lynx"],
    ["Lynx", "Minnesota Lynx"],
    ["NY Liberty", "New York Liberty"],
    ["NYL Liberty", "New York Liberty"],
    ["Liberty", "New York Liberty"],
    ["PHO Mercury", "Phoenix Mercury"],
    ["PHX Mercury", "Phoenix Mercury"],
    ["Mercury", "Phoenix Mercury"],
    ["POR Fire", "Portland Fire"],
    ["Fire", "Portland Fire"],
    ["SEA Storm", "Seattle Storm"],
    ["Storm", "Seattle Storm"],
    ["TOR Tempo", "Toronto Tempo"],
    ["Tempo", "Toronto Tempo"],
    ["WAS Mystics", "Washington Mystics"],
    ["WSH Mystics", "Washington Mystics"],
    ["Mystics", "Washington Mystics"],

  ]);

  return aliases.get(text) || text;
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
  if (/\b(Soccer|FIFA|World Cup|UEFA|CONCACAF|CONMEBOL|MLS|Premier League|La Liga|Bundesliga|Serie A|Ligue 1)\b/i.test(text)) return "SOCCER";
  if (/WNBA/i.test(text)) return "WNBA";
  if (/NBA/i.test(text)) return "NBA";
  if (/NHL/i.test(text)) return "NHL";
  if (/MLB/i.test(text)) return "MLB";

  // WNBA team detection
  if (/(dream|chicago sky|connecticut sun|dallas wings|golden state valkyries|valkyries|indiana fever|las vegas aces|aces|los angeles sparks|sparks|minnesota lynx|lynx|new york liberty|liberty|phoenix mercury|mercury|portland fire|toronto tempo|seattle storm|washington mystics|mystics)/i.test(text)) {
    return "WNBA";
  }

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
    // BetMGM/FanDuel can append team codes to player names:
    // Sebastian Aho (CAR), Connor McDavid (EDM), etc.
    // Strip only simple trailing uppercase team codes.
    .replace(/\s+\([A-Z]{2,4}\)$/g, "")
    .trim();
}

function isLikelyTeamName(value) {
  const text = normalizeLine(value);
  if (!text || !/[A-Za-z]/.test(text)) return false;
  if (/\d{1,2}:\d{2}/.test(text) || /\b(am|pm)\b/i.test(text)) return false;
  if (isFalseBetMgmEventTeamName(text)) return false;
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
  if (isFalseBetMgmEventTeamName(text)) return false;
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
    if (typeof pattern === "function") {
      if (pattern(lines[i])) return i;
      continue;
    }

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
  const text = normalizeLine(value);

  if (/^To Win the Tip\s*\(/i.test(text)) return true;
  if (/^To Win the Tip\b/i.test(text)) return true;

  return /^(betting news|view full article|author|about|privacy policy|responsible gaming|terms of use|if you or someone you know)/i.test(text);
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
