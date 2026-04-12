export function impliedProbabilityFromAmericanOdds(odds) {
  const raw = String(odds || "").trim();
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return "";
  const p = n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  return `${(p * 100).toFixed(1)}%`;
}

export function getDisplayedBookmaker(row) {
  const base = String(row.bookmaker || "").replace(/^C-/, "");
  if (!base) return "";
  return row.accountOwner === "Wife" ? `C-${base}` : base;
}

export function getSortableBookmaker(row) {
  return String(getDisplayedBookmaker(row) || "")
    .replace(/^C-/, "")
    .trim()
    .toLowerCase();
}

export function computeConfidence(row) {
  let score = 0;

  const parseWarning = String(row.parseWarning || "").toLowerCase();

  if (row.bookmaker) score += 1;
  if (row.selection) score += 1;
  if (row.betType) score += 1;
  if (row.stake) score += 1;
  if (row.oddsUS) score += 1;
  if (row.fixtureEvent) score += 1;
  if (row.betDate || row.eventDate) score += 1;

  const hasCriticalWarning =
    parseWarning.includes("stake_missing") ||
    parseWarning.includes("selection_missing") ||
    parseWarning.includes("fixture_missing") ||
    parseWarning.includes("no_bet_date_detected") ||
    parseWarning.includes("payout_mismatch");

  const hasModerateWarning =
    parseWarning.includes("payout_missing") ||
    parseWarning.includes("odds_missing");

  const hasEstimatedOnly =
    parseWarning &&
    !hasCriticalWarning &&
    !hasModerateWarning &&
    parseWarning.split("|").map((x) => x.trim()).every((x) => x === "payout_estimated");

  if (hasCriticalWarning) {
    score -= 3;
  } else if (hasModerateWarning) {
    score -= 2;
  } else if (hasEstimatedOnly) {
    score -= 0;
  } else if (parseWarning) {
    score -= 1;
  }

  if (!row.selection || !row.bookmaker) score -= 1;

  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

export function makeDuplicateKey(row) {
  return [
    String(getDisplayedBookmaker(row) || "").trim().toLowerCase(),
    String(row.fixtureEvent || "").trim().toLowerCase(),
    String(row.selection || "").trim().toLowerCase(),
    String(row.stake || "").trim().toLowerCase(),
    String(row.oddsUS || "").trim().toLowerCase(),
    String(row.betId || "").trim().toLowerCase(),
  ].join("|");
}

function isNumericLike(value) {
  const str = String(value ?? "").trim();
  if (!str) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return false;
  const cleaned = str.replace(/[,%$]/g, "");
  return /^[-+]?\d*\.?\d+$/.test(cleaned);
}

export function compareValues(a, b, direction = "asc") {
  const dir = direction === "desc" ? -1 : 1;

  const aStr = String(a ?? "").trim();
  const bStr = String(b ?? "").trim();

  if (isNumericLike(aStr) && isNumericLike(bStr)) {
    const aNum = Number(aStr.replace(/[,%$]/g, ""));
    const bNum = Number(bStr.replace(/[,%$]/g, ""));
    return (aNum - bNum) * dir;
  }

  return (
    aStr.localeCompare(bStr, undefined, {
      numeric: true,
      sensitivity: "base",
    }) * dir
  );
}

export function getSortableValue(row, key) {
  switch (key) {
    case "bookmaker":
      return getSortableBookmaker(row);
    case "accountOwner":
    case "owner":
      return String(row.accountOwner || "").trim().toLowerCase();
    case "qa":
    case "likelyParserIssue":
      return row.likelyParserIssue === "Y" ? "check" : "";
    case "warnings":
      return [row.parseWarning || "", row.duplicateWarning || ""]
        .join(" ")
        .trim()
        .toLowerCase();
    case "confidenceFlag":
      return String(row.confidenceFlag || "").trim().toLowerCase();
    default:
      return String(row[key] || "").trim().toLowerCase();
  }
}

export function addDuplicateWarnings(rows) {
  const counts = new Map();

  for (const row of rows) {
    if (row.duplicateIgnored === "Y") continue;
    const key = makeDuplicateKey(row);
    if (key === "|||||") continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return rows.map((row) => {
    const key = makeDuplicateKey(row);
    const isDuplicate =
      row.duplicateIgnored !== "Y" &&
      key !== "|||||" &&
      (counts.get(key) || 0) > 1;

    return {
      ...row,
      duplicateWarning: isDuplicate ? "Possible duplicate" : "",
      impliedProbability: impliedProbabilityFromAmericanOdds(row.oddsUS),
      confidenceFlag: computeConfidence(row),
    };
  });
}