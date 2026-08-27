# 0077. Core-owned repository bootstrap and automatic root seed

Date: 2026-08-20

## Status

Superseded by ADR-0084

## Context

A new PHP/web project currently requires separate manual operations to initialize Git, select `develop`, activate hooks, stage the testing scaffold, run quality checks, and create the initial signed commit. The testing-ready project bootstrap specification makes `/setup` responsible for coordinating those stages while preserving Prism Core's ownership of Git policy and the PHP/web adapter's ownership of stack-specific files and checks.

ADR-0044 permits one single-root exception on a protected branch and reserves publication for the human. ADR-0050 requires a human-pushed single-root seed for strict-greenfield bootstrap. ADR-0070 puts fixed multi-step mechanics behind narrow launcher operations. ADR-0074 makes selected commit workflows approval-free and treats every commit failure as fatal for the active extension instance.

No accepted decision establishes whether `/setup` may create the repository and root commit automatically, how eligibility is tied to the active invocation, or how a bounded setup inventory reaches the exclusive commit operation without staging unrelated pre-existing files.

## Decision

Prism Core owns one deterministic local repository-bootstrap lifecycle inside `/setup`.

### Git initialization

A Core launcher operation classifies the current project as `CREATE`, `PRESERVE`, or `CONFLICT`.

- `CREATE` is allowed only when the current real directory belongs to no containing worktree and has no `.git` entry.
- A created repository has a real `.git` directory, unborn `develop`, SHA-1 objects, files refs, zero commits and refs, no remotes, no active hooks, and no identity, signing, credential, or publication configuration.
- `PRESERVE` never reruns `git init` or changes existing repository state.
- Unsafe or orchestration-incompatible state is preserved and reported `CONFLICT` or NO-GO rather than repaired or normalized.

Only `CREATE` produced by the active `/setup` invocation makes the project eligible for automatic root seeding. A previously or manually initialized repository, including an unborn `develop` repository, is never auto-committed by a later setup invocation.

### Attempt attestation

A successful `CREATE` produces a one-attempt launcher attestation bound to:

- the canonical project root;
- the exact Git creation disposition and postconditions;
- a fresh non-secret attempt identifier;
- the active adapter identity;
- the attested adapter scaffold inventory and digests;
- the canonical Core hook inventory and digests; and
- the staged index digest used for final verification.

The attestation is stored only in a Core-owned project-local operational area, uses bounded regular files and restrictive modes, contains no credentials, and is never accepted from an arbitrary caller path. Later seed preparation must present the active attempt identifier returned by `CREATE`; a `PRESERVE` result returns no eligible identifier. Successful commit creation or explicit abandonment consumes the attestation. Stale, substituted, mismatched, or concurrently changed state fails closed.

The exact command spelling and schema version are implementation interfaces, but their semantics are launcher-owned under ADR-0070 and safety-compatible under ADR-0073.

### Bounded seed

After the adapter transaction and canonical hooks both verify GO, Core stages only the attested setup inventory:

- project-local adapter activation data;
- canonical adapter scaffold files, manifests, and locks;
- generated testing CI; and
- canonical Core hook wrappers.

Application code, database artifacts, production configuration, environment files, credentials, whole directories, unrelated pre-existing paths, and unexpected staged entries are excluded. Unrelated untracked paths remain unstaged and are reported. Overlap, unsafe path kinds, state drift, or failure to prove exact staged-inventory equality blocks the seed.

The shared adapter-owned local/CI quality implementation runs against the staged seed before commit creation. There is no bootstrap-only test, coverage, lint, hook, or signing bypass.

### Automatic root commit

On verified GO, `/setup` invokes `prism-tool commit create` as the only tool call in its assistant batch with the deterministic header:

```text
ignore: bootstrap prism project
```

The reserved `ignore` type remains valid only for an initial repository seed. The commit launcher resolves attribution, validates the message and protected-branch exception, runs hooks, signs, verifies `HEAD` advancement, and cleans private state.

Selecting `/setup` authorizes this exact root commit attempt without another commit question. It does not authorize any later commit, amend, merge, tag, remote operation, or push.

Any commit failure retains ADR-0074's fatal latch: abort the operation, block every later tool call, and require human `/reload` followed by repository inspection before another attempt. A late failure may have created the commit, so setup never retries automatically.

### Publication boundary

Setup ends after verified root commit creation. It creates no remote, performs no fetch/pull/push, opens no pull request, and applies no GitHub ruleset. The human configures hosting, performs the initial `develop` push, and runs post-push ruleset setup. Every later protected-branch change follows normal work-branch and pull-request integration.

This decision extends ADR-0044 and ADR-0050 without changing their human-only publication boundary. It extends ADR-0074 by recognizing `/setup` as the workflow selection that authorizes one exact initial-seed commit while preserving exclusive execution and fatal failure recovery.

## Consequences

- **Positive:** a genuinely new project reaches one signed, tested root seed through one ordered workflow.
- **Positive:** existing repositories are never reinitialized or auto-committed.
- **Positive:** setup cannot silently stage unrelated project content.
- **Positive:** the root commit uses the same signing, attribution, hook, and fatal-failure boundary as every ordinary Prism commit.
- **Negative:** Core gains a project-local attempt-attestation schema and cleanup surface that must remain versioned, bounded, and race-safe.
- **Negative:** unrelated untracked files may remain after the root seed and require an explicit later work-branch decision.
- **Negative:** a commit failure is intentionally disruptive and may require inspection of an already-created root commit after reload.
- **Neutral:** the initial push and all GitHub configuration remain human-owned.

## Alternatives Considered

### Initialize Git but leave the root commit manual

Rejected by the approved bootstrap contract. It leaves the project between scaffold readiness and protected-branch seeding and duplicates staging, checking, signing, and attribution steps.

### Auto-commit every unborn `develop` repository

Rejected because it cannot prove the repository was created by the active setup invocation and would mutate manually initialized existing repositories.

### Stage every project file

Rejected because a missing Git repository may contain unrelated or sensitive pre-existing files. Setup ownership is limited to its attested inventory.

### Create a second commit implementation for setup

Rejected because ADR-0074 establishes `prism-tool commit create` as the exclusive ordinary signed-commit boundary. Setup composes with it rather than bypassing it.

### Push the root seed automatically

Rejected because agents never push and ADR-0044/ADR-0050 reserve initial publication for the human.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
