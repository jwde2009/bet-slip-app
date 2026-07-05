export function detectLeague({ cleaned, marketDetail, fixtureEvent, selection, isParlay }) {
  const text = [cleaned, marketDetail, fixtureEvent, selection]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasBaseball =
    /\bmlb\b|baseball|world baseball|chinese taipei|wbc|run line|batter props|pitcher props|home runs?|rbis?|hits|strikeouts|strikeouts thrown|earned runs|total bases|braves|twins|yankees|mets|dodgers|padres|guardians|astros|mariners|cardinals|cubs|giants|phillies|diamondbacks|dbacks|tigers|orioles|red sox|blue jays|rays|brewers|pirates|reds|angels|rockies|marlins|nationals|athletics|a's|panama|czech republic|dominican republic/.test(
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

  const hasWNBA =
    /\bwnba\b|chicago sky|atlanta dream|minnesota lynx|dallas wings|indiana fever|phoenix mercury|las vegas aces|new york liberty|connecticut sun|seattle storm|washington mystics|los angeles sparks|golden state valkyries|portland fire/.test(
      text
    );

  const hasCollegeBasketballTeam =
    /utah state|villanova|mcneese state|vanderbilt|rutgers|michigan state|ucla|connecticut|uconn|high point|arkansas|duke|kentucky|illinois|vcu|north carolina|nc state|houston cougars|alabama crimson tide|auburn|tennessee|gonzaga|purdue|kansas|baylor|iowa state|marquette|creighton|arizona|wisconsin|maryland|st john'?s|texas tech|florida gators|ole miss|missouri|mississippi state/.test(
      text
    );

  const hasNHL =
    /\bnhl\b|hockey|goalscorer|goal scorer|anytime goal|anytime goalscorer|total goals|shots on goal|puck line|blues|wild|canucks|flames|flyers|blackhawks|kings|ducks|jets|stars|sharks|capitals|canadiens|sabres|penguins|hurricanes|oilers|mammoth|maple leafs|senators|rangers|islanders|devils|bruins|kraken|predators|panthers|avalanche|lightning/.test(
      text
    );

  const hasTennis =
    /\btennis\b|\batp\b|\bwta\b|total games|games spread|match lines|doubles|normal, natural, or intended end|completed point|governing body|progressing to the next round/.test(
      text
    ) ||
    (/\bvs\b/.test(text) && /\//.test(text));

  const hasSoccer =
    /\bsoccer\b|\bmls\b|\bucl\b|featured soccer|champions league|premier league|la liga|serie a|bundesliga|ligue 1|chicago fire|concacaf|sporting kc|sporting kansas city|orlando city|inter miami|lafc|chelsea|barcelona|club america|whitecaps|timbers|union|draw|man city|new york city|nycfc|dc united|fc bayern|bayern|stuttgart|paris saint-germain|psg|stade brest/.test(
      text
    );

  const hasMMA =
    /\bufc\b|\bmma\b|fight lines|ko\/tko\/dq|fight result|method of victory|submission|decision/.test(text);

  const hits = [
    hasBaseball,
    hasNBA,
    hasNCAAM,
    hasNCAAW,
    hasWNBA,
    hasCollegeBasketballTeam,
    hasNHL,
    hasTennis,
    hasSoccer,
    hasMMA,
  ].filter(Boolean).length;

  if (isParlay && hits > 1) return "Multi";
  if (hasNCAAW) return "NCAAW";
  if (hasNCAAM || hasCollegeBasketballTeam) return "NCAAM";
  if (hasWNBA) return "WNBA";
  if (hasBaseball) return "Baseball";

  // Soccer team/league clues should beat generic "total goals" hockey wording.
  if (hasSoccer) return "Soccer";

  if (hasNHL) return "NHL";
  if (hasNBA) return "NBA";
  if (hasMMA) return "MMA";
  if (hasTennis) return "Tennis";
  return "";
}