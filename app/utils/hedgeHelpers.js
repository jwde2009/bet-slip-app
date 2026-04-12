// app/utils/hedgeHelpers.js

function cleanValue(value = "") {
  return String(value || "").trim();
}

function toNum(value = "") {
  const n = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function areOppositeTotals(a, b) {
  return (
    cleanValue(a.canonicalBetType) === "total" &&
    cleanValue(b.canonicalBetType) === "total" &&
    cleanValue(a.canonicalFixture) &&
    cleanValue(a.canonicalFixture) === cleanValue(b.canonicalFixture) &&
    cleanValue(a.canonicalLine) &&
    cleanValue(a.canonicalLine) === cleanValue(b.canonicalLine) &&
    ((a.canonicalSide === "over" && b.canonicalSide === "under") ||
      (a.canonicalSide === "under" && b.canonicalSide === "over"))
  );
}

export function areOppositeSpreads(a, b) {
  if (
    cleanValue(a.canonicalBetType) !== "spread" ||
    cleanValue(b.canonicalBetType) !== "spread"
  ) {
    return false;
  }

  if (!cleanValue(a.canonicalFixture) || a.canonicalFixture !== b.canonicalFixture) {
    return false;
  }

  if (!cleanValue(a.canonicalLine) || !cleanValue(b.canonicalLine)) {
    return false;
  }

  const lineA = Number(a.canonicalLine);
  const lineB = Number(b.canonicalLine);

  if (!Number.isFinite(lineA) || !Number.isFinite(lineB)) return false;

  return Math.abs(lineA + lineB) < 0.0001 && a.canonicalTeam && b.canonicalTeam && a.canonicalTeam !== b.canonicalTeam;
}

export function areOppositePlayerProps(a, b) {
  return (
    cleanValue(a.canonicalBetType) === "player prop" &&
    cleanValue(b.canonicalBetType) === "player prop" &&
    cleanValue(a.canonicalPlayer) &&
    a.canonicalPlayer === b.canonicalPlayer &&
    cleanValue(a.canonicalMarket) &&
    a.canonicalMarket === b.canonicalMarket &&
    cleanValue(a.canonicalLine) &&
    a.canonicalLine === b.canonicalLine &&
    ((a.canonicalSide === "over" && b.canonicalSide === "under") ||
      (a.canonicalSide === "under" && b.canonicalSide === "over"))
  );
}

export function areLikelyOppositeSides(a, b) {
  if (!a || !b) return false;
  if (a === b) return false;

  return (
    areOppositeTotals(a, b) ||
    areOppositeSpreads(a, b) ||
    areOppositePlayerProps(a, b)
  );
}

export function classifyHedgeQuality(a, b) {
  if (!areLikelyOppositeSides(a, b)) return "";

  const oddsA = toNum(a.oddsUS);
  const oddsB = toNum(b.oddsUS);

  if (!oddsA || !oddsB) return "Basic";

  const impliedA =
    oddsA > 0 ? 100 / (oddsA + 100) : Math.abs(oddsA) / (Math.abs(oddsA) + 100);
  const impliedB =
    oddsB > 0 ? 100 / (oddsB + 100) : Math.abs(oddsB) / (Math.abs(oddsB) + 100);

  const sum = impliedA + impliedB;

  if (sum < 0.99) return "Arb";
  if (sum <= 1.04) return "Strong";
  return "Basic";
}