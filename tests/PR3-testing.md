# Test PR #3 without replacing local repairs

The draft branch is `codex/multisport-darkhorse-import`. Its extension manifest is **1.4.2** and preserves the October 13 `DRAFTKINGS_NFL_TABS_VERSION: 20261013_1` repair. A passing build is not live sportsbook verification. Consult [the coverage matrix](Multisport-import-audit.md) before testing.

## Consolidated 1.4.2 update

Skip the intermediate 1.4.1 update if it is not installed yet. This release includes that DraftKings fix, targeted repeat passes, BetMGM accordion/category repairs and app-side incremental merging. In the **clean test checkout only**, preserve any tracked edits, fetch the branch and switch detached to its latest commit. Dependencies are unchanged; no npm install is needed.

```powershell
$trackedChanges = git status --porcelain --untracked-files=no
if ($trackedChanges) { throw 'Preserve tracked test-checkout edits before updating.' }
git fetch origin codex/multisport-darkhorse-import
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git switch --detach origin/codex/multisport-darkhorse-import
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed.' }
npm.cmd run test:parsers
if ($LASTEXITCODE -ne 0) { throw 'Tests failed; retain the log.' }
npm.cmd run build -- --webpack
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
```

Restart the production test app after the build (or let the dev server reload the changes). Reload the test extension, confirm **1.4.2**, and refresh sportsbook tabs. Keep existing app/browser data. A normal extension click uses missing-market demand and unfinished work for the selected event. A completed event does not trigger a full rerun. For an intentional fresh-price pass, right-click the extension and choose **Refresh all markets for this event**. This action does not clear imported rows. Incremental imports preserve unvisited quotes and replace the price for identities actually returned.

Automatic targeted navigation is implemented/tested for the paths listed in the audit. Other supported paths use a visible-only capture and filter imported rows to the requested event/markets; they do not silently run broad navigation. Open the requested missing market if it is not rendered. If the selected event cannot be established uniquely, the retry stops with a diagnostic. Read the remaining coverage limits before calling a test complete. Original local repairs remain untouched.

## Separate checkout

In the existing repository, these commands fetch the draft and create a new detached test worktree. They do not switch, reset, stash or overwrite the current checkout. Use a new destination name if this one already exists.

```powershell
git status --short
git fetch origin codex/multisport-darkhorse-import
git worktree add --detach ../bet-slip-app-pr3-test origin/codex/multisport-darkhorse-import
cd ../bet-slip-app-pr3-test
npm.cmd ci --ignore-scripts
npm.cmd run test:parsers
```

On Linux/macOS, use `npm` instead of `npm.cmd`. Keep the existing checkout and extension directory, including uncommitted Surface repairs. Compare local differences before any later adoption; this test does not authorize replacing them.

The extension currently sends imports to **http://localhost:3000/ev-parlay-lab**. Save any current session first, then stop the old app server with Ctrl+C in its own terminal. Start the test server explicitly on port 3000:

```powershell
npm.cmd run dev -- --port 3000
```

If port 3000 is occupied, resolve which app is running; do not accept another port and assume the extension will follow it. To return to the original app afterward, stop the test server and restart the original checkout's server.

## Separate browser profile

Create a separate Chrome or Edge profile for this test. In that profile only, open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the new worktree's `ev-parlay-extension` directory. Confirm **EV Parlay Extractor 1.4.2**. Keep only this copy enabled in the test profile. Leave the original profile's extension and app storage intact.

Open the test app URL above in that profile. Confirm its import controls include **Odds table**. If sportsbook access is needed, sign in yourself in the test profile; do not share credentials or copy account cookies into tooling. Using the extractor only reads visible markets and navigates market controls; do not click odds selections or place bets during validation.

## Focused validation

- Supported books in this task: DraftKings, FanDuel, BetMGM, Caesars, Pinnacle and theScore. BetOnline is excluded from new work.
- Start with a single known event. Compare event, period, participant, line and both quoted prices before relying on imported rows. Save **Download TXT** from Import Odds to retain the actual capture and diagnostics.
- Pinnacle MLB now opens Player Props and supported collapsed drawers automatically, based on the supplied rendered DOM. Start at an English MLB event page, capture once, and compare one complete bases/strikeouts pair and the capture diagnostics. No outcome buttons should be clicked. The actual DOM sample gives four prop rows; the older expanded text gives 82 rows. These replays do not establish full live-page coverage. Guest displayed odds may be delayed.
- DraftKings NFL live tab switching remains unverified despite recovered selectors and synthetic tests. Keep diagnostics from any new run; the old tab HTML and October 13 failed capture are already preserved.
- Dark Horse is not an installed capture integration. The manual CSV/TSV importer requires the documented schema and a permitted data source; it is not proof of compatibility with a provider export.

Do not merge, deploy, or copy this test checkout over the original repair directory as part of this test.

## October 18: update the clean Windows test worktree

The earlier 5a831b2 app/parser update added `DRAFTKINGS_NFL_HEADER_NAV_VERSION: 20261018_1` while retaining manifest 1.4.0. Once this update is checked out, reload the extension and refresh the sportsbook tab. Rebuild/restart a production app server for the Pinnacle decimal parser fix; dependencies are unchanged from dc6ef39. The existing Pinnacle TXT should now import 136 rows. FanDuel's supplied capture has 68 rows and is incomplete; theScore's supplied capture has 449 rows. BetMGM's old diagnostics-only capture has no recoverable prices. Updated FanDuel/BetMGM captures include more precise context-stop diagnostics; live completion is still pending. See the audit's October 18 batch section before another test.

Use this only in the detached **test** checkout, not the original modified repository. Logs saved there can remain untracked. Stop if tracked files have changed; do not reset or discard them.

```powershell
Set-Location C:\Users\jwde2\Documents\bet-slip-app-import-test
$trackedChanges = git status --porcelain --untracked-files=no
if ($trackedChanges) { throw 'Tracked test-worktree edits exist; preserve them before updating.' }
git fetch origin codex/multisport-darkhorse-import
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git switch --detach origin/codex/multisport-darkhorse-import
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed.' }
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Install failed.' }
npm.cmd run test:parsers *> parser-test-results.txt
if ($LASTEXITCODE -ne 0) { Get-Content parser-test-results.txt -Tail 80; throw 'Tests failed; keep the complete log.' }
Get-Content parser-test-results.txt -Tail 15
npm.cmd audit --omit=dev
if ($LASTEXITCODE -ne 0) { throw 'Production dependency audit needs review.' }
npm.cmd run build -- --webpack
if ($LASTEXITCODE -ne 0) { throw 'Build failed; keep the output before starting the app.' }
```

The revised lockfile uses Next.js and eslint-config-next **16.4.2**, with compatible patched transitive dependencies. Do not run `audit fix --force`: its suggested eslint-config-next 14 downgrade is not this repair. Full `npm audit` still reports five high findings in the same development-only, unpatched braces dependency chain; the production-only audit is clean as of October 18. See [the investigation and advisory links](Windows-test-security-review.md).

Installation deliberately skips lifecycle scripts. Do not broadly approve pending scripts for sharp, tesseract.js or unrs-resolver. Tests/build determine whether a required capability is actually missing; report any specific failure before approving a script. OCR execution and live browser capture are separate from parser/build validation.

After all commands succeed, start only the isolated test app with `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000`, then use the separate browser profile and extension 1.4.2 instructions above. This does not update the original dirty checkout or merge PR #3.
