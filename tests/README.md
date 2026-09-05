# MLB capture/parser repair: first batch

Run `npm run test:parsers` (or `node --experimental-vm-modules --test tests/mlb-parsers.test.cjs`). No additional packages are required. Node's VM-module experimental warning is expected.

## Fixtures and limits

- `thescore-mlb-legacy.txt` is the supplied Giants/Mets structured capture. It produces 145 literal rows. **This is not a verified betting dataset**: duplicated main-line prices and suspected shifted ladder labels were already present in the input. Tests preserve those literal values, rather than guessing corrections. Four team-total rows are still unsupported and omitted.
- `pinnacle-mlb-collapsed.txt` is the market-content excerpt from the same game's supplied Pinnacle capture. Its prop headings contain no prices; the correct result is six main-line rows and zero player-prop rows.
- Expanded Pinnacle test prices and DOM mocks are explicitly synthetic. They demonstrate parser/extractor behavior, not current odds or a successful live browser run.

## Changes covered

- Preserve blank ladder header cells, validate column counts, and reject ambiguous layouts.
- Prefer market-typed main-line buttons. Do not use the legacy text-order fallback for MLB; skip unreliable tables with a diagnostic marker instead.
- Use an MLB-only team lookup, including Orioles, Rockies, and team abbreviations.
- Clear stale theScore targets; filter requested targets by the current page's sport before taking the targeted-only branch.
- Recognize tennis in the page URL before scanning mixed-sport sidebar text. This is **not** complete tennis market support.
- Recognize Pinnacle's visible MLB prop headers; respect O/U sides and neighboring header boundaries.

## Live validation still required

1. Reload the updated EV Parlay Extractor extension and refresh the sportsbook page. New game captures include `THESCORE_CAPTURE_VERSION: 20260905_MLB_1`.
2. Recapture theScore MLB main lines and props. Compare moneyline prices and the first/last ladder thresholds to screenshots. Do not reuse the old fixture as corrected data.
3. On Pinnacle, open the actual `Zac Thornton Total Strikeouts` and `Juan Soto Total Bases` drawers (or equivalent props in a new pregame game), so both O/U prices are visible, then capture again. Merely selecting Player Props may leave drawers collapsed.

Full Next.js build, live extension navigation, Pinnacle automatic drawer expansion, MLB team totals, FanDuel's MLB workflow, and the remaining tennis/football roadmap are not validated or completed by this batch. Existing unrelated local changes are excluded.
