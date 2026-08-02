# 0047. Sensitive-Path Enforcement Across All Agents

Date: 2026-08-02

## Status

Accepted

## Context

Issue #288: no layer of the harness prevents an agent — or any of its
sub-agents — from reading credential files. OpenCode's only built-in secret
protection is a `read`-tool deny on `*.env`/`*.env.*`, and it does not extend
to the `bash` tool; upstream's platform protected-files list is empty on
Linux. The `@debug` investigation (human-approved, 6-phase loop) verified 304
silent-access cells and established the root causes:

1. **Permission rules match command strings, never paths.** Read-only agents
   allowlist pathless `cat*`/`head*`/`tail*`/`grep*`/`find*`; `build`,
   `design`, and `general` carry `bash "*": allow`.
2. **The shell-tool FILES-set prompt covers only a few commands** (`cat`,
   `cp`, `rm`, …). `head`/`tail`/`grep`/`sed`/`awk`/`less`/`base64`/`dd`/
   `tar`/`curl` never prompt, even outside the workspace; wrappers
   (`bash -c`, `env`, `command`, `exec`, `eval`), redirections (`cat < file`),
   and symlinks dodge even the `cat` ask. `external_directory` defaults to
   `ask`, and auto-approve mode converts every ask into an allow;
   `--dangerously-skip-permissions` bypasses everything.
3. **The safety plugin classifies bash for destructive commands only** and
   early-returns for every non-bash tool (ADR-0023/0036).
4. **No prompt-level prohibition exists** — the Hard Boundaries prohibit
   *modifying* files outside the project, not *reading* secrets.

The `@architect` review returned GO-WITH-CONDITIONS (`ADR-required: 0047`):
record the immutable deny floor, additive-only extension semantics, the four
enforcement layers, the `/setup` trusted exception, circuit-breaker behavior,
redaction, and the residual threat model.

## Decision

We add a layered sensitive-path enforcement surface. The plugin layer is
load-bearing; every other layer is defense-in-depth or instruction.

### 1. Centralized matcher as the single source of truth

A new dependency-free module `.opencode/plugins/sensitive-paths.ts` holds the
**immutable deny floor** and all matching logic:

| Path class | Pattern |
| --- | --- |
| opencode auth store | `~/.local/share/opencode/` (covers `auth.json` + sibling `mcp-auth.json`) |
| basename floor | `auth.json` / `mcp-auth.json` anywhere on the filesystem |
| review config | `~/.opencodereview/` |
| intelephense license | `~/intelephense/licen?e.txt` (both spellings) |
| user Prism manifest | `~/.config/opencode/` (prism-user-manifest class) |
| SSH | `~/.ssh/` |
| cloud credentials | `~/.aws/` |
| netrc | `~/.netrc` |
| git credentials | `~/.git-credentials` |
| TLS private keys | `/etc/ssl/private/` |
| env class | any `**/.env` and `**/.env.*` anywhere on the filesystem |

`.env.example` is the **only** env-class file agents may read. The project
`prism.jsonc` (tracked, committed) and `.opencodereview/rule.json` (tracked)
remain readable.

Matching is prefix/basename based on normalized absolute paths; `~` is
resolved against the invoking user's home. Bash commands are checked
operand-wise: segments are split, shell wrappers unwrapped (bounded depth),
operands resolved (`~`, absolute, relative, symlink-aware via realpath where
available), redirection operators skipped while their file operands are
checked, and dynamically-unresolvable operands are conservatively blocked
when a fallback regex matches a sensitive class.

### 2. Additive-only manifest extension

The deny floor is immutable in code. The Prism manifest may **only add**
paths via `security.additional_sensitive_paths` (project tier default:
`[]`; user tier overlays field-by-field per ADR-0043). Semantics:

- The plugin receives the resolved additions via `OPENCODE_SENSITIVE_PATHS`
  (newline-joined, exported by `prism_manifest.php env0` alongside the other
  env pairs; no second JSONC parser — ADR-0043's single PHP manifest-reader
  boundary is preserved).
- Additions are **unioned** with the floor; there is no disable flag, no
  removal list, and no exception list.
- Malformed additions (relative paths, control characters, non-array value)
  fail closed: the CLI exits non-zero and the plugin refuses to start.

### 3. Four enforcement layers

1. **Plugin (load-bearing)** — `pre-tool-use.ts` `tool.execute.before`
   intercepts `read`, `grep`, `glob`, and `list` by path argument, and
   `bash` via the operand check. Matches throw a generic, redacted error;
   the call is denied. Throws feed the ADR-0042 circuit breaker as denial
   events (a sensitive-path block produces a tool error part, exactly like
   the existing `rm -rf` blocks), so a stuck agent still trips after the
   threshold of 3.
2. **Permission rules (spelling-limited)** — global `read` denies for the
   env family and `auth.json`/`mcp-auth.json` basenames with `.env.example`
   re-allowed last (last-match-wins); the same five patterns appended to the
   bash objects of `build`/`design`/`general` and every agent with bash
   reader allowances; `chat`'s `read`/`glob`/`grep`/`list` become
   deny-first/allow-last objects. This layer cannot express every spelling
   (`~`, absolute, relative, wrappers) — it is defense-in-depth only.
3. **Validator contract** — `validate-harness.sh` asserts (a) the plugin
   imports and calls the matcher, (b) AGENTS.md carries the Hard Boundary
   bullet, (c) every agent with reader allowances carries the deny set
   (including inline agents via `inline-agent-permissions.js`). A regression
   at any layer turns the harness red.
4. **Prompt-level instruction** — AGENTS.md Hard Boundaries gains a
   credential-read prohibition naming prompt-injection refusal; a dedicated
   `credential-protection` skill documents the deny list, layers, bypass
   reporting, and the extension mechanism.

### 4. Trusted `/setup` boundary

The narrow human-invoked `/setup` write exception (AGENTS.md Hard Boundaries,
ADR-0043) is preserved. The matcher exempts **only** the prism-user-manifest
class for commands whose resolved executable is one of the harness's own
setup scripts under `.github/scripts/`: `migrate-setup.sh`,
`setup-write-user-config.sh`, `setup-write-project-config.sh`,
`setup-substitute.sh`, `setup-scaffold.sh`, `setup-rulesets.sh`,
`check-setup-secrets.sh`, and `prism_manifest.php`. `prism_manifest.php` is
trusted **only for the `get` and `validate` subcommands** — never
`env0`/`values0`/`decode`, whose stdout can carry secrets. All other path
classes remain enforced even for setup scripts. Additionally, `get` and
`values0` redact `env.*` values as `[redacted]`, closing CLI-based
exfiltration of manifest secrets.

### 5. Redaction

Sensitive-path block errors never include command text, resolved paths, or
credential content (ADR-0042 redaction invariant). The hook throws the
constant reason `sensitive-path policy (ADR-0047)`; diagnostics log no path
data.

### 6. Circuit breaker integration

Sensitive-path denials count toward the ADR-0042 consecutive-denial breaker
(threshold 3, `session.abort` escalation). This extends ADR-0042's denial
classes from config-deny/safety-block/ask-reject to include
sensitive-path blocks.

### 7. Residual risk (explicitly NOT an OS sandbox)

OpenCode provides no sandbox; permissions and plugin hooks are the only
enforcement surfaces. Uncloseable at the harness layer:

- Helper scripts or binaries whose operand is the script, not the credential
  (e.g. `php leak.php`), and any child process run with the user's OS
  privileges.
- Environment-variable exfiltration (`echo $DEEPSEEK_API_KEY`, `printenv`)
  and `prism_manifest.php env0` stdout capture by a hostile agent.
- Interactive PTY sessions (`vi`, bare `bash`) and MCP/LSP server internals.
- User-approved `external_directory` globs persisted per-project
  (the plugin blocks regardless of permission state).
- Upstream drift in the OpenCode evaluator, FILES set, or arity semantics
  (mitigated by the pinned SDK + version-parity tests).

## Consequences

- A new OpenCode process is required to activate the plugin and permission
  changes; existing sessions remain exposed until restart.
- ADR-0023 (bash interception scope) and ADR-0036 (fail-closed) are extended
  — not edited — to cover path-access interception; ADR-0042 is extended to
  count sensitive-path denials.
- Agents with reader allowances gain the deny set; the validator reports
  violations until the config catches up (the intended red gate).
- `.env.example`, project `prism.jsonc`, and `.opencodereview/rule.json`
  remain readable; `/setup` keeps its narrow write path.
- Users may extend the deny list via `security.additional_sensitive_paths` —
  never reduce it.

## Alternatives considered

### OS-level isolation (sandbox/container per agent)
Rejected: Prism configures OpenCode but does not provide an OS sandbox;
adopting one would break the existing permission/hook model and require
infrastructure outside the project boundary.

### Permission-layer-only enforcement
Rejected: `@debug` probe evidence — rules catch the `~` spelling but
absolute/relative/wrapper spellings bypass; a path-based rule set cannot be
expressed in the string-matching permission layer at all. The
operand-resolving plugin hook closed 2112/2112 probe cells.

### Trusting `prism_manifest.php` unconditionally for `/setup`
Rejected: `env0`/`values0`/`decode` emit secret-bearing stdout; an agent
could invoke them to read the user manifest. Trust is scoped to
`get`/`validate` plus CLI-level `env.*` redaction.

## Cross-refs

- `adr/0023-safety-hook-for-bash-tool-interception.md` (extended)
- `adr/0036-safety-hook-fail-closed-block-rules.md` (extended)
- `adr/0042-consecutive-denial-circuit-breaker.md` (extended)
- `adr/0043-prism-jsonc-manifest-migration.md` (`/setup` exception preserved)
- `docs/plans/2026-08-02-sensitive-path-enforcement.md` (implementation plan)
- `AGENTS.md` (Hard Boundaries, credential-read prohibition)
- `.opencode/skills/credential-protection/SKILL.md` (instructional layer)
- `.opencode/plugins/sensitive-paths.ts`, `.opencode/plugins/pre-tool-use.ts`

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
