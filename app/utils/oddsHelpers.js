function getMatch(text, regex) {
  const match = String(text || "").match(regex);
  return match ? (match[1] || "").trim() : "";
}

function isLikelyAmericanOddsToken(token) {
  const s = String(token || "").trim();
  if (!/^[+-]\d{3,5}$/.test(s)) return false;

  const num = Number(s);
  if (!Number.isFinite(num)) return false;

  return Math.abs(num) >= 100;
}

export function americanOddsFromStakeAndReturn(stakeValue, totalReturnValue) {
  const stake = Number(String(stakeValue || "").replace(/,/g, ""));
  const payout = Number(String(totalReturnValue || "").replace(/,/g, ""));
  if (!Number.isFinite(stake) || !Number.isFinite(payout) || stake <= 0 || payout <= stake) {
    return "";
  }

  const decimalOdds = payout / stake;
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return "";

  if (decimalOdds >= 2) return `+${Math.round((decimalOdds - 1) * 100)}`;
  return `${Math.round(-100 / (decimalOdds - 1))}`;
}

export function americanOddsFromStakeAndProfit(stakeValue, profitValue) {
  const stake = Number(String(stakeValue || "").replace(/,/g, ""));
  const profit = Number(String(profitValue || "").replace(/,/g, ""));
  if (!Number.isFinite(stake) || !Number.isFinite(profit) || stake <= 0 || profit <= 0) {
    return "";
  }

  if (profit >= stake) return `+${Math.round((profit / stake) * 100)}`;
  return `${Math.round(-(100 / (profit / stake)))}`;
}

export function detectOddsMissingReason({ oddsUS, stake, payout, toWin, screenType }) {
  if (oddsUS) return "";
  if (screenType === "active_bet_slip") return "Unsupported active bet slip";
  if (screenType === "multi_bet_screenshot") return "Multiple bets detected";
  if (!stake) return "No stake shown";
  if (!payout && !toWin) return "No payout or to-win shown";
  if (!payout) return "No payout shown";
  if (!toWin) return "No to-win shown";
  return "No odds detected";
}

function extractOddsCandidates(text) {
  const candidates = [];
  const lines = String(text || "").split("\n");

  for (const line of lines) {
    const cleanedLine = String(line || "").replace(/\s+/g, " ").trim();
    const matches = cleanedLine.match(/[+-]\d{2,5}(?!\.\d)/g) || [];

    for (const token of matches) {
      if (!isLikelyAmericanOddsToken(token)) continue;

      const lineHasCashoutOnly = /\bCash Out\b/i.test(line) && !/\bBet Placed\b/i.test(line);
      if (lineHasCashoutOnly) continue;

      candidates.push({
        token,
        line: cleanedLine,
      });
    }
  }

  return candidates;
}

export function extractPayouts(text) {
  const payout =
    getMatch(text, /Total\s*Payout:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(text, /To\s*Pay:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    getMatch(text, /Paid:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    "";

  const toWinDirect =
    getMatch(text, /To\s*Win:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) || "";

  return { payout, toWinDirect };
}

export function extractBestOdds({ receiptText, rawSelection, payout, stake }) {
  const selectionText = String(rawSelection || "").trim();
  const text = String(receiptText || "");

  const inlineSelectionOdds =
    selectionText.match(/([+-]\d{3,5})\)?\s*$/i)?.[1] || "";
  if (inlineSelectionOdds && isLikelyAmericanOddsToken(inlineSelectionOdds)) {
    return { oddsUS: inlineSelectionOdds, oddsSource: "OCR" };
  }

  const oddsLabelMatch = getMatch(text, /Odds:\s*([+-]\d{3,5})/i);
  if (oddsLabelMatch && isLikelyAmericanOddsToken(oddsLabelMatch)) {
    return { oddsUS: oddsLabelMatch, oddsSource: "OCR" };
  }

  const allCandidates = extractOddsCandidates(text);

  const filtered = allCandidates.filter((c) => {
    const line = c.line || "";
    const token = c.token || "";

    if (!isLikelyAmericanOddsToken(token)) return false;
    // Reject unrealistic odds
    const numeric = parseInt(token, 10);
    if (Math.abs(numeric) < 100) return false;   // kills -13, -14, etc
    if (Math.abs(numeric) > 2000) return false;  // optional safety cap
    if (/[+-]\d+\.\d/.test(token)) return false;
    if (/Wager Amount|Wager:|Total Payout|To Pay|Paid:/i.test(line)) return false;
    if (/^\d{1,2}:\d{2}/.test(line)) return false; // timestamps
    if (/[@]/.test(line) && !/Moneyline|Spread|Total|O\/U/i.test(line)) return false; // junk event lines
    if (
      /Today|Tomorrow|Sun|Mon|Tue|Wed|Thu|Fri|Sat/i.test(line) &&
      !/Moneyline|Spread|Total|O\/U/i.test(line)
    ) {
      return false;
    }

    return true;
  });

  if (filtered.length > 0) {
    const best =
      filtered.find((c) =>
    /\b(Odds|Moneyline|Spread|Total|To Win|Payout)\b/i.test(c.line)
  ) ||
      filtered[filtered.length - 1];

    if (best?.token) {
      return { oddsUS: best.token, oddsSource: "OCR" };
    }
  }

  if (stake && payout) {
    const calc = americanOddsFromStakeAndReturn(stake, payout);
    if (calc) return { oddsUS: calc, oddsSource: "Calculated" };
  }

  return { oddsUS: "", oddsSource: "" };
}