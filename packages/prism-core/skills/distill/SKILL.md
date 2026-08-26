---
name: distill
description: Use when writing or editing durable prose, rewriting supplied text, changing tone, or producing a substantial explanation. Removes machine-written habits while preserving meaning, intended voice, and technical precision.
derived-from: cursor/plugins pstack/skills/unslop (MIT, © Lauren Tan)
---

# Distill

Edit natural-language prose so it is direct, specific, and recognizably written for its actual reader.

## When to use

Load this skill when any of these conditions apply:

- writing or editing a durable prose artifact such as a spec, plan, document, issue, pull request, review, release note, or lesson;
- rewriting supplied text, polishing wording, humanizing prose, or changing tone;
- producing an explanation expected to exceed roughly 250 words;
- treating wording quality as part of the requested outcome.

Do not load the full skill only for a terse status line. Apply the compact output rule in `AGENTS.md` instead.

## Process

1. Identify the reader, intended tone, exact technical terms, and text that must remain unchanged.
2. Draft for meaning and completeness before editing for style.
3. Read `references/patterns.md` completely when rewriting supplied prose or performing a detailed audit of a substantial draft.
4. Make one editing pass. Remove empty model habits, tighten dense sentences, and keep the author's useful voice.
5. Stop when another pass would make the prose more polished without making it clearer or more useful.
6. Self-audit before presenting or writing the result:
   - Is the prose direct and specific?
   - Did filler, flattery, vague claims, or fake voice slip in?
   - Can a sentence be shorter without losing meaning?
   - Did a style preference reduce technical precision?

## Rules

Apply conflicts in this order:

1. Accuracy and explicit user requirements.
2. Exact syntax, quotations, and required formats.
3. Prism's domain glossary and established technical language.
4. Clarity and accessibility.
5. Distill style preferences.

Cut chatbot filler, sycophancy, puffery, promotional wording, vague attribution, unsupported claims, excessive hedging, and conclusions that add no fact or action.

Prefer plain words, concrete mechanisms, specific instructions, measured results, varied sentence rhythm, restrained formatting, and active voice when the actor matters.

Treat punctuation, vocabulary, sentence length, active voice, and list-shape guidance as strong defaults rather than blind substitutions. Keep a flagged word when it is the exact domain term, API term, quotation, or clearest technical word. Passive voice is valid when the actor is unknown or irrelevant. Colons are valid before lists and examples.

Do not rewrite source code, commands, identifiers, paths, flags, logs, tool output, quotations, citations, machine-readable formats, required templates, commit syntax, or exact text the user asks Prism to preserve.

Human voice comes from concrete detail, specific judgment, and varied rhythm. Never invent feelings, lived experience, anecdotes, preferences, opinions, or informality to make text appear human.

## Cross-refs

- `AGENTS.md` Output style section provides the compact always-on rule.
- `docs-writer` owns project documentation and source documentation conventions.
- `writing-skills` owns Prism skill structure, attribution, and token discipline.
- `references/patterns.md` contains the adapted detailed audit catalog.

## Gotchas

- *Treating flagged words as banned tokens* — preserve exact Prism terms and improve the surrounding sentence instead.
- *Adding fake personality* — specificity is voice; invented emotion or experience is fabrication.
- *Editing forever* — perform one pass after meaning is stable, then stop when changes become cosmetic.
- *Damaging protected text* — keep code, commands, quotations, identifiers, formats, and required templates byte-accurate.
