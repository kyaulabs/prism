# 0006. Read-Only Agent Permission Contract

Date: 2026-07-09

## Status

Accepted

## Context

Several agents advertised as "read-only" in their prose contracts could
actually write to the filesystem or run arbitrary git commands (Issue #58):

- **test-audit** had no `permission` block at all — `edit` defaulted to
  `allow` and `bash` was fully open. Its description said "Produces a report
  only; makes no code changes" but nothing enforced that.
- **code-review** and **semgrep** had `edit: deny` but no bash restrictions.
  Bash was fully open — they could run `sed -i`, `git commit`, `rm`, or any
  shell command despite claiming "does not auto-fix."
- **docs-writer** (a genuinely write-capable agent that edits source files for
  PHPDoc/RCS headers) was in Plan mode's task allowlist, contradicting
  CODING_HARNESS.md's claim that Plan mode "can only invoke read-only/audit
  agents."

The `writing-skills` skill (lines 54-55) already codified the rule —
"Read-only agents deny `edit` and restrict `bash` to safe read patterns" —
but nothing enforced it. The `@architect` agent was the only one that
correctly implemented the full pattern: `edit: deny`, `bash: "*": deny`
with a scoped read-only allowlist, `webfetch: deny`, and `task: deny`.

## Decision

1. **Establish a mandatory permission contract for read-only agents.** Any
   agent whose description claims read-only (via keywords: "read-only",
   "report only", "does not modify", "makes no code changes", "does not
   auto-fix", "does not automatically fix") must carry:
   - `edit: deny`
   - `bash: "*": deny` with a scoped read-only allowlist (or `bash: deny`)
   - `webfetch: deny`
   - `task: deny`

2. **Lock down test-audit, code-review, and semgrep** per this contract,
   modeling their permission blocks on the `@architect` agent pattern. Each
   gets a bash allowlist scoped to its toolchain:
   - test-audit: `php -d pcov.enabled=1 vendor/bin/pest*` for coverage runs
   - code-review: `ocr*`, `npm install -g*`, `command -v*`
   - semgrep: `semgrep*`, `pip install semgrep*`, `command -v*`

3. **Remove docs-writer from Plan mode's task allowlist.** Plan mode is now
   truly read-only — it can only invoke `@test-audit`, `@code-review`,
   `@semgrep`, `@architect`, `@explore`, and `@scout`. Documentation writing
   happens during execution (build mode), not planning.

4. **Add a validate-harness check** that enforces the contract
   programmatically. The check scans agent descriptions for read-only keywords
   and asserts `edit: deny` + bash catch-all deny. This prevents future drift
   — new read-only agents that forget the permission block will fail
   validation.

## Consequences

- **Easier:** Read-only agents can no longer mutate the filesystem or git
  state. The prose contract ("does not modify", "report only") is now
  enforced by permissions, not just prose.
- **Easier:** The validate-harness check prevents future drift. A new
  read-only agent without `edit: deny` will fail the pre-commit validator.
- **Harder:** Plan mode can no longer delegate documentation writing to
  `@docs-writer`. Documentation tasks (PHPDoc, RCS headers) must happen
  during execution (build mode), not planning. Plans are presented as text
  in the conversation; file saving is delegated to the build agent.
- **Neutral:** `@docs-writer` remains available to the build agent and is
  unchanged in its own permissions.
- **Neutral:** The keyword-based detection is heuristic, not deterministic.
  If an agent's description uses novel phrasing to claim read-only, the
  validator may not catch it. The keyword set can be extended as needed.

## Alternatives Considered

- **Keep docs-writer in Plan allowlist, re-document the contract** — rejected:
  Plan mode's claim of being read-only would be false. The cleaner posture is
  to make the claim true.
- **Add an explicit `read_only: true` frontmatter field** — rejected: the
  keyword-based approach matches the issue's intent ("whose description
  claims read-only") and requires no schema change. An explicit field would
  be cleaner but would require editing every read-only agent's frontmatter
  and adds a field that duplicates information already in the description.
- **Extend frontmatter-parser.js for nested key access** — rejected: the
  raw text extraction approach (awk + grep on frontmatter) is consistent with
  the existing bash pattern check in validate-harness.sh and avoids modifying
  a shared script. The agent frontmatter files are small and well-structured,
  making text-based checks reliable.
- **Lock down docs-writer itself (add `edit: deny`)** — rejected: docs-writer
  is a write-capable agent by design. Adding `edit: deny` would break its
  core function of writing PHPDoc and RCS headers to source files.

## Amendments

- **2026-07-21 (issue #184):** `@explore` was belatedly brought under this
  contract. Originally shipped as an inline-only agent in `opencode.jsonc`
  with only `lsp: allow`, it inherited the permissive top-level defaults and
  could edit files and run shell commands despite its "focused exploration"
  mandate. The fix moves `@explore` to `.opencode/agents/explore.md` with the
  full read-only permission block. The validator was also extended to scan
  inline-defined agents so this drift class cannot recur. No change to the
  Decision text above — `@explore` always *should* have been compliant; this
  amendment records that the contract is now actually enforced.
