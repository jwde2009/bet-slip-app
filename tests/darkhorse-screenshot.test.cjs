const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function load() {
  const filename = path.resolve(__dirname, "../app/ev-parlay-lab/utils/darkHorseScreenshot.js");
  const context = vm.createContext({});
  const mod = new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), { context, identifier: filename });
  await mod.link(() => { throw Error("Unexpected imports in pure screenshot helpers"); });
  await mod.evaluate();
  return mod.namespace;
}

const profile = () => Array.from({ length: 14 }, (_, i) => ({
  id: i + 1, name: i === 0 ? "BetMGM" : i === 1 ? "Pinnacle" : "", enabled: i < 2,
}));

test("Moneyline and totals align each of 14 sportsbook columns left to right", async () => {
  const { dhoCellCrop, dhoColumnCenter, DEFAULT_DHO_LAYOUTS, DHO_COLUMN_COUNT } = await load();
  assert.equal(DHO_COLUMN_COUNT, 14);
  for (const market of ["moneyline", "total"]) {
    const layout = DEFAULT_DHO_LAYOUTS[market];
    assert.ok(dhoColumnCenter(0, layout.first, layout.last) <
      dhoColumnCenter(13, layout.first, layout.last));
    const first = dhoCellCrop(2048, 340, 0, 0, layout);
    const last = dhoCellCrop(2048, 340, 13, 0, layout);
    assert.ok(first.x < last.x);
    assert.ok(first.width > 70 && last.width > 70);
    const second = dhoCellCrop(2048, 340, 0, 1, layout);
    assert.ok(first.y < second.y);
  }
});

test("Signed American screenshot odds read precisely without guessing missing signs", async () => {
  const { readDhoAmerican, dhoAmericanToDecimal } = await load();
  assert.equal(readDhoAmerican("+159.7*"), 159.7);
  assert.equal(readDhoAmerican("−165.3*"), -165.3);
  assert.equal(readDhoAmerican("-110"), -110);
  assert.equal(readDhoAmerican("+104.1\n$4.75k+"), 104.1);
  assert.equal(readDhoAmerican("159.7"), null);
  assert.equal(readDhoAmerican("$712+"), null);
  assert.equal(readDhoAmerican("+95"), null);
  assert.equal(readDhoAmerican("Even"), null);
  assert.equal(dhoAmericanToDecimal(-110), 1 + 100 / 110);
});

test("Column order persists independently of market, and only enabled mapped quotes import", async () => {
  const { buildReviewedDhoRows } = await load();
  const values = Array.from({ length: 14 }, () => ["", ""]);
  values[0] = ["+150", "-185"];
  values[1] = ["+159.7", "-166.7"];
  values[5] = ["+999", "-999"]; // unchecked column must not be imported
  const result = buildReviewedDhoRows({
    slots: profile(), values, market: "moneyline", sport: "NFL",
    event: "Buffalo Bills @ Los Angeles Rams", importedAt: "2026-10-11T23:00:00Z",
  });
  assert.equal(result.error, null);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].sportsbook, "BetMGM");
  assert.equal(result.rows[0].selectionNormalized, "Buffalo Bills");
  assert.equal(result.rows[1].selectionNormalized, "Los Angeles Rams");
  assert.equal(result.rows[2].sportsbook, "Pinnacle");
  assert.equal(result.rows[2].oddsAmerican, 159.7);
  assert.equal(result.rows[3].oddsAmerican, -166.7);
  assert.equal(result.rows[0].sourceType, "darkhorseodds_screenshot_reviewed");
  assert.equal(result.rows[0].isSharpSource, false);
});

test("Under/Over screenshot shares line and rejects invalid or fractional-push total", async () => {
  const { buildReviewedDhoRows } = await load();
  const values = Array.from({ length: 14 }, () => ["", ""]);
  values[0] = ["-110", "-108"];
  const good = buildReviewedDhoRows({
    slots: profile(), values, market: "total", sport: "NFL",
    event: "Buffalo Bills @ Los Angeles Rams", totalLine: "54.5",
  });
  assert.equal(good.error, null);
  assert.equal(good.rows.length, 2);
  assert.deepEqual(Array.from(good.rows, r => [r.marketType, r.selectionNormalized, r.lineValue]),
    [["total","Over",54.5],["total","Under",54.5]]);
  const push = buildReviewedDhoRows({
    slots: profile(), values, market: "total", sport: "NFL",
    event: "Buffalo Bills @ Los Angeles Rams", totalLine: "54",
  });
  assert.ok(push.error);
});

test("Bad screenshot signs, anonymous columns or duplicate names block import", async () => {
  const { buildReviewedDhoRows, validateDhoSlots } = await load();
  const values = Array.from({ length: 14 }, () => ["", ""]);
  values[0] = ["150", "-185"];
  let r = buildReviewedDhoRows({
    slots: profile(), values, market: "moneyline", sport: "NFL",
    event: "Buffalo Bills @ Los Angeles Rams",
  });
  assert.ok(r.error);
  assert.equal(r.invalid.length, 1);
  const noName = profile(); noName[1].name = "";
  assert.ok(validateDhoSlots(noName));
  const duplicate = profile(); duplicate[1].name = "BetMGM";
  assert.ok(validateDhoSlots(duplicate));
});

test("Newly reviewed screenshot replaces the old quote for same book and side", async () => {
  const { mergeDhoRows, buildReviewedDhoRows } = await load();
  function data(american, importedAt) {
    const values = Array.from({ length: 14 }, () => ["", ""]);
    values[0][0] = american;
    return buildReviewedDhoRows({
      slots: profile(), values, market: "moneyline", sport: "NFL",
      event: "Buffalo Bills @ Los Angeles Rams", importedAt,
    }).rows;
  }
  const merged = mergeDhoRows(
    data("+150", "2026-10-11T23:00:00Z"),
    data("+155", "2026-10-11T23:10:00Z"),
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].oddsAmerican, 155);
});
