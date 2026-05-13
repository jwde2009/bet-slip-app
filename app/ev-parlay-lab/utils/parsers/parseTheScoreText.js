import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `score_row_${nextId++}`;
}

export function parseTheScoreText(rawText = "", context = {}) {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const sport = inferSport(lines, context);
  const hasStructuredExport = lines.some((line) =>
    /^THESCORE_STRUCTURED_EXPORT$/i.test(normalizeLine(line))
  );

  // Fast path:
  // Extension exports are already structured. Do not run the slower detail/landing-page
  // scanners first, because they can scan the same huge text repeatedly.
  if (hasStructuredExport) {
    const structuredRows = parseStructuredExport(lines, context);
    return dedupeRows(
      keepTheScoreMatchableRows(structuredRows.filter(isSafeTheScoreRow))
    );
  }

  const rows = [];

  const detailEvent = findDetailEvent(lines);
  if (detailEvent) {
    const event = `${detailEvent.away} @ ${detailEvent.home}`;

    rows.push(...parseDetailMainLines(lines, detailEvent.startIndex, event, detailEvent.away, detailEvent.home, sport));
    rows.push(...parseDetailOuProps(lines, detailEvent.startIndex, event, sport));

    // Keep non-O/U ladder/binary parsing out of normal EV matching for now.
    // These create lots of no-sharp rows and slow the review page.
    // rows.push(...parseDetailPlusLadders(lines, detailEvent.startIndex, event, sport));
    // rows.push(...parseDetailYesNoProps(lines, detailEvent.startIndex, event, sport));
  }

  if (rows.length === 0) {
    rows.push(...parseLandingGames(lines, sport));
  }

  return dedupeRows(
    keepTheScoreMatchableRows(rows.filter(isSafeTheScoreRow))
  );
}


function isTheScoreFakeEventSide(value = "") {
  const text = normalizeLine(value);

  return (
    /\bto record a double double\b/i.test(text) ||
    /\bto record a triple double\b/i.test(text) ||
    /\brace to \d+\s+points\b/i.test(text) ||
    /\bmethod of (first|1st) basket\b/i.test(text) ||
    /\bfirst field goal scorer\b/i.test(text) ||
    /\bfirst player to\b/i.test(text)
  );
}

function isTheScoreFakeEvent(away = "", home = "") {
  if (!away || !home) return false;

  return isTheScoreFakeEventSide(away) || isTheScoreFakeEventSide(home);
}

function isSafeTheScoreRow(row = {}) {
  if (!row) return false;

  if (isFakeTheScoreEvent(row.eventLabelRaw)) return false;
  if (isFakeTheScoreMainLineRow(row)) return false;

  return true;
}

function isFakeTheScoreEvent(event = "") {
  const text = normalizeLine(event);

  if (!text) return true;

  // Bad structured exports seen in review:
  // Race To 20 Points @ Race To 30 Points
  if (/\bRace To \d+ Points\b/i.test(text)) return true;

  const parts = text
    .split(/\s*@\s*/i)
    .map((part) => normalizeLine(part))
    .filter(Boolean);

  if (parts.length === 2) {
    const bothDoubleOrTripleDoublePlayers = parts.every((part) =>
      /\bTo Record A (Double|Triple) Double\b/i.test(part)
    );

    if (bothDoubleOrTripleDoublePlayers) return true;

    const bothFirstBasketProps = parts.every((part) =>
      /\bMethod of (First|1st) Basket\b/i.test(part) ||
      /^First (Field Goal|Player|Team)/i.test(part)
    );

    if (bothFirstBasketProps) return true;
  }

  return false;
}

function isFakeTheScoreMainLineRow(row = {}) {
  const marketType = String(row.marketType || "").toLowerCase();
  const event = normalizeLine(row.eventLabelRaw || "");
  const selection = normalizeLine(row.selectionNormalized || row.selectionRaw || "");

  const isMainLine =
    marketType === "moneyline_2way" ||
    marketType === "moneyline_3way" ||
    marketType === "moneyline" ||
    marketType === "spread" ||
    marketType === "total";

  if (!isMainLine) return false;

  if (/\bTo Record A (Double|Triple) Double\b/i.test(selection)) return true;
  if (/\bRace To \d+ Points\b/i.test(selection)) return true;
  if (/\bMethod of (First|1st) Basket\b/i.test(selection)) return true;
  if (/\bTotal Goals$/i.test(selection)) return true;

  // Fake H2H-player card rows inside a real team event:
  // Market: Moneyline
  // Shai Gilgeous-Alexander | +1500
  // Austin Reaves | -5000
  //
  // These are not team moneylines and should not be in mainline matching.
  if (event.includes("@")) {
    const eventParts = event
      .split(/\s*@\s*/i)
      .map((part) => normalizeLine(part).toLowerCase())
      .filter(Boolean);

    const normalizedSelection = selection.toLowerCase();

    if (/^(over|under)$/i.test(selection)) return false;

    const isEventTeam = eventParts.some((team) => {
      if (!team) return false;
      return team === normalizedSelection || team.includes(normalizedSelection) || normalizedSelection.includes(team);
    });

    const looksLikePlayerName =
      /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(selection) ||
      /^[A-Z][a-z]{1,4}\.\s+[A-Z][A-Za-z.'-]+$/.test(selection);

    if (!isEventTeam && looksLikePlayerName) return true;
  }

  return false;
}

function keepTheScoreMatchableRows(rows = []) {
  const safeRows = (rows || []).filter(Boolean);

  const pairCounts = new Map();

  function playerPropPairKey(row = {}) {
    return [
      normalizeLine(row.sportsbook || "TheScore"),
      normalizeLine(row.sport || ""),
      normalizeLine(row.eventLabelRaw || ""),
      normalizeLine(row.marketType || ""),
      normalizeLine(extractTheScorePlayerSubject(row)),
      normalizeLine(row.lineValue ?? ""),
    ].join("||").toLowerCase();
  }

  function sideForRow(row = {}) {
    const selection = normalizeLine(row.selectionNormalized || row.selectionRaw || "");
    if (/\bover\b/i.test(selection) || /^yes$/i.test(selection)) return "over";
    if (/\bunder\b/i.test(selection) || /^no$/i.test(selection)) return "under";
    return "";
  }

  for (const row of safeRows) {
    if (!isTheScorePlayerPropRow(row)) continue;

    const side = sideForRow(row);
    if (!side) continue;

    const key = playerPropPairKey(row);

    if (!pairCounts.has(key)) {
      pairCounts.set(key, new Set());
    }

    pairCounts.get(key).add(side);
  }

  return safeRows.filter((row) => {
    const marketType = String(row.marketType || "").toLowerCase();

    // Keep true team/game main lines.
    if (
      marketType === "moneyline_2way" ||
      marketType === "moneyline_3way" ||
      marketType === "spread" ||
      marketType === "total"
    ) {
      return true;
    }

    // Keep real Double-Double / Triple-Double rows from the true team event.
    // Fake DD/TD-vs-DD/TD "events" are already blocked by isFakeTheScoreEvent().
    if (marketType === "double_double" || marketType === "triple_double") return true;

    if (!isTheScorePlayerPropRow(row)) return false;

    const key = playerPropPairKey(row);
    const sides = pairCounts.get(key);

    // Keep only two-sided O/U-style markets.
    // This drops one-sided ladders like 25+, 30+, 35+ that create huge row counts.
    return sides?.has("over") && sides?.has("under");
  });
}

function isTheScorePlayerPropRow(row = {}) {
  const marketType = String(row.marketType || "").toLowerCase();

  return (
    marketType.startsWith("player_") ||
    marketType === "player_points" ||
    marketType === "player_assists" ||
    marketType === "player_rebounds" ||
    marketType === "player_threes" ||
    marketType === "player_pra" ||
    marketType === "player_points_rebounds" ||
    marketType === "player_points_assists" ||
    marketType === "player_rebounds_assists" ||
    marketType === "double_double" ||
    marketType === "triple_double"
  );
}

function extractTheScorePlayerSubject(row = {}) {
  const selection = normalizeLine(row.selectionNormalized || row.selectionRaw || "");

  return selection
    .replace(/\bOver\b/i, "")
    .replace(/\bUnder\b/i, "")
    .replace(/\bYES\b/i, "")
    .replace(/\bNO\b/i, "")
    .trim();
}


function parseLandingGames(lines, sport) {
  const rows = [];

  for (let i = 0; i < lines.length - 13; i += 1) {
    if (isLiveMarker(lines[i]) || isLiveClockLine(lines[i])) continue;

    const away = lines[i];

    if (!isLikelyTeamName(away)) continue;

    // NBA-style scheduled row:
    // Team / record / spread / odds / O total / odds / money / Team / record / spread / odds / U total / odds / money
    const nbaHome = lines[i + 7];
    const awayMeta = lines[i + 1];
    const homeMeta = lines[i + 8];

    if (
      isLikelyTeamName(nbaHome) &&
      (looksLikeRecordLine(awayMeta) || isSkippableMetaLine(awayMeta)) &&
      (looksLikeRecordLine(homeMeta) || isSkippableMetaLine(homeMeta))
    ) {
      const parsed = {
        spreadA: parseSignedNumber(lines[i + 2]),
        spreadAOdds: parseAmericanOdds(lines[i + 3]),
        totalLineOver: parseTotalToken(lines[i + 4], "O"),
        totalOverOdds: parseAmericanOdds(lines[i + 5]),
        moneylineA: parseAmericanOdds(lines[i + 6]),
        spreadB: parseSignedNumber(lines[i + 9]),
        spreadBOdds: parseAmericanOdds(lines[i + 10]),
        totalLineUnder: parseTotalToken(lines[i + 11], "U"),
        totalUnderOdds: parseAmericanOdds(lines[i + 12]),
        moneylineB: parseAmericanOdds(lines[i + 13]),
      };

      if (
        parsed.spreadA !== null &&
        parsed.spreadAOdds !== null &&
        parsed.totalLineOver !== null &&
        parsed.totalOverOdds !== null &&
        parsed.moneylineA !== null &&
        parsed.spreadB !== null &&
        parsed.spreadBOdds !== null &&
        parsed.totalLineUnder !== null &&
        parsed.totalUnderOdds !== null &&
        parsed.moneylineB !== null
      ) {
        if (isTheScoreFakeEvent(away, nbaHome)) continue;

        const event = `${away} @ ${nbaHome}`;
        rows.push(...buildMainRows(event, away, nbaHome, sport, {
          spreadA: parsed.spreadA,
          spreadAOdds: parsed.spreadAOdds,
          moneylineA: parsed.moneylineA,
          spreadB: parsed.spreadB,
          spreadBOdds: parsed.spreadBOdds,
          moneylineB: parsed.moneylineB,
          totalLine: parsed.totalLineOver,
          totalOverOdds: parsed.totalOverOdds,
          totalUnderOdds: parsed.totalUnderOdds,
        }));
        continue;
      }
    }

    // NHL-style scheduled row:
    // Team / spread / odds / O total / odds / money / Team / spread / odds / U total / odds / money
    const nhlHome = lines[i + 6];

    if (isLikelyTeamName(nhlHome)) {
      const parsed = {
        spreadA: parseSignedNumber(lines[i + 1]),
        spreadAOdds: parseAmericanOdds(lines[i + 2]),
        totalLineOver: parseTotalToken(lines[i + 3], "O"),
        totalOverOdds: parseAmericanOdds(lines[i + 4]),
        moneylineA: parseAmericanOdds(lines[i + 5]),
        spreadB: parseSignedNumber(lines[i + 7]),
        spreadBOdds: parseAmericanOdds(lines[i + 8]),
        totalLineUnder: parseTotalToken(lines[i + 9], "U"),
        totalUnderOdds: parseAmericanOdds(lines[i + 10]),
        moneylineB: parseAmericanOdds(lines[i + 11]),
      };

      if (
        parsed.spreadA !== null &&
        parsed.spreadAOdds !== null &&
        parsed.totalLineOver !== null &&
        parsed.totalOverOdds !== null &&
        parsed.moneylineA !== null &&
        parsed.spreadB !== null &&
        parsed.spreadBOdds !== null &&
        parsed.totalLineUnder !== null &&
        parsed.totalUnderOdds !== null &&
        parsed.moneylineB !== null
      ) {
        if (isTheScoreFakeEvent(away, nhlHome)) continue;

        const event = `${away} @ ${nhlHome}`;
        rows.push(...buildMainRows(event, away, nhlHome, sport, {
          spreadA: parsed.spreadA,
          spreadAOdds: parsed.spreadAOdds,
          moneylineA: parsed.moneylineA,
          spreadB: parsed.spreadB,
          spreadBOdds: parsed.spreadBOdds,
          moneylineB: parsed.moneylineB,
          totalLine: parsed.totalLineOver,
          totalOverOdds: parsed.totalOverOdds,
          totalUnderOdds: parsed.totalUnderOdds,
        }));
        continue;
      }
    }
  }

  return rows;
}

function findDetailEvent(lines) {
  const startsIndex = lines.findIndex((line) => /^Starts In:?$/i.test(line));
  if (startsIndex !== -1) {
    for (let i = startsIndex - 12; i < startsIndex + 20 && i < lines.length; i += 1) {
      if (i < 0) continue;
      if (looksLikeInlineEvent(lines[i])) {
        const parts = splitInlineEvent(lines[i]);
        if (parts) {
          return {
            away: parts.away,
            home: parts.home,
            startIndex: Math.max(0, i - 20),
          };
        }
      }
    }
  }

  const inlineEventIdx = lines.findIndex((line) => looksLikeInlineEvent(line));
  if (inlineEventIdx !== -1) {
    const parts = splitInlineEvent(lines[inlineEventIdx]);
    if (parts) {
      return {
        away: parts.away,
        home: parts.home,
        startIndex: Math.max(0, inlineEventIdx - 20),
      };
    }
  }

  return null;
}

function parseDetailMainLines(lines, startIndex, event, away, home, sport) {
  const rows = [];
  const searchStart = Math.max(0, startIndex - 20);
  const mainIdx = findLineIndexAfter(lines, searchStart, /^Main Lines$/i);
  if (mainIdx === -1) return rows;

  for (let i = mainIdx; i < Math.min(lines.length - 13, mainIdx + 35); i += 1) {
    if (!sameText(lines[i], event)) continue;

    const block = lines.slice(i, i + 14).filter((line) => !isSkippableLine(line));

    const eventIdx = block.findIndex((line) => sameText(line, event));
    if (eventIdx === -1 || eventIdx + 13 >= block.length) continue;

    const teamA = block[eventIdx + 2];
    const spreadA = parseSignedNumber(block[eventIdx + 3]);
    const spreadAOdds = parseAmericanOdds(block[eventIdx + 4]);
    const totalOver = parseTotalToken(block[eventIdx + 5], "O");
    const totalOverOdds = parseAmericanOdds(block[eventIdx + 6]);
    const moneylineA = parseAmericanOdds(block[eventIdx + 7]);

    const teamB = block[eventIdx + 8];
    const spreadB = parseSignedNumber(block[eventIdx + 9]);
    const spreadBOdds = parseAmericanOdds(block[eventIdx + 10]);
    const totalUnder = parseTotalToken(block[eventIdx + 11], "U");
    const totalUnderOdds = parseAmericanOdds(block[eventIdx + 12]);
    const moneylineB = parseAmericanOdds(block[eventIdx + 13]);

    if (
      isPossibleTeamRef(teamA) &&
      spreadA !== null &&
      spreadAOdds !== null &&
      totalOver !== null &&
      totalOverOdds !== null &&
      moneylineA !== null &&
      isPossibleTeamRef(teamB) &&
      spreadB !== null &&
      spreadBOdds !== null &&
      totalUnder !== null &&
      totalUnderOdds !== null &&
      moneylineB !== null
    ) {
      rows.push(...buildMainRows(event, away, home, sport, {
        spreadA,
        spreadAOdds,
        moneylineA,
        spreadB,
        spreadBOdds,
        moneylineB,
        totalLine: totalOver,
        totalOverOdds,
        totalUnderOdds,
      }));
      return rows;
    }
  }

  return rows;
}

function parseDetailOuProps(lines, startIndex, event, sport) {
  const rows = [];
  const searchStart = Math.max(0, startIndex - 40);

  const sectionMap = [
    ["Points (O/U)", "player_points"],
    ["Rebounds (O/U)", "player_rebounds"],
    ["Assists (O/U)", "player_assists"],
    ["3-Pointers Made (O/U)", "player_threes"],
    ["Pts + Reb + Ast (O/U)", "player_pra"],
    ["Reb + Ast (O/U)", "player_rebounds_assists"],
    ["Shots On Goal", "player_shots_on_goal"],
    ["Saves", "player_saves"],
    ["Hits", "player_hits"],
    ["Goals", "player_goals"],
    ["Assists", "player_assists"],
    ["Power Play Points", "player_power_play_points"],
  ];

  for (const [header, marketType] of sectionMap) {
    const idx = findPropSectionIndex(lines, Math.max(0, startIndex - 40), header, event);
    if (idx === -1) continue;

    const end = findNextSectionIndex(lines, idx + 1);

    let i = idx + 1;
    while (i < end - 5) {
      const maybeEvent = lines[i];
      const maybePlayer = lines[i + 1];
      const maybeOver = lines[i + 2];
      const maybeOverOdds = lines[i + 3];
      const maybeUnder = lines[i + 4];
      const maybeUnderOdds = lines[i + 5];

      if (
        sameText(maybeEvent, event) &&
        looksLikePropSubject(maybePlayer) &&
        looksLikeOuToken(maybeOver, "O") &&
        parseAmericanOdds(maybeOverOdds) !== null &&
        looksLikeOuToken(maybeUnder, "U") &&
        parseAmericanOdds(maybeUnderOdds) !== null
      ) {
        const overLine = parseOuLine(maybeOver, "O");
        const underLine = parseOuLine(maybeUnder, "U");

        if (overLine !== null && underLine !== null && Math.abs(overLine - underLine) < 0.0001) {
          const player = normalizePropSubjectToPlayer(maybePlayer);

          rows.push(buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Over`,
            lineValue: overLine,
            oddsAmerican: parseAmericanOdds(maybeOverOdds),
          }));
          rows.push(buildRow({
            sport,
            event,
            marketType,
            selection: `${player} Under`,
            lineValue: underLine,
            oddsAmerican: parseAmericanOdds(maybeUnderOdds),
          }));

          i += 6;
          continue;
        }
      }

      i += 1;
    }
  }

  return rows;
}

function parseDetailPlusLadders(lines, startIndex, event, sport) {
  const rows = [];
  const searchStart = Math.max(0, startIndex - 40);

  const sections = [
    ["Points", "player_points"],
    ["Rebounds", "player_rebounds"],
    ["Assists", "player_assists"],
    ["3-Pointers Made", "player_threes"],
    ["Pts + Reb + Ast", "player_pra"],
    ["Pts + Reb", "player_points_rebounds"],
    ["Pts + Ast", "player_points_assists"],
    ["Reb + Ast", "player_rebounds_assists"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findPropSectionIndex(lines, searchStart, header, event);
    if (idx === -1) continue;

    const end = findNextSectionEndForLadders(lines, idx + 1);

    const thresholds = [];
    let thresholdIdx = -1;

    for (let i = idx + 1; i < end; i += 1) {
      if (!sameText(lines[i], event)) continue;

      const candidate = extractPlusTokensFromLine(lines[i + 1]);
      if (candidate.length) {
        thresholds.push(...candidate);
        thresholdIdx = i + 1;
        break;
      }
    }

    if (!thresholds.length || thresholdIdx === -1) continue;

    let i = thresholdIdx + 1;
    while (i < end) {
      const player = lines[i];

      if (!looksLikePlayerToken(player)) {
        i += 1;
        continue;
      }

      const odds = [];
      let j = i + 1;

      while (j < end && odds.length < thresholds.length) {
        const token = normalizeLine(lines[j]);

        if (/^Show more$/i.test(token)) break;
        if (sameText(token, event)) break;
        if ((isLikelySectionHeader(token) && !isComboHeader(token)) || isHardStopLine(token)) break;

        if (token === "--") {
          odds.push(null);
          j += 1;
          continue;
        }

        const american = parseAmericanOdds(token);
        if (american !== null) {
          odds.push(american);
        }

        j += 1;
      }

      for (let k = 0; k < Math.min(thresholds.length, odds.length); k += 1) {
        if (!Number.isFinite(odds[k])) continue;

        rows.push(buildRow({
          sport,
          event,
          marketType,
          selection: `${player} Over`,
          lineValue: thresholds[k] - 0.5,
          oddsAmerican: odds[k],
        }));
      }

      i = j;
    }
  }

  return dedupeRows(
    keepTheScoreMatchableRows(rows.filter(isSafeTheScoreRow))
  );
}

function parseDetailYesNoProps(lines, startIndex, event, sport) {
  const rows = [];
  const searchStart = Math.max(0, startIndex - 40);

  const sections = [
    ["Double Double", "double_double"],
    ["To Record A Double Double", "double_double"],
    ["Triple Double", "triple_double"],
    ["To Record A Triple Double", "triple_double"],
    ["Player Shutout", "player_shutout"],
    ["To Record A Shutout", "player_shutout"],
  ];

  for (const [header, marketType] of sections) {
    const idx = findLineIndexAfter(lines, searchStart, new RegExp(`^${escapeRegExp(header)}$`, "i"));
    if (idx === -1) continue;
    const end = findNextSectionIndex(lines, idx + 1);

    let i = idx + 1;
    while (i < end - 4) {
      const subject = lines[i];
      const yesLabel = lines[i + 1];
      const yesOdds = lines[i + 2];
      const noLabel = lines[i + 3];
      const noOdds = lines[i + 4];

      if (
        looksLikeLongSubject(subject) &&
        /^Yes$/i.test(yesLabel) &&
        parseAmericanOdds(yesOdds) !== null &&
        /^No$/i.test(noLabel) &&
        parseAmericanOdds(noOdds) !== null
      ) {
        rows.push(buildRow({
          sport,
          event,
          marketType,
          selection: normalizeSubject(subject, marketType),
          lineValue: null,
          oddsAmerican: parseAmericanOdds(yesOdds),
        }));
        i += 5;
        continue;
      }

      i += 1;
    }
  }

  return rows;
}

function parseStructuredExport(lines, context = {}) {
  const rows = [];

  let currentSport = String(context?.sport || "").toUpperCase() || "UNKNOWN";
  let currentEvent = String(context?.eventName || "").trim() || "Unknown Event";
  let currentMarket = "";
  let currentCaptureLabel = "";

  for (const line of lines) {
    if (/^THESCORE_STRUCTURED_EXPORT$/i.test(line)) continue;

    const captureMatch = line.match(/^THESCORE_MARKET_CAPTURE:\s*(.+)$/i);
    if (captureMatch) {
      currentCaptureLabel = normalizeLine(captureMatch[1]).toLowerCase();
      continue;
    }

    const sportMatch = line.match(/^Sport:\s*(.+)$/i);
    if (sportMatch) {
      currentSport = normalizeLine(sportMatch[1]).toUpperCase();
      continue;
    }

    const eventMatch = line.match(/^Event:\s*(.+)$/i);
    if (eventMatch) {
      currentEvent = normalizeLine(eventMatch[1]);
      continue;
    }

    const marketMatch = line.match(/^Market:\s*(.+)$/i);
    if (marketMatch) {
      currentMarket = normalizeLine(marketMatch[1]);
      continue;
    }

    const ouMatch = line.match(/^(.+?)\s*\|\s*(OVER|UNDER)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*((?:[+-]\d+)|EVEN)$/i);
    if (ouMatch) {
      const player = normalizeLine(ouMatch[1]);
      const side = ouMatch[2].toLowerCase();
      const lineValue = Number(ouMatch[3]);
      const oddsAmerican = /^EVEN$/i.test(ouMatch[4]) ? 100 : Number(ouMatch[4]);

      const marketType = inferStructuredMarketType(currentMarket, "ou");

      if (!player || !Number.isFinite(lineValue) || !Number.isFinite(oddsAmerican) || !marketType) {
        continue;
      }

      rows.push(buildRow({
        sport: currentSport,
        event: currentEvent,
        marketType,
        selection: `${player} ${side === "over" ? "Over" : "Under"}`,
        lineValue,
        oddsAmerican,
      }));

      continue;
    }

    const ladderMatch = line.match(/^(.+?)\s*\|\s*(\d+(?:\.\d+)?\+)\s*\|\s*((?:[+-]\d+)|EVEN)$/i);
    if (ladderMatch) {
      // SAFETY LOCK:
      // TheScore structured exports include ladder markets like:
      // E. Mobley | 15+ | -800
      //
      // Converting that to Over 14.5 creates fake O/U rows and can collide with
      // true O/U rows like:
      // E. Mobley | OVER | 14.5 | -125
      // E. Mobley | UNDER | 14.5 | -105
      //
      // For the EV/parlay workflow, keep true two-sided O/U rows only.
      // Do not convert one-sided ladders into standard O/U rows.
      continue;
    }

    const yesNoMatch = line.match(/^(.+?)\s*\|\s*(YES|NO)\s*\|\s*((?:[+-]\d+)|EVEN)$/i);
    if (yesNoMatch) {
      const player = normalizeLine(yesNoMatch[1]);
      const side = yesNoMatch[2].toUpperCase();
      const oddsAmerican = /^EVEN$/i.test(yesNoMatch[3]) ? 100 : Number(yesNoMatch[3]);

      const marketType = inferStructuredMarketType(currentMarket, "yesno");

      if (!player || !Number.isFinite(oddsAmerican) || !marketType) {
        continue;
      }

      rows.push(buildRow({
        sport: currentSport,
        event: currentEvent,
        marketType,
        selection: `${player} ${side === "YES" ? "Yes" : "No"}`,
        lineValue: null,
        oddsAmerican,
      }));

      continue;
    }

    const spreadMatch = line.match(/^(.+?)\s*\|\s*([+-]\d+(?:\.\d+)?)\s*\|\s*((?:[+-]\d+)|EVEN)$/i);
    if (spreadMatch && /^spread$/i.test(currentMarket)) {
      const team = normalizeLine(spreadMatch[1]);
      const lineValue = Number(spreadMatch[2]);
      const oddsAmerican = /^EVEN$/i.test(spreadMatch[3]) ? 100 : Number(spreadMatch[3]);

      if (!team || !Number.isFinite(lineValue) || !Number.isFinite(oddsAmerican)) {
        continue;
      }

      rows.push(buildRow({
        sport: currentSport,
        event: currentEvent,
        marketType: "spread",
        selection: team,
        lineValue,
        oddsAmerican,
      }));

      continue;
    }

    const totalMatch = line.match(/^(Over|Under)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*((?:[+-]\d+)|EVEN)$/i);
    if (totalMatch && /^total$/i.test(currentMarket)) {
      const side = totalMatch[1];
      const lineValue = Number(totalMatch[2]);
      const oddsAmerican = /^EVEN$/i.test(totalMatch[3]) ? 100 : Number(totalMatch[3]);

      if (!Number.isFinite(lineValue) || !Number.isFinite(oddsAmerican)) {
        continue;
      }

      // TheScore prop tabs often export "Market: Total" for prop/H2H widgets.
      // Examples:
      // NHL goals page: Total 0.5 / 1.5
      // NHL goalie page: Total 25.5
      // NBA prop pages: Total 2.5 / 3.5 / 6.5 / 53.5
      // Those are not game totals and should not pollute fair-odds matching.
      if (!isLikelyTheScoreGameTotal(currentSport, lineValue, currentCaptureLabel)) {
        continue;
      }

      rows.push(buildRow({
        sport: currentSport,
        event: currentEvent,
        marketType: "total",
        selection: side,
        lineValue,
        oddsAmerican,
      }));

      continue;
    }

    const moneylineMatch = line.match(/^(.+?)\s*\|\s*((?:[+-]\d+)|EVEN)$/i);
    if (moneylineMatch && /^moneyline$/i.test(currentMarket)) {
      const team = normalizeLine(moneylineMatch[1]);
      const oddsAmerican = /^EVEN$/i.test(moneylineMatch[2]) ? 100 : Number(moneylineMatch[2]);

      if (!team || !Number.isFinite(oddsAmerican)) {
        continue;
      }

      rows.push(buildRow({
        sport: currentSport,
        event: currentEvent,
        marketType: "moneyline_2way",
        selection: team,
        lineValue: null,
        oddsAmerican,
      }));

      continue;
    }
  }

  return rows;
}

function isLikelyTheScoreGameTotal(sport = "", lineValue, captureLabel = "") {
  const league = String(sport || "").toUpperCase();
  const line = Number(lineValue);
  const label = normalizeLine(captureLabel || "").toLowerCase();

  if (!Number.isFinite(line)) return false;

  // Do not keep totals that come from clearly prop-specific captures unless they
  // are within plausible full-game ranges.
  const isPropCapture =
    /points|assists|rebounds|threes|combos|goals|shots|saves|goalie|defense|power play/i.test(label);

  if (league === "NBA") {
    // NBA full-game totals are normally much larger than 100.
    // This intentionally drops prop/H2H totals like 2.5, 3.5, 6.5, 53.5.
    return line >= 100 && line <= 280;
  }

  if (league === "NHL") {
    // NHL full-game totals normally live around 4.5 to 8.5.
    // This drops goalscorer totals like 0.5/1.5 and goalie-save totals like 25.5.
    return line >= 4 && line <= 9;
  }

  if (league === "MLB") {
    return line >= 5 && line <= 15;
  }

  if (isPropCapture) return false;

  return true;
}


function inferStructuredMarketType(header, mode = "") {
  const text = normalizeLine(header).toLowerCase();

  if (text === "points (o/u)" || text === "points" || text === "player points") return "player_points";
  if (text === "rebounds (o/u)" || text === "rebounds" || text === "player rebounds") return "player_rebounds";
  if (text === "assists (o/u)" || text === "assists" || text === "player assists") return "player_assists";

  if (
    text === "3-pointers made (o/u)" ||
    text === "3-pointers made" ||
    text === "three-pointers made" ||
    text === "player threes" ||
    text === "player three-pointers"
  ) {
    return "player_threes";
  }

  if (
    text === "pts + reb + ast (o/u)" ||
    text === "pts + reb + ast" ||
    text === "points + rebounds + assists" ||
    text === "points + rebounds + assists (o/u)" ||
    text === "pra" ||
    text === "pra (o/u)"
  ) {
    return "player_pra";
  }

  if (
    text === "pts + reb" ||
    text === "pts + reb (o/u)" ||
    text === "points + rebounds" ||
    text === "points + rebounds (o/u)"
  ) {
    return "player_points_rebounds";
  }

  if (
    text === "pts + ast" ||
    text === "pts + ast (o/u)" ||
    text === "points + assists" ||
    text === "points + assists (o/u)" ||
    text === "points/assists"
  ) {
    return "player_points_assists";
  }

  if (
    text === "reb + ast (o/u)" ||
    text === "reb + ast" ||
    text === "rebounds + assists" ||
    text === "rebounds + assists (o/u)"
  ) {
    return "player_rebounds_assists";
  }

  if (text === "double double") return "double_double";
  if (text === "triple double") return "triple_double";

  if (text === "shots on goal") return "player_shots_on_goal";
  if (text === "goals") return "player_goals";
  if (text === "saves") return "player_saves";
  if (text === "player shutout") return "player_shutout";
  if (text === "power play points") return "player_power_play_points";
  if (text === "hits") return "player_hits";
  if (text === "points/assists") return "player_points_assists";

  if (text === "pitcher strikeouts") return "pitcher_strikeouts";
  if (text === "pitcher strikeouts (o/u)") return "pitcher_strikeouts";
  if (text === "outs recorded (o/u)") return "pitcher_outs_recorded";
  if (text === "hits allowed (o/u)") return "pitcher_hits_allowed";
  if (text === "earned runs allowed (o/u)") return "pitcher_earned_runs_allowed";
  if (text === "walks allowed (o/u)") return "pitcher_walks_allowed";

  if (text === "home runs") return "player_home_runs";
  if (text === "home runs (o/u)") return "player_home_runs";
  if (text === "rbis") return "player_rbis";
  if (text === "rbis (o/u)") return "player_rbis";
  if (text === "runs scored") return "player_runs";
  if (text === "runs scored (o/u)") return "player_runs";
  if (text === "total bases") return "player_total_bases";
  if (text === "total bases (o/u)") return "player_total_bases";
  if (text === "hits (o/u)") return "player_hits";

  return "";
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

  const text = lines.slice(0, 180).join(" ");

  if (/The Score NHL|NHL Landing Page|Game Page – Main|Game Page – Shots on Goal|Game Page – Goals|Game Page – Points \/ Assists|Game Page – Saves|Shots On Goal|Goalie\/Defense|SEA Kraken|COL Avalanche|MTL Canadiens|TB Lightning|OTT Senators|CAR Hurricanes/i.test(text)) {
    return "NHL";
  }

  if (/The Score NBA|NBA Landing Page|Game Page – Main|Game Page – Points|Game Page – Assists|Game Page – Rebounds|Game Page – Threes|Game Page - Combos|Player Points|Player Rebounds|Player Assists|Player Threes|Charlotte Hornets @ Orlando Magic|CHA Hornets|ORL Magic/i.test(text)) {
    return "NBA";
  }

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

function splitInlineEvent(value) {
  const text = normalizeLine(value);
  const parts = text.split(/\s@\s/);
  if (parts.length !== 2) return null;
  return { away: parts[0].trim(), home: parts[1].trim() };
}

function looksLikeInlineEvent(value) {
  const parts = splitInlineEvent(value);
  return !!(parts && parts.away && parts.home);
}

function isLikelyTeamName(value) {
  const text = normalizeLine(value);
  if (!text || !/[A-Za-z]/.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^\d{1,2}:\d{2}$/.test(text)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  if (/^[OU]\s*\d+(\.\d+)?$/i.test(text)) return false;
  if (/^(NBA|NHL|Lines|Futures|Series|See All|Hot Props|Popular|Player Points|Player Rebounds|Player Assists|Player Threes|Player Combos|Player Defense|Quarter|Half|Game Props|Specials|Featured Parlays|Main Lines|Alternate Game Spread|Alternate Total Points|Player To Score The First Basket \(Incl\. Free Throws\)|Goalscorer|Shots On Goal|Points\/Assists|Goalie\/Defense|Periods|Main|Money|Spread|Total|LIVE|Today|Tomorrow)$/i.test(text)) return false;
  if (/\b(Add To Betslip|bets placed|pays)\b/i.test(text)) return false;
  if (looksLikeInlineEvent(text)) return false;
  if (looksLikeRecordLine(text)) return false;
  return true;
}

function looksLikePlayerToken(value) {
  const text = normalizeLine(value);
  return /^[A-Z][A-Za-z'.-]{0,10}(?:\s[A-Z][A-Za-z'.-]{1,15}){0,2}$/.test(text) && !looksLikeInlineEvent(text);
}

function expandPlayerToken(value) {
  return normalizeLine(value);
}

function looksLikeLongSubject(value) {
  const text = normalizeLine(value);
  return /[A-Za-z]/.test(text) && !looksLikeInlineEvent(text) && !isLikelySectionHeader(text);
}

function normalizeSubject(value, marketType) {
  const text = normalizeLine(value);
  if (marketType === "double_double") return text.replace(/\s+To Record A Double Double$/i, "");
  if (marketType === "triple_double") return text.replace(/\s+To Record A Triple Double$/i, "");
  if (marketType === "player_shutout") return text.replace(/\s+To Record A Shutout$/i, "");
  return text;
}

function looksLikeRecordLine(value) {
  const text = normalizeLine(value);
  return /^\d{1,2}-\d{1,2}(?:-\d{1,2})?,/.test(text) || /^\d{1,2}-\d{1,2}(?:-\d{1,2})?$/.test(text);
}

function isSkippableMetaLine(value) {
  const text = normalizeLine(value);
  return /^([A-Z][a-z]{2}\s\d{1,2},\s\d{4}\s·\s\d{1,2}:\d{2}\s(?:AM|PM)|R\d, Game \d:|East Play-In Tournament|West Play-In Tournament)$/i.test(text);
}

function isPossibleTeamRef(value) {
  const text = normalizeLine(value);
  return /^[A-Z]{2,4}\s[A-Za-z]+$/i.test(text) || isLikelyTeamName(text);
}

function isSkippableLine(value) {
  const text = normalizeLine(value);
  return (
    /^Starts In:?$/i.test(text) ||
    /^\d{1,2}:\d{2}:\d{2}$/.test(text) ||
    /^\d{1,2}:\d{2}$/.test(text) ||
    /^(today|tomorrow)$/i.test(text) ||
    isLikelySectionHeader(text) ||
    looksLikeRecordLine(text) ||
    /^Apr \d{1,2}$/i.test(text) ||
    /^\d{1,2}:\d{2}\s*(am|pm)$/i.test(text)
  );
}

function isLikelySectionHeader(value) {
  const text = normalizeLine(value);

  // 🚫 EXCLUDE combo headers
  if (isComboHeader(text)) return false;

  return /^(Lines|Futures|Series|Popular|Player Points|Player Rebounds|Player Assists|Player Threes|Player Combos|Player Defense|Quarter|Half|Game Props|Specials|Featured Parlays|Main Lines|Alternate Game Spread|Alternate Total Points|Points|Rebounds|Assists|3-Pointers Made|Points \(O\/U\)|Rebounds \(O\/U\)|Assists \(O\/U\)|3-Pointers Made \(O\/U\)|Pts \+ Reb \+ Ast \(O\/U\)|Reb \+ Ast \(O\/U\)|Goalscorer|Shots On Goal|First To 5 Shots On Goal|Points\/Assists|Goalie\/Defense|Periods|Goals|Assists|Power Play Points|Saves|Hits|Player Shutout|Betting News|See All|Hot Props|Moving On|Series Specials|Playoff Specials)$/i.test(text);
}

function isComboHeader(value) {
  const text = normalizeLine(value);

  return /^(Pts \+ Reb \+ Ast|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast|Double Double|To Record A Double Double|Triple Double|To Record A Triple Double)$/i.test(text);
}

function findPropSectionIndex(lines, startIndex, header, event) {
  const pattern = new RegExp(`^${escapeRegExp(header)}$`, "i");

  for (let i = startIndex; i < lines.length; i += 1) {
    if (!pattern.test(lines[i])) continue;

    let headerIdx = i;

    for (let j = i + 1; j < Math.min(lines.length, i + 12); j += 1) {
      if (pattern.test(lines[j])) {
        headerIdx = j;
        continue;
      }

      if (sameText(lines[j], event)) {
        return headerIdx;
      }

      if (isHardStopLine(lines[j])) {
        break;
      }
    }
  }

  return -1;
}

function looksLikePropSubject(value) {
  const text = normalizeLine(value);

  if (looksLikePlayerToken(text)) return true;

  return /^(.*?)\s+Total\s+(Goals|Assists|Power Play Points|Saves|Hits)$/i.test(text);
}

function normalizePropSubjectToPlayer(value) {
  const text = normalizeLine(value);

  return text
    .replace(/\s+Total\s+Goals$/i, "")
    .replace(/\s+Total\s+Assists$/i, "")
    .replace(/\s+Total\s+Power Play Points$/i, "")
    .replace(/\s+Total\s+Saves$/i, "")
    .replace(/\s+Total\s+Hits$/i, "");
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

function isLiveMarker(value) {
  return /^LIVE$/i.test(normalizeLine(value));
}

function isLiveClockLine(value) {
  const text = normalizeLine(value);
  return /^(1st|2nd|3rd|4th)\s+\d{1,2}:\d{2}$/i.test(text) || /^(1st|2nd|3rd|4th)\s+\d{1,2}:\d{2}:\d{2}$/i.test(text);
}

function isHardStopLine(value) {
  return /^(Betting News|VIEW FULL ARTICLE|Author\(s\):|About|Privacy Policy|Responsible Gaming|Terms Of Use|If you or someone you know|Gambling can be addictive|BACK TO TOP)$/i.test(normalizeLine(value));
}

function parseAmericanOdds(value) {
  const text = normalizeLine(value);
  if (/^Even$/i.test(text)) return 100;
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

function looksLikeOuToken(value, expectedSide) {
  return parseOuLine(value, expectedSide) !== null;
}

function parseOuLine(value, expectedSide) {
  const text = normalizeLine(value);
  const m = text.match(/^([OU])\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  if (expectedSide && m[1].toUpperCase() !== String(expectedSide).toUpperCase()) return null;
  return Number(m[2]);
}

function looksLikeComboPlayerLabel(value) {
  const text = normalizeLine(value);

  return / - Alt (Pts \+ Reb \+ Ast|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast)$/i.test(text);
}

function inferComboMarketTypeFromPlayerLabel(value) {
  const text = normalizeLine(value);

  if (/ - Alt Pts \+ Reb \+ Ast$/i.test(text)) return "player_pra";
  if (/ - Alt Pts \+ Reb$/i.test(text)) return "player_points_rebounds";
  if (/ - Alt Pts \+ Ast$/i.test(text)) return "player_points_assists";
  if (/ - Alt Reb \+ Ast$/i.test(text)) return "player_rebounds_assists";

  return "";
}

function normalizeComboPlayerLabel(value) {
  return normalizeLine(value)
    .replace(/ - Alt Pts \+ Reb \+ Ast$/i, "")
    .replace(/ - Alt Pts \+ Reb$/i, "")
    .replace(/ - Alt Pts \+ Ast$/i, "")
    .replace(/ - Alt Reb \+ Ast$/i, "");
}

function inferNearestLadderMarketType(lines, index) {
  for (let i = index - 1; i >= Math.max(0, index - 12); i -= 1) {
    const text = normalizeLine(lines[i]);

    if (/^Pts \+ Reb \+ Ast$/i.test(text)) return "player_pra";
    if (/^Pts \+ Reb$/i.test(text)) return "player_points_rebounds";
    if (/^Pts \+ Ast$/i.test(text)) return "player_points_assists";
    if (/^Reb \+ Ast$/i.test(text)) return "player_rebounds_assists";
    if (/^Points$/i.test(text)) return "player_points";
    if (/^Rebounds$/i.test(text)) return "player_rebounds";
    if (/^Assists$/i.test(text)) return "player_assists";
    if (/^3-Pointers Made$/i.test(text)) return "player_threes";
  }

  return "";
}

function findNextSectionEndForLadders(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const text = normalizeLine(lines[i]);

    if (isHardStopLine(text)) return i;

    if (/^(Points|Rebounds|Assists|3-Pointers Made|Pts \+ Reb \+ Ast|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast|Double Double|Triple Double|Shots On Goal|Goals|Saves|Hits|Power Play Points)$/i.test(text)) {
      return i;
    }
  }

  return lines.length;
}

function extractPlusTokensFromLine(value) {
  const text = normalizeLine(value);
  const matches = text.match(/\d+(?:\.\d+)?\+/g);
  if (!matches) return [];
  return matches.map((token) => Number(token.replace(/\+$/, ""))).filter(Number.isFinite);
}

function parsePlusToken(value) {
  const text = normalizeLine(value);
  const m = text.match(/^(\d+(?:\.\d+)?)\+$/);
  return m ? Number(m[1]) : null;
}

function buildRow({ sport, event, marketType, selection, lineValue, oddsAmerican }) {
  return {
    id: makeId(),
    sportsbook: "TheScore",
    sport,
    eventLabelRaw: event,
    marketType,
    betType: marketType,
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

function sameText(a, b) {
  return normalizeLine(a).toLowerCase() === normalizeLine(b).toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

