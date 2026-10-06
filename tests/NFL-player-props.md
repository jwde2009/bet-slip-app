# NFL player props: theScore-first integration

This extends PR #1 on top of commit 66f2982, preserving all ten existing commits (including import responsiveness and the NFL main-line guards). It does not replace the earlier multi-book extension or merge abandoned historical branches.

## Scope

- App imports add full-game Pinnacle and theScore player props after the existing book parser. Passing yards, passing TDs, passing attempts/completions/interceptions, rushing yards/attempts, receiving yards, receptions, the supported combined-yard labels and touchdowns scored have separate canonical types. Players at the same threshold remain separate subjects.
- Pinnacle's supplied October 5 Atlanta/New Orleans capture has 57 priced Over/Under prop pairs: 114 prop rows in addition to the six previously supported main-line rows. The fixture is user-provided captured text, not a live odds feed.
- theScore keeps its structured export. A classic service-worker bootstrap delegates non-NFL pages to unchanged background.js and visits allowlisted tabs only on the current NFL event URL. It opens details/show-more controls, never selections, and records observed tabs, drawer text and skipped layouts in bounded diagnostics. The current implementation is a first live-validation candidate; selectors and tab variants are not confirmed against the October 5 live page.
- Explicit equal-line O/U pairs are required. Integer N+ counting-stat ladders become Over N-0.5. Anytime TD Yes/No becomes scored touchdowns Over/Under 0.5; first/last touchdown and passing TDs are not conflated with that market. Missing/locked table cells retain their positions; ambiguous column counts are rejected.

## Verification

Run `node --experimental-vm-modules --test tests/*.test.cjs`, extension syntax checks, and `npm run build -- --webpack`. The added GitHub Actions workflow runs those checks on the complete repository. Local mocked-DOM checks are explicitly synthetic, not live-browser validation. No bet placement, account access, or saved session migration is part of this change.

## Next live validation

Pull the combined branch/main after merge, restart the app, reload EV Parlay Extractor (version 1.2.0) and refresh the sportsbook page. Start at theScore's NFL event Popular tab and run the extension once. Use the app's full-text download to share the capture if no props appear; the THESCORE_NFL_PROPS_VERSION and THESCORE_NFL_DEBUG lines identify this capture path and show actual tab/drawer labels. Reparse the supplied Pinnacle capture for a 120-row reference check.

## Still excluded

Halves/quarters, team totals, first/last TD, live-game props, unsupported/ambiguous layouts, and the other books' NFL player-prop navigation are not claimed complete. Fresh prices and actual website tab navigation still require the user's browser check. The existing NFL main-line tests deliberately continue to exercise the original lower-level main-line parsers; the added router test exercises the combined import.
