const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function math() {
  const filename = path.resolve(__dirname, "../app/ev-parlay-lab/utils/parlayHedgeMath.js");
  const source = fs.readFileSync(filename, "utf8");
  const context = vm.createContext({});
  const mod = new vm.SourceTextModule(source, { context, identifier: filename });
  await mod.link(() => { throw new Error("Unexpected dependency"); });
  await mod.evaluate();
  return mod.namespace;
}
const common = {
  primaryStake: 500, primaryOdds: "+300",
  primaryCovers: ["aOver"],
  scenarios: [
    { id: "aOver", label: "A + over" },
    { id: "bOver", label: "B + over" },
    { id: "under", label: "Under" },
  ],
  hedges: [
    { id: "b", odds: "2.205084x", covers: ["bOver"], maxStake: "" },
    { id: "u", odds: "+210", covers: ["under"], maxStake: "" },
  ],
};
const approx = (actual, expected, tolerance = 0.15) =>
  assert.ok(Math.abs(actual - expected) < tolerance,
    "Expected " + actual + " to be approximately " + expected);

test("American, decimal, and multiplier odds parse without mistaking decimal for American", async () => {
  const { parseHedgePrice } = await math();
  assert.equal(parseHedgePrice("+300"), 4);
  approx(parseHedgePrice("-235"), 1 + 100 / 235, 1e-8);
  assert.equal(parseHedgePrice("2.21x"), 2.21);
  assert.equal(parseHedgePrice("2.21"), 2.21);
  assert.equal(parseHedgePrice("+85"), null);
  assert.equal(parseHedgePrice(""), null);
});

test("Ravens-Falcons prices produce a loss, not a fake arb", async () => {
  const { analyzeParlayHedge } = await math();
  const r = analyzeParlayHedge(common);
  assert.equal(r.error, undefined);
  assert.equal(r.qualified, false);
  approx(r.focusMinimum, -52.16);
  approx(r.actualMinimum, -52.16);
  approx(r.stakes[0], 907);
  approx(r.stakes[1], 645.16);
  assert.equal(r.allCovered, true);
});

test("Tie and over stays uncovered and disqualifies guarantee", async () => {
  const { analyzeParlayHedge } = await math();
  const r = analyzeParlayHedge({
    ...common,
    scenarios: [...common.scenarios, { id: "tieOver", label: "Tie + over" }],
    optimizeIds: ["aOver", "bOver", "under"],
  });
  assert.equal(r.qualified, false);
  assert.equal(r.allCovered, false);
  assert.ok(r.uncovered.includes("Tie + over"));
  approx(r.focusMinimum, -52.16);
  assert.ok(r.actualMinimum < -1000);
});

test("Positive two-way arb has equal profits and never uses an uncovered scenario", async () => {
  const { analyzeParlayHedge } = await math();
  const r = analyzeParlayHedge({
    primaryStake: 100, primaryOdds: "+150", primaryCovers: ["a"],
    scenarios: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    hedges: [{ id: "b", odds: "+150", maxStake: "", covers: ["b"] }],
  });
  assert.equal(r.qualified, true);
  approx(r.stakes[0], 100, 0.01);
  approx(r.actualMinimum, 50, 0.01);
});

test("Limited hedge availability and combined budget respected", async () => {
  const { analyzeParlayHedge } = await math();
  const r = analyzeParlayHedge({
    ...common,
    hedges: [{ ...common.hedges[0], maxStake: 10 }, common.hedges[1]],
    totalHedgeBudget: 100,
  });
  assert.ok(r.stakes[0] <= 10);
  assert.ok(r.totalHedgeStake <= 100 + 0.001);
  assert.equal(r.qualified, false);
});

test("Break-even target improves one actual quote at a time", async () => {
  const { breakEvenHedgePrices } = await math();
  const targets = breakEvenHedgePrices(common);
  assert.equal(targets.length, 2);
  approx(targets[0].requiredDecimal, 2.34, 0.02);
  approx(targets[1].requiredDecimal, 3.38, 0.04);
});

test("Importer only suggests exact full-game matching event, market, and line", async () => {
  const { suggestedImportedHedges } = await math();
  const rows = [
    { sportsbook: "Pinnacle", eventLabelRaw: "A @ B", period: "full_game", marketType: "total",
      selectionNormalized: "Under", lineValue: 37.5, oddsAmerican: 210, oddsDecimal: 3.1 },
    { sportsbook: "Wrong line", eventLabelRaw: "A @ B", period: "full_game", marketType: "total",
      selectionNormalized: "Under", lineValue: 38.5, oddsAmerican: 300, oddsDecimal: 4 },
    { sportsbook: "Wrong period", eventLabelRaw: "A @ B", period: "1st_half", marketType: "total",
      selectionNormalized: "Under", lineValue: 37.5, oddsAmerican: 300, oddsDecimal: 4 },
    { sportsbook: "Wrong event", eventLabelRaw: "A @ C", period: "full_game", marketType: "total",
      selectionNormalized: "Under", lineValue: 37.5, oddsAmerican: 300, oddsDecimal: 4 },
    { sportsbook: "Excluded", eventLabelRaw: "A @ B", period: "full_game", marketType: "total",
      selectionNormalized: "Under", lineValue: 37.5, oddsAmerican: 300, oddsDecimal: 4, excluded: true },
  ];
  const found = suggestedImportedHedges(rows, "A @ B", "team-total-tie", 37.5, "B");
  assert.equal(found.length, 1);
  assert.equal(found[0].sportsbook, "Pinnacle");
});
