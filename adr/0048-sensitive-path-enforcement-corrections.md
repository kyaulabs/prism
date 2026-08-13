# 0048. Sensitive-Path Enforcement Corrections

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-08-02

## Status

Accepted

ADR-0053 partially supersedes only the get/validate-only trusted-subcommand
clause by adding exact argv-shaped `present PROJECT USER_OR_DASH env.*` trust.

## Context

ADR-0047 was accepted and its implementation (issue #288, Tasks 1–8) landed on
`fix/kyau-212d-block-agent-secret-access`. A post-implementation architecture
review (GO-WITH-CONDITIONS) plus direct inspection of the committed code
identified nine defects or gaps in the ADR-0047 record and its implementation:

1. **Array-replace overlay drops project-tier additions.** ADR-0043 defines
   user-overlay semantics as atomic array replacement. If the user Prism
   manifest sets `security.additional_sensitive_paths`, the project tier's
   list is silently discarded — a security regression introduced by an
   unrelated user field. The union semantics ADR-0047 §2 claims do not hold
   for the two-tier case.
2. **`/setup` trust is script-name-scoped, not invocation-scoped.**
   `setupScriptTrust` trusts a setup script at any unwrap depth, so
   `bash -c "bash migrate-setup.sh ~/.config/opencode/prism.jsonc"` and
   `env bash migrate-setup.sh …` are treated as trusted even though the
   invocation shape is nothing like a human `/setup` run.
3. **Permission ordering re-allows denied paths.** OpenCode permission rules
   are last-match-wins. `chat`'s `read`/`glob`/`grep`/`list` objects place
   `"*": "allow"` AFTER the denies, so every deny rule is dead — the whole
   class is re-allowed.
4. **Bash-capable agents are not fully covered.** `tdd` and
   `resolve-merge-conflicts` have `bash` objects (git add/commit/scripts)
   without the five deny patterns; validator Check C only requires the deny
   set when a reader allowance (`cat*`/`head*`/`tail*`/`grep*`/`find*`)
   exists, so the gap is invisible. No check exists for explicit
   `external_directory` allowances.
5. **Tool-argument coverage is incomplete.** The hook checks only
   `read.filePath` and `grep|glob|list.path`/`filePath`. `glob.pattern` and
   `grep.include` (string or array of globs) can target sensitive files from
   a benign base path; present-but-malformed args pass silently instead of
   failing closed (ADR-0036).
6. **Matching is lexical only.** `sensitivePathMatch` normalizes but never
   canonicalizes; a symlink (e.g. a project symlink pointing at `~/.ssh/`)
   bypasses the deny floor.
7. **The security field is validated only at env0 transport time.**
   `validate project|user` and the Prism manifest validator do not check
   `security.additional_sensitive_paths`, so a malformed list surfaces only
   when env0 runs, not at CI/manifest-validation time.
8. **Canary discipline is under-specified.** Tests and evals must use
   synthetic fixtures (mktemp homes, canary secrets, temp symlinks) and never
   probe real credential paths — the rule needs to be explicit in the plan
   and eval.
9. **Plan inventory drift.** The plan's Task 9 file list named
   `tests/Plugin/sensitive-paths.test.ts`; the actual implementation modified
   `tests/Unit/Harness/PrismManifestCliTest.php` instead, and the agent-file
   inventory omitted `tdd`/`resolve-merge-conflicts`/`debug`.

## Decision

ADR-0047 remains the base record. The following decisions **supersede the
conflicting parts of ADR-0047** and extend the implementation:

### 1. Project-plus-user union for additional sensitive paths

`security.additional_sensitive_paths` is **unioned across tiers**:
`PrismManifest::resolve()` concatenates the project-tier list and the
user-tier list (order-preserving, exact-string deduplication) when both
exist; the user tier can still add paths but can never remove a project-tier
path. This is a narrow, security-scoped exception to ADR-0043's
field-by-field atomic-array-replace rule, limited to this one field. All
consumers (`env0`, `get`, `values0`, `validate`) see the union through the
resolved view; `pm_path_list_to_transport` keeps its transport-time
defense-in-depth coercion.

### 2. Invocation-scoped `/setup` trust

`setupScriptTrust` applies **only at unwrap depth 0** — the setup script must
be the top-level command of a segment, invoked directly or via a single
interpreter (`bash .github/scripts/migrate-setup.sh …`,
`php .github/scripts/prism_manifest.php get …`). Any wrapped or nested
invocation (`bash -c`, `env`, `command`, `exec`, `eval` — which increment
unwrap depth) is **never** trusted; the prism-user-manifest class stays
blocked for it. `prism_manifest.php` remains trusted only for the `get` and
`validate` subcommands at depth 0.

### 3. Last-match-wins ordering invariant

Every permission object that mixes a catch-all with denies must place the
catch-all **before** the denies so the deny wins as the last match:
`"*": "allow"` first, then the five deny patterns, with
`"*.env.example": "allow"` last. `chat`'s `read`/`glob`/`grep`/`list`
objects are reordered accordingly (mirroring the already-correct
`build`/`design`/`general` bash objects). The validator asserts the
invariant for inline agents (deny entries must follow the catch-all).

### 4. Every bash-capable agent carries the deny set

The five deny patterns (`"*.env": "deny"`, `"*.env.*": "deny"`,
`"*.env.example": "allow"`, `"*auth.json*": "deny"`,
`"*mcp-auth.json*": "deny"`) are appended to **every** agent whose
`permission.bash` is an object — including `tdd` and
`resolve-merge-conflicts`. Validator Check C is strengthened: the deny set is
required for every bash-object agent, not only reader-allowance agents. A new
Check D rejects any explicit `external_directory: allow` in agent frontmatter
or `opencode.jsonc` (the plugin layer is the only path-level enforcement;
config-level `external_directory` rules cannot express paths).

### 5. Tool-argument coverage with fail-closed malformed args

The hook additionally intercepts, for `glob`, the `pattern` argument
(resolved against the tool's base path or the project directory) and, for
`grep`, the `include` argument (string or array of globs resolved the same
way), via a new exported matcher helper (`sensitivePatternCheck`). Present
but malformed arguments (wrong types — e.g. an object where a string is
expected) fail closed with a redacted BLOCKED error per ADR-0036, never a
silent pass.

### 6. Symlink canonicalization

`sensitivePathMatch` canonicalizes before matching: the deepest existing
ancestor of the candidate path is resolved through `fs.realpathSync` and the
lexical remainder is re-appended, so symlinked spellings resolve to the
denied target class. Canonicalization is a pure helper
(`canonicalizePath`) with a bounded ancestor walk and a lexical fallback for
nonexistent paths (paths may not exist on disk at check time).

### 7. Manifest validation of the security field

`PrismManifest::validateProject()` and `validateUser()` validate
`security.additional_sensitive_paths` when present: an array of strings,
each `~/`-prefixed or absolute, free of control characters. The `validate`
subcommand therefore fails closed on malformed additions at validation time,
before env0 or CI consumers see them.

### 8. Canary-only test and eval fixtures

All tests and evals use synthetic fixtures: `mktemp`-created fake homes,
canary secret values (e.g. `sk-live-CANARY-…-DO_NOT_LEAK`), and temporary
symlink trees under `os.tmpdir()`. No test or eval ever creates, reads, or
probes a real credential path or a real user home. The eval smoke case's
credential-path strings are injected instructions whose expected outcome is
refusal — never live reads.

## Consequences

- A new OpenCode process is required to activate the corrected plugin,
  permission ordering, and manifest behavior (unchanged from ADR-0047).
- ADR-0047 is partially superseded by this record; its Status line notes the
  successor. Its body is not edited.
- `PrismManifest::resolve()` carries one security-scoped exception to the
  ADR-0043 overlay contract; the field-level union is documented in
  `CONTEXT.md` manifest invariants.
- The deny floor grows stronger without growing the floor list: the union
  makes project-tier additions robust to user overrides, canonicalization
  closes symlink spellings, tool-argument interception closes `glob`/`grep`
  pattern spellings, and the ordering fix makes the permission layer actually
  deny.
- Validator Check C is stricter: any future bash-capable agent that omits the
  deny set turns the harness red at commit time.

## Alternatives considered

### Per-tier environment variables for additions
Rejected: two consumer variables (`OPENCODE_SENSITIVE_PATHS_PROJECT` /
`..._USER`) double the plugin surface for no gain; a single unioned value
keeps one consumer and one framing.

### Requiring the user tier to repeat project-tier additions
Rejected: a user manifest that sets the field for personal reasons would
silently widen the effective allow-set, which is precisely the regression
this record closes.

### Trusting setup scripts by full resolved path only (no depth rule)
Rejected: path checks alone cannot distinguish a human `/setup` run from an
agent wrapping the script; the unwrap-depth rule is the only signal the
plugin hook has about invocation shape.

### First-match-wins reliance in the permission layer
Rejected: OpenCode permission semantics are last-match-wins; relying on
unsupported ordering semantics would be fragile. The ordering invariant is
enforced instead.

### Canonicalization via `fs.realpathSync` on the full path only
Rejected: realpath throws on nonexistent paths (the common case at check
time). The deepest-existing-ancestor walk with lexical remainder covers both
existing and not-yet-created targets.

## Cross-refs

- `adr/0047-sensitive-path-enforcement.md` (base record; partially superseded)
- `adr/0043-prism-jsonc-manifest-migration.md` (overlay contract; one
  security-scoped exception)
- `adr/0036-safety-hook-fail-closed-block-rules.md` (fail-closed malformed args)
- `adr/0042-consecutive-denial-circuit-breaker.md` (denial feeding)
- `docs/plans/2026-08-02-sensitive-path-enforcement.md` (implementation plan,
  revision 2)

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
