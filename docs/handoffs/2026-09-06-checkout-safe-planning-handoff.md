# Handoff: Focused #520 plan approved

**Date:** 2026-09-06
**Status:** User approved with `go`; execution started

## Current authority

The user withdrew the repository-wide permission-policy expansion and returned
to [#520](https://github.com/kyaulabs/prism/issues/520) and its
[first scope amendment](https://github.com/kyaulabs/prism/issues/520#issuecomment-5557363098).
The issue already has the intended scope; no tracker mutation was made.

The retained work is isolated Semgrep scanning, umask-compatible validation of
existing managed public files, useful read-only diagnostics, and post-review
managed-file health checks. Canonical outputs remain `0644`/`0755`. Valid Git
recreation under `0022`, `0027`, and `0077` must not require chmod.

Do not restore repository-wide source/documentation permission checks, new
creation defaults, developer migration, bootstrap protocol two, or CI permission
preparation. Later planning-map decisions do not override the user's rescoping.

## Task-scoped planning exception

The user explicitly selected a focused exception for #520: review relevant ADRs
and write a behavior/test-focused plan without complete code prewritten. This
changes no permanent Prism skill. Branch creation, TDD, signed Conventional
Commits, hooks, verification, four-axis review, consent, and human publication
requirements remain in force.

## Current documents and evidence

- Active plan: `docs/plans/2026-09-06-checkout-safe-scanning-and-project-permissions.md`.
- Specification: `docs/specs/2026-09-06-checkout-safe-scanning-and-project-permissions-spec.md`.
- Accepted ADR-0107 covers scanner isolation; accepted ADR-0108 covers
  managed public runtime modes and separate exact private approval observations.
- Architecture verdict: GO-WITH-CONDITIONS; ADR-required: 0107,0108. The plan
  records the relevant decisions reviewed and the remaining implementation gates.
- The withdrawn large plan was copied byte-for-byte to the Git-ignored
  `audits/2026-09-06-issue-520-withdrawn-plan.md` before the active path was
  replaced. It is historical material only; do not stage or execute it.
- Fresh planning baseline: 163 existing focused Node tests passed at
  `b056fb0927094fc9e348512ac83654badec12bef`. No native scanner isolation,
  production TDD, PHP coverage, full completion check, or review is claimed.

## Next action

The user approved the active plan with `go`. Local readiness passed. The branch
`fix/kyau-e7c1-checkout-safe-scanning-and-umask-compatibility` was created from the
observed HEAD above. ADR acceptance, Status notes, and context are prepared for
the initial signed documentation commit. Execute the remaining vertical TDD
tasks in the active plan; its checkboxes record completed work.

Read each implementation file fully before editing. Test the original symptom
in disposable Core-only and adapter fixtures, never by baseline-scanning the
real Prism or `prism-adapters` checkout. Preserve private record, credential,
exact candidate, and rollback checks; do not broaden them into public predicates.

The source checkout has no `.prism/project.json`; do not fabricate one or invoke
source-checkout setup. Missing managed-consumer metadata must still fail closed.
The OCR/version-one bridge and separate OCR-cutover spec remain unchanged.
Keep the ignored withdrawn-plan archive local; finalization cleans only the
active task plan/spec/handoff, preserving durable ADRs and unrelated work.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
