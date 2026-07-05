export function detectLeague({ cleaned, marketDetail, fixtureEvent, selection, isParlay }) {
  const text = [cleaned, marketDetail, fixtureEvent, selection]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasBaseball =
    /\bmlb\b|baseball|world baseball|wbc|run line|batter props|pitcher props|home runs|rbis|hits|strikeouts|earned runs|braves|twins|yankees|mets|dodgers|padres|guardians|astros|mariners|cardinals|cubs|giants|phillies|diamondbacks|tigers|orioles|red sox|blue jays|rays|brewers|pirates|reds|angels|rockies|marlins|nationals|athletics|a's/.test(
      text
    );

  const hasNBA =
    /\bnba\b|player threes|player rebounds|player assists|double-double|triple-double|points o\/u|rebounds o\/u|assists o\/u|three pointers|combos|points - 1st|moneyline 1st half|celtics|cavaliers|bulls|hawks|bucks|clippers|pacers|thunder|spurs|rockets|trail blazers|warriors|lakers|kings|suns|mavericks|timberwolves|nuggets|grizzlies|pelicans|jazz|heat|knicks|nets|hornets|magic|raptors|pistons|wizards|76ers/.test(
      text
    );

  const hasNCAAM =
    /\bncaam\b|college basketball|cbb \(m\)|men'?s college basketball|march madness|top 25/.test(
      text
    );

  const hasNCAAW =
    /college basketball \(w\)|cbb \(w\)|\bncaaw\b|women'?s college basketball/.test(
      text
    );

  const hasNHL =
    /\bnhl\b|hockey|goalscorer|shots on goal|puck line|blues|wild|canucks|flames|flyers|blackhawks|kings|ducks|jets|stars|sharks|capitals|canadiens|sabres|penguins|hurricanes|oilers|mammoth|maple leafs|senators|rangers|islanders|devils|bruins|kraken|predators|panthers|avalanche|lightning/.test(
      text
    );

  const hasTennis =
    /\btennis\b|\batp\b|\bwta\b|total games|games spread|match lines|doubles/.test(
      text
    ) ||
    (/\bvs\b/.test(text) && /\//.test(text));

  const hasSoccer =
    /\bsoccer\b|\bmls\b|\bucl\b|featured soccer|champions league|premier league|la liga|serie a|bundesliga|ligue 1|concacaf|orlando city|inter miami|lafc|chelsea|barcelona|club america|whitecaps|timbers|union/.test(
      text
    );

  const hasMMA =
    /\bufc\b|\bmma\b|fight lines|ko\/tko\/dq|submission|decision/.test(text);

  const hits = [
    hasBaseball,
    hasNBA,
    hasNCAAM,
    hasNCAAW,
    hasNHL,
    hasTennis,
    hasSoccer,
    hasMMA,
  ].filter(Boolean).length;

  if (isParlay && hits > 1) return "Multi";
  if (hasNCAAW) return "NCAAW";
  if (hasNCAAM) return "NCAAM";
  if (hasNBA) return "NBA";
  if (hasNHL) return "NHL";
  if (hasBaseball) return "Baseball";
  if (hasMMA) return "MMA";
  if (hasTennis) return "Tennis";
  if (hasSoccer) return "Soccer";
  return "";
}