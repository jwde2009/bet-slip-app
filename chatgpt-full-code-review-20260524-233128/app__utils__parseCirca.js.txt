// app/utils/parseCirca.js

function clean(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLines(text) {
  return text.split("\n").map((l) => clean(l)).filter(Boolean);
}

function extractOdds(text) {
  const m = text.match(/\b(Yes|No)\s+([+-]\d{2,5})/i);
  if (!m) return { selection: "", odds: "" };

  return {
    selection: m[1],
    odds: m[2],
  };
}

function extractStakeAndWin(text) {
  const m = text.match(/RISK\s+WIN\s+([\d,.]+)\s+([\d,.]+)/i);
  if (!m) return { stake: "", toWin: "" };

  return {
    stake: m[1].replace(/,/g, ""),
    toWin: m[2].replace(/,/g, ""),
  };
}

function extractFixture(text) {
  const m = text.match(/([A-Z]{2,5}\/[A-Z]{2,5})\s+(.+?)\?/i);
  if (!m) return "";

  const matchup = m[1].replace("/", " @ ");
  const detail = m[2].trim();

  return `${matchup} (${detail})`;
}

function classifyBetType(fixture = "") {
  const lower = fixture.toLowerCase();

  if (lower.includes("over") || lower.includes("under") || lower.includes("total")) {
    return "total";
  }

  return "moneyline";
}

export function parseCircaSlip(cleaned, shared = {}) {
  const { enrichRow, parsePlacedDate } = shared || {};

  const text = clean(cleaned || "");
  const lines = getLines(text);

  // --- Extract pieces ---
  const oddsMatch = extractOdds(text);
  let selection = oddsMatch.selection;
  const odds = oddsMatch.odds;

  // Improve selection using fixture context
  const fixture = extractFixture(text);

  if (selection && fixture) {
    selection = `${fixture} → ${selection}`;
  }
  const { stake, toWin } = extractStakeAndWin(text);
  const fixtureEvent = extractFixture(text);

  const betType = classifyBetType(fixtureEvent);

  const placed =
    typeof parsePlacedDate === "function"
      ? parsePlacedDate(text)
      : { raw: "", dateOnly: "" };

  const row = {
    eventDate: "",
    betDate: placed.dateOnly || "",
    bookmaker: "Circa",
    sportLeague: "", // let your global detection handle this
    selection: selection || fixtureEvent,
    betType,
    fixtureEvent,
    stake,
    oddsUS: odds,
    oddsSource: "OCR",
    oddsMissingReason: odds ? "" : "missing",
    live: "N",
    bonusBet: "N",
    win: "",
    marketDetail: fixtureEvent,
    payout: "",
    toWin,
    rawPlacedDate: placed.raw || "",
    status: "Open",
    parseWarning: selection ? "" : "circa_selection_missing",
    duplicateWarning: "",
    sourceFileName: "",
    sourceText: text,
    sourceImageUrl: "",
    reviewNotes: "",
    betId: "",
    accountOwner: "Me",
    betSourceTag: "",
    impliedProbability: "",
    confidenceFlag: selection && odds ? "Medium" : "Low",
    likelyParserIssue: selection ? "N" : "Y",
    reviewLater: selection ? "N" : "Y",
    duplicateIgnored: "N",
    reviewResolved: "N",
  };

  return typeof enrichRow === "function" ? enrichRow(row) : row;
}