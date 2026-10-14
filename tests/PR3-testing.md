# Test PR #3 without replacing local repairs

The draft branch is `codex/multisport-darkhorse-import`. Its extension manifest is **1.4.0** and preserves the October 13 `DRAFTKINGS_NFL_TABS_VERSION: 20261013_1` repair. A passing build is not live sportsbook verification. Consult [the coverage matrix](Multisport-import-audit.md) before testing.

## Separate checkout

In the existing repository, these commands fetch the draft and create a new detached test worktree. They do not switch, reset, stash or overwrite the current checkout. Use a new destination name if this one already exists.

```powershell
git status --short
git fetch origin codex/multisport-darkhorse-import
git worktree add --detach ../bet-slip-app-pr3-test origin/codex/multisport-darkhorse-import
cd ../bet-slip-app-pr3-test
npm.cmd ci
npm.cmd run test:parsers
```

On Linux/macOS, use `npm` instead of `npm.cmd`. Keep the existing checkout and extension directory, including uncommitted Surface repairs. Compare local differences before any later adoption; this test does not authorize replacing them.

The extension currently sends imports to **http://localhost:3000/ev-parlay-lab**. Save any current session first, then stop the old app server with Ctrl+C in its own terminal. Start the test server explicitly on port 3000:

```powershell
npm.cmd run dev -- --port 3000
```

If port 3000 is occupied, resolve which app is running; do not accept another port and assume the extension will follow it. To return to the original app afterward, stop the test server and restart the original checkout's server.

## Separate browser profile

Create a separate Chrome or Edge profile for this test. In that profile only, open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the new worktree's `ev-parlay-extension` directory. Confirm **EV Parlay Extractor 1.4.0**. Keep only this copy enabled in the test profile. Leave the original profile's extension and app storage intact.

Open the test app URL above in that profile. Confirm its import controls include **Odds table**. If sportsbook access is needed, sign in yourself in the test profile; do not share credentials or copy account cookies into tooling. Using the extractor only reads visible markets and navigates market controls; do not click odds selections or place bets during validation.

## Focused validation

- Supported books in this task: DraftKings, FanDuel, BetMGM, Caesars, Pinnacle and theScore. BetOnline is excluded from new work.
- Start with a single known event. Compare event, period, participant, line and both quoted prices before relying on imported rows. Save **Download TXT** from Import Odds to retain the actual capture and diagnostics.
- Pinnacle MLB now opens Player Props and supported collapsed drawers automatically, based on the supplied rendered DOM. Start at an English MLB event page, capture once, and compare one complete bases/strikeouts pair and the capture diagnostics. No outcome buttons should be clicked. The actual DOM sample gives four prop rows; the older expanded text gives 82 rows. These replays do not establish full live-page coverage. Guest displayed odds may be delayed.
- DraftKings NFL live tab switching remains unverified despite recovered selectors and synthetic tests. Keep diagnostics from any new run; the old tab HTML and October 13 failed capture are already preserved.
- Dark Horse is not an installed capture integration. The manual CSV/TSV importer requires the documented schema and a permitted data source; it is not proof of compatibility with a provider export.

Do not merge, deploy, or copy this test checkout over the original repair directory as part of this test.
