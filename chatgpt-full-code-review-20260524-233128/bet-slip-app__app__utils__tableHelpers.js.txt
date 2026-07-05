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

export function computeConfidence(row) {
  let score = 0;
  if (row.bookmaker) score += 1;
  if (row.selection) score += 1;
  if (row.betType) score += 1;
  if (row.stake) score += 1;
  if (row.oddsUS) score += 1;
  if (row.fixtureEvent) score += 1;
  if (row.betDate || row.eventDate) score += 1;
  if (row.parseWarning) score -= 2;
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

export function compareValues(a, b, direction = "asc") {
  const dir = direction === "desc" ? -1 : 1;
  const aNum = Number(String(a).replace(/[^\d.-]/g, ""));
  const bNum = Number(String(b).replace(/[^\d.-]/g, ""));
  const aIsNum = String(a).trim() !== "" && Number.isFinite(aNum);
  const bIsNum = String(b).trim() !== "" && Number.isFinite(bNum);

  if (aIsNum && bIsNum) return (aNum - bNum) * dir;

  return (
    String(a || "").localeCompare(String(b || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * dir
  );
}

export function getSortableValue(row, key) {
  switch (key) {
    case "bookmaker":
      return getDisplayedBookmaker(row);
    case "owner":
      return row.accountOwner;
    case "qa":
      return row.likelyParserIssue === "Y" ? "Check" : "";
    case "warnings":
      return [row.parseWarning || "", row.duplicateWarning || ""].join(" ");
    default:
      return row[key] || "";
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