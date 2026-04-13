import { decimalToAmerican } from "../odds";

let nextId = 1;

function makeId() {
  return `pin_row_${nextId++}`;
}

export function parsePinnacleText(rawText, context = {}) {
  console.log("PINNACLE PARSER CALLED", {
    context,
    rawTextLength: rawText?.length,
  });

  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const rows = [];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const away = lines[i];
    const home = lines[i + 1];

    if (!looksLikeTeamName(away) || !looksLikeTeamName(home)) {
      continue;
    }

    const parsedBlock = tryParseMainGameBlock(lines, i + 2);

    if (!parsedBlock) {
      continue;
    }

    const event = `${away} @ ${home}`;

    rows.push(
      makeRow({
        event,
        selection: away,
        marketType: "spread",
        lineValue: parsedBlock.spreadAwayLine,
        decimalOdds: parsedBlock.spreadAwayDec,
      })
    );

    rows.push(
      makeRow({
        event,
        selection: away,
        marketType: "moneyline_2way",
        lineValue: null,
        decimalOdds: parsedBlock.mlAwayDec,
      })
    );

    rows.push(
      makeRow({
        event,
        selection: "Over",
        marketType: "total",
        lineValue: parsedBlock.totalLine,
        decimalOdds: parsedBlock.overDec,
      })
    );

    rows.push(
      makeRow({
        event,
        selection: home,
        marketType: "spread",
        lineValue: parsedBlock.spreadHomeLine,
        decimalOdds: parsedBlock.spreadHomeDec,
      })
    );

    rows.push(
      makeRow({
        event,
        selection: home,
        marketType: "moneyline_2way",
        lineValue: null,
        decimalOdds: parsedBlock.mlHomeDec,
      })
    );

    rows.push(
      makeRow({
        event,
        selection: "Under",
        marketType: "total",
        lineValue: parsedBlock.totalLine,
        decimalOdds: parsedBlock.underDec,
      })
    );

    i = parsedBlock.endIndex;
  }

  console.log("PINNACLE PARSER ROW COUNT", rows.length);
  console.log("PINNACLE PARSER ROWS", rows);

  return rows;
}

function tryParseMainGameBlock(lines, startIndex) {
  let j = startIndex;

  if (looksLikeClockLine(lines[j])) j += 1;
  if (looksLikeLooseMarkerLine(lines[j])) j += 1;

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

  if (!hasFullBlock) {
    return null;
  }

  const totalLine =
    Math.abs(total1 - total2) < 0.0001 ? total1 : total1;

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
    endIndex: j + 9,
  };
}

function makeRow({
  event,
  selection,
  marketType,
  lineValue,
  decimalOdds,
}) {
  const oddsAmerican = decimalToAmerican(decimalOdds);

  return {
    id: makeId(),
    sportsbook: "Pinnacle",
    sport: inferSportFromText(event),
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

  if (
    /heat|hornets|magic|76ers|warriors|clippers|raptors|cavaliers|hawks|knicks|rockets|lakers|timberwolves|nuggets|suns|blazers/i.test(
      value
    )
  ) {
    return "NBA";
  }

  return "";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/âˆ’/g, "-")
    .replace(/\u2212/g, "-")
    .trim();
}

function looksLikeTeamName(value) {
  const text = normalizeLine(value);
  if (!text) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^\d{1,2}:\d{2}$/.test(text)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  if (/^[OU]\s*\d+(\.\d+)?$/i.test(text)) return false;

  if (
    /^(join|log in|sports betting|live centre|casino|live casino|virtual sports|betting resources|help|language|english \(en\)|español|suomi|français|italian|日本語|한국어|português|русский|svenska|简体中文|繁體中文|odds format|decimal odds|american odds|welcome to pinnacle|accept|sports|search|basketball|nba|all|game|team total game|futures|handicap|money line|over|under|nba betting|choose pinnacle|see more|back to top|sports betting|soccer betting|basketball betting|baseball betting|football betting|tennis betting|hockey betting|esports betting|about pinnacle|corporate|press|affiliates|why pinnacle\?|policies|responsible gaming|terms & conditions|privacy policy|cookie policy|help & support|contact us|betting rules|bets offered|sitemap|payment options|social|x|youtube|facebook|linkedin|reddit|spotify|apple podcasts|bet slip)$/i.test(
      text
    )
  ) {
    return false;
  }

  if (/^(mon|tue|wed|thu|fri|sat|sun),/i.test(text)) return false;

  return true;
}

function looksLikeClockLine(value) {
  return /^\d{1,2}:\d{2}$/.test(normalizeLine(value));
}

function looksLikeLooseMarkerLine(value) {
  return /^[+-]\d+(\.\d+)?$/.test(normalizeLine(value));
}

function parseDecimal(value) {
  const n = Number(normalizeLine(value));
  if (!Number.isFinite(n)) return null;
  if (n < 1.01 || n > 50) return null;
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