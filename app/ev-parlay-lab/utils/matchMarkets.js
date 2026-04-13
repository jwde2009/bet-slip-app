export function buildCanonicalMarkets(rows) {
  const eligibleRows = rows.filter(
    (row) =>
      !row.excluded &&
      Number.isFinite(row.oddsAmerican) &&
      row.selectionNormalized &&
      row.eventLabelRaw
  );

  const marketMap = new Map();
  const unmatchedRows = [];

  for (const row of eligibleRows) {
    const eventKey = buildCanonicalEventKey(row);
    const normalizedLineValue = normalizeLineValueForMarket(row);

    const marketKey = [
      String(row.sport || "").trim().toUpperCase(),
      eventKey,
      String(row.marketType || "").trim().toLowerCase(),
      normalizedLineValue,
    ].join("||");

    if (!marketMap.has(marketKey)) {
      marketMap.set(marketKey, {
        id: marketKey,
        displayName: buildCanonicalDisplayName(row),
        eventKey,
        sport: row.sport,
        marketType: row.marketType,
        lineValue: normalizedLineValue === "" ? null : Number(normalizedLineValue),
        selections: [],
      });
    }

    const market = marketMap.get(marketKey);
    const selectionLabel = normalizeSelectionLabel(row);

    let selection = market.selections.find((s) => s.label === selectionLabel);

    if (!selection) {
      selection = {
        id: `${marketKey}::${selectionLabel}`,
        label: selectionLabel,
        quotes: [],
      };
      market.selections.push(selection);
    }

    selection.quotes.push({
      parsedRowId: row.id,
      sportsbook: row.sportsbook,
      oddsAmerican: row.oddsAmerican,
      oddsDecimal: row.oddsDecimal,
      isSharpSource: row.isSharpSource,
      isTargetBook: row.isTargetBook,
      batchRole: row.batchRole || "",
      originalEventLabelRaw: row.eventLabelRaw,
      originalSelectionNormalized: row.selectionNormalized,
    });
  }

  const markets = Array.from(marketMap.values()).sort((a, b) => {
    if (a.displayName !== b.displayName) {
      return a.displayName.localeCompare(b.displayName);
    }
    if (a.marketType !== b.marketType) {
      return a.marketType.localeCompare(b.marketType);
    }
    return String(a.lineValue ?? "").localeCompare(String(b.lineValue ?? ""));
  });

  return { markets, unmatchedRows };
}

function buildCanonicalEventKey(row) {
  const away = cleanTeam(row.awayTeam || row.awayTeamRaw);
  const home = cleanTeam(row.homeTeam || row.homeTeamRaw);

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const parsed = splitEventLabel(row.eventLabelRaw);
  if (parsed.away && parsed.home) {
    return `${parsed.away} @ ${parsed.home}`;
  }

  return cleanText(row.eventLabelRaw);
}

function buildCanonicalDisplayName(row) {
  const away = cleanTeam(row.awayTeam || row.awayTeamRaw);
  const home = cleanTeam(row.homeTeam || row.homeTeamRaw);

  if (away && home) {
    return `${away} @ ${home}`;
  }

  const parsed = splitEventLabel(row.eventLabelRaw);
  if (parsed.away && parsed.home) {
    return `${parsed.away} @ ${parsed.home}`;
  }

  return cleanText(row.eventLabelRaw);
}

function splitEventLabel(eventLabelRaw = "") {
  const text = cleanText(eventLabelRaw);

  if (!text) return { away: "", home: "" };

  if (text.includes("@")) {
    const [away, home] = text.split("@").map((s) => cleanTeam(s));
    return { away, home };
  }

  if (/\bvs\b/i.test(text)) {
    const [away, home] = text.split(/\bvs\b/i).map((s) => cleanTeam(s));
    return { away, home };
  }

  return { away: "", home: "" };
}

function normalizeSelectionLabel(row) {
  const marketType = String(row.marketType || "").trim().toLowerCase();
  const selection = cleanText(row.selectionNormalized || row.selectionRaw);

  if (marketType === "total") {
    if (/^over$/i.test(selection)) return "Over";
    if (/^under$/i.test(selection)) return "Under";
  }

  return selection;
}

function normalizeLineValueForMarket(row) {
  const marketType = String(row.marketType || "").trim().toLowerCase();

  if (marketType === "moneyline_2way" || marketType === "moneyline_3way") {
    return "";
  }

  if (!Number.isFinite(row.lineValue)) {
    return "";
  }

  // Keep half-points distinct, but normalize formatting.
  return Number(row.lineValue).toFixed(1);
}

function cleanTeam(value = "") {
  return cleanText(value);
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}