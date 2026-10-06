const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
async function load(relative) {
  const context = vm.createContext({ console: { log() {}, warn() {} } });
  const cache = new Map();
  function module(file) {
    if (!cache.has(file)) cache.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return cache.get(file);
  }
  const entry = module(path.join(root, relative));
  await entry.link((name, parent) => { const file = path.resolve(path.dirname(parent.identifier), name); return module(path.extname(file) ? file : file + '.js'); });
  await entry.evaluate();
  return entry.namespace;
}
const propPath = 'app/ev-parlay-lab/utils/parsers/nflPlayerProps.js';
const event = 'Atlanta Falcons @ New Orleans Saints';
const fixture = () => fs.readFileSync(path.join(root, 'tests/fixtures/pinnacle-nfl-atl-no-20261005-user.txt'), 'utf8');
const score = (market, lines, extra = '') => `THESCORE_STRUCTURED_EXPORT\nSport: NFL\nEvent: ${event}\n${extra}Market: ${market}\n${lines}\n`;

test('NFL props: actual October 5 user excerpt yields 57 complete Pinnacle pairs', async () => {
  const { parseNflPlayerProps } = await load(propPath);
  const rows = plain(parseNflPlayerProps(fixture(), 'Pinnacle'));
  assert.equal(rows.length, 114);
  assert.ok(rows.every(r => r.sport === 'NFL' && r.period === 'full_game' && r.isSharpSource && r.eventLabelRaw === event));
  for (const [name, market, line, over, under] of [
    ['Alvin Kamara', 'player_receiving_yards', 15.5, -114, -106],
    ['Bijan Robinson', 'player_rushing_yards', 88.5, -113, -107],
    ['Michael Penix', 'player_passing_yards', 225.5, -110, -110],
    ['Michael Penix', 'player_passing_touchdowns', 1.5, 109, -132],
    ['Michael Penix', 'player_touchdowns', 0.5, 775, -1399],
    ['Tyler Shough', 'player_passing_interceptions', 0.5, -105, -115],
    ['Zachariah Branch', 'player_touchdowns', 0.5, 1099, -2695],
  ]) for (const [side, odds] of [['Over', over], ['Under', under]]) {
    const r = rows.find(r => r.playerName === name && r.marketType === market && r.selectionNormalized.endsWith(side));
    assert.ok(r, `${name} ${market} ${side}`); assert.equal(r.lineValue, line); assert.equal(r.oddsAmerican, odds);
  }
});

test('NFL props: app router preserves six main lines and adds 114 actual props', async () => {
  const { parseOddsText } = await load('app/ev-parlay-lab/utils/parseOddsText.js');
  const rows = plain(parseOddsText(fixture(), { sportsbook: 'Pinnacle' }));
  assert.equal(rows.length, 120);
  assert.equal(new Set(rows.map(r => r.id)).size, 120);
});

test('NFL props: missing prices, mismatched sides/units and partial headers are not borrowed', async () => {
  const { parseNflPlayerProps } = await load(propPath);
  const prefix = `NFL\n${event}\n`;
  const valid = 'Bijan Robinson Total Receiving Yards\nOver 36.5 Receiving Yards\n-110\nUnder 36.5 Receiving Yards\n-110';
  assert.equal(parseNflPlayerProps(prefix + valid, 'Pinnacle').length, 2);
  for (const invalid of [valid.replace('Over 36.5 Receiving Yards\n-110', 'Over 36.5 Receiving Yards\nLocked'), valid.replace('Under 36.5', 'Under 37.5'), valid.replace('Under 36.5 Receiving Yards', 'Under 36.5 Rushing Yards'), valid.replace('Total Receiving Yards\n', 'Total Receiving Yards 1st Half\n')]) assert.equal(parseNflPlayerProps(prefix + invalid, 'Pinnacle').length, 0);
});

test('NFL props: structured pairs normalize common football headings', async () => {
  const { parseNflPlayerProps } = await load(propPath);
  const rows = plain(parseNflPlayerProps(score('Passing Yards (O/U)', 'Michael Penix | OVER | 225.5 | -110\nMichael Penix | UNDER | 225.5 | -110'), 'TheScore'));
  assert.equal(rows.length, 2); assert.equal(rows[0].marketType, 'player_passing_yards');
});

test('NFL props: complete pairs required, unequal/conflicting fields and unsupported periods skipped', async () => {
  const { parseNflPlayerProps: parse } = await load(propPath);
  for (const lines of ['Bijan Robinson | OVER | 88.5 | -110', 'Bijan Robinson | OVER | 88.5 | -110\nBijan Robinson | UNDER | 89.5 | -110', 'Bijan Robinson | OVER | 88.5 | -110\nBijan Robinson | UNDER | 88.5 | Locked', 'Bijan Robinson | OVER | 88.5 | -110\nBijan Robinson | OVER | 88.5 | -115\nBijan Robinson | UNDER | 88.5 | -110']) assert.equal(parse(score('Rushing Yards', lines), 'TheScore').length, 0);
  const pair = 'Bijan Robinson | OVER | 88.5 | -110\nBijan Robinson | UNDER | 88.5 | -110';
  for (const market of ['1st Half Rushing Yards', 'Team Rushing Yards', 'Longest Rush']) assert.equal(parse(score(market, pair), 'TheScore').length, 0);
  assert.equal(parse(score('Rushing Yards', pair, 'Period: 1st_half\n'), 'TheScore').length, 0);
  assert.equal(parse(score('Rushing Yards', pair).replace('Sport: NFL', 'Sport: NCAAF'), 'TheScore').length, 0);
  assert.equal(parse(score('Rushing Yards', pair).replace(event, 'Atlanta Dream @ New York Liberty'), 'TheScore').length, 0);
});

test('NFL props: N+ and anytime touchdowns match O/U without merging passing TDs or first scorer', async () => {
  const { parseNflPlayerProps: parse } = await load(propPath);
  const ladder = plain(parse(score('Receiving Yards', 'Drake London | 80+ | +100\nDrake London | 81+ | +110'), 'TheScore'));
  assert.deepEqual(ladder.map(r => r.lineValue), [79.5, 80.5]);
  const td = plain(parse(score('Anytime Touchdown Scorer', 'Bijan Robinson | YES | -150\nBijan Robinson | NO | +120'), 'TheScore'));
  assert.deepEqual(td.map(r => [r.marketType, r.lineValue, r.selectionNormalized]), [['player_touchdowns', 0.5, 'Bijan Robinson Over'], ['player_touchdowns', 0.5, 'Bijan Robinson Under']]);
  assert.equal(parse(score('First Touchdown Scorer', 'Bijan Robinson | YES | +500'), 'TheScore').length, 0);
});

test('NFL props: later snapshots replace older prices rather than picking best odds', async () => {
  const { parseNflPlayerProps: parse } = await load(propPath);
  const a = score('Receptions', 'Chris Olave | OVER | 6.5 | +110\nChris Olave | UNDER | 6.5 | -140');
  const b = a.replace('+110', '+100').replace('-140', '-130');
  const rows = plain(parse(a + b, 'TheScore'));
  assert.deepEqual(rows.map(r => r.oddsAmerican), [100, -130]);
});

test('NFL props: canonical matching keeps different players separate at identical lines', async () => {
  const { parseOddsText } = await load('app/ev-parlay-lab/utils/parseOddsText.js');
  const { normalizeParsedRows } = await load('app/ev-parlay-lab/utils/normalizeTeams.js');
  const { buildCanonicalMarkets } = await load('app/ev-parlay-lab/utils/matchMarkets.js');
  const p = `NFL\n${event}\nBijan Robinson Total Receiving Yards\nOver 36.5 Receiving Yards\n-110\nUnder 36.5 Receiving Yards\n-110\nDrake London Total Receiving Yards\nOver 36.5 Receiving Yards\n-110\nUnder 36.5 Receiving Yards\n-110`;
  const s = score('Receiving Yards (O/U)', 'Bijan Robinson | OVER | 36.5 | -105\nBijan Robinson | UNDER | 36.5 | -115\nDrake London | OVER | 36.5 | -105\nDrake London | UNDER | 36.5 | -115');
  const rows = [...parseOddsText(p, { sportsbook: 'Pinnacle' }), ...parseOddsText(s, { sportsbook: 'TheScore' })];
  const markets = plain(buildCanonicalMarkets(normalizeParsedRows(rows))).markets;
  assert.equal(markets.length, 2);
  assert.ok(markets.every(m => m.selections.length === 2 && m.selections.every(s => new Set(s.quotes.map(q => q.sportsbook)).size === 2)));
});

// Synthetic DOM only: these tests do not claim current website selectors are verified.
class Element {
  constructor(tag, value = '', attrs = {}, children = []) {
    this.tagName = tag.toUpperCase(); this.value = value; this.attrs = attrs; this.children = children; this.isConnected = true;
    this.disabled = false; this.clicks = 0; this.open = false; this.colSpan = 1; this.rowSpan = 1;
    for (const child of children) child.parentElement = this;
  }
  get innerText() { return this.value || this.children.map(c => c.innerText).join('\n'); }
  get textContent() { return this.innerText; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  getBoundingClientRect() { return { width: this.hidden ? 0 : 100, height: this.hidden ? 0 : 30 }; }
  click() { this.clicks += 1; }
  matches(selector) {
    const attrs = [...selector.matchAll(/\[([^\]=*]+)(\*?=)?"?([^\]"]*)"?\]/g)];
    const base = selector.replace(/\[[^\]]+\]/g, '');
    const [tag, ...classes] = base.split('.');
    return (!tag || this.tagName === tag.toUpperCase()) && classes.every(c => String(this.attrs.class || '').split(' ').includes(c)) &&
      attrs.every(([, key, op, value]) => op === '*=' ? String(this.getAttribute(key) || '').includes(value) : op ? this.getAttribute(key) === value : this.hasAttribute(key));
  }
  closest(selector) { for (let el = this; el; el = el.parentElement) if (selector.split(',').some(s => el.matches(s.trim()))) return el; return null; }
  querySelectorAll(selector) {
    const descendants = []; const visit = el => { for (const child of el.children) { descendants.push(child); visit(child); } }; visit(this);
    return descendants.filter(el => selector.split(',').some(s => {
      const parts = s.trim().split(/\s+/); if (!el.matches(parts.pop())) return false;
      let parent = el.parentElement;
      while (parts.length) { const wanted = parts.pop(); while (parent && !parent.matches(wanted)) parent = parent.parentElement; if (!parent) return false; parent = parent.parentElement; }
      return true;
    }));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const el = (tag, value, attrs, children) => new Element(tag, value, attrs, children);
const button = (label, type, disabled = false) => { const b = el('button', label, type ? { 'data-type': type } : {}); b.disabled = disabled; return b; };
const article = (name, ...buttons) => el('article', '', {}, [el('div', '', {}, [el('header', name, { class: 'text-style-s-medium' }), ...buttons])]);
const drawer = (heading, ...children) => el('details', '', {}, [el('summary', '', {}, [el('h2', heading)]), ...children]);
async function capture(children, options = {}) {
  const url = new URL('https://sportsbook.thescore.bet/sport/football/organization/united-states/competition/nfl/event/test-id#popular');
  const main = el('main', '', {}, [el('h1', options.header ?? 'ATL Falcons @ NO Saints'), ...children]);
  const body = el('body', '', {}, [main]);
  const document = { body, querySelector: s => s === 'main' ? main : body.querySelector(s) };
  const context = vm.createContext({ document, location: url, URL, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), setTimeout: fn => { fn(); return 1; } });
  vm.runInContext(fs.readFileSync(path.join(root, 'ev-parlay-extension/theScoreNflCapture.js'), 'utf8'), context);
  return plain(await context.captureTheScoreNflPropsStep([], '', options.path ?? url.pathname));
}

test('NFL capture: two adjacent players retain their own prices; only the safe tab is clicked', async () => {
  const over = button('O 36.5 -110', 'OVER'), under = button('U 36.5 -115', 'UNDER');
  const passing = button('Passing'), unsafe = button('Rushing', 'LIST');
  const other = el('a', 'Receiving', { href: '/competition/nfl/event/other-id' });
  const d = drawer('Receiving Yards (O/U)', article('Bijan Robinson', over, under), article('Drake London', button('O 80.5 -105', 'OVER'), button('U 80.5 -120', 'UNDER')));
  const r = await capture([d, passing, unsafe, other]);
  assert.ok(r.text.includes('Bijan Robinson | OVER | 36.5 | -110')); assert.ok(r.text.includes('Drake London | UNDER | 80.5 | -120'));
  assert.equal(r.event, event); assert.equal(passing.clicks, 1); assert.equal(unsafe.clicks, 0); assert.equal(other.clicks, 0);
  assert.equal(over.clicks + under.clicks, 0); assert.equal(r.done, false); assert.ok(d.open);
});

test('NFL capture: blank table corner and locked cells do not shift ladder odds', async () => {
  const first = button('+150', 'LIST'), locked = button('+300', 'LIST', true), third = button('+1000', 'LIST');
  const table = el('table', '', {}, [el('thead', '', {}, [el('tr', '', {}, ['', '1+', '2+', '3+'].map(t => el('th', t)))]), el('tbody', '', {}, [el('tr', '', {}, [el('th', 'Bijan Robinson'), ...[first, locked, third].map(b => el('td', '', {}, [b]))])])]);
  const r = await capture([drawer('Touchdowns', table)]);
  assert.ok(r.text.includes('Bijan Robinson | 1+ | +150')); assert.ok(r.text.includes('Bijan Robinson | 3+ | +1000'));
  assert.ok(!r.text.includes('Bijan Robinson | 2+')); assert.equal(first.clicks + locked.clicks + third.clicks, 0);
});

test('NFL capture: ambiguous table columns and conflicting side labels are rejected', async () => {
  const table = el('table', '', {}, [el('thead', '', {}, [el('tr', '', {}, ['1+', '2+', '3+'].map(t => el('th', t)))]), el('tbody', '', {}, [el('tr', '', {}, [el('th', 'Bijan Robinson'), el('td', '', {}, [button('+150', 'LIST')]), el('td', '', {}, [button('+300', 'LIST')])])])]);
  const r = await capture([drawer('Touchdowns', table), drawer('Rushing Yards', article('Bijan Robinson', button('Under 88.5 -110', 'OVER')))]);
  assert.ok(!r.text.includes('Market:')); assert.ok(r.text.includes('THESCORE_NFL_RAW_DRAWER:'));
});

test('NFL capture: wrong event path, unsupported periods and explicit live status stop without clicks', async () => {
  const next = button('Passing');
  for (const r of [await capture([next], { path: '/different' }), await capture([el('button', '1st Half', { role: 'tab', 'aria-selected': 'true' }), next]), await capture([el('div', 'LIVE Q2 12:30', { 'data-testid': 'event-status' }), next])]) assert.ok(r.done && !r.text.includes('Market:'));
  assert.equal(next.clicks, 0);
});

test('NFL capture: unknown event never emits prices', async () => {
  const r = await capture([drawer('Receptions', article('Chris Olave', button('O 6.5 -110', 'OVER'), button('U 6.5 -110', 'UNDER')))], { header: 'Unknown matchup' });
  assert.ok(!r.text.includes('Market:')); assert.ok(r.text.includes('No unambiguous NFL event'));
});
