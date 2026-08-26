# Spec: Distill output style

**Date:** 2026-08-26
**Status:** Draft
**Type:** feat

## Problem statement

Prism has strong instructions for engineering behavior but no shared standard for the quality of natural-language output. Model responses can still contain chatbot filler, flattery, vague claims, promotional wording, abstract technical metaphors, repetitive formatting, and prose that sounds polished without saying anything concrete.

A full style checklist in the global prompt would consume context on every request. A normal skill would use progressive disclosure, but it would not be active for short responses unless the model chose to load it. Prism needs a compact baseline that remains active for all natural-language prose and a detailed editing method that loads only when the work justifies its token cost.

## Solution

Add a Prism core capability named `distill` with two instruction layers:

1. A compact output invariant in `packages/prism-core/AGENTS.md`, capped at 80 words, applies to all natural-language output.
2. An on-demand `distill` skill provides the detailed workflow for durable prose, rewrite requests, tone work, and substantial explanations.

The skill keeps its main body small. Its adapted pattern catalog lives in `references/patterns.md` and loads only when the agent rewrites existing prose or audits a substantial draft.

The capability is instruction-only. It adds no extension, output filter, second model pass, dependency, persistent state, model selection, or readiness requirement.

## Scope

Distill applies to natural-language prose produced in:

- chat responses and explanations;
- specifications and plans;
- project documentation;
- issue and pull-request text;
- release and teaching material;
- reviews and other contributor-facing prose.

Distill does not rewrite:

- source code;
- shell commands or exact argv;
- identifiers, paths, flags, and API names;
- logs and tool output;
- quotations and citations;
- machine-readable formats;
- required templates and commit syntax;
- exact text the user asks Prism to preserve.

## User stories

1. As a user, I want short Prism responses to be direct and free of chatbot filler without loading a large style guide.
2. As a contributor, I want specs, plans, docs, issues, and pull-request text to receive a consistent editing pass before they are presented or written.
3. As a maintainer, I want technical precision and Prism's domain glossary to take priority over generic vocabulary bans.
4. As a user asking for a rewrite, I want the meaning and intended tone preserved while obvious model habits are removed.
5. As a maintainer, I want the capability to remain model-agnostic and instruction-only under Prism's current Pi architecture.
6. As a user, I want prose to have judgment and rhythm without invented feelings, fake lived experience, or forced informality.

## Architecture

### Always-on output invariant

Add one short section to `packages/prism-core/AGENTS.md`. It is the authoritative project-wide convention for natural-language output.

The section must require the agent to:

- write directly and concretely;
- cut filler, flattery, puffery, vague attribution, and unsupported claims;
- prefer plain words and varied sentence rhythm;
- preserve exact technical language;
- run a brief final check for machine-written habits.

The section must contain no more than 80 words. It must not duplicate the detailed pattern catalog.

`APPEND_SYSTEM.md` remains focused on pipeline anti-drift. The compact style invariant does not need a second copy there.

### Distill skill

Add:

`packages/prism-core/skills/distill/SKILL.md`

The skill loads when any of these conditions apply:

- the agent writes or edits a durable prose artifact;
- the user asks to rewrite, polish, humanize, or change tone;
- the expected answer exceeds roughly 250 words;
- wording quality is itself part of the requested outcome.

The skill body defines the editing workflow, rule precedence, exclusions, and self-audit. It references the global output invariant instead of restating it.

The skill description must state both its trigger and purpose. It must not claim that the full skill is always loaded.

### Pattern reference

Add:

`packages/prism-core/skills/distill/references/patterns.md`

The reference adapts the supplied pattern list to Prism. It groups related patterns, removes duplication, and distinguishes hard rules from strong defaults.

The skill reads the reference when rewriting supplied prose or auditing a substantial draft. Routine short responses do not load it.

### Instruction flow

```text
all natural-language output
  -> compact AGENTS.md invariant
  -> short response: brief self-check
  -> durable, rewrite, tone-sensitive, or substantial prose
       -> load distill skill
       -> draft for meaning
       -> load pattern reference when a detailed audit is needed
       -> one final editing pass
```

This is a deep instruction module. The always-on interface is small, while the detailed pattern handling stays behind progressive disclosure.

## Rule model

### Hard rules

Distill must remove or rewrite:

- chatbot filler and canned enthusiasm;
- sycophantic agreement and praise;
- puffery and promotional language;
- vague attribution without a named source;
- unsupported claims and invented certainty;
- generic conclusions that add no fact or action;
- excessive hedging and filler phrases;
- prose that describes a feeling when it could name a mechanism, instruction, fact, or number.

Distill must not invent personality to make prose seem human. Specific judgment, concrete detail, and varied rhythm provide voice. The agent may use first person for its actual reasoning or actions, but not for fabricated emotions, preferences, or lived experience.

### Strong defaults

Distill should prefer:

- plain words over inflated synonyms;
- active voice when the actor matters;
- shorter sentences when clauses become hard to parse;
- sentence case headings;
- restrained boldface and list structure;
- consistent terminology instead of synonym cycling;
- the natural number of examples instead of forced groups of three.

Distill should avoid:

- em dashes in authored prose;
- colon-heavy sentence construction;
- decorative emojis;
- abstract metaphor nouns used in place of concrete technical terms;
- superficial participial phrases such as "highlighting" or "ensuring" when they add no mechanism or evidence;
- formulaic contrast structures such as "not just X, but Y";
- false ranges and formulaic challenge narratives.

These are defaults, not mechanical substitutions. Passive voice remains valid when the actor is unknown or irrelevant. A colon remains valid before a list or example. A flagged word remains valid when it is an exact domain term, API term, quotation, or the clearest technical word.

### Rule precedence

When rules conflict, apply this order:

1. Accuracy and explicit user requirements.
2. Exact syntax, quotations, and required formats.
3. Prism's domain glossary and established technical language.
4. Clarity and accessibility.
5. Distill style preferences.

## Workflow

### Short natural-language output

For short chat and operational prose, apply the global invariant and ask:

1. Is this direct and specific?
2. Did filler, flattery, vague claims, or fake voice slip in?
3. Can a sentence be shorter without losing meaning?
4. Did a style preference reduce technical precision?

Do not load the full skill only to produce a terse status line.

### Long-form or durable prose

1. Load the `distill` skill before drafting.
2. Identify the audience, intended tone, exact terms, and protected syntax.
3. Draft for meaning and completeness first.
4. Perform one editing pass after the content is stable.
5. Read the pattern reference when the draft needs a detailed audit.
6. Stop when further editing would only make the prose more polished, not clearer or more useful.

### Rewriting supplied text

1. Preserve meaning, factual claims, and intended tone.
2. Protect quotations, citations, code, commands, identifiers, and required formatting.
3. Read the pattern reference.
4. Remove model habits without flattening the author's voice.
5. Do not add facts, opinions, anecdotes, or emotional claims that were not present.

## Conflict and failure behavior

- If a style rule would change technical meaning, keep the precise wording.
- If the user requests a conflicting tone or format, follow the user's request unless it would require fabrication or unsafe content.
- If a suspected pattern is also a defined Prism term, keep the term and improve the surrounding sentence if needed.
- If the agent cannot make a sentence concrete without inventing evidence, cut the claim or state the known limitation plainly.
- If the source text is intentionally stylized, preserve that voice rather than normalizing it to Prism's default tone.

## Repository changes

The implementation is expected to touch:

- `packages/prism-core/AGENTS.md`;
- `packages/prism-core/skills/distill/SKILL.md`;
- `packages/prism-core/skills/distill/references/patterns.md`;
- `CODING_HARNESS.md`;
- harness validation and regression tests;
- one new ADR recording the cross-cutting convention.

The skill must be added to the skill tables required by the `writing-skills` convention. Package discovery should include the skill and its reference through the existing `./skills` package entry.

## Testing decisions

### Deterministic checks

Automated tests must verify:

1. The `distill` skill has valid frontmatter and is discovered by the existing skill scanners.
2. The skill appears in `packages/prism-core/AGENTS.md` and `CODING_HARNESS.md`.
3. The referenced pattern file exists and is included in the packed Prism core package.
4. The always-on output invariant is present once and contains no more than 80 words.
5. `APPEND_SYSTEM.md` and the safety extension do not gain duplicate style enforcement.
6. The skill states the activation conditions, exclusions, precedence order, and no-fabrication rule.
7. The pattern reference preserves coverage of the supplied content, language, style, communication, filler, jargon, and plain-speech concerns.
8. No new dependency, model preference, extension, launcher operation, or persistent state is introduced.

Tests should assert instruction contracts and package layout. They must not snapshot generated prose or claim deterministic model compliance.

### Manual smoke tests

Using the user's selected Pi model configuration, check:

1. A short factual answer avoids filler and does not load the detailed reference.
2. A technical explanation over roughly 250 words loads `distill` and remains precise.
3. A spec or documentation section uses direct, concrete prose with restrained formatting.
4. A rewrite request preserves meaning and tone while removing obvious model habits.
5. A response containing code, a command, a quotation, and a Prism glossary term leaves protected text unchanged.

Pi-native model-output evaluation remains out of scope under the deferred eval architecture.

## Acceptance criteria

- All natural-language output receives the compact global style invariant.
- The global invariant contains no more than 80 words.
- The detailed skill loads for durable, rewrite, tone-sensitive, or substantial prose and stays unloaded for routine terse responses.
- The pattern catalog is available through progressive disclosure rather than global context.
- Hard rules remove empty chatbot habits without inventing facts or personality.
- Strong defaults improve plainness and rhythm without overriding exact technical language.
- Code, commands, identifiers, logs, quotations, citations, machine formats, templates, and commit syntax remain unchanged.
- Prism glossary terms remain valid in their defined technical sense.
- The implementation adds no second extension, output filter, extra model call, dependency, persistent state, readiness gate, or model-specific behavior.
- Package, discovery, reference, index, and instruction-size checks pass.
- An accepted ADR records the always-on convention and enforcement boundary before implementation completes.

## Non-goals

- Deterministic rewriting of every assistant message after generation.
- A prose linter, formatter, banned-word scanner, or provider middleware.
- A second model call to review each response.
- A new extension or expansion of the safety extension into orchestration.
- Model selection, temperature control, fine-tuning, or provider-specific prompts.
- Rewriting third-party quotations, legal text, code, logs, or machine-readable output.
- Forcing informality, jokes, opinions, first person, or deliberate messiness into every response.
- Guaranteeing that every model follows every style preference identically.

## Alternatives considered

### Full checklist in global context

Rejected because it would consume substantial context on every request, increase conflict with exact technical language, and defeat skill progressive disclosure.

### Skill description only

Rejected because Pi exposes skill names and descriptions at startup but does not guarantee that a model loads the full skill for every response. A description alone is too weak for an always-on baseline.

### Extension injection or output rewriting

Rejected because prompt injection saves no tokens compared with a context file, post-generation rewriting adds complexity and latency, and either approach conflicts with ADR-0056's sole safety-extension boundary.

## Architecture decision

An ADR is required. The change creates a cross-cutting, globally loaded output convention, defines a new progressive-disclosure boundary, and records why Prism does not enforce prose style through an extension or post-generation filter.
