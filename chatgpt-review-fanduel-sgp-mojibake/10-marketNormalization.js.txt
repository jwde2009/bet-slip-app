export function normalizeMarketType(value = "") {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return "";

  if (text === "moneyline" || text === "moneyline_2way") return "moneyline_2way";
  if (text === "moneyline_3way" || text === "3-way moneyline") return "moneyline_3way";
  if (text === "spread" || text === "alternate spread") return "spread";
  if (text === "total" || text === "totals" || text === "alternate total points") return "total";

  if (
    text === "player_points" ||
    text === "points o/u" ||
    text === "player points" ||
    text === "points"
  ) return "player_points";

  if (
    text === "player_rebounds" ||
    text === "rebounds o/u" ||
    text === "player rebounds" ||
    text === "rebounds"
  ) return "player_rebounds";

  if (
    text === "player_assists" ||
    text === "assists o/u" ||
    text === "player assists" ||
    text === "assists"
  ) return "player_assists";

  if (
    text === "player_threes" ||
    text === "threes o/u" ||
    text === "player made threes" ||
    text === "player three-pointers" ||
    text === "player three-pointers o/u" ||
    text === "threes" ||
    text === "3-pointers" ||
    text === "3-pointers made"
  ) return "player_threes";

  if (
    text === "player_pra" ||
    text === "pts + reb + ast o/u" ||
    text === "player pts + reb + ast" ||
    text === "player points + rebounds + assists" ||
    text === "pts + reb + ast"
  ) return "player_pra";

  if (
    text === "player_points_rebounds" ||
    text === "player pts + reb" ||
    text === "player points + rebounds" ||
    text === "pts + reb"
  ) return "player_points_rebounds";

  if (
    text === "player_points_assists" ||
    text === "player pts + ast" ||
    text === "player points + assists" ||
    text === "pts + ast"
  ) return "player_points_assists";

  if (
    text === "player_rebounds_assists" ||
    text === "player reb + ast" ||
    text === "player rebounds + assists" ||
    text === "reb + ast"
  ) return "player_rebounds_assists";

  if (
    text === "double_double" ||
    text === "player double-double" ||
    text === "to record a double double" ||
    text === "double-double"
  ) return "double_double";

  if (
    text === "triple_double" ||
    text === "player triple-double" ||
    text === "to record a triple double" ||
    text === "triple-double"
  ) return "triple_double";

  if (text === "player_hits" || text === "hits" || text === "hits o/u") return "player_hits";
  if (text === "player_total_bases" || text === "total bases" || text === "total bases o/u") return "player_total_bases";
  if (text === "player_home_runs" || text === "home runs" || text === "home runs o/u") return "player_home_runs";
  if (text === "player_rbis" || text === "rbis" || text === "rbis o/u") return "player_rbis";
  if (text === "player_runs" || text === "runs" || text === "runs scored" || text === "runs o/u") return "player_runs";
  if (text === "player_stolen_bases" || text === "stolen bases") return "player_stolen_bases";
  if (text === "player_singles" || text === "singles" || text === "singles o/u") return "player_singles";
  if (text === "player_doubles" || text === "doubles" || text === "doubles o/u") return "player_doubles";
  if (text === "player_walks" || text === "walks" || text === "walks o/u") return "player_walks";
  if (text === "player_hits_runs_rbis" || text === "hits + runs + rbis" || text === "hits + runs + rbis o/u") return "player_hits_runs_rbis";

  if (text === "player_strikeouts") return "player_strikeouts";
  if (text === "pitcher_strikeouts" || text === "pitcher strikeouts" || text === "pitcher strikeouts o/u") return "pitcher_strikeouts";
  if (text === "pitcher_outs_recorded" || text === "outs recorded" || text === "outs recorded o/u" || text === "pitching outs") return "pitcher_outs_recorded";
  if (text === "pitcher_hits_allowed" || text === "hits allowed" || text === "hits allowed o/u") return "pitcher_hits_allowed";
  if (text === "pitcher_earned_runs_allowed" || text === "earned runs allowed" || text === "earned runs") return "pitcher_earned_runs_allowed";
  if (text === "pitcher_walks_allowed" || text === "walks allowed" || text === "walks allowed o/u") return "pitcher_walks_allowed";

  if (text === "player_goals" || text === "player goals" || text === "goals") return "player_goals";
  if (text === "player_blocked_shots" || text === "blocked shots" || text === "blocks") return "player_blocked_shots";
  if (text === "player_shots_on_goal" || text === "shots on goal o/u" || text === "player shots" || text === "shots") return "player_shots_on_goal";
  if (text === "player_power_play_points" || text === "player power play points") return "player_power_play_points";
  if (text === "player_saves" || text === "goalie saves" || text === "saves o/u" || text === "saves") return "player_saves";
  if (text === "goalie_goals_against" || text === "goals against") return "goalie_goals_against";
  if (text === "player_shutout" || text === "goalie shutouts" || text === "player shutout") return "player_shutout";
  if (text === "anytime_goalscorer" || text === "anytime_goal_scorer" || text === "any time goal scorer") return "anytime_goalscorer";
  if (text === "both_teams_to_score") return "both_teams_to_score";

  return text;
}

export function isPlayerPropMarket(marketType = "") {
  const normalized = normalizeMarketType(marketType);

  return [
    "player_points",
    "player_assists",
    "player_rebounds",
    "player_threes",
    "player_pra",
    "player_points_rebounds",
    "player_points_assists",
    "player_rebounds_assists",
    "double_double",
    "triple_double",
    "player_hits",
    "player_total_bases",
    "player_home_runs",
    "player_rbis",
    "player_strikeouts",
    "player_shots_on_goal",
    "player_power_play_points",
    "player_saves",
    "goalie_goals_against",
    "player_shutout",
    "anytime_goalscorer",
    "player_runs",
    "player_stolen_bases",
    "player_singles",
    "player_doubles",
    "player_walks",
    "player_hits_runs_rbis",
    "pitcher_strikeouts",
    "pitcher_outs_recorded",
    "pitcher_hits_allowed",
    "pitcher_earned_runs_allowed",
    "pitcher_walks_allowed",
    "player_goals",
    "player_blocked_shots",
  ].includes(normalized);
};