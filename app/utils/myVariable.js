"use client";

export const MY_VARIABLE_MATCHED = "matched";
export const MY_VARIABLE_FUN = "fun";
export const MY_VARIABLE_EV = "EV+";

export const MY_VARIABLE_SUGGESTIONS = [
  MY_VARIABLE_MATCHED,
  MY_VARIABLE_EV,
  MY_VARIABLE_FUN,
];

function cleanText(value = "") {
  return String(value ?? "").trim();
}

const LARGE_STAKE_HEDGE_DEFAULT_DOLLARS = 250;

function moneyNumber(value) {
  const number = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(number) ? number : NaN;
}

export function isLargeStakeHedgeDefault(row = {}) {
  const stake = moneyNumber(row.stake);

  return (
    cleanText(row.largeStakeHedgeReview).toUpperCase() === "Y" ||
    (Number.isFinite(stake) && stake > LARGE_STAKE_HEDGE_DEFAULT_DOLLARS)
  );
}

export function normalizeMyVariable(value = "") {
  const raw = cleanText(value);
  if (!raw) return "";

  const key = raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    key === "matched" ||
    key === "match" ||
    key === "hedge" ||
    key === "middle" ||
    key === "arb" ||
    key === "arbitrage"
  ) {
    return MY_VARIABLE_MATCHED;
  }

  if (
    key === "fun" ||
    key === "recreational" ||
    key === "recreation" ||
    key === "parlay"
  ) {
    return MY_VARIABLE_FUN;
  }

  if (
    key === "ev" ||
    key === "ev+" ||
    key === "+ev" ||
    key === "positive ev" ||
    key === "plus ev"
  ) {
    return MY_VARIABLE_EV;
  }

  // Preserve custom spreadsheet tags exactly as entered.
  return raw;
}

export function isConfirmedHedgeForMyVariable(row = {}) {
  const override = cleanText(row.hedgeOverride).toUpperCase();
  const sourceTag = cleanText(row.betSourceTag || row.sourceTag).toLowerCase();
  const quality = cleanText(row.hedgeQuality).toLowerCase();
  const confirmedPartners = cleanText(
    row.confirmedHedgePartnerIds || row.hedgePartnerIds
  );

  return !!(
    override === "Y" ||
    sourceTag === "hedge" ||
    sourceTag === "middle" ||
    confirmedPartners ||
    quality.includes("confirmed hedge") ||
    quality.includes("confirmed middle")
  );
}

export function isParlayForMyVariable(row = {}) {
  const text = [
    row.reviewBetKind,
    row.betType,
    row.canonicalMarketContext,
    row.reviewMarketType,
    row.selection,
    row.fixtureEvent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(?:parlay|sgp|same game parlay)\b/.test(text);
}

export function isGamePropForMyVariable(row = {}) {
  const explicitKind = cleanText(row.reviewBetKind).toLowerCase();
  const text = [
    row.betType,
    row.canonicalMarketContext,
    row.reviewMarketType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return explicitKind === "other" || /\bgame\s*prop\b/.test(text);
}

export function getAutomaticMyVariable(row = {}) {
  // A confirmed hedge wins over parlay so a hedged parlay is tracked as matched.
  if (isConfirmedHedgeForMyVariable(row)) {
    return {
      value: MY_VARIABLE_MATCHED,
      source: "hedge",
      reason: "Confirmed hedge",
    };
  }

  // Parlays remain Fun by default even when the stake is large. If a parlay is
  // later explicitly confirmed as a hedge, the confirmed-hedge rule above wins.
  if (isParlayForMyVariable(row)) {
    return {
      value: MY_VARIABLE_FUN,
      source: "parlay",
      reason: "Parlay",
    };
  }

  // In this workflow, bets over $250 are overwhelmingly hedge bets. Default
  // them to matched immediately, but treat this as a default (not an
  // authoritative hedge confirmation) so the user can manually change the rare
  // exception back to EV+ or another custom tag.
  if (isLargeStakeHedgeDefault(row)) {
    return {
      value: MY_VARIABLE_MATCHED,
      source: "large_stake_hedge_default",
      reason: "Stake over $250 - default matched",
    };
  }

  // Manually chosen / recognized game props are Fun by default. Large-stake
  // hedge defaults above still win because bets over $250 should default matched.
  if (isGamePropForMyVariable(row)) {
    return {
      value: MY_VARIABLE_FUN,
      source: "game_prop",
      reason: "Game prop - default Fun",
    };
  }

  // Ordinary bets default to EV+. This is a reporting default, not a review gate.
  return {
    value: MY_VARIABLE_EV,
    source: "default_ev",
    reason: "Default EV+",
  };
}

export function getSuggestedMyVariable(row = {}) {
  const automatic = getAutomaticMyVariable(row);
  const structuralAutomatic =
    automatic.source === "hedge" || automatic.source === "parlay";

  // Confirmed hedge/parlay classification is authoritative even if this row was
  // initially stored differently. The large-stake matched value is only a
  // default, so a manual correction is allowed to persist.
  if (structuralAutomatic) return automatic.value;

  const stored = normalizeMyVariable(row.myVariable || "");
  const manual = cleanText(row.myVariableManual).toUpperCase() === "Y";

  if (manual && stored) return stored;
  return automatic.value;
}

export function getMyVariableState(row = {}) {
  const automatic = getAutomaticMyVariable(row);
  const structuralAutomatic =
    automatic.source === "hedge" || automatic.source === "parlay";
  const stored = normalizeMyVariable(row.myVariable || "");
  const manual = cleanText(row.myVariableManual).toUpperCase() === "Y";
  const value = structuralAutomatic
    ? automatic.value
    : manual && stored
    ? stored
    : automatic.value;

  return {
    value,
    automatic: structuralAutomatic || !manual,
    autoSource: structuralAutomatic
      ? automatic.source
      : manual
      ? ""
      : automatic.source,
    needsReview: false,
    reviewed: true,
    reason: structuralAutomatic
      ? automatic.reason
      : manual
      ? "Saved My Variable tag"
      : automatic.reason,
  };
}

function removeStaleMyVariableQueueReason(value = "") {
  const raw = cleanText(value);
  if (!raw) return "";

  const parts = raw
    .split(/\s*(?:\||\u00b7)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(
      (part) =>
        !/^my variable needs review\b/i.test(part) &&
        !/^defaulted to ev\+;?\b/i.test(part)
    );

  return parts.join(" | ");
}

export function applyMyVariableDefaults(row = {}) {
  const automatic = getAutomaticMyVariable(row);
  const structuralAutomatic =
    automatic.source === "hedge" || automatic.source === "parlay";
  const storedValue = normalizeMyVariable(row.myVariable || "");
  const wasManual = cleanText(row.myVariableManual).toUpperCase() === "Y";

  let myVariable;
  let myVariableManual;
  let myVariableAutoSource;

  if (structuralAutomatic) {
    myVariable = automatic.value;
    myVariableManual = "N";
    myVariableAutoSource = automatic.source;
  } else if (wasManual && storedValue) {
    // Keep uncommon custom/backend classifications until a structural hedge/parlay
    // classification supersedes them.
    myVariable = storedValue;
    myVariableManual = "Y";
    myVariableAutoSource = "";
  } else {
    // Use the current non-structural default. This is EV+ for ordinary bets and
    // matched for stakes over $250. Because it remains non-structural, a manual
    // correction can override the large-stake default.
    myVariable = automatic.value;
    myVariableManual = "N";
    myVariableAutoSource = automatic.source;
  }

  const cleanedQueueReason = removeStaleMyVariableQueueReason(
    row.reviewQueueReason || ""
  );

  const fields = {
    myVariable,
    // Kept for backward compatibility with prior app-state versions. My Variable
    // is no longer allowed to create a review requirement.
    myVariableReviewed: "Y",
    myVariableManual,
    myVariableAutoSource,
    reviewQueueReason: cleanedQueueReason,
  };

  if (
    !cleanedQueueReason &&
    String(row.reviewQueueReason || "").trim() &&
    !String(row.reviewReasons || "").trim() &&
    !String(row.parseWarning || "").trim()
  ) {
    fields.reviewQueueCapturedAt = "";
  }

  const unchanged = Object.entries(fields).every(
    ([key, value]) => String(row[key] ?? "") === String(value ?? "")
  );

  return unchanged ? row : { ...row, ...fields };
}

export function buildMyVariableReviewUpdates(row = {}, value = "") {
  const automatic = getAutomaticMyVariable(row);
  const structuralAutomatic =
    automatic.source === "hedge" || automatic.source === "parlay";

  if (structuralAutomatic) {
    return {
      myVariable: automatic.value,
      myVariableReviewed: "Y",
      myVariableManual: "N",
      myVariableAutoSource: automatic.source,
    };
  }

  return {
    myVariable: normalizeMyVariable(value) || automatic.value,
    myVariableReviewed: "Y",
    myVariableManual: "Y",
    myVariableAutoSource: "",
  };
}
