import { createNflCaptureCore } from './nflCaptureCore';
import { parseNflPlayerProps } from './nflPlayerProps';

const core = createNflCaptureCore();
const books = new Map(['DraftKings', 'FanDuel', 'BetMGM', 'TheScore'].map(book => [book.toLowerCase(), book]));

// A recognized V2 stream must not fall through to a legacy raw-text parser:
// diagnostic samples can contain partial prices or a different selected period.
export function parseNflCapture(text, context = {}) {
  if (!/^NFL_MARKET_V2:|^NFL_CAPTURE_(?:RUN|DIAGNOSTICS):/m.test(text)) return null;
  const rows = new Map();
  const requested = String(context.sportsbook || '').toLowerCase();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('NFL_MARKET_V2: ')) continue;
    let record;
    try { record = JSON.parse(line.slice('NFL_MARKET_V2: '.length)); } catch { continue; }
    const book = books.get(String(record?.book || '').toLowerCase());
    const event = core.eventName(record?.event);
    if (!book || !event || record.period !== 'full_game' || !Array.isArray(record.quotes)) continue;
    if (requested && !['auto', 'manual'].includes(requested) && books.get(requested) !== book) continue;
    for (const quote of core.validQuotes(record.quotes, event)) {
      const row = core.row(book, event, quote);
      // Later complete snapshots replace earlier prices, never take best price.
      rows.set(row.id, row);
    }
  }
  if (/^THESCORE_STRUCTURED_EXPORT$/m.test(text) && (!books.has(requested) || requested === 'thescore')) {
    for (const row of parseNflPlayerProps(text, 'TheScore')) rows.set(row.id, row);
  }
  return [...rows.values()];
}
