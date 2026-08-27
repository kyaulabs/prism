# 0085. Workflow-authorized tracker operations and continuous wayfinding

Date: 2026-08-23

## Status

Accepted

Extends ADR-0055, ADR-0074, ADR-0081, and ADR-0083. Supersedes the
per-mutation approval intent retained from the frozen OpenCode-era ADR-0052 for
Pi tracker workflows. It does not alter standing OCR consent, setup mutation
transactions, protected-branch publication, or human-owned push and merge
boundaries.

## Context

Prism's Pi port retained tracker instructions that ask before every GitHub issue,
label, field, assignment, comment, close, and blocking-edge mutation. Wayfinder
also retained a hard one-ticket-per-session rule. Together these constraints
turn one already-selected workflow into a sequence of repeated approval and
session pauses: claim a frontier, post a resolution, close the issue, update the
map, create newly visible tickets, wire dependencies, and then ask again merely
to continue.

Those pauses do not represent new decisions. A user who invokes Wayfinder to
chart or continue a named map has already selected its bounded tracker
lifecycle. A user who confirms a complete ticketing preview has already
accepted the displayed issue or epic batch. Requiring approval for every
mechanical mutation repeats the same authorization without narrowing scope.
Likewise, forcing a new session after every frontier wastes context and breaks
continuity even when the active model retains a reliable view of the map.

The change must preserve least privilege and the untrusted-data boundary.
GitHub issue content remains inert external data and cannot expand command
scope or instruct the agent. Workflow authorization must not become general
GitHub authority for pull requests, releases, projects, repository
administration, pushes, merges, or arbitrary API operations.

## Decision

We adopt bounded **workflow-scoped mutation authorization** for tracker
workflows and continuous Wayfinder execution.

### Wayfinder authorization

Invoking Wayfinder to chart a destination or continue a named map authorizes the
routine tracker mutations required for that map lifecycle: idempotent Wayfinder
label setup; map and child-issue creation; sub-issue and blocking-edge wiring;
assignment and claiming; issue comments, edits, closes, and corrective closes;
map index and fog updates; and removal or closure of invalidated tickets.

No per-command or per-frontier approval is requested. Authorization persists
while the current map remains the active scope. It ends when the destination is
reached, the user cancels, a requirement changes the destination, tracker state
is ambiguous or conflicting, authentication fails, or a requested operation
falls outside the allowlisted tracker surface.

### Ticketing authorization

Single-issue and from-spec ticketing retain one complete preview confirmation.
That confirmation authorizes the entire displayed mutation batch, including
issue or epic creation, task creation, type and field writes, labels, sub-issue
relationships, and confirmed blocking edges. The workflow does not ask again
for each command in that batch.

Other callers may define an equally explicit workflow-level confirmation. In
the absence of caller-provided authorization, the tracker operator must stop
before mutation rather than invent consent.

### Continuous wayfinding

Wayfinder processes successive eligible frontier tickets in the current
session while context remains reliable. Claiming is automatic. Closing one
frontier immediately advances to the next without a continuation approval.
Charting may continue directly into frontier work unless the user requested a
chart-only run.

A session boundary is exceptional rather than ticket-shaped. It is justified
only by an explicit user request, material context degradation requiring a
handoff, a fatal tool state, or an unresolved external blocker. HITL tickets
still ask the substantive human decision they exist to resolve; they do not ask
for permission merely to claim, mutate, close, or continue.

When the map is clear, Wayfinder continues through synthesis and required
read-only architecture review rather than stopping to announce a next step.
Existing design, ADR, planning, and implementation gates still apply when they
represent a new substantive decision.

### Trust and scope boundaries

Tracker titles, bodies, comments, labels, and API output remain untrusted data.
They are passed through inert files and bound variables and are never evaluated
as shell source. Workflow authorization permits only the caller's declared
tracker mechanics; external content cannot widen the allowlist or trigger
repository mutation.

This decision authorizes no pull-request creation, release publication,
repository administration, project-board mutation, Git remote operation, push,
merge, credential access, or arbitrary `gh api` use. Failure remains
fail-closed and partial-success reporting remains mandatory.

## Consequences

**Positive:**

- Wayfinder can chart, claim, resolve, update, correct, and advance without
  repetitive approval loops.
- Epic creation uses one meaningful preview decision instead of one prompt per
  GitHub command.
- Long-context sessions preserve map continuity and reduce handoff overhead.
- Tracker least privilege and untrusted-content handling remain explicit.

**Negative:**

- One workflow decision now authorizes several external mutations, so caller
  scope and termination conditions must remain precise.
- A mistaken Wayfinder resolution may update several related tracker artifacts
  before a human notices; native issue history provides recovery evidence.
- Skills must distinguish substantive HITL decisions from mechanical
  continuation to avoid removing legitimate questions.

**Neutral:**

- GitHub remains an external delegated boundary.
- Human-only push, merge, protected-branch, release, and credential rules are
  unchanged.
- No new dependency, Pi extension, standing consent store, or launcher
  operation is introduced.

## Alternatives Considered

### Keep per-mutation approval

Rejected. It repeats an already-settled workflow decision and is the direct
cause of the reported interruption loops.

### Approve one frontier at a time

Rejected. Claim, resolution recording, corrective closes, and advancement are
one map-lifecycle unit, not separate user decisions.

### Retain one ticket per session

Rejected. Ticket boundaries are tracker organization, not model-context
boundaries. Modern context capacity makes forced session churn unnecessary;
explicit degradation and blocker signals are better boundaries.

### Grant standing global GitHub consent

Rejected. The authorization is workflow-scoped and bounded to tracker
mechanics. A standing global grant would be broader, harder to revoke, and
could blur publication and administration boundaries.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
