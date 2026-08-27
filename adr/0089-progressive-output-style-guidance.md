# 0089. Progressive output-style guidance

Date: 2026-08-26

## Status

Accepted

Extends ADR-0055, ADR-0056, ADR-0058, ADR-0059, ADR-0060, ADR-0067, and
ADR-0075.

## Context

Prism's global core governs engineering behavior across every trusted project,
but it has no shared standard for natural-language output. Models can still
produce filler, flattery, puffery, vague claims, promotional wording, abstract
technical metaphors, repetitive formatting, and polished sentences that do not
state a useful fact or action.

The pstack plugin publishes an MIT-licensed `unslop` skill by Lauren Tan that
catalogs these patterns and provides a rewrite process. Its original
"must always apply" contract does not map cleanly to Pi. Pi skills use
progressive disclosure, so only skill names and descriptions remain in the
initial prompt. Loading the complete pattern catalog for every request would
consume context even when the agent only needs to report a short status or
write exact syntax.

Prism has two native always-on instruction paths. Global `AGENTS.md` is
concatenated into every session, while `APPEND_SYSTEM.md` carries the pipeline's
anti-drift bootstrap. An extension could inject style instructions before every
agent turn, but that would save no prompt tokens and would violate ADR-0055's
instruction-first architecture and ADR-0056's sole safety-extension boundary.
Post-generation rewriting would add latency, hide the model's original output,
and require either brittle lexical substitutions or another model call.

The output convention affects every Prism user and every durable prose artifact.
Its location, token budget, precedence, attribution, and enforcement boundary
are cross-cutting decisions.

## Decision

Prism adopts progressive output-style guidance under the name `distill`.

### Compact global invariant

`packages/prism-core/AGENTS.md` contains one authoritative output-style section
of no more than 80 words. It applies to natural-language prose in every trusted
project and requires direct, concrete wording, removal of empty chatbot habits,
plain language, varied rhythm, exact technical terminology, and a brief final
self-check.

The global section contains only the baseline. It does not copy the detailed
pattern catalog. `APPEND_SYSTEM.md` remains dedicated to pipeline anti-drift and
does not repeat the style rule.

### Progressive skill disclosure

Prism core ships one `distill` skill. The agent loads it for durable prose,
rewrite or tone requests, wording-sensitive work, and substantial explanations.
Short operational responses use the compact global invariant without loading
the full skill.

The skill body owns the editing workflow, exclusions, precedence, and
no-fabrication rule. A separate reference file owns the adapted pattern catalog
and loads only for rewriting or detailed audits.

```text
natural-language output
  -> compact global invariant
  -> short response: brief self-check
  -> durable or substantial prose: load distill
       -> draft for meaning
       -> load pattern reference when needed
       -> one editing pass
```

### Rule precedence

Distill applies rules in this order:

1. Accuracy and explicit user requirements.
2. Exact syntax, quotations, and required formats.
3. Prism's domain glossary and established technical language.
4. Clarity and accessibility.
5. Distill style preferences.

Chatbot filler, sycophancy, puffery, vague attribution, unsupported claims, and
empty conclusions are hard failures in natural-language prose. Punctuation,
vocabulary, active voice, sentence length, and list-shape guidance are strong
defaults rather than mechanical bans.

Code, commands, identifiers, paths, logs, quotations, citations,
machine-readable formats, required templates, commit syntax, and exact text the
user asks Prism to preserve are outside the rewrite boundary.

"Human voice" means concrete detail, specific judgment, and varied rhythm. The
agent does not invent emotions, lived experience, anecdotes, opinions, or
informality to appear human.

### Attribution

Distill adapts pstack's MIT-licensed `unslop` skill. The skill frontmatter
preserves provenance through `derived-from:` metadata. The Prism core NOTICE
preserves the pstack URL, Lauren Tan copyright, MIT license, adaptation summary,
and used-in path.

### Enforcement boundary

Distill remains instruction-only. Prism adds no extension, provider middleware,
output filter, second model pass, dependency, persistent state, readiness gate,
or model-specific behavior.

Deterministic tests cover instruction structure, skill discovery, package
contents, attribution, reference integrity, and the global word cap. Generated
prose quality remains a manual smoke-test concern until Prism adopts a separate
Pi-native eval architecture.

## Consequences

### Positive

- Every natural-language response receives a small shared quality baseline.
- Detailed editing guidance remains available without consuming routine prompt
  context.
- Technical precision and Prism's glossary take priority over generic style
  substitutions.
- Durable prose uses one consistent workflow across specs, plans, docs, issues,
  reviews, and teaching material.
- The upstream MIT attribution remains visible in both skill metadata and the
  published package NOTICE.
- The design preserves Pi's single-agent, skill-based architecture and Prism's
  sole safety extension.

### Negative

- The global instruction adds a small prompt cost to every session and request.
- Compliance remains model-dependent because style is instruction-only.
- The agent must predict when an answer will become substantial enough to load
  the skill.
- An 80-word global rule cannot encode every pattern or exception.

### Neutral

- Distill does not select a model or thinking level.
- Short status output does not receive the full pattern audit.
- Model-output snapshots and deterministic prose grading remain outside the
  current test architecture.
- Existing project-specific tone instructions can override Distill when they do
  not require fabrication or loss of technical accuracy.

## Alternatives Considered

### Put the full pattern catalog in global context

Rejected because it would consume substantial context on every request, create
more conflicts with exact technical language, and defeat progressive
disclosure.

### Rely on the skill description alone

Rejected because Pi does not guarantee that a model loads a matching skill for
every response. A description is too weak to provide an always-on baseline.

### Duplicate the compact rule in APPEND_SYSTEM.md

Rejected because duplicate instructions drift and spend tokens twice.
`AGENTS.md` already owns project-wide conventions, while `APPEND_SYSTEM.md`
owns pipeline anti-drift.

### Inject the rule through an extension

Rejected because per-turn injection saves no tokens compared with static global
context and violates ADR-0055 and ADR-0056.

### Rewrite assistant output after generation

Rejected because deterministic substitutions can damage meaning and exact
syntax, while a second model pass adds latency, cost, and another failure mode.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
