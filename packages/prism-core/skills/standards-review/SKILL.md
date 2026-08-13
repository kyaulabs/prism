---
name: standards-review
description: "Use for a read-only structural review of a diff using Fowler's 12 code smells. Reports findings by severity and never auto-fixes. Complements tooling/style, spec-review, and SAST without re-reporting their findings."
---

Perform a **standards review**. Apply Fowler's 12 code smells as a structural
review baseline against the diff. This complements the `code-review` tooling,
`spec-review`, and SAST axes.

## De-duplication contract (FIRST — read before scanning)

- Do NOT re-report code-style drift, formatting issues, or lint-level findings
  — those are the tooling and `/check` territory.
- Do NOT perform SAST scanning — that is the security axis's territory.
- Do NOT check requirement coverage — that is `spec-review` territory.
- Focus ONLY on structural design smells.

## Fowler's 12 Code Smells (baseline)

For each smell, assess whether it appears in the diff:

1. **Duplicated Code** — Same code structure in more than one place. Look for
   copy-paste patterns, repeated logic, near-identical blocks.
2. **Long Method** — Function or method exceeds a reasonable size for the
   active language and does too many things. Treat line count as a prompt to
   inspect cohesion, not a universal threshold.
3. **Large Class** — Class has too many fields/methods, low cohesion. Flag
   classes with >15 public methods or >20 total methods.
4. **Long Parameter List** — Function/method accepts more than 4–5
   parameters. Suggests refactoring to parameter object.
5. **Divergent Change** — One class changes for different reasons. Flag
   classes touched across unrelated diff hunks.
6. **Shotgun Surgery** — One change cascades across many classes. Flag
   single-concern changes that touch >5 files across >3 modules.
7. **Feature Envy** — Method references another object's data more than its
   own. Flag methods with >50% of accesses on external objects.
8. **Data Clumps** — Same group of data items appears together in multiple
   places. Flag parameter groups or fields that always travel together.
9. **Primitive Obsession** — Using primitives instead of small objects for
   simple tasks. Flag stringly-typed values (status codes, phone numbers,
   currency) without validation wrappers.
10. **Conditional Complexity** — Deeply nested conditionals or switch
    statements on type codes. Flag >3 levels of nesting or switch-on-type
    where polymorphism fits.
11. **Speculative Generality** — Code built for hypothetical future needs.
    Flag unused parameters, abstract classes with one concrete subclass,
    hooks/callbacks with no callers.
12. **Temporary Field** — Instance variable set only in certain
    circumstances. Flag fields that are null/empty most of the time.

## Workflow

1. Read the diff provided by the coordinator.
2. Scan each changed file for the 12 smells above.
3. Group findings by severity:
   - **Blocking** — Duplicated Code (if the duplication introduces a
     maintenance risk), Conditional Complexity >5 levels, Primitive Obsession
     on security-sensitive data.
   - **Suggested** — Long Method, Large Class, Long Parameter List, Feature
     Envy, Data Clumps, Shotgun Surgery, Temporary Field.
   - **Informational** — Divergent Change (if only potential), Speculative
     Generality (if harmless).
4. Report findings grouped by file, with the smell name and a one-line
   rationale per finding.
5. If no structural smells detected, report: "No structural design smells
   found in this diff."

## Rules

- Never auto-apply fixes — this skill reviews and reports. Report and stop.
- Report only against the diff — do not audit the entire codebase.
- If the diff is empty, report: "Empty diff — no structural analysis needed."

## Gotchas

- *Using line count as the finding* — size is only a signal. Name the mixed
  responsibilities or structural cost.
- *Re-reporting lint* — keep this axis structural so the four-axis review does
  not amplify duplicate findings.
