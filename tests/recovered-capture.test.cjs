const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function loadModule(file, bindings = {}) {
  const context = vm.createContext({ console: { log() {}, warn() {} }, setTimeout, clearTimeout, ...bindings });
  const modules = new Map();
  function load(filename) {
    if (!modules.has(filename)) modules.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context, identifier: filename }));
    return modules.get(filename);
  }
  const entry = load(path.join(root, file));
  await entry.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), `${specifier}.js`)));
  await entry.evaluate();
  return entry.namespace;
}
async function parse(raw, context = {}) {
  const { parseDraftKingsText } = await loadModule('app/ev-parlay-lab/utils/parsers/parseDraftKingsText.js');
  return plain(parseDraftKingsText(raw, context));
}

test('October 13 supplied DraftKings MLB capture replays the recovered repair', async () => {
  const rows = await parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(root, 'tests/fixtures/draftkings-mlb-20261013-user.txt.gz'))).toString('utf8'));
  assert.ok(rows.every(r => r.sport === 'MLB' && r.period === 'full_game' && r.eventLabelRaw === 'Cleveland Guardians @ Tampa Bay Rays'));
  assert.equal(rows.find(r => r.selectionRaw === 'Parker Messick Over').oddsAmerican, -117);
  assert.equal(rows.find(r => r.marketType === 'spread' && r.selectionRaw === 'Cleveland Guardians').oddsAmerican, -194);
  assert.equal(new Set(rows.map(r => [r.eventLabelRaw, r.marketType, r.selectionNormalized, r.lineValue].join('|'))).size, 162);
  assert.equal(rows.length, 162);
});
