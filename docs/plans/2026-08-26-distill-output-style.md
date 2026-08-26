# Distill output style implementation plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox syntax for tracking.
> Each task follows Red, Green, Refactor inline.

**Goal:** Add a compact global prose baseline and a progressively disclosed `distill` skill with deterministic contract checks and pstack attribution.

**Architecture:** `packages/prism-core/AGENTS.md` carries an 80-word maximum baseline. The `distill` skill owns the editing workflow, while `references/patterns.md` owns the detailed catalog. A small contract checker enforces layout, size, attribution, and non-duplication.

**Tech stack:** Markdown, Bash 4+, existing frontmatter parser, shell regression suite, Node package tests.

**Originating issue:** none

## Global constraints

- The always-on output section contains no more than 80 words.
- The full skill loads only for durable, rewritten, tone-sensitive, or substantial prose.
- Accuracy, exact syntax, quotations, required formats, and Prism terminology override style preferences.
- Distill never invents feelings, experience, anecdotes, or opinions.
- `APPEND_SYSTEM.md` and the safety extension remain unchanged.
- Add no dependency, model preference, launcher operation, persistent state, or extension.
- Preserve pstack provenance as MIT material by Lauren Tan.
- Follow ADR-0089 and `docs/specs/2026-08-26-distill-output-style-spec.md`.

---

### Task 1: Add a reusable Distill contract checker

**Files:**
- Create: `packages/prism-core/scripts/check-distill-contract.sh`
- Create: `tests/Shell/check_distill_contract_test.sh`
- Modify: `packages/prism-core/scripts/validate-harness.sh:62-94`
- Modify: `tests/Shell/validate-harness_test.sh:22-35`

**Interfaces:**
- Consumes: one repository-root path.
- Produces: exit `0` when the contract passes, exit `1` for violations, exit `2` for invalid invocation or unreadable required inputs.
- Diagnostics: one line per defect, prefixed with the repository-relative path.

- [ ] **Step 1: Write the failing checker tests**

Create fixture trees that cover:

1. A valid Distill layout passes.
2. A missing `## Output style` section fails.
3. A duplicate section fails.
4. A section over 80 words fails.
5. Missing skill or pattern reference fails.
6. Incorrect `name`, missing trigger description, or missing `derived-from` fails.
7. Missing skill headings fails.
8. Missing pattern-category headings fails.
9. Missing AGENTS index, `CODING_HARNESS.md` mention, or NOTICE attribution fails.
10. Any Distill duplication in `APPEND_SYSTEM.md` fails.

Use these exact required values:

```text
skill name: distill
derived-from: cursor/plugins pstack/skills/unslop (MIT, © Lauren Tan)
required skill headings:
  ## When to use
  ## Process
  ## Rules
  ## Cross-refs
  ## Gotchas
required pattern headings:
  ## Content
  ## Language
  ## Style
  ## Communication artifacts
  ## Filler
  ## Jargon
  ## Plain speech
  ## Prism exceptions
```

- [ ] **Step 2: Run the focused test and confirm Red**

Run:

```bash
bash tests/Shell/check_distill_contract_test.sh
```

Expected: FAIL because `check-distill-contract.sh` does not exist.

- [ ] **Step 3: Implement the checker and validator integration**

`check-distill-contract.sh` must:

- reject extra arguments;
- reject roots that do not contain the required files;
- extract the body after the exact `## Output style` heading until the next level-two heading;
- count headings exactly;
- count body words with `wc -w`;
- parse skill frontmatter through `frontmatter-parser.js`;
- check the headings and index entries listed above;
- check `packages/prism-core/NOTICE` for the upstream URL, Lauren Tan, MIT, and the Distill skill path;
- reject `distill` or `## Output style` in `APPEND_SYSTEM.md`;
- aggregate all diagnostics before returning `1`.

Wire it into `validate-harness.sh` under this exact marker:

```text
── Checking Distill output-style contract ──
```

Pass the resolved repository root as a literal argument. Add that marker to the required-check list in `validate-harness_test.sh`.

- [ ] **Step 4: Run focused checks and confirm Green**

Run:

```bash
bash tests/Shell/check_distill_contract_test.sh
bash tests/Shell/validate-harness_test.sh
```

Expected: both PASS against their fixture contracts. The real-tree validator may still fail until Task 2 adds the Distill resources.

- [ ] **Step 5: Commit**

Stage only the checker, its test, and validator integration. Then create:

```bash
prism-tool commit create --type test --scope distill --subject "add output guidance contract checks"
```

---

### Task 2: Add the global invariant, skill, reference, indexes, and attribution

**Files:**
- Modify: `packages/prism-core/AGENTS.md:9-14`
- Modify: `packages/prism-core/AGENTS.md:260-310`
- Create: `packages/prism-core/skills/distill/SKILL.md`
- Create: `packages/prism-core/skills/distill/references/patterns.md`
- Modify: `packages/prism-core/NOTICE:113-128`
- Modify: `CODING_HARNESS.md:193-199`
- Modify: `tests/Node/toolchain-packaging.test.js:83-145`

**Interfaces:**
- Consumes: ADR-0089, the approved spec, and the contract checker from Task 1.
- Produces: one globally active baseline plus an on-demand skill and detailed reference.

- [ ] **Step 1: Write the failing package assertions**

Extend `toolchain-packaging.test.js` with exact assertions for:

```text
skills/distill/SKILL.md
skills/distill/references/patterns.md
NOTICE
```

Extract the packed NOTICE and assert that it contains:

```text
https://github.com/cursor/plugins/tree/main/pstack
Copyright (c) 2026 Lauren Tan
License: MIT
packages/prism-core/skills/distill/SKILL.md
```

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the Distill files and NOTICE entry do not exist.

- [ ] **Step 2: Add the compact global rule**

Insert this exact section after `## Project Context`:

```markdown
## Output style

Write natural-language prose directly and concretely. Cut filler, flattery,
puffery, vague attribution, unsupported claims, and canned chatbot phrases.
Prefer plain words and varied sentence rhythm. Preserve exact syntax,
quotations, required formats, and established domain terms. Never invent
feelings or experience to sound human. Before responding, ask what sounds
machine-written and fix it. Load the `distill` skill for durable, rewritten,
tone-sensitive, or substantial prose.
```

Add this skill-table row:

```markdown
| `distill` | Writing or editing durable, rewritten, tone-sensitive, or substantial prose. Removes machine-written habits while preserving meaning and technical precision |
```

- [ ] **Step 3: Add the Distill skill and pattern reference**

`SKILL.md` frontmatter must be:

```yaml
---
name: distill
description: Use when writing or editing durable prose, rewriting supplied text, changing tone, or producing a substantial explanation. Removes machine-written habits while preserving meaning, intended voice, and technical precision.
derived-from: cursor/plugins pstack/skills/unslop (MIT, © Lauren Tan)
---
```

Its body must define:

- the four activation triggers from the spec;
- one-pass editing after meaning is stable;
- reference loading for rewrites and detailed audits;
- the five-level precedence order;
- exclusions for code, commands, identifiers, logs, quotations, citations, machine formats, templates, commit syntax, and preserved text;
- the no-fabrication rule;
- a four-question self-audit;
- cross-references to the global output rule, `docs-writer`, and `writing-skills`;
- gotchas for blind banned-word replacement, fake personality, over-editing, and damaged exact syntax.

`references/patterns.md` must preserve all 31 upstream concerns under the eight required headings. Adapt them as follows:

- Puffery, promotion, vague attribution, chatbot filler, sycophancy, unsupported conclusions, and filler are hard rules.
- Vocabulary, punctuation, active voice, adverbs, sentence length, list shape, and formatting are strong defaults.
- Keep Prism glossary terms when they carry their defined technical meaning.
- Keep passive voice when the actor is unknown or irrelevant.
- Keep colons before lists and examples.
- Never add opinions, anecdotes, emotion, or informality that the source did not support.
- Protect exact syntax and quoted material.

- [ ] **Step 4: Add attribution and orientation text**

Add this NOTICE entry before the pi-coding-agent entry:

```text
cursor/plugins pstack
  URL: https://github.com/cursor/plugins/tree/main/pstack
  Copyright: Copyright (c) 2026 Lauren Tan
  License: MIT
  What was adapted: The unslop editing process and catalog of common
    machine-written prose patterns, adapted into Prism's compact global
    baseline plus progressively disclosed Distill skill and reference.
  Used in:
    - packages/prism-core/skills/distill/SKILL.md
    - packages/prism-core/skills/distill/references/patterns.md
```

Add one paragraph under `CODING_HARNESS.md` section `Harness commands and skills` stating that all natural-language output follows the compact global rule and that substantial or durable prose loads `distill`.

- [ ] **Step 5: Run focused and full checks**

Run:

```bash
bash tests/Shell/check_distill_contract_test.sh
bash tests/Shell/validate-harness_test.sh
node --test tests/Node/toolchain-packaging.test.js
bash packages/prism-core/scripts/validate-harness.sh
composer test:shell
npm run test:node
```

Expected: all PASS.

Then stage the Task 2 files and create:

```bash
prism-tool commit create --type feat --scope distill --subject "add progressive prose guidance"
```

---

## Plan self-review

- Spec coverage: global rule, activation, exclusions, precedence, attribution, package inclusion, manual enforcement boundary, and no-extension constraints are covered.
- Placeholders: none.
- Interface consistency: Task 2 consumes the exact checker contract from Task 1.
- Issue references: none required.
- Dependencies: none added.
- Final project gate after execution: `/check`, verification-before-completion, branch finalization, and the authorized four-axis review.
