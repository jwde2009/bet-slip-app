# MLB capture/parser repair: first batch

Run `npm run test:parsers` (or `node --experimental-vm-modules --test tests/mlb-parsers.test.cjs`). No additional packages are required. Node's VM-module experimental warning is expected.

## Fixtures and limits

- `thescore-mlb-legacy.txt` is the supplied Giants/Mets structured capture. It produces 145 literal rows. **This is not a verified betting dataset**: duplicated main-line prices and suspected shifted ladder labels were already present in the input. Tests preserve those literal values, rather than guessing corrections. Four team-total rows are still unsupported and omitted.
- `pinnacle-mlb-collapsed.txt` is the market-content excerpt from the same game's supplied Pinnacle capture. Its prop headings contain no prices; the correct result is six main-line rows and zero player-prop rows.
- `pinnacle-mlb-expanded.txt` is the full follow-up capture supplied on September 5, 2026. It produces 82 rows: six full-game main-line rows and 76 player-prop rows (38 Over/Under pairs). The pairs cover 17 total-bases markets, 13 home-run markets, and two each for pitcher strikeouts, outs, hits allowed and earned runs. The test checks actual captured prices and that expanded inning/team-total/exact-score markets do not contaminate full-game rows. This capture contains no batter hits or RBI markets.
- The isolated expanded-header test prices and DOM mocks remain explicitly synthetic. The new full-page fixture uses supplied prices. Replaying that fixture verifies parsing of the supplied text, not automatic live browser navigation or current prices.

## Changes covered

- Preserve blank ladder header cells, validate column counts, and reject ambiguous layouts.
- Prefer market-typed main-line buttons. Do not use the legacy text-order fallback for MLB; skip unreliable tables with a diagnostic marker instead.
- Use an MLB-only team lookup, including Orioles, Rockies, and team abbreviations.
- Clear stale theScore targets; filter requested targets by the current page's sport before taking the targeted-only branch.
- Recognize tennis in the page URL before scanning mixed-sport sidebar text. This is **not** complete tennis market support.
- Recognize Pinnacle's visible MLB prop headers; respect O/U sides and neighboring header boundaries.
- Register BetOnline as a default sharp source alongside Pinnacle (FanDuel retains its existing sharp-mode toggle). Recognize `betonline.ag` and its subdomains for a raw visible-page capture. Hold automatic parsing and prevent BetOnline input from falling through to the DraftKings parser. The sportsbook-specific BetOnline market parser and drawer navigation are **not implemented**; a real expanded game capture is needed first.
- URL imports now use their own source/text when deciding whether to pause, fixing references to variables that only exist in the queued-import handler.

## Live validation still required

1. Reload the updated EV Parlay Extractor extension and refresh the sportsbook page. New game captures include `THESCORE_CAPTURE_VERSION: 20260905_MLB_1`.
2. Recapture theScore MLB main lines and props. Compare moneyline prices and the first/last ladder thresholds to screenshots. Do not reuse the old fixture as corrected data.
3. The requested expanded Pinnacle sample has been supplied and passes. No additional Pinnacle capture is needed for this parser check. Automatic drawer expansion remains unimplemented; importing a captured text file does not validate that navigation.
4. For BetOnline parser setup, supply one expanded MLB event page including its main lines and a player-prop market with the displayed labels, lines and prices. On the current installed extension, copying the page text directly is sufficient; updated extension captures are an alternative after installation. The homepage URL alone does not establish a market layout.

Full Next.js build, live extension navigation, Pinnacle automatic drawer expansion, MLB team totals, FanDuel's MLB workflow, and the remaining tennis/football roadmap are not validated or completed by this batch. Existing unrelated local changes are excluded.
