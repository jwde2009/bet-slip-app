// app/utils/canonicalTeamNames.js

function cleanValue(value = "") {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_ALIAS_RULES = [
  // NBA
  { regex: /\bGSW\b|\bGolden State\b|\bGolden St\b|\bWarriors\b/gi, canonical: "Golden State Warriors" },
  { regex: /\bOKC\b|\bOklahoma City\b|\bThunder\b/gi, canonical: "Oklahoma City Thunder" },
  { regex: /\bDAL\b|\bDallas\b|\bMavs\b|\bMavericks\b/gi, canonical: "Dallas Mavericks" },
  { regex: /\bMIN\b|\bMinnesota\b|\bT[- ]?Wolves\b|\bTWolves\b|\bTimberwolves\b/gi, canonical: "Minnesota Timberwolves" },
  { regex: /\bNY Knicks\b|\bKnicks\b/gi, canonical: "New York Knicks" },
  { regex: /\bBKN\b|\bBrooklyn\b|\bNets\b/gi, canonical: "Brooklyn Nets" },
  { regex: /\bPHX\b|\bPhoenix\b|\bSuns\b/gi, canonical: "Phoenix Suns" },
  { regex: /\bLAL\b|\bLakers\b/gi, canonical: "Los Angeles Lakers" },
  { regex: /\bLAC\b|\bClippers\b/gi, canonical: "Los Angeles Clippers" },
  { regex: /\bMIL\b|\bBucks\b/gi, canonical: "Milwaukee Bucks" },
  { regex: /\bBOS\b|\bCeltics\b/gi, canonical: "Boston Celtics" },
  { regex: /\bDEN\b|\bNuggets\b/gi, canonical: "Denver Nuggets" },
  { regex: /\bMEM\b|\bGrizzlies\b/gi, canonical: "Memphis Grizzlies" },
  { regex: /\bNOP\b|\bPelicans\b/gi, canonical: "New Orleans Pelicans" },
  { regex: /\bSAC\b|\bKings\b/gi, canonical: "Sacramento Kings" },
  { regex: /\bPOR\b|\bBlazers\b|\bTrail Blazers\b/gi, canonical: "Portland Trail Blazers" },
  { regex: /\bHOU\b|\bRockets\b/gi, canonical: "Houston Rockets" },
  { regex: /\bSAS\b|\bSpurs\b/gi, canonical: "San Antonio Spurs" },
  { regex: /\bUTA\b|\bJazz\b/gi, canonical: "Utah Jazz" },
  { regex: /\bCHI\b|\bBulls\b/gi, canonical: "Chicago Bulls" },
  { regex: /\bCLE\b|\bCavaliers\b|\bCavs\b/gi, canonical: "Cleveland Cavaliers" },
  { regex: /\bDET\b|\bPistons\b/gi, canonical: "Detroit Pistons" },
  { regex: /\bIND\b|\bPacers\b/gi, canonical: "Indiana Pacers" },
  { regex: /\bMIA\b|\bHeat\b/gi, canonical: "Miami Heat" },
  { regex: /\bORL\b|\bMagic\b/gi, canonical: "Orlando Magic" },
  { regex: /\bATL\b|\bHawks\b/gi, canonical: "Atlanta Hawks" },
  { regex: /\bCHA\b|\bHornets\b/gi, canonical: "Charlotte Hornets" },
  { regex: /\bWAS\b|\bWizards\b/gi, canonical: "Washington Wizards" },
  { regex: /\bPHI\b|\b76ers\b|\bSixers\b/gi, canonical: "Philadelphia 76ers" },
  { regex: /\bTOR\b|\bRaptors\b/gi, canonical: "Toronto Raptors" },

  // NHL
  { regex: /\bNY Rangers\b|\bRangers\b/gi, canonical: "New York Rangers" },
  { regex: /\bPanthers\b/gi, canonical: "Florida Panthers" },
  { regex: /\bBruins\b/gi, canonical: "Boston Bruins" },
  { regex: /\bLeafs\b|\bMaple Leafs\b/gi, canonical: "Toronto Maple Leafs" },
  { regex: /\bCanadiens\b|\bHabs\b/gi, canonical: "Montreal Canadiens" },
  { regex: /\bOilers\b/gi, canonical: "Edmonton Oilers" },
  { regex: /\bFlames\b/gi, canonical: "Calgary Flames" },
  { regex: /\bCanucks\b/gi, canonical: "Vancouver Canucks" },
  { regex: /\bAvalanche\b|\bAvs\b/gi, canonical: "Colorado Avalanche" },
  { regex: /\bStars\b/gi, canonical: "Dallas Stars" },
  { regex: /\bGolden Knights\b|\bVGK\b/gi, canonical: "Vegas Golden Knights" },

  // NFL
  { regex: /\bChiefs\b|\bKC Chiefs\b/gi, canonical: "Kansas City Chiefs" },
  { regex: /\b49ers\b|\bNiners\b/gi, canonical: "San Francisco 49ers" },
  { regex: /\bCowboys\b/gi, canonical: "Dallas Cowboys" },
  { regex: /\bPackers\b/gi, canonical: "Green Bay Packers" },
  { regex: /\bBears\b/gi, canonical: "Chicago Bears" },
  { regex: /\bLions\b/gi, canonical: "Detroit Lions" },
  { regex: /\bEagles\b/gi, canonical: "Philadelphia Eagles" },
  { regex: /\bBills\b/gi, canonical: "Buffalo Bills" },

  // MLB
  { regex: /\bYankees\b/gi, canonical: "New York Yankees" },
  { regex: /\bMets\b/gi, canonical: "New York Mets" },
  { regex: /\bDodgers\b/gi, canonical: "Los Angeles Dodgers" },
  { regex: /\bAngels\b/gi, canonical: "Los Angeles Angels" },
  { regex: /\bCubs\b/gi, canonical: "Chicago Cubs" },
  { regex: /\bWhite Sox\b/gi, canonical: "Chicago White Sox" },
  { regex: /\bRed Sox\b/gi, canonical: "Boston Red Sox" },
  { regex: /\bCardinals\b/gi, canonical: "St. Louis Cardinals" },
];

function replaceWholeAlias(text, regex, canonical) {
  return text.replace(regex, canonical);
}

export function canonicalizeTeamName(name = "") {
  const cleaned = cleanValue(name);
  if (!cleaned) return "";

  // Avoid over-normalizing long NCAA-like names that are already specific.
  const looksSpecificCollegeName =
    /\b(State|University|College|A&M|Tech|St\.|Saint)\b/i.test(cleaned) &&
    cleaned.split(/\s+/).length >= 2;

  if (looksSpecificCollegeName) {
    return cleaned;
  }

  let result = cleaned;
  for (const rule of TEAM_ALIAS_RULES) {
    if (rule.regex.test(result)) {
      result = replaceWholeAlias(result, rule.regex, rule.canonical);
      break;
    }
  }

  return cleanValue(result);
}

export function canonicalizeTeamsInText(text = "") {
  let result = cleanValue(text);
  if (!result) return "";

  for (const rule of TEAM_ALIAS_RULES) {
    result = replaceWholeAlias(result, rule.regex, rule.canonical);
  }

  return cleanValue(result);
}