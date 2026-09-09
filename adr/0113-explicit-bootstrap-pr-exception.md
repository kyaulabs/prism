# 0113. Explicit bootstrap PR exception

Date: 2026-09-08

## Status

Accepted by explicit user approval for the review-system cutover.

Retirement is tracked in [issue #536](https://github.com/kyaulabs/prism/issues/536).
Remove the exception after normal version-two review and `/pr` work end to end;
retain this ADR as history.

Narrowly extends ADR-0103's finalization requirements. Normal review authority,
receipt validation, mandatory gates, and ADR-0112's attempt policy are unchanged.

## Context

The reviewer cutover cannot finalize itself with the current installation. The
launcher targets the reviewed checkout, criteria and check authority are missing,
and only a legacy review chain exists. A protected-baseline prototype also found
that the baseline SDK cannot resolve the active model. Merging a reviewer repair
before reviewing it would be a bootstrap deadlock.

The user explicitly approved proceeding at one exact revision with freshly run
local checks and the existing committed approved specification instead of the
unavailable automated review and installed-authority receipts.

## Decision

`prism-tool pr bootstrap-preflight` is a separate, explicitly approved operation.
It requires literal approval, branch, HEAD SHA, develop base SHA, specification
commit, and specification path. Approval is instruction-layer human authority,
not authentication supplied by the CLI's literal `yes` argument. Ordinary `/pr`
invocation alone does not grant it. There is no standing toggle or saved waiver.

The operation retains clean-tree, branch, synchronized-base ancestry, meaningful
diff, toolchain readiness, and managed-project health checks. It verifies the
committed specification and runs the existing Core and active adapter quality
gates locally, without requiring an independent installed quality provider.
Checks execute in a bounded child process. Identities are checked throughout the
run and again before final preflight output. No authoritative check or criteria
receipt is minted, and no legacy review state is changed.

Only absent or safely recognized legacy review chains are eligible. Unsafe
receipts and existing version-two review evidence cannot be bypassed. A check
failure, missing gate, identity drift, or any ordinary structural preflight
failure prevents readiness.

Successful output says `REVIEW_CHAIN USER_WAIVED` and `LOCAL_CHECKS PASS`.
It is not a review PASS. PR preparation must retain the exact identities,
specification reference, and explicit disclosure that the user waived automated
review and installed-authority receipts because the reviewer cannot bootstrap
itself. Humans remain responsible for pushing, opening, reviewing, and merging
the PR. A changed branch, HEAD, or base requires fresh explicit human approval;
the coordinator must never regenerate approval arguments automatically.

## Consequences

- This permits an honestly disclosed bootstrap PR to `develop`, not self-certified
  independent review.
- Local checks still execute. Repeated preflight calls rerun them; there is no
  durable exception or cached synthetic PASS.
- The local checker necessarily trusts reviewed code under the disclosed
  exception. This is weaker than independent installed authority.
- Resolving model readiness and completing any protected-baseline redesign remain
  separate work. This exception does not fix or hide either problem.
- No provider, model, credential, dependency installation, safety protection,
  commit hook, signature, push, or merge setting is changed.
