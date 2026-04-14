function addAliases(map, sport, canonical, aliases) {
  if (!map[sport]) map[sport] = {};
  const all = [canonical, ...aliases];

  for (const alias of all) {
    map[sport][String(alias).trim().toLowerCase()] = canonical;
  }
}

export const TEAM_ALIASES_BY_SPORT = {};

export function normalizeTeamNameBySport(name = "", sport = "") {
  const clean = String(name).trim();
  if (!clean) return "";

  const sportKey = String(sport || "").trim().toUpperCase();
  const lower = clean.toLowerCase();

  if (sportKey && TEAM_ALIASES_BY_SPORT[sportKey]?.[lower]) {
    return TEAM_ALIASES_BY_SPORT[sportKey][lower];
  }

  for (const key of Object.keys(TEAM_ALIASES_BY_SPORT)) {
    if (TEAM_ALIASES_BY_SPORT[key][lower]) {
      return TEAM_ALIASES_BY_SPORT[key][lower];
    }
  }

  return clean;
}

/* =========================
   NBA
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Atlanta Hawks", ["atl", "atlanta", "hawks", "atl hawks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Boston Celtics", ["bos", "boston", "celtics", "bos celtics"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Brooklyn Nets", ["bkn", "bk", "brooklyn", "nets", "bkn nets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Charlotte Hornets", ["cha", "charlotte", "hornets", "cha hornets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Chicago Bulls", ["chi", "chicago", "bulls", "chi bulls"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Cleveland Cavaliers", ["cle", "cavs", "cavaliers", "cle cavaliers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Dallas Mavericks", ["dal", "dallas", "mavs", "mavericks", "dal mavericks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Denver Nuggets", ["den", "denver", "nuggets", "den nuggets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Detroit Pistons", ["det", "detroit", "pistons", "det pistons"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Golden State Warriors", ["gs", "gsw", "golden state", "warriors", "gs warriors", "gsw warriors"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Houston Rockets", ["hou", "houston", "rockets", "hou rockets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Indiana Pacers", ["ind", "indy", "indiana", "pacers", "ind pacers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Los Angeles Clippers", ["lac", "la clippers", "clippers", "los angeles clippers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Los Angeles Lakers", ["lal", "la lakers", "lakers", "los angeles lakers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Memphis Grizzlies", ["mem", "memphis", "grizzlies", "mem grizzlies"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Miami Heat", ["mia", "miami", "heat", "mia heat"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Milwaukee Bucks", ["mil", "milwaukee", "bucks", "mil bucks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Minnesota Timberwolves", ["min", "minnesota", "wolves", "timberwolves", "min timberwolves"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "New Orleans Pelicans", ["no", "nop", "new orleans", "pelicans", "nop pelicans"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "New York Knicks", ["ny", "nyk", "new york", "knicks", "ny knicks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Oklahoma City Thunder", ["okc", "oklahoma city", "thunder", "okc thunder"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Orlando Magic", ["orl", "orlando", "magic", "orl magic"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Philadelphia 76ers", ["phi", "philadelphia", "76ers", "sixers", "phi 76ers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Phoenix Suns", ["phx", "phoenix", "suns", "phx suns"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Portland Trail Blazers", ["por", "portland", "blazers", "trail blazers", "por blazers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Sacramento Kings", ["sac", "sacramento", "kings", "sac kings"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "San Antonio Spurs", ["sa", "sas", "san antonio", "spurs", "sas spurs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Toronto Raptors", ["tor", "toronto", "raptors", "tor raptors"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Utah Jazz", ["utah", "uta", "jazz", "uta jazz"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Washington Wizards", ["wsh", "was", "washington", "wizards", "was wizards"]);
// TheScore-style abbreviations (CRITICAL)
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Golden State Warriors", ["gs warriors"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Cleveland Cavaliers", ["cle cavaliers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "San Antonio Spurs", ["sa spurs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "New York Knicks", ["ny knicks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "New Orleans Pelicans", ["no pelicans"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Oklahoma City Thunder", ["okc thunder"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Los Angeles Clippers", ["la clippers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Los Angeles Lakers", ["la lakers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Phoenix Suns", ["phx suns"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Portland Trail Blazers", ["por trail blazers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Charlotte Hornets", ["cha hornets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Philadelphia 76ers", ["phi 76ers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Orlando Magic", ["orl magic"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NBA", "Miami Heat", ["mia heat"]);

/* =========================
   NHL
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Anaheim Ducks", ["ana", "anaheim", "ducks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Boston Bruins", ["bos", "boston", "bruins"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Buffalo Sabres", ["buf", "buffalo", "sabres"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Calgary Flames", ["cgy", "calgary", "flames"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Carolina Hurricanes", ["car", "carolina", "hurricanes", "canes"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Chicago Blackhawks", ["chi", "chicago", "blackhawks", "hawks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Colorado Avalanche", ["col", "colorado", "avalanche", "avs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Columbus Blue Jackets", ["cbj", "columbus", "blue jackets", "jackets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Dallas Stars", ["dal", "dallas", "stars"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Detroit Red Wings", ["det", "detroit", "red wings", "wings"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Edmonton Oilers", ["edm", "edmonton", "oilers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Florida Panthers", ["fla", "florida", "panthers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Los Angeles Kings", ["la", "lak", "kings", "la kings"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Minnesota Wild", ["min", "minnesota", "wild"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Montreal Canadiens", ["mtl", "montreal", "canadiens", "habs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Nashville Predators", ["nsh", "nashville", "predators", "preds"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "New Jersey Devils", ["nj", "njd", "new jersey", "devils"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "New York Islanders", ["nyi", "islanders"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "New York Rangers", ["nyr", "rangers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Ottawa Senators", ["ott", "ottawa", "senators", "sens"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Philadelphia Flyers", ["phi", "philadelphia", "flyers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Pittsburgh Penguins", ["pit", "pittsburgh", "penguins", "pens"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "San Jose Sharks", ["sj", "sjs", "san jose", "sharks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Seattle Kraken", ["sea", "seattle", "kraken"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "St. Louis Blues", ["stl", "st louis", "saint louis", "blues"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Tampa Bay Lightning", ["tb", "tbl", "tampa bay", "lightning", "bolts"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Toronto Maple Leafs", ["tor", "toronto", "maple leafs", "leafs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Utah Hockey Club", ["utah", "utah hockey club", "utah hc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Vancouver Canucks", ["van", "vancouver", "canucks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Vegas Golden Knights", ["vgk", "vegas", "golden knights", "knights"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Washington Capitals", ["wsh", "was", "washington", "capitals", "caps"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NHL", "Winnipeg Jets", ["wpg", "winnipeg", "jets"]);

/* =========================
   MLB
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Arizona Diamondbacks", ["ari", "arizona", "diamondbacks", "dbacks", "d-backs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Atlanta Braves", ["atl", "atlanta", "braves"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Baltimore Orioles", ["bal", "baltimore", "orioles", "o's", "os"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Boston Red Sox", ["bos", "boston", "red sox", "sox"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Chicago Cubs", ["chc", "cubs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Chicago White Sox", ["chw", "cws", "white sox"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Cincinnati Reds", ["cin", "cincinnati", "reds"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Cleveland Guardians", ["cle", "cleveland", "guardians"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Colorado Rockies", ["col", "colorado", "rockies"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Detroit Tigers", ["det", "detroit", "tigers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Houston Astros", ["hou", "houston", "astros"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Kansas City Royals", ["kc", "kcr", "royals"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Los Angeles Angels", ["laa", "angels", "los angeles angels"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Los Angeles Dodgers", ["lad", "dodgers", "los angeles dodgers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Miami Marlins", ["mia", "miami", "marlins"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Milwaukee Brewers", ["mil", "milwaukee", "brewers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Minnesota Twins", ["min", "minnesota", "twins"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "New York Mets", ["nym", "mets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "New York Yankees", ["nyy", "yankees"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Athletics", ["oak", "oakland", "a's", "as", "athletics"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Philadelphia Phillies", ["phi", "phillies"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Pittsburgh Pirates", ["pit", "pirates"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "San Diego Padres", ["sd", "sdp", "padres"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "San Francisco Giants", ["sf", "sfg", "giants"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Seattle Mariners", ["sea", "seattle", "mariners", "ms"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "St. Louis Cardinals", ["stl", "st louis", "saint louis", "cardinals", "cards"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Tampa Bay Rays", ["tb", "tbr", "rays"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Texas Rangers", ["tex", "texas", "rangers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Toronto Blue Jays", ["tor", "toronto", "blue jays", "jays"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLB", "Washington Nationals", ["wsh", "was", "washington", "nationals", "nats"]);

/* =========================
   NFL
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Arizona Cardinals", ["ari", "arizona", "cardinals", "cards"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Atlanta Falcons", ["atl", "atlanta", "falcons"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Baltimore Ravens", ["bal", "baltimore", "ravens"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Buffalo Bills", ["buf", "buffalo", "bills"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Carolina Panthers", ["car", "carolina", "panthers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Chicago Bears", ["chi", "chicago", "bears"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Cincinnati Bengals", ["cin", "cincinnati", "bengals"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Cleveland Browns", ["cle", "cleveland", "browns"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Dallas Cowboys", ["dal", "dallas", "cowboys"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Denver Broncos", ["den", "denver", "broncos"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Detroit Lions", ["det", "detroit", "lions"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Green Bay Packers", ["gb", "packers", "green bay"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Houston Texans", ["hou", "houston", "texans"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Indianapolis Colts", ["ind", "indy", "colts"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Jacksonville Jaguars", ["jax", "jacksonville", "jaguars", "jags"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Kansas City Chiefs", ["kc", "chiefs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Las Vegas Raiders", ["lv", "raiders"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Los Angeles Chargers", ["lac", "chargers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Los Angeles Rams", ["lar", "rams"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Miami Dolphins", ["mia", "miami", "dolphins"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Minnesota Vikings", ["min", "minnesota", "vikings"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "New England Patriots", ["ne", "patriots"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "New Orleans Saints", ["no", "saints"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "New York Giants", ["nyg", "giants"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "New York Jets", ["nyj", "jets"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Philadelphia Eagles", ["phi", "eagles"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Pittsburgh Steelers", ["pit", "steelers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "San Francisco 49ers", ["sf", "49ers", "niners"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Seattle Seahawks", ["sea", "seahawks"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Tampa Bay Buccaneers", ["tb", "bucs", "buccaneers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Tennessee Titans", ["ten", "titans"]);
addAliases(TEAM_ALIASES_BY_SPORT, "NFL", "Washington Commanders", ["wsh", "was", "washington", "commanders"]);

/* =========================
   MLS
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Atlanta United", ["atlanta united"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Austin FC", ["austin", "austin fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Charlotte FC", ["charlotte fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Chicago Fire", ["chicago fire", "fire"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "FC Cincinnati", ["cincinnati", "fc cincinnati"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Colorado Rapids", ["colorado rapids", "rapids"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Columbus Crew", ["columbus crew", "crew"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "D.C. United", ["dc united", "d.c. united"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "FC Dallas", ["fc dallas", "dallas"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Houston Dynamo", ["houston dynamo", "dynamo"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Inter Miami CF", ["inter miami", "miami cf"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "LA Galaxy", ["la galaxy", "galaxy"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Los Angeles FC", ["lafc", "los angeles fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Minnesota United", ["minnesota united"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "CF Montréal", ["montreal", "cf montreal", "cf montréal"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Nashville SC", ["nashville sc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "New England Revolution", ["new england revolution", "revolution", "revs"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "New York City FC", ["nycfc", "new york city fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "New York Red Bulls", ["ny red bulls", "red bulls"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Orlando City SC", ["orlando city", "orlando city sc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Philadelphia Union", ["philadelphia union", "union"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Portland Timbers", ["portland timbers", "timbers"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Real Salt Lake", ["real salt lake", "rsl"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "San Diego FC", ["san diego fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "San Jose Earthquakes", ["san jose earthquakes", "earthquakes", "quakes"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Seattle Sounders FC", ["seattle sounders", "sounders"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Sporting Kansas City", ["sporting kc", "sporting kansas city", "skc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "St. Louis City SC", ["st louis city", "saint louis city", "st. louis city", "city sc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Toronto FC", ["toronto fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "MLS", "Vancouver Whitecaps FC", ["vancouver whitecaps", "whitecaps"]);

/* =========================
   Premier League
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Arsenal", ["arsenal fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Aston Villa", ["villa", "aston villa fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Bournemouth", ["afc bournemouth", "bournemouth"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Brentford", ["brentford fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Brighton & Hove Albion", ["brighton", "brighton and hove albion"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Chelsea", ["chelsea fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Crystal Palace", ["palace", "crystal palace fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Everton", ["everton fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Fulham", ["fulham fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Ipswich Town", ["ipswich", "ipswich town fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Leicester City", ["leicester", "leicester city fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Liverpool", ["liverpool fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Manchester City", ["man city", "manchester city", "mci"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Manchester United", ["man united", "man utd", "manchester united", "mun"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Newcastle United", ["newcastle", "newcastle united fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Nottingham Forest", ["nottingham forest", "forest"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Southampton", ["southampton fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Tottenham Hotspur", ["tottenham", "spurs", "tottenham hotspur fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "West Ham United", ["west ham", "west ham united fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "EPL", "Wolverhampton Wanderers", ["wolves", "wolverhampton", "wolverhampton wanderers"]);

/* =========================
   Bundesliga
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Bayern Munich", ["bayern", "fc bayern", "fc bayern munchen", "fc bayern münchen"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Borussia Dortmund", ["dortmund", "bvb", "borussia dortmund"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "RB Leipzig", ["leipzig", "rbl", "rb leipzig"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Bayer Leverkusen", ["leverkusen", "bayer leverkusen"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Eintracht Frankfurt", ["frankfurt", "eintracht"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "VfB Stuttgart", ["stuttgart", "vfb stuttgart"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "VfL Wolfsburg", ["wolfsburg", "vfl wolfsburg"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Borussia Mönchengladbach", ["gladbach", "monchengladbach", "mönchengladbach"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Werder Bremen", ["bremen", "werder"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "SC Freiburg", ["freiburg"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "TSG Hoffenheim", ["hoffenheim"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "FSV Mainz 05", ["mainz", "mainz 05"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "FC Augsburg", ["augsburg"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Union Berlin", ["union berlin"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "FC Heidenheim", ["heidenheim"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "FC St. Pauli", ["st pauli", "st. pauli"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "Holstein Kiel", ["holstein kiel", "kiel"]);
addAliases(TEAM_ALIASES_BY_SPORT, "BUNDESLIGA", "VfL Bochum", ["bochum"]);

/* =========================
   Ligue 1
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Paris Saint-Germain", ["psg", "paris sg", "paris saint germain"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Marseille", ["om", "olympique de marseille"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Monaco", ["as monaco"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Lille", ["lille osc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Lyon", ["ol", "olympique lyonnais"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Nice", ["ogc nice"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Lens", ["rc lens"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Rennes", ["stade rennes", "rennes"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Reims", ["stade reims"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Strasbourg", ["rc strasbourg"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Nantes", ["fc nantes"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Montpellier", ["montpellier hsc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Toulouse", ["toulouse fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Brest", ["stad brestois", "brest"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Auxerre", ["aj auxerre"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Le Havre", ["le havre ac"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Angers", ["angers sco"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LIGUE1", "Saint-Étienne", ["saint etienne", "st etienne", "saint-étienne"]);

/* =========================
   La Liga
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Real Madrid", ["rm", "real madrid cf"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Barcelona", ["barca", "fc barcelona"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Atlético Madrid", ["atletico madrid", "atleti"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Athletic Club", ["athletic bilbao", "bilbao"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Real Sociedad", ["sociedad", "real sociedad"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Real Betis", ["betis"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Sevilla", ["sevilla fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Villarreal", ["villarreal cf"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Valencia", ["valencia cf"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Getafe", ["getafe cf"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Celta Vigo", ["celta", "celta de vigo"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Osasuna", ["ca osasuna"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Mallorca", ["rcd mallorca"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Rayo Vallecano", ["rayo"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Girona", ["girona fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Alavés", ["alaves", "deportivo alaves", "deportivo alavés"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Las Palmas", ["ud las palmas"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Leganés", ["leganes", "cd leganés"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Espanyol", ["rcd espanyol"]);
addAliases(TEAM_ALIASES_BY_SPORT, "LALIGA", "Real Valladolid", ["valladolid"]);

/* =========================
   Serie A
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Inter Milan", ["inter", "internazionale"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "AC Milan", ["milan", "ac milan"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Juventus", ["juve"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Napoli", ["ssc napoli"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Roma", ["as roma"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Lazio", ["ss lazio"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Atalanta", ["atalanta bc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Bologna", ["bologna fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Fiorentina", ["acf fiorentina"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Torino", ["torino fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Genoa", ["genoa cfc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Monza", ["ac monza"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Udinese", ["udinese calcio"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Lecce", ["us lecce"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Parma", ["parma calcio"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Cagliari", ["cagliari calcio"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Hellas Verona", ["verona", "hellas"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Como", ["como 1907"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Empoli", ["empoli fc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "SERIEA", "Venezia", ["venezia fc"]);

/* =========================
   International Soccer
========================= */
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "United States", ["usa", "usmnt", "united states men", "united states national team"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Mexico", ["mex", "mexico national team"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Canada", ["can", "canada national team"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "England", ["eng"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "France", ["fra"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Germany", ["ger", "deutschland"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Spain", ["esp"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Italy", ["ita"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Portugal", ["por"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Netherlands", ["ned", "holland"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Belgium", ["bel"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Brazil", ["bra"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Argentina", ["arg"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Uruguay", ["uru"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Colombia", ["col"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Croatia", ["cro"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Switzerland", ["sui"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Denmark", ["den"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Poland", ["pol"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Japan", ["jpn"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "South Korea", ["kor", "korea republic"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Australia", ["aus"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Morocco", ["mar"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Nigeria", ["nga"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Egypt", ["egy"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Senegal", ["sen"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Cameroon", ["cmr"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Turkey", ["tur"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Austria", ["aut"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Czech Republic", ["cze"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Sweden", ["swe"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Norway", ["nor"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Serbia", ["srb"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Ukraine", ["ukr"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Chile", ["chi"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Peru", ["per"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Ecuador", ["ecu"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Paraguay", ["par"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Costa Rica", ["crc"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Panama", ["pan"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Jamaica", ["jam"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Saudi Arabia", ["ksa"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Qatar", ["qat"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Iran", ["irn"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Iraq", ["irq"]);
addAliases(TEAM_ALIASES_BY_SPORT, "INTL", "Draw", ["tie", "x"]);