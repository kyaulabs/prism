# Prism Core safety extension

This is Prism's sole pi extension. It intercepts `tool_call` events to protect
credential paths, classify destructive shell commands, count blocked Bash
calls, and enforce the exclusive commit boundary.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `sensitive-paths.ts` | Resolve path operands and enforce the credential deny floor |
| `pre-tool-use.ts` | Classify Bash commands and apply safe-directory policy |
| `denial-circuit-breaker.ts` | Track blocked Bash calls in a bounded session window |
| `commit-create-guard.ts` | Recognize the one supported commit operation and reject sibling calls |
| `fatal-commit-latch.ts` | Retain fatal commit failure state until extension teardown |
| `index.ts` | Register pi lifecycle handlers and publish redacted diagnostics |
| `../../safe-dirs.json` | Define Core project-relative `rm -rf` safe zones |

## Sensitive paths

The extension blocks `read`, `grep`, `find`, `ls`, and Bash operands that
resolve into the deny floor. The protected set includes:

- `.env` and `.env.*`, except `.env.example`;
- `auth.json` and `mcp-auth.json`;
- `~/intelephense/licen?e.txt`;
- `~/.ssh/` and `~/.aws/`;
- `~/.netrc` and `~/.git-credentials`;
- `/etc/ssl/private/`;
- retained historical authentication and manifest locations needed for
  compatibility checks.

Option prefixes, glued arguments, assignment-shaped tokens, and a leading `@`
do not bypass path resolution. Present-but-malformed path or command arguments
fail closed.

Projects may append newline-delimited absolute or `~/` paths through
`PRISM_SENSITIVE_PATHS`. Invalid entries are reported with a redacted error.
The built-in deny floor remains active.

## Destructive commands

The Bash classifier blocks:

- `rm -rf` outside approved safe directories;
- `find -delete` and `find -exec rm`;
- forced Git pushes;
- Git hook bypass through `--no-verify` or the scoped `-n` form;
- command or process substitution, backticks, ANSI-C quoting, here-strings, and
  recursive shell-wrapper payloads that the tokenizer cannot model safely.

It warns on `DROP DATABASE`, `DROP TABLE`, `DROP SCHEMA`, `git reset --hard`,
and branch or tag deletion pushes. Warnings are advisory and are not a security
boundary.

Numeric literal arithmetic is accepted. Identifier-based arithmetic, nested
expansion, delayed evaluator payloads, unsafe indexed reads or assignments, and
parameter-constructed recursive evaluation fail closed.

Remote and container executors such as SSH, Docker, Kubernetes, `nsenter`,
`chroot`, and `systemd-run` are outside the local safe-zone model. Their remote
payloads are not treated as safely classified local commands.

## Commit latch

The only supported ordinary commit form is one standalone Bash call to
`prism-tool commit create`. Environment prefixes, wrappers, redirections,
compound commands, malformed controls, and sibling tool calls are fatal unsafe
attempts.

An allowed commit call is tracked until `tool_execution_end`. A failed,
policy-blocked, ambiguous, or unresolved call trips the fatal latch, calls
`ctx.abort()`, and blocks every later tool. `agent_end` does not clear the
latch. `/reload` tears down the extension and resets the process-local state.

Fatal diagnostics never include command text, arguments, output, paths,
branches, providers, or session metadata.

## Denial circuit breaker

Three blocked Bash calls within the last ten Bash calls trip the denial circuit
breaker. Once tripped, every later tool call is blocked for the current agent
run. Successful Bash calls age the window but do not immediately erase earlier
denials. `/reload` resets the extension while preserving the conversation.

The denial diagnostic reports only the redacted category and count. It does not
include commands, arguments, output, or repository data.

## Safe-directory data

At `session_start`, the extension selects project-relative `rm -rf` safe zones
in this order:

1. `<project>/.pi/safe-dirs.json` from the active project-local adapter;
2. Core's packaged `safe-dirs.json`;
3. no project-relative safe zones when neither source is valid.

The data shape is:

```json
{
  "safe_rm_dirs": [
    "node_modules",
    ".git",
    ".pi/npm",
    ".pi/git",
    ".pi/prism-tool/work"
  ]
}
```

An adapter file replaces the Core default rather than extending it. Entries
must be contained project-relative directories. The candidate workspace is the
only Core setup cleanup zone; its parent is not safe. OS temporary directories
remain hardcoded absolute safe zones.

## Redacted diagnostics

The extension exposes stable categories instead of raw tool content. Current
categories distinguish sensitive-path matches, malformed inputs, unsupported
shell constructs, destructive-command blocks, denial-breaker trips, and fatal
commit state.

An internal classifier exception returns BLOCK. Unsafe or unreadable
`safe-dirs.json` data removes project-relative cleanup permission. Unsafe
additional sensitive-path data leaves the Core deny floor active. The extension
never falls back to allow on parser or policy failure.

## Known limits

- Advisory Git and SQL warnings can be bypassed by deliberate obfuscation.
- Remote executor payloads are not classified as local operations.
- The tokenizer rejects some benign shell syntax because it cannot prove the
  syntax inert across supported shells.
- The denial breaker and commit latch are process-local extension state, not
  durable session records.
- The extension does not replace Git protections, operating-system permissions,
  repository review, or credential rotation.

## Port provenance

The sensitive-path classifier, destructive-command classifier, and original
denial state machine were ported from Prism's OpenCode-era plugins. The live
compatibility rule is structural: pi returns `{ block: true, reason }` directly
from `tool_call`, so denial detection no longer needs the old tool-part and
post-execution correlator. The pure classifiers retained their fail-closed
semantics; later refactors changed structure and windowing without weakening
the policy.

## Smoke tests

Use disposable canary data. Never test with a real credential file.

```bash
pi -e packages/prism-core/extensions/safety --no-session -p "read /home/you/tmp/canary/.env"
```

```bash
pi -e packages/prism-core/extensions/safety --no-session -p "run: rm -rf /etc"
```

```bash
pi -e packages/prism-core/extensions/safety --no-session -p "run: rm -rf node_modules"
```

```bash
pi -e packages/prism-core/extensions/safety --no-session -p "run: git commit -n -m x"
```

The first, second, and fourth commands should be blocked. The third should be
allowed only when `node_modules` is in the active safe-directory data.
