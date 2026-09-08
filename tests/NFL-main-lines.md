# NFL main lines

Pregame full-game moneyline, spread and total parsing now covers the supplied Pinnacle, BetMGM, FanDuel and DraftKings listings. Pinnacle is a sharp source, BetMGM and DraftKings are targets, and FanDuel uses the app's existing sharp-mode toggle. TheScore has a separate NFL capture path; its new live output still needs verification.

## What changed

- Pinnacle's dated NFL listing uses Handicap / Money Line / Over / Under columns. The ten price/line cells must follow two exact teams and a kickoff time, then a market-count link. The `+67`-style link is never treated as odds. Existing individual-game sections still work.
- BetMGM's supplied listing contains **two parallel periods**: Game lines and 1st half, each with Spread / Total / Money headers. The parser requires both complete column groups and reads only the full-game group. A missing full-game column cannot shift first-half prices into that position. Single-period list and detail formats remain supported.
- FanDuel's NFL listing uses Spread / Money / Total with both team names before row-major prices. DraftKings uses Spread / Total / Moneyline, an `AT` separator and separate O/U threshold cells. Both normalize exact NFL team names and deduplicate repeated capture blocks.
- FanDuel's supplied export repeated the same NFL slate **35 times**, each marked `NBA page not ready`. DraftKings repeated its table **five times** while targeting NBA combos. The extension now recognizes these NFL listings before any basketball navigation and stops their capture loop after one pass. Other sport and player-prop workflows retain their existing pass counts.
- TheScore's supplied NFL export already substituted WNBA teams and labeled the slate NHL. Some pick-em spread fields also contained odds. That export is rejected; original names/prices are not guessed. The new NFL path uses exact football aliases, strips standings suffixes, reads market-typed buttons, separates line values from prices, and captures once without prop-tab navigation. New blocks contain `THESCORE_CAPTURE_VERSION: 20260908_NFL_1`.
- Empty recognized Pinnacle/theScore NFL imports show recovery instructions while preserving raw input and existing rows. Previously loaded bad rows are not rewritten.

## Boundaries

Select **All / Game / Game lines** before capture. Explicit partial-period headings are rejected. Plain copied text cannot reliably establish the selected tab when a combined navigation line lists all tabs; it must not be used to prove that a live page was on full game. TheScore additionally rejects observed selected partial-period labels and live start labels, duplicate typed buttons, and unknown team names.

Each market requires two valid prices and matching thresholds (opposite spread signs or equal total lines). Locked placeholders preserve positions. American, decimal, EVEN and pick-em formats are supported by the NFL parsers; theScore's new typed capture currently emits American/EVEN prices only.

NFL spread matching uses the away team's signed threshold while keeping each selection's actual sign in fair odds and parlay legs. Different thresholds across books remain separate markets. Three complete main-line pairs satisfy the current NFL coverage profile.

Player props, team totals, halves/quarters, regulation-only markets, futures, live markets and automatic game-to-game navigation are outside this NFL batch. This does not reduce existing non-NFL prop capture passes or complete the earlier tennis/MLB/college-football roadmap.

## Fixtures and verification

All prices are dated test data from supplied captures or the public excerpts described below, not current betting quotes.

| Fixture | Provenance | Expected result |
| --- | --- | --- |
| `pinnacle-nfl-slate-user.txt` | Supplied full NFL landing capture, September 8 | 16 events, 96 rows; all prices checked |
| `betmgm-nfl-dual-period-user.txt` | Supplied NFL listing with game and half columns | 14 events, 84 full-game rows; all prices checked |
| `fanduel-nfl-slate-user.txt` | One exact table excerpt from the final of 35 identical supplied captures; account/navigation clutter omitted; NFL capture markers added | 32 events, 192 rows; opening prices and repeated-table behavior checked |
| `draftkings-nfl-slate-user.txt` | One exact table excerpt from the final of five identical supplied captures; account/navigation clutter omitted; NFL scope/capture markers added | 16 events, 96 rows; opening prices, breadcrumb scope and repeated-table behavior checked |
| `thescore-nfl-corrupt-user.txt` | Supplied structured export, already mislabeled NHL with replaced team names | Zero rows; requires fresh capture |
| `pinnacle-nfl-patriots-seahawks-user.txt` | Earlier full user game-page capture, including props and partial periods | Six exact full-game rows only |
| `betmgm-nfl-detail-public.txt` | Transcribed public Patriots/Seahawks detail excerpt, September 7 | Six rows; actual decimal prices checked |
| `betmgm-nfl-list-public.txt` | Transcribed first two public NFL listing cards, September 7 | 12 rows; actual decimal prices checked |

The public BetMGM excerpts came from its [game detail](https://www.betmgm.com/en/sports/events/new-england-patriots-seattle-seahawks-6:43103) and [football listing](https://www.betmgm.com/en/sports/football-11/betting), with unrelated account, promotion and footer content omitted. They are text fixtures, not user regional DOM captures. Other variants and DOM tests use explicitly synthetic inputs.

Run `npm.cmd run test:parsers` in Windows PowerShell, or `node --experimental-vm-modules --test tests/mlb-parsers.test.cjs tests/nfl-main-lines.test.cjs`. No additional test dependencies are required. The suite covers 32 MLB tests plus 43 NFL tests, including actual extraction-function execution against synthetic DOMs, one-pass exits, malformed fields, period boundaries, aliases, normalization, fair odds and parlay calculation.

Combined Pinnacle/BetMGM fixtures produce 26 cross-book markets: 14 moneylines, seven spreads and five totals. All four supplied slates together produce 468 rows and 124 canonical markets. Different book thresholds explain some unmatched rows; the app must not silently compare 48 to 48.5.

Replaying the original 427,437-character FanDuel upload locally produces 192 rows in roughly 66 ms. The four-book normalization, matching, fair-odds and parlay calculation also completes locally in roughly 70 ms with sample filters. These measurements exclude browser rendering, the user's existing saved session and live extension execution. The reported browser freeze was **not reproduced**; the repeated wrong-sport capture loop is confirmed and fixed. No full Next.js build or agent-run live sportsbook Chrome validation was performed.

## Update and live check

1. Stop the dev server with Ctrl+C. In `C:\Users\jwde2\Documents\bet-slip-app`, run `git switch codex/mlb-capture-first-pass`, `git pull --ff-only`, then `npm.cmd run dev`. Preserve any conflicting local edits.
2. Reload EV Parlay Extractor at `chrome://extensions`; it should show **1.1.1**. Refresh EV Parlay Lab and the sportsbook tabs. Keep auto-parse ON.
3. Capture the NFL **Pinnacle listing first**, then **BetMGM Game lines**. For the supplied slates, the expected totals are 16/96 and 14/84 events/rows. Live counts/prices may change. Check Patriots/Seahawks first: six full-game rows per book and correct spread signs.
4. Enable **FanDuel sharp mode**, capture its NFL listing once, then DraftKings if wanted. Both should finish after one pass. The supplied snapshots contain 32/192 and 16/96 events/rows respectively. If the app still freezes, note whether it occurs before the import arrives or after rows appear; the old capture-loop issue alone does not establish the cause of a remaining UI freeze.
5. Capture **theScore NFL** again after reloading the extension. Check NFL team names, moneyline prices and any PK spread against the page. Send the new extension-generated text from Import Odds; the old export cannot recover the replaced names. Remove the old bad book rows or use the app's Replace book import mode before relying on the new session.
