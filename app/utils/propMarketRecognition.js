// app/utils/propMarketRecognition.js

export const RECOGNIZED_PLAYER_PROP_MARKETS = [
  "points",
  "rebounds",
  "assists",
  "threes",
  "points + rebounds + assists",
  "points + rebounds",
  "points + assists",
  "rebounds + assists",
  "double-double",
  "triple-double",
  "goals",
  "shots on goal",
  "saves",
  "strikeouts",
  "outs",
  "total bases",
  "home runs",
  "rbis",
  "hits",
  "games",
  "method of victory",
];

const RECOGNIZED_SET = new Set(RECOGNIZED_PLAYER_PROP_MARKETS);

function clean(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRecognizedPlayerPropMarket(value = "") {
  const text = clean(value);
  if (!text) return "";

  if (RECOGNIZED_SET.has(text)) return text;

  const compact = text.replace(/\./g, "").replace(/\s*\+\s*/g, "+");

  const exactAliases = {
    "3": "threes",
    pt: "points",
    pts: "points",
    reb: "rebounds",
    rebs: "rebounds",
    ast: "assists",
    asts: "assists",
    asst: "assists",
    assts: "assists",
    "3pt": "threes",
    "3pts": "threes",
    "3pm": "threes",
    "3fgm": "threes",
    pra: "points + rebounds + assists",
    pr: "points + rebounds",
    "p+r": "points + rebounds",
    pa: "points + assists",
    "p+a": "points + assists",
    ra: "rebounds + assists",
    "r+a": "rebounds + assists",
    dd: "double-double",
    "dbl dbl": "double-double",
    td: "triple-double",
    "trpl dbl": "triple-double",
    "3d": "triple-double",
    sog: "shots on goal",
    sv: "saves",
    svs: "saves",
    k: "strikeouts",
    ks: "strikeouts",
    out: "outs",
    outs: "outs",
    tb: "total bases",
    hr: "home runs",
    hrs: "home runs",
    rbi: "rbis",
    game: "games",
    gms: "games",
    mov: "method of victory",
  };

  if (exactAliases[compact]) return exactAliases[compact];

  if (/\b(?:points?|pts?)\s*\+\s*(?:rebounds?|rebs?|reb)\s*\+\s*(?:assists?|asts?|ast|assts?|asst)\b/.test(text)) return "points + rebounds + assists";
  if (/\b(?:points?|pts?)\s*\+\s*(?:rebounds?|rebs?|reb)\b/.test(text)) return "points + rebounds";
  if (/\b(?:points?|pts?)\s*\+\s*(?:assists?|asts?|ast|assts?|asst)\b/.test(text)) return "points + assists";
  if (/\b(?:rebounds?|rebs?|reb)\s*\+\s*(?:assists?|asts?|ast|assts?|asst)\b/.test(text)) return "rebounds + assists";

  if (/\b(?:double[ -]?double|to record a double double)\b/.test(text)) return "double-double";
  if (/\b(?:triple[ -]?double|to record a triple double)\b/.test(text)) return "triple-double";
  if (/\b(?:three pointers?|3 pointers?|3 pointer|threes?|made threes?|3pt|3pts|3pm|3fgm)\b/.test(text)) return "threes";
  if (/\b(?:shots? on goal|sog)\b/.test(text)) return "shots on goal";
  if (/\b(?:strikeouts?|ks)\b/.test(text)) return "strikeouts";
  if (/\b(?:outs?|outs recorded|pitcher outs?|pitching outs?|total outs)\b/.test(text)) return "outs";
  if (/\b(?:total bases?|tb)\b/.test(text)) return "total bases";
  if (/\b(?:home runs?|homer|homers|hrs?)\b/.test(text) || /\bto hit a home run\b/.test(text)) return "home runs";
  if (/\brbis?\b/.test(text)) return "rbis";
  if (/\bhits?\b/.test(text)) return "hits";
  if (/\b(?:assists?|asts?|assts?|asst)\b/.test(text)) return "assists";
  if (/\b(?:rebounds?|rebs?|reb)\b/.test(text)) return "rebounds";
  if (/\b(?:points?|pts?)\b/.test(text)) return "points";
  if (/\b(?:anytime goal scorer|anytime goalscorer|goal scorer|goalscorer|player goals|goals?)\b/.test(text)) return "goals";
  if (/\b(?:saves?|svs?)\b/.test(text)) return "saves";
  if (/\b(?:total games?|games? o\/?u|games? over under)\b/.test(text)) return "games";
  if (/\b(?:method of victory|method of win|winning method|win method|mov|ko\/tko|submission|decision)\b/.test(text)) {
    return "method of victory";
  }

  return "";
}

export function isRecognizedPlayerPropMarket(value = "") {
  return !!normalizeRecognizedPlayerPropMarket(value);
}
