# 0067. Model-Agnostic Harness; User-Driven Model Configuration

Date: 2026-08-15

## Status

Accepted

Supersedes the model-selection clauses of ADR-0057 (single primary model +
judge with manual Ctrl+P cycling) and the primary/judge context description
in ADR-0064 (its footer structure is unchanged). Depends on ADR-0055
(single-agent philosophy) and ADR-0064 (three-footers).

## Context

ADR-0057 prescribed a single primary model (`deepseek/deepseek-v4-flash`)
with one judge (`deepseek/deepseek-v4-pro`) reachable via manual Ctrl+P
cycling. The prescription propagated across the harness: `settings.json`
templates pinned `defaultProvider`, `defaultModel`, `defaultThinkingLevel`,
and restricted the Ctrl+P pool via `enabledModels`; `models.json` labeled the
two models "prism primary"/"prism judge"; `AGENTS.md`, four skills, `/setup`,
`/doctor`, the READMEs, `CODING_HARNESS.md`, `CONTRIBUTING.md`, and the PR
template told the human and the agent which model to run for which phase and
instructed the agent to suggest switching to the judge.

The operator wants the harness to stop selecting models and thinking
variants entirely. pi's native power is that model and thinking level can be
set at any time (Ctrl+P cycles models, Shift+Tab sets thinking); any residual
pin, restriction, or suggestion in the harness violates that.

## Decision

1. **Full model-agnosticism.** The harness ships no model or thinking
   preference: no `defaultProvider` / `defaultModel` / `defaultThinkingLevel`
   / `enabledModels` pins in templates, no `models.json` display overrides,
   no "primary"/"judge" framing, no agent-suggested model cycling, no
   model-presence requirements in `/doctor` or `validate-harness.sh`.
   Sessions start on pi's own built-in defaults.
2. **Commit footers stay, as passive recording.** `Implemented-by:` (the
   active session model) and `Tested-by:` (the OCR review model via
   `resolve-ocr-model.sh`) are unchanged in structure (ADR-0064). They record
   whatever model the user happened to use; they select nothing. Doc examples
   use neutral placeholders.
3. **`/setup` gains a user-driven model-preference step.** One question at a
   time, each skippable: provider (pi's catalogue presented as facts, no
   recommendation), default model (validated via `pi --list-models`),
   optional Ctrl+P pool restriction (default: no restriction), thinking
   level. A single consent gate merges exactly the user's answers into
   `~/.pi/agent/settings.json`; credential files are never read.
4. **User config boundary.** The harness never writes or prescribes the
   user's `~/.pi/agent/settings.json`, `models.json`, or `models-store.json`;
   `/setup` with explicit consent is the only writer.

## Consequences

- **Easier:** no model-specific content to maintain in config, docs, skills,
  or prompts; the harness is provider-agnostic; `/doctor` no longer depends
  on any model's catalogue presence.
- **Accepted trade-offs:** fresh sessions start on pi's own defaults rather
  than a harness-chosen model; review/audit no longer get a harness-suggested
  stronger-model switch — the human owns that choice entirely, at any time.
- **History preserved:** commit footers keep recording the session and OCR
  models; ADR-0057 remains as a superseded record of the pi-migration model
  policy.

## Alternatives Considered

- **Keep defaults but drop restrictions and prescription.** Rejected: any
  residual pin or naming is exactly the selection behavior the operator
  rejected; pi's own defaults handle session start.
- **Drop the commit footers.** Rejected: footers record rather than select,
  and the git history serves as the development and evaluation log; removing
  attribution buys nothing in selection freedom.
- **Docs-only guidance instead of a `/setup` step.** Rejected: the operator
  explicitly asked for a setup *way* for default models and providers, not a
  document.
