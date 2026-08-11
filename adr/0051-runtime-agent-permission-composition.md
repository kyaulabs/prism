# 0051. Runtime Agent-Permission Composition for App-Scoped Frontend Edits

Date: 2026-08-10

## Status

Accepted

Amends ADR-0045's exact `OPENCODE_CONFIG_CONTENT` ownership and corrects
ADR-0049's implementation of the `@frontend` edit allowlist.

## Context

ADR-0049 grants the hidden `@frontend` subagent permission to edit
handoff-approved presentation PHP/HTML under the application webroot, plus
`cdn/sass` and `cdn/js` sources. The implementation expressed the PHP/HTML
patterns as literal `<app>` tokens in `.opencode/agents/frontend.md`:

```yaml
edit:
  "*": deny
  "<app>/*.php": allow
  "<app>/**/*.php": allow
  "<app>/*.html": allow
  "<app>/**/*.html": allow
```

Three facts break this contract (issue #296, validated against the
repository):

1. `/setup` intentionally never sweeps harness agent files
   (`.opencode/commands/setup.md`), so the `<app>` token survives
   configuration.
2. OpenCode permission globs match paths literally. Environment-variable
   substitution (`{env:VAR}`) is documented for config files
   (`config.mdx`), but an isolated spike against OpenCode 1.18.16 proves it
   does **not** expand in Markdown-frontmatter permission keys — see
   Compatibility Evidence below. No runtime layer resolves `<app>` from the
   manifest, so the rules only match a directory literally named `<app>`.
3. The contract checker (`check-frontend-agent-contract.js`) pins the literal
   `<app>` patterns as the *expected* contract, so both the placeholder and
   the stale build-prompt skill route pass validation.

Additionally, `opencode.jsonc`'s build prompt instructs build to load the
`frontend-design` skill, which ADR-0049 globally denies to every agent except
`@frontend` — a second, independent contract regression.

Forces: the four frontend skills must stay globally denied (ADR-0049
containment); PHP/HTML edit scope must stay limited to the application
webroot and never broaden to arbitrary `*.php`/`*.html`; the harness must
work for template clones, not just this repository; and drift of this kind
must fail closed at validation time.

## Decision

We adopt **runtime composition** of the app-scoped permission leaves, and we
extend the ownership boundary of ADR-0045's `OPENCODE_CONFIG_CONTENT`
composition.

- `PrismOpenCodeConfig::compose()` becomes the owner of exactly four
  `agent.frontend.permission.edit` leaves: the resolved application PHP/HTML
  patterns. It reads the validated `app` value from the resolved manifest
  and emits literal patterns (`prism/*.php`, `prism/**/*.php`,
  `prism/*.html`, `prism/**/*.html` for this repository) into the composed
  inline config. No placeholder, no `{env:}` — the value is resolved and
  embedded by PHP at composition time.
- `.opencode/agents/frontend.md` keeps every other permission exactly as
  ADR-0049 specified, but the four literal `<app>` rules are removed. The
  `"*": deny` catch-all, the `cdn/sass`/`cdn/js` allows, the
  `cdn/css`/`cdn/javascript` denies, and all bash/task/webfetch/websearch/
  external-directory/lsp/skill rules remain the `.md` source of truth.
- `app` becomes a permission-bearing manifest field. Both project and user
  tiers validate it as a safe project-local webroot segment
  (`/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/`) and reject a fixed set of
  protected roots (`adr`, `aurora`, `backend`, `cdn`, `docs`,
  `node_modules`, `tests`, `vendor` — case-insensitive). The validation
  lives in `PrismManifest` beside the existing allowlist constants and
  fail-closed helpers.
- `check-frontend-agent-contract.js` and `validate-harness.sh` resolve the
  four patterns against the validated app (obtained via
  `prism_manifest.php`, not a duplicate parse) and verify the effective
  scope. The checker rejects `<app>`, unsupported `{env:...}`, and
  `{file:...}` tokens anywhere in permission keys, and detects agent prompts
  that instruct loading a frontend skill denied by that agent's effective
  permissions.
- The stale build-prompt instruction is replaced with the ADR-0049 routing:
  build routes frontend visual work through `@tdd` → `@frontend` and never
  loads the four gated skills directly.

Merge precedence is defined by the spike evidence below and by OpenCode's
documented config loading order (`config.mdx`): `.opencode` directories load
before inline config, later configs override earlier ones only for
conflicting keys, and agent permission rules merge with the global config
with agent rules taking precedence (`permissions.mdx`). The composed inline
config therefore appends the four app-scoped allows after the `.md` rules;
the `"*": deny` catch-all remains first, preserving last-match-wins
fail-closed ordering (`agents.mdx`).

## Consequences

- `@frontend` regains effective root and nested PHP/HTML edit access under
  the configured application webroot on any clone, because the app value is
  read from that clone's own validated manifest.
- Backend, tests, harness files, Aurora, dependencies, and generated assets
  remain denied: the composed rules can only ever express paths under the
  validated app segment, and `cdn/css`/`cdn/javascript` denies stay in the
  `.md`.
- `OPENCODE_CONFIG_CONTENT` composition gains two more owned leaves in
  addition to the two MCP `enabled` booleans and the quota plugin. ADR-0045's
  "preserve unrelated keys, own the leaves" contract is extended, not
  replaced.
- The `.md` file is no longer self-sufficient for the PHP/HTML scope: a
  reader must consult `PrismOpenCodeConfig` to see the app patterns. The
  contract checker is the compensating guard and must be updated in the same
  commit as the `.md` or `validate-harness.sh` goes red.
- No new environment variable is exported; shape 2a's `OPENCODE_APP` env0
  pair is not needed because PHP embeds the resolved literal.
- OpenCode must be restarted after the change for the composed config to
  load (ADR-0049).

## Compatibility Evidence

A credential-free scratch spike against installed OpenCode **1.18.16**
(isolated HOME/XDG, `OPENCODE_PURE=1`, `--pure`) with a canary
`.opencode/agents/frontend.md` defining the catch-all and `cdn` rules, and an
`OPENCODE_CONFIG_CONTENT` inline config defining the four app-scoped edit
rules, produced this resolved `agent.frontend.permission.edit` map:

```json
{
  "*": "deny",
  "cdn/sass/**": "allow",
  "cdn/js/**": "allow",
  "cdn/css/**": "deny",
  "cdn/javascript/**": "deny",
  "prism/*.php": "allow",
  "prism/**/*.php": "allow",
  "prism/*.html": "allow",
  "prism/**/*.html": "allow"
}
```

The `.md` rules are preserved, the inline rules are appended in order, and
the catch-all deny survives — the last-match-wins ordering required for
fail-closed behavior. The same spike's control case proved the
`{env:OPENCODE_APP}` key in Markdown frontmatter is **not** expanded (the
literal key survives and no `canary-app/*.php` key appears), which is why
shape 2a is rejected.

## Alternatives Considered

- **Shape 2a — `{env:}` in `.md` frontmatter permission keys.** Rejected:
  empirically disproven on OpenCode 1.18.16 (see Compatibility Evidence).
  `{env:}` substitution is documented for config files only, not agent
  Markdown frontmatter.
- **Shape 2c — hardcode `prism/...` patterns.** Rejected: correct for this
  repository but wrong for template clones, whose `frontend.md` is never
  swept and would inherit this repository's app segment.
- **Shape 2d — drop the PHP/HTML edit scope.** Rejected: contradicts
  ADR-0049's explicitly granted capability; would require superseding that
  ADR.
- **Shape 2b — composed override** (adopted): carries the compatibility
  evidence above, keeps containment and fail-closed ordering, and works for
  clones because composition reads the clone's own manifest.
