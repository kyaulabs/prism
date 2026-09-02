# Spec: Prism review authority cutover and OCR removal

**Date:** 2026-09-02
**Status:** Approved

## Problem statement

The runtime foundation and authority bridge can review a separate repository from an installed stable package, but Prism still uses OCR, review-chain version one, agent-authored check evidence, OCR consent, and OCR-derived commit attribution. Keeping both authorities indefinitely would create conflicting readiness, consent, receipt, and finalization rules.

Prism needs one cutover branch that is reviewed by the released foundation engine. The branch must switch every authoritative workflow to version two and remove OCR's shipped contract without changing the user's provider or publication authority.

## Solution

Use the installed foundation release to capture the cutover requirements, run deterministic checks, and review the cutover branch. Update Core workflows to call the stable `prism-review` authority and consume exact criteria, check, and review receipts. Preserve the current one-attempt authorization, repair-delta, Advisory, synchronization, attestation, and human-only publication rules.

Change ordinary commit attribution so `Tested-by` uses the validated active Pi model. Move standing consent to a web-only schema. Remove OCR's dependency, executable path, readiness checks, model resolver, consent commands, documentation, tests, and lockfile entries while retaining Semgrep.

## User stories

1. As a Prism user, I want finalization to use the stable installed reviewer, so that reviewed HEAD cannot define its own authority.
2. As a Prism user, I want criteria captured before cleanup, so that the requirement axis sees the approved spec and plan.
3. As a Prism user, I want `/check` to publish deterministic exact-HEAD evidence, so that a failed or interrupted rerun cannot reuse stale green state.
4. As a Prism user, I want one plan-approved initial review and explicit approval for each later attempt, so that provider cost and code egress remain bounded.
5. As a Prism user, I want every repair delta reviewed on all four axes, so that repair does not narrow coverage.
6. As a Prism user, I want `/pr` to recover only an absent initial chain with complete attestation, criteria, and check evidence, so that preparation cannot bypass finalization.
7. As a Prism user, I want exact same-HEAD receipts reused, so that duplicate commands do not repeat inference.
8. As a Prism user, I want Advisory findings disclosed without waivers, so that useful follow-up does not block delivery.
9. As a Prism user, I want all incomplete or uncertain review states to stop before `/pr`, so that absence of evidence is never green.
10. As a Prism user, I want review to use the current Pi provider/model/reasoning settings, so that Prism does not configure or route models.
11. As a Prism contributor, I want ordinary commits to keep `Implemented-by`, `Tested-by`, and `Signed-off-by`, so that the established commit shape remains stable.
12. As a Prism contributor, I want `Tested-by` derived from the active Pi model, so that commit creation no longer depends on OCR configuration.
13. As a Prism user, I want setup and doctor free of mandatory OCR readiness, so that OCR can be uninstalled after cutover.
14. As a Prism user, I want existing web-access consent preserved during migration, so that removing OCR does not silently change an independent choice.
15. As a Prism user, I want legacy consent interpreted without granting review authority, so that old state is safe before explicit migration.
16. As a Prism maintainer, I want package and repository checks to prove no shipped OCR contract remains, so that removal is complete.
17. As a Prism user, I want Semgrep to remain mandatory deterministic evidence, so that the replacement does not weaken static analysis.
18. As a Prism user, I want humans to remain responsible for package installation, pushes, pull-request creation, and merges, so that review does not widen mutation authority.

## Implementation decisions

### Cutover precondition

The branch begins only after humans merge, release, publish, and install the runtime foundation and authority bridge Core and adapter packages. `prism-review doctor` must prove that the selected Core package and adapter quality provider are outside the checkout, that Core policy resources match the installed package, and that the protected-base adapter profile matches the installed adapter identity and version.

The cutover plan and specification are recorded as immutable criteria before implementation. The stable engine may run shadow evidence before workflow edits, but only its complete review of the final attested HEAD creates authority.

### Finalization workflow

The final sequence is:

1. retain the approved criteria receipt;
2. finish implementation and task verification;
3. remove the matching completed development artifacts under ADR-0027;
4. require a clean tree;
5. fetch and synchronize the target branch under the existing branch rules;
6. attest branch, HEAD, base reference, and base SHA;
7. run deterministic `/check` until an exact-HEAD PASS receipt exists;
8. consume one authorization for the chain-selected `prism-review` attempt;
9. require complete version-two evidence and no open Blocking finding;
10. revalidate the clean tree and exact attestation; and
11. invoke preparation-only `/pr`.

Plan approval authorizes artifact cleanup, target synchronization, unlimited local checks and plan-scoped repairs, one initial review attempt, revalidation, and PR preparation. It does not authorize package installation, push, pull-request creation, merge, or another review attempt. A failed or Blocking review consumes the attempt. After repair and a new PASS check receipt, each additional repair review requires fresh explicit approval.

The `code-review` skill becomes the human-readable coordinator for the engine rather than an inline OCR and single-agent review implementation. `receiving-code-review` consumes normalized version-two findings without changing its anti-over-compliance rules.

### `/check`, doctor, setup, and release

`/check` delegates deterministic Core and adapter quality execution to the trusted launcher and requires a PASS receipt for the current attestation. It remains the pre-push gate. Semgrep stays in the Core toolchain contract. The active adapter keeps stack tests, lint, coverage, builds, browser checks where applicable, and locked-dependency audits.

`/doctor` validates Git, Node, Semgrep, Pi SDK compatibility, model metadata availability, installed trust-root provenance, Core profile, and active adapter compatibility without a live inference request. Authentication failures surface at an authorized review attempt because local auth-status reporting is not authoritative.

`/setup` no longer asks for OCR consent or reports OCR readiness. It retains independent web-access setup and all existing registry, repository-automation, hook, package, model-preference, and GitHub boundaries. `/release` no longer requires OCR but continues to require the full local quality gate and valid review evidence.

### Model attribution

Commit creation continues to validate the active `PI_MODEL` value already used for `Implemented-by`. After cutover, it uses that same validated model ID for `Tested-by` and removes the OCR model resolver. The exact provider, model, and reasoning level used for final review remain in the review receipt rather than commit trailers.

PR-title validation uses inert synthetic trailers based on the validated active Pi model. It does not inspect OCR configuration. The cutover branch's own commits may retain OCR-derived `Tested-by` values because the prior installed package creates them; the released cutover package governs future commits.

### Consent migration

Consent schema version three contains only `webAccess`. The parser accepts schema-one and schema-two records as legacy read-only input and preserves their web choice. OCR fields never authorize review after cutover.

`/setup` is the only workflow allowed to migrate legacy consent. It displays the preserved web-access value and asks for explicit mutation approval. Approval writes schema three when web access is enabled or removes an all-false record through the managed-record boundary. Decline leaves readable legacy state in place. Unsafe state is never overwritten, removed, or treated as review consent.

Legacy or unsafe consent no longer blocks mandatory review or doctor because those operations do not depend on it. Unsafe consent disables optional web access and reports human remediation. Installation does not create, migrate, grant, revoke, or remove consent.

### OCR removal

The cutover removes all shipped OCR-specific behavior together:

- package and toolchain declarations;
- version and connectivity checks;
- dedicated process wrapper and argument policy;
- OCR model resolution;
- review and scan dispatch;
- consent status and grant/revoke commands;
- setup, doctor, check, release, finalization, PR, and global-instruction wording;
- OCR-specific unit, integration, fixture, and shell tests; and
- lockfile entries and package documentation.

Semgrep remains a mandatory Core prerequisite and review evidence source. Historical ADRs, changelog entries, and Git history may still name OCR. Bounded absence checks apply to shipped current contracts, not immutable history.

ADR-0102 governs the review runtime and trust root. ADR-0103 identifies the exact clauses it partially supersedes in ADRs 0055, 0063, 0064, 0074, 0080, 0081, 0091, and 0093. Existing unrelated decisions in those records remain in force. Domain context and current documentation describe only the version-two authority after cutover.

### Review and PR recovery

Version-two chain verification is the only accepted authority after cutover. Version-one state is `LEGACY` and does not pass preflight. A normal authorized new-initial review may replace safely recognized legacy state after success. Unsafe or malformed state fails closed.

Standalone `/pr` may authorize one complete initial review only when chain state is exactly `ABSENT` and matching criteria, check, synchronization, and attestation evidence already exists. It never repairs, migrates legacy state, chooses source requirements, reruns checks, or authorizes a second review.

The PR body reports deterministic `/check` evidence, review model provenance, all axis statuses, open or closed Blocking findings, and Advisory findings. It does not include source bytes, provider transcripts, or hidden reasoning. The command remains preparation-only.

## Testing decisions

The primary seam is the installed foundation `prism-review` CLI reviewing the cutover fixture and, during finalization, the real cutover branch. Automated tests continue to inject fake sessions. No test reads credentials or requires live inference.

Spawned workflow tests cover finalization order, criteria-before-cleanup, check invalidation, initial authorization, Blocking repair, fresh-approval enforcement, same-HEAD reuse, SHA drift, moved base, dirty tree, version-one legacy state, absent-chain `/pr` recovery, and preparation-only output.

Commit and PR-title tests cover valid and invalid `PI_MODEL` values and prove no OCR configuration lookup remains. Consent tests cover absent state, both legacy schemas, preserved web access, explicit migration approval, decline, unsafe modes, atomic publication, and optional-web failure semantics.

Doctor, setup, check, release, installer, package archive, and lockfile tests prove that OCR is not required or shipped and that Semgrep remains required. Repository-wide searches use a reviewed allowlist for historical ADR and changelog references; any current package, prompt, skill, script, hook, configuration, test, or documentation reference outside that allowlist fails.

The final branch must pass `/check` through the installed foundation quality provider and one complete initial version-two review through the installed foundation reviewer before `/pr` preparation.

## Out of scope

- Automatic package publication or installation.
- Removing historical OCR references from immutable records.
- Changing the user's provider, model, reasoning level, or Pi authentication.
- Adding standing review consent.
- Multiple active adapters, arbitrary project policy, or hosted review services.
- Automatic retries after a consumed review attempt.
- Push, pull-request creation, merge, release publication, or branch deletion.

## Further notes

The implementation plan for this specification must be written after the foundation release is installed. It must use file paths and interfaces from that released HEAD rather than the original external proposal.
