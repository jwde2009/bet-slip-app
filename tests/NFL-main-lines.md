# NFL main lines: Pinnacle and BetMGM

This adds pregame full-game moneyline, spread, and total rows. Pinnacle is the sharp source; BetMGM is the target. Player props, team totals, quarter/half markets, regulation-only markets, futures, live score handling, and automatic game-to-game navigation are outside this batch.

## Capture and parse

- Open an individual NFL game on Pinnacle. The parser recognizes its `Money Line – Game`, `Handicap – Game`, and `Total – Game` sections with labeled teams. Both `@` and `vs` event headings are accepted. Pinnacle's league-list layout is not newly supported by this batch.
- Unmarked Pinnacle landing cards with an NFL league label and an exact NFL team pair stop before the legacy generic parser. That parser could classify New England as soccer, Jets as NHL, and Giants/Cardinals as MLB. Unsupported NFL imports now show an individual-game instruction without changing loaded rows or the last parse timestamp. Existing incorrect rows are not silently rewritten or removed.
- On BetMGM, select **Game lines / Full game** before capture. Both the game-detail row layout and the league-list column layout are supported, including `Patriots 0-0 Seahawks 0-0` team labels, combined column headers, and inline prices. Do not infer the selected period from a copied list of dropdown options; ambiguous period runs are rejected. The extension captures currently rendered text without changing period controls or expanding player props.
- Football URL/title detection provides `NFL_CAPTURE_LEAGUE` metadata. BetMGM football captures exit before the generic prop workflow, use a single pass, and bypass the WNBA ladder pause even if the sidebar contains WNBA/Player props. Both import transports still honor the app's auto-parse toggle.
- Exact NFL lookup covers all 32 clubs, nicknames and common abbreviations. City-only labels are intentionally not enough to identify an NFL team. NFL routing runs before generic sport detection, so Giants/Cardinals/Jets/Panthers in an NFL event are not reclassified as MLB/NHL.
- American and decimal odds, EVEN, and pick-em/zero spreads are supported. Each market requires two priced sides, equal total thresholds or opposite spread lines. Locked or missing prices cannot shift subsequent columns. Unknown headings stop the current price block; neighboring events cannot supply missing fields.
- NFL spreads share an away-team-based signed market key while each selection and quote retains its own line. This lets Pinnacle's two sides de-vig together, keeps opposite alternate handicaps separate, and preserves the actual signs in fair-odds labels, single-edge results, and parlay legs.
- NFL is available in the coverage league selector. Three complete main-line pairs satisfy the current NFL coverage profile; missing pairs still show incomplete coverage.

## Evidence and tests

Run `node --experimental-vm-modules --test tests/mlb-parsers.test.cjs tests/nfl-main-lines.test.cjs`, or `npm.cmd run test:parsers` in Windows PowerShell. No additional test packages are needed.

The following public BetMGM pages were read on September 7, 2026:

- [Patriots at Seahawks game detail](https://www.betmgm.com/en/sports/events/new-england-patriots-seattle-seahawks-6:43103): `fixtures/betmgm-nfl-detail-public.txt` transcribes the relevant navigation/market excerpt with blank lines, image links and unrelated sidebar games omitted. The actual decimal prices are checked: spread 1.88/1.95, total 1.93/1.90 at 44.5, and moneyline 2.60/1.52.
- [Football league list](https://www.betmgm.com/en/sports/football-11/betting): `fixtures/betmgm-nfl-list-public.txt` transcribes the first two NFL cards and relevant section labels. Actual prices, team records and ordering are preserved. Other games, promotions and account/footer content are omitted.

These are public page-text excerpts, not captures from the user's regional extension. Their prices are dated test data. They must not be presented as current betting quotes. American replacements, alternate spreads and profitable target prices used in other tests are explicitly synthetic.

The user subsequently supplied the full Patriots–Seahawks game-page text after trying both books' NFL landing and game pages. `fixtures/pinnacle-nfl-patriots-seahawks-user.txt` transcribes that supplied capture, including expanded partial periods, props and footer. Its six actual full-game prices pass unchanged: Patriots/Seahawks moneyline +156/-178; spreads +3.5 -114 and -3.5 +101; Over/Under 44.5 -103/-113. The capture has no NFL extension metadata, so this also verifies direct text routing by its Football/NFL/event labels. No expanded props or partial-period prices leak into those six rows.

Other Pinnacle NFL cases still use synthetic values. The legacy landing regression deliberately uses the old parser's accepted token order to reproduce its sport guesses; it is not a user landing-page fixture and does not establish how Pinnacle's current NFL columns should be read. The user's actual NFL landing-page capture is still needed for slate parsing. Public search found the NFL page, but the live browser connection timed out before a current NFL table could be inspected. No access-control workaround or unobserved API was used.

All 53 regression tests pass. They check both parsers, period and event boundaries, incomplete/mismatched fields, NFL aliases, cross-book matching, fair odds, both spread signs through parlay generation, coverage and single-pass capture. Existing MLB tests also check football captures do not trigger the WNBA import pause. The user's app export shows 14 BetMGM NFL events with six rows each and one correctly labeled Pinnacle NFL game, alongside older/misclassified Pinnacle entries after their landing-page attempt. It does not include BetMGM's prices, so their exact field values remain unverified. No full Next.js build or agent-run live NFL Chrome validation has been completed.

## Surface update and first check

1. Stop the dev server with Ctrl+C. In `C:\Users\jwde2\Documents\bet-slip-app`, run `git switch codex/mlb-capture-first-pass`, `git pull --ff-only`, and `npm.cmd run dev`. Preserve any conflicting local edits instead of discarding them.
2. Reload EV Parlay Extractor at `chrome://extensions`; its version should show **1.1.0**. Refresh EV Parlay Lab and the sportsbook pages.
3. Open one NFL game's full-game markets on **Pinnacle first**, then the same game on **BetMGM**, and run the extension once on each. Expect six rows per book when all three market pairs are available, NFL labels, Pinnacle sharp and BetMGM target.
4. If rows are missing, copy the extension-generated text from the app's Import Odds text box. Whole-page Markdown omits the input and editable prices and is not sufficient to check field values.
