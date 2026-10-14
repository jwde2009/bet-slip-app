# MLB / NHL / NFL import audit — October 14, 2026

Scope: DraftKings, FanDuel, **BetMGM**, Caesars, Pinnacle and theScore. BetOnline is excluded from this work at the user's request; its existing behavior/tests remain. This is a partial implementation, not a claim that all 18 live book/league combinations work.

## Baseline and preservation

- Remote main was `61ca058`; PR #1 is merged. PR #2 (`codex/parlay-hedge-finder-phase1`, `d7a1b4b`) remains open and contains separate guided hedge-finder work. This branch is based on main and does not replace that PR.
- Recovered the October 13 DraftKings MLB parser from Library installer `libfile_851ab7a2c6448191a2953ce796812487`. Its decoded Git blob hash is `4419cec066333bd5ff2cb715ec3843fe331b5634`.
- Recovered NFL extension 1.3.4 source from `libfile_34cc80ffa9248191b1a25a2039f2a093`. Decoded source SHA-256 before integration is `08c91fdabd9727780b96fc4144961a3fac07db47f234efd0ef8f1fa4274e399c`. The `DRAFTKINGS_NFL_TABS_VERSION: 20261013_1` repair and observed tab selectors are preserved. Added listing compatibility and the matching app-side V2 reader because neither was present on main.
- Preserved the remote theScore drawer repair from `8759e3f` (`codex/thescore-nfl-drawer-repair`) and added lazy-load/plain-matchup regression tests.
- No user's Surface files were accessed or overwritten. Do not replace a locally modified extension/parser blindly with this branch. Compare local changes first.

## Book / league coverage

“Replay” means parsing an existing supplied capture. “Synthetic” means controlled text/DOM tests, not current sportsbook verification. “Existing” means code is present but this task has no current supplied fixture establishing complete coverage.

| Book | MLB | NHL | NFL |
|---|---|---|---|
| DraftKings | **Supplied Oct 13 replay: 162 rows**, main lines and supported O/U props. Recovered navigation/statistics parsing fix. Automatic capture still needs live verification. | Existing main/prop parser and tab workflow. Fixed stale basketball targets overriding NHL; synthetic tab and puck-line matching checks. No current live/raw fixture coverage. | Supplied slate replay retained. Recovered 1.3.4 detail/tab collector and added V2 app reader. Synthetic DOM verifies observed anchors, one activation, selected-state readiness and unsafe-link rejection. **Live tab failure remains unverified.** |
| FanDuel | Visible-page fallback now avoids other-sport navigation on explicit MLB pages. Existing parser; no supplied current MLB fixture, no verified automatic MLB drawer navigation. | Existing specialized NHL parser/capture workflow; no current supplied NHL fixture/live run. | Existing supplied slate replay; recovered detail collector/V2 reader with synthetic stream coverage. Live detail capture unverified. |
| BetMGM | Visible-page fallback avoids running the NBA workflow on explicit MLB pages. Exact matchup league inference added. Existing parser; current MLB layout/props still need a supplied capture. | Existing NHL drawer/parser workflow; exact matchup beats mixed-league sidebar. Synthetic shared matching checks; no current supplied raw/live fixture. | Supplied full-game/detail/slate replays retained (including 84 side-by-side-period rows); recovered NFL detail collector/V2 reader. Live navigation unverified. |
| Caesars | Existing generic main-line parser; no current supplied MLB fixture. Added source identification, not automatic drawer navigation. | Existing O/U shape tested synthetically; NHL matchup now overrides NBA sidebar. No current supplied raw/live fixture. | Existing generic main-line format can identify NFL; no current supplied NFL fixture or NFL-specific prop collector. **Not validated as complete.** |
| Pinnacle | Supplied collapsed/expanded replays retained: 6 / 82 rows. Automatic drawer expansion still unimplemented. | Existing main/prop parser; no current supplied NHL fixture/live run. | Supplied main-line replays and actual Oct 5 114-prop replay retained (120 rows including main lines). Prop-only imports no longer blocked by the UI's main-line precheck. |
| theScore | Existing supplied legacy replay retained (145 literal rows); known suspicious/shifted original ladder values are not corrected or certified. | Existing structured/raw parser/capture. Explicit `Sport:` marker now beats sidebar. No current supplied NHL fixture/live run. | V2 main lines plus existing structured props import together. Restored drawer repair clicks summaries to trigger lazy loading and reads each drawer before the next closes it. Synthetic DOM tests; live run pending. |

The normalized CSV/TSV fallback is tested for all **six books × three leagues** through routing and canonical matching. Those 18 tests do not validate any book's live DOM or native pasted-text layout.

## Changes and regression evidence

- MLB replay fixture `draftkings-mlb-20261013-user.txt.gz` is a gzip-compressed Library text reconstruction of `draftkings-import-2026-10-13T19-05-35-182Z.txt` (`libfile_27225c6240a8819190e375b9b89cd596`). Its repeated navigation, starting-pitcher labels and player statistics reproduce the original failure. Compression avoids checking in 49,274 repetitive text lines.
- NFL stream tests cover DK/FD/BetMGM/theScore, incomplete/conflicting prices, wrong book/event/period, malformed records, latest snapshots and theScore mixed legacy props.
- NHL puck-line matching now retains each selection's signed line, following the already-tested NFL/MLB handling. Canonical markets distinguish periods and optional explicit event starts.
- `npm run test:parsers` now runs every regression test; it previously omitted the NFL player-prop suite locally. CI also checks both new extension modules.
- Extension version is 1.4.0; recovered repair markers remain intact.

## Manual odds-table import

Choose **Odds table**, load or paste a CSV/TSV, then Parse. A downloadable **synthetic** example is available in the import panel and `public/odds-table-example.csv`. No sign-in, remote API or background scraping occurs.

Required columns:

`league,event,market,period,selection,line,sportsbook,odds,odds_format,odds_type,captured_at`

- `event`: `Away @ Home`; `market`: canonical key (e.g. `spread`, `total`, `moneyline_2way`, `player_shots_on_goal`, `player_receiving_yards`). Supported keys are in `parseOddsTable.js`.
- `selection`: exact event team for spreads/moneyline, `Draw` only for three-way moneyline, or `Over`/`Under`. Player props require `participant`. Moneylines have a blank `line`.
- `odds_format`: `american` or `decimal`; `odds_type`: **listed**. True/fair odds are rejected. Missing/locked/ambiguous cells are rejected rather than borrowed.
- `captured_at`: ISO timestamp with timezone; preserved as the quote's original loaded time, not replaced by import time. Optional `event_start` separates repeat matchups when provided. Optional `source` preserves provenance.
- `period`: explicit. Non-full-game prices are retained **excluded** for review; they are not assumed equivalent to full-game prices. The app's complete settlement/SGP logic for those segments is not implemented here.
- Duplicate identity includes book, league, event/start, period, market, participant/selection and line. Latest timestamp wins, including repeat file imports. Equal-time conflicting prices remain excluded. Original displayed odds/format, source and capture time remain visible on parsed rows.
- Diagnostics report accepted/skipped/duplicate counts and up to 20 row-level errors. File size cap is 5 MB. This schema is not a confirmed Dark Horse export schema.

## Dark Horse: precise remaining blocker

The official [Browse Odds guide](https://about.darkhorseodds.com/guides/browse-odds) describes configurable columns, market grouping, listed/true odds and cells that can expose additional prices. A visible cell cannot be assumed to represent all offers. The actual table headers/DOM, virtualization/pagination and CSV/API availability have not been verified here.

The parent task identified the provider's [Terms of Service](https://about.darkhorseodds.com/terms-of-service) as restricting automated extraction. Per the parent's instruction, **no authenticated or automated Dark Horse collection was attempted**, and no Dark Horse host permission or endpoint integration was added. Public terms could not be independently opened with this environment's web tool.

Minimum next input: a provider-supported export/API or confirmation of permission for the intended collection, plus a permitted representative table/export sample with listed odds, book labels and market periods. No credentials are needed for the implemented local file importer. Current fallback requires mapping the provided data into the documented schema.

## Validation and remaining work

Baseline: 102 passing tests. This branch: 143 passing tests; all extension JS syntax checks and targeted lint pass. The ordinary production build cannot download Geist/Geist Mono from Google Fonts in this environment. A production build with **only font responses mocked** succeeds; that verifies application compilation/static generation but not external font retrieval. CI retains the normal unmocked build.

No live browser session for these books was available in the saved coding environment, and the Surface is offline. Completing the goal requires current extension TXT captures or an authorized live browser session for the uncovered matrix cells, starting with Caesars MLB/NHL/NFL, FanDuel/BetMGM MLB and NHL, and a DraftKings NFL 1.4.0 diagnostic run. Existing supplied tab HTML and the Oct 13 failed capture were already used; do not request them again. No bets or account/payment changes were made. Nothing has been merged or deployed.
