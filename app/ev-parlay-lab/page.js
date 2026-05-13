"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ImportPanel from "./components/ImportPanel";
import ExtractionGuide from "./components/ExtractionGuide";
import ParsedOddsTable from "./components/ParsedOddsTable";
import MarketMatchPanel from "./components/MarketMatchPanel";
import ManualMatchPanel from "./components/ManualMatchPanel";
import FairOddsPanel from "./components/FairOddsPanel";
import TopEdgeBetsPanel from "./components/TopEdgeBetsPanel";
import LoadCoveragePanel from "./components/LoadCoveragePanel";
import ParlayFilters from "./components/ParlayFilters";
import ParlayResults from "./components/ParlayResults";
import BoostWalletPanel from "./components/BoostWalletPanel";
import SessionReadinessPanel from "./components/SessionReadinessPanel";

import { SAMPLE_RAW_TEXT, SAMPLE_FILTERS } from "./data/sampleData";
import { parseOddsText } from "./utils/parseOddsText";
import { normalizeParsedRows } from "./utils/normalizeTeams";
import { buildCanonicalMarkets } from "./utils/matchMarkets";
import { calculateFairOddsForMarkets } from "./utils/fairOdds";
import { buildParlayCandidates } from "./utils/parlayEngine";
import { normalizeMarketType } from "./utils/marketNormalization";
import { americanToDecimal } from "./utils/odds";

const IMPORT_QUEUE_KEY = "EV_IMPORT_QUEUE";
const SAVED_SESSION_KEY = "EV_PARLAY_LAB_SESSION";
const SAVED_PLACED_PARLAYS_KEY = "EV_PARLAY_LAB_PLACED_PARLAYS";
const BOOST_WALLET_KEY = "EV_PARLAY_LAB_BOOST_WALLET";
const BLOCKED_PARLAY_LEGS_KEY = "EV_PARLAY_LAB_BLOCKED_PARLAY_LEGS";
const SAVED_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function withDefaultFilters(filters = {}) {
  return {
    devigMethod: "power",
    ...(filters || {}),
  };
}

function readImportQueue() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMPORT_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeImportQueue(queue) {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
}

function readSavedPlacedParlays() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_PLACED_PARLAYS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function readBoostWallet() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(BOOST_WALLET_KEY) || "[]");
    const boosts = Array.isArray(parsed) ? parsed : [];
    const activeBoosts = pruneExpiredBoosts(boosts);

    if (activeBoosts.length !== boosts.length) {
      localStorage.setItem(BOOST_WALLET_KEY, JSON.stringify(activeBoosts));
    }

    return activeBoosts;
  } catch (err) {
    return [];
  }
}

function pruneExpiredBoosts(boosts = []) {
  const now = Date.now();

  return (boosts || []).filter((boost) => {
    if (!boost?.expiresAt) return true;

    const expiresAt = new Date(boost.expiresAt).getTime();

    if (!Number.isFinite(expiresAt)) return true;

    return expiresAt > now;
  });
}

function writeBoostWallet(boosts) {
  if (typeof window === "undefined") return;

  const activeBoosts = pruneExpiredBoosts(Array.isArray(boosts) ? boosts : []);

  localStorage.setItem(BOOST_WALLET_KEY, JSON.stringify(activeBoosts));
}

function readBlockedParlayLegs() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(BLOCKED_PARLAY_LEGS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeBlockedParlayLegs(blockedLegs) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    BLOCKED_PARLAY_LEGS_KEY,
    JSON.stringify(Array.isArray(blockedLegs) ? blockedLegs : [])
  );
}




function writeSavedPlacedParlays(parlays) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SAVED_PLACED_PARLAYS_KEY,
    JSON.stringify(Array.isArray(parlays) ? parlays : [])
  );
}

function normalizeLegKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSavedLegKeyFromLeg(leg = {}) {
  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName),
    normalizeLegKeyPart(leg.selectionLabel),
    normalizeLegKeyPart(leg.lineValue),
  ].join("::");
}

function buildSavedLegFamilyKeyFromLeg(leg = {}) {
  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName || leg.selectionLabel),
    normalizeLegKeyPart(leg.selectionLabel),
    normalizeLegKeyPart(leg.lineValue),
  ].join("::");
}

function buildSavedLegRepeatKeyFromLeg(leg = {}) {
  const selection = String(leg.selectionLabel || "").trim().toLowerCase();

  const side =
    /\bover\b/.test(selection)
      ? "over"
      : /\bunder\b/.test(selection)
        ? "under"
        : /\byes\b/.test(selection)
          ? "yes"
          : /\bno\b/.test(selection)
            ? "no"
            : selection;

  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName || leg.selectionLabel),
    normalizeLegKeyPart(side),
  ].join("::");
}

function getLocalTodayKeyForRepeatBlocking() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateKeyForRepeatBlocking(value) {
  if (!value) return "";

  const text = String(value || "").trim();

  // ISO style: 2026-05-03 or 2026-05-03T21:29:32.000Z
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Browser/local display style: 05/03/2026
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const month = String(slashMatch[1]).padStart(2, "0");
    const day = String(slashMatch[2]).padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return text.slice(0, 10);
}

function normalizeLegDisplayForRepeat(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\b/g, " ")
    .replace(/[^\w+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSavedLegDisplayKeyFromLeg(leg = {}) {
  const label = leg.displayLabel || formatBlockedLegDisplay(leg);

  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(label),
  ].join("::");
}

function buildSavedLegDisplayRepeatKeyFromLeg(leg = {}) {
  const label = leg.displayLabel || formatBlockedLegDisplay(leg);

  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegDisplayForRepeat(label),
  ].join("::");
}

function buildSavedLegUsageMap(savedPlacedParlays = [], blockedParlayLegs = []) {
  const usage = new Map();
  const todayKey = getLocalTodayKeyForRepeatBlocking();

  function addUsageKey(key, payload = {}) {
    if (!key) return;

    usage.set(key, {
      count: (usage.get(key)?.count || 0) + 1,
      lastUsedAt: payload.lastUsedAt || usage.get(key)?.lastUsedAt || "",
      parlayIds: Array.from(
        new Set([...(usage.get(key)?.parlayIds || []), ...(payload.parlayIds || [])])
      ),
      blocked: payload.blocked === true || usage.get(key)?.blocked === true,
      blockedLabel: payload.blockedLabel || usage.get(key)?.blockedLabel || "",
      source: payload.source || usage.get(key)?.source || "",
    });
  }

  // Manual blocked legs persist until manually removed.
  for (const blocked of blockedParlayLegs || []) {
      const keys = Array.from(
        new Set([
          blocked.savedLegKey,
          blocked.savedLegFamilyKey,
          blocked.savedLegRepeatKey,
          blocked.savedLegDisplayKey,
          blocked.savedLegDisplayRepeatKey,
          buildSavedLegKeyFromLeg(blocked),
          buildSavedLegFamilyKeyFromLeg(blocked),
          buildSavedLegRepeatKeyFromLeg(blocked),
          buildSavedLegDisplayKeyFromLeg(blocked),
          buildSavedLegDisplayRepeatKeyFromLeg(blocked),
        ].filter(Boolean))
      );

    for (const key of keys) {
      addUsageKey(key, {
        blocked: true,
        blockedLabel: blocked.displayLabel || formatBlockedLegDisplay(blocked),
        source: "manual_block",
        lastUsedAt: blocked.blockedAt || "",
      });
    }
  }

  // Confirmed placed parlays are permanent history, but repeat-leg blocking
  // should only use active/current-day pending parlays.
  for (const parlay of savedPlacedParlays || []) {
    const status = String(parlay.status || "").toLowerCase();
    const placedDateKey = getDateKeyForRepeatBlocking(
      parlay.placedDate || parlay.placedAt || parlay.savedAt || ""
    );

    const isSettled = ["won", "lost", "push", "void"].includes(status);
    const isConfirmedOrPending =
      parlay.confirmedPlaced === true ||
      status === "placed" ||
      status === "pending";

    const isSameLocalSlate =
      !placedDateKey ||
      placedDateKey === todayKey;

    const isActiveForRepeatBlocking =
      isConfirmedOrPending &&
      !isSettled &&
      isSameLocalSlate;


    if (!isActiveForRepeatBlocking) continue;

    for (const leg of parlay?.legs || []) {
      const keys = Array.from(
        new Set([
          leg.savedLegKey || buildSavedLegKeyFromLeg(leg),
          leg.savedLegFamilyKey || buildSavedLegFamilyKeyFromLeg(leg),
          leg.savedLegRepeatKey || buildSavedLegRepeatKeyFromLeg(leg),
          leg.savedLegDisplayKey || buildSavedLegDisplayKeyFromLeg(leg),
          leg.savedLegDisplayRepeatKey || buildSavedLegDisplayRepeatKeyFromLeg(leg),
        ].filter(Boolean))
      );

      for (const key of keys) {
        addUsageKey(key, {
          parlayIds: [parlay.id],
          lastUsedAt: parlay.savedAt || parlay.placedAt || "",
          source: "placed_parlay",
        });
      }
    }
  }

  return usage;
}

function formatMarketLabelForSavedLeg(marketType = "") {
  const text = String(marketType || "").trim();

  const labels = {
    moneyline_2way: "Moneyline",
    moneyline_3way: "Moneyline",
    spread: "Spread",
    total: "Total",
    player_points: "Points",
    player_assists: "Assists",
    player_rebounds: "Rebounds",
    player_threes: "Threes",
    player_pra: "PRA",
    player_points_rebounds: "Points + Rebounds",
    player_points_assists: "Points + Assists",
    player_rebounds_assists: "Rebounds + Assists",
    double_double: "Double-Double",
    triple_double: "Triple-Double",
  };

  return labels[text] || text.replace(/_/g, " ");
}

function getSelectionSideForSavedLeg(leg = {}) {
  const selection = String(leg.selectionLabel || "").trim();

  if (/\bover\b/i.test(selection)) return "Over";
  if (/\bunder\b/i.test(selection)) return "Under";
  if (/^yes$/i.test(selection) || /\byes\b/i.test(selection)) return "Yes";
  if (/^no$/i.test(selection) || /\bno\b/i.test(selection)) return "No";

  return "";
}

function formatBlockedLegDisplay(leg = {}) {
  const subject = String(leg.subjectName || "").trim();
  const selection = String(leg.selectionLabel || "").trim();
  const side = getSelectionSideForSavedLeg(leg);
  const line =
    leg.lineValue !== null && leg.lineValue !== undefined && leg.lineValue !== ""
      ? String(leg.lineValue)
      : "";
  const marketLabel = formatMarketLabelForSavedLeg(leg.marketType);

  if (subject && side) {
    return `${subject} ${side}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  if (subject && line && isPlayerPropMarketName(leg.marketType)) {
    return `${subject} Over ${line}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  if (subject && selection && selection.toLowerCase() !== subject.toLowerCase()) {
    return `${subject} ${selection}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  if (selection) {
    return `${selection}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
  }

  return `${subject || "Blocked leg"}${line ? ` ${line}` : ""}${marketLabel ? ` ${marketLabel}` : ""}`.trim();
}

function isPlayerPropMarketName(marketType = "") {
  const text = String(marketType || "").toLowerCase();

  return (
    text.startsWith("player_") ||
    text === "double_double" ||
    text === "triple_double"
  );
}

function makeBlockedLegRecordFromLeg(leg = {}) {
  const savedLegKey = leg.savedLegKey || buildSavedLegKeyFromLeg(leg);
  const savedLegFamilyKey =
    leg.savedLegFamilyKey || buildSavedLegFamilyKeyFromLeg(leg);
  const savedLegRepeatKey =
    leg.savedLegRepeatKey || buildSavedLegRepeatKeyFromLeg(leg);
  const savedLegDisplayKey =
    leg.savedLegDisplayKey || buildSavedLegDisplayKeyFromLeg(leg);
  const savedLegDisplayRepeatKey =
    leg.savedLegDisplayRepeatKey || buildSavedLegDisplayRepeatKeyFromLeg(leg);

  return {
    id: `blocked_${savedLegFamilyKey || savedLegKey || Date.now()}`,
    blockedAt: new Date().toISOString(),
    savedLegKey,
    savedLegFamilyKey,
    savedLegRepeatKey,
    savedLegDisplayKey,
    savedLegDisplayRepeatKey,
    displayLabel: leg.displayLabel || formatBlockedLegDisplay(leg),
    eventName: leg.eventName || "",
    sport: leg.sport || "",
    marketType: leg.marketType || "",
    subjectName: leg.subjectName || "",
    selectionLabel: leg.selectionLabel || "",
    lineValue: leg.lineValue ?? null,
    sportsbook: leg.sportsbook || "",
    oddsAmerican: leg.oddsAmerican ?? null,
  };
}


function makePlacedParlayRecord(parlay, options = {}) {
  const savedAt = new Date().toISOString();
  const selectedBoost = options.selectedBoost || null;
  const placedStake = Number(options.placedStake);
  const placedOddsAmerican =
    Number.isFinite(Number(options.placedOddsAmerican))
      ? Number(options.placedOddsAmerican)
      : Number.isFinite(Number(parlay?.boostedParlayAmerican))
        ? Number(parlay.boostedParlayAmerican)
        : Number.isFinite(Number(parlay?.rawParlayAmerican))
          ? Number(parlay.rawParlayAmerican)
          : null;

  const legBooks = Array.from(
    new Set(
      (parlay?.legs || [])
        .map((leg) => String(leg.sportsbook || "").trim())
        .filter(Boolean)
    )
  );

  const bookmaker =
    selectedBoost?.sportsbook ||
    (legBooks.length === 1 ? legBooks[0] : legBooks.length > 1 ? "Multiple" : "");

  return {
    id: `placed_parlay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    bookmaker,
    targetSportsbook: bookmaker,

    // Lifecycle:
    // saved = idea saved but not confirmed as placed
    // placed = confirmed placed / pending settlement
    // won/lost/push/void = settled history
    status: "saved",
    confirmedPlaced: false,

    savedAt,
    placedAt: "",
    settledAt: "",
    placedDate: savedAt.slice(0, 10),

    placedStake: Number.isFinite(placedStake) ? placedStake : Number(parlay?.stake ?? 0),
    placedOddsAmerican,
    result: "",
    profitLoss: 0,

    boostId: selectedBoost?.id || "",
    boostName: selectedBoost?.name || "",
    boostSportsbook: selectedBoost?.sportsbook || "",
    boostSportsbookLabel: selectedBoost?.sportsbookLabel || selectedBoost?.sportsbook || "",
    boostExpiresAt: selectedBoost?.expiresAt || "",
    boostPct: Number(selectedBoost?.boostPct ?? parlay?.boostPctUsed ?? 0),

    rawParlayAmerican: parlay?.rawParlayAmerican ?? null,
    boostedParlayAmerican: parlay?.boostedParlayAmerican ?? null,
    expectedValuePct: parlay?.expectedValuePct ?? null,
    fairHitProbability: parlay?.fairHitProbability ?? null,
    gradeTier: parlay?.gradeTier || "",
    playLabel: parlay?.playLabel || "",

    legs: (parlay?.legs || []).map((leg) => {
      const savedLegKey = leg.savedLegKey || buildSavedLegKeyFromLeg(leg);
      const savedLegFamilyKey =
        leg.savedLegFamilyKey || buildSavedLegFamilyKeyFromLeg(leg);
      const savedLegRepeatKey =
        leg.savedLegRepeatKey || buildSavedLegRepeatKeyFromLeg(leg);
      const savedLegDisplayKey =
        leg.savedLegDisplayKey || buildSavedLegDisplayKeyFromLeg(leg);
      const savedLegDisplayRepeatKey =
        leg.savedLegDisplayRepeatKey || buildSavedLegDisplayRepeatKeyFromLeg(leg);

      return {
        savedLegKey,
        savedLegFamilyKey,
        savedLegRepeatKey,
        savedLegDisplayKey,
        savedLegDisplayRepeatKey,
        displayLabel: leg.displayLabel || formatBlockedLegDisplay(leg),
        eventName: leg.eventName || "",
        eventDate: leg.eventDate || leg.startTime || "",
        sport: leg.sport || "",
        marketType: leg.marketType || "",
        subjectName: leg.subjectName || "",
        selectionLabel: leg.selectionLabel || "",
        lineValue: leg.lineValue ?? null,
        sportsbook: leg.sportsbook || "",
        oddsAmerican: leg.oddsAmerican ?? null,
      };
    }),
  };
}

function parseManualAmericanOdds(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const cleaned = text.replace(/[^\d+-]/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed === 0) return null;

  return parsed;
}

function parseManualLineValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const parsed = Number(text.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeManualMarketType(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  const aliases = {
    points: "player_points",
    "player points": "player_points",
    assists: "player_assists",
    "player assists": "player_assists",
    rebounds: "player_rebounds",
    "player rebounds": "player_rebounds",
    threes: "player_threes",
    "3 pointers": "player_threes",
    "3-pointers": "player_threes",
    "three pointers": "player_threes",
    "player threes": "player_threes",
    "player three-pointers": "player_threes",
    pra: "player_pra",
    "points rebounds assists": "player_pra",
    "points + rebounds + assists": "player_pra",
    "pts + reb + ast": "player_pra",
    "points + rebounds": "player_points_rebounds",
    "pts + reb": "player_points_rebounds",
    "points + assists": "player_points_assists",
    "pts + ast": "player_points_assists",
    "rebounds + assists": "player_rebounds_assists",
    "reb + ast": "player_rebounds_assists",
    "double double": "double_double",
    "double-double": "double_double",
    "triple double": "triple_double",
    "triple-double": "triple_double",
    moneyline: "moneyline_2way",
    spread: "spread",
    total: "total",
    goals: "player_goals",
    "player goals": "player_goals",
    shots: "player_shots_on_goal",
    "shots on goal": "player_shots_on_goal",
    "player shots": "player_shots_on_goal",
    saves: "player_saves",
    "goalie saves": "player_saves",
    "player saves": "player_saves",
  };

  return aliases[text] || normalizeMarketType(value || "manual");
}

function normalizeManualSelectionLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  if (/^o(ver)?$/i.test(text)) return "Over";
  if (/^u(nder)?$/i.test(text)) return "Under";
  if (/^y(es)?$/i.test(text)) return "Yes";
  if (/^n(o)?$/i.test(text)) return "No";

  return text;
}

function parseManualLegLines(legsText = "", defaults = {}) {
  return String(legsText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());

      const eventName = parts[0] || defaults.eventName || "";
      const marketType = normalizeManualMarketType(parts[1] || defaults.marketType || "manual");
      const subjectName = parts[2] || "";
      const selectionLabel = normalizeManualSelectionLabel(parts[3] || "");
      const lineValue = parseManualLineValue(parts[4]);
      const oddsAmerican = parseManualAmericanOdds(parts[5]);

      const leg = {
        eventName,
        eventDate: defaults.placedDate || "",
        sport: String(defaults.sport || "").trim().toUpperCase(),
        marketType,
        subjectName,
        selectionLabel,
        lineValue,
        sportsbook: defaults.bookmaker || "",
        oddsAmerican,
      };

      const savedLegKey = buildSavedLegKeyFromLeg(leg);
      const savedLegFamilyKey = buildSavedLegFamilyKeyFromLeg(leg);
      const savedLegRepeatKey = buildSavedLegRepeatKeyFromLeg(leg);
      const savedLegDisplayKey = buildSavedLegDisplayKeyFromLeg(leg);
      const savedLegDisplayRepeatKey = buildSavedLegDisplayRepeatKeyFromLeg(leg);

      return {
        ...leg,
        savedLegKey,
        savedLegFamilyKey,
        savedLegRepeatKey,
        savedLegDisplayKey,
        savedLegDisplayRepeatKey,
        displayLabel: formatBlockedLegDisplay(leg) || `Manual leg ${index + 1}`,
      };
    });
}

function makeManualPlacedParlayRecord(draft = {}) {
  const savedAt = new Date().toISOString();
  const placedDate = String(draft.placedDate || savedAt.slice(0, 10)).trim();
  const bookmaker = String(draft.bookmaker || "Manual").trim();
  const sport = String(draft.sport || "NBA").trim().toUpperCase();
  const placedStake = Number(draft.placedStake || 0);
  const placedOddsAmerican = parseManualAmericanOdds(draft.placedOddsAmerican);

  const legs = parseManualLegLines(draft.legsText, {
    bookmaker,
    sport,
    placedDate,
  });

  return {
    id: `manual_parlay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    manualEntry: true,
    bookmaker,
    targetSportsbook: bookmaker,

    status: "placed",
    confirmedPlaced: true,

    savedAt,
    placedAt: savedAt,
    settledAt: "",
    placedDate,

    placedStake: Number.isFinite(placedStake) ? placedStake : 0,
    placedOddsAmerican,
    result: "",
    profitLoss: 0,

    boostId: "",
    boostName: String(draft.boostName || "").trim(),
    boostSportsbook: "",
    boostSportsbookLabel: "",
    boostExpiresAt: "",
    boostPct: Number.isFinite(Number(draft.boostPct)) ? Number(draft.boostPct) : 0,

    rawParlayAmerican: placedOddsAmerican,
    boostedParlayAmerican: placedOddsAmerican,
    expectedValuePct: null,
    fairHitProbability: null,
    gradeTier: "Manual",
    playLabel: String(draft.name || "Manual Placed Parlay").trim() || "Manual Placed Parlay",
    notes: String(draft.notes || "").trim() ? [String(draft.notes || "").trim()] : [],

    legs,
  };
}

function parseEditedAmericanOdds(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const cleaned = text.replace(/[^\d+-]/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed === 0) return null;

  return parsed;
}

function calculateAmericanOddsProfit(stake, americanOdds) {
  const s = Number(stake);
  const odds = Number(americanOdds);

  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(odds) || odds === 0) {
    return 0;
  }

  if (odds > 0) return s * (odds / 100);
  return s * (100 / Math.abs(odds));
}

function calculateSavedParlayProfitLoss(parlay, statusOverride) {
  const status = String(statusOverride || parlay?.status || "").toLowerCase();
  const stake = Number(parlay?.placedStake || 0);
  const odds = Number(parlay?.placedOddsAmerican ?? parlay?.boostedParlayAmerican ?? parlay?.rawParlayAmerican);

  if (status === "won") return calculateAmericanOddsProfit(stake, odds);
  if (status === "lost") return -stake;
  if (status === "push" || status === "void") return 0;

  return Number(parlay?.profitLoss || 0);
}


function formatSavedDateTime(value) {
  if (!value) return "Unknown time";

  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return String(value);
  }
}


function calculateSingleKellyStake({
  bankroll,
  kellyFraction,
  fairProbability,
  oddsDecimal,
}) {
  const resolvedBankroll = Number(bankroll) || 0;
  const resolvedKellyFraction = Number(kellyFraction) || 0;

  if (
    !(resolvedBankroll > 0) ||
    !(resolvedKellyFraction > 0) ||
    !(fairProbability > 0) ||
    !(fairProbability < 1) ||
    !(oddsDecimal > 1)
  ) {
    return 0;
  }

  const b = oddsDecimal - 1;
  const p = fairProbability;
  const q = 1 - p;

  const fullKellyFraction = (b * p - q) / b;

  if (!(fullKellyFraction > 0)) {
    return 0;
  }

  return resolvedBankroll * resolvedKellyFraction * fullKellyFraction;
}

function extractSubjectNameFromMarket(market) {
  const subjectKey = String(market?.subjectKey || "");

  if (!subjectKey.includes("::")) return "";

  const rawName = subjectKey.split("::").slice(1).join("::").trim();
  if (!rawName) return "";

  return rawName
    .split(/\s+/)
    .map((part) => {
      if (/^[a-z]\.$/i.test(part)) return part.toUpperCase();
      if (/^mj$/i.test(part)) return "MJ";
      if (/^jr\.?$/i.test(part)) return "Jr.";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function buildTopSingleEdgeBets({ markets, fairOddsResults, filters }) {
  const fairMap = new Map(
    fairOddsResults.map((result) => [`${result.marketId}::${result.selectionId}`, result])
  );

  const selectedTargetBook = String(filters?.selectedTargetBook || "ALL")
    .trim()
    .toLowerCase();

  const bets = [];

  for (const market of markets) {
    for (const selection of market.selections) {
      const fair = fairMap.get(`${market.id}::${selection.id}`);
      if (!fair) continue;

      const targetQuotes = selection.quotes.filter((q) => {
        const quoteBook = String(q.sportsbook || "").trim().toLowerCase();

        return (
          q.isTargetBook === true &&
          Number.isFinite(q.oddsDecimal) &&
          q.oddsDecimal > 1 &&
          (selectedTargetBook === "all" || quoteBook === selectedTargetBook)
        );
      });

      const sharpQuotes = selection.quotes.filter(
        (q) =>
          q.isSharpSource === true &&
          Number.isFinite(q.oddsDecimal) &&
          q.oddsDecimal > 1
      );

      if (!targetQuotes.length || !sharpQuotes.length) continue;

      const bestTargetQuote = [...targetQuotes].sort(
        (a, b) => b.oddsDecimal - a.oddsDecimal
      )[0];

      const bestSharpQuote = [...sharpQuotes].sort((a, b) => {
        const priority = (quote) => {
          const book = String(quote.sportsbook || "").trim().toLowerCase();
          if (book === "pinnacle") return 1;
          if (book === "fanduel") return 2;
          return 3;
        };

        const priorityDiff = priority(a) - priority(b);
        if (priorityDiff !== 0) return priorityDiff;

        return b.oddsDecimal - a.oddsDecimal;
      })[0];

      const fairProbability = fair.fairProbability;
      const evPct =
        fairProbability * (bestTargetQuote.oddsDecimal - 1) -
        (1 - fairProbability);

      if (!(evPct > 0)) continue;

      const edgePct =
        bestTargetQuote.oddsDecimal / bestSharpQuote.oddsDecimal - 1;

      bets.push({
        marketId: market.id,
        selectionId: selection.id,
        eventName: market.displayName,
        sport: market.sport || "",
        marketType: market.marketType,
        subjectName: extractSubjectNameFromMarket(market),
        lineValue: market.lineValue,
        selectionLabel: selection.label,
        targetSportsbook: bestTargetQuote.sportsbook,
        targetOddsAmerican: bestTargetQuote.oddsAmerican,
        sharpSportsbook: bestSharpQuote.sportsbook,
        sharpOddsAmerican: bestSharpQuote.oddsAmerican,
        fairProbability: fair.fairProbability,
        fairAmerican: fair.fairAmerican,
        edgePct,
        evPct,
        suggestedKellyStake: calculateSingleKellyStake({
          bankroll: filters?.bankroll,
          kellyFraction: filters?.kellyFraction,
          fairProbability: fair.fairProbability,
          oddsDecimal: bestTargetQuote.oddsDecimal,
        }),
      });
    }
  }

  return bets.sort((a, b) => b.evPct - a.evPct).slice(0, 12);
}

function buildCoverageWarnings(rows = []) {
  const warnings = [];
  const grouped = new Map();

  for (const row of rows || []) {
    if (!row || row.excluded) continue;

    const book = String(row.sportsbook || "Unknown").trim();
    const sport = String(row.sport || "UNKNOWN").trim().toUpperCase();
    const eventName = String(row.eventLabelRaw || "").trim();
    const canonicalEvent = [
      row.awayTeam || row.awayTeamRaw || "",
      row.homeTeam || row.homeTeamRaw || "",
    ]
      .filter(Boolean)
      .join(" @ ");

    const eventKey = canonicalEvent || eventName;
    if (!book || !sport || !eventKey) continue;

    const key = [book, sport, eventKey].join("||");

    if (!grouped.has(key)) {
      grouped.set(key, {
        book,
        sport,
        eventName: eventKey,
        markets: new Set(),
        rows: 0,
      });
    }

    const group = grouped.get(key);
    group.rows += 1;
    group.markets.add(normalizeMarketType(row.marketType));
  }

  for (const group of grouped.values()) {
    const marketSet = group.markets;

    if (group.sport === "NBA") {
      const hasAnyPlayerProp = [
        "player_points",
        "player_rebounds",
        "player_assists",
        "player_threes",
        "player_pra",
        "player_points_rebounds",
        "player_points_assists",
        "player_rebounds_assists",
        "double_double",
        "triple_double",
      ].some((market) => marketSet.has(market));

      if (!hasAnyPlayerProp) continue;

      const expected = [
        ["player_points", "Points"],
        ["player_rebounds", "Rebounds"],
        ["player_assists", "Assists"],
        ["player_threes", "3-Pointers"],
      ];

      for (const [marketType, label] of expected) {
        if (!marketSet.has(marketType)) {
          warnings.push({
            id: `${group.book}_${group.sport}_${group.eventName}_${marketType}`,
            book: group.book,
            sport: group.sport,
            eventName: group.eventName,
            message: `Warning: Missing ${label} for ${group.eventName} on ${group.book}.`,
          });
        }
      }
    }

    if (group.sport === "NHL") {
      const hasAnyPlayerProp = [
        "player_shots_on_goal",
        "player_points",
        "player_assists",
        "player_goals",
        "player_saves",
        "player_power_play_points",
      ].some((market) => marketSet.has(market));

      if (!hasAnyPlayerProp) continue;

      const expected = [
        ["player_shots_on_goal", "Shots on Goal"],
        ["player_points", "Points"],
        ["player_assists", "Assists"],
      ];

      for (const [marketType, label] of expected) {
        if (!marketSet.has(marketType)) {
          warnings.push({
            id: `${group.book}_${group.sport}_${group.eventName}_${marketType}`,
            book: group.book,
            sport: group.sport,
            eventName: group.eventName,
            message: `Warning: Missing ${label} for ${group.eventName} on ${group.book}.`,
          });
        }
      }
    }
  }

  return warnings.slice(0, 40);
}

function CoverageWarningsPanel({ warnings = [] }) {
  if (!warnings.length) return null;

  return (
    <section
      style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 12,
        border: "2px solid #f59e0b",
        background: "#fffbeb",
      }}
    >
      <div style={{ fontWeight: 900, color: "#92400e", marginBottom: 6 }}>
        Coverage Warnings
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {warnings.map((warning) => (
          <div
            key={warning.id}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#78350f",
              background: "#fef3c7",
              border: "1px solid #fbbf24",
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            {warning.message}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function EVParlayLabPage() {
  const [rawText, setRawText] = useState(SAMPLE_RAW_TEXT);
  const [sportsbook, setSportsbook] = useState("DraftKings");
  const [batchRole, setBatchRole] = useState("target");
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(() => withDefaultFilters(SAMPLE_FILTERS));
  const [manualMatches, setManualMatches] = useState([]);
  const [lastParsedAt, setLastParsedAt] = useState(null);
  const [showParsedTable, setShowParsedTable] = useState(false);
  const [showManualMatchPanel, setShowManualMatchPanel] = useState(false);
  const [pendingUrlImport, setPendingUrlImport] = useState(null);
  const [pendingImports, setPendingImports] = useState([]);
  const [savedPlacedParlays, setSavedPlacedParlays] = useState([]);
  const [boostWallet, setBoostWallet] = useState([]);
  const [blockedParlayLegs, setBlockedParlayLegs] = useState([]);
  const [activeBoostId, setActiveBoostId] = useState("");
  const [importMode, setImportMode] = useState("append");
  const [fanDuelSharpMode, setFanDuelSharpMode] = useState(false);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
    function resolveImportBatchRole(sourceName) {
    const normalizedSource = String(sourceName || "").trim().toLowerCase();

    if (normalizedSource === "pinnacle") return "fair_odds";

    if (normalizedSource === "fanduel") {
      return fanDuelSharpMode ? "fair_odds" : "target";
    }

    return "target";
  }
  function refreshPendingImports() {
    setPendingImports(readImportQueue());
  }

  function handleLoadNewestImport({ append = false } = {}) {
    const queue = readImportQueue();
    if (!queue.length) {
      alert("No pending imports found.");
      return;
    }

    const newest = queue[queue.length - 1];
    const incomingText = String(newest?.text || "");

    if (!incomingText.trim()) {
      alert("Newest import is empty.");
      return;
    }

    setRawText((prev) => {
      if (!append || !String(prev || "").trim()) return incomingText;
      return `${String(prev).trim()}\n\n${incomingText}`;
    });

    if (newest?.source) {
      const sourceName = String(newest.source);
      setSportsbook(sourceName);
      setBatchRole(resolveImportBatchRole(sourceName));
    }

    refreshPendingImports();
  }

  function handleClearPendingImports() {
    writeImportQueue([]);
    setPendingImports([]);
  }

  function handleClearSavedSession() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(SAVED_SESSION_KEY);
      localStorage.removeItem(IMPORT_QUEUE_KEY);
    }

    setRows([]);
    setManualMatches([]);
    setLastParsedAt(null);
    setPendingUrlImport(null);
    setPendingImports([]);
    setRawText("");
    setShowParsedTable(false);
    setShowManualMatchPanel(false);
    setFanDuelSharpMode(false);
  }

   function handleParse() {
  const inputText = typeof rawText === "string" ? rawText : "";

  console.log("RAW TEXT AT PARSE", {
    length: inputText.length,
    preview: inputText.slice(0, 300),
  });

  if (!inputText.trim()) {
    alert("Input is empty.");
    return;
  }

  const parsed = parseOddsText(inputText, {
    sportsbook,
    sourceType: "pasted_text",
  });

  console.log("HANDLE PARSE PARSED", parsed);
  console.log("HANDLE PARSE RESULT", {
    sportsbook,
    batchRole,
    parsedCount: parsed.length,
  });

  const withBatchRole = applyBatchRoleToRows(parsed, {
    sportsbook,
    batchRole,
  });

  const parsedAt = Date.now();
  const parsedAtIso = new Date(parsedAt).toISOString();

  const normalized = (normalizeParsedRows(withBatchRole) || []).map((row, index) => ({
    ...row,
    loadedAt: row.loadedAt || parsedAtIso,
    parsedAt: row.parsedAt || parsedAtIso,
    id: makeParsedRowId(row, parsedAt, index),
  }));

console.log("HANDLE PARSE NORMALIZED", normalized);

  setRows((prev) => {
    const baseRows = (prev || []).filter(
      (existingRow) => !shouldRemoveExistingRowForImportMode(existingRow, normalized, importMode)
    );

    const existingKeys = new Set(baseRows.map((row) => makeRowMergeKey(row)));

    const additions = normalized.filter((row) => {
      const key = makeRowMergeKey(row);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });

    return normalizeParsedRows([...baseRows, ...additions]) || [...baseRows, ...additions];
  });

  setLastParsedAt(parsedAtIso);
  alert(`Parsed rows: ${normalized.length}`);
}

  function applyBatchRoleToRows(parsedRows, { sportsbook, batchRole }) {
    return (parsedRows || []).map((row) => {
      const resolvedRole =
        batchRole ||
        (String(sportsbook || "").trim().toLowerCase() === "pinnacle"
          ? "fair_odds"
          : "target");

      if (resolvedRole === "fair_odds") {
        return {
          ...row,
          batchRole: "fair_odds",
          isSharpSource: true,
          isTargetBook: false,
        };
      }

      return {
        ...row,
        batchRole: "target",
        isSharpSource: false,
        isTargetBook: true,
      };
    });
  }

    function makeParsedRowId(row, parsedAt, index) {
      return [
        row.sportsbook || "book",
        row.batchRole || "role",
        row.sport || "sport",
        row.eventLabelRaw || "event",
        row.marketType || "market",
        row.selectionNormalized || row.selectionRaw || "selection",
        row.lineValue ?? "line",
        row.oddsAmerican ?? "odds",
        parsedAt,
        index,
      ]
        .map((part) =>
          String(part)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
        )
        .join("__");
    }

function shouldRemoveExistingRowForImportMode(existingRow, incomingRows, mode) {
    if (!existingRow || !Array.isArray(incomingRows) || !incomingRows.length) return false;
    if (mode === "append") return false;

    const existingBook = String(existingRow.sportsbook || existingRow.bookmaker || "").trim().toLowerCase();
    const existingSport = String(existingRow.sport || "").trim().toUpperCase();
    const existingEvent = normalizeCoverageEventName(
      existingRow.eventLabelRaw || existingRow.eventName || existingRow.fixture || ""
    ).toLowerCase();

    return incomingRows.some((incoming) => {
      const incomingBook = String(incoming.sportsbook || incoming.bookmaker || "").trim().toLowerCase();
      const incomingSport = String(incoming.sport || "").trim().toUpperCase();
      const incomingEvent = normalizeCoverageEventName(
        incoming.eventLabelRaw || incoming.eventName || incoming.fixture || ""
      ).toLowerCase();

      if (mode === "replace_book") {
        return incomingBook && existingBook === incomingBook;
      }

      if (mode === "replace_book_event") {
        return (
          incomingBook &&
          incomingSport &&
          incomingEvent &&
          existingBook === incomingBook &&
          existingSport === incomingSport &&
          existingEvent === incomingEvent
        );
      }

      return false;
    });
  }

  function makeRowMergeKey(row) {
    return [
      String(row.batchRole || "").trim().toLowerCase(),
      String(row.sportsbook || "").trim().toLowerCase(),
      String(row.sport || "").trim().toLowerCase(),
      String(row.eventLabelRaw || "").trim().toLowerCase(),
      String(row.marketType || "").trim().toLowerCase(),
      String(row.selectionNormalized || "").trim().toLowerCase(),
      row.lineValue ?? "",
      row.oddsAmerican ?? "",
    ].join("::");
  }

  function handleClearInput() {
    setRawText("");
  }

  function handleClearParsedRows() {
    setRows([]);
    setManualMatches([]);
    setLastParsedAt(null);
    setShowParsedTable(false);
    setShowManualMatchPanel(false);
  }

function handleSavePlacedParlay(parlay, options = {}) {
    if (!parlay || !Array.isArray(parlay.legs) || parlay.legs.length === 0) {
      alert("No parlay legs found to save.");
      return;
    }

    const selectedBoost = options.boostId
      ? pruneExpiredBoosts(boostWallet).find((boost) => boost.id === options.boostId)
      : null;

    const record = makePlacedParlayRecord(parlay, {
      selectedBoost,
      placedStake: options.placedStake,
      placedOddsAmerican: options.placedOddsAmerican,
    });

    setSavedPlacedParlays((prev) => {
      const next = [record, ...(prev || [])].slice(0, 1000);
      writeSavedPlacedParlays(next);
      return next;
    });

    if (selectedBoost?.id) {
      setBoostWallet((prev) => {
        const next = (prev || []).map((boost) =>
          boost.id === selectedBoost.id
            ? {
                ...boost,
                status: "used",
                usedAt: record.savedAt,
                usedParlayId: record.id,
              }
            : boost
        );

        writeBoostWallet(next);
        return next;
      });
    }
  }

  function handleBlockParlayLeg(leg) {
    if (!leg) return;

    const record = makeBlockedLegRecordFromLeg(leg);

    setBlockedParlayLegs((prev) => {
      const existingKeys = new Set(
        (prev || []).flatMap((blocked) => [
          blocked.savedLegKey,
          blocked.savedLegFamilyKey,
          blocked.savedLegRepeatKey,
          blocked.savedLegDisplayKey,
          blocked.savedLegDisplayRepeatKey,
        ])
      );

      if (
        existingKeys.has(record.savedLegKey) ||
        existingKeys.has(record.savedLegFamilyKey) ||
        existingKeys.has(record.savedLegRepeatKey) ||
        existingKeys.has(record.savedLegDisplayKey) ||
        existingKeys.has(record.savedLegDisplayRepeatKey)
      ) {
        return prev || [];
      }

      const next = [record, ...(prev || [])].slice(0, 500);
      writeBlockedParlayLegs(next);
      return next;
    });
  }

  function handleUnblockParlayLeg(blockedLegId) {
    setBlockedParlayLegs((prev) => {
      const next = (prev || []).filter((blocked) => blocked.id !== blockedLegId);
      writeBlockedParlayLegs(next);
      return next;
    });
  }


  function handleLoadBoostIntoFilters(boost) {
    if (!boost) return;

    const nextSport = String(boost.league || "ALL").trim().toUpperCase();
    const nextBook = String(boost.sportsbook || "ALL").trim();

    setActiveBoostId(boost.id || "");

    // This directly updates the live filters. Parlay results recalculate immediately;
    // you do not need to click Apply Filters after loading a saved boost.
    setFilters((prev) => ({
      ...prev,
      selectedSport: nextSport || "ALL",
      selectedTargetBook: nextBook || "ALL",
      boostPct: Number.isFinite(Number(boost.boostPct))
        ? Number(boost.boostPct)
        : prev.boostPct,
      maxLegs: Number.isFinite(Number(boost.minLegs))
        ? Number(boost.minLegs)
        : prev.maxLegs,
      minTotalAmericanOdds:
        boost.minTotalAmericanOdds !== null &&
        boost.minTotalAmericanOdds !== undefined &&
        Number.isFinite(Number(boost.minTotalAmericanOdds))
          ? Number(boost.minTotalAmericanOdds)
          : prev.minTotalAmericanOdds,
      stake: Number.isFinite(Number(boost.maxStake))
        ? Number(boost.maxStake)
        : prev.stake,
      forceSameGame: boost.isSgp === true,
      allowSameGame: boost.isSgp === true ? true : prev.allowSameGame,
    }));
  }

  function handleAddBoost(boost) {
    setBoostWallet((prev) => {
      const next = [boost, ...(prev || [])].slice(0, 200);
      writeBoostWallet(next);
      return next;
    });
  }

  function handleUpdateBoost(boostId, patch = {}) {
    setBoostWallet((prev) => {
      const next = (prev || []).map((boost) =>
        boost.id === boostId ? { ...boost, ...patch } : boost
      );

      writeBoostWallet(next);
      return next;
    });
  }

  function handleDeleteBoost(boostId) {
    const ok = window.confirm("Delete this saved boost?");
    if (!ok) return;

    setBoostWallet((prev) => {
      const next = (prev || []).filter((boost) => boost.id !== boostId);
      writeBoostWallet(next);
      return next;
    });
  }

 function handleUpdateSavedPlacedParlay(parlayId, patch = {}) {
    setSavedPlacedParlays((prev) => {
      const next = (prev || []).map((parlay) => {
        if (parlay.id !== parlayId) return parlay;

        const updated = {
          ...parlay,
          ...patch,
        };

        if (
          Object.prototype.hasOwnProperty.call(patch, "placedStake") ||
          Object.prototype.hasOwnProperty.call(patch, "placedOddsAmerican") ||
          Object.prototype.hasOwnProperty.call(patch, "status")
        ) {
          updated.profitLoss = calculateSavedParlayProfitLoss(updated);
        }

        return updated;
      });

      writeSavedPlacedParlays(next);
      return next;
    });
  }

  function handleConfirmSavedParlayPlaced(parlayId) {
    const now = new Date().toISOString();

    setSavedPlacedParlays((prev) => {
      const next = (prev || []).map((parlay) => {
        if (parlay.id !== parlayId) return parlay;

        return {
          ...parlay,
          status: "placed",
          confirmedPlaced: true,
          placedAt: parlay.placedAt || now,
          placedDate: parlay.placedDate || now.slice(0, 10),
          profitLoss: 0,
        };
      });

      writeSavedPlacedParlays(next);
      return next;
    });
  }

  function handleSetSavedParlayResult(parlayId, status) {
    const resolvedStatus = String(status || "").toLowerCase();
    const now = new Date().toISOString();

    setSavedPlacedParlays((prev) => {
      const next = (prev || []).map((parlay) => {
        if (parlay.id !== parlayId) return parlay;

        const updated = {
          ...parlay,
          status: resolvedStatus,
          result: resolvedStatus,
          confirmedPlaced: true,
          placedAt: parlay.placedAt || now,
          placedDate: parlay.placedDate || now.slice(0, 10),
          settledAt: ["won", "lost", "push", "void"].includes(resolvedStatus) ? now : parlay.settledAt || "",
        };

        updated.profitLoss = calculateSavedParlayProfitLoss(updated, resolvedStatus);

        return updated;
      });

      writeSavedPlacedParlays(next);
      return next;
    });
  }

  function handleAddManualPlacedParlay(draft = {}) {
    const record = makeManualPlacedParlayRecord(draft);

    if (!record.legs.length) {
      alert("Add at least one manual leg. Use one line per leg.");
      return;
    }

    if (!Number.isFinite(Number(record.placedStake)) || Number(record.placedStake) <= 0) {
      alert("Enter a valid stake before adding the manual parlay.");
      return;
    }

    if (!Number.isFinite(Number(record.placedOddsAmerican)) || Number(record.placedOddsAmerican) === 0) {
      alert("Enter valid American odds for the manual parlay.");
      return;
    }

    setSavedPlacedParlays((prev) => {
      const next = [record, ...(prev || [])].slice(0, 1000);
      writeSavedPlacedParlays(next);
      return next;
    });
  }


  function handleClearSavedPlacedParlays() {
    const answer = window.prompt(
      "Archive all saved/placed parlays? This hides them by default but does not permanently delete them. Type ARCHIVE to confirm."
    );

    if (answer !== "ARCHIVE") return;

    const archivedAt = new Date().toISOString();

    setSavedPlacedParlays((prev) => {
      const next = (prev || []).map((parlay) => {
        if (parlay.archivedAt || String(parlay.status || "").toLowerCase() === "archived") {
          return parlay;
        }

        return {
          ...parlay,
          statusBeforeArchive: parlay.status || "saved",
          status: "archived",
          archivedAt,
        };
      });

      writeSavedPlacedParlays(next);
      return next;
    });
  }

  function handleDeleteSavedPlacedParlay(parlayId) {
    const ok = window.confirm("Archive this saved/placed parlay? It will be hidden by default but not deleted.");
    if (!ok) return;

    const archivedAt = new Date().toISOString();

    setSavedPlacedParlays((prev) => {
      const next = (prev || []).map((parlay) => {
        if (parlay.id !== parlayId) return parlay;

        return {
          ...parlay,
          statusBeforeArchive: parlay.status || "saved",
          status: "archived",
          archivedAt,
        };
      });

      writeSavedPlacedParlays(next);
      return next;
    });
  }
  function handleUpdateRow(rowId, patch) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const next = { ...row, ...patch, userEdited: true };

        if (Object.prototype.hasOwnProperty.call(patch || {}, "oddsAmerican")) {
          const decimal = americanToDecimal(patch.oddsAmerican);

          next.oddsDecimal = Number.isFinite(decimal) ? decimal : null;
          next.editedAt = new Date().toISOString();
          next.isStale = false;
          next.stale = false;
          next.parseWarnings = Array.isArray(next.parseWarnings)
            ? next.parseWarnings.filter((warning) => !/stale|odds/i.test(String(warning || "")))
            : next.parseWarnings;
        }

        return next;
      })
    );
  }

  function handleUpdateParsedRowOdds(rowId, oddsValue) {
    const parsedOdds = parseEditedAmericanOdds(oddsValue);

    if (!rowId) {
      alert("I cannot find the parsed row for this leg. Try editing it in Parsed Odds Review.");
      return;
    }

    if (!Number.isFinite(parsedOdds) || parsedOdds === 0) {
      alert("Enter valid American odds like -110 or +145.");
      return;
    }

    handleUpdateRow(rowId, { oddsAmerican: parsedOdds });
  }


  function handleDeleteRow(rowId) {
    setRows((prev) => prev.filter((row) => row.id !== rowId));

    setManualMatches((prev) =>
      prev.filter(
        (match) => match.sourceRowId !== rowId && match.targetRowId !== rowId
      )
    );
  }

  function handleDeleteRows(rowIds = []) {
    const ids = new Set(rowIds);

    setRows((prev) => prev.filter((row) => !ids.has(row.id)));

    setManualMatches((prev) =>
      prev.filter(
        (match) => !ids.has(match.sourceRowId) && !ids.has(match.targetRowId)
      )
    );
  }

    function normalizeCoverageEventName(value) {
    const text = String(value || "").trim().replace(/\s+/g, " ");

    if (!text.includes("@")) return normalizeCoverageTeamName(text);

    const parts = text.split(/\s+@\s+/).map((part) => String(part || "").trim()).filter(Boolean);

    if (parts.length !== 2) return text;

    return `${normalizeCoverageTeamName(parts[0])} @ ${normalizeCoverageTeamName(parts[1])}`;
  }

  function normalizeCoverageTeamName(value) {
    const text = String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s+Odds$/i, "");

    const lower = text.toLowerCase();

    const aliases = new Map([
      ["atl hawks", "Atlanta Hawks"],
      ["atlanta hawks", "Atlanta Hawks"],
      ["bos celtics", "Boston Celtics"],
      ["boston celtics", "Boston Celtics"],
      ["cle cavaliers", "Cleveland Cavaliers"],
      ["cleveland cavaliers", "Cleveland Cavaliers"],
      ["den nuggets", "Denver Nuggets"],
      ["denver nuggets", "Denver Nuggets"],
      ["det pistons", "Detroit Pistons"],
      ["detroit pistons", "Detroit Pistons"],
      ["hou rockets", "Houston Rockets"],
      ["houston rockets", "Houston Rockets"],
      ["la lakers", "Los Angeles Lakers"],
      ["lal lakers", "Los Angeles Lakers"],
      ["los angeles lakers", "Los Angeles Lakers"],
      ["min timberwolves", "Minnesota Timberwolves"],
      ["minnesota timberwolves", "Minnesota Timberwolves"],
      ["ny knicks", "New York Knicks"],
      ["nyk knicks", "New York Knicks"],
      ["new york knicks", "New York Knicks"],
      ["orl magic", "Orlando Magic"],
      ["orlando magic", "Orlando Magic"],
      ["phi 76ers", "Philadelphia 76ers"],
      ["philadelphia 76ers", "Philadelphia 76ers"],
      ["tor raptors", "Toronto Raptors"],
      ["toronto raptors", "Toronto Raptors"],
    ]);

    return aliases.get(lower) || text;
  }

 function handleDeleteStaleRows(staleMinutes = 15) {
    const cutoff = Date.now() - Number(staleMinutes || 15) * 60 * 1000;

    const idsToDelete = (rows || [])
      .filter((row) => {
        const loadedAt =
          row.loadedAt ||
          row.parsedAt ||
          row.importedAt ||
          row.createdAt ||
          row.savedAt ||
          "";

        if (!loadedAt) return false;

        const time = new Date(loadedAt).getTime();
        if (!Number.isFinite(time)) return false;

        return time < cutoff;
      })
      .map((row) => row.id)
      .filter(Boolean);

    if (!idsToDelete.length) {
      alert("No stale rows found.");
      return;
    }

    const ok = window.confirm(`Delete ${idsToDelete.length} stale rows older than ${staleMinutes} minutes?`);
    if (!ok) return;

    handleDeleteRows(idsToDelete);
  }

  function handleDeleteCoverageRows({ bookmaker, sport, eventName } = {}) {
    const normalizedBook = String(bookmaker || "").trim().toLowerCase();
    const normalizedSport = String(sport || "").trim().toUpperCase();
    const normalizedEvent = normalizeCoverageEventName(eventName).toLowerCase();

    const idsToDelete = rows
      .filter((row) => {
        const rowBook = String(row.sportsbook || row.bookmaker || "Unknown Book")
          .trim()
          .toLowerCase();

        const rowSport = String(row.sport || row.league || "UNKNOWN")
          .trim()
          .toUpperCase();

        const rowEvent = normalizeCoverageEventName(
          row.eventLabelRaw || row.eventName || row.fixture || "Unknown Event"
        ).toLowerCase();

        if (normalizedBook && rowBook !== normalizedBook) return false;
        if (normalizedSport && rowSport !== normalizedSport) return false;
        if (normalizedEvent && rowEvent !== normalizedEvent) return false;

        return true;
      })
      .map((row) => row.id)
      .filter(Boolean);

    if (!idsToDelete.length) {
      alert("No matching rows found to delete.");
      return;
    }

    handleDeleteRows(idsToDelete);
  }

    const rowsWithManualMatches = useMemo(
  () => applyManualMatchOverrides(rows, manualMatches),
  [rows, manualMatches]
);

  const rowsForAnalysis = useMemo(() => {
  const selectedSport = String(filters?.selectedSport || "ALL").trim().toUpperCase();
  const enforceNoLiveGames = filters?.enforceNoLiveGames !== false;

  return (rowsWithManualMatches || []).filter((row) => {
    const sport = String(row.sport || "").trim().toUpperCase();

    if (selectedSport !== "ALL" && sport !== selectedSport) {
      return false;
    }

    if (enforceNoLiveGames && isLikelyLiveRow(row)) {
      return false;
    }

    return true;
  });
}, [rowsWithManualMatches, filters]);

const manualMatchCandidates = useMemo(() => {
  if (!showManualMatchPanel) return [];
  if (!Array.isArray(rows) || !rows.length) return [];

  return buildManualMatchCandidates(rows, manualMatches);
}, [showManualMatchPanel, rows, manualMatches]);

const savedLegUsageMap = useMemo(
  () => buildSavedLegUsageMap(savedPlacedParlays, blockedParlayLegs),
  [savedPlacedParlays, blockedParlayLegs]
);

const visibleBoostWallet = useMemo(
  () => pruneExpiredBoosts(boostWallet),
  [boostWallet]
);

const activeBoost = useMemo(
  () => (visibleBoostWallet || []).find((boost) => boost.id === activeBoostId) || null,
  [visibleBoostWallet, activeBoostId]
);

const marketBundle = useMemo(() => {
  if (!rowsForAnalysis.length) {
    return { markets: [], unmatchedRows: [] };
  }

  return buildCanonicalMarkets(rowsForAnalysis);
}, [rowsForAnalysis]);

  const fairOddsBundle = useMemo(() => {
    if (!marketBundle.markets.length) return [];
    return calculateFairOddsForMarkets(marketBundle.markets, {
      method: filters?.devigMethod || "power",
    });
    }, [marketBundle.markets, filters?.devigMethod]);

  const topSingleEdgeBets = useMemo(() => {
    if (!marketBundle.markets.length || !fairOddsBundle.length) return [];

    return buildTopSingleEdgeBets({
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
      filters,
    });
  }, [marketBundle.markets, fairOddsBundle, filters]);

  const parlayEngineOutput = useMemo(() => {
    if (!rowsForAnalysis.length || !marketBundle.markets.length || !fairOddsBundle.length) {
      return {
        parlays: [],
        counts: {
          eligibleLegs: 0,
          eligibleMarkets: 0,
          generatedCombos: 0,
          rejections: {
            noFairOdds: 0,
            noTargetQuote: 0,
            belowLegThreshold: 0,
            sameSportBlocked: 0,
            sameGameBlocked: 0,
            repeatsBlocked: 0,
            manualBlocked: 0,
            nonPositiveParlayEv: 0,
          },
        },
      };
    }

    return buildParlayCandidates({
      rows: rowsForAnalysis,
      markets: marketBundle.markets,
      fairOddsResults: fairOddsBundle,
      filters,
      savedLegUsageMap,
    });
  }, [rowsForAnalysis, marketBundle.markets, fairOddsBundle, filters, savedLegUsageMap]);

  const coverageWarnings = useMemo(
    () => buildCoverageWarnings(rowsForAnalysis),
    [rowsForAnalysis]
  );



  useEffect(() => {
    refreshPendingImports();

    if (typeof window === "undefined") {
      setHasRestoredSession(true);
      return;
    }

        // Saved boosts live outside the 2-hour session restore.
    // Always reload them from persistent localStorage and prune expired boosts.
    setBoostWallet(readBoostWallet());
    setBlockedParlayLegs(readBlockedParlayLegs());


    const params = new URLSearchParams(window.location.search);
    const safeReset = params.get("evSafe") === "1" || params.get("evReset") === "1";

    if (safeReset) {
      localStorage.removeItem(SAVED_SESSION_KEY);
      localStorage.removeItem(IMPORT_QUEUE_KEY);
      sessionStorage.clear();

      setRawText("");
      setRows([]);
      setManualMatches([]);
      setLastParsedAt(null);
      setPendingUrlImport(null);
      setPendingImports([]);
      setSavedPlacedParlays(readSavedPlacedParlays());
      setBoostWallet(readBoostWallet());
      setBlockedParlayLegs(readBlockedParlayLegs());


      params.delete("evSafe");
      params.delete("evReset");

      const newUrl =
        window.location.pathname + (params.toString() ? `?${params.toString()}` : "");

      window.history.replaceState({}, "", newUrl);
      setHasRestoredSession(true);
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_SESSION_KEY) || "null");

      if (!saved || typeof saved !== "object") {
        setHasRestoredSession(true);
        return;
      }

      const savedAt = Number(saved.savedAt || 0);
      if (savedAt && Date.now() - savedAt > SAVED_SESSION_TTL_MS) {
        localStorage.removeItem(SAVED_SESSION_KEY);
        setHasRestoredSession(true);
        return;
      }

      if (typeof saved.rawText === "string") setRawText(saved.rawText);
      if (typeof saved.sportsbook === "string") setSportsbook(saved.sportsbook);
      if (typeof saved.batchRole === "string") setBatchRole(saved.batchRole);
      if (typeof saved.fanDuelSharpMode === "boolean") {
        setFanDuelSharpMode(saved.fanDuelSharpMode);
      }
      if (Array.isArray(saved.rows)) setRows(saved.rows);
      if (saved.filters && typeof saved.filters === "object") setFilters(withDefaultFilters(saved.filters));
      if (Array.isArray(saved.manualMatches)) setManualMatches(saved.manualMatches);
      setSavedPlacedParlays(readSavedPlacedParlays());
      if (typeof saved.lastParsedAt === "string" || saved.lastParsedAt === null) {
        setLastParsedAt(saved.lastParsedAt);
      }
    } catch (err) {
      console.warn("Failed to restore EV Parlay Lab session", err);
    } finally {
      setHasRestoredSession(true);
    }
  }, []);

    useEffect(() => {
    if (typeof window === "undefined") return;

    function processQueuedImports() {
      const queue = readImportQueue();
      if (!queue.length) {
        refreshPendingImports();
        return;
      }

      const newest = queue[queue.length - 1];
      const incomingText = String(newest?.text || "");

      if (!incomingText.trim()) {
        refreshPendingImports();
        return;
      }

      setPendingUrlImport(incomingText);
      setRawText(incomingText);

      if (newest?.source) {
        const sourceName = String(newest.source);
        setSportsbook(sourceName);
        setBatchRole(resolveImportBatchRole(sourceName));
      }

      writeImportQueue([]);
      setPendingImports([]);
      setSavedPlacedParlays(readSavedPlacedParlays());
      window.__evParlayAutoParsePending = true;
    }

    processQueuedImports();

    window.addEventListener("ev-parlay-import-queued", processQueuedImports);

    return () => {
      window.removeEventListener("ev-parlay-import-queued", processQueuedImports);
    };
  }, [fanDuelSharpMode]);

    useEffect(() => {
    const normalizedSportsbook = String(sportsbook || "").trim().toLowerCase();

    if (normalizedSportsbook === "fanduel") {
      setBatchRole(fanDuelSharpMode ? "fair_odds" : "target");
    }

    if (normalizedSportsbook === "pinnacle") {
      setBatchRole("fair_odds");
    }
  }, [sportsbook, fanDuelSharpMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasRestoredSession) return;

    const safeRows = (rows || []).map((row) => {
      const {
        _allRowsInEvent,
        ...rest
      } = row || {};

      return rest;
    });

        const payload = {
      rawText,
      sportsbook,
      batchRole,
      fanDuelSharpMode,
      rows: safeRows,
      filters,
      manualMatches,
      lastParsedAt,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to save EV Parlay Lab session", err);
    }
  }, [hasRestoredSession, rawText, sportsbook, batchRole, fanDuelSharpMode, rows, filters, manualMatches, lastParsedAt]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function pruneBoostWalletNow() {
      setBoostWallet((prev) => {
        const next = pruneExpiredBoosts(prev || []);
        if (next.length !== (prev || []).length) {
          writeBoostWallet(next);
        }
        return next;
      });
    }

    pruneBoostWalletNow();

    const intervalId = window.setInterval(pruneBoostWalletNow, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const imported = params.get("import");
    const source = params.get("source");
    const mode = params.get("mode");
    const autoParse = params.get("autoparse");

    if (!imported) return;

    const decoded = imported;

    if (decoded && decoded.trim()) {
      setPendingUrlImport(decoded);

      setRawText((prev) => {
        if (mode === "append" && String(prev || "").trim()) {
          return `${String(prev).trim()}\n\n${decoded}`;
        }
        return decoded;
      });

      if (source && String(source).trim()) {
        const normalizedSource = String(source).trim();
        const resolvedSource = /^thescore$/i.test(normalizedSource)
          ? "TheScore"
          : normalizedSource;

        setSportsbook(resolvedSource);
        setBatchRole(resolveImportBatchRole(resolvedSource));
      }

      if (autoParse === "1") {
        window.__evParlayAutoParsePending = true;
      }
    }

    params.delete("import");
    params.delete("source");
    params.delete("mode");
    params.delete("autoparse");
    const newUrl =
      window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", newUrl);
  }, []);

    useEffect(() => {
      if (typeof window === "undefined") return;
      if (!window.__evParlayAutoParsePending) return;
      if (!rawText || !String(rawText).trim()) return;

      window.__evParlayAutoParsePending = false;
      handleParse();
    }, [rawText, sportsbook, batchRole]);

  const parlayCandidates = Array.isArray(parlayEngineOutput)
    ? parlayEngineOutput
    : parlayEngineOutput?.parlays || [];

  const parlayCounts = Array.isArray(parlayEngineOutput)
    ? { eligibleLegs: 0, eligibleMarkets: 0, generatedCombos: 0 }
    : parlayEngineOutput?.counts || {
        eligibleLegs: 0,
        eligibleMarkets: 0,
        generatedCombos: 0,
      };

  return (
    <div
      style={{
        padding: 20,
        color: "#111",
        background: "#f7f7f8",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div>
  <h1 style={{ marginTop: 0, marginBottom: 8 }}>EV Parlay Lab</h1>
  <p style={{ marginTop: 0, color: "#555", marginBottom: 0 }}>
    Import odds, review parsed rows, compare to sharp prices, and rank possible EV parlays.
  </p>
</div>

<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <Link
    href="/tools"
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 14px",
      borderRadius: 8,
      background: "#fff",
      color: "#166534",
      border: "1px solid #86efac",
      textDecoration: "none",
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
    Tools
  </Link>

  <Link
    href="/"
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 14px",
      borderRadius: 8,
      background: "#166534",
      color: "#f0fdf4",
      textDecoration: "none",
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}
  >
        {"<-"} Back to Bet Slip App
  </Link>
</div>
</div>

        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            background: fanDuelSharpMode ? "#eff6ff" : "#fff",
            border: fanDuelSharpMode ? "1px solid #93c5fd" : "1px solid #d1d5db",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontWeight: 800,
              color: fanDuelSharpMode ? "#1d4ed8" : "#374151",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={fanDuelSharpMode}
              onChange={(e) => {
                const checked = e.target.checked;
                setFanDuelSharpMode(checked);

                if (String(sportsbook || "").trim().toLowerCase() === "fanduel") {
                  setBatchRole(checked ? "fair_odds" : "target");
                }
              }}
            />
            FanDuel imports as sharp / fair odds source
          </label>

          <div style={{ marginTop: 6, fontSize: 12, color: "#666", fontWeight: 700 }}>
            OFF = FanDuel imports as a target book. ON = FanDuel imports as a sharp source.
            Set this before clicking the extension or loading a FanDuel import.
          </div>
        </div>

        <SessionReadinessPanel
          rows={rowsForAnalysis}
          filters={filters}
          activeBoost={activeBoost}
          coverageWarnings={coverageWarnings}
          onDeleteStaleRows={handleDeleteStaleRows}
        />

        <ImportPanel
          rawText={rawText}
          setRawText={setRawText}
          sportsbook={sportsbook}
          setSportsbook={setSportsbook}
          batchRole={batchRole}
          setBatchRole={setBatchRole}
          onParse={handleParse}
          onClearInput={handleClearInput}
          onClearParsedRows={handleClearParsedRows}
          hasRows={rows.length > 0}
          lastParsedAt={lastParsedAt}
          pendingImports={pendingImports}
          pendingUrlImport={pendingUrlImport}
          onLoadNewestImport={handleLoadNewestImport}
          onClearPendingImports={handleClearPendingImports}
          onClearSavedSession={handleClearSavedSession}
          importMode={importMode}
          setImportMode={setImportMode}
          defaultCollapsed
        />

        <ExtractionGuide sportsbook={sportsbook} defaultCollapsed />

        <LoadCoveragePanel
          rows={rows}
          onDeleteCoverageRows={handleDeleteCoverageRows}
        />

        <CoverageWarningsPanel warnings={coverageWarnings} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowParsedTable((prev) => !prev)}
            style={{
              background: "#166534",
              color: "#f0fdf4",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {showParsedTable ? "Hide Parsed Review" : "Show Parsed Review"}
          </button>

          <button
            type="button"
            onClick={() => setShowManualMatchPanel((prev) => !prev)}
            style={{
              background: "#fff",
              color: "#166534",
              border: "1px solid #86efac",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
              {showManualMatchPanel ? "Hide Advanced Match Review" : "Show Advanced Match Review"}
          </button>
        </div>

        {showParsedTable ? (
          <ParsedOddsTable
            rows={rows}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onDeleteRows={handleDeleteRows}
          />
        ) : null}

        {showManualMatchPanel ? (
          <ManualMatchPanel
            candidates={manualMatchCandidates}
            manualMatches={manualMatches}
            onApplyMatch={(match) => {
              setManualMatches((prev) => {
                const filtered = prev.filter((item) => item.sourceRowId !== match.sourceRowId);
                return [...filtered, match];
              });
            }}
            onRemoveMatch={(sourceRowId) => {
              setManualMatches((prev) => prev.filter((item) => item.sourceRowId !== sourceRowId));
            }}
          />
        ) : null}

        {/* <MarketMatchPanel
          markets={marketBundle.markets}
          unmatchedRows={marketBundle.unmatchedRows}
        /> */}

        <FairOddsPanel fairOddsResults={fairOddsBundle} />

        <TopEdgeBetsPanel bets={topSingleEdgeBets} />

        <BoostWalletPanel
          boosts={visibleBoostWallet}
          filters={filters}
          onAddBoost={handleAddBoost}
          onUpdateBoost={handleUpdateBoost}
          onDeleteBoost={handleDeleteBoost}
          onLoadBoostIntoFilters={handleLoadBoostIntoFilters}
        />

        <ParlayFilters filters={filters} setFilters={setFilters} />

        <ParlayResults
          parlays={parlayCandidates}
          counts={parlayCounts}
          savedPlacedParlays={savedPlacedParlays}
          savedLegUsageMap={savedLegUsageMap}
          onSavePlacedParlay={handleSavePlacedParlay}
          onAddManualPlacedParlay={handleAddManualPlacedParlay}
          onClearSavedParlays={handleClearSavedPlacedParlays}
          onDeleteSavedParlay={handleDeleteSavedPlacedParlay}
          onUpdateSavedParlay={handleUpdateSavedPlacedParlay}
          onConfirmSavedParlayPlaced={handleConfirmSavedParlayPlaced}
          onSetSavedParlayResult={handleSetSavedParlayResult}
          onUpdateParsedRowOdds={handleUpdateParsedRowOdds}
          formatSavedDateTime={formatSavedDateTime}
          boostWallet={visibleBoostWallet}
          blockedParlayLegs={blockedParlayLegs}
          onBlockParlayLeg={handleBlockParlayLeg}
          onUnblockParlayLeg={handleUnblockParlayLeg}
          selectedDevigMethod={filters?.devigMethod || "power"}
        />
      </div>
    </div>
  );
}
function applyManualMatchOverrides(rows, manualMatches) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!Array.isArray(manualMatches) || !manualMatches.length) return rows;

  const sourceById = new Map(rows.map((row) => [row.id, row]));
  const overrideByTargetRowId = new Map();

  for (const match of manualMatches) {
    const sourceRow = sourceById.get(match.sourceRowId);
    if (!sourceRow) continue;

    overrideByTargetRowId.set(match.targetRowId, {
      selectionRaw: sourceRow.selectionRaw,
      selectionNormalized: sourceRow.selectionNormalized,
      marketType: sourceRow.marketType,
      lineValue: sourceRow.lineValue,
      manualMatchSourceRowId: sourceRow.id,
      manualMatchSourceSelection: sourceRow.selectionNormalized,
      manualMatchApplied: true,
      parseWarnings: [
        ...(Array.isArray(sourceRow.parseWarnings) ? sourceRow.parseWarnings : []),
        `Manual match source: ${sourceRow.selectionNormalized}`,
      ],
    });
  }

  return rows.map((row) => {
    const override = overrideByTargetRowId.get(row.id);
    if (!override) return row;

    return {
      ...row,
      ...override,
    };
  });
}


function buildManualMatchCandidates(rows, manualMatches) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const matchedSourceIds = new Set((manualMatches || []).map((match) => match.sourceRowId));

  const rowsWithManualMatches = applyManualMatchOverrides(rows, manualMatches || []);

  const sharpRows = rowsWithManualMatches.filter((row) => row.isSharpSource === true);
  const targetRows = rowsWithManualMatches.filter((row) => row.isTargetBook === true);

  const candidates = [];

  for (const sourceRow of sharpRows) {
    if (matchedSourceIds.has(sourceRow.id)) continue;

    const sourceEventKey = normalizeManualMatchEventKey(sourceRow.eventLabelRaw);
    const sourceBaseKey = buildSelectionBaseKey(sourceRow);
    const sourceThresholdKey = buildSelectionThresholdKey(sourceRow);
    const sourceFamilyKey = buildSelectionFamilyKey(sourceRow);
    const sourceDirection = buildSelectionDirectionKey(sourceRow);

    if (!sourceEventKey || !sourceBaseKey) continue;

    const alreadyMatchedExact = targetRows.some((targetRow) => {
      if (normalizeManualMatchEventKey(targetRow.eventLabelRaw) !== sourceEventKey) return false;
      if (String(normalizeMarketType(targetRow.marketType) || "") !== String(normalizeMarketType(sourceRow.marketType) || "")) return false;
      if (buildSelectionFamilyKey(targetRow) !== sourceFamilyKey) return false;
      if (buildSelectionDirectionKey(targetRow) !== sourceDirection) return false;
      return buildSelectionThresholdKey(targetRow) === sourceThresholdKey;
    });

    if (alreadyMatchedExact) continue;

    const possibleTargets = targetRows.filter((targetRow) => {
      if (targetRow.id === sourceRow.id) return false;
      if (normalizeManualMatchEventKey(targetRow.eventLabelRaw) !== sourceEventKey) return false;
      if (String(normalizeMarketType(targetRow.marketType) || "") !== String(normalizeMarketType(sourceRow.marketType) || "")) return false;

      const targetBaseKey = buildSelectionBaseKey(targetRow);
      if (!targetBaseKey) return false;

      if (!hasMeaningfulBaseOverlap(sourceBaseKey, targetBaseKey)) return false;

      const targetFamilyKey = buildSelectionFamilyKey(targetRow);
      if (sourceFamilyKey && targetFamilyKey && sourceFamilyKey !== targetFamilyKey) return false;

      const targetDirection = buildSelectionDirectionKey(targetRow);
      if (sourceDirection && targetDirection && sourceDirection !== targetDirection) return false;

      const targetThresholdKey = buildSelectionThresholdKey(targetRow);

      return targetThresholdKey !== sourceThresholdKey;
    });

    if (!possibleTargets.length) continue;

    const groupedByBook = new Map();

    for (const row of possibleTargets) {
      const book = String(row.sportsbook || "Unknown");
      if (!groupedByBook.has(book)) {
        groupedByBook.set(book, []);
      }

      groupedByBook.get(book).push({
        rowId: row.id,
        selectionLabel: buildManualSelectionLabel(row),
        thresholdSortValue: buildThresholdSortValue(row),
        matchScore: computeMatchScore(sourceRow, row),
      });
    }

    const targetBooks = Array.from(groupedByBook.entries()).map(([sportsbook, options]) => ({
      sportsbook,
      options: options
        .sort((a, b) => {
          if (a.matchScore !== b.matchScore) {
            return a.matchScore - b.matchScore;
          }
          if (a.thresholdSortValue !== b.thresholdSortValue) {
            return a.thresholdSortValue - b.thresholdSortValue;
          }
          return a.selectionLabel.localeCompare(b.selectionLabel);
        })
        .map(({ rowId, selectionLabel }) => ({ rowId, selectionLabel })),
    }));

    candidates.push({
      sourceRowId: sourceRow.id,
      sourceSportsbook: sourceRow.sportsbook,
      sourceSelectionLabel: buildManualSelectionLabel(sourceRow),
      eventName: sourceRow.eventLabelRaw || "Unknown Event",
      marketType: sourceRow.marketType,
      targetBooks,
    });
  }

  return candidates.sort((a, b) => {
    if (a.eventName !== b.eventName) return a.eventName.localeCompare(b.eventName);
    if (a.marketType !== b.marketType) return a.marketType.localeCompare(b.marketType);
    return a.sourceSelectionLabel.localeCompare(b.sourceSelectionLabel);
  });
}

function normalizeManualMatchEventKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSelectionBaseKey(row) {
  const text = String(row.selectionNormalized || row.selectionRaw || "")
    .toLowerCase()
    .replace(/Ã¢Ë†â€™/g, "-")
    .replace(/\b(over|under)\b/g, " ")
    .replace(/\b\d+(\.\d+)?\+\b/g, " ")
    .replace(/[+-]?\d+(\.\d+)?/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function buildSelectionThresholdKey(row) {
  const label = String(row.selectionNormalized || row.selectionRaw || "").toLowerCase();

  const plusMatch = label.match(/(\d+(?:\.\d+)?)\+/);
  if (plusMatch) return `plus:${plusMatch[1]}`;

  const overUnderMatch = label.match(/\b(over|under)\s+(\d+(?:\.\d+)?)/);
  if (overUnderMatch) return `${overUnderMatch[1]}:${overUnderMatch[2]}`;

  if (Number.isFinite(row.lineValue)) {
    return `line:${row.lineValue}`;
  }

  return label.replace(/\s+/g, " ").trim();
}

function buildSelectionFamilyKey(row) {
  const marketType = normalizeMarketType(row.marketType);
  const selection = String(row.selectionNormalized || row.selectionRaw || "")
    .toLowerCase()
    .replace(/ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢/g, "-");

  if (marketType === "player_points") return "points";
  if (marketType === "player_assists") return "assists";
  if (marketType === "player_rebounds") return "rebounds";
  if (marketType === "player_threes") return "threes";
  if (marketType === "player_pra") return "pra";
  if (marketType === "player_points_rebounds") return "points_rebounds";
  if (marketType === "player_points_assists") return "points_assists";
  if (marketType === "player_rebounds_assists") return "rebounds_assists";
  if (marketType === "double_double") return "double_double";
  if (marketType === "triple_double") return "triple_double";
  if (marketType === "player_shots_on_goal") return "shots_on_goal";
  if (marketType === "player_saves") return "saves";
  if (marketType === "player_power_play_points") return "power_play_points";
  if (marketType === "goalie_goals_against") return "goals_against";
  if (marketType === "player_shutout") return "shutout";
  if (marketType === "anytime_goalscorer") return "anytime_goalscorer";

  if (/\bpts\s*\+\s*reb\s*\+\s*ast\b|\bpts & rebs & asts\b|\bpra\b/.test(selection)) {
    return "pra";
  }

  if (/\bpts\s*\+\s*reb\b/.test(selection)) return "points_rebounds";
  if (/\bpts\s*\+\s*ast\b/.test(selection)) return "points_assists";
  if (/\breb\s*\+\s*ast\b/.test(selection)) return "rebounds_assists";

  if (/\bdouble[\s-]?double\b/.test(selection)) return "double_double";
  if (/\btriple[\s-]?double\b/.test(selection)) return "triple_double";

  if (/\bshots on goal\b/.test(selection)) return "shots_on_goal";
  if (/\bsaves\b/.test(selection)) return "saves";
  if (/\bpower play points\b/.test(selection)) return "power_play_points";
  if (/\bgoals against\b/.test(selection)) return "goals_against";
  if (/\bshutout\b/.test(selection)) return "shutout";
  if (/\bany ?time goal scorer\b|\banytime goalscorer\b/.test(selection)) return "anytime_goalscorer";

  if (/\bpoints\b/.test(selection)) return "points";
  if (/\bassists\b/.test(selection)) return "assists";
  if (/\brebounds\b/.test(selection)) return "rebounds";
  if (/\bthrees\b|\b3\+ pointers\b|\bthree pointers\b|\bthrees made\b/.test(selection)) return "threes";

  return marketType;
}


function buildSelectionDirectionKey(row) {
  const selection = String(row.selectionNormalized || row.selectionRaw || "").toLowerCase();

  if (/\bover\b/.test(selection)) return "over";
  if (/\bunder\b/.test(selection)) return "under";
  return "";
}

function buildThresholdSortValue(row) {
  if (Number.isFinite(row.lineValue)) {
    return Number(row.lineValue);
  }

  const label = String(row.selectionNormalized || row.selectionRaw || "").toLowerCase();

  const plusMatch = label.match(/(\d+(?:\.\d+)?)\+/);
  if (plusMatch) return Number(plusMatch[1]);

  const overUnderMatch = label.match(/\b(?:over|under)\s+(\d+(?:\.\d+)?)/);
  if (overUnderMatch) return Number(overUnderMatch[1]);

  return Number.POSITIVE_INFINITY;
}

function computeMatchScore(sourceRow, targetRow) {
  const sourceVal = buildThresholdSortValue(sourceRow);
  const targetVal = buildThresholdSortValue(targetRow);

  if (!Number.isFinite(sourceVal) || !Number.isFinite(targetVal)) {
    return Number.POSITIVE_INFINITY;
  }

  if (targetVal >= sourceVal) {
    return targetVal - sourceVal;
  }

  return (sourceVal - targetVal) + 0.5;
}


function hasMeaningfulBaseOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function buildManualSelectionLabel(row) {
  const selection = String(row.selectionNormalized || row.selectionRaw || "Unknown");
  const lineValue =
    Number.isFinite(row.lineValue) &&
    row.marketType !== "moneyline_2way" &&
    row.marketType !== "moneyline_3way"
      ? ` | line ${row.lineValue}`
      : "";

  const odds =
    Number.isFinite(row.oddsAmerican)
      ? ` | ${row.oddsAmerican > 0 ? `+${row.oddsAmerican}` : row.oddsAmerican}`
      : "";

  return `${selection}${lineValue}${odds}`;
}

function isLikelyLiveRow(row) {
  const text = [
    row.eventLabelRaw,
    row.startTimeRaw,
    row.rawText,
    row.sourceTag,
    ...(Array.isArray(row.parseWarnings) ? row.parseWarnings : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\blive\b/.test(text) ||
    /\btop\s+\d/.test(text) ||
    /\bbottom\s+\d/.test(text) ||
    /\bend\s+\d/.test(text) ||
    /\bperiod\b/.test(text) ||
    /\bquarter\b/.test(text) ||
    /\bhalf\b/.test(text) ||
    /\bb:\d\b/.test(text) ||
    /\bs:\d\b/.test(text) ||
    /\bo:\d\b/.test(text)
  );
}

