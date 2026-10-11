const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const filename = path.resolve(__dirname, "../app/ev-parlay-lab/utils/quickSgpDiscovery.js");
async function load() {
  const context = vm.createContext({});
  const mod = new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), { context, identifier: filename });
  await mod.link(() => { throw Error("unexpected import"); });
  await mod.evaluate();
  return mod.namespace;
}
const fixture = [
  ["moneyline_2way", "Baltimore Ravens", null, 2.45],
  ["moneyline_2way", "Atlanta Falcons", null, 1.6],
  ["total", "Over", 37.5, 1.5],
  ["total", "Under", 37.5, 3.1],
].map(([marketType, selectionNormalized, lineValue, oddsDecimal]) => ({
  sport: "NFL", period: "full_game", sportsbook: "TestBook",
  eventLabelRaw: "Baltimore Ravens @ Atlanta Falcons",
  marketType, selectionNormalized, lineValue, oddsDecimal,
}));

test("one-line promotion parses profit boost and stake cap", async () => {
  const { parseQuickSgpPromotion, boostedSgpDecimal } = await load();
  const result = parseQuickSgpPromotion("SGP parlay 20% odds boost max $250");
  assert.equal(result.boostPct, 20);
  assert.equal(result.maxStake, 250);
  assert.equal(boostedSgpDecimal(3.5, 20), 4);
  assert.equal(parseQuickSgpPromotion("parlay 20% max $250").error !== undefined, true);
  assert.equal(parseQuickSgpPromotion("SGP parlay 20% boost").error !== undefined, true);
});

test("moneyline + half-point total produces both teams and both total directions", async () => {
  const { findQuickSgpCandidates } = await load();
  const found = findQuickSgpCandidates(fixture);
  assert.equal(found.length, 4);
  const over = found.find(x => x.teamA === "Baltimore Ravens" && x.direction === "over");
  assert.ok(over);
  assert.equal(over.hedgeLabel, "Atlanta Falcons + OVER 37.5");
  assert.equal(over.bestStraightOdds, "3.100x");
  assert.equal(over.sport, "NFL");
});

test("does not invent SGP odds, use stale markets, or allow push totals", async () => {
  const { findQuickSgpCandidates } = await load();
  assert.ok(findQuickSgpCandidates(fixture).every(x => !("sgpOdds" in x)));
  assert.equal(findQuickSgpCandidates(fixture.map(x => ({ ...x, period: "1st_half" }))).length, 0);
  assert.equal(findQuickSgpCandidates(fixture.map(x => ({ ...x, excluded: true }))).length, 0);
  assert.equal(findQuickSgpCandidates(fixture.map(x => ({ ...x, isLive: true }))).length, 0);
  const pushLines = fixture.map(row => row.marketType === "total" ? { ...row, lineValue: 38 } : row);
  assert.equal(findQuickSgpCandidates(pushLines).length, 0);
  assert.equal(findQuickSgpCandidates(fixture, { sport: "NBA" }).length, 0);
});

test("requires both winner prices and both total directions", async () => {
  const { findQuickSgpCandidates } = await load();
  assert.equal(findQuickSgpCandidates(fixture.slice(1)).length, 0);
  assert.equal(findQuickSgpCandidates(fixture.slice(0, 3)).length, 0);
});
