import { detectLeague } from "./detectLeague";
import {
  americanOddsFromStakeAndProfit,
  detectOddsMissingReason,
  extractBestOdds,
} from "./oddsHelpers";

function toDateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.dateOnly) return value.dateOnly;
  return "";
}

function formatDateToMMDDYYYY(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function parseDateFromScreenshotFileName(sourceFileName = "") {
  const s = String(sourceFileName || "");

  let m = s.match(/Screenshot_(\d{4})(\d{2})(\d{2})-\d{6}/i);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;

  m = s.match(/(\d{4})(\d{2})(\d{2})[-_]\d{6}/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;

  return "";
}

function parseCaesarsBetDate(text = "") {
  const s = String(text || "").replace(/\s+/g, " ").trim();

  let m = s.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i
  );
  if (m) {
    const d = new Date(m[0]);
    const formatted = formatDateToMMDDYYYY(d);
    if (formatted) return formatted;
  }

  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;

  return "";
}

function getMatch(text, regex, group = 1) {
  const m = String(text || "").match(regex);
  return m ? String(m[group] || "").trim() : "";
}

function toMoneyNumber(value) {
  if (!value) return "";
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num.toFixed(2) : "";
}

function cleanRawLine(line = "") {
  return String(line || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLine(line = "") {
  return String(line).replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCaesarsText(text = "") {
  return String(text)
    .replace(/\$\s+/g, "$")
    .replace(/\+\s+(\d{2,5})\b/g, "+$1")
    .replace(/-\s+(\d{2,5})\b/g, "-$1");
}

function buildFallbackRowId({
  sourceFileName = "",
  betId = "",
  fixture = "",
  selection = "",
  stake = "",
  odds = "",
}) {
  return [sourceFileName, betId, fixture, selection, stake, odds]
    .filter(Boolean)
    .join("|");
}

function splitTrailingOdds(text = "") {
  const s = cleanLine(text);

  let m = s.match(/^(.*?)(\s[+-]\d{3,5})\)?\s*$/);
  if (m) {
    return {
      text: m[1].trim(),
      odds: m[2].trim(),
    };
  }

  return { text: s, odds: "" };
}

function cleanCaesarsPrimarySelectionLine(text = "") {
  return cleanLine(text)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+\d+\s+v$/i, "")
    .replace(/\s+in\s+v$/i, "")
    .replace(/\s+v$/i, "")
    .replace(/\s+[vV]$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanCaesarsSelection(text = "") {
  let s = cleanLine(text);

  s = s.replace(/^[^A-Za-z0-9]+/, "");
  s = s.replace(/([A-Za-z])([+-]\d)/g, "$1 $2");
  s = s.replace(/\s+[+-]\d{2,5}(?=\s|$)/g, "");

  s = s.replace(/\s[+-]\d{2,5}\)?\s*$/i, "");
  s = s.replace(/\s["“”']?\d{3}\)?\s*$/i, "");
  s = s.replace(/\s+-\s+(Over|Under)\b/i, " $1");
  s = s.replace(/^\d+\s+(?=[A-Z][a-z])/, "");
  s = s.replace(/[\[\(\{].*?[\]\)\}]/g, "");
  s = s.replace(/["'=~®©]/g, "");

  // remove short trailing OCR junk like M12, A, Ml2, +1, -10
  s = s.replace(/\s+[A-Za-z]{1,3}\d{1,3}\s*$/i, "");
  s = s.replace(/\s+[A-Za-z]\s*$/i, "");
  s = s.replace(/\s+[+-]\d{1,2}\s*$/i, "");

  s = s.replace(/\s{2,}/g, " ").trim();

  return s;
}

function isLikelyEventLine(line = "") {
  if (!line || line.length < 8) return false;

  const cleaned = cleanLine(line);
  const lower = cleaned.toLowerCase();

  // ❌ reject betting/financial lines
  if (
    /\b(wager|risk|stake|odds|to win|total payout|cash out|same game parlay|sgp|reward credits|tier credits|rewards|caesars rewards|quick deposit|deposit)\b/i.test(cleaned)
  ) {
    return false;
  }

  // ❌ reject player prop / market lines
  if (
    /-/.test(cleaned) &&
    /\b(total|points|rebounds|assists|shots|goals|strikeouts|hits|rbis|home runs|3pt|three pointers)\b/i.test(cleaned)
  ) {
    return false;
  }

  // ❌ reject currency lines
  if (/\$/.test(cleaned)) return false;

  // ❌ reject weak OCR (not enough real words)
  if (!/[a-z]{3,}/i.test(cleaned)) return false;

  // ❌ reject numeric-heavy junk
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount >= 4 && !/\s@\s/.test(cleaned)) return false;

  // ❌ reject pure symbols
  if (/^[^a-z0-9]+$/i.test(cleaned)) return false;

  // ✅ must look like matchup
  const hasMatchupShape =
    /\s@\s/.test(cleaned) ||
    /\bvs\.?\b/i.test(cleaned) ||
    /\bv\b/i.test(cleaned) ||
    /\bat\b/i.test(cleaned);

  if (!hasMatchupShape) return false;

  // ❌ final safeguard: reject very short sides
  const parts = cleaned.split(/@|vs\.?|v|at/i);
  if (parts.length >= 2) {
    const [left, right] = parts.map((p) => p.trim());
    if (left.length < 3 || right.length < 3) return false;
  }

  return true;
}

function cleanEventLine(line = "") {
  return cleanLine(line)
    .replace(/\b\d{1,2}:\d{2}\s*(AM|PM)\s*(ET|CT|MT|PT)?\b/gi, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTopCaesarsBetText(text = "") {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Do NOT start at "CAESARS" only. In settled rows, "CAESARS" often appears
  // after the bet in "Pending Credits: (2) CAESARS", which causes the parser
  // to discard the real selection/fixture.
  const startIndex = rawLines.findIndex((line) =>
    /\b(Betslip|Open Bets|Settled|Settled Bets|CAESARS|SPORTSBOOK)\b/i.test(line)
  );

  const start = startIndex === -1 ? 0 : startIndex;

  let end = rawLines.length;

  for (let i = start + 1; i < rawLines.length; i += 1) {
    if (/<\s*Share Bet/i.test(rawLines[i]) || /^Share Bet$/i.test(rawLines[i])) {
      end = i + 1;
      break;
    }
  }

  return rawLines.slice(start, end).join("\n");
}

function extractCaesarsFinancials(cleaned = "", rawSelection = "") {
  const text = normalizeCaesarsText(cleaned);
  const compact = text.replace(/\s+/g, " ");

  const stake =
    toMoneyNumber(getMatch(text, /\b(wager|stake|risk)\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i, 2)) ||
    toMoneyNumber(getMatch(text, /\b(bonus bet|amount wagered|bet amount|total stake|wagered|risked)\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i, 2)) ||
    toMoneyNumber(getMatch(text, /\$([0-9]+(?:\.[0-9]{1,2})?)\s*(risk|stake|wager|wagered|risked)\b/i, 1)) ||
    toMoneyNumber(getMatch(compact, /\bWager\s+\$?([0-9]+(?:\.[0-9]{1,2})?)\b/i));
  const toWin =
    toMoneyNumber(
      getMatch(text, /\bto win\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
    ) ||
    toMoneyNumber(
      getMatch(text, /\bwin\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
    ) ||
    toMoneyNumber(
      getMatch(text, /\bprofit\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
    );

  const payout =
    toMoneyNumber(
      getMatch(text, /\b(total payout|payout)\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i, 2)
    ) ||
    toMoneyNumber(
      getMatch(text, /\b(total return|return|returns|returned|paid)\s*:?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i, 2)
    ) ||
    toMoneyNumber(
      getMatch(text, /\bPaid\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)
    );

  const bestOdds = extractBestOdds({
    receiptText: text,
    rawSelection,
    payout,
    stake,
  });

  const odds =
    (bestOdds && typeof bestOdds === "object" ? bestOdds.oddsUS : bestOdds) ||
    getMatch(text, /\bodds\s*:?\s*([+-]\d{3,5})\b/i) ||
    getMatch(text, /\b([+-]\d{3,5})\b/i);

  return { stake, toWin, payout, odds };
}

function inferBetType(selection = "", marketDetail = "") {
  const s = `${selection} ${marketDetail}`.toLowerCase();

  const hasOverUnder = /\b(over|under)\b/.test(s);
  const hasLine = /[+-]\d+(\.\d+)?/.test(selection);
  const hasNamedSelection = /\b[a-z][a-z'.-]+\s+[a-z][a-z'.-]+\b/i.test(selection);

  const hasPropWords =
    /\b(player|made threes|threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals|goal scorer|goalscorer|anytime goal scorer|by ko\/tko|by points|bout betting|method of victory)\b/.test(
      s
    ) ||
    /^\d+\+\s+(made threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals|goal scorer|goalscorer)\b/i.test(
      selection
    ) ||
    /^player\s+\d+\+/i.test(selection);

  if ((hasOverUnder && (hasNamedSelection || hasPropWords)) || hasPropWords) {
    return "player prop";
  }

  if (hasOverUnder) return "total";
  if (hasLine) return "spread";
  if (selection) return "moneyline";

  return "";
}

function extractCaesarsTopSettledFields(lines = []) {
  const result = {
    selection: "",
    status: "",
    marketDetail: "",
    fixture: "",
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = cleanRawLine(lines[i]);
    const line = cleanLine(rawLine);

    // Examples:
    // "Vancouver Whitecaps Won A"
    // "Over 3.5 Won"
    // "Vegas Golden Knights [Won [EN"
    const m = line.match(/^(.+?)\s+(Won|Lost|Void(?:ed)?|Push|Cashed Out|Open)\b/i);
    if (!m) continue;

    const rawSelection = cleanCaesarsPrimarySelectionLine(m[1] || "");
    const statusWord = String(m[2] || "");

    if (
      !rawSelection ||
      /\b(CAESARS|SPORTSBOOK|Betslip|Open Bets|Settled|Reward Credits|Tier Credits|REWARDS|Pending Credits)\b/i.test(rawSelection) ||
      /\$/.test(rawSelection)
    ) {
      continue;
    }

    result.selection = rawSelection;
    result.status =
      /won/i.test(statusWord)
        ? "Won"
        : /lost/i.test(statusWord)
        ? "Lost"
        : /void|push/i.test(statusWord)
        ? "Voided"
        : /cashed out/i.test(statusWord)
        ? "Cashed Out"
        : /open/i.test(statusWord)
        ? "Open"
        : "";

    // Look immediately after selection for:
    //   market
    //   fixture
    //   date
    // These may be separate OCR lines OR one pipe-delimited line.
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j += 1) {
      const rawNext = cleanRawLine(lines[j]);
      const next = cleanLine(rawNext);

      if (
        !next ||
        /\b(Pending Credits|Reward Credits|Tier Credits|REWARDS|Odds|Cash Wager|Paid|To Win|Share Bet)\b/i.test(next)
      ) {
        continue;
      }

      const parts = rawNext.split("|").map((part) => cleanLine(part)).filter(Boolean);

      if (parts.length >= 2) {
        result.marketDetail = parts[0] || "";
        result.fixture = cleanEventLine(parts[1] || "");
        break;
      }

      if (
        !result.marketDetail &&
        /\b(Match Betting|Moneyline|Money Line|Draw No Bet|Spread|Total|Total Points|Total Assists|Total Rebounds|Puck Line|Run Line|Bout Betting|Anytime Goal Scorer|Anytime Goalscorer|Goal Scorer|Goalscorer|90 Minutes|Handicap)\b/i.test(next)
      ) {
        result.marketDetail = next;
        continue;
      }

      if (!result.fixture && isLikelyEventLine(next)) {
        result.fixture = cleanEventLine(next);
        continue;
      }
    }

    return result;
  }

  return result;
}

function extractCaesarsMarketPipeFields(lines = []) {
  const marketRegex = /\b(Money Line|Moneyline|Match Betting|Spread|Total|Total Points|Total Assists|Total Rebounds|Puck Line|Run Line|90 Minutes|Draw No Bet|Bout Betting|Anytime Goal Scorer|Anytime Goalscorer|Goal Scorer|Goalscorer|Handicap)\b/i;

  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanRawLine(lines[i]);

    // Important: do NOT use cleanLine() before this check.
    // cleanLine() removes "|" and makes pipe parsing impossible.
    if (!marketRegex.test(line) || !line.includes("|")) continue;

    const parts = line.split("|").map((part) => cleanLine(part)).filter(Boolean);
    if (parts.length < 2) continue;

    let selection = "";

    for (let j = i - 1; j >= Math.max(0, i - 4); j -= 1) {
      const prev = cleanCaesarsPrimarySelectionLine(lines[j]);

      if (
        prev &&
        !/\b(CAESARS|SPORTSBOOK|Open Bets|Settled Bets|Home|Rewards|Reward Credits|Tier Credits|Pending Credits|Betslip|Cash Wager|Odds|To Win|Paid)\b/i.test(prev) &&
        !/\$/.test(prev)
      ) {
        selection = prev
          .replace(/\b(Won|Lost|Void(?:ed)?|Push|Cashed Out|Open)\b.*$/i, "")
          .trim();
        break;
      }
    }

    return {
      selection,
      marketDetail: parts[0] || "",
      fixture: cleanEventLine(parts[1] || ""),
    };
  }

  return {
    selection: "",
    marketDetail: "",
    fixture: "",
  };
}

function scoreSelectionLine(line = "") {
  const l = line.toLowerCase();
  let score = 0;

  if (!line || line.length < 2) return -100;

  if (/\b(over|under)\b/.test(l)) score += 4;
  if (
    /\b(player|made threes|threes|shots on goal|assists|rebounds|points|hits|rbis|home runs|strikeouts|touchdowns|goals|by ko\/tko|by points)\b/.test(
      l
    )
  ) {
    score += 5;
  }
  if (/[+-]\d+(\.\d+)?/.test(line)) score += 3;

  if (/\b(reward credits|tier credits|rewards|caesars rewards|quick deposit|deposit|available balance)\b/i.test(line)) {
    score -= 12;
  }
  if (/\b(wager|risk|stake|odds|to win|total payout|payout|cash out)\b/.test(l)) {
    score -= 5;
  }
  if (isLikelyEventLine(line)) score -= 4;

  return score;
}

function inferCaesarsLeagueFallback({ text = "", selection = "", fixture = "", marketDetail = "" } = {}) {
  const joined = `${text} ${selection} ${fixture} ${marketDetail}`.toLowerCase();

  // Soccer clubs/markets that your current detector is missing.
  if (
    /\b(draw no bet|90 minutes|90 mins|both teams to score|correct score)\b/i.test(joined) ||
    /\b(sounders|seattle sounders|whitecaps|vancouver whitecaps|lafc|la fc|la galaxy|portland timbers|st\.?\s*louis city|louis city|city sc|inter miami|atlanta united|columbus crew|fc cincinnati|orlando city|nycfc|new york city fc|new york red bulls|sporting kc|sporting kansas city|real salt lake|houston dynamo|austin fc|fc dallas|nashville sc|charlotte fc|philadelphia union|dc united|d\.c\. united|chicago fire|colorado rapids|san jose earthquakes|minnesota united)\b/i.test(joined)
  ) {
    return "Soccer";
  }

  // Tennis player names seen in your Caesars rows, plus common tennis market wording.
  if (
    /\b(alcaraz|bublik|pegula|shnaider|bolt|noguchi|altmaier|marozsan|sinner|djokovic|nadal|federer|fritz|tiafoe|zverev|medvedev|rublev|ruud|tsitsipas|shelton|gauff|sabalenka|swiatek|rybakina|osaka)\b/i.test(joined)
  ) {
    return "Tennis";
  }

  // Conservative generic tennis fallback:
  // only use when it says Match Betting and the fixture looks like person vs person.
  if (/\bmatch betting\b/i.test(marketDetail) && /\bvs\.?\b/i.test(fixture)) {
    const parts = String(fixture || "")
      .split(/vs\.?/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 2) {
      const personLike = parts.every((part) => {
        const words = part.split(/\s+/).filter(Boolean);
        return (
          words.length >= 2 &&
          words.length <= 4 &&
          words.every((word) => /^[A-Z][A-Za-z'.-]+$/.test(word))
        );
      });

      if (personLike) return "Tennis";
    }
  }

  return "";
}

function inferCaesarsLeagueOverride({ text = "", selection = "", fixture = "", marketDetail = "" } = {}) {
  const joined = `${text} ${selection} ${fixture} ${marketDetail}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // NBA player prop / NBA fixture override.
  // This fixes rows where "Sacramento Kings" caused NHL because "Kings" also exists in NHL.
  if (
    /\b(total points|total assists|total rebounds|3pt field goals|field goals|points \+ rebounds|points \+ assists|points rebounds assists)\b/i.test(joined) ||
    /\b(nets|brooklyn nets|sacramento kings|spurs|san antonio spurs|cavaliers|cleveland cavaliers|bucks|milwaukee bucks|trail blazers|portland trail blazers|timberwolves|minnesota timberwolves|suns|phoenix suns|mavericks|dallas mavericks|pelicans|new orleans pelicans|lakers|los angeles lakers|rockets|houston rockets|nuggets|denver nuggets|hornets|charlotte hornets|raptors|toronto raptors|grizzlies|memphis grizzlies|celtics|boston celtics|clippers|los angeles clippers|heat|miami heat|wizards|washington wizards|bulls|chicago bulls|knicks|new york knicks|warriors|golden state warriors|magic|orlando magic|pistons|detroit pistons|76ers|sixers|philadelphia 76ers|jazz|utah jazz|hawks|atlanta hawks|pacers|indiana pacers)\b/i.test(joined)
  ) {
    return "NBA";
  }

  // Soccer override. Put this BEFORE generic tennis because "Sporting Lisbon" looks person-like to weak logic.
  if (
    /\b(90 minutes|90 mins|draw no bet|both teams to score|correct score|money line 3-way|three way|3-way)\b/i.test(joined) ||
    /\b(sporting kansas city|sporting kc|colorado rapids|bodo\/glimt|bodo glimt|sporting lisbon|st\.?\s*louis city|louis city|seattle sounders|vancouver whitecaps|portland timbers|lafc|la fc|la galaxy|inter miami|atlanta united|columbus crew|fc cincinnati|orlando city|nycfc|new york city fc|new york red bulls|real salt lake|houston dynamo|austin fc|fc dallas|nashville sc|charlotte fc|philadelphia union|dc united|d\.c\. united|chicago fire|san jose earthquakes|minnesota united|mallorca|girona|elche|rayo vallecano|atletico madrid)\b/i.test(joined)
  ) {
    return "Soccer";
  }

  // MLB/baseball override.
  if (
    /\b(run line|total bases|hits|home runs|rbi|strikeouts|earned runs)\b/i.test(joined) ||
    /\b(yankees|san francisco giants|giants|mexico|usa|dodgers|mets|cardinals|cubs|astros|braves|phillies|padres|diamondbacks|rangers|orioles|blue jays|red sox|guardians|mariners|royals|twins|white sox|tigers|rays|marlins|nationals|pirates|reds|brewers|rockies|angels|athletics)\b/i.test(joined)
  ) {
    return "Baseball";
  }

  // NHL override.
  if (
    /\b(puck line|shots on goal|score a goal|goal scorer|goalscorer)\b/i.test(joined) ||
    /\b(golden knights|vegas golden knights|dallas stars|utah mammoth|seattle kraken|avalanche|rangers|islanders|devils|flyers|penguins|capitals|hurricanes|lightning|panthers|maple leafs|canadiens|senators|sabres|red wings|blue jackets|wild|jets|predators|blues|blackhawks|canucks|oilers|flames|ducks|sharks)\b/i.test(joined)
  ) {
    return "NHL";
  }

  // Tennis override. Keep after soccer.
  if (
    /\b(alcaraz|bublik|pegula|shnaider|bolt|noguchi|altmaier|marozsan|andreozzi|guinard|rinderknech|vacherot|sinner|djokovic|nadal|fritz|tiafoe|zverev|medvedev|rublev|ruud|tsitsipas|shelton|gauff|sabalenka|swiatek|rybakina|osaka)\b/i.test(joined)
  ) {
    return "Tennis";
  }

  if (/\bmatch betting\b/i.test(marketDetail) && /\bvs\.?\b/i.test(fixture)) {
    const parts = String(fixture || "")
      .split(/vs\.?/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 2) {
      const personLike = parts.every((part) => {
        const words = part.split(/\s+/).filter(Boolean);
        return (
          words.length >= 2 &&
          words.length <= 4 &&
          words.every((word) => /^[A-Z][A-Za-z'.-]+$/.test(word))
        );
      });

      if (personLike) return "Tennis";
    }
  }

  return "";
}

export function parseCaesarsSlip({
  cleaned,
  originalText,
  sourceFileName = "",
  sportsbook = "Caesars",
  shared,
  debug = false,
}) {
  const debugTrace = [];
  const {
    detectStatus,
    detectLive,
    extractBetId,
    enrichRow,
    parsePlacedDate,
  } = shared || {};

  const fullText = normalizeCaesarsText(originalText || cleaned || "");
  const text = extractTopCaesarsBetText(fullText);
  const rawLines = text.split("\n").map(cleanRawLine).filter(Boolean);
  const lines = text.split("\n").map(cleanLine).filter(Boolean);

  const topSettled = extractCaesarsTopSettledFields(rawLines);
  const topPipe = extractCaesarsMarketPipeFields(rawLines);


  const betId = typeof extractBetId === "function" ? extractBetId(text) : "";
  let status =
    topSettled.status ||
    (typeof detectStatus === "function" ? detectStatus(text) : "");

  if (!status && /\bWon\b/i.test(text)) status = "Won";
  if (!status && /\bLost\b/i.test(text)) status = "Lost";
  if (!status && /\bCashed Out\b/i.test(text)) status = "Cashed Out";

  if (!status && /\bPaid\s*:?\s*\$?0(?:\.00)?\b/i.test(text)) {
    status = "Lost";
  }

  if (!status && /\bPaid\s*:?\s*\$?(?!0(?:\.00)?\b)([0-9]+(?:\.[0-9]{1,2})?)/i.test(text)) {
    status = "Won";
  }

  const win = status === "Won" ? "Y" : status === "Lost" ? "N" : "";
  const liveFlag = typeof detectLive === "function" ? detectLive(text) : "N";

  const parsedBetDate =
    typeof parsePlacedDate === "function" ? parsePlacedDate(fullText) : "";
  const betDate =
    toDateOnly(parsedBetDate) ||
    parseCaesarsBetDate(fullText) ||
    parseDateFromScreenshotFileName(sourceFileName);

  let fixture = topSettled.fixture || topPipe.fixture || "";
let bestFixtureScore = -1;

for (const line of lines) {
  if (!isLikelyEventLine(line)) continue;

  const cleaned = cleanEventLine(line);
  let score = 0;

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 3) score += 2;

  if (/\s@\s/.test(cleaned)) score += 3;
  if (/\bvs\.?\b/i.test(cleaned)) score += 2;
  if (/\bv\b/i.test(cleaned)) score += 1;
  if (/\bat\b/i.test(cleaned)) score += 1;

  if (cleaned.length < 15) score -= 2;

  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount > 2) score -= 2;

  if (score > bestFixtureScore) {
    bestFixtureScore = score;
    fixture = cleaned;
  }
}

let usedFixtureFallback = false;

if (!fixture) {
  for (let i = 0; i < lines.length; i++) {
    const cleaned = cleanEventLine(lines[i]);

    const hasMatchupShape =
      /\s@\s/.test(cleaned) ||
      /\bvs\.?\b/i.test(cleaned) ||
      /\bv\b/i.test(cleaned) ||
      /\bat\b/i.test(cleaned);

    if (!hasMatchupShape) continue;

    const parts = cleaned.split(/@|vs\.?|v|at/i).map((p) => p.trim());
    if (parts.length < 2) continue;

    const [left, right] = parts;

    if (!left || !right) continue;
    if (left.length < 3 || right.length < 3) continue;
    if (!/[a-z]{3,}/i.test(left) || !/[a-z]{3,}/i.test(right)) continue;

    if (
      /\b(wager|risk|stake|odds|to win|total payout|cash out|same game parlay|sgp|points|rebounds|assists|shots|goals|strikeouts|hits|rbis|home runs|3pt|three pointers)\b/i.test(
        cleaned
      )
    ) {
      continue;
    }

    fixture = cleaned;
    usedFixtureFallback = true;
    break;
  }
}

if (debug) {
  debugTrace.push({
    stage: "fixture",
    fixture,
    bestFixtureScore,
    usedFixtureFallback,
  });
}
  let selectionCandidate = topSettled.selection || topPipe.selection || "";
  let bestScore = selectionCandidate ? 100 : -100;

  if (!selectionCandidate) {
    for (const line of lines) {
      const score = scoreSelectionLine(line);
      if (score > bestScore) {
        bestScore = score;
        selectionCandidate = line;
      }
    }
  }

  if (bestScore < 2) {
    selectionCandidate = "";
  }
  if (debug) {
  debugTrace.push({
    stage: "selection_candidate",
    selectionCandidate,
    bestScore,
  });
}

  if (!selectionCandidate) {
    const anchorIndex = lines.findIndex((line) =>
      /\b(wager|risk|stake|cash wager|odds|to win|total payout|payout)\b/i.test(line)
    );

    if (anchorIndex > 0) {
      const candidate = cleanLine(lines[anchorIndex - 1]);
      if (
        candidate &&
        !isLikelyEventLine(candidate) &&
        !/\$/.test(candidate) &&
        !/\b(Reward Credits|Tier Credits|REWARDS|Pending Credits|Caesars Rewards)\b/i.test(candidate)
      ) {
        selectionCandidate = candidate;
      }
    }
  }
if (!selectionCandidate) {
  const marketLineIndex = lines.findIndex((line) =>
    /\b(Anytime Goal Scorer|Goal Scorer|Goalscorer|Bout Betting|Method Of Victory|90 Minutes|Moneyline|Puck Line|Run Line|Spread|Total|Handicap)\b/i.test(line)
  );

  if (marketLineIndex > 0) {
    const previousLine = cleanCaesarsPrimarySelectionLine(lines[marketLineIndex - 1]);

    if (
      previousLine &&
      !/\b(CAESARS|SPORTSBOOK|Open Bets|Settled Bets|Home|Rewards|Bets|Reward Credits|Tier Credits|Quick Deposit|Deposit)\b/i.test(previousLine) &&
      !/\$/.test(previousLine)
    ) {
      selectionCandidate = previousLine;
    }
  }
}

if (debug) {
  debugTrace.push({
    stage: "selection_after_fallback",
    selectionCandidate,
  });
}
  const splitSelection = splitTrailingOdds(selectionCandidate);
let selection = cleanCaesarsSelection(splitSelection.text || selectionCandidate);

selection = selection
  .replace(/[»›>]+$/g, "")
  // Remove trailing American odds only. Do NOT remove real total lines like "Under 12.5".
  .replace(/\s+[+-]\d{2,5}$/g, "")
  .replace(/\s*\[[^\]]*$/g, "")
  .replace(/\s+\b(?:A|V|Vv|PN|EN|Ml|M|O)\b$/i, "")
  .trim();

if (/\b(Reward Credits|Tier Credits|REWARDS|Pending Credits|Caesars Rewards)\b/i.test(selection)) {
  selection = "";
}

if (debug) {
  debugTrace.push({
    stage: "selection_cleaned",
    rawSelectionCandidate: selectionCandidate,
    splitSelection,
    cleanedSelection: selection,
  });
}

const { stake, toWin, payout, odds } = extractCaesarsFinancials(
  text,
  selectionCandidate
);

let finalToWin = toWin;
let finalPayout = payout;
let payoutEstimated = false;
let payoutMismatch = false;
let calculatedToWin = "";
let calculatedPayout = "";

if (debug) {
  debugTrace.push({
    stage: "financials",
    stake,
    toWin,
    payout,
    odds,
    calculatedToWin,
    calculatedPayout,
    payoutEstimated,
    payoutMismatch,
  });
}

let impliedOdds = splitSelection.odds || odds;
if (!impliedOdds && stake && toWin) {
  impliedOdds = americanOddsFromStakeAndProfit(Number(stake), Number(toWin)) || "";
}

if (stake && impliedOdds) {
  const stakeNum = Number(stake);
  const oddsNum = Number(impliedOdds);

  if (Number.isFinite(stakeNum) && Number.isFinite(oddsNum) && stakeNum > 0) {
    if (oddsNum > 0) {
      calculatedToWin = ((stakeNum * oddsNum) / 100).toFixed(2);
    } else if (oddsNum < 0) {
      calculatedToWin = ((stakeNum * 100) / Math.abs(oddsNum)).toFixed(2);
    }

    if (calculatedToWin) {
      calculatedPayout = (stakeNum + Number(calculatedToWin)).toFixed(2);
    }
  }
}

if (!finalToWin && calculatedToWin) {
  finalToWin = calculatedToWin;
  payoutEstimated = true;
}

if (!finalPayout && calculatedPayout) {
  finalPayout = calculatedPayout;
  payoutEstimated = true;
}

if (payout && calculatedPayout) {
  const payoutNum = Number(payout);
  const calcNum = Number(calculatedPayout);

  if (
    Number.isFinite(payoutNum) &&
    Number.isFinite(calcNum) &&
    Math.abs(payoutNum - calcNum) > 0.15
  ) {
    payoutMismatch = true;
  }
}

// Lost bets correctly settle at 0.00. Do not flag those as payout mismatches
// just because the pre-bet potential payout would have been higher.
if (status === "Lost" || win === "N") {
  if (!finalPayout) finalPayout = "0.00";
  if (!finalToWin) finalToWin = "0.00";
  payoutMismatch = false;
}

if (debug) {
  debugTrace.push({
    stage: "implied_odds",
    splitOdds: splitSelection.odds,
    extractedOdds: odds,
    finalImpliedOdds: impliedOdds,
    calculatedToWin,
    calculatedPayout,
    finalToWin,
    finalPayout,
    payoutEstimated,
    payoutMismatch,
  });
}

let marketDetail = topSettled.marketDetail || topPipe.marketDetail || selection;

if (/^(over|under)\b/i.test(selection) && fixture && !selection.includes("(") && !topSettled.selection) {
  selection = `${selection} (${fixture})`;
  marketDetail = selection;
}

const betType = inferBetType(selection, marketDetail);
const detectedLeague = detectLeague({
  cleaned: text,
  marketDetail,
  fixtureEvent: fixture,
  selection,
  isParlay: /\bparlay\b|\bsgp\b|\bsame game parlay\b/i.test(text),
}) || "";

const league =
  inferCaesarsLeagueOverride({
    text,
    selection,
    fixture,
    marketDetail,
  }) ||
  detectedLeague ||
  inferCaesarsLeagueFallback({
    text,
    selection,
    fixture,
    marketDetail,
  }) ||
  "";

  const warnings = [];
  if (!stake) warnings.push("stake_missing");
  if (!finalPayout && !finalToWin) warnings.push("payout_missing");
  if (!selection) warnings.push("selection_missing");
  if (!fixture) warnings.push("fixture_missing");
  if (!betDate) warnings.push("no_bet_date_detected");
  if (payoutEstimated) warnings.push("payout_estimated");
  if (payoutMismatch) warnings.push("payout_mismatch");

  const oddsNote = impliedOdds
    ? ""
    : detectOddsMissingReason({
        oddsUS: impliedOdds,
        stake,
        payout: finalPayout,
        toWin: finalToWin,
        screenType: "",
      });

  const fallbackId = buildFallbackRowId({
    sourceFileName,
    betId,
    fixture,
    selection,
    stake,
    odds: impliedOdds,
  });

  const baseRow =
    shared?.emptyParsed && typeof shared.emptyParsed === "object"
      ? { ...shared.emptyParsed, sourceFileName }
      : {
          sourceFileName,
          id: fallbackId || `caesars|${sourceFileName}|${Date.now()}`,
        };

  const row = {
  ...baseRow,
  id: baseRow.id || fallbackId || `caesars|${sourceFileName}|${Date.now()}`,
  bookmaker: sportsbook,
  betId,
  eventDate: betDate,
  betDate,
  sportLeague: league,
  selection,
  betType,
  betSourceTag: "",
  fixtureEvent: fixture,
  stake,
  oddsUS: impliedOdds,
  oddsMissingReason: oddsNote,
  marketDetail,
  payout: finalPayout,
  toWin: finalToWin,
  live: liveFlag === "Y" ? "Y" : "N",
  bonusBet: /\bbonus bet\b/i.test(text) ? "Y" : "N",
  win,
  reviewLater: warnings.length >= 2 ? "Y" : "N",  parseWarning: warnings.join(" | "),
  rawText: originalText || cleaned,
  sourceText: originalText || cleaned,
  status,
  ...(debug ? { debugTrace } : {}),
};

  if (typeof enrichRow === "function") {
    const enriched = enrichRow(row);

    // Preserve Caesars parser league override after global enrichment.
    // This prevents generic/team-name detection from changing:
    // - NBA Kings props into NHL
    // - soccer rows into NCAAM/Tennis
    return {
      ...enriched,
      sportLeague: league || enriched.sportLeague,
      sportLeagueManual: league ? "Y" : enriched.sportLeagueManual || "N",
    };
  }

  return row;}