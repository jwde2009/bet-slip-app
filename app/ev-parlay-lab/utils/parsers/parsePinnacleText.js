import { decimalToAmerican } from "../odds";
 
let nextId = 1;
 
function makeId() {
  return `pin_row_${nextId++}`;
}
 
export function parsePinnacleText(rawText = "", context = {}) {
  if (!rawText || typeof rawText !== "string") return [];
 
  const lines = rawText
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
 
  const rows = [];
  const detailGame = findPinnacleDetailPageGame(lines);
 
  if (detailGame) {
    const { away, home, marketStartIndex, sport, league } = detailGame;
    const event = `${away} @ ${home}`;
 
    const parsed = parsePinnacleDetailMarkets(lines, marketStartIndex, away, home);
    pushParsedRows(rows, { event, away, home, parsed, sport, league });
 
    rows.push(
      ...parsePinnacleExpandedMainLineRows(lines, marketStartIndex, {
        event,
        away,
        home,
        sport,
        league,
      })
    );
 
    rows.push(...parsePinnaclePlayerProps(lines, marketStartIndex, { event, sport, league }));
    rows.push(...parsePinnacleMustStartPlayerProps(lines, { event, sport, league }));
  }
 
  if (!detailGame && rows.length === 0) {
    rows.push(...parsePinnacleLandingGames(lines));
  }
 
  return dedupeRows(rows);
}
 
function parsePinnacleLandingGames(lines) {
  const rows = [];
  let slateMode = "";
 
  for (let i = 0; i < lines.length - 8; i += 1) {
    const slateMarker = normalizeLine(lines[i]).toLowerCase();
 
    if (slateMarker === "live") {
      slateMode = "live";
      continue;
    }
 
    if (
      slateMarker === "today" ||
      slateMarker === "tomorrow" ||
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(slateMarker)
    ) {
      slateMode = "upcoming";
      continue;
    }
 
    if (slateMode === "live") continue;
    const away = lines[i];
    const home = lines[i + 1];
 
    if (!looksLikeTeamName(away) || !looksLikeTeamName(home)) continue;
    if (isPinnacleNavigationOrJunkTeamName(away) || isPinnacleNavigationOrJunkTeamName(home)) continue;
 
    const event = `${away} @ ${home}`;
    const sport = inferSportFromText(event);
 
    if (!sport) continue;
 
    const parsed =
      tryParseMainGameBlock(lines, i + 2) ||
      tryParseNhlLandingBlock(lines, i + 2);
 
    if (!parsed) continue;
 
    if (parsed.mlAwayDec !== null) {
      rows.push(
        makeRow({
          event,
          selection: away,
          marketType: "moneyline_2way",
          lineValue: null,
          decimalOdds: parsed.mlAwayDec,
          sport,
          league: "",
        })
      );
    }
 
    if (parsed.mlHomeDec !== null) {
      rows.push(
        makeRow({
          event,
          selection: home,
          marketType: "moneyline_2way",
          lineValue: null,
          decimalOdds: parsed.mlHomeDec,
          sport,
          league: "",
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
          league: "",
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
          league: "",
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
          league: "",
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
          league: "",
        })
      );
    }
  }
 
  return rows;
}
 
function isPinnacleNavigationOrJunkTeamName(value) {
  const text = normalizeLine(value).toLowerCase();
 
  return (
    !text ||
    text === "mlb" ||
    text === "mlb odds" ||
    text === "more" ||
    text === "game" ||
    text === "live" ||
    text === "tomorrow" ||
    /^game1st/i.test(text) ||
    /^game\s*1st/i.test(text) ||
    /team totals/i.test(text) ||
    /futures/i.test(text) ||
    /money line/i.test(text) ||
    /handicap/i.test(text) ||
    /mlb odds and mlb betting/i.test(text)
  );
}
 
function findPinnacleDetailPageGame(lines) {
  for (let i = 0; i < lines.length - 6; i += 1) {
    const maybeSport = lines[i];
    const maybeLeague = lines[i + 1];
    const maybeMatchup = lines[i + 2];
    const dateLine = lines[i + 3];
    const away = lines[i + 4];
    const home = lines[i + 5];
 
    if (
      looksLikeSportLine(maybeSport) &&
      looksLikeLeagueOrCompetitionLine(maybeLeague) &&
      looksLikeAtOrVsMatchup(maybeMatchup) &&
      looksLikeDateTimeLine(dateLine) &&
      looksLikeTeamName(away) &&
      looksLikeTeamName(home)
    ) {
      return {
        sport: inferSportFromText(`${maybeSport} ${maybeLeague}`),
        league: maybeLeague,
        away,
        home,
        marketStartIndex: findFirstPinnacleSectionHeader(lines, i + 6),
      };
    }
 
    if (
      looksLikeDateTimeLine(maybeSport) &&
      looksLikeTeamName(maybeLeague) &&
      looksLikeTeamName(maybeMatchup)
    ) {
      return {
        sport: inferSportFromText(`${maybeLeague} ${maybeMatchup}`),
        league: "",
        away: maybeLeague,
        home: maybeMatchup,
        marketStartIndex: findFirstPinnacleSectionHeader(lines, i + 3),
      };
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
 
    if (/^Money Line\s*[–â€“-]\s*(Match|Game|OT Included)$/i.test(line)) {
      const parsed = parseMoneyLineSection(lines, i + 1, away, home);
      if (parsed) {
        result.mlAwayDec = parsed.awayDec;
        result.mlDrawDec = parsed.drawDec;
        result.mlHomeDec = parsed.homeDec;
      }
      continue;
    }
 
    if (/^Handicap\s*[–â€“-]\s*(Match|Game|OT Included)$/i.test(line)) {
      const parsed = parseHandicapSection(lines, i + 1, away, home);
      if (parsed) {
        result.spreadAwayLine = parsed.awayLine;
        result.spreadAwayDec = parsed.awayDec;
        result.spreadHomeLine = parsed.homeLine;
        result.spreadHomeDec = parsed.homeDec;
      }
      continue;
    }
 
    if (/^Total\s*[–â€“-]\s*(Match|Game|OT Included)$/i.test(line)) {
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
 
  return result;
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
          makeRow({ event, selection: `${meta.player} Over`, marketType: meta.marketType, lineValue: overLine, decimalOdds: parseDecimal(overOdds), sport, league }),
          makeRow({ event, selection: `${meta.player} Under`, marketType: meta.marketType, lineValue: underLine, decimalOdds: parseDecimal(underOdds), sport, league }),
        ],
        endIndex: end,
      };
    }
  }
 
  return null;
}
 
function parsePinnacleMustStartPlayerProps(lines, { event, sport, league }) {
  const rows = [];
 
  for (let i = 0; i < lines.length - 4; i += 1) {
    const header = normalizeLine(lines[i]);
 
    const headerMatch = header.match(/^(.+?)\s+\((.+?)\)\(must start\)$/i);
    if (!headerMatch) continue;
 
    const player = normalizeLine(headerMatch[1]);
    const marketLabel = normalizeLine(headerMatch[2]);
    const marketType = mapPinnacleMustStartMarketType(marketLabel);
 
    if (!player || !marketType) continue;
 
    const overLabel = normalizeLine(lines[i + 1]);
    const overOdds = parseDecimal(lines[i + 2]);
    const underLabel = normalizeLine(lines[i + 3]);
    const underOdds = parseDecimal(lines[i + 4]);
 
    const overLine = parsePlayerOverUnderLabel(overLabel, "over");
    const underLine = parsePlayerOverUnderLabel(underLabel, "under");
 
    if (
      overLine !== null &&
      underLine !== null &&
      Math.abs(overLine - underLine) < 0.0001 &&
      overOdds !== null &&
      underOdds !== null
    ) {
      rows.push(
        makeRow({
          event,
          selection: `${player} Over`,
          marketType,
          lineValue: overLine,
          decimalOdds: overOdds,
          sport,
          league,
        })
      );
 
      rows.push(
        makeRow({
          event,
          selection: `${player} Under`,
          marketType,
          lineValue: underLine,
          decimalOdds: underOdds,
          sport,
          league,
        })
      );
 
      i += 4;
    }
  }
 
  return rows;
}
 
function mapPinnacleMustStartMarketType(label) {
  const text = normalizeLine(label).toLowerCase();
 
  if (text === "total strikeouts") return "pitcher_strikeouts";
  if (text === "pitching outs") return "pitcher_outs_recorded";
  if (text === "hits allowed") return "pitcher_hits_allowed";
  if (text === "earned runs") return "pitcher_earned_runs_allowed";
  if (text === "home runs") return "player_home_runs";
  if (text === "total bases") return "player_total_bases";
 
  return "";
}
 
function parsePinnacleExpandedMainLineRows(lines, startIndex, { event, away, home, sport, league }) {
  const rows = [];
 
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
 
    if (/^Handicap\s*[–â€“-]\s*(Match|Game|OT Included)$/i.test(line)) {
      rows.push(...parseAllHandicapRows(lines, i + 1, { event, away, home, sport, league }));
      continue;
    }
 
    if (/^Total\s*[–â€“-]\s*(Match|Game|OT Included)$/i.test(line)) {
      rows.push(...parseAllTotalRows(lines, i + 1, { event, sport, league }));
      continue;
    }
 
    if (isHardStopLine(line)) break;
  }
 
  return rows;
}
 
function parseAllHandicapRows(lines, startIndex, { event, away, home, sport, league }) {
  const rows = [];
  const end = findSectionEnd(lines, startIndex);
 
  for (let i = startIndex; i < end - 3; i += 1) {
    const current = normalizeLine(lines[i]);
 
    if (/^(Show All|Hide All|See more)$/i.test(current)) continue;
 
    const awayLine = parseSpreadLineToken(lines[i]);
    const awayDec = parseDecimal(lines[i + 1]);
    const homeLine = parseSpreadLineToken(lines[i + 2]);
    const homeDec = parseDecimal(lines[i + 3]);
 
    if (
      awayLine !== null &&
      awayDec !== null &&
      homeLine !== null &&
      homeDec !== null
    ) {
      rows.push(
        makeRow({
          event,
          selection: away,
          marketType: "spread",
          lineValue: awayLine,
          decimalOdds: awayDec,
          sport,
          league,
        })
      );
 
      rows.push(
        makeRow({
          event,
          selection: home,
          marketType: "spread",
          lineValue: homeLine,
          decimalOdds: homeDec,
          sport,
          league,
        })
      );
 
      i += 3;
    }
  }
 
  return rows;
}
 
function parseAllTotalRows(lines, startIndex, { event, sport, league }) {
  const rows = [];
  const end = findSectionEnd(lines, startIndex);
 
  for (let i = startIndex; i < end - 3; i += 1) {
    const current = normalizeLine(lines[i]);
 
    if (/^(Show All|Hide All|See more)$/i.test(current)) continue;
 
    // Format:
    // Over 8
    // -100
    // Under 8
    // -112
    const overLineCompact = parseTotalLabelValue(lines[i]);
    const overDecCompact = parseDecimal(lines[i + 1]);
    const underLineCompact = parseTotalLabelValue(lines[i + 2]);
    const underDecCompact = parseDecimal(lines[i + 3]);
 
    if (
      isOverLabel(lines[i]) &&
      overLineCompact !== null &&
      overDecCompact !== null &&
      isUnderLabel(lines[i + 2]) &&
      underLineCompact !== null &&
      underDecCompact !== null &&
      Math.abs(overLineCompact - underLineCompact) < 0.0001
    ) {
      rows.push(
        makeRow({
          event,
          selection: "Over",
          marketType: "total",
          lineValue: overLineCompact,
          decimalOdds: overDecCompact,
          sport,
          league,
        })
      );
 
      rows.push(
        makeRow({
          event,
          selection: "Under",
          marketType: "total",
          lineValue: underLineCompact,
          decimalOdds: underDecCompact,
          sport,
          league,
        })
      );
 
      i += 3;
      continue;
    }
 
    // Format:
    // Over
    // 8
    // -100
    // Under
    // 8
    // -112
    const overLineSplit = parseUnsignedNumber(lines[i + 1]);
    const overDecSplit = parseDecimal(lines[i + 2]);
    const underLineSplit = parseUnsignedNumber(lines[i + 4]);
    const underDecSplit = parseDecimal(lines[i + 5]);
 
    if (
      /^Over$/i.test(normalizeLine(lines[i])) &&
      overLineSplit !== null &&
      overDecSplit !== null &&
      /^Under$/i.test(normalizeLine(lines[i + 3])) &&
      underLineSplit !== null &&
      underDecSplit !== null &&
      Math.abs(overLineSplit - underLineSplit) < 0.0001
    ) {
      rows.push(
        makeRow({
          event,
          selection: "Over",
          marketType: "total",
          lineValue: overLineSplit,
          decimalOdds: overDecSplit,
          sport,
          league,
        })
      );
 
      rows.push(
        makeRow({
          event,
          selection: "Under",
          marketType: "total",
          lineValue: underLineSplit,
          decimalOdds: underDecSplit,
          sport,
          league,
        })
      );
 
      i += 5;
    }
  }
 
  return rows;
}
 
function parseSpreadLineToken(value) {
  const text = normalizeLine(value);
 
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
 
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
 
function pushParsedRows(rows, { event, away, home, parsed, sport, league }) {
  const moneylineType = parsed.mlDrawDec !== null ? "moneyline_3way" : "moneyline_2way";
 
  if (parsed.mlAwayDec !== null) rows.push(makeRow({ event, selection: away, marketType: moneylineType, lineValue: null, decimalOdds: parsed.mlAwayDec, sport, league }));
  if (parsed.mlDrawDec !== null) rows.push(makeRow({ event, selection: "Draw", marketType: "moneyline_3way", lineValue: null, decimalOdds: parsed.mlDrawDec, sport, league }));
  if (parsed.mlHomeDec !== null) rows.push(makeRow({ event, selection: home, marketType: moneylineType, lineValue: null, decimalOdds: parsed.mlHomeDec, sport, league }));
 
  if (parsed.spreadAwayLine !== null && parsed.spreadAwayDec !== null) rows.push(makeRow({ event, selection: away, marketType: "spread", lineValue: parsed.spreadAwayLine, decimalOdds: parsed.spreadAwayDec, sport, league }));
  if (parsed.spreadHomeLine !== null && parsed.spreadHomeDec !== null) rows.push(makeRow({ event, selection: home, marketType: "spread", lineValue: parsed.spreadHomeLine, decimalOdds: parsed.spreadHomeDec, sport, league }));
  if (parsed.totalLine !== null && parsed.overDec !== null) rows.push(makeRow({ event, selection: "Over", marketType: "total", lineValue: parsed.totalLine, decimalOdds: parsed.overDec, sport, league }));
  if (parsed.totalLine !== null && parsed.underDec !== null) rows.push(makeRow({ event, selection: "Under", marketType: "total", lineValue: parsed.totalLine, decimalOdds: parsed.underDec, sport, league }));
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
 
    if (sameText(label, away) && parseDecimal(next) !== null) awayDec = parseDecimal(next);
    if (/^draw$/i.test(label) && parseDecimal(next) !== null) drawDec = parseDecimal(next);
    if (sameText(label, home) && parseDecimal(next) !== null) homeDec = parseDecimal(next);
  }
 
  if (awayDec === null && homeDec === null && drawDec === null) return null;
  return { awayDec, drawDec, homeDec };
}
 
function parseHandicapSection(lines, startIndex, away, home) {
  const end = findSectionEnd(lines, startIndex);
 
  for (let i = startIndex; i < end - 4; i += 1) {
    const awayLine = parseSignedNumber(lines[i]);
    const awayDec = parseDecimal(lines[i + 1]);
    const homeLine = parseSignedNumber(lines[i + 2]);
    const homeDec = parseDecimal(lines[i + 3]);
 
    if (awayLine !== null && awayDec !== null && homeLine !== null && homeDec !== null) {
      return { awayLine, awayDec, homeLine, homeDec };
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
 
    const total1 = parseTotalLabelValue(label1);
    const total2 = parseTotalLabelValue(label2);
 
    if (
      isOverLabel(label1) && total1 !== null && parseDecimal(dec1) !== null &&
      isUnderLabel(label2) && total2 !== null && parseDecimal(dec2) !== null
    ) {
      return { totalLine: total1, overDec: parseDecimal(dec1), underDec: parseDecimal(dec2) };
    }
  }
 
  return null;
}
 
function findSectionEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (isSectionHeader(lines[i]) || isHardStopLine(lines[i])) return i;
  }
  return lines.length;
}
 
function findPlayerPropEnd(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (isHardStopLine(line) || isSectionHeader(line) || looksLikeSupportedPlayerPropHeader(line)) return i;
  }
  return lines.length;
}
 
function findFirstPinnacleSectionHeader(lines, startIndex) {
  for (let i = startIndex; i < lines.length; i += 1) {
    const text = normalizeLine(lines[i]);
 
    if (
      /money line/i.test(text) ||
      /handicap/i.test(text) ||
      /^total\b/i.test(text)
    ) {
      return i;
    }
  }
 
  return startIndex;
}
 
function tryParseMainGameBlock(lines, startIndex) {
  for (let shift = 0; shift <= 8; shift += 1) {
    const j = startIndex + shift;
 
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
 
    if (
      spreadAwayLine !== null &&
      spreadAwayDec !== null &&
      spreadHomeLine !== null &&
      spreadHomeDec !== null &&
      mlAwayDec !== null &&
      mlHomeDec !== null &&
      total1 !== null &&
      overDec !== null &&
      total2 !== null &&
      underDec !== null &&
      Math.abs(total1 - total2) < 0.0001
    ) {
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
      };
    }
  }
 
  return null;
}
 
function tryParseNhlLandingBlock(lines, startIndex) {
  const window = lines.slice(startIndex, startIndex + 18).map(normalizeLine);
 
  let mlAwayDec = null;
  let mlHomeDec = null;
  let mlIndex = -1;
 
  for (let i = 0; i < window.length - 1; i += 1) {
    const first = parseDecimal(window[i]);
    const second = parseDecimal(window[i + 1]);
 
    if (first !== null && second !== null) {
      mlAwayDec = first;
      mlHomeDec = second;
      mlIndex = i;
      break;
    }
  }
 
  if (mlAwayDec === null || mlHomeDec === null) return null;
 
  let spreadAwayLine = null;
  let spreadAwayDec = null;
  let spreadHomeLine = null;
  let spreadHomeDec = null;
  let totalLine = null;
  let overDec = null;
  let underDec = null;
 
  for (let i = mlIndex + 2; i < window.length - 3; i += 1) {
    const maybeSpreadAwayLine = parseSignedNumber(window[i]);
    const maybeSpreadAwayDec = parseDecimal(window[i + 1]);
    const maybeSpreadHomeLine = parseSignedNumber(window[i + 2]);
    const maybeSpreadHomeDec = parseDecimal(window[i + 3]);
 
    if (
      maybeSpreadAwayLine !== null &&
      maybeSpreadAwayDec !== null &&
      maybeSpreadHomeLine !== null &&
      maybeSpreadHomeDec !== null
    ) {
      spreadAwayLine = maybeSpreadAwayLine;
      spreadAwayDec = maybeSpreadAwayDec;
      spreadHomeLine = maybeSpreadHomeLine;
      spreadHomeDec = maybeSpreadHomeDec;
 
      for (let k = i + 4; k < window.length - 3; k += 1) {
        const total1 = parseUnsignedNumber(window[k]);
        const over = parseDecimal(window[k + 1]);
        const total2 = parseUnsignedNumber(window[k + 2]);
        const under = parseDecimal(window[k + 3]);
 
        if (
          total1 !== null &&
          over !== null &&
          total2 !== null &&
          under !== null &&
          Math.abs(total1 - total2) < 0.0001
        ) {
          totalLine = total1;
          overDec = over;
          underDec = under;
          break;
        }
      }
 
      return {
        spreadAwayLine,
        spreadAwayDec,
        spreadHomeLine,
        spreadHomeDec,
        mlAwayDec,
        mlHomeDec,
        totalLine,
        overDec,
        underDec,
      };
    }
  }
 
  return {
    spreadAwayLine: null,
    spreadAwayDec: null,
    spreadHomeLine: null,
    spreadHomeDec: null,
    mlAwayDec,
    mlHomeDec,
    totalLine: null,
    overDec: null,
    underDec: null,
  };
}
 
function looksLikeSupportedPlayerPropHeader(value) {
  const text = normalizeLine(value);
 
  return (
    /\bTotal Points$/i.test(text) ||
    /\bTotal Assists$/i.test(text) ||
    /\bTotal Rebounds$/i.test(text) ||
    /\bTotal Threes Made$/i.test(text) ||
    /\bTotal Pts & Rebs & Asts$/i.test(text) ||
    /\bTotal Goals$/i.test(text) ||
    /\bTotal Saves$/i.test(text) ||
    /\bTotal Hits$/i.test(text) ||
    /\bTotal Shots On Goal$/i.test(text) ||
    /\bTotal Power Play Points$/i.test(text) ||
 
    /\(Total Strikeouts\)/i.test(text) ||
    /\(Pitching Outs\)/i.test(text) ||
    /\(Hits Allowed\)/i.test(text) ||
    /\(Earned Runs\)/i.test(text) ||
    /\(Home Runs\)/i.test(text) ||
    /\(Total Bases\)/i.test(text) ||
 
    /\(Points\)/i.test(text) ||
    /\(Assists\)/i.test(text) ||
    /\(Goals\)/i.test(text) ||
    /\(Shots On Goal\)/i.test(text) ||
    /\(ShotsOnGoal\)/i.test(text) ||
    /\(Shots\)/i.test(text) ||
    /\(Saves\)/i.test(text) ||
    /\(Power Play Points\)/i.test(text) ||
    /\(Blocked Shots\)/i.test(text)
  );
}
 
function parsePlayerPropHeader(value) {
  const text = normalizeLine(value);
 
  const patterns = [
    { regex: /^(.*?)\s+\(Points\)(?:\(must start\))?$/i, marketType: "player_points" },
    { regex: /^(.*?)\s+\(Assists\)(?:\(must start\))?$/i, marketType: "player_assists" },
    { regex: /^(.*?)\s+\(Goals\)(?:\(must start\))?$/i, marketType: "player_goals" },
    { regex: /^(.*?)\s+\(Shots\)(?:\(must start\))?$/i, marketType: "player_shots_on_goal" },
    { regex: /^(.*?)\s+\(Shots On Goal\)(?:\(must start\))?$/i, marketType: "player_shots_on_goal" },
    { regex: /^(.*?)\s+\(ShotsOnGoal\)(?:\(must start\))?$/i, marketType: "player_shots_on_goal" },
    { regex: /^(.*?)\s+\(Saves\)(?:\(must start\))?$/i, marketType: "player_saves" },
    { regex: /^(.*?)\s+\(Power Play Points\)(?:\(must start\))?$/i, marketType: "player_power_play_points" },
    { regex: /^(.*?)\s+\(Blocked Shots\)(?:\(must start\))?$/i, marketType: "player_blocked_shots" },
    { regex: /^(.*?)\s+\(Total Strikeouts\)/i, marketType: "pitcher_strikeouts" },
    { regex: /^(.*?)\s+\(Pitching Outs\)/i, marketType: "pitcher_outs_recorded" },
    { regex: /^(.*?)\s+\(Hits Allowed\)/i, marketType: "pitcher_hits_allowed" },
    { regex: /^(.*?)\s+\(Earned Runs\)/i, marketType: "pitcher_earned_runs_allowed" },
    { regex: /^(.*?)\s+\(Home Runs\)/i, marketType: "player_home_runs" },
    { regex: /^(.*?)\s+\(Total Bases\)/i, marketType: "player_total_bases" },
 
    // existing fallback
    { regex: /^(.*?)\s+Total Points$/i, marketType: "player_points" },
  ];
 
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const player = normalizeLine(match[1]);

      // Prevent combo/team markets like "Moneyline and Total Points"
      // from being parsed as player props.
      if (/^(moneyline and|winner and|team total|total points odd\/even|points odd\/even)$/i.test(player)) {
        continue;
      }

      return {
        player,
        marketType: pattern.marketType,
      };
    }
  }
 
  return null;
}
 
function parsePlayerOverUnderLabel(value, side) {
  const text = normalizeLine(value);
 
  const match = text.match(/(?:Over|Under|O|U)\s+(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
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
 
  if (/soccer|serie a|premier league|internazionale|cagliari|arsenal|chelsea|tottenham|liverpool|man city|man utd/i.test(value)) {
    return "SOCCER";
  }
 
  if (/yankees|dodgers|mets|cubs|astros|braves|phillies|diamondbacks|orioles|tigers|reds|guardians|royals|twins|padres|rockies|giants|texas rangers|pirates|red sox|white sox|blue jays|nationals|marlins|brewers|cardinals|rays|mariners|athletics|angels|mlb|baseball/i.test(value)) {
    return "MLB";
  }
 
  // Check NHL before NBA because "Los Angeles Kings" should be NHL, while
  // generic "Kings" can otherwise be mistaken for Sacramento.
  if (/wild|stars|ducks|oilers|canadiens|lightning|bruins|sabres|mammoth|golden knights|avalanche|penguins|flyers|kraken|panthers|hurricanes|leafs|devils|canucks|los angeles kings|la kings|new york rangers|ny rangers|islanders|senators|predators|blue jackets|red wings|blackhawks|sharks|capitals|jets|nhl|hockey/i.test(value)) {
    return "NHL";
  }
 
  if (/heat|hornets|magic|warriors|suns|knicks|hawks|lakers|rockets|celtics|76ers|spurs|trail blazers|nuggets|timberwolves|cavaliers|raptors|bulls|pacers|bucks|pistons|clippers|sacramento kings|mavericks|nets|pelicans|thunder|jazz|wizards|nba|basketball/i.test(value)) {
    return "NBA";
  }
 
  return "";
}
 
function normalizeLine(value) {
  return String(value || "")
    .replace(/Ã¢Ë†â€™|âˆ’|\u2212/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
 
function sameText(a, b) {
  return normalizeLine(a).toLowerCase() === normalizeLine(b).toLowerCase();
}
 
function looksLikeSportLine(value) {
  return /^(Soccer|Basketball|Baseball|Football|Hockey|Tennis|Esports)$/i.test(normalizeLine(value));
}
 
function looksLikeLeagueOrCompetitionLine(value) {
  const text = normalizeLine(value);
  return /^(NBA|NHL|MLB|NFL|Serie A|Premier League|La Liga|Bundesliga|Ligue 1)$/i.test(text) || / - /i.test(text);
}
 
function looksLikeAtOrVsMatchup(value) {
  const text = normalizeLine(value);
  return /.+\s+@\s+.+/i.test(text) || /.+\s+vs\.?\s+.+/i.test(text);
}
 
function looksLikeDateTimeLine(value) {
  return /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}$/i.test(normalizeLine(value));
}
 
function looksLikeTeamName(value) {
  const text = normalizeLine(value);
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^\d{1,2}:\d{2}$/.test(text)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  if (/^[OU]\s*\d+(\.\d+)?$/i.test(text)) return false;
 
  if (
    /\b(today|tomorrow|yesterday)\b/i.test(text) ||
    /\b\d+\s+day\b/i.test(text) ||
    /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(text) ||
    /\d{1,2}:\d{2}/.test(text) ||
    /\b(am|pm)\b/i.test(text)
  ) {
    return false;
  }
 
  if (
    /^(join|log in|sports betting|live centre|casino|live casino|virtual sports|betting resources|help|language|english \(en\)|espaÃ±ol|suomi|franÃ§ais|italian|æ—¥æœ¬èªž|í•œêµ­ì–´|portuguÃªs|Ñ€ÑƒÑÑÐºÐ¸Ð¹|svenska|ç®€ä½“ä¸­æ–‡|ç¹é«”ä¸­æ–‡|odds format|decimal odds|american odds|welcome to pinnacle|accept|sports|search|soccer|basketball|baseball|football|tennis|hockey|esports|all|match|1st half|corners|team props|show all|see more|popular|featured|back to top|about pinnacle|corporate|press|affiliates|why pinnacle\?|policies|responsible gaming|terms & conditions|privacy policy|cookie policy|help & support|contact us|betting rules|bets offered|help|sitemap|payment options|social|x|youtube|facebook|linkedin|reddit|spotify|apple podcasts|bet slip|dismiss|live|series prices|over|under)$/i.test(
      text
    )
  ) {
    return false;
  }
 
  if (/^(money line|handicap|total|team total)/i.test(text)) return false;
  if (/^(friday|saturday|sunday|monday|tuesday|wednesday|thursday),/i.test(text)) return false;
 
  return true;
}
 
 
function isHardStopLine(value) {
  return /^(back to top|sports betting|soccer betting|basketball betting|baseball betting|football betting|tennis betting|hockey betting|esports betting|about pinnacle|corporate|press|affiliates|why pinnacle\?|policies|responsible gaming|terms & conditions|privacy policy|cookie policy|help & support|contact us|betting rules|bets offered|help|sitemap|payment options|social|gambling can be addictive|impyrial holdings ltd|pinnacle\.com operates|online sports betting from pinnacle|v\.\d+\.\d+\.\d+|bet slip|planned maintenance|dismiss)$/i.test(normalizeLine(value));
}
 
function isSectionHeader(line) {
  return /^(Money Line|Handicap|Total|Team Total|Both Teams To Score|Draw No Bet|Correct Score|Half-Time\/Full-Time|First Team To Score|Exact Total Goals|Winning Margin|Winner\/Total|Points Odd\/Even|Runs Odd\/Even|Total Points Odd\/Even)/i.test(normalizeLine(line));
}
 
function parseDecimal(value) {
  const text = normalizeLine(value);
 
  if (!text) return null;
 
  if (/^even$/i.test(text)) return 2.0;
 
  if (/^[+-]\d+$/.test(text)) {
    const american = Number(text);
    if (!Number.isFinite(american) || american === 0) return null;

    // Pinnacle landing pages include market-count links like +12, +23, +49.
    // Those are NOT odds. Real American odds should be +100 or higher, or -100 or lower.
    if (Math.abs(american) < 100) return null;
 
    if (american > 0) return 1 + american / 100;
    return 1 + 100 / Math.abs(american);
  }
 
  const n = Number(text);
  if (!Number.isFinite(n) || n < 1.01 || n > 100) return null;
  return n;
}
 
function parseSignedNumber(value) {
  const text = normalizeLine(value);
  if (!/^[+-]\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;

  // This function is used for spread/handicap lines.
  // Values like -170, +149, -115 are American odds, not spread lines.
  if (Math.abs(n) > 60) return null;

  return n;
}
 
function parseUnsignedNumber(value) {
  const text = normalizeLine(value);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
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
  return match ? Number(match[1]) : null;
}
 
function parseTotalShortLabelValue(value) {
  const text = normalizeLine(value);
  const match = text.match(/^[OU]\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}
 
function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.sportsbook, row.eventLabelRaw, row.marketType, row.selectionNormalized, row.lineValue, row.oddsAmerican].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
