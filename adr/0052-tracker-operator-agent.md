# 0052. Tracker-Operator Agent for Ticketing gh Execution

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-08-11

## Status

Accepted

Partially supersedes ADR-0019 (Decision #2's "@explore as hands" clause) and
ADR-0020 (item 3's "commands run in Plan context without agent: frontmatter"
clause). Amends ADR-0006's read-only contract application to @explore.

## Context

Issue #298: the ticketing workflow (`ticketing` skill + `/issue` family +
`/setup-labels`) delegates all `gh` CLI execution to `@explore`. ADR-0006
locked `@explore` to a read-only contract (bash catch-all deny, no gh rules),
so every one of the 26 delegated gh commands — 12 reads, 14 mutations
(issues, labels, custom fields, blocking edges) — resolves config-deny and
fails mid-workflow. The delegation entered with the skill's birth and was
never reconciled with the permission model; nothing in the harness verifies
that a skill's declared executor can run its delegated commands. Issue #274
promised a no-`gh` escalation clause for `@explore` that was never delivered.
ADR-0042's circuit breaker mitigates the retry-loop symptom but not the
incompatible delegation.

Forces: mutations must retain explicit human approval; least privilege;
`@explore` stays read-only (ADR-0006); the ticketing workflow stays
interactive (interview + confirmation gates); ADR-0022 keeps model/variant in
`opencode.jsonc`; ADR-0047/0048 require the env/auth deny set on every
bash-object agent; ADR-0049 requires a restart after config changes.

## Decision

We introduce a dedicated **`@tracker-operator` subagent** as the canonical
executor of the ticketing workflow's GitHub tracker operations, and we rewire
the ticketing skill and `/setup-labels` to it.

- **Permission posture (frontmatter):** `edit: "*" deny`; bash catch-all
  `"*": deny` FIRST, then read-only `gh` commands allow (`gh --version`,
  `gh auth status`, `gh repo view`, `gh issue view`, `gh issue list`,
  `gh label list`) and every mutation ask-gated (`gh api*`, `gh issue
  create/edit/comment*`, `gh label create/edit*`); `cat > /tmp/*` allow for
  payload plumbing; the five-entry env/auth deny set (ADR-0047/0048);
  `webfetch`, `websearch`, `task`, `lsp` deny; `question` allow (interactive
  gates). Ordering is load-bearing: catch-all first, last matching rule wins.
- **Scope (least-privilege):** issues, labels, issue fields, and blocking
  edges only. PRs, releases, projects, repo administration, and general shell
  fall to the catch-all deny — denied by omission, no ordering traps.
- **Model tier:** PLANNER (`{env:OPENCODE_MODEL_PLANNER}` +
  `{env:OPENCODE_VARIANT_PLANNER}`), temperature 0.1 literal in both
  `opencode.jsonc` and the `.md` frontmatter (ADR-0022). Justification: the
  operator owns the interactive ticketing workflow when command-bound —
  mode detection, interview, from-spec decomposition, and gh execution — the
  same interview+decomposition profile as `@from-issue` (PLANNER). PRIMARY is
  reserved for code/build execution; UTILITY does not own interactive
  interviews. PLANNER matches the sibling on-ramp and keeps interview quality
  at the gpt-5.6-sol tier.
- **Command bindings:** `/issue`, `/ticket`, `/issues`, `/tickets`,
  `/setup-labels` declare `agent: tracker-operator` in frontmatter. A command
  bound to a subagent triggers a subagent invocation by default
  (commands.mdx) — the operator's permission sandbox applies to the whole
  run. `question: allow` keeps the skill's interactive gates working inside
  the invocation. `subtask: false` is NOT used (it would run the command in
  the caller's context and lose the permission sandbox).
- **Execution topology (resolves self-delegation):** the ticketing skill
  states: when a `/issue`-family or `/setup-labels` command invoked you, you
  ARE the tracker-operator — run the gh steps directly. In any other context
  (wayfinder, from-issue), dispatch `@tracker-operator` for every gh step.
  `task: deny` on the operator makes self-dispatch impossible, so the two
  paths are exclusive by construction.
- **Skill-shape rewires:** GraphQL node-ID lookups move to
  `gh issue view <N> --repo "$REPO" --json id -q .id` (allowed); the
  pre-flight labels fetch moves to `gh label list --repo "$REPO" --json name`
  (allowed); the standalone `TITLE=$(cat …)` line is folded into
  `gh issue create --title "$(cat /tmp/issue-title.txt)"`. Only
  issue-types/issue-fields pre-flights stay `gh api` (no native command
  exists) — 2 ask-gated prompts per run. Approval prompts drop from 12 to 8.
- **`/setup-labels`:** bound to the operator. Its label mutations are
  currently UNGATED under `agent: build`'s allow-all; the operator makes them
  ask-gated.
- **`@explore` (#274 promise):** gains a no-`gh` escalation clause — no gh
  access; if a task requires GitHub data, return immediately and tell the
  caller to execute it itself or dispatch `@tracker-operator`.
- **Ownership boundary:** `@tracker-operator` is canonical for ticketing +
  `/setup-labels`. `@from-issue` retains its own proven gh block (reads
  allow / mutations ask) for on-ramp triage; it is a separate bounded
  context, not a consumer of the operator. Wayfinder's inline gh blocks
  (label idempotency, blocking edges) remain in its invoking context — a
  documented exception, tracked as follow-up.
- **Untrusted content:** the operator's prompt treats issue titles, bodies,
  comments, and label names as untrusted external content (AGENTS.md) and
  never interpolates them into shell strings.

## Consequences

- The ticketing workflow no longer dead-ends in permission denials: every
  delegated gh command resolves allow (read) or ask (mutation) for the
  declared executor.
- Mutations retain explicit human approval through the hard `ask` gate AND
  the skill's mandatory preview/confirmation question (auto mode caveat
  documented: `ask` can be auto-approved, the question gate cannot be
  skipped).
- `@explore` returns fully to its read-only contract; #274's escalation
  promise is delivered.
- A standing delegation-consistency guard (`TicketingDelegationTest.php`)
  reads the executor dynamically from the skill's Cross-refs, so any future
  permission/executor drift fails CI.
- New agent requires: AGENTS.md + README.md table rows (validate-harness),
  model tier docs, OpenCode restart (ADR-0049).
- `gh api*: ask` also prompts on read-only pre-flight GETs (issue-types,
  issue-fields) — 2 prompts/run, accepted trade-off; do not session-approve
  "always" (could later approve API mutations).
- Harder: `@explore` can no longer be named as a delegation target anywhere;
  skills that reference the old pattern must route to the operator.

## Alternatives Considered

- **Reuse `@from-issue` as executor:** rejects the denials (its rules
  resolve ask/allow) but semantically overloads the on-ramp, is not in the
  plan-tab dispatch allowlist, and does not fix `/setup-labels`. Rejected.
- **No agent; callers run gh directly:** mutations then run ungated under
  primary allow-all bash — violates "mutations retain explicit human
  approval". Rejected.
- **Grant gh ask rules to existing primaries:** mechanically works but widens
  the general build/design surface beyond least privilege. Rejected.
- **Bind commands to `build`:** relies on prose confirmation for safety;
  `build` has broad bash permission. Rejected (the operator is the hard-gated
  alternative).
