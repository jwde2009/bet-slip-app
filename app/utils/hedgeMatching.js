// app/utils/hedgeMatching.js

function isSameCoreMarket(a, b) {
  return (
    a.canonicalHedgeKey &&
    b.canonicalHedgeKey &&
    a.canonicalHedgeKey === b.canonicalHedgeKey
  );
}

function isOppositeSide(a, b) {
  return (
    a.canonicalOppositeKey &&
    b.canonicalSelectionKey &&
    a.canonicalOppositeKey === b.canonicalSelectionKey
  );
}

function isSameSide(a, b) {
  return (
    a.canonicalSelectionKey &&
    b.canonicalSelectionKey &&
    a.canonicalSelectionKey === b.canonicalSelectionKey
  );
}

function isPotentialMiddle(a, b) {
  if (!isSameCoreMarket(a, b)) return false;

  const lineA = parseFloat(a.canonicalLine);
  const lineB = parseFloat(b.canonicalLine);

  if (isNaN(lineA) || isNaN(lineB)) return false;
  if (lineA === lineB) return false;

  const sideA = (a.canonicalSide || "").toLowerCase();
  const sideB = (b.canonicalSide || "").toLowerCase();

  return (
    (sideA === "over" && sideB === "under") ||
    (sideA === "under" && sideB === "over")
  );
}

export function detectHedgeType(a, b) {
  if (isOppositeSide(a, b)) {
    return "EXACT_HEDGE";
  }

  if (isPotentialMiddle(a, b)) {
    return "MIDDLE";
  }

  if (isSameSide(a, b)) {
    return "DUPLICATE";
  }

  return null;
}