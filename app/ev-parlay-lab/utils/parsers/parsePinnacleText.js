import { decimalToAmerican } from "../odds";

let nextId = 1;

function makeId() {
  return `pin_row_${nextId++}`;
}

export function parsePinnacleText(rawText, context = {}) {
  console.log("parsePinnacleText CALLED", {
    rawTextLength: rawText?.length || 0,
    sportsbook: context?.sportsbook,
  });

  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  console.log("PIN NORMALIZED LINE COUNT", lines.length);
  console.log("PIN FIRST 120 LINES", lines.slice(0, 120));

  const rows = [];

  const detailGame = findPinnacleDetailPageGame(lines);

  if (detailGame) {
  const { away, home, eventTitleIndex, marketStartIndex, sport, league } = detailGame;
  const event = `${away} @ ${home}`;

  const parsed = parsePinnacleDetailMarkets(lines, marketStartIndex, away, home);
  const playerPropRows = parsePinnaclePlayerProps(lines, marketStartIndex, {
    event,
    sport,
    league,
  });

  console.log("PIN DETAIL PAGE GAME", {
    away,
    home,
    event,
    eventTitleIndex,
    marketStartIndex,
    parsed,
    playerPropCount: playerPropRows.length,
  });

  pushParsedRows(rows, {
    event,
    away,
    home,
    parsed,
    sport,
    league,
  });

  rows.push(...playerPropRows);
}

  if (!detailGame && rows.length === 0) {
    for (let i = 0; i < lines.length; i += 1) {
      const game = findPinnacleListGameStart(lines, i);
      if (!game) continue;

      const { away, home, marketStartIndex } = game;
      const parsedBlock = tryParseMainGameBlock(lines, marketStartIndex);

      console.log("PIN LIST PAGE GAME", {
        i,
        away,
        home,
        marketStartIndex,
        parsedBlock,
        blockPreview: lines.slice(marketStartIndex, marketStartIndex + 18),
      });

      if (!parsedBlock) continue;

      const event = `${away} @ ${home}`;

      rows.push(
        makeRow({
          event,
          selection: away,
          marketType: "spread",
          lineValue: parsedBlock.spreadAwayLine,
          decimalOdds: parsedBlock.spreadAwayDec,
          sport: inferSportFromText(event),
          league: "",
        })
      );

      rows.push(
        makeRow({
          event,
          selection: away,
          marketType: "moneyline_2way",
          lineValue: null,
          decimalOdds: parsedBlock.mlAwayDec,
          sport: inferSportFromText(event),
          league: "",
        })
      );

      rows.push(
        makeRow({
          event,
          selection: "Over",
          marketType: "total",
          lineValue: parsedBlock.totalLine,
          decimalOdds: parsedBlock.overDec,
          sport: inferSportFromText(event),
          league: "",
        })
      );

      rows.push(
        makeRow({
          event,
          selection: home,
          marketType: "spread",
          lineValue: parsedBlock.spreadHomeLine,
          decimalOdds: parsedBlock.spreadHomeDec,
          sport: inferSportFromText(event),
          league: "",
        })
      );

      rows.push(
        makeRow({
          event,
          selection: home,
          marketType: "moneyline_2way",
          lineValue: null,
          decimalOdds: parsedBlock.mlHomeDec,
          sport: inferSportFromText(event),
          league: "",
        })
      );

      rows.push(
        makeRow({
          event,
          selection: "Under",
          marketType: "total",
          lineValue: parsedBlock.totalLine,
          decimalOdds: parsedBlock.underDec,
          sport: inferSportFromText(event),
          league: "",
        })
      );

      i = Math.max(i, parsedBlock.endIndex);
    }
  }

  const deduped = dedupeRows(rows);

  console.log("PIN FINAL ROW COUNT", deduped.length);
  console.log("PIN FINAL ROWS", deduped);

  return deduped;
}

function pushParsedRows(rows, { event, away, home, parsed, sport, league }) {
  const moneylineType = parsed.mlDrawDec !== null ? "moneyline_3way" : "moneyline_2way";

  if (parsed.mlAwayDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: away,
        marketType: moneylineType,
        lineValue: null,
        decimalOdds: parsed.mlAwayDec,
        sport,
        league,
      })
    );
  }

  if (parsed.mlDrawDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: "Draw",
        marketType: "moneyline_3way",
        lineValue: null,
        decimalOdds: parsed.mlDrawDec,
        sport,
        league,
      })
    );
  }

  if (parsed.mlHomeDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: home,
        marketType: moneylineType,
        lineValue: null,
        decimalOdds: parsed.mlHomeDec,
        sport,
        league,
      })
    );
  }

  if (parsed.spreadAwayLine !== null && parsed.spreadAwayDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: away,
        marketType: "spread",
        lineValue: parsed.spreadAwayLine,
        decimalOdds: parsed.spreadAwayDec,
        sport,
        league,
      })
    );
  }

  if (parsed.spreadHomeLine !== null && parsed.spreadHomeDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: home,
        marketType: "spread",
        lineValue: parsed.spreadHomeLine,
        decimalOdds: parsed.spreadHomeDec,
        sport,
        league,
      })
    );
  }

  if (parsed.totalLine !== null && parsed.overDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: "Over",
        marketType: "total",
        lineValue: parsed.totalLine,
        decimalOdds: parsed.overDec,
        sport,
        league,
      })
    );
  }

  if (parsed.totalLine !== null && parsed.underDec !== null) {
    rows.push(
      makeRow({
        event,
        selection: "Under",
        marketType: "total",
        lineValue: parsed.totalLine,
        decimalOdds: parsed.underDec,
        sport,
        league,
      })
    );
  }
}

function findPinnacleDetailPageGame(lines) {
  for (let i = 0; i < lines.length - 6; i += 1) {
    const maybeSport = lines[i];
    const maybeLeague = lines[i + 1];
    const maybeMatchup = lines[i + 2];
    const dateLine = lines[i + 3];
    const away = lines[i + 4];
    const home = lines[i + 5];

    // Full structured detail page:
    // Basketball / NBA / Miami Heat @ Charlotte Hornets / Tuesday...
    if (
      looksLikeSportLine(maybeSport) &&
      looksLikeLeagueOrCompetitionLine(maybeLeague) &&
      looksLikeAtOrVsMatchup(maybeMatchup) &&
      looksLikeDateTimeLine(dateLine) &&
      looksLikeTeamName(away) &&
      looksLikeTeamName(home)
    ) {
      const marketStartIndex = findFirstPinnacleSectionHeader(lines, i + 6);

      console.log("PIN DETAIL HEADER MATCH", {
        sport: maybeSport,
        league: maybeLeague,
        matchup: maybeMatchup,
        dateLine,
        away,
        home,
        marketStartIndex,
      });

      return {
        sport: inferSportFromText(`${maybeSport} ${maybeLeague} ${away} ${home}`),
        league: maybeLeague,
        away,
        home,
        eventTitleIndex: i + 2,
        marketStartIndex: marketStartIndex === -1 ? i + 6 : marketStartIndex,
      };
    }

    // Simpler detail page:
    // Tuesday... / Team / Team / tabs...
    if (
      looksLikeDateTimeLine(maybeSport) &&
      looksLikeTeamName(maybeLeague) &&
      looksLikeTeamName(maybeMatchup)
    ) {
      const marketStartIndex = findFirstPinnacleSectionHeader(lines, i + 3);

      if (marketStartIndex !== -1) {
        console.log("PIN DETAIL HEADER MATCH", {
          dateLine: maybeSport,
          away: maybeLeague,
          home: maybeMatchup,
          marketStartIndex,
        });

        return {
          sport: inferSportFromText(`${maybeLeague} ${maybeMatchup}`),
          league: "",
          away: maybeLeague,
          home: maybeMatchup,
          eventTitleIndex: i,
          marketStartIndex,
        };
      }
    }
  }

  return null;
}

function parsePinnacleDetailMarkets(lines, startIndex, away, home) {
  const result = {
    mlAwayDec: null,
    mlDrawDec: null,
    mlHomeDec: null,
    spreadAwayLine: null,
    spreadAwayDec: null,
    spreadHomeLine: null,
    spreadHomeDec: null,
    totalLine: null,
    overDec: null,
    underDec: null,
  };

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (/^Money Line\s*[–-]\s*(Match|Game)$/i.test(line)) {
      const parsed = parseMoneyLineSection(lines, i + 1, away, home);
      if (parsed) {
        result.mlAwayDec = parsed.awayDec;
        result.mlDrawDec = parsed.drawDec;
        result.mlHomeDec = parsed.homeDec;
      }
      continue;
    }

    if (/^Handicap\s*[–-]\s*(Match|Game)$/i.test(line)) {
      const parsed = parseHandicapSection(lines, i + 1, away, home);
      if (parsed) {
        result.spreadAwayLine = parsed.awayLine;
        result.spreadAwayDec = parsed.awayDec;
        result.spreadHomeLine = parsed.homeLine;
        result.spreadHomeDec = parsed.homeDec;
      }
      continue;
    }

    if (/^Total\s*[–-]\s*(Match|Game)$/i.test(line)) {
      const parsed = parseTotalSection(lines, i + 1);
      if (parsed) {
        result.totalLine = parsed.totalLine;
        result.overDec = parsed.overDec;
        result.underDec = parsed.underDec;
      }
      continue;
    }

    if (isHardStopLine(line)) break;
  }

  console.log("PIN DETAIL CORE PARSED", result);

  return result;
}

function parseMoneyLineSection(lines, startIndex, away, home) {
  const end = findSectionEnd(lines, startIndex);

  let awayDec = null;
  let drawDec = null;
  let homeDec = null;

  for (let i = startIndex; i < end - 1; i += 1) {
    const label = normalizeLine(lines[i]);
    const next = normalizeLine(lines[i + 1]);

    if (/^(Show All|Hide All|See more)$/i.test(label)) continue;

    if (sameText(label, away) && parseDecimal(next) !== null) {
      awayDec = parseDecimal(next);
      i += 1;
      continue;
    }

    if (/^draw$/i.test(label) && parseDecimal(next) !== null) {
      drawDec = parseDecimal(next);
      i += 1;
      continue;
    }

    if (sameText(label, home) && parseDecimal(next) !== null) {
      homeDec = parseDecimal(next);
      i += 1;
      continue;
    }
  }

  if (awayDec === null && homeDec === null && drawDec === null) return null;

  return { awayDec, drawDec, homeDec };
}

function parseHandicapSection(lines, startIndex, away, home) {
  const end = findSectionEnd(lines, startIndex);

  for (let i = startIndex; i < end - 4; i += 1) {
    const line = normalizeLine(lines[i]);
    const next1 = normalizeLine(lines[i + 1]);

    if (/^(Show All|Hide All|See more)$/i.test(line)) continue;

    if (
      sameText(line, `${away} ${home}`) ||
      sameText(line, `${away}\t${home}`) ||
      (sameText(line, away) && sameText(next1, home))
    ) {
      const offset = sameText(line, away) && sameText(next1, home) ? 2 : 1;

      const awayLine = parseSignedNumber(lines[i + offset]);
      const awayDec = parseDecimal(lines[i + offset + 1]);
      const homeLine = parseSignedNumber(lines[i + offset + 2]);
      const homeDec = parseDecimal(lines[i + offset + 3]);

      if (
        awayLine !== null &&
        awayDec !== null &&
        homeLine !== null &&
        homeDec !== null
      ) {
        return {
          awayLine,
          awayDec,
          homeLine,
          homeDec,
        };
      }
    }
  }

  for (let i = startIndex; i < end - 3; i += 1) {
    const line = normalizeLine(lines[i]);
    if (/^(Show All|Hide All|See more)$/i.test(line)) continue;

    const awayLine = parseSignedNumber(lines[i]);
    const awayDec = parseDecimal(lines[i + 1]);
    const homeLine = parseSignedNumber(lines[i + 2]);
    const homeDec = parseDecimal(lines[i + 3]);

    if (
      awayLine !== null &&
      awayDec !== null &&
      homeLine !== null &&
      homeDec !== null
    ) {
      return {
        awayLine,
        awayDec,
        homeLine,
        homeDec,
      };
    }
  }

  return null;
}
function parseTotalSection(lines, startIndex) {
  const end = findSectionEnd(lines, startIndex);

  for (let i = startIndex; i < end - 3; i += 1) {
    const label1 = normalizeLine(lines[i]);
    const dec1 = normalizeLine(lines[i + 1]);
    const label2 = normalizeLine(lines[i + 2]);
    const dec2 = normalizeLine(lines[i + 3]);

    if (/^(Show All|Hide All|See more)$/i.test(label1)) continue;

    const total1 = parseTotalLabelValue(label1);
    const total2 = parseTotalLabelValue(label2);

    if (
      isOverLabel(label1) &&
      total1 !== null &&
      parseDecimal(dec1) !== null &&
      isUnderLabel(label2) &&
      total2 !== null &&
      parseDecimal(dec2) !== null
    ) {
      return {
        totalLine: total1,
        overDec: parseDecimal(dec1),
        underDec: parseDecimal(dec2),
      };
    }
  }

  for (let i = startIndex; i < end - 5; i += 1) {
    const label1 = normalizeLine(lines[i]);
    const num1 = normalizeLine(lines[i + 1]);
    const dec1 = normalizeLine(lines[i + 2]);
    const label2 = normalizeLine(lines[i + 3]);
    const num2 = normalizeLine(lines[i + 4]);
    const dec2 = normalizeLine(lines[i + 5]);

    if (
      /^Over$/i.test(label1) &&
      parseUnsignedNumber(num1) !== null &&
      parseDecimal(dec1) !== null &&
      /^Under$/i.test(label2) &&
      parseUnsignedNumber(num2) !== null &&
      parseDecimal(dec2) !== null
    ) {
      return {
        totalLine: parseUnsignedNumber(num1),
        overDec: parseDecimal(dec1),
        underDec: parseDecimal(dec2),
      };
    }
  }

  return null;
}

function parsePinnaclePlayerProps(lines, startIndex, { event, sport, league }) {
  const rows = [];

  for (let i = startIndex; i < lines.length - 4; i += 1) {
    const header = normalizeLine(lines[i]);

    if (isHardStopLine(header)) break;
    if (!looksLikeSupportedPlayerPropHeader(header)) continue;

    const parsed = parseSinglePinnaclePlayerProp(lines, i, { event, sport, league });
    if (!parsed) continue;

    rows.push(...parsed.rows);
    i = Math.max(i, parsed.endIndex);
  }

  console.log("PIN PLAYER PROP ROW COUNT", rows.length);
  return dedupeRows(rows);
}

function parseSinglePinnaclePlayerProp(lines, startIndex, { event, sport, league }) {
  const header = normalizeLine(lines[startIndex]);
  const end = findPlayerPropEnd(lines, startIndex + 1);

  const meta = parsePlayerPropHeader(header);
  if (!meta) return null;

  for (let i = startIndex + 1; i < end - 3; i += 1) {
    const overLabel = normalizeLine(lines[i]);
    const overOdds = normalizeLine(lines[i + 1]);
    const underLabel = normalizeLine(lines[i + 2]);
    const underOdds = normalizeLine(lines[i + 3]);

    const overLine = parsePlayerOverUnderLabel(overLabel, "over");
    const underLine = parsePlayerOverUnderLabel(underLabel, "under");

    if (
      overLine !== null &&
      underLine !== null &&
      Math.abs(overLine - underLine) < 0.0001 &&
      parseDecimal(overOdds) !== null &&
      parseDecimal(underOdds) !== null
    ) {
      return {
        rows: [
          makeRow({
            event,
            selection: `${meta.player} Over`,
            marketType: meta.marketType,
            lineValue: overLine,
            decimalOdds: parseDecimal(overOdds),
            sport,
            league,
          }),
          makeRow({
            event,
            selection: `${meta.player} Under`,
            marketType: meta.marketType,
            lineValue: underLine,
            decimalOdds: parseDecimal(underOdds),
            sport,
            league,
          }),
        ],
        endIndex: end,
      };
    }
  }

  return null;
}

function findPlayerPropEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    if (isHardStopLine(line)) return i;
    if (isSectionHeader(line)) return i;
    if (looksLikeSupportedPlayerPropHeader(line)) return i;
  }

  return lines.length;
}

function looksLikeSupportedPlayerPropHeader(value) {
  const text = normalizeLine(value);

  return (
    /\bTotal Points$/i.test(text) ||
    /\bTotal Assists$/i.test(text) ||
    /\bTotal Rebounds$/i.test(text) ||
    /\bTotal Threes Made$/i.test(text) ||
    /\bTotal Pts & Rebs & Asts$/i.test(text)
  );
}

function parsePlayerPropHeader(value) {
  const text = normalizeLine(value);

  const patterns = [
    { regex: /^(.*?)\s+Total Points$/i, marketType: "player_points" },
    { regex: /^(.*?)\s+Total Assists$/i, marketType: "player_assists" },
    { regex: /^(.*?)\s+Total Rebounds$/i, marketType: "player_rebounds" },
    { regex: /^(.*?)\s+Total Threes Made$/i, marketType: "player_threes" },
    { regex: /^(.*?)\s+Total Pts & Rebs & Asts$/i, marketType: "player_pra" },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      return {
        player: normalizeLine(match[1]),
        marketType: pattern.marketType,
      };
    }
  }

  return null;
}

function parsePlayerOverUnderLabel(value, side) {
  const text = normalizeLine(value);
  const regex =
    side === "over"
      ? /^Over\s+(\d+(?:\.\d+)?)\b/i
      : /^Under\s+(\d+(?:\.\d+)?)\b/i;

  const match = text.match(regex);
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function findSectionEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];

    if (isSectionHeader(line) || isHardStopLine(line)) {
      return i;
    }
  }

  return lines.length;
}

function isSectionHeader(line) {
  return /^(Money Line|Handicap|Total|Team Total|Both Teams To Score|Draw No Bet|Correct Score|Half-Time\/Full-Time|First Team To Score|Exact Total Goals|Winning Margin|Winner\/Total|Points Odd\/Even|Runs Odd\/Even|Total Points Odd\/Even)/i.test(
    normalizeLine(line)
  );
}

function findPinnacleListGameStart(lines, startIndex) {
  for (let i = startIndex; i < Math.min(lines.length - 1, startIndex + 10); i += 1) {
    const away = lines[i];
    if (!looksLikeTeamName(away)) continue;

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j += 1) {
      const maybeHome = lines[j];
      if (!looksLikeTeamName(maybeHome)) continue;

      return {
        away,
        home: maybeHome,
        marketStartIndex: j + 1,
      };
    }
  }

  return null;
}

function tryParseMainGameBlock(lines, startIndex) {
  for (let shift = 0; shift <= 6; shift += 1) {
    const attempt = tryParseMainGameBlockAt(lines, startIndex + shift);
    if (attempt) return attempt;
  }

  return null;
}

function tryParseMainGameBlockAt(lines, startIndex) {
  let j = startIndex;

  while (
    j < lines.length &&
    (looksLikeClockLine(lines[j]) ||
      looksLikeLooseMarkerLine(lines[j]) ||
      isIgnorablePinnacleLine(lines[j]))
  ) {
    j += 1;
  }

  const spreadAwayLine = parseSignedNumber(lines[j]);
  const spreadAwayDec = parseDecimal(lines[j + 1]);
  const spreadHomeLine = parseSignedNumber(lines[j + 2]);
  const spreadHomeDec = parseDecimal(lines[j + 3]);
  const mlAwayDec = parseDecimal(lines[j + 4]);
  const mlHomeDec = parseDecimal(lines[j + 5]);
  const total1 = parseUnsignedNumber(lines[j + 6]);
  const overDec = parseDecimal(lines[j + 7]);
  const total2 = parseUnsignedNumber(lines[j + 8]);
  const underDec = parseDecimal(lines[j + 9]);

  const hasFullBlock =
    spreadAwayLine !== null &&
    spreadAwayDec !== null &&
    spreadHomeLine !== null &&
    spreadHomeDec !== null &&
    mlAwayDec !== null &&
    mlHomeDec !== null &&
    total1 !== null &&
    overDec !== null &&
    total2 !== null &&
    underDec !== null;

  if (!hasFullBlock) return null;

  return {
    spreadAwayLine,
    spreadAwayDec,
    spreadHomeLine,
    spreadHomeDec,
    mlAwayDec,
    mlHomeDec,
    totalLine: total1,
    overDec,
    underDec,
    endIndex: j + 9,
  };
}

function makeRow({ event, selection, marketType, lineValue, decimalOdds, sport, league }) {
  const oddsAmerican = decimalToAmerican(decimalOdds);

  return {
    id: makeId(),
    sportsbook: "Pinnacle",
    sport: sport || inferSportFromText(event),
    league: league || "",
    eventLabelRaw: event,
    marketType,
    selectionRaw: selection,
    selectionNormalized: selection,
    lineValue,
    oddsAmerican: Number.isFinite(oddsAmerican) ? Math.round(oddsAmerican) : null,
    oddsDecimal: decimalOdds,
    confidence: "high",
    parseWarnings: [],
    isSharpSource: true,
    isTargetBook: false,
    batchRole: "fair_odds",
    excluded: false,
    userEdited: false,
  };
}

function inferSportFromText(text = "") {
  const value = String(text).toLowerCase();

  if (/soccer|serie a|internazionale|cagliari|arsenal|chelsea|tottenham|liverpool|man city|man utd/i.test(value)) {
    return "SOCCER";
  }

  if (
    /heat|hornets|magic|76ers|warriors|clippers|raptors|cavaliers|hawks|knicks|rockets|lakers|timberwolves|nuggets|suns|blazers|celtics|bucks|bulls|pacers|pistons|spurs|pelicans|thunder|grizzlies|mavericks|jazz/i.test(
      value
    )
  ) {
    return "NBA";
  }

  if (/rangers|bruins|canucks|oilers|leafs|devils|stars|panthers/i.test(value)) {
    return "NHL";
  }

  if (/yankees|dodgers|mets|cubs|astros|braves|phillies/i.test(value)) {
    return "MLB";
  }

  return "";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/âˆ’/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(a, b) {
  return normalizeLine(a).toLowerCase() === normalizeLine(b).toLowerCase();
}

function looksLikeSportLine(value) {
  const text = normalizeLine(value);
  return /^(Soccer|Basketball|Baseball|Football|Hockey|Tennis|Esports)$/i.test(text);
}

function looksLikeLeagueOrCompetitionLine(value) {
  const text = normalizeLine(value);
  return Boolean(text) && (
    / - /i.test(text) ||
    /^(NBA|NHL|MLB|NFL|WNBA|NCAAM|NCAAW|Serie A|Premier League|La Liga|Bundesliga|Ligue 1)$/i.test(text)
  );
}

function looksLikeAtOrVsMatchup(value) {
  const text = normalizeLine(value);
  return /.+\s+@\s+.+/i.test(text) || /.+\s+vs\.?\s+.+/i.test(text);
}

function looksLikeDateTimeLine(value) {
  const text = normalizeLine(value);
  return /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}$/i.test(
    text
  );
}

function looksLikeDetailTab(value) {
  const text = normalizeLine(value);
  return /^(All|Match|1st Half|Corners|Team Props|Game|General|Half|Player Props)$/i.test(text);
}

function findFirstPinnacleSectionHeader(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (isSectionHeader(lines[i])) return i;
  }
  return -1;
}

function looksLikeTeamName(value) {
  const text = normalizeLine(value);
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^\d{1,2}:\d{2}$/.test(text)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  if (/^[OU]\s*\d+(\.\d+)?$/i.test(text)) return false;

  if (
    /^(join|log in|sports betting|live centre|casino|live casino|virtual sports|betting resources|help|language|english \(en\)|español|suomi|français|italian|日本語|한국어|português|русский|svenska|简体中文|繁體中文|odds format|decimal odds|american odds|welcome to pinnacle|accept|sports|search|soccer|basketball|baseball|football|tennis|hockey|esports|all|match|1st half|corners|team props|show all|see more|back to top|about pinnacle|corporate|press|affiliates|why pinnacle\?|policies|responsible gaming|terms & conditions|privacy policy|cookie policy|help & support|contact us|betting rules|bets offered|sitemap|payment options|social|x|youtube|facebook|linkedin|reddit|spotify|apple podcasts|bet slip|dismiss)$/i.test(
      text
    )
  ) {
    return false;
  }

  if (/^(money line|handicap|total|team total)/i.test(text)) return false;
  if (/^(friday|saturday|sunday|monday|tuesday|wednesday|thursday),/i.test(text)) return false;

  return true;
}

function looksLikeClockLine(value) {
  return /^\d{1,2}:\d{2}$/.test(normalizeLine(value));
}

function looksLikeLooseMarkerLine(value) {
  return /^[+-]\d+(\.\d+)?$/.test(normalizeLine(value));
}

function isIgnorablePinnacleLine(value) {
  const text = normalizeLine(value);
  return /^(all|match|1st half|corners|team props|show all|see more|popular|featured)$/i.test(text);
}

function isHardStopLine(value) {
  const text = normalizeLine(value);
  return /^(back to top|sports betting|soccer betting|basketball betting|baseball betting|football betting|tennis betting|hockey betting|esports betting|about pinnacle|corporate|press|affiliates|why pinnacle\?|policies|responsible gaming|terms & conditions|privacy policy|cookie policy|help & support|contact us|betting rules|bets offered|help|sitemap|payment options|social|gambling can be addictive|impyrial holdings ltd|pinnacle\.com operates|online sports betting from pinnacle|v\.\d+\.\d+\.\d+|bet slip|planned maintenance|dismiss)$/i.test(
    text
  );
}

function parseDecimal(value) {
  const n = Number(normalizeLine(value));
  if (!Number.isFinite(n)) return null;
  if (n < 1.01 || n > 100) return null;
  return n;
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

function parseUnsignedNumberFromLabelOrLine(label, maybeLine) {
  const labelText = normalizeLine(label);
  const lineText = normalizeLine(maybeLine);

  const fromLabel = labelText.match(/\b(\d+(?:\.\d+)?)\b/);
  if (fromLabel) {
    const n = Number(fromLabel[1]);
    if (Number.isFinite(n)) return n;
  }

  const fromLine = parseUnsignedNumber(lineText);
  if (fromLine !== null) return fromLine;

  return null;
}

function isOverLabel(value) {
  return /^Over\b/i.test(normalizeLine(value));
}

function isUnderLabel(value) {
  return /^Under\b/i.test(normalizeLine(value));
}

function parseTotalLabelValue(value) {
  const text = normalizeLine(value);
  const match = text.match(/^(?:Over|Under)\s+(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
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