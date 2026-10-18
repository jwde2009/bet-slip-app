# Windows test and dependency review — October 18, 2026

## Reproduction and repair

John's complete log at commit `5b18ec9` reports 161 tests, 150 passing and 11 failing. All 11 failures were reproduced on Linux by converting the fixture `.txt` and `.md` files to CRLF, then restoring their original bytes. The test setup used LF-only multi-line replacements to construct partial periods, missing cells and alternative prices. On CRLF fixtures those replacements did nothing, so the assertions were testing unchanged full-game captures. This reproduction is not a native Windows run.

The MLB/NFL test readers now canonicalize line endings before performing those mutations. Existing expectations are unchanged; no production parser guard was removed. Four additional tests feed LF and CRLF directly to the production NFL parsers, require identical full-game quotes, assert that partial-period mutations really changed the input, and require both encodings of partial-period input to produce no rows. The retained BetOnline test setup received the same normalization; no BetOnline features were added.

After repair: 165/165 pass with normal fixtures and with all text/Markdown fixtures converted to CRLF. CI now includes a native Windows runner with `core.autocrlf=true` as well as Linux, with dependency scripts disabled. The prior 161-pass Linux CI result was not evidence of Windows correctness. The user's local rerun and live sportsbook validation remain separate checks.

## Dependency repair and verification

Registry metadata and the official [Next.js 16.4.2 release](https://github.com/vercel/next.js/releases/tag/v16.4.2) confirm the compatible version. Both `next` and `eslint-config-next` move from 16.2.2 to 16.4.2. Next's engine requirement remains Node >=20.9.0 and its peer range accepts the existing React 19.2.4. Compatible transitive patches were applied with non-force `npm audit fix --ignore-scripts`; no arbitrary overrides or major ESLint downgrade were introduced.

The maintainer's [Windows RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) lists 16.x below 16.3.3 as affected. The selected newer version also clears the other registry-reported Next advisories. The lockfile updates sharp to 0.35.5 ([maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)) and PostCSS to 8.5.23 ([maintainer advisory](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849)), plus compatible Babel, browser-data, YAML, nanoid, source-map and brace-expansion fixes.

The original audit reproduced 16 findings: 1 critical, 12 high, 2 moderate and 1 low. After the changes, `npm audit --omit=dev` reports **zero**. Full `npm audit` reports **five high** entries, all the same development chain:

`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces@3.0.3`

The [reviewed braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release; the registry's latest braces remains 3.0.3. This residual issue affects deeply nested untrusted glob patterns in development tooling. It is not included in the production-only audit. We retain the matching Next ESLint config instead of downgrading it to 14.2.35 or hiding the finding. Avoid passing untrusted glob patterns to the lint tooling; revisit when upstream ships a compatible repair. Audit counts are time-dependent, not a permanent guarantee.

## Scripts, limits and safe updates

A clean install with `npm ci --ignore-scripts` succeeds. sharp's installed prebuilt module produces a tiny PNG without running lifecycle scripts. No blanket pending-script approval was issued for sharp, tesseract.js or unrs-resolver. OCR runtime downloads and live extension operation are not established by a parser/build test.

[Update commands](PR3-testing.md#october-18-update-the-clean-windows-test-worktree) fetch the latest draft into the existing clean detached test worktree, retain untracked logs, stop on tracked edits or failed checks, and leave the original checkout intact. No merge, deployment or account/payment action was performed.
