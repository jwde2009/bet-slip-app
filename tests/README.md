# MLB capture/parser repair: first batch

Run `npm run test:parsers` (or `node --experimental-vm-modules --test tests/mlb-parsers.test.cjs`). No additional packages are required. Node's VM-module experimental warning is expected.

## Fixtures and limits

- `thescore-mlb-legacy.txt` is the supplied Giants/Mets structured capture. It produces 145 literal rows. **This is not a verified betting dataset**: duplicated main-line prices and suspected shifted ladder labels were already present in the input. Tests preserve those literal values, rather than guessing corrections. Four team-total rows are still unsupported and omitted.
- `pinnacle-mlb-collapsed.txt` is the market-content excerpt from the same game's supplied Pinnacle capture. Its prop headings contain no prices; the correct result is six main-line rows and zero player-prop rows.
- `pinnacle-mlb-expanded.txt` is the full follow-up capture supplied on September 5, 2026. It produces 82 rows: six full-game main-line rows and 76 player-prop rows (38 Over/Under pairs). The pairs cover 17 total-bases markets, 13 home-run markets, and two each for pitcher strikeouts, outs, hits allowed and earned runs. The test checks actual captured prices and that expanded inning/team-total/exact-score markets do not contaminate full-game rows. This capture contains no batter hits or RBI markets.
- The isolated expanded-header test prices and DOM mocks remain explicitly synthetic. The new full-page fixture uses supplied prices. Replaying that fixture verifies parsing of the supplied text, not automatic live browser navigation or current prices.
- `betonline-mlb-no-prices.md` is a market-content excerpt from the supplied Braves/Phillies Markdown, with whitespace normalized and unrelated account/footer/iframe links omitted. It identifies the MLB event and 20 supported prop markets but yields zero priced rows: **no odds prices were present in the supplied text**. Additional BetOnline tests add explicitly synthetic signed American prices to the supplied labels/thresholds; those are not observed betting odds.

## Changes covered

- Preserve blank ladder header cells, validate column counts, and reject ambiguous layouts.
- Prefer market-typed main-line buttons. Do not use the legacy text-order fallback for MLB; skip unreliable tables with a diagnostic marker instead.
- Use an MLB-only team lookup, including Orioles, Rockies, and team abbreviations.
- Clear stale theScore targets; filter requested targets by the current page's sport before taking the targeted-only branch.
- Recognize tennis in the page URL before scanning mixed-sport sidebar text. This is **not** complete tennis market support.
- Recognize Pinnacle's visible MLB prop headers; respect O/U sides and neighboring header boundaries.
- Register BetOnline as a default sharp source alongside Pinnacle (FanDuel retains its existing sharp-mode toggle). Recognize `betonline.ag` and its subdomains for a raw visible-page capture. Hold automatic parsing for review and route BetOnline input to its own parser. Source display and fair-odds reference priority use Pinnacle, then FanDuel, then BetOnline.
- BetOnline's first parser supports the observed MLB strikeouts, outs recorded, hits+runs+RBIs, and home-run Yes/No headers. It requires a consistent MLB event breadcrumb/team block, matching units/lines and both signed American prices (or EVEN). It accepts Markdown/plain text and inline/next-line prices, maps home-run Yes/No to Over/Under 0.5, preserves integer outs lines with a push warning, and rejects missing prices, conflicting sides/lines, other-team players and ambiguous multiple games. Missing or unsupported neighboring markets cannot supply prices. Main lines, pitcher wins, other formats/sports, and automatic drawer navigation are **not implemented**.
- Manual BetOnline parsing reports when recognized props have no complete valid prices and preserves the input. Automatic BetOnline imports remain paused for review pending a real priced capture.
- URL imports now use their own source/text when deciding whether to pause, fixing references to variables that only exist in the queued-import handler.

## Live validation still required

1. Reload the updated EV Parlay Extractor extension and refresh the sportsbook page. New game captures include `THESCORE_CAPTURE_VERSION: 20260905_MLB_1`.
2. Recapture theScore MLB main lines and props. Compare moneyline prices and the first/last ladder thresholds to screenshots. Do not reuse the old fixture as corrected data.
3. The requested expanded Pinnacle sample has been supplied and passes. No additional Pinnacle capture is needed for this parser check. Automatic drawer expansion remains unimplemented; importing a captured text file does not validate that navigation.
4. BetOnline supplied the labels and lines but no prices. A screenshot of one expanded prop, including both price buttons (for example Zack Wheeler strikeouts), is the smallest next check to establish whether the prices are visible but omitted by copying. No further full-page text copy is needed for this diagnosis. A real price-containing capture is still required for live parser validation.
5. BetOnline served a persistent Cloudflare firewall denial to the separate cloud browser after one reload. Live DOM inspection stopped. The user browser's price-rendering method has not been verified; no selector, CSS, iframe or hidden-data extraction was invented to work around that limitation.

Full Next.js build, live extension navigation, Pinnacle automatic drawer expansion, MLB team totals, FanDuel's MLB workflow, and the remaining tennis/football roadmap are not validated or completed by this batch. Existing unrelated local changes are excluded.
