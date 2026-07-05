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

function cleanDocument(text = "") {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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

function extractStakeWinPayout(text) {
  const source = String(text || "");

  // Handles:
  // Risk Won Payout
  // $469.00 $275.89 $744.89
  const riskWonPayout = source.match(
    /Risk\s+Won\s+Payout\s+\$?([\d,.]+)\s+\$?([\d,.]+)\s+\$?([\d,.]+)/i
  );

  if (riskWonPayout) {
    return {
      stake: riskWonPayout[1].replace(/,/g, ""),
      toWin: riskWonPayout[2].replace(/,/g, ""),
      payout: riskWonPayout[3].replace(/,/g, ""),
    };
  }

  // Handles:
  // Risk Payout
  // $50.00 $95.45
  const riskPayout = source.match(
    /Risk\s+Payout\s+\$?([\d,.]+)\s+\$?([\d,.]+)/i
  );

  if (riskPayout) {
    return {
      stake: riskPayout[1].replace(/,/g, ""),
      toWin: "",
      payout: riskPayout[2].replace(/,/g, ""),
    };
  }

  // Handles:
  // RISK WIN 469.00 275.89
  const singleLine = source.match(/RISK\s+WIN\s+([\d,.]+)\s+([\d,.]+)/i);

  if (singleLine) {
    return {
      stake: singleLine[1].replace(/,/g, ""),
      toWin: singleLine[2].replace(/,/g, ""),
      payout: "",
    };
  }

  // Handles older list rows:
  // Straight Wager -$1,030.00
  const straightWager = source.match(/\bStraight Wager\s+-?\$?([\d,.]+)/i);

  if (straightWager) {
    return {
      stake: straightWager[1].replace(/,/g, ""),
      toWin: "",
      payout: "",
    };
  }

  return { stake: "", toWin: "", payout: "" };
}

function americanOddsFromStakeAndWin(stake = "", toWin = "") {
  const s = Number(String(stake || "").replace(/,/g, ""));
  const w = Number(String(toWin || "").replace(/,/g, ""));

  if (!Number.isFinite(s) || !Number.isFinite(w) || s <= 0 || w <= 0) return "";

  if (w >= s) return `+${Math.round((w / s) * 100)}`;
  return `${Math.round(-(s / w) * 100)}`;
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

function getDateFromSourceFileName(sourceFileName = "") {
  const m = String(sourceFileName || "").match(/Screenshot_(\d{4})(\d{2})(\d{2})-/i);
  if (!m) return "";

  const [, y, mo, d] = m;
  return `${mo}/${d}/${y}`;
}

function detectCircaStatus(text = "") {
  const lower = String(text || "").toLowerCase();

  if (/\bwon\b|\bpaid\b/.test(lower)) return "Won";
  if (/\blost\b/.test(lower)) return "Lost";
  if (/\bvoid\b|\bpush\b|cancelled|canceled/.test(lower)) return "Voided";
  if (/\bopen\b|pending|straight wager\b/i.test(lower)) return "Open";

  return "";
}

function extractCircaPayout(text = "") {
  const s = String(text || "");

  const paid =
    s.match(/\bPaid:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] ||
    s.match(/\bPayout:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] ||
    s.match(/\bTotal Payout:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] ||
    "";

  return paid ? paid.replace(/,/g, "") : "";
}

function extractCircaBetId(text = "") {
  return (
    String(text || "").match(/\b(?:Ticket|Ticket #|Bet ID|Wager ID)[:# ]+([A-Z0-9-]+)/i)?.[1] ||
    ""
  );
}

function extractCircaTopTicket(text = "") {
  // Do not let footer OCR "Placed: ..." become the start of the ticket.
  const mainText = cleanDocument(text || "").split(/---\s*DATE OCR\s*---/i)[0];
  const lines = getLines(mainText);

  const placedIndex = lines.findIndex((line) => /^Placed:/i.test(line));

  const legacyDateIndex = lines.findIndex((line) =>
    /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(line)
  );

  const start =
    placedIndex !== -1
      ? placedIndex
      : legacyDateIndex !== -1
      ? legacyDateIndex
      : 0;

  let end = lines.length;

  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^Placed:/i.test(lines[i])) {
      end = i;
      break;
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

function isBadCircaFixtureLine(line = "") {
  const s = String(line || "").trim();
  const lower = s.toLowerCase();

  if (!s) return true;

  // Footer / responsible gaming / app chrome junk
  if (
    /\b(confidential|problem gamblers|helpline|gamblers|1-800|visit|terms|conditions|responsible gaming|account|cashier|login|logout)\b/i.test(
      s
    )
  ) {
    return true;
  }

  // Financial / ticket metadata
  if (/\b(Risk|Won|Payout|Placed|Straight|Wager|Ticket|Paid|Open|Lost|Void|Push)\b/i.test(s)) {
    return true;
  }

  // Too much symbol/noise, not enough letters
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return true;

  // Common OCR garbage fixture shape from bad crops, e.g. "(orca isms @ 0) sero"
  if (/^\(?[a-z\s]{3,}\s+@\s+\d+\)?\s+[a-z]+$/i.test(s)) {
    return true;
  }

  return false;
}

function extractCircaFixtureFromTicket(ticketText = "") {
  const lines = getLines(ticketText);

  const fixtureLine = lines.find((line) =>
    (/\bvs\b|\s@\s|\bat\b/i.test(line)) &&
    !isBadCircaFixtureLine(line)
  );;

  if (!fixtureLine) return "";

  return fixtureLine
    .replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}.*$/i, "")
    .replace(/\b\d{1,2}:\d{2}\s*(AM|PM)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCircaSelectionFromTicket(ticketText = "") {
  const lines = getLines(ticketText);

  const resultLine = lines.find((line) =>
    /\b(WON|LOST|VOID|PUSH)\b/i.test(line) &&
    !/\bRisk\s+Won\s+Payout\b/i.test(line) &&
    !/^\$?[\d,.]+\s+\$?[\d,.]+\s+\$?[\d,.]+$/.test(line)
  );

  if (!resultLine) return { selection: "", oddsUS: "" };

  let oddsUS = "";

  const explicitOdds = resultLine.match(/([+-]\d{2,5})(?=\s|$)/);
  if (explicitOdds) {
    oddsUS = explicitOdds[1];
  } else {
    // Common OCR shape: "WON AY 170" means likely -170.
    const trailing = resultLine.match(/\b(?:A|AY|AT|@)?\s*(\d{2,4})\s*$/i);
    if (trailing) oddsUS = `-${trailing[1]}`;
  }

  let selection = resultLine
    .replace(/^\d+\s+/, "")
    .replace(/\|/g, " ")
    .replace(/\b(WON|LOST|VOID|PUSH)\b.*$/i, "")
    .replace(/[+-]\d{2,5}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Remove remaining ticket/team number prefix, e.g. "928 RANGERS" -> "RANGERS"
  selection = selection.replace(/^\d+\s+/, "").trim();

  if (!selection || /^(won|lost|void|push)$/i.test(selection)) {
    const fallback = lines.find((line) =>
      /\b[A-Z0-9 ]+\s+(?:vs|VS|@|at)\s+[A-Z0-9 ]+\b/.test(line) &&
      !/\b(Placed|Straight|Risk|Won|Payout)\b/i.test(line)
    );

    if (fallback) {
      selection = fallback
        .replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}.*$/i, "")
        .replace(/\b\d{1,2}:\d{2}\s*(AM|PM)\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return { selection, oddsUS };
}

function extractCircaOldListSelection(ticketText = "") {
  const lines = getLines(ticketText);

  // 1) Existing good path:
  // 28916 No -400
  const yesNoLine = lines.find((line) =>
    /\b(Yes|No)\s+[+-]\d{2,5}\b/i.test(line)
  );

  if (yesNoLine) {
    const m = yesNoLine.match(/\b(Yes|No)\s+([+-]\d{2,5})\b/i);

    if (m) {
      return {
        selection: m[1],
        oddsUS: m[2],
      };
    }
  }

  // 2) Team/fighter side + odds:
  // 928 RANGERS +170
  // 12345 FIGHTER NAME -125
  for (const line of lines) {
    const raw = String(line || "").trim();

    if (!raw) continue;

    if (
      /\b(Placed|Straight|Wager|Risk|Won|Payout|Ticket|Paid|Open|Lost|Void|Push|confidential|problem gamblers|helpline|visit)\b/i.test(
        raw
      )
    ) {
      continue;
    }

    if (/\$/.test(raw)) continue;
    if (/\bvs\b|\s@\s|\bat\b/i.test(raw)) continue;

    const m = raw.match(/^\s*(?:\d{2,8}\s+)?(.+?)\s+([+-]\d{2,5})\s*$/i);
    if (!m) continue;

    let side = String(m[1] || "")
      .replace(/^\d+\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

    const oddsUS = m[2];

    // Reject junk / empty sides.
    if (!side || side.length < 2) continue;
    if (/^\d+$/.test(side)) continue;
    if (!/[A-Za-z]/.test(side)) continue;

    // Avoid grabbing likely market/description lines.
    if (
      /\b(home run|hit a home run|over|under|total|payout|wager|points?|spread|moneyline|runs?|goals?|assists?|rebounds?)\b/i.test(
        side
      )
    ) {
      continue;
    }

    return {
      selection: side,
      oddsUS,
    };
  }

  return { selection: "", oddsUS: "" };
}

function extractCircaBetDateFromTicket(ticketText = "") {
  const s = String(ticketText || "");

  let m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}\s*(AM|PM)\b/i);
  if (m) {
    return `${String(m[1]).padStart(2, "0")}/${String(m[2]).padStart(2, "0")}/${m[3]}`;
  }

  m = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!Number.isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${mm}/${dd}/${d.getFullYear()}`;
    }
  }

  return "";
}

function normalizeCircaContextText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericCircaSide(selectionSide = "") {
  const s = normalizeCircaContextText(selectionSide);
  return (
    !s ||
    s === "yes" ||
    s === "no" ||
    s === "over" ||
    s === "under" ||
    s.length < 3
  );
}

function isCircaContextMismatch(selectionSide = "", fixture = "") {
  const side = normalizeCircaContextText(selectionSide);
  const event = normalizeCircaContextText(fixture);

  if (isGenericCircaSide(side)) return false;
  if (!event) return false;

  // Direct containment catches normal rows:
  // "RANGERS" inside "DIAMONDBACKS vs RANGERS"
  if (event.includes(side)) return false;

  // Also allow any meaningful word from a multi-word side.
  const sideWords = side.split(" ").filter((word) => word.length >= 4);
  if (sideWords.some((word) => event.includes(word))) return false;

  return true;
}

function inferCircaLeague({ text = "", selection = "", fixture = "" } = {}) {
  const joined = `${text} ${selection} ${fixture}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // Strong market clues first.
  if (/\bhit a home run\b/i.test(joined)) return "Baseball";
  // Direct MLB team-name fallback. Keep this before soccer, because some OCR
  // ticket text can contain generic words like draw that otherwise trigger Soccer.
  if (
    /\b(orioles|yankees|diamondbacks|d-backs|padres|giants|mariners|royals|dodgers|guardians|pirates|rangers|marlins|reds|angels|astros|cardinals|rockies|nationals|cubs|white sox|tigers|mets|red sox|blue jays|rays|twins|brewers|braves|phillies|athletics)\b/i.test(joined)
  ) {
    return "Baseball";
  }
  if (/\bscore a goal\b/i.test(joined)) return "NHL";
  if (/\bby submission|by ko|ko\/tko|ufc|mma|no action\b/i.test(joined)) return "MMA";

  // Soccer clubs / soccer market clues.
  if (
    /\b(90 minutes|draw|draw no bet|both teams to score|correct score)\b/i.test(joined) ||
    /\b(mallorca|girona|elche|rayo vallecano|atletico madrid|philadelphia union|columbus crew|orlando city|dc united|d\.c\. united|sporting kc|sporting kansas city|colorado rapids|sounders|whitecaps|lafc|la galaxy|st\.?\s*louis city|portland timbers|inter miami|atlanta united|fc cincinnati|nycfc|new york red bulls|real salt lake|houston dynamo|austin fc|fc dallas|nashville sc|charlotte fc|chicago fire|san jose earthquakes|minnesota united)\b/i.test(joined)
  ) {
    return "Soccer";
  }

  // NBA team names.
  if (
    /\b(heat|wizards|raptors|pistons|lakers|celtics|bucks|knicks|nets|kings|spurs|suns|mavericks|pelicans|rockets|nuggets|hornets|grizzlies|clippers|warriors|magic|76ers|sixers|jazz|hawks|pacers|bulls|cavaliers|timberwolves|trail blazers)\b/i.test(joined)
  ) {
    return "NBA";
  }

  // Baseball team names / abbreviations in old list rows.
  if (
    /\b(ari|lad|sd|sea|cle|pit|tex|mia|cin|laa|hou|stl|col|was|chc|chw|det|nyy|nym|bos|bal|tb|tor|kc|oak|sf|mil|min|atl|phi|rangers|diamondbacks|padres|giants|orioles|yankees)\b/i.test(joined)
  ) {
    // Only use this generic abbreviation route when baseball language is present.
    if (/\bhit a home run\b|home run|homer/i.test(joined)) return "Baseball";
  }

  return "";
}

export function parseCircaSlip(cleaned, shared = {}, sourceFileName = "", originalText = "") {
  const { enrichRow, parsePlacedDate, detectStatus, extractBetId } = shared || {};

  const fullText = cleanDocument(originalText || cleaned || "");
  const text = extractCircaTopTicket(fullText);
  const lines = getLines(text);

  // --- Extract pieces ---
  const topSelection = extractCircaSelectionFromTicket(text);
  const oldListSelection = extractCircaOldListSelection(text);
  const oddsMatch = extractOdds(text);

  let selection =
    topSelection.selection ||
    oldListSelection.selection ||
    oddsMatch.selection;

  let odds =
    topSelection.oddsUS ||
    oldListSelection.oddsUS ||
    oddsMatch.odds;

  // Improve selection using fixture context
  const fixture = extractCircaFixtureFromTicket(text) || extractFixture(text);

  selection = String(selection || "")
    .replace(/\s*\[\s*$/g, "")
    .replace(/\s+@\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Do not accept market/category words as the selected side.
  // Example bad parse: "SEA @ SD (TY FRANCE HIT A HOME RUN) → POINTS"
  if (/^(points?|spread|moneyline|total|runs?|goals?|assists?|rebounds?)$/i.test(selection)) {
    selection = oldListSelection.selection || "";
  }

  const selectionSideForContext = String(selection || "").trim();

  if (selection && fixture) {
    selection = `${fixture} → ${selection}`;
  }

  const contextMismatch = isCircaContextMismatch(selectionSideForContext, fixture);
  const money = extractStakeWinPayout(text);
  const stake = money.stake;
  const toWin = money.toWin;
  let payout = money.payout;

  if (!odds && stake && toWin) {
    odds = americanOddsFromStakeAndWin(stake, toWin);
  }
  const fixtureEvent = fixture;

  const betType = classifyBetType(fixtureEvent);

  const placed =
    typeof parsePlacedDate === "function"
      ? parsePlacedDate(text)
      : { raw: "", dateOnly: "" };

  const status =
    detectCircaStatus(text) ||
    (typeof detectStatus === "function" ? detectStatus(text) : "");

  const win =
    status === "Won"
      ? "Y"
      : status === "Lost"
      ? "N"
      : "";

  payout =
    status === "Lost"
      ? "0.00"
      : payout || extractCircaPayout(text);

  const betId =
    extractCircaBetId(text) ||
    (typeof extractBetId === "function" ? extractBetId(text) : "");

  const betDate =
    placed.dateOnly ||
    extractCircaBetDateFromTicket(text) ||
    getDateFromSourceFileName(sourceFileName);

  const circaLeague = inferCircaLeague({
    text,
    selection,
    fixture: fixtureEvent,
  });

  const row = {
    eventDate: betDate,
    betDate,
    bookmaker: "Circa",
    sportLeague: circaLeague,
    sportLeagueManual: circaLeague ? "Y" : "N",
    selection: selection || fixtureEvent,
    betType,
    fixtureEvent,
    stake,
    oddsUS: odds,
    oddsSource: "OCR",
    oddsMissingReason: odds ? "" : "missing",
    live: "N",
    bonusBet: "N",
    win,
    marketDetail: fixtureEvent,
    payout,
    toWin,
    rawPlacedDate: placed.raw || "",
    status,
    parseWarning: [
      selection ? "" : "circa_selection_missing",
      !status || status === "Open" ? "circa_result_needs_review" : "",
      !stake ? "circa_stake_missing" : "",
      contextMismatch ? "circa_context_mismatch" : "",    ]
      .filter(Boolean)
      .join(" | "),
    duplicateWarning: "",
    sourceFileName,
    sourceText: originalText || cleaned,
    sourceImageUrl: "",
    reviewNotes: "",
    betId,
    accountOwner: "Me",
    betSourceTag: "",
    impliedProbability: "",
    confidenceFlag: selection && odds && !contextMismatch ? "Medium" : "Low",
    likelyParserIssue: selection && !contextMismatch ? "N" : "Y",
    reviewLater: selection && status && status !== "Open" && stake && !contextMismatch ? "N" : "Y",    duplicateIgnored: "N",
    reviewResolved: "N",
  };

  if (typeof enrichRow === "function") {
    const enriched = enrichRow(row);

    // Preserve Circa parser league override after global enrichment.
    return {
      ...enriched,
      sportLeague: circaLeague || enriched.sportLeague,
      sportLeagueManual: circaLeague ? "Y" : enriched.sportLeagueManual || "N",
    };
  }

  return row;}