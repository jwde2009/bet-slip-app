import { americanToDecimal, decimalToAmerican } from '../odds';
import { matchupLeague } from './matchupLeague';

// Keep price representations distinct: displayed decimals are authoritative;
// the aria price is retained as evidence, never used to infer a market or row.
export function parsePinnacleMlbDom(raw, parseLegacy) {
  let packet;
  try { packet = JSON.parse(raw.slice('PINNACLE_MLB_DOM_V1: '.length)); } catch { return []; }
  if (packet?.version !== 1 || !Array.isArray(packet.panels) || packet.panels.length > 80 || !Number.isFinite(Date.parse(packet.capturedAt))) return [];
  const match = String(packet.url || '').match(/^https:\/\/(?:[a-z0-9-]+\.)*pinnacle\.com\/en\/baseball\/mlb\/([^/]+)-vs-([^/]+)\/\d+\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/i);
  if (!match) return [];
  const team = slug => slug.split('-').map(s => s[0]?.toUpperCase() + s.slice(1)).join(' ');
  const away = team(match[1]), home = team(match[2]);
  if (matchupLeague(away, home) !== 'MLB') return [];
  const event = `${away} @ ${home}`;
  const warnings = Array.isArray(packet.diagnostics) ? packet.diagnostics.filter(s => typeof s === 'string').slice(0, 100) : [];
  const rows = typeof packet.mainText === 'string' && !packet.mainText.includes('PINNACLE_MLB_DOM_V1:')
    ? parseLegacy(packet.mainText).filter(r => r.sport === 'MLB' && r.eventLabelRaw === event && ['spread','total','moneyline_2way'].includes(r.marketType)).map(r => ({...r, capturedAt: packet.capturedAt, period: 'full_game', sourceUrl: packet.url, parseWarnings: [...(r.parseWarnings || []), ...warnings]})) : [];
  const categories = [
    ['Bases', 'player_total_bases', 'Bases'], ['Strikeouts', 'pitcher_strikeouts', 'Strikeouts'],
    ['Home Runs', 'player_home_runs', 'Home Runs'], ['Hits Allowed', 'pitcher_hits_allowed', 'Hits Allowed'],
    ['Earned Runs', 'pitcher_earned_runs_allowed', 'Earned Runs'], ['Pitching Outs', 'pitcher_outs_recorded', 'Pitching Outs'],
    ['Hits', 'player_hits', 'Hits'], ['Runs Batted In', 'player_rbis', 'RBIs|Runs Batted In'],
    ['RBIs', 'player_rbis', 'RBIs|Runs Batted In'], ['Runs', 'player_runs', 'Runs'], ['Walks Allowed', 'pitcher_walks_allowed', 'Walks Allowed'],
  ];
  const groups = new Map();
  let duplicateCount = 0;
  const quoteCount = packet.panels.reduce((n, p) => n + (Array.isArray(p?.quotes) ? p.quotes.length : 0), 0);
  const mainCount = rows.length;
  for (const panel of packet.panels) {
    if (typeof panel?.title !== 'string' || !Array.isArray(panel.quotes) || panel.quotes.length > 200 || /\b(?:inning|half|period|live|first|last)\b/i.test(panel.title)) continue;
    const category = categories.find(([label]) => panel.title.endsWith(` Total ${label}`));
    if (!category) continue;
    const [suffix, marketType, unit] = category;
    const player = panel.title.slice(0, -` Total ${suffix}`.length).trim();
    if (!/^[\p{L}][\p{L}\p{M} .’'()-]+$/u.test(player)) continue;
    for (const quote of panel.quotes) {
      const selection = String(quote?.label || '').match(new RegExp(`^(Over|Under) (\\d+(?:\\.\\d+)?) (?:${unit})$`, 'i'));
      if (!selection || typeof quote.price !== 'string') continue;
      const side = selection[1].toLowerCase() === 'over' ? 'Over' : 'Under';
      const line = Number(selection[2]);
      if (!Number.isFinite(line) || line < 0 || line > 200) continue;
      const american = /^[+-]\d{3,6}$/.test(quote.price);
      const decimal = /^\d+\.\d+$/.test(quote.price);
      if (!american && !decimal) continue;
      const price = Number(quote.price);
      const oddsDecimal = american ? americanToDecimal(price) : price;
      if (!Number.isFinite(oddsDecimal) || oddsDecimal <= 1 || oddsDecimal > 1001 || american && Math.abs(price) < 100) continue;
      const key = [player, marketType, line].join('|');
      if (!groups.has(key)) groups.set(key, new Map());
      const group = groups.get(key);
      const previous = group.get(side);
      if (previous && previous.oddsDecimal !== oddsDecimal) { group.set('conflict', true); continue; }
      if (previous) duplicateCount++;
      const aria = String(quote.ariaLabel || '').match(/^Money Line ([+-]?\d+)$/i);
      group.set(side, {
        id: `pin_dom_${encodeURIComponent(event + "|" + key + "|" + packet.capturedAt)}_${side}`, sportsbook: 'Pinnacle', sport: 'MLB', league: 'MLB', eventLabelRaw: event,
        marketType, selectionRaw: `${player} ${side}`, selectionNormalized: `${player} ${side}`, participant: player,
        lineValue: line, oddsDecimal, oddsAmerican: american ? price : decimalToAmerican(price),
        sourceType: 'pinnacle_dom', source: 'Pinnacle rendered market', oddsType: 'listed',
        originalOdds: quote.price, originalOddsFormat: american ? 'american' : 'decimal', ariaOddsAmerican: aria ? Number(aria[1]) : null,
        isSharpSource: true, isTargetBook: false, batchRole: 'sharp', period: 'full_game',
        capturedAt: Number.isFinite(Date.parse(panel.capturedAt)) ? panel.capturedAt : packet.capturedAt, sourceUrl: packet.url, confidence: 'high', parseWarnings: [...warnings],
      });
    }
  }
  for (const [key, group] of groups) {
    if (!group.has('conflict') && group.has('Over') && group.has('Under')) rows.push(group.get('Over'), group.get('Under'));
    else if (warnings.length < 100) warnings.push(`Skipped incomplete or conflicting pair: ${key}`);
  }
  rows.forEach(row => { row.parseWarnings = [...warnings]; });
  rows.importDiagnostics = { accepted: rows.length, duplicates: duplicateCount,
    skipped: Math.max(0, quoteCount - (rows.length - mainCount) - duplicateCount), errors: warnings.slice(0, 20) };
  return rows;
}
