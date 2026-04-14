import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `thescore_row_${nextId++}`;
}

export function parseTheScoreText(rawText, context = {}) {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const rows = [];
  let i = 0;

  while (i < lines.length) {
    if (!looksLikeGameDateLine(lines[i])) {
      i += 1;
      continue;
    }

    const game = tryParseGameBlock(lines, i, context);

    if (!game) {
      i += 1;
      continue;
    }

    rows.push(...game.rows);
    i = game.nextIndex;
  }

  return rows;
}

function tryParseGameBlock(lines, startIndex, context) {
  const dateLine = lines[startIndex];
  const eventTitle = lines[startIndex + 1];
  const header1 = lines[startIndex + 2];
  const header2 = lines[startIndex + 3];
  const header3 = lines[startIndex + 4];

  if (
    !looksLikeGameDateLine(dateLine) ||
    !eventTitle ||
    header1 !== "Spread" ||
    header2 !== "Total" ||
    header3 !== "Money"
  ) {
    return null;
  }

  const awayTeam = lines[startIndex + 5];
  const awayMeta = lines[startIndex + 6];
  const awaySpread = lines[startIndex + 7];
  const awaySpreadOdds = lines[startIndex + 8];
  const awayTotal = lines[startIndex + 9];
  const awayTotalOdds = lines[startIndex + 10];
  const awayMoney = lines[startIndex + 11];

  const homeTeam = lines[startIndex + 12];
  const homeMeta = lines[startIndex + 13];
  const homeSpread = lines[startIndex + 14];
  const homeSpreadOdds = lines[startIndex + 15];
  const homeTotal = lines[startIndex + 16];
  const homeTotalOdds = lines[startIndex + 17];
  const homeMoney = lines[startIndex + 18];

  if (
    !looksLikeTeamName(awayTeam) ||
    !looksLikeTeamMeta(awayMeta) ||
    !looksLikeTeamName(homeTeam) ||
    !looksLikeTeamMeta(homeMeta)
  ) {
    return null;
  }

  const awaySpreadLine = parseSignedNumber(awaySpread);
  const awaySpreadPrice = parseAmericanOdds(awaySpreadOdds);
  const awayMoneyPrice = parseAmericanOdds(awayMoney);
  const overLine = parseTotalLine(awayTotal, "O");
  const overPrice = parseAmericanOdds(awayTotalOdds);

  const homeSpreadLine = parseSignedNumber(homeSpread);
  const homeSpreadPrice = parseAmericanOdds(homeSpreadOdds);
  const homeMoneyPrice = parseAmericanOdds(homeMoney);
  const underLine = parseTotalLine(homeTotal, "U");
  const underPrice = parseAmericanOdds(homeTotalOdds);

  const hasMainMarkets =
    awaySpreadLine !== null &&
    awaySpreadPrice !== null &&
    awayMoneyPrice !== null &&
    overLine !== null &&
    overPrice !== null &&
    homeSpreadLine !== null &&
    homeSpreadPrice !== null &&
    homeMoneyPrice !== null &&
    underLine !== null &&
    underPrice !== null;

  if (!hasMainMarkets) {
    return null;
  }

  const event = `${awayTeam} @ ${homeTeam}`;
  const sport = inferSport(lines, startIndex, context);

  const rows = [
    buildRow({
      sport,
      event,
      marketType: "moneyline_2way",
      selection: awayTeam,
      lineValue: null,
      oddsAmerican: awayMoneyPrice,
    }),
    buildRow({
      sport,
      event,
      marketType: "moneyline_2way",
      selection: homeTeam,
      lineValue: null,
      oddsAmerican: homeMoneyPrice,
    }),
    buildRow({
      sport,
      event,
      marketType: "spread",
      selection: awayTeam,
      lineValue: awaySpreadLine,
      oddsAmerican: awaySpreadPrice,
    }),
    buildRow({
      sport,
      event,
      marketType: "spread",
      selection: homeTeam,
      lineValue: homeSpreadLine,
      oddsAmerican: homeSpreadPrice,
    }),
    buildRow({
      sport,
      event,
      marketType: "total",
      selection: "Over",
      lineValue: overLine,
      oddsAmerican: overPrice,
    }),
    buildRow({
      sport,
      event,
      marketType: "total",
      selection: "Under",
      lineValue: underLine,
      oddsAmerican: underPrice,
    }),
  ];

  return {
    rows,
    nextIndex: startIndex + 19,
  };
}

function buildRow({ sport, event, marketType, selection, lineValue, oddsAmerican }) {
  return {
    id: makeId(),
    sportsbook: "TheScore",
    sport,
    eventLabelRaw: event,
    marketType,
    selectionRaw: selection,
    selectionNormalized: selection,
    lineValue,
    oddsAmerican,
    oddsDecimal: americanToDecimal(oddsAmerican),
    isSharpSource: false,
    isTargetBook: true,
    batchRole: "target",
    confidence: "high",
    parseWarnings: [],
    userEdited: false,
  };
}

function inferSport(lines, startIndex, context) {
  if (context?.sport) return context.sport;

  const nearby = lines
    .slice(Math.max(0, startIndex - 10), startIndex + 20)
    .join(" ")
    .toLowerCase();

  if (nearby.includes("nba")) return "NBA";
  if (nearby.includes("nfl")) return "NFL";
  if (nearby.includes("mlb")) return "MLB";
  if (nearby.includes("nhl")) return "NHL";

  return "";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/\u2212/g, "-")
    .replace(/âˆ’/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeGameDateLine(value) {
  const text = normalizeLine(value);
  return /^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{1,2}:\d{2} (AM|PM)$/i.test(text);
}

function looksLikeTeamName(value) {
  const text = normalizeLine(value);
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;

  if (
    /^(nba|lines|3-pointers|futures|series|see all|play-in chalkboard|stir the play-in pot|favorites roll|playoffs pick 2|the 2005 remix|hoops all week|millennium rewind|add to betslip|spread|total|money)$/i.test(
      text
    )
  ) {
    return false;
  }

  if (/^\+\d+ More Leg$/i.test(text)) return false;
  if (/^\+\d{3,5}$/.test(text)) return false;
  if (/^\$\d/.test(text)) return false;
  if (/^\d+\s+bets placed$/i.test(text)) return false;

  return true;
}

function looksLikeTeamMeta(value) {
  const text = normalizeLine(value);
  return /^\d{1,2}-\d{1,2}, \d{1,2}(st|nd|rd|th) (Eastern|Western)$/i.test(text);
}

function parseSignedNumber(value) {
  const text = normalizeLine(value);
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseAmericanOdds(value) {
  const text = normalizeLine(value);

  if (/^even$/i.test(text)) return 100;
  if (!/^[+-]?\d+$/.test(text)) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseTotalLine(value, side) {
  const text = normalizeLine(value);
  const match = text.match(/^([OU])\s*(\d+(\.\d+)?)$/i);
  if (!match) return null;

  const foundSide = match[1].toUpperCase();
  if (side && foundSide !== side.toUpperCase()) return null;

  const n = Number(match[2]);
  return Number.isFinite(n) ? n : null;
}