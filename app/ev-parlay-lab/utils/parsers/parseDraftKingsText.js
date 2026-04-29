import { americanToDecimal } from "../odds";

let nextId = 1;

function makeId() {
  return `dk_row_${nextId++}`;
}

export function parseDraftKingsText(rawText, context = {}) {
  if (!rawText || typeof rawText !== "string") return [];

  const lines = rawText
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const titleGame = findTitleGame(lines);

  if (titleGame) {
    const rows = parseDraftKingsDetailPage(lines, titleGame, context);
    console.log("DK DETAIL PAGE ROWS", rows);
    return dedupeRows(rows);
  }

  const rows = parseDraftKingsLandingPage(lines, context);
  console.log("DK LANDING PAGE ROWS", rows);
  return dedupeRows(rows);
}

function parseDraftKingsDetailPage(lines, game, context) {
  const { away, home } = game;
  const event = `${away} @ ${home}`;
  const rows = [];

  const marketStart = findDetailMarketStart(lines);
  const block = marketStart === -1 ? lines : lines.slice(marketStart);

  console.log("DK DETAIL START", {
    event,
    marketStart,
    first40: block.slice(0, 40),
  });

  // Main game lines block
  for (let i = 0; i < block.length - 18; i += 1) {
    if (
      /^Game$/i.test(block[i]) &&
      /^(Spread|Puck Line)$/i.test(block[i + 1]) &&
      /^Total$/i.test(block[i + 2]) &&
      /^Moneyline$/i.test(block[i + 3]) &&
      normalizeTeamName(block[i + 4]) === away &&
      isAtMarker(block[i + 5]) &&
      normalizeTeamName(block[i + 6]) === home
    ) {
      const spreadAway = parseSpreadLine(block[i + 7]);
      const spreadAwayOdds = parseAmericanOdds(block[i + 8]);
      const overMarker = block[i + 9];
      const totalLine = parseTotalNumber(block[i + 10]);
      const overOdds = parseAmericanOdds(block[i + 11]);
      const mlAway = parseAmericanOdds(block[i + 12]);

      const spreadHome = parseSpreadLine(block[i + 13]);
      const spreadHomeOdds = parseAmericanOdds(block[i + 14]);
      const underMarker = block[i + 15];
      const totalLine2 = parseTotalNumber(block[i + 16]);
      const underOdds = parseAmericanOdds(block[i + 17]);
      const mlHome = parseAmericanOdds(block[i + 18]);

      if (
        spreadAway !== null &&
        spreadAwayOdds !== null &&
        /^O$/i.test(overMarker) &&
        totalLine !== null &&
        overOdds !== null &&
        mlAway !== null &&
        spreadHome !== null &&
        spreadHomeOdds !== null &&
        /^U$/i.test(underMarker) &&
        totalLine2 !== null &&
        underOdds !== null &&
        mlHome !== null
      ) {
        rows.push(
          makeRow({ event, selection: away, marketType: "spread", lineValue: spreadAway, oddsAmerican: spreadAwayOdds, context }),
          makeRow({ event, selection: away, marketType: "moneyline_2way", lineValue: null, oddsAmerican: mlAway, context }),
          makeRow({ event, selection: "Over", marketType: "total", lineValue: totalLine, oddsAmerican: overOdds, context }),
          makeRow({ event, selection: home, marketType: "spread", lineValue: spreadHome, oddsAmerican: spreadHomeOdds, context }),
          makeRow({ event, selection: home, marketType: "moneyline_2way", lineValue: null, oddsAmerican: mlHome, context }),
          makeRow({ event, selection: "Under", marketType: "total", lineValue: totalLine2, oddsAmerican: underOdds, context })
        );
      }

      break;
    }
  }

    // Standard player milestone ladders like:
  // Points / Cade Cunningham / 18+ / 20+ / 25+ / 29+ / 30+ / +105 / 35+
  rows.push(...parseDraftKingsStandardPlusLadderSections(block, event, context));

  // Player O/U sections like:
  // Points O/U / Player / Over / Under / Cade Cunningham / PPG / 0 / ... / O / 28.5 / -115 / U / 28.5 / -110
  for (let i = 0; i < block.length - 8; i += 1) {
    const marketType = inferOuMarketType(block[i]);
    if (!marketType) continue;

    const end = findNextDraftKingsSectionEnd(block, i + 1);

    for (let j = i + 1; j < end; j += 1) {
      const player = normalizeLine(block[j]);

      if (/^(Player|Over|Under)$/i.test(player)) continue;
      if (inferOuMarketType(player)) break;
      if (isHardStopLine(player)) break;
      if (isSectionBreak(player)) break;
      if (!looksLikePlayerName(player)) continue;

      let found = null;

      for (let k = j + 1; k < Math.min(end, j + 90); k += 1) {
        const token = normalizeLine(block[k]);

        if (k > j + 1 && looksLikePlayerName(token)) break;
        if (isSectionBreak(token) || isHardStopLine(token)) break;

        if (!/^O$/i.test(token)) continue;

        const lineOver = parseTotalNumber(block[k + 1]);
        const oddsOver = parseAmericanOdds(block[k + 2]);

        if (lineOver === null || oddsOver === null) continue;

        let underIndex = -1;

        for (let u = k + 3; u < Math.min(end, k + 16); u += 1) {
          const underToken = normalizeLine(block[u]);

          if (/^U$/i.test(underToken)) {
            underIndex = u;
            break;
          }

          if (looksLikePlayerName(underToken) || isSectionBreak(underToken) || isHardStopLine(underToken)) {
            break;
          }
        }

        if (underIndex === -1) continue;

        const lineUnder = parseTotalNumber(block[underIndex + 1]);
        const oddsUnder = parseAmericanOdds(block[underIndex + 2]);

        if (
          lineUnder === null ||
          oddsUnder === null ||
          Math.abs(lineOver - lineUnder) >= 0.001
        ) {
          continue;
        }

        found = {
          lineOver,
          oddsOver,
          lineUnder,
          oddsUnder,
          consumedIndex: underIndex + 2,
        };

        break;
      }

      if (!found) continue;

      rows.push(
        makeRow({
          event,
          selection: `${player} | Over`,
          marketType,
          lineValue: found.lineOver,
          oddsAmerican: found.oddsOver,
          context,
        }),
        makeRow({
          event,
          selection: `${player} | Under`,
          marketType,
          lineValue: found.lineUnder,
          oddsAmerican: found.oddsUnder,
          context,
        })
      );

      j = found.consumedIndex;
    }
  }

    const dkComboRows = parseDraftKingsComboSections(block, event, context);
    console.log("DK COMBO ROWS", dkComboRows);
    rows.push(...dkComboRows);

    const dkYesNoRows = parseDraftKingsYesNoSections(block, event, context);
    console.log("DK YES/NO ROWS", dkYesNoRows);
    rows.push(...dkYesNoRows);

    const nhlGoalRows = parseDraftKingsNhlGoalsSection(block, event, context);
    console.log("DK NHL GOALS ROWS", nhlGoalRows);
    rows.push(...nhlGoalRows);

    return rows;
  }

function parseDraftKingsLandingPage(lines, context) {
  const rows = [];

  for (let i = 0; i < lines.length - 17; i += 1) {
    if (
      /^(Spread|Total|Moneyline)$/i.test(lines[i]) &&
      looksLikeTeamLine(lines[i + 3]) &&
      isAtMarker(lines[i + 4]) &&
      looksLikeTeamLine(lines[i + 5])
    ) {
      const away = normalizeTeamName(lines[i + 3]);
      const home = normalizeTeamName(lines[i + 5]);
      const event = `${away} @ ${home}`;

      const spreadAway = parseSpreadLine(lines[i + 6]);
      const spreadAwayOdds = parseAmericanOdds(lines[i + 7]);
      const overMarker = lines[i + 8];
      const totalLine = parseTotalNumber(lines[i + 9]);
      const overOdds = parseAmericanOdds(lines[i + 10]);
      const mlAway = parseAmericanOdds(lines[i + 11]);

      const spreadHome = parseSpreadLine(lines[i + 12]);
      const spreadHomeOdds = parseAmericanOdds(lines[i + 13]);
      const underMarker = lines[i + 14];
      const totalLine2 = parseTotalNumber(lines[i + 15]);
      const underOdds = parseAmericanOdds(lines[i + 16]);
      const mlHome = parseAmericanOdds(lines[i + 17]);

      if (
        spreadAway !== null &&
        spreadAwayOdds !== null &&
        /^O$/i.test(overMarker) &&
        totalLine !== null &&
        overOdds !== null &&
        mlAway !== null &&
        spreadHome !== null &&
        spreadHomeOdds !== null &&
        /^U$/i.test(underMarker) &&
        totalLine2 !== null &&
        underOdds !== null &&
        mlHome !== null
      ) {
        rows.push(
          makeRow({ event, selection: away, marketType: "spread", lineValue: spreadAway, oddsAmerican: spreadAwayOdds, context }),
          makeRow({ event, selection: away, marketType: "moneyline_2way", lineValue: null, oddsAmerican: mlAway, context }),
          makeRow({ event, selection: "Over", marketType: "total", lineValue: totalLine, oddsAmerican: overOdds, context }),
          makeRow({ event, selection: home, marketType: "spread", lineValue: spreadHome, oddsAmerican: spreadHomeOdds, context }),
          makeRow({ event, selection: home, marketType: "moneyline_2way", lineValue: null, oddsAmerican: mlHome, context }),
          makeRow({ event, selection: "Under", marketType: "total", lineValue: totalLine2, oddsAmerican: underOdds, context })
        );

        i += 12;
      }
    }
  }

  return rows;
}

function findTitleGame(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);

    const atMatch = line.match(/Sportsbook\s*\/.*Odds\s*\/.*\s+@\s+.*Odds$/i);
    const vsMatch = line.match(/Sportsbook\s*\/.*Odds\s*\/.*\s+vs\s+.*Odds$/i);

    if (atMatch || vsMatch) {
      const at = line.match(/\/\s*([^/]+?)\s+@\s+([^/]+?)\s+Odds$/i);
      if (at) {
        return {
          away: normalizeTeamName(at[1]),
          home: normalizeTeamName(at[2]),
        };
      }

      const vs = line.match(/\/\s*([^/]+?)\s+vs\s+([^/]+?)\s+Odds$/i);
      if (vs) {
        return {
          away: normalizeTeamName(vs[1]),
          home: normalizeTeamName(vs[2]),
        };
      }
    }
  }

  return null;
}

function findDetailMarketStart(lines) {
  const startsInIndex = lines.findIndex((line) => /^Starts In:?$/i.test(line));
  if (startsInIndex === -1) return -1;

  for (let i = startsInIndex; i < Math.min(lines.length, startsInIndex + 300); i += 1) {
    const text = normalizeLine(lines[i]);

    // NBA
    if (
      /^Game$/i.test(text) ||
      /^Points O\/U$/i.test(text) ||
      /^Rebounds O\/U$/i.test(text) ||
      /^Assists O\/U$/i.test(text) ||
      /^Threes O\/U$/i.test(text) ||
      /^Pts \+ Reb \+ Ast O\/U$/i.test(text)
    ) {
      return i;
    }

    // NHL (NEW)
    if (
      /^Game Lines$/i.test(text) ||
      /^Shots on Goal$/i.test(text) ||
      /^Shots on Goal O\/U$/i.test(text) ||
      /^Goals$/i.test(text) ||
      /^Points$/i.test(text) ||
      /^Assists$/i.test(text)
    ) {
      return i;
    }
  }

  return -1;
}

function inferOuMarketType(text) {
  const value = normalizeLine(text);

  // NBA
  if (/^Points O\/U$/i.test(value)) return "player_points";
  if (/^Rebounds O\/U$/i.test(value)) return "player_rebounds";
  if (/^Assists O\/U$/i.test(value)) return "player_assists";
  if (/^Threes O\/U$/i.test(value)) return "player_threes";
  if (/^Pts \+ Reb \+ Ast O\/U$/i.test(value)) return "player_pra";
  if (/^Pts \+ Reb O\/U$/i.test(value)) return "player_points_rebounds";
  if (/^Pts \+ Ast O\/U$/i.test(value)) return "player_points_assists";
  if (/^Reb \+ Ast O\/U$/i.test(value)) return "player_rebounds_assists";

  // NHL
  if (/^Shots on Goal O\/U$/i.test(value)) return "player_shots_on_goal";
  if (/^Goals O\/U$/i.test(value)) return "player_goals";
  if (/^Points O\/U$/i.test(value)) return "player_points";
  if (/^Assists O\/U$/i.test(value)) return "player_assists";
  if (/^Saves O\/U$/i.test(value)) return "player_saves";
  if (/^Power Play Points$/i.test(value)) return "player_power_play_points";

  return "";
}

function parseDraftKingsStandardPlusLadderSections(block, event, context) {
  const rows = [];

  const sections = [
    ["Points", "player_points"],
    ["Threes", "player_threes"],
    ["Rebounds", "player_rebounds"],
    ["Assists", "player_assists"],
    ["Shots on Goal", "player_shots_on_goal"],
    ["Goals", "player_goals"],
    ["Saves", "player_saves"],
    ["Blocks", "player_blocked_shots"],
  ];

  for (const [header, marketType] of sections) {
    const idx = block.findIndex((line) => {
      const text = normalizeLine(line);
      return new RegExp(`^${escapeRegExp(header)}$`, "i").test(text);
    });

    if (idx === -1) continue;

    const end = findNextDraftKingsSectionEnd(block, idx + 1);

    for (let i = idx + 1; i < end; i += 1) {
      const player = normalizeLine(block[i]);

      if (isSectionBreak(player) || isHardStopLine(player)) break;
      if (!looksLikePlayerName(player)) continue;

      let lastPlus = null;
      let consumedIndex = i;

      for (let j = i + 1; j < Math.min(end, i + 80); j += 1) {
        const token = normalizeLine(block[j]);

        if (j > i + 1 && looksLikePlayerName(token)) break;
        if (isSectionBreak(token) || isHardStopLine(token)) break;

        const plus = parsePlusNumber(token);
        if (plus !== null) {
          lastPlus = plus;
          continue;
        }

        const odds = parseAmericanOdds(token);
        if (odds !== null && lastPlus !== null) {
          rows.push(
            makeRow({
              event,
              selection: `${player} | Over`,
              marketType: String(marketType),
              lineValue: lastPlus - 0.5,
              oddsAmerican: odds,
              context,
            })
          );

          consumedIndex = j;
          break;
        }
      }

      i = Math.max(i, consumedIndex);
    }
  }

  return rows;
}

function parseDraftKingsComboSections(block, event, context) {
  const rows = [];
  const sections = [
    ["Pts + Reb + Ast", "player_pra"],
    ["Pts + Reb", "player_points_rebounds"],
    ["Pts + Ast", "player_points_assists"],
    ["Reb + Ast", "player_rebounds_assists"],
  ];

  for (const [header, marketType] of sections) {
    const idx = block.findIndex((line) => {
    const text = normalizeLine(line);
    return new RegExp(`^${escapeRegExp(header)}$`, "i").test(text);
  });
    if (idx === -1) continue;

    const end = findNextDraftKingsSectionEnd(block, idx + 1);

    for (let i = idx + 1; i < end; i += 1) {
      const player = normalizeLine(block[i]);

      // 🚫 Skip section headers
      if (isSectionBreak(player)) continue;

      if (!looksLikePlayerName(player)) continue;

      let lastPlus = null;

      for (let j = i + 1; j < end; j += 1) {
        const token = normalizeLine(block[j]);

        if (looksLikePlayerName(token)) break;
        if (isSectionBreak(token) || isHardStopLine(token)) break;

        const plus = parsePlusNumber(token);
        if (plus !== null) {
          lastPlus = plus;
          continue;
        }

        const odds = parseAmericanOdds(token);
        if (odds !== null && lastPlus !== null) {
          rows.push(
            makeRow({
              event,
              selection: `${player} | Over`,
              marketType: String(marketType),
              lineValue: lastPlus - 0.5,
              oddsAmerican: odds,
              context,
            })
          );
        }
      }
    }
  }

  return rows;
}

function parseDraftKingsYesNoSections(block, event, context) {
  const rows = [];

  const sections = [
    ["Double-Double", "double_double"],
    ["Double Double", "double_double"],
    ["Triple-Double", "triple_double"],
    ["Triple Double", "triple_double"],
  ];

  for (const [header, marketType] of sections) {
    const headerPattern = new RegExp(`^${escapeRegExp(header)}$`, "i");
    const idx = block.findIndex((line) => headerPattern.test(normalizeLine(line)));
    if (idx === -1) continue;

    const end = findNextDraftKingsSectionEnd(block, idx + 1);
    const suffixPattern = new RegExp(`\\s*${escapeRegExp(header)}$`, "i");

    for (let i = idx + 1; i < end - 1; i += 1) {
      const playerLabel = normalizeLine(block[i]);

      if (isSectionBreak(playerLabel) || isHardStopLine(playerLabel)) break;
      if (!suffixPattern.test(playerLabel)) continue;

      const player = playerLabel.replace(suffixPattern, "").trim();
      if (!player) continue;

      let yesIndex = -1;

      for (let j = i + 1; j < Math.min(end, i + 10); j += 1) {
        const token = normalizeLine(block[j]);

        if (/^Yes$/i.test(token)) {
          yesIndex = j;
          break;
        }

        if (suffixPattern.test(token) || isSectionBreak(token) || isHardStopLine(token)) {
          break;
        }
      }

      if (yesIndex === -1) continue;

      let yesOdds = null;
      let consumedIndex = yesIndex;

      for (let j = yesIndex + 1; j < Math.min(end, yesIndex + 18); j += 1) {
        const token = normalizeLine(block[j]);

        if (suffixPattern.test(token) || isSectionBreak(token) || isHardStopLine(token)) {
          break;
        }

        const odds = parseAmericanOdds(token);
        if (odds !== null) {
          yesOdds = odds;
          consumedIndex = j;
          break;
        }
      }

      if (yesOdds === null) continue;

      rows.push(
        makeRow({
          event,
          selection: `${player} | Yes`,
          marketType: String(marketType),
          lineValue: null,
          oddsAmerican: yesOdds,
          context,
        })
      );

      i = Math.max(i, consumedIndex);
    }
  }

  return rows;
}

function findNextDraftKingsSectionEnd(block, startIndex) {
  for (let i = startIndex; i < block.length; i += 1) {
    const text = normalizeLine(block[i]);
    if (isSectionBreak(text) || isHardStopLine(text)) return i;
  }
  return block.length;
}

function parsePlusNumber(text) {
  const value = normalizeLine(text);
  const match = value.match(/^(\d+(?:\.\d+)?)\+$/);
  return match ? Number(match[1]) : null;
}

function parseDraftKingsNhlGoalsSection(block, event, context) {
  const rows = [];

  console.log("DK NHL GOALS BLOCK PREVIEW", block.slice(0, 120));

  for (let i = 0; i < block.length - 5; i += 1) {
    // Anytime / First / Last Goalscorer
    if (
      /^Anytime Goalscorer$/i.test(block[i]) &&
      /^First Goalscorer$/i.test(block[i + 1]) &&
      /^Last Goalscorer$/i.test(block[i + 2])
    ) {
      console.log("DK FOUND GOALSCORER TABLE", {
        index: i,
        header1: block[i],
        header2: block[i + 1],
        header3: block[i + 2],
      });

      for (let j = i + 3; j < block.length - 3; j += 4) {
        const player = block[j];
        const anytimeOdds = parseAmericanOdds(block[j + 1]);
        const firstOdds = parseAmericanOdds(block[j + 2]);
        const lastOdds = parseAmericanOdds(block[j + 3]);

        console.log("DK GOALSCORER ROW CANDIDATE", {
          player,
          anytimeOdds,
          firstOdds,
          lastOdds,
        });

        if (!looksLikePlayerName(player)) break;
        if (anytimeOdds === null) continue;

        rows.push(
          makeRow({
            event,
            selection: `${player} | Over`,
            marketType: "player_goals",
            lineValue: 0.5,
            oddsAmerican: anytimeOdds,
            context,
          })
        );
      }
    }

    // Player Goal Milestones
    if (/^Player Goal Milestones$/i.test(block[i])) {
      console.log("DK FOUND GOAL MILESTONES", { index: i });

      for (let j = i + 1; j < block.length - 2; j += 3) {
        const player = block[j];
        const milestone = normalizeLine(block[j + 1]);
        const odds = parseAmericanOdds(block[j + 2]);

        console.log("DK GOAL MILESTONE CANDIDATE", {
          player,
          milestone,
          odds,
        });

        if (!looksLikePlayerName(player)) break;
        if (!/^\d+\+$/.test(milestone)) continue;
        if (odds === null) continue;

        const goalsNeeded = Number(milestone.replace("+", ""));
        if (!Number.isFinite(goalsNeeded) || goalsNeeded < 1) continue;

        rows.push(
          makeRow({
            event,
            selection: `${player} | Over`,
            marketType: "player_goals",
            lineValue: goalsNeeded - 0.5,
            oddsAmerican: odds,
            context,
          })
        );
      }
    }
  }

  return rows;
}

function isSectionBreak(text) {
  const value = normalizeLine(text);

  return /^(Points|Rebounds|Assists|Threes|Pts \+ Reb \+ Ast|Pts \+ Reb|Pts \+ Ast|Reb \+ Ast|Pts \+ Reb \+ Ast O\/U|Pts \+ Reb O\/U|Pts \+ Ast O\/U|Reb \+ Ast O\/U|Shots on Goal|Shots on Goal O\/U|Goals|Goals O\/U|Points O\/U|Assists O\/U|Saves O\/U|Power Play Points|Goalscorer|Double-Double|Triple-Double|Alternate Spread|Alternate Total|1st Half|1st Quarter|2nd Quarter|2nd Half|3rd Quarter|4th Quarter|Team Totals|Winning Margin|Most Points|Game Props|Team Props|Player Goal Milestones)$/i.test(
    value
  );
}

function makeRow({ event, selection, marketType, lineValue, oddsAmerican, context }) {
  const safeOdds = Number.isFinite(oddsAmerican) ? oddsAmerican : null;

  return {
    id: makeId(),
    batchId: "dk_batch",
    sportsbook: context.sportsbook || "DraftKings",
    sport: inferSportFromText(event),
    league: "",
    eventLabelRaw: event,
    homeTeamRaw: "",
    awayTeamRaw: "",
    homeTeam: "",
    awayTeam: "",
    eventStartTime: "",
    marketType,
    selectionRaw: selection,
    selectionNormalized: selection,
    lineValue: Number.isFinite(lineValue) ? lineValue : null,
    oddsAmerican: safeOdds,
    oddsDecimal: Number.isFinite(safeOdds) ? americanToDecimal(safeOdds) : null,
    marketSide: null,
    confidence: "high",
    parseWarnings: [],
    isSharpSource: false,
    isTargetBook: true,
    excluded: false,
    userEdited: false,
  };
}

function inferSportFromText(text) {
  const t = String(text || "").toLowerCase();
  if (/hornets|magic|warriors|suns|raptors|cavaliers|timberwolves|nuggets|hawks|knicks|rockets|lakers|76ers|celtics|trail blazers|spurs/.test(t)) return "NBA";
  if (/nhl|bruins|rangers|canucks|penguins|oilers|leafs|flames|kings|devils|stars|jets|canadiens|senators|kraken|avalanche/.test(t)) return "NHL";
  if (/yankees|dodgers|phillies|giants|twins|orioles|diamondbacks|mets|braves|astros|mariners|angels|pirates|guardians|cardinals/.test(t)) return "MLB";
  if (/chelsea|arsenal|tottenham|brighton|liverpool|man city|man utd|newcastle|everton|west ham/.test(t)) return "SOCCER";
  return "UNKNOWN";
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/âˆ’/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamName(value) {
  return normalizeLine(value).replace(/\s+Odds$/i, "").trim();
}

function looksLikeTeamLine(text) {
  const value = normalizeLine(text);
  if (!value) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (/^\d/.test(value)) return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(value)) return false;
  if (/^\d{1,2}:\d{2}/.test(value)) return false;
  if (isLikelyNonGameLabel(value)) return false;
  return true;
}

function looksLikePlayerName(text) {
  const value = normalizeLine(text);
  if (!value) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (isLikelyNonGameLabel(value)) return false;
  if (/^(Over|Under|Player)$/i.test(value)) return false;
  if (/^[OU]$/i.test(value)) return false;
  if (/^\d+(\.\d+)?$/.test(value)) return false;
  if (/^[+-]\d{2,5}$/.test(value)) return false;
  if (isSectionBreak(value)) return false;
  return /^[A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)+$/.test(value);
}

function isAtMarker(text) {
  return /^(AT|@|vs\.?|v\.?)$/i.test(normalizeLine(text));
}

function parseAmericanOdds(text) {
  const value = normalizeLine(text);
  if (!/^[+-]\d{2,5}$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSpreadLine(text) {
  const value = normalizeLine(text);
  if (!/^[+-]\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTotalNumber(text) {
  const value = normalizeLine(text);
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isLikelyNonGameLabel(text) {
  return /log in|a-z sports|sportsbook|all odds|sgp|builder|gamescript|stats|quick sgp|my bets|popular|game lines|quick hits|points|rebounds|assists|threes|combos|defense|combined players|either player|h2h player|game leaders|halves|quarters|game props|team props|betting news|more bets|featured|draftkings inc|about draftkings|careers|privacy policy|responsible gaming|how to bet/i.test(
    text
  );
}

function isHardStopLine(text) {
  return /view full article|author|draftkings inc|about draftkings|privacy policy|responsible gaming/i.test(normalizeLine(text));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.sportsbook,
      row.eventLabelRaw,
      row.marketType,
      row.selectionNormalized,
      row.lineValue,
      row.oddsAmerican,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}