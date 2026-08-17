# prism-core safety extension

The single retained extension of the KYAULabs harness (ADR-0056). It ports the
opencode-era safety stack — `sensitive-paths` + `pre-tool-use` +
`denial-circuit-breaker` — to a [pi](https://pi.dev) extension wired to the
`tool_call` event.

This directory is a **port**, not a rewrite. The pure logic is copied verbatim
from the opencode-era plugins in the source repo; only the opencode wrapper
became a pi extension. The classifier internals were later restructured by the
2026-08-16 code-complexity audit remediation (per-policy rule table,
`judgeToken` predicate, shared `resolvePathToken`, dead tracker removal)
without changing any behavior or policy (ADRs 0023/0025/0036/0042/0047/0048/0056).

## Files

| File | Origin | Change |
| --- | --- | --- |
| `sensitive-paths.ts` | opencode-era `sensitive-paths` plugin | **Verbatim port, later restructured.** Pure path/operand classifier + deny floor. The audit remediation extracted the `judgeToken` predicate and the shared `resolvePathToken` resolver (also used by `pre-tool-use.ts`). No opencode imports to strip. |
| `denial-circuit-breaker.ts` | opencode-era `denial-circuit-breaker` plugin | **Verbatim, later restructured.** Pure `DenialCircuitBreaker` state machine. The audit remediation exported `DEFAULT_THRESHOLD` (no behavior change). The opencode-era `DenialOutcomeTracker` correlator was deleted (dead code — the pi wrapper uses the breaker directly, see below). |
| `pre-tool-use.ts` | opencode-era `pre-tool-use` plugin (classifier half) | **Near-verbatim, later restructured.** `ClassifyOptions` gained `safeRelDirs?: readonly string[]` so the safe zones are adapter-driven (ADR-0056 step 5). The audit remediation split `classifyCommandImpl` into a per-policy rule table (`SEGMENT_RULES`/`COMMAND_RULES`) and made `resolveTarget`/`MAX_UNWRAP_DEPTH` delegate to the shared `sensitive-paths.ts` resolver. The opencode `Plugin`/`Hooks` wrapper, `escalate()`, and the compile-time SDK guards were dropped (replaced by `index.ts`). |
| `index.ts` | **new** | The pi wrapper. Replaces the opencode `tool.execute.before` / `event` / `tool.execute.after` hook shape with `pi.on("tool_call" \| "tool_execution_end" \| "agent_end" \| "session_start" \| "session_shutdown")`. |
| `../safe-dirs.json` | **new** | Core default `rm -rf` safe zones. |

## What it enforces

1. **Sensitive-path deny floor (ADR-0047 / ADR-0048).** `read` / `grep` /
   `find` / `ls` are blocked when a path argument (or glob/include pattern)
   resolves into the deny floor: `.env` / `.env.*` (except `.env.example`),
   `auth.json` / `mcp-auth.json`, `~/.ssh/`, `~/.aws/`, `~/.netrc`,
   `~/.git-credentials`, `/etc/ssl/private/`, and the historical opencode
   auth/manifest paths. `bash` operands resolving into the floor are blocked
   too. A leading `@` (pi/curl file-ref) is stripped before resolution.
2. **Destructive-command classifier (ADR-0023 / ADR-0036).** `bash` commands
   are classified: `rm -rf` outside safe zones, `find -delete` /
   `find -exec rm`, `git push --force`, and `--no-verify` / scoped `-n` are
   **blocked**; `DROP DATABASE/TABLE/SCHEMA`, `git reset --hard`, and
   `git push --delete` are **warned**.
3. **Consecutive-bash-denial circuit breaker (ADR-0042).** Three consecutive
   blocked bash calls in one session trip the breaker. Once tripped, **every**
   subsequent `tool_call` is blocked (fail closed) and the user is notified to
   `/new`. The escalation message is redacted — no command text, args, output,
   or metadata; only identity and count.

## ADR-0042 simplification (pi vs opencode)

In opencode, a denial was detected by correlating `message.part.updated`
tool-part states (`error` with no matching `after`) with `tool.execute.after`
hooks — the "Probe-3" structural predicate. pi collapses this: **returning
`{ block: true, reason }` from a `tool_call` handler is unambiguously a
denial.** So the wrapper drives the pure `DenialCircuitBreaker` directly:

| Event | Action |
| --- | --- |
| `tool_call` (bash) returns blocked | `breaker.observe(sid, true)` — increment; on the trip transition, redacted escalation |
| `tool_execution_end` (bash executed) | `breaker.observe(sid, false)` — reset streak |
| `agent_end` | `breaker.reset(sid)` — clear the session streak (was `session.idle`) |
| `session_shutdown` | `breaker.clearAll()` |

Blocked bash calls never reach `tool_execution_end` (the tool did not run), so
only successful executions reset the streak. The opencode-era
`DenialOutcomeTracker` (the part/`after` correlator) was deleted as dead code
— the pi wrapper drives the breaker directly.

## Fail-closed invariants (ADR-0036)

Preserved verbatim from the opencode plugins:

- `classifyCommand` wraps its body in `try/catch` → a classifier internal
  error returns a **BLOCK** finding (never an allow).
- Present-but-malformed tool args (non-string command/path) **block**.
- The sensitive-path deny floor cannot be bypassed by option-prefixed,
  assignment-shaped, glued, or `@`-prefixed tokens (see the ADR-0048 review
  follow-up notes in `sensitive-paths.ts`).

## Adapter `safe-dirs.json` contract

The `rm -rf` safe zones are **adapter-driven** (ADR-0056 step 5). The wrapper
resolves them per session (`session_start`), in this order:

1. **Project-local adapter drop point** `<cwd>/.pi/safe-dirs.json` — when a
   stack adapter (e.g. `@kyaulabs/prism-php-web`) is installed
   project-locally, it links/drops its `safe-dirs.json` here. Present → used
   (it **replaces** the core default).
2. **Core default** `packages/prism-core/safe-dirs.json` (next to this
   extension), shape `{ "safe_rm_dirs": ["node_modules", ".git", ".pi/npm",
   ".pi/git", ".pi/prism-tool/work"] }`. The candidate workspace is the
   only safe Prism setup path; its parent remains outside the cleanup zone.
3. **Fail-closed default** — no project-relative safe zones when neither
   JSON source resolves (every `rm -rf` is blocked).

OS temp dirs (`/tmp`, `/var/tmp`, `os.tmpdir()`) are hardcoded in
`pre-tool-use.ts` (`SAFE_ABS_DIRS`) and are not adapter-driven.

An adapter's `safe-dirs.json` has the same shape, e.g.
`packages/prism-php-web/safe-dirs.json`:

```json
{ "safe_rm_dirs": ["vendor", "cdn/css", "cdn/javascript", "node_modules", ".pi/npm", ".pi/git"] }
```

## Sensitive-path extension surface

The deny floor is user/project-extensible via environment variables
(`loadAdditionalSensitivePaths`, verbatim from opencode):

- `PRISM_SENSITIVE_PATHS` — newline-joined `~/`-prefixed or absolute paths.

Entries are concatenated onto the core deny floor. A malformed entry throws inside
`loadAdditionalSensitivePaths` (fail closed, ADR-0047); the wrapper surfaces
it loudly and keeps the core `DEFAULT_PATTERNS` deny floor active rather than
aborting every session over a bad env var.

## Smoke tests (Stage 1 verification gate)

```bash
# Sensitive read is blocked (use a canary .env if ~/.ssh is absent):
pi -e packages/prism-core/extensions/safety --no-session -p "read /home/you/tmp/canary/.env"

# rm -rf outside safe zones is blocked:
pi -e packages/prism-core/extensions/safety --no-session -p 'run: rm -rf /etc'

# rm -rf inside a safe zone is allowed:
pi -e packages/prism-core/extensions/safety --no-session -p 'run: rm -rf node_modules'

# --no-verify / scoped -n is blocked:
pi -e packages/prism-core/extensions/safety --no-session -p 'run: git commit -n -m "x"'
```
