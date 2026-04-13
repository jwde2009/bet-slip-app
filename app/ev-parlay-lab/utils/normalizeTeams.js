import { normalizeTeamNameBySport } from "../data/teamAliases";
import { americanToDecimal } from "./odds";

export function normalizeParsedRows(rows) {
  return rows.map((row) => {
    const { homeTeam, awayTeam } = inferTeamsFromEvent(row.eventLabelRaw);
    const selectionNormalized = normalizeTeamNameBySport(
      row.selectionNormalized || row.selectionRaw,
      row.sport
    );

    return {
      ...row,
      homeTeamRaw: homeTeam,
      awayTeamRaw: awayTeam,
      homeTeam: normalizeTeamNameBySport(homeTeam, row.sport),
      awayTeam: normalizeTeamNameBySport(awayTeam, row.sport),
      selectionNormalized,
      oddsDecimal: americanToDecimal(row.oddsAmerican),
    };
  });
}

function inferTeamsFromEvent(eventLabelRaw = "") {
  const label = eventLabelRaw.trim();

  if (label.includes("@")) {
    const [away, home] = label.split("@").map((s) => s.trim());
    return { homeTeam: home || "", awayTeam: away || "" };
  }

  if (/\bvs\b/i.test(label)) {
    const [home, away] = label.split(/\bvs\b/i).map((s) => s.trim());
    return { homeTeam: home || "", awayTeam: away || "" };
  }

  return { homeTeam: "", awayTeam: "" };
}