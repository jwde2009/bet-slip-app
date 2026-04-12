// app/utils/parserSelectionHelpers.js

import { cleanTextLine } from "./parserShared";

export function singularizeStat(label) {
  const lower = label.toLowerCase();
  if (lower === "home runs") return "home run";
  if (lower === "three pointers made") return "threes";
  return label;
}

export function buildPlayerPropSelection(rawSelection, marketDetail) {
  const cleanedSelection = cleanTextLine(rawSelection);
  const cleanedMarket = cleanTextLine(marketDetail);
  const overUnderMatch = cleanedSelection.match(/\b(Over|Under)\s*([\d.]+)/i);

  if (overUnderMatch) {
    const direction = overUnderMatch[1].toLowerCase();
    const line = overUnderMatch[2];
    const propPatterns = [
      { regex: /^(.*)\s+Rebounds O\/U$/i, label: "rebounds" },
      { regex: /^(.*)\s+Points O\/U$/i, label: "points" },
      { regex: /^(.*)\s+Assists O\/U$/i, label: "assists" },
      {
        regex: /^(.*)\s+Three Pointers(?: Made)?(?: O\/U| Made O\/U)?$/i,
        label: "threes",
      },
      {
        regex: /^(.*)\s+Points \+ Rebounds \+ Assists(?: O\/U)?$/i,
        label: "points + rebounds + assists",
      },
      { regex: /^(.*)\s+Passing Yards$/i, label: "passing yards" },
      { regex: /^(.*)\s+Rushing Yards$/i, label: "rushing yards" },
      { regex: /^(.*)\s+Receiving Yards$/i, label: "receiving yards" },
      { regex: /^(.*)\s+Shots on Goal$/i, label: "shots on goal" },
      { regex: /^(.*)\s+Strikeouts(?: Thrown)?$/i, label: "strikeouts" },
      { regex: /^(.*)\s+Hits(?: O\/U)?$/i, label: "hits" },
      { regex: /^(.*)\s+RBIs$/i, label: "RBIs" },
      { regex: /^(.*)\s+Earned Runs(?: Allowed)?(?: O\/U)?$/i, label: "earned runs" },
    ];

    for (const item of propPatterns) {
      const m = cleanedMarket.match(item.regex);
      if (m) return `${m[1]} ${direction} ${line} ${item.label}`.trim();
    }
  }

  if (/triple-double/i.test(cleanedMarket)) return `${cleanedSelection} triple-double`.trim();
  if (/double-double/i.test(cleanedMarket)) return `${cleanedSelection} double-double`.trim();
  if (/ko\/tko\/dq/i.test(cleanedMarket)) return `${cleanedSelection} by KO/TKO/DQ`.trim();
  if (/submission/i.test(cleanedMarket)) return `${cleanedSelection} by submission`.trim();
  if (/decision/i.test(cleanedMarket)) return `${cleanedSelection} by decision`.trim();

  const plusMatch = cleanedSelection.match(/^(\d+)\+$/i);
  if (plusMatch) {
    const n = plusMatch[1];
    const propPatterns = [
      { regex: /^(.*)\s+Three Pointers(?: Made)?(?: O\/U| Made O\/U)?$/i, label: "three pointers made" },
      { regex: /^(.*)\s+Home Runs$/i, label: "home runs" },
      { regex: /^(.*)\s+Hits$/i, label: "hits" },
      { regex: /^(.*)\s+RBIs$/i, label: "RBIs" },
      { regex: /^(.*)\s+Strikeouts(?: Thrown)?$/i, label: "strikeouts" },
      { regex: /^(.*)\s+Shots on Goal$/i, label: "shots on goal" },
      { regex: /^(.*)\s+Assists$/i, label: "assists" },
    ];

    for (const item of propPatterns) {
      const m = cleanedMarket.match(item.regex);
      if (m) return `${m[1]} ${n}+ ${singularizeStat(item.label)}`.trim();
    }
  }

  if (/Anytime Goalscorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} anytime goal`;
  if (/First Goalscorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} first goal`;
  if (/Last Goalscorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} last goal`;
  if (/Anytime Touchdown Scorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} anytime touchdown`;
  if (/First Touchdown Scorer/i.test(cleanedMarket) && cleanedSelection)
    return `${cleanedSelection} first touchdown`;

  if (/^yes$/i.test(cleanedSelection) && /double-double/i.test(cleanedMarket))
    return `Yes double-double`;
  if (/^no$/i.test(cleanedSelection) && /double-double/i.test(cleanedMarket))
    return `No double-double`;

  if (cleanedMarket && !cleanedSelection) return cleanedMarket;
  return cleanedSelection;
}

export function normalizeTeamNames(text) {
  const replacements = [
    [/\bLA Clippers\b/gi, "Los Angeles Clippers"],
    [/\bLA Lakers\b/gi, "Los Angeles Lakers"],
    [/\bGS Warriors\b|\bGolden St Warriors\b/gi, "Golden State Warriors"],
    [/\bNY Knicks\b/gi, "New York Knicks"],
    [/\bOKC Thunder\b/gi, "Oklahoma City Thunder"],
    [/\bMavs\b/gi, "Mavericks"],
    [/\bT-Wolves\b|\bTWolves\b/gi, "Timberwolves"],
  ];
  let result = String(text || "");
  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

export function extractParlayInfo(afterLines) {
  const cleanedLines = afterLines.map(cleanTextLine).filter(Boolean);
  const legCountText = cleanedLines.find((line) => /^\d+\s*Pick Parlay$/i.test(line)) || "";
  const legCount = Number((legCountText.match(/^(\d+)/)?.[1] || "").trim()) || 0;

  const legs = [];
  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    const next = cleanedLines[i + 1] || "";

    if (/^(Over|Under)\s+\d+(\.\d+)?$/i.test(line) && next) {
      legs.push(`${line} ${next}`.trim());
      continue;
    }

    if (/^(Yes|No)$/i.test(line) && next) {
      legs.push(`${line} ${next}`.trim());
      continue;
    }

    if (
      /Moneyline|Spread|Run Line|Puck Line|Total|Points O\/U|Rebounds O\/U|Assists O\/U|Three Pointers(?: Made)?(?: O\/U| Made O\/U)?|Double-Double|Triple-Double|Anytime Goalscorer/i.test(
        next
      )
    ) {
      legs.push(`${line} ${next}`.trim());
    }
  }

  const dedupedLegs = Array.from(new Set(legs)).filter(
    (x) =>
      x &&
      !/Bet With Friends|Create Group|Keep Picks|Wager Amount|Total Payout|Mar \d|Apr \d/i.test(x)
  );

  return {
    parlayLegCount: legCount || dedupedLegs.length || 0,
    legsRawText: dedupedLegs.join(" | "),
    selectionSummary: legCount
      ? `${legCount} Pick Parlay`
      : dedupedLegs.length
      ? `${dedupedLegs.length} Leg Parlay`
      : "Parlay",
  };
}