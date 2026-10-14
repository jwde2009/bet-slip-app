# DraftKings MLB and responsive import text

Extension version: **1.4.0**. This update addresses the reported freeze when copying an import and missing DraftKings MLB rows.

## Import behavior

- The textarea shows at most 30,000 characters. The original full capture remains in app state for parsing and export.
- **Copy full text** writes the complete capture directly to the clipboard, without selecting the textarea. **Download TXT** saves the complete capture, including Unicode and original line endings, even if clipboard access fails.
- Parsing runs in a bundled Web Worker. The page offers **Cancel parsing**, and the worker stops after 30 seconds. Changing input/source/role/import mode or clearing rows cancels pending work; stale results do not replace the current session.
- Successful parsing shows a status message instead of a blocking alert. A parser error or zero-row result retains the raw input, previously loaded rows and prior parse timestamp.
- Normalization, market matching, rendering and session persistence still run on the main thread. These changes do not establish the cause of every possible browser freeze.

## DraftKings MLB behavior

- MLB URL/breadcrumb detection runs before stale basketball workflow targets. Capture visits available baseball tabs, rechecks for newly revealed tabs, and skips missing labels immediately. MLB retains multiple passes for props; this is not a one-pass-only capture.
- The parser accepts the MLB-marked or MLB-breadcrumb Run Line / Total / Moneyline row-major table, with exact baseball team aliases. Texas Rangers remains MLB, and pitcher names cannot replace teams.
- Both sides require valid prices. Spread signs must oppose, totals must match, and locked/missing cells cannot shift neighboring prices. Explicit partial innings, live and team-total sections do not become full-game lines.
- Supported detail-page **explicit O/U** prop tables include hits, total bases, home runs, RBIs, runs, hits+runs+RBIs, strikeouts, outs, hits allowed, earned runs and walks allowed. They require an identified MLB event and a complete directly adjacent Over/Under pair. Unlabelled milestone grids are not converted into guessed lines.
- Repeated identical event/market/selection/line rows retain the last captured price. Distinct alternate lines remain separate.
- Generic `Hits O/U` is skipped when pitcher tabs are present, because the text cannot establish batter hits versus pitcher hits allowed. Explicit `Batter Hits O/U` and `Hits Allowed O/U` remain supported.
- MLB run-line sides now share the same canonical market while keeping each selection's actual sign, using the signed-away-line rule already tested for NFL.

## Verification and limits

Run `npm.cmd run test:parsers` on Windows, or `npm run test:parsers` elsewhere. The new suite tests MLB parsing boundaries, market matching, workflow tab selection, full-text copy/download, worker success/error/timeout/cancel paths, zero-row session preservation and rendering of the real React input component with a large capture. Existing MLB and NFL fixtures also run. Run `npm ci` first; DOM regressions use the locked jsdom development dependency.

**Evidence:** the supplied October 13 failed MLB capture now replays to 162 rows. Additional small fixtures and DOM tests are synthetic and test isolated boundaries. Neither replay nor synthetic DOM tests establish successful live navigation. The recovered `DRAFTKINGS_NFL_TABS_VERSION: 20261013_1` repair is preserved; live NFL tab switching remains unverified.

`npm run build -- --webpack` passes, including the worker bundle. The reported freeze has not been reproduced in the user's saved session. A cloud-browser attempt to open the local test server was blocked (`ERR_BLOCKED_BY_CLIENT`), so this is not a completed browser interaction or live extension navigation check.

## Update and one live check

1. Follow [the isolated PR #3 setup](PR3-testing.md). It uses a separate worktree and browser profile and preserves the local October 13 repairs.
2. Confirm EV Parlay Extractor **1.4.0** is loaded from the test worktree. Refresh the test app and DraftKings tabs.
3. On one DraftKings MLB game, select full-game lines, wait for prices, and capture. Compare both teams, all six main-line rows and one complete prop pair against the book. Replay tests do not establish complete live coverage.
4. If rows are missing, expand **Import Odds** and click **Download TXT**. Save the actual capture, including diagnostics, and record the missing visible market. Do not copy the whole app page or resend the already supplied October 13 capture/tab HTML.
