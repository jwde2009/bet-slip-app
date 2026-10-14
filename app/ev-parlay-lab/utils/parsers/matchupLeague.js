import { TEAM_ALIASES_BY_SPORT } from '../../data/teamAliases';

// A pair of known teams is stronger evidence than mixed-league sidebar text.
// Reject city-only/shared nicknames unless the pair resolves to a single league.
export function matchupLeague(away, home) {
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const matches = Object.entries(TEAM_ALIASES_BY_SPORT).filter(([, aliases]) =>
    aliases[key(away)] && aliases[key(home)] && aliases[key(away)] !== aliases[key(home)]);
  return matches.length === 1 ? matches[0][0] : '';
}
