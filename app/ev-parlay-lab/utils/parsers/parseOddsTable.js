import { americanToDecimal, decimalToAmerican } from '../odds';

const books = new Map(['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'Pinnacle', 'TheScore'].map(b => [b.toLowerCase(), b]));
const markets = {
  MLB: ['moneyline_2way', 'spread', 'total', 'player_hits', 'player_total_bases', 'player_home_runs', 'player_rbis', 'player_runs', 'player_hits_runs_rbis', 'pitcher_strikeouts', 'pitcher_outs_recorded', 'pitcher_hits_allowed', 'pitcher_earned_runs_allowed', 'pitcher_walks_allowed'],
  NHL: ['moneyline_2way', 'moneyline_3way', 'spread', 'total', 'player_goals', 'player_points', 'player_assists', 'player_shots_on_goal', 'player_saves'],
  NFL: ['moneyline_2way', 'spread', 'total', 'player_passing_yards', 'player_passing_touchdowns', 'player_passing_attempts', 'player_passing_completions', 'player_passing_interceptions', 'player_rushing_yards', 'player_rushing_attempts', 'player_receiving_yards', 'player_receptions', 'player_rushing_receiving_yards', 'player_passing_rushing_yards', 'player_touchdowns'],
};
const required = ['league', 'event', 'market', 'period', 'selection', 'line', 'sportsbook', 'odds', 'odds_format', 'odds_type', 'captured_at'];
const iso = value => /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const number = value => /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : NaN;

// RFC 4180 quoting, including tabs/newlines inside quoted fields. No formula evaluation.
function records(text, delimiter) {
  const rows = []; let row = [], value = '', quoted = false, endedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; endedQuote = true; }
      else value += c;
    } else if (c === delimiter || c === '\n' || c === '\r') {
      row.push(value.trim()); value = ''; endedQuote = false;
      if (c !== delimiter) { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else if (c === '"' && !value && !endedQuote) quoted = true;
    else if (endedQuote || c === '"') throw new Error('Malformed quoted field.');
    else value += c;
  }
  if (quoted) throw new Error('Unclosed quoted field.');
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function isOddsTable(text) {
  const header = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  return /(?:^|[,\t])league(?:[,\t]|$)/i.test(header) && /(?:^|[,\t])odds_format(?:[,\t]|$)/i.test(header);
}

export function inspectOddsTable(rawText) {
  const diagnostics = { accepted: 0, skipped: 0, duplicates: 0, errors: [] };
  const fail = (row, message) => { diagnostics.skipped++; if (diagnostics.errors.length < 20) diagnostics.errors.push(`Row ${row}: ${message}`); };
  let data;
  try {
    const text = String(rawText || '').replace(/^\uFEFF/, '');
    if (text.length > 5_000_000) throw new Error('File exceeds the 5 MB import limit.');
    data = records(text, text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',');
  } catch (error) { diagnostics.errors.push(error.message); return { rows: [], diagnostics }; }
  const header = (data.shift() || []).map(s => s.toLowerCase());
  const missing = required.filter(name => !header.includes(name));
  if (missing.length || new Set(header).size !== header.length) {
    diagnostics.errors.push(missing.length ? `Missing columns: ${missing.join(', ')}.` : 'Duplicate column names.');
    return { rows: [], diagnostics };
  }
  const quotes = new Map();
  for (let index = 0; index < data.length; index++) {
    const cells = data[index], n = index + 2;
    if (cells.length !== header.length) { fail(n, 'Column count differs from the header.'); continue; }
    const r = Object.fromEntries(header.map((name, i) => [name, cells[i]]));
    const league = r.league.toUpperCase(), sportsbook = books.get(r.sportsbook.toLowerCase());
    const main = ['spread', 'total', 'moneyline_2way', 'moneyline_3way'].includes(r.market);
    const moneyline = r.market.startsWith('moneyline_');
    const line = r.line === '' ? null : number(r.line);
    if (!markets[league]?.includes(r.market) || !sportsbook) { fail(n, 'Unsupported league, market or sportsbook.'); continue; }
    // Preserve explicit segments. Never reinterpret a regulation price as full-game.
    if (!['full_game', 'regulation', '1st_half', '1st_quarter', '1st_period', '1st_5_innings'].includes(r.period) ||
        r.period === 'regulation' && league !== 'NHL' || r.period === '1st_period' && league !== 'NHL' ||
        r.period === '1st_5_innings' && league !== 'MLB' || /half|quarter/.test(r.period) && league !== 'NFL') {
      fail(n, 'Unsupported or ambiguous period.'); continue;
    }
    if (r.odds_type.toLowerCase() !== 'listed') { fail(n, 'Only listed sportsbook prices are importable; true/fair odds are not offered prices.'); continue; }
    if (!iso(r.captured_at) || r.event_start && !iso(r.event_start)) { fail(n, 'Timestamp requires an ISO date/time with timezone.'); continue; }
    const teams = r.event.split(/\s+@\s+/);
    if (teams.length !== 2 || teams.some(t => !t.trim()) || teams[0] === teams[1]) { fail(n, 'Event must be Away @ Home.'); continue; }
    if (moneyline ? line !== null : line === null || !Number.isFinite(line) || r.market !== 'spread' && line < 0) { fail(n, 'Missing or invalid market line.'); continue; }
    if ((r.market === 'spread' || moneyline) && !teams.includes(r.selection) && !(r.market === 'moneyline_3way' && r.selection === 'Draw') ||
        (!main || r.market === 'total') && !['Over', 'Under'].includes(r.selection) || !main && !r.participant) {
      fail(n, 'Selection or participant is missing or inconsistent with the market.'); continue;
    }
    const format = r.odds_format.toLowerCase();
    const originalOdds = number(r.odds.replace(/\u2212/g, '-'));
    if (format === 'american' ? !Number.isInteger(originalOdds) || Math.abs(originalOdds) < 100 || Math.abs(originalOdds) > 1000000
      : format !== 'decimal' || !Number.isFinite(originalOdds) || originalOdds <= 1 || originalOdds > 10001) {
      fail(n, 'Invalid odds or unsupported odds_format (use american or decimal).'); continue;
    }
    const oddsAmerican = format === 'american' ? originalOdds : decimalToAmerican(originalOdds);
    const selection = main ? r.selection : `${r.participant} ${r.selection}`;
    const key = JSON.stringify([sportsbook, league, r.event, r.event_start || '', r.period, r.market, selection, line]);
    const old = quotes.get(key);
    if (old) {
      diagnostics.duplicates++;
      if (Date.parse(old.capturedAt) > Date.parse(r.captured_at)) continue;
      const decimal = format === 'decimal' ? originalOdds : americanToDecimal(oddsAmerican);
      if (Date.parse(old.capturedAt) === Date.parse(r.captured_at) && Math.abs(old.oddsDecimal - decimal) > 1e-10) {
        old.excluded = true; old.parseWarnings = ['Conflicting prices at the same timestamp; excluded.'];
        fail(n, 'Conflicting duplicate price at the same timestamp.'); continue;
      }
      if (old.excluded && Date.parse(old.capturedAt) === Date.parse(r.captured_at)) continue;
    }
    const sharp = sportsbook === 'Pinnacle';
    quotes.set(key, {
      id: `table_${index}`, sportsbook, league, sport: league, eventLabelRaw: r.event,
      eventStart: r.event_start || null, marketType: r.market, period: r.period,
      selectionRaw: selection, selectionNormalized: selection, playerName: main ? undefined : r.participant,
      lineValue: line, oddsAmerican, oddsDecimal: format === 'decimal' ? originalOdds : americanToDecimal(oddsAmerican),
      originalOdds: r.odds, originalOddsFormat: format, oddsType: 'listed', capturedAt: r.captured_at, loadedAt: r.captured_at,
      source: r.source || 'Manual odds table', sourceType: 'odds_table',
      confidence: 'medium', parseWarnings: ['User-provided table; current price and market rules have not been verified.', ...(r.period !== 'full_game' ? ['Non-full-game price retained for review and excluded from calculations.'] : [])],
      isSharpSource: sharp, isTargetBook: !sharp, batchRole: sharp ? 'fair_odds' : 'target', excluded: r.period !== 'full_game', userEdited: false,
    });
  }
  const rows = [...quotes.values()]; diagnostics.accepted = rows.filter(r => !r.excluded).length;
  return { rows, diagnostics };
}

export function parseOddsTable(text) {
  const { rows, diagnostics } = inspectOddsTable(text);
  if (!rows.length) throw new Error(`Odds table: ${diagnostics.errors.join(' ') || 'No priced rows.'}`);
  rows.importDiagnostics = diagnostics;
  return rows;
}

export function mergeOddsTableImports(existing, incoming) {
  if (!incoming.some(row => row.sourceType === "odds_table")) return existing;
  const identity = row => JSON.stringify([row.sportsbook, row.sport, row.eventLabelRaw, row.eventStart || '', row.period || 'full_game', row.marketType, row.selectionNormalized, row.lineValue]);
  const ordinary = existing.filter(row => row.sourceType !== 'odds_table');
  const tables = new Map(existing.filter(row => row.sourceType === 'odds_table').map(row => [identity(row), row]));
  for (const row of incoming) {
    if (row.sourceType !== 'odds_table') continue;
    const key = identity(row), old = tables.get(key);
    if (old && Date.parse(old.capturedAt) > Date.parse(row.capturedAt)) continue;
    if (old && Date.parse(old.capturedAt) === Date.parse(row.capturedAt)) {
      if (Math.abs(old.oddsDecimal - row.oddsDecimal) > 1e-10) {
        tables.set(key, {...row, excluded:true, parseWarnings:['Conflicting prices at the same timestamp across imports; excluded.']});
      } else if (row.excluded && !old.excluded) tables.set(key, row);
      continue;
    }
    tables.set(key, row);
  }
  return [...ordinary, ...tables.values()];
}
