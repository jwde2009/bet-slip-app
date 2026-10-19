# Test PR #3 without replacing local repairs

The draft branch is `codex/multisport-darkhorse-import`. Its extension manifest is **1.4.10** and preserves the October 13 `DRAFTKINGS_NFL_TABS_VERSION: 20261013_1` repair. A passing build is not live sportsbook verification. Consult [the coverage matrix](Multisport-import-audit.md) before testing.

## Current blocker: verified 1.4.10 still rejects all categories

Do not repeat the capture or install another speculative fix. The latest export confirms1.4.10 / entry20261019_mgmpills1 / nfl-v2, correct event, and no available category controls. The cause is not yet established. The existing category HTML is sufficient; do not resend it.

Smallest next evidence: select the **Players button** in browser DevTools Elements, then run the read-only [category discovery diagnostic](diagnostics/betmgm-category-discovery.js) in that page's Console (or DevTools Sources > Snippets). Return the printed JSON. It reports only category IDs/labels, sizes/styles, exclusion/visibility gates, bounded ancestor metadata and frame/root context. It does not click, navigate, send requests, write storage, read account data or copy full HTML. No extension/app update is required. If DevTools execution is inconvenient, report that rather than copying unrelated markup.

The output determines whether any ancestor HTML is needed. For an exclusion/hidden ancestor it identifies the exact tag/class; a frame/shadow mismatch identifies the root. No specific additional ancestor outerHTML is justified before this diagnostic.

## Supplied BetMGM category-bar repair (1.4.10)

The requested Players/category-bar HTML is supplied and preserved; do not request it again. Update directly from 1.4.8 to **1.4.10** in the clean test checkout, reload the extension and refresh the BetMGM event tab. Skip 1.4.9. No app rebuild, npm install or storage clearing is needed from app95b26d6.

Smallest next live test: one normal capture on the intended pregame BetMGM event, starting from its ordinary page. It should discover Players and verify its player-category content before opening supported drawers. The export should contain NFL_CAPTURE_VERSION and EXTENSION_CAPTURE_DIAGNOSTICS with extensionVersion1.4.10 / entryVersion20261019_mgmpills1. Check the selected event and current prices; the historical 22-price fixture is not an expected live count. If it stops, retain that export; do not repeat broad refreshes or resend the category bar. Expanded controlled price-panel HTML is only needed if navigation succeeds but drawer extraction fails.

The actual pill bar is matched by its exact scoped IDs and labels. Every supplied button has ds-pill-current, which is not used as active-state proof. Players readiness uses the exact TD scorers / Passing / Receiving / Rushing sub-navigation observed in the earlier manual export. Other supported categories require a structural heading change after one requested click. No price-only change can verify navigation. The fixture does not establish where the bar sits relative to main; tests cover both placements. Live rendering and complete market coverage remain unverified.

The sections below are historical investigation notes; the prior instruction to await category HTML has been satisfied. Use only the current-version test above.

## BetMGM SGP header and missing category controls (1.4.9)

**Do not run another blind capture for this repair.** The user confirmed installed 1.4.8. Its starting-page export remains legacy because an observed `SGP` badge separates the teams from `Players`. A manifest-driven service-worker reproduction confirms that failure with all imports loaded. Version 1.4.9 allows exactly that one badge before a known category, with existing pregame and same-event safeguards. No category selector or timer was changed.

The subsequent manual Players export correctly uses NFL_CAPTURE_VERSION but contains diagnostics only: all four categories report availableTabs: []. No app parser can import absent market records. The remaining blocker is the actual **Players control outerHTML and its immediate category-bar parent**; inspect that before recommending another live run. Previous full exports and header text are sufficient.

The corrected background appends EXTENSION_CAPTURE_DIAGNOSTICS containing manifest version, entry revision, route, selected event and capture timestamp. App commit 95b26d6 was tested directly: zero rows for this diagnostics-only export and 22 rows for the corrected anytime V2 envelope, including appended version diagnostics. No app rebuild or storage clearing is needed for that format. The local test uses actual entry loading and serialized injections, but its clickable Players control is explicitly synthetic; actual category navigation remains unverified.

## BetMGM compact NFL header (1.4.8)

Update straight to **1.4.8** if 1.4.7 has not yet been installed; it includes the deletion and normal-retry fixes below. Use only the clean test checkout's guarded fetch/switch steps, reload the extension, confirm 1.4.8 and refresh the sportsbook tab. No app rebuild, install or storage clearing is required from 95b26d6 for future NFL V2 imports.

The supplied manual Players TXT contains legacy collector markers and an NFL (14) hero that the old USA | NFL detector did not recognize. Tests reproduce this fallback when URL/title lack NFL; the export does not identify the installed version or prove the sole live cause. The new detector handles the observed bounded event header; exact anytime text now yields 22 player prices while excluding D/ST and first/multiple-TD selections. Other drawers in that file contain headings only. The original legacy TXT still parses to zero; the change applies to future structured captures, and live panel behavior remains unverified.

One normal capture on the intended BetMGM pregame event with 1.4.8 is the useful next test. Its export should start with NFL_CAPTURE_VERSION, not BETMGM_AUTOPASS. Keep that export if the corrected route still yields missing prices. Do not repeat the old version's broad run or resend the supplied header.

The sections below retain earlier investigation details. Use current version **1.4.9** only when the remaining category-control evidence is resolved; do not install intermediate versions or repeat blind captures.

## Deletion and normal retry (1.4.7)

This supersedes 1.4.6's persistent unmatched-target pause. A new normal user action rechecks missing/unfinished tabs once; it does not automatically loop or declare unobserved markets available. After Delete Book/Delete Event, verified empty app coverage resets only that selected book/event's capture state. Unreadable app data is not treated as deletion, and ambiguous event matching still stops.

In the **clean test checkout only**, check for tracked edits, fetch the draft branch and switch to its latest head using the guarded commands below. Reload the test extension at chrome://extensions or edge://extensions, confirm **1.4.7**, and refresh the sportsbook tab. Then use a normal click. **No app rebuild, npm install or storage clearing is required from app build 95b26d6.** Keep the original modified checkout and unrelated book/event data intact.

For BetMGM, a manual Players test is already underway; retain that export rather than run it again. For the FanDuel comparison gaps, await evidence of the other four markets being offered and the expanded TD container; this update does not add guessed market navigation. If a capture still refuses, retain the exact new toast title/body, active event URL and installed version.

## Targeted event matching (1.4.5)

The generic preflight searched page text for the complete coverage event label. DK abbreviated team labels do not equal canonical imported names. A prior attempt leaves a sportsbook sessionStorage marker, so subsequent normal attempts could refuse even on the correct event page; restarting the app cannot remove that marker. A URL/title NFL fallback also failed when neither contained NFL. Version 1.4.5 uses the existing read-only NFL collector's verified breadcrumb/hero identity before matching coverage, without relying on title keywords or old session state. Genuine unresolved/changed events stop; no broad retry is substituted. The app snapshot contains all coverage events, not a separately selected event control, and its schema is unchanged.

This is extension-only from app build 95b26d6: update only the clean test checkout and reload extension **1.4.5**. No app rebuild, storage clearing or install is required. Normal click should resume the correct event's missing work. If refusal persists, provide only the active sportsbook event URL, the page's displayed matchup, and the corresponding app coverage event label (plus installed extension version); no new market HTML is needed.

For an intentional full capture, activate the sportsbook event tab, **right-click the EV Parlay Extractor toolbar icon → Refresh all markets for this event**. This is the extension action context menu, not an app control or popup. Pin the icon from the browser Extensions menu if needed. If the item is absent, reload the extension at chrome://extensions or edge://extensions. It does not clear imported rows. This option remains explicit and is not the normal targeted retry.

## October 19: supplied CMS drawer repair (1.4.4)

The requested expanded market HTML is now supplied and retained as `draftkings-nfl-pass-yards-dom-20261019.html`. **Do not resend it.** The earlier 1.4.3 reader returns zero quotes from this real structure. Version 1.4.4 recognizes the enclosing cms-expander-container and reads each template's explicit player, O/U, points and odds fields. Exact replay gives Brock Purdy O/U 249.5 at -111/-113 and Jayden Daniels O/U 206.5 at -111/-113. Animated stats digits are excluded. The market fragment contains no event header; tests provide an explicitly synthetic SF/Washington event wrapper rather than reuse Dallas/Green Bay metadata.

This is an extension-only delta from 1.4.2 or 1.4.3: use the guarded clean-checkout fetch/switch steps, reload the extension and confirm **1.4.4**, then refresh the sportsbook tab. No app rebuild, npm install, storage clearing or changes to the original dirty checkout are needed. If not yet on 1.4.3, skip that intermediate update.

Smallest next live test: on the intended pregame NFL event, use the normal extension action to resume missing props. Check that the imported passing-yards pairs match the **current** displayed players, lines and odds and that the event label matches the selected event. Save the resulting Download TXT only if it still fails or reports incomplete markets. The supplied four prices are historical fixture values, not expected live prices. Full NFL prop coverage, other CMS market shapes and live hydration are not proven by one market's DOM replay.

## October 19: DraftKings NFL drawer reader (1.4.3)

The latest 127-line export confirms all six tabs switched successfully, including Rushing. All 32 drawer records are heading-only; only six unique main lines are recoverable. This is not evidence that the tab workflow stopped early. Version 1.4.3 removes a fixed-parent shortcut that can select a heading-only wrapper and adds scoped diagnostics for unresolved drawers. Timers, tab navigation and repeat-capture checkpoint semantics are unchanged. Regression DOM is synthetic; the export contains no price-panel HTML, so this is not a live-confirmed fix.

If already on 1.4.2, this is extension-only: update the clean test checkout using the existing guarded fetch/switch steps below, reload the extension and confirm **1.4.3**. No app rebuild, dependency install or storage clearing is needed for this delta. Keep the original modified checkout intact. The 1.4.2 instructions below remain applicable when upgrading from an earlier app version.

The expanded market HTML requested during this investigation has since been supplied; see the 1.4.4 result above. No further HTML is needed for this market.

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
- DraftKings NFL live tab switching is confirmed by the October 19 export. The supplied expanded CMS market replays to four correct prices on 1.4.4; a normal targeted live pass remains to be confirmed. Do not repeat the supplied HTML.
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

## FanDuel repeat-target handling (1.4.6)

The user's corrected result is that FanDuel parsed successfully; screenshot extraction reports 9 markets / 60 rows. The later TXT is a targeted retry returning no new rows for five Pinnacle comparison gaps, not a lost import. Passing/Rushing target types not observed among the recognized headings now pause for unchanged demand on that event. They are reported as deferred/unverified, not marked complete or globally unavailable. New requested types or explicit refresh recheck the tab. Game Specials is excluded from individual touchdown props.

This retry change is extension-only in use with app build 95b26d6: update the clean test checkout and reload **1.4.6**, without clearing imported rows or rebuilding the app. The shared app core is synchronized for the plural-specials guard but no schema changed. Do not rerun the unchanged old capture to chase these absent observed headings. The missing evidence for FanDuel TD extraction is one expanded Touchdown Scorers container with column labels and two full player rows. Prior Passing HTML and the 60-row screenshot do not need repeating.
