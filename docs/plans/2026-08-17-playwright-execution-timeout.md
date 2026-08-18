# Plan: raise playwright execution timeout for cold-cache chromium installs (#331)

Date: 2026-08-17 · Branch: `ci/kyau-13ad-playwright-execution-timeout` · Issue: #331

## Problem

CI "Install Playwright Chromium" step (`prism-tool.js run playwright -- install
--with-deps chromium`, `.github/workflows/ci.yml:171`) fails on cold-cache
runners with `prism-tool: tool timeout` (exit 4). The `playwright` component in
`packages/prism-php-web/toolchain.json` declares no `executionTimeoutMs`, so the
launcher falls back to the 30 s default (`process.js:15`), too short for the
~150 MB Chromium download plus system deps (observed kill at ~32 s on PR #330).

## Task 1 — Declare the component execution timeout

- [x] **Files:** `packages/prism-php-web/toolchain.json` (playwright component)

Add `"executionTimeoutMs": 300000` (5 min ≈ 10× headroom; contract bounds
MIN 1000 / MAX 600000, `contract.js:9-10`) between `versionArguments` and
`argumentPolicy`, matching the field order in
`packages/prism-core/toolchain.json:69` (ocr component).

Deliberately out of scope: `process.js` default (per-component override only),
cache key, `ci.yml` steps.

### Verification

- [x] `node packages/prism-core/scripts/prism-tool.js doctor --local-only` → GO
- [x] `bash packages/prism-core/scripts/validate-harness.sh` → pass
- [x] `node packages/prism-core/scripts/prism-tool.js run playwright -- --version`
      → timeout resolution picks up the component value (no change in behavior
      for fast commands)
- [ ] CI "Install Playwright Chromium" step on the PR run — warm-cache pass is
      trivial; cold-cache proof needs one manual `playwright-*` cache-key
      purge (human decision, not part of this branch)

### Commit message

```
ci(playwright): raise cold-cache chromium install timeout

Fixes: #331

Authored-by: deepseek-v4-flash
Implemented-by: deepseek-v4-flash
Tested-by: deepseek-v4-flash
Signed-off-by: kyau
```
