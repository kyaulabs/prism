---
description: Scan the codebase for architectural deepening opportunities (shallow modules, coupling, missing test seams) and present ranked candidates as an Obsidian markdown report. Optionally hands off to @architect or a grilling loop.
agent: build
---

Scan the codebase for **deepening opportunities** — refactors that turn shallow
modules into deep ones. The aim is testability and AI-navigability. Produce a
ranked report in Obsidian-flavored markdown.

Load the `systems-design` skill first for the architecture vocabulary
(**module**, **interface**, **depth**, **seam**, **leverage**, **locality**)
and the deep-modules heuristic (Ousterhout). Use these terms exactly in every
suggestion — don't drift into "component," "service," "API," or "boundary."

## 1. Load domain context

Read `CONTEXT.md` (project root) for the domain glossary and ubiquitous
language. Read accepted ADRs in `adr/`. The domain language gives names to
good seams; ADRs record decisions this command should not re-litigate.

If `CONTEXT.md` does not exist, flag it and suggest running `/prime` before
proceeding. Do not silently proceed without domain context.

## 2. Explore

Use the `@explore` agent (or read directly) to walk the codebase. Don't
follow rigid heuristics — explore organically and note where you experience
friction:

- Where does understanding one concept require bouncing between many small
  modules?
- Where are modules **shallow** — interface nearly as complex as the
  implementation?
- Where have pure functions been extracted just for testability, but the real
  bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their
  current interface?

Apply the **deletion test** to anything you suspect is shallow: would
deleting it concentrate complexity, or just move it? A "yes, concentrates" is
the signal you want.

## 3. Present candidates as an Obsidian markdown report

Write a self-contained Obsidian-flavored markdown file to the OS temp
directory so nothing lands in the repo unless the user wants it there. Resolve
the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows),
and write to `<tmpdir>/architecture-review-<YYYYMMDDThhmmss>.md` so each run
gets a fresh file. Tell the user the absolute path.

The report MUST follow this template (the agent fills in all `<...>`
placeholders directly — no Templater syntax, since the agent can't run
Templater):

```markdown
---
title: Architecture Review — <project-or-module>
description: <one-line summary of what was scanned>
banner: [default.jpg]
created: <YYYY-MM-DDTHH:mm:ssZZ>
icon: "LiFilePen"
icon-title: "📝"
tags:
type: research
---
[Home](Home.md) < [Architecture](Architecture-MOC.md) < Architecture Review — <project-or-module>

# Architecture Review — <project-or-module>

> [!note] Scan context
> Codebase: `<path>` · Date: <YYYY-MM-DD> · Heuristic: deep-modules (Ousterhout)

## Candidates

### 1. <module name> — `[[<term-from-CONTEXT.md>]]`

> [!tip] Recommendation strength: Strong

**Files:** `path/to/file.php`, `path/to/other.php`
**Problem:** <why the current architecture causes friction — use the
architecture vocabulary: shallow, no locality, leaks across seams, etc.>
**Solution:** <plain English description of the deepened module>
**Benefits:** <locality, leverage, testability gains>

\`\`\`mermaid
%% before/after diagram — graph or flow showing the deepening
\`\`\`

### 2. <module name> — `[[<term>]]`

> [!warning] Recommendation strength: Worth exploring

**Files:** ...
**Problem:** ...
**Solution:** ...
**Benefits:** ...

\`\`\`mermaid
%% before/after diagram
\`\`\`

### 3. ...

## Top recommendation

<which candidate to tackle first and why>

## ADR conflicts

> [!warning] <if any candidate contradicts an existing ADR, note it here
> with the ADR number and why it might be worth reopening. If none, write
> "No ADR conflicts.">
```

### Rules for the report

- Use `[[wikilinks]]` for domain terms that appear in `CONTEXT.md` so they
  resolve in an Obsidian vault.
- Use Mermaid diagrams where the structure is graph-shaped (call graphs,
  dependencies, sequences). Use plain markdown where it's editorial.
- Each candidate gets a **before/after** visualisation in the Mermaid block.
- Recommendation strength is one of: `Strong`, `Worth exploring`,
  `Speculative`.
- Use `CONTEXT.md` vocabulary for the domain, and the `systems-design`
  vocabulary for the architecture. If `CONTEXT.md` defines "Order", talk
  about "the Order intake module" — not "the FooBarHandler", and not "the
  Order service."
- **ADR conflicts:** if a candidate contradicts an existing ADR, only surface
  it when the friction is real enough to warrant revisiting the ADR. Mark it
  clearly in a `> [!warning]` callout. Don't list every theoretical refactor
  an ADR forbids.

Do NOT propose interfaces yet. After the file is written, ask the user:
"Which of these would you like to explore?"

## 4. Grilling loop (optional)

Once the user picks a candidate, load the `brainstorming` skill to walk the
design tree with them — constraints, dependencies, the shape of the deepened
module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize — keep the domain model
current as you go:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the
  term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md`
  right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR,
  framed as: _"Want me to record this as an ADR so future architecture
  reviews don't re-suggest it?"_ Only offer when the reason would actually
  be needed by a future explorer to avoid re-suggesting the same thing —
  skip ephemeral reasons and self-evident ones.

## Rules

- Never edit source files. This command produces a report and optionally
  updates `CONTEXT.md` / writes ADRs during the grilling loop.
- If `CONTEXT.md` does not exist, flag it — do not silently proceed without
  domain context. Suggest running `/prime`.
- Do not duplicate `CONTEXT.md` content into the report; reference it via
  `[[wikilinks]]`.
- Keep candidates to the top 3–5 by impact. Don't pad with speculative
  refactors that the deletion test doesn't support.
