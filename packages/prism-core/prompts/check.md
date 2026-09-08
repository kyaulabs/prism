---
description: Run the installed deterministic Core and adapter quality gate and require an exact-attestation PASS receipt.
---

# Deterministic pre-push gate

Run `prism-tool doctor --local-only` and read-only
`prism-tool automation health --json`. Missing mandatory Semgrep readiness or
managed-state conflicts block the gate; never repair managed state implicitly.

Load `verification-before-completion`. Require a clean tree and the retained
synchronization attestation: branch, HEAD SHA, base reference, and base SHA.
Use `origin/main` for release and hotfix branches and `origin/develop` otherwise.
Retain the immutable approved criteria receipt before development-artifact
cleanup. Do not invent criteria or agent-authored check evidence.

Run the installed authority, never the checkout copy:

```bash
prism-review check --base-ref origin/develop --json
```

Substitute the attested `origin/main` when applicable. The trusted launcher owns
Core checks, Semgrep, managed health, and the installed adapter quality provider.
The adapter owns stack lint, tests, coverage, builds, and dependency audits.
Do not replace provider execution with an inline summary or skip a required gate.

Require exit zero, `status=PASS`, `state=VALID`, and a receipt digest bound to
the exact attestation. A failed or interrupted rerun invalidates prior green
evidence. Re-read the clean tree and exact identities before calling this gate
successful. A source-checkout-only result cannot create authority.

Report PASS / FAIL / SKIPPED by gate using actual execution evidence. End with
GO only when the complete deterministic receipt passes; otherwise NO-GO with
the blocking diagnostics. Do not claim a full check from focused local tests.

This command does not run inference, commit, push, install packages, or repair
failures automatically. During approved finalization, plan-scoped repairs and
unlimited local check reruns are authorized by the coordinator, not by this
prompt. Review attempts retain their separate one-attempt authorization.
