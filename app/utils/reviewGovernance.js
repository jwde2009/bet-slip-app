import { TEAM_ALIASES_BY_SPORT } from "../ev-parlay-lab/data/teamAliases";
import { isRecognizedPlayerPropMarket } from "./propMarketRecognition";

export const CORE_REVIEW_FIELDS = [
  "eventDate",
  "betDate",
  "bookmaker",
  "sportLeague",
  "betType",
  "reviewBetKind",
  "reviewMarketType",
  "selection",
  "fixtureEvent",
  "participantA",
  "participantANormalized",
  "participantB",
  "participantBNormalized",
  "canonicalSubject",
  "canonicalPlayer",
  "playerLastName",
  "propMarket",
  "propSide",
  "propLine",
  "canonicalMarketContext",
  "mainLineSide",
  "mainLineLine",
  "stake",
  "oddsUS",
  "payout",
  "toWin",
  "status",
  "win",
  "bonusBet",
  "myVariable",
];

export function parseFieldList(value = "") {
  if (Array.isArray(value)) return Array.from(new Set(value.filter(Boolean)));

  return String(value || "")
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

export function stringifyFieldList(fields = []) {
  return Array.from(new Set((fields || []).filter(Boolean))).join(",");
}

export function getManualLockedFields(row = {}) {
  return parseFieldList(row.manualLockedFields || row.manualFieldLocks || "");
}

export function addManualLockedFields(row = {}, fields = []) {
  return stringifyFieldList([
    ...getManualLockedFields(row),
    ...(fields || []).filter(Boolean),
  ]);
}

export function removeManualLockedFields(row = {}, fields = []) {
  const remove = new Set((fields || []).filter(Boolean));
  return stringifyFieldList(
    getManualLockedFields(row).filter((field) => !remove.has(field))
  );
}

export function isManualFieldLocked(row = {}, field = "") {
  return !!field && getManualLockedFields(row).includes(field);
}

export function parseJsonObject(value = "", fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch (error) {
    return fallback;
  }
}

export function getFieldSources(row = {}) {
  return parseJsonObject(row.fieldSourcesJson || row.reviewFieldSourcesJson, {});
}

export function mergeFieldSources(row = {}, sourceUpdates = {}) {
  return JSON.stringify({
    ...getFieldSources(row),
    ...(sourceUpdates || {}),
  });
}

export function getAuditTrail(row = {}) {
  const raw = row.auditTrailJson || row.reviewAuditTrailJson || "[]";

  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function displayValue(value) {
  if (value === undefined || value === null || value === "") return "(blank)";
  return String(value);
}

export function appendAuditTrail(row = {}, changes = {}, options = {}) {
  const {
    reason = "Review edit",
    source = "review",
    timestamp = new Date().toISOString(),
    maxEntries = 100,
  } = options;

  const entries = getAuditTrail(row);
  const changedFields = Object.entries(changes || {})
    .filter(([field]) => field && !field.startsWith("__"))
    .filter(([field]) => !["auditTrailJson", "reviewAuditTrailJson", "manualLockedFields", "fieldSourcesJson"].includes(field))
    .filter(([field, value]) => String(row[field] ?? "") !== String(value ?? ""))
    .map(([field, value]) => ({
      field,
      before: displayValue(row[field]),
      after: displayValue(value),
    }));

  if (!changedFields.length) return row.auditTrailJson || "";

  const nextEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: timestamp,
    reason,
    source,
    changes: changedFields,
  };

  return JSON.stringify([...entries, nextEntry].slice(-maxEntries));
}

export function preserveLockedAndReviewedFields(originalRow = {}, enrichedRow = {}) {
  const next = { ...enrichedRow };
  const manualLocks = getManualLockedFields(originalRow);
  const reviewedLocked =
    originalRow.reviewResolved === "Y" &&
    String(originalRow.reviewDataLocked || "Y").toUpperCase() !== "N";

  const fieldsToPreserve = new Set([
    ...manualLocks,
    ...(reviewedLocked ? CORE_REVIEW_FIELDS : []),
  ]);

  fieldsToPreserve.forEach((field) => {
    if (!field) return;
    if (Object.prototype.hasOwnProperty.call(originalRow, field)) {
      next[field] = originalRow[field];
    }
  });

  next.manualLockedFields = originalRow.manualLockedFields || next.manualLockedFields || "";
  next.fieldSourcesJson = originalRow.fieldSourcesJson || next.fieldSourcesJson || "";
  next.auditTrailJson = originalRow.auditTrailJson || next.auditTrailJson || "";
  next.reviewDataLocked = reviewedLocked ? "Y" : originalRow.reviewDataLocked || next.reviewDataLocked || "";

  return next;
}

function normalizedText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function getBatchQaIssues(rows = []) {
  const issues = [];
  const activeRows = (rows || []).filter((row) => {
    const archived = String(row?.archived ?? "").toLowerCase();
    return !["y", "yes", "true", "1", "archived"].includes(archived);
  });
  const seenBetIds = new Map();

  activeRows.forEach((row) => {
    const prefix = `${row.bookmaker || "Book"}: ${row.selection || "No selection"}`;
    getActiveReviewDataIssues(row, { includeAdvisory: true }).forEach((issue) => {
      issues.push({
        rowId: row.id || "",
        severity: issue.severity || "medium",
        code: issue.code,
        message: `${prefix} — ${issue.message}`,
      });
    });

    const stake = moneyNumber(row.stake);
    if (Number.isFinite(stake) && stake >= 1000) {
      issues.push({
        rowId: row.id || "",
        severity: "low",
        code: "large_stake",
        message: `${prefix} — Unusually large stake: $${stake.toFixed(2)}`,
      });
    }

    const betId = String(row.betId || "").trim().toLowerCase();
    if (betId) {
      if (!seenBetIds.has(betId)) seenBetIds.set(betId, []);
      seenBetIds.get(betId).push(row);
    }
  });

  seenBetIds.forEach((dupes, betId) => {
    if (dupes.length < 2) return;
    const fingerprints = new Set(
      dupes.map((row) =>
        [row.bookmaker, row.selection, row.stake, row.oddsUS, row.status, row.win]
          .map((value) => String(value || "").trim().toLowerCase())
          .join("|")
      )
    );
    dupes.forEach((row) => {
      issues.push({
        rowId: row.id || "",
        severity: fingerprints.size > 1 ? "high" : "medium",
        code: fingerprints.size > 1 ? "duplicate_bet_id_conflict" : "duplicate_bet_id",
        message: fingerprints.size > 1
          ? `Bet ID ${betId} appears multiple times with conflicting values`
          : `Bet ID ${betId} appears multiple times`,
      });
    });
  });

  const severityRank = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
}

export function getDecisionReasonItems(row = {}) {
  const reasons = [];
  const locked = getManualLockedFields(row);
  const fieldSources = getFieldSources(row);
  const type = normalizedText(row.betType || row.reviewBetKind || "");

  if (row.reviewBetKindManual === "Y") {
    reasons.push(`Bet type is manually locked as ${row.betType || row.reviewBetKind || "reviewed type"}.`);
  } else if (type.includes("player prop")) {
    if (row.canonicalSubject || row.canonicalPlayer) {
      reasons.push(`Player / Subject evidence: ${row.canonicalSubject || row.canonicalPlayer}.`);
    }
    if (row.propMarket) reasons.push(`Recognized prop market: ${row.propMarket}.`);
  } else if (/moneyline|spread|total/.test(type)) {
    reasons.push(`Main-line market: ${row.betType || row.reviewMarketType || row.canonicalMarketContext}.`);
    if (row.mainLineSide) reasons.push(`Selected side: ${row.mainLineSide}.`);
    if (row.mainLineLine) reasons.push(`Line: ${row.mainLineLine}.`);
  }

  if (row.sportLeagueManual === "Y") {
    reasons.push(`League manually locked as ${row.sportLeague || "(blank)"}.`);
  } else if (row.sportLeague) {
    reasons.push(`League currently resolved as ${row.sportLeague}.`);
  }

  if (row.participantANormalized || row.participantBNormalized) {
    reasons.push(
      `Participants: ${row.participantANormalized || row.participantA || "?"} vs ${
        row.participantBNormalized || row.participantB || "?"
      }.`
    );
  }

  if (locked.length) reasons.push(`Manual source-of-truth locks: ${locked.join(", ")}.`);

  const sourcedFields = Object.entries(fieldSources)
    .filter(([, source]) => source)
    .slice(0, 8)
    .map(([field, source]) => `${field}: ${source}`);

  if (sourcedFields.length) reasons.push(`Field sources — ${sourcedFields.join("; ")}.`);

  if (!reasons.length) reasons.push("No strong classification evidence is stored yet; parser/inference is still filling the row.");

  return reasons;
}


export function getQaOverrideCodes(row = {}) {
  return parseFieldList(row.reviewQaOverrideCodes || row.qaOverrideCodes || "");
}

export function stringifyQaOverrideCodes(codes = []) {
  return stringifyFieldList(codes);
}

function normalizeLeagueKey(value = "") {
  const text = normalizedText(value).replace(/[._-]+/g, " ");
  if (!text) return "";
  if (["baseball", "mlb"].includes(text)) return "mlb";
  if (text === "nba") return "nba";
  if (text === "wnba") return "wnba";
  if (text === "nfl") return "nfl";
  if (text === "nhl") return "nhl";
  if (["ncaam", "ncaa mbb", "mens college basketball", "men s college basketball", "cbb"].includes(text)) return "ncaam";
  if (["ncaaw", "ncaa wbb", "womens college basketball", "women s college basketball"].includes(text)) return "ncaaw";
  if (["ncaaf", "college football", "cfb"].includes(text)) return "ncaaf";
  if (["ncaa", "ncaab", "college", "college basketball"].includes(text)) return "ncaa";
  if (/soccer|mls|epl|premier league|la liga|serie a|bundesliga|ligue 1|champions league/.test(text)) return "soccer";
  return text;
}

function aliasSportKeyForLeague(league = "") {
  const key = normalizeLeagueKey(league);
  if (key === "mlb") return "MLB";
  if (key === "nba") return "NBA";
  if (key === "wnba") return "WNBA";
  if (key === "nfl") return "NFL";
  if (key === "nhl") return "NHL";
  return "";
}

function normalizeTeamLookup(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowTeamText(row = {}) {
  return normalizeTeamLookup([
    row.selection,
    row.fixtureEvent,
    row.eventName,
    row.participantA,
    row.participantANormalized,
    row.participantB,
    row.participantBNormalized,
    row.mainLineSide,
  ].filter(Boolean).join(" "));
}

function getCanonicalTeamsForAliasSport(sportKey = "") {
  const map = TEAM_ALIASES_BY_SPORT?.[sportKey] || {};
  const values = new Set();
  Object.entries(map).forEach(([alias, canonical]) => {
    const a = normalizeTeamLookup(alias);
    const c = normalizeTeamLookup(canonical);
    if (a) values.add(a);
    if (c) values.add(c);
  });
  return [...values];
}

function teamTextMatchesSport(text = "", sportKey = "") {
  const lookup = normalizeTeamLookup(text);
  if (!lookup || !sportKey) return false;
  return getCanonicalTeamsForAliasSport(sportKey).some((candidate) => {
    if (!candidate) return false;
    if (lookup === candidate) return true;
    if (candidate.length >= 5 && ` ${lookup} `.includes(` ${candidate} `)) return true;
    return false;
  });
}

function getContradictingProLeague(row = {}) {
  const currentLeague = normalizeLeagueKey(row.sportLeague || "");
  const text = rowTeamText(row);
  if (!text || !currentLeague) return "";

  const currentSportKey = aliasSportKeyForLeague(currentLeague);
  if (currentSportKey && teamTextMatchesSport(text, currentSportKey)) return "";

  const sportKeys = ["MLB", "NBA", "WNBA", "NFL", "NHL"];
  for (const sportKey of sportKeys) {
    if (sportKey === currentSportKey) continue;
    if (teamTextMatchesSport(text, sportKey)) return sportKey;
  }
  return "";
}

function extractObviousLine(value = "") {
  const text = String(value || "");
  const matches = [...text.matchAll(/(?:^|\s)([+-]?\d+(?:\.\d+)?)(?=\s|$)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (!matches.length) return NaN;
  return matches.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, matches[0]);
}

function getEffectiveReviewClassification(row = {}) {
  const manualKind = String(row.reviewBetKindManual || "").trim().toUpperCase() === "Y";
  const reviewKind = normalizedText(row.reviewBetKind || "");
  const reviewMarket = normalizedText(row.reviewMarketType || "");
  const canonicalMarket = normalizedText(row.canonicalMarketContext || "");
  const betType = normalizedText(row.betType || "");

  // Manual review classification is authoritative. Stale parser metadata such
  // as betType="player prop" must never make a manually reviewed Moneyline,
  // Spread, Total, Game Prop, Parlay, etc. re-enter Review All.
  if (manualKind) {
    if (reviewKind === "player prop" || reviewKind === "player_prop") {
      return { kind: "player_prop", market: "player prop" };
    }

    if (reviewKind === "main line" || reviewKind === "main_line") {
      const market = [reviewMarket, canonicalMarket, betType].find((value) =>
        /moneyline|match winner|spread|run line|puck line|handicap|total|game total|team total/.test(value)
      ) || reviewMarket || canonicalMarket || betType;
      return { kind: "main_line", market };
    }

    if (reviewKind === "other") return { kind: "other", market: reviewMarket || canonicalMarket || betType };
    if (reviewKind === "parlay") return { kind: "parlay", market: "parlay" };
    if (reviewKind === "promo special" || reviewKind === "promo_special") return { kind: "promo_special", market: "promo special" };
  }

  // Even on older rows without the explicit manual flag, the structured review
  // market is more trustworthy than legacy parser betType metadata once it is a
  // recognized main-line market.
  if (/moneyline|match winner/.test(reviewMarket)) return { kind: "main_line", market: "moneyline" };
  if (/spread|run line|puck line|handicap/.test(reviewMarket)) return { kind: "main_line", market: "spread" };
  if (/total|game total|team total/.test(reviewMarket)) return { kind: "main_line", market: "total" };
  if (/game prop/.test(reviewMarket) || reviewKind === "other") return { kind: "other", market: reviewMarket || canonicalMarket };
  if (reviewKind === "parlay") return { kind: "parlay", market: "parlay" };
  if (reviewKind === "promo special" || reviewKind === "promo_special") return { kind: "promo_special", market: "promo special" };
  if (reviewKind === "player prop" || reviewKind === "player_prop") return { kind: "player_prop", market: "player prop" };

  const combined = normalizedText([betType, canonicalMarket].filter(Boolean).join(" "));
  if (/player prop|player_prop/.test(combined)) return { kind: "player_prop", market: "player prop" };
  if (/moneyline|match winner/.test(combined)) return { kind: "main_line", market: "moneyline" };
  if (/spread|run line|puck line|handicap/.test(combined)) return { kind: "main_line", market: "spread" };
  if (/total|game total|team total/.test(combined)) return { kind: "main_line", market: "total" };
  if (/game prop/.test(combined)) return { kind: "other", market: "game prop" };
  if (/parlay/.test(combined)) return { kind: "parlay", market: "parlay" };

  return { kind: reviewKind || betType || "", market: reviewMarket || canonicalMarket || betType || "" };
}

function isPlayerPropType(row = {}) {
  return getEffectiveReviewClassification(row).kind === "player_prop";
}

function isMoneylineType(row = {}) {
  const classification = getEffectiveReviewClassification(row);
  return classification.kind === "main_line" && /moneyline|match winner/.test(classification.market);
}

export function getReviewDataIssues(row = {}, options = {}) {
  const { includeAdvisory = true } = options;
  if (!row) return [];

  const issues = [];
  const add = (severity, code, message, fields = [], kind = "data") => {
    issues.push({ severity, code, message, fields, kind });
  };
  const status = normalizedText(row.status || "");

  if (!row.betDate) add("high", "missing_bet_date", "Bet date is missing.", ["betDate"]);
  if (row.betDateNeedsConfirm === "Y") add("high", "bet_date_needs_confirm", "Bet date still needs confirmation.", ["betDate"]);
  if (!row.sportLeague) add("high", "missing_league", "League is missing.", ["sportLeague"]);
  if (!row.selection) add("high", "missing_selection", "Final selection is missing.", ["selection"]);
  if (!row.stake) add("high", "missing_stake", "Stake is missing.", ["stake"]);
  if (!row.oddsUS) add("high", "missing_odds", "Odds are missing.", ["oddsUS"]);
  if (!row.payout && !row.toWin) add("high", "missing_payout", "Payout / To Win is missing.", ["payout", "toWin"]);
  if (!row.win && !["open", "cashed out", "voided", "void", "push"].includes(status)) {
    add("high", "missing_result", "Result is missing.", ["win", "status"]);
  }
  if (!row.fixtureEvent && !row.participantANormalized && !row.participantBNormalized) {
    add("medium", "missing_event_context", "Event/context is missing.", ["fixtureEvent", "participantA", "participantB"]);
  }

  if (isPlayerPropType(row)) {
    const subject = String(row.canonicalSubject || row.canonicalPlayer || "").trim();
    if (!subject) add("high", "player_prop_missing_subject", "Player prop has no Player / Subject.", ["canonicalSubject"]);
    if (!String(row.propMarket || "").trim()) {
      add("high", "player_prop_missing_market", "Player prop has no prop market.", ["propMarket"]);
    } else if (!isRecognizedPlayerPropMarket(row.propMarket || "")) {
      add(
        "medium",
        "player_prop_unrecognized_market",
        `Player prop market "${row.propMarket}" is not in the recognized market list.`,
        ["propMarket"],
        "advisory"
      );
    }
  }

  if (includeAdvisory) {
    const leagueConflict = getContradictingProLeague(row);
    if (leagueConflict) {
      add(
        "high",
        "league_team_mismatch",
        `League is ${row.sportLeague}, but the saved team/event text contains a recognizable ${leagueConflict} team.`,
        ["sportLeague", "fixtureEvent", "participantA", "participantB", "selection"],
        "advisory"
      );
    }

    if (isMoneylineType(row)) {
      const line = extractObviousLine(`${row.selection || ""} ${row.mainLineLine || ""}`);
      if (Number.isFinite(line) && Math.abs(line) >= 1) {
        add(
          "medium",
          "moneyline_has_spread_line",
          `Bet is saved as Moneyline but the selection/line contains ${line > 0 ? "+" : ""}${line}.`,
          ["betType", "selection", "mainLineLine"],
          "advisory"
        );
      }
    }

    if (isPlayerPropType(row)) {
      const storedLine = Number(String(row.propLine || "").replace(/[^0-9.-]/g, ""));
      const inferredLine = extractObviousLine(`${row.selection || ""} ${row.marketDetail || ""}`);
      const line = Number.isFinite(storedLine) ? storedLine : inferredLine;
      const subject = String(row.canonicalSubject || row.canonicalPlayer || "").trim();
      const market = normalizedText(row.propMarket || "");
      const teamParticipants = !!String(row.participantA || row.participantANormalized || "").trim() && !!String(row.participantB || row.participantBNormalized || "").trim();
      if (Number.isFinite(line) && line >= 40 && teamParticipants && (!subject || !market || market === "prop" || market === "player prop")) {
        add(
          "medium",
          "player_prop_line_looks_like_total",
          `Player Prop line ${line} looks more like a game total and the player/market identity is weak.`,
          ["betType", "propLine", "canonicalSubject", "propMarket"],
          "advisory"
        );
      }
    }
  }

  return issues;
}

export function getActiveReviewDataIssues(row = {}, options = {}) {
  const overrides = new Set(getQaOverrideCodes(row));
  return getReviewDataIssues(row, options).filter((issue) => !overrides.has(issue.code));
}

export function getManualConflictIssues(row = {}) {
  const manual = new Set(getManualLockedFields(row));
  return getActiveReviewDataIssues(row, { includeAdvisory: true }).filter(
    (issue) => issue.kind === "advisory" && issue.fields.some((field) => manual.has(field))
  );
}
