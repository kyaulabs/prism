# 0050. Oversized brainstorming delegates to wayfinder with a strict greenfield bootstrap

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-08-03

## Status

Accepted

## Context

Prism currently offers both ad-hoc brainstorming decomposition and wayfinder maps for work that is too large for one spec. The duplicate routes drift, while a fresh Prism scaffold lacks enough project evidence for a useful map.

## Decision

We use wayfinder as the sole pre-spec discovery and decomposition route for oversized requests. Brainstorming performs its scope gate before detailed grilling and ends by loading wayfinder for established or indeterminate repositories. Ticketing remains the post-spec/plan implementation decomposition mechanism under ADR-0020.

Strict greenfield is an all-of predicate evaluated by `.github/scripts/classify-greenfield.sh`: the quality-surface manifest exists; Git contains no commits; `CONTEXT.md`, `docs/plans/`, `docs/specs/`, and `adr/` are absent; and `backend/`, `cdn/`, `aurora/`, and the webroot named by `prism.jsonc.app` are absent. Unreadable or malformed evidence is indeterminate and fails closed to established routing.

Strict-greenfield oversized work receives one brainstorming session for a walking-skeleton bootstrap: scaffold plus one thin vertical slice. The approved bootstrap spec forms part of ADR-0044's human-pushed single-root seed on `develop`; implementation continues on a normal work branch. The design agent does not plan or implement (ADR-0030).

Bootstrap completion requires `/check` and `@code-review`. Before ADR-0027 cleanup, a fresh wayfinder session creates the remainder map and stores an immutable repository blob URL for the bootstrap spec in Notes. Finishing then resumes cleanup and repeats attestation, `/check`, and `@code-review` because HEAD changed.

## Consequences

- Oversized work has one durable pre-spec route and one shared decision map.
- Greenfield maps are delayed until real code exists.
- Greenfield setup requires a remote, authenticated GitHub CLI, ruleset provisioning, and a human initial push before the mandatory map can be created.
- The classifier and cross-surface contract tests become load-bearing harness interfaces.

## Alternatives Considered

- Keep brainstorming's manual sub-project decomposition: rejected because session-only decisions drift and consume context.
- Route every oversized request directly to wayfinder: rejected because an empty scaffold provides no evidence for useful tickets.
- Infer greenfield from missing application code alone: rejected because established non-application repositories would be misclassified.
