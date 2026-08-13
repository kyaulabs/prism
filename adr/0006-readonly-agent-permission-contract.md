# 0006. Read-Only Agent Permission Contract

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

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

- **2026-07-22 (issue #183):** Decision point 2 granted `code-review` the
  `npm install -g*` bash permission and `semgrep` the `pip install semgrep*`
  permission, intending to let each agent auto-provision its toolchain. A
  six-model security review (issue #183, 6/6 consensus) flagged these as
  standing supply-chain RCE primitives — global npm/pip installs run
  third-party pre/postinstall scripts outside the repo boundary, so a
  prompt-injected diff could nudge a read-only agent to install an
  attacker-named package. Both grants are withdrawn; the agents now verify
  tool presence (`command -v`) and STOP with install instructions if the
  tool is missing instead of installing autonomously. The harness validator
  was extended to fail on any `npm install*` / `pip install*` grant above
  `ask`. The read-only contract (edit: deny + bash catch-all deny) is
  unchanged — only the toolchain auto-provision carve-out is withdrawn.
- **2026-07-21 (issue #184):** `@explore` was belatedly brought under this
  contract. Originally shipped as an inline-only agent in `opencode.jsonc`
  with only `lsp: allow`, it inherited the permissive top-level defaults and
  could edit files and run shell commands despite its "focused exploration"
  mandate. The fix moves `@explore` to `.opencode/agents/explore.md` with the
  full read-only permission block. The validator was also extended to scan
  inline-defined agents so this drift class cannot recur. No change to the
  Decision text above — `@explore` always *should* have been compliant; this
  amendment records that the contract is now actually enforced.
- **2026-07-22 (issue #198):** The Decision's rejected alternative "Lock down
  docs-writer itself (add `edit: deny`)" is partially superseded. docs-writer
  remains write-capable, but its `edit` permission is now a **scoped object** —
  a catch-all `"*": deny` plus explicit allows for the five source extensions
  the rcs-header skill governs (`.php`, `.js`, `.scss`, `.sh`, `.ts`) and
  `docs/**`. This closes the unconstrained-edit gap (the agent previously
  inherited the permissive default and could rewrite any file) without breaking
  its PHPDoc/RCS-header function. The blanket `edit: deny` rejection still
  holds for any agent whose job is to edit source broadly; the general-purpose
  write agents `@tdd` and `@resolve-merge-conflicts` remain intentionally
   unscoped (allowlisted) because they must edit arbitrary files. The
   validate-harness check was extended (Decision point 4) to flag any
   non-allowlisted, non-read-only agent that ships an unscoped `edit` (absent,
   flat `allow`, or an object lacking a `"*": deny`/`"*": ask` catch-all) so
   this drift class cannot recur.
- **2026-07-22 (issue #202):** The read-only contract (Decision points 1–4)
  guards agents that claim read-only in their *description*, but the inline
  primary agent `general` carries no description at all — so it fell through
  every guard. `general` set only `lsp: allow` and inherited the top-level
  permissive `permission.bash` (only `git push*` denied), leaving the most-
  invoked default agent able to `git add`/`stage`/`commit` with no gate. The
  fix gives `general` the same `bash` block as `build`/`design`
  (`"*": "allow"` + `git add*/stage*/commit*: ask` + `git push*: deny`): it
  remains a general-purpose agent, **not** read-only, so the scoped-edit and
  catch-all-bash-deny requirements do not apply — only the git-mutation gate
  was missing. (Unrestricted non-git bash is already mitigated harness-wide by
  the safety hook of ADR-0023/0036 for the destructive commands that matter:
  `rm -rf`, `DROP DATABASE`, `git push --force`, `--no-verify`.) The
  validate-harness check was extended to flag any inline agent whose `bash` is
  not a full deny but that lacks an explicit `git commit*` gate (ask/deny), so
  the inherited-default drift class cannot recur.
- **2026-07-26 (issue #210):** The #198 amendment framed `@tdd` and
  `@resolve-merge-conflicts` as "intentionally unscoped (allowlisted)" write
  agents whose commits were governed by disciplined prose cycles ("present the
  message before committing"), not by the permission layer. Issue #210 flagged
  this as fragile: a model that skips the prose step commits silently, with no
  `ask` dialog. This amendment partially supersedes that framing. Both agents'
  `"git commit*"` verdict moves from `"allow"` to `"ask"` — every commit now
  hits the permission-layer approval dialog (which shows the full command and
  message), matching `build`/`design`/`general`. The prose message-presentation
  step is retained as belt-and-suspenders (now redundant with the dialog but
  harmless). `"git add*"` stays `"allow"`: staging is reversible (`git reset`),
  does not mutate history, and gating it would throttle the tight Red-Green and
  conflict-resolution loops that make these agents productive; the #210
  acceptance criterion is commit-focused. The `edit` scoping of both agents is
  unchanged (still intentionally unscoped — they edit arbitrary source). The
  validate-harness check was extended (Decision point 4) with a `.md`-agent
  git-commit gate check mirroring the inline check added under #202: any `.md`
  agent whose bash is not fully denied must explicitly gate `"git commit*"` with
  `ask` or `deny`. This also makes the inline #202 check's comment truthful —
  it skips inline agents that have a `.md` file, claiming the `.md` path covers
  them, and that path now exists. (The `general` acceptance criterion of #210
  was already satisfied by the #202 amendment: `general` carries
  `"git commit*": "ask"`.)
