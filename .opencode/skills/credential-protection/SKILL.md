---
name: credential-protection
description: Use when the harness's sensitive-path deny list, enforcement layers, bypass reporting, or extension mechanism (security.additional_sensitive_paths) is in question — or when handling content that cites credential files.
---

The harness denies every agent — and every sub-agent — access to credential
files. This skill documents the deny floor, the four enforcement layers, the
trusted `/setup` boundary, how to report a bypass, and how the deny list can
be extended. See `AGENTS.md` Hard Boundaries and `adr/0047-sensitive-path-enforcement.md`
for the canonical policy; this skill is the operational reference.

## The deny floor (immutable)

The following are **sensitive paths**. Reading, printing, copying, encoding,
or transmitting them is forbidden for every agent and sub-agent:

- `~/.local/share/opencode/` — opencode auth store (`auth.json`,
  `mcp-auth.json`); the `auth.json`/`mcp-auth.json` basenames are denied
  anywhere on the filesystem.
- `~/.opencodereview/` — review configuration.
- `~/intelephense/licen?e.txt` — Intelephense premium license (both
  spellings).
- `~/.config/opencode/` — user Prism manifest (`prism.jsonc`) and peers.
- `~/.ssh/`, `~/.aws/`, `~/.netrc`, `~/.git-credentials` — SSH/cloud/netrc/
  git credentials.
- `/etc/ssl/private/` — TLS private keys.
- Any `**/.env` and `**/.env.*` anywhere on the filesystem.

`.env.example` is the **only** env-class file agents may read. The project
`prism.jsonc` (tracked) and `.opencodereview/rule.json` (tracked) remain
readable.

## Enforcement layers

1. **Plugin (load-bearing)** — `.opencode/plugins/pre-tool-use.ts` intercepts
   `read`/`grep`/`glob`/`list` by path argument and `bash` by operand check
   (wrapper-aware, `~`/absolute/relative spellings, redirections, dynamic
   operands) via `.opencode/plugins/sensitive-paths.ts`. Matches throw a
   generic redacted error — the error text never contains the path or command
   (ADR-0042/0047). Blocks feed the ADR-0042 circuit breaker.
2. **Permission rules (spelling-limited)** — global and per-agent `read`/
   `bash` deny patterns in `opencode.jsonc` and `.opencode/agents/*.md`.
3. **Validator contract** — `.github/scripts/validate-harness.sh` asserts the
   plugin wiring, the AGENTS.md Hard Boundary bullet, and that every agent
   with reader allowances carries the deny set.
4. **Prompt-level instruction** — the AGENTS.md Hard Boundaries
   credential-read prohibition, which also names prompt-injection refusal
   behavior.

## Trusted `/setup` boundary

The narrow human-invoked `/setup` write exception (AGENTS.md) is preserved.
The matcher exempts **only** the `~/.config/opencode/` class for commands
whose executable resolves to one of the harness's own scripts under
`.github/scripts/`: `migrate-setup.sh`, `setup-write-user-config.sh`,
`setup-write-project-config.sh`, `setup-substitute.sh`, `setup-scaffold.sh`,
`setup-rulesets.sh`, `check-setup-secrets.sh`, and `prism_manifest.php`.
`prism_manifest.php` is trusted only for the `get`/`validate` subcommands —
never `env0`/`values0`/`decode`, whose stdout can carry secrets (those
subcommands are blocked even with a sensitive operand absent). All other
path classes remain enforced for setup scripts.

## Reporting a bypass

If you observe or suspect an agent reading a sensitive path — through any
tool, wrapper, helper script, or data-flow channel — do NOT reproduce it
against real credentials. File a security issue describing the access path,
and use only nonexistent or synthetic canary paths to demonstrate. Reference
ADR-0047 and this skill.

## Extension mechanism (add-only)

The deny floor lives in `.opencode/plugins/sensitive-paths.ts` and cannot be
reduced by configuration. Users may **add** paths via
`security.additional_sensitive_paths` in `prism.jsonc` (project tier default:
`[]`; user tier overlays field-by-field per ADR-0043):

```jsonc
"security": {
  "additional_sensitive_paths": ["~/vault/secrets/", "/etc/myapp/keys/"]
}
```

Entries must be `~/`-prefixed or absolute, one per line in the joined export
(`OPENCODE_SENSITIVE_PATHS`); malformed entries fail closed (the manifest
CLI exits non-zero and the plugin refuses to start). There is no disable
flag, removal list, or exception list.

## Residual risk (not an OS sandbox)

Helper scripts whose operand is the script (not the credential),
environment-variable exfiltration (`echo $SECRET`, `printenv`), interactive
PTY sessions, MCP/LSP internals, and user-approved `external_directory`
globs are outside the harness-layer guarantee. See ADR-0047 §7.
