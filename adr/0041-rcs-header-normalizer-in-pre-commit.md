# 0041. RCS Header Normalizer in Pre-Commit Hook

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-28

## Status

Accepted

References ADR-0015 (index-based linting in the pre-commit hook — the same hook's
RCS normalizer section). Does not supersede any ADR.

## Context

The `rcs-header` skill documented the `$KYAULabs:` header as a "one-time
creation marker" that should "never [be] update[d]" after creation. However, the
pre-commit hook (`.github/hooks/pre-commit`, lines 182–344) implements an
idempotent "strip-then-insert" normalizer that, on every commit:

1. Strips **all** existing `$KYAULabs:` headers and `vim: ft=` modelines from the
   staged blob (line 271).
2. Rebuilds the file with exactly one canonical header using the committer's
   current identity (`git config user.email` username @ `hostname`) and **today's
   date** (`date '+%Y/%m/%d %z'`, line 190), plus one canonical vim modeline.
3. Re-stages the file if the normalized content differs from the original staged
   blob (lines 337–340).

This means the header's date field is refreshed to the commit date on every
commit. The header is effectively a **last-commit-touched marker**, not a
creation marker. The skill documentation drifted out of sync with the hook's
actual behavior, creating confusion — e.g., a debugging session for #256
observed the date bump from `2026/07/26` → `2026/07/28` and initially flagged it
as a rule violation before discovering the normalizer.

The hook also enforces a placeholder guard (lines 156–180): a staged file whose
header contains literal `creator@host` or `YYYY/MM/DD` template text blocks the
commit, forcing the author to supply real values (or let the normalizer add
them).

## Decision

We accept the hook's normalizer behavior as canonical and align the documentation
to match. The `$KYAULabs:` header is a **last-commit marker managed by the
pre-commit hook**; authors never hand-edit it. The `rcs-header` skill is updated
to describe the normalizer accurately.

We do **not** change the hook to preserve creation dates. The strip-then-insert
design ensures canonical formatting on every commit: duplicate or malformed
headers are collapsed, the identity fields stay current, and the vim modeline is
always present and correct.

## Consequences

- **Positive:** Every committed source file always has exactly one canonical
  header with consistent formatting. No manual header maintenance is required.
  Duplicate or stale headers (e.g., from copy-paste or merge) are auto-collapsed.
  The vim modeline is guaranteed present and correct.
- **Negative:** The header date does not record the original creation date — git
  history is the source of truth for creation provenance. `git blame` on the
  header line shows the last commit, not the first. Manual edits to the header
  are silently overwritten on the next commit.
- **Neutral:** The `$KYAULabs:` marker is provenance metadata; it carries no
  runtime or build significance. The pre-commit hook only processes
  `.php`/`.js`/`.scss`/`.sh`/`.ts` files — markdown, JSON, and YAML are exempt.

## Alternatives Considered

1. **Preserve creation date** — change the hook to only add headers to files
   missing one, never rewrite existing headers. Rejected because it forgoes the
   normalizer's canonical-formatting guarantee: duplicate headers, malformed
   modelines, and stale identity fields would persist undetected. The hook was
   deliberately built as strip-then-insert (its own comment calls it an
   "idempotent normalizer").
2. **Remove the date field** — drop `YYYY/MM/DD ±TZ` from the canonical header.
   Rejected because the date provides quick at-a-glance provenance without
   `git log`, and the normalizer's idempotency depends on rebuilding the full
   canonical line each time.
3. **No in-file header (git-blame only)** — remove `$KYAULabs:` entirely and rely
   on `git blame` for provenance. Rejected as out of scope; the RCS-style header
   is an established project convention across the entire codebase.
