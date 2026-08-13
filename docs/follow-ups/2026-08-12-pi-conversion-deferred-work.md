# Deferred Work — OpenCode → pi Conversion (Stage 7)

> **Status tracking.** This document records the work explicitly deferred by
> **Stage 7** of the conversion plan
> (`docs/plans/2026-08-12-opencode-to-pi-conversion.md`).
> Stage 7 is a placeholder stage — **"DO NOT execute in this conversion"** —
> whose sole deliverable is to *record* the follow-up items so they are not
> forgotten. Each item below is **out of scope** for the conversion and becomes
> its own plan/spec (`docs/plans/` or `docs/specs/`) when work on it starts.
>
> Reproduced verbatim-first from the plan; do not edit the wording without
> superseding the originating plan entry.

The three items below are carried verbatim from the plan. When you start one,
open a plan/spec that supersedes the corresponding entry here and mark the
entry **Started** with a link.

---

## 1. Eval suite rework

**Status:** Deferred — becomes a plan/spec when started.

`.opencode/evals/` (PHP `EvalRunner`, smoke cases,
judge agent) was built around the opencode judge sub-agent and opencode's
session API. Under pi (no sub-agents), rework it against pi's `--mode json`
/ `--mode rpc` / SDK (`createAgentSession`). Write a fresh spec first; the
judge can run as a separate `pi -p` invocation on the cheap
`deepseek-v4-pro` model. Open question: keep PHP as the eval host language
or move to node/TS to match pi's stack?

## 2. Additional language adapters

**Status:** Deferred — becomes a plan/spec when started.

(`prism-python`, `prism-rust`, `prism-go`). Each is a new package mirroring
`prism-php-web`'s shape (stack skill, `tdd-<lang>`, `check-<lang>`,
`safe-dirs.json`, reference docs). The core package must not need changes —
if it does, the core/adapter boundary is wrong and must be re-examined
(halt + ADR).

## 3. Publish + repo split (optional)

**Status:** Deferred (optional) — becomes a plan/spec when started.

If the harness outgrows living inside a consuming project repo, split
`packages/` into a dedicated `kyaulabs/prism` repo and publish to npm
(`@kyaulabs/prism-core`, `@kyaulabs/prism-php-web`). The package layout in
this plan is already publish-ready, so this is a move + CI setup, not a
re-architecture.
