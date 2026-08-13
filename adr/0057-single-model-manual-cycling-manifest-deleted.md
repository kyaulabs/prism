# 0057. Single Primary Model with Manual Cycling — Manifest Deleted

Date: 2026-08-12

## Status

Accepted

Depends on ADR-0055. Supersedes the opencode-era model/manifest machinery
(ADR-0012, ADR-0013, ADR-0014, ADR-0022, ADR-0030, ADR-0031, ADR-0040,
ADR-0049) for the pi harness; those records are retained as frozen historical
context (ADR-0059).

## Context

The opencode harness ran a six-tier model/variant system driven by a
`prism.jsonc` manifest resolved at runtime via `prism_manifest.php`, layered
with a user `~/.config/opencode/prism.jsonc`, delivered through direnv
(`.envrc`), and substituted into `opencode.jsonc` via `{env:VAR}` tokens. It
auto-tiered: brainstorm/review/audit ran on stronger models, build on the
default. This is substantial machinery (a PHP manifest parser, a JSONC document
model, setup scripts, secret checks) built around opencode-specific config
shapes.

Under philosophy B (ADR-0055) automatic tiering is gone and there are no
sub-agents to pin models to. The question: what replaces the tier system and
the manifest/env layer?

## Decision

We collapse to a **single primary model** (`deepseek/deepseek-v4-flash`) with
one **judge model** (`deepseek/deepseek-v4-pro`) available via manual Ctrl+P
cycling. Configuration is pi-native: `~/.pi/agent/settings.json`
(`defaultModel`, `enabledModels`) plus `/login deepseek` for auth. DeepSeek is
a built-in pi provider — no custom provider config and no `models.json`
metadata pinning unless explicitly needed.

We **delete the entire manifest/env layer**: `.envrc`, direnv,
`prism_manifest.php`, `PrismManifest.php`, `PrismJsoncDocument.php`,
`PrismJsoncException.php`, `PrismOpenCodeConfig.php`, `prism.jsonc`,
`{env:VAR}` substitution, and `~/.config/opencode/prism.jsonc`. Review and
audit run on the primary by default; the `code-review` / `spec-review` /
`test-audit` skills include a one-line prompt suggesting the human (or agent)
cycle to the judge via Ctrl+P.

## Consequences

- **Easier:** no manifest parser, no JSONC document model, no setup scripts,
  no direnv, no secret-substitution pipeline; one config file; pi's built-in
  provider handles auth.
- **Harder / accepted tradeoff:** automatic model tiering is gone (ADR-0055).
  Cost-sensitive review/audit now relies on a human remembering to cycle, or
  on the agent suggesting it. This is accepted.
- **Follow-up:** Stage 0 deletes the manifest/env machinery; Stage 1 lands the
  `settings.json` / `models.json` templates.

## Alternatives Considered

- **Keep a (smaller) manifest + auto-tiering in pi.** Rejected: there are no
  sub-agents to pin models to (ADR-0055), so the manifest's primary job
  disappears, and rebuilding the PHP/JSONC/direnv stack against pi config
  shapes is pure carrying-cost.
- **Multiple enabled models with agent-chosen switching.** Rejected:
  automatic switching reintroduces tiering machinery and cost surprise;
  manual Ctrl+P cycling keeps the human in control of cost.
