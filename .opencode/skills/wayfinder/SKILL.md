---
name: wayfinder
description: "Use when a request is too big or too foggy for one agent session — work that spans multiple unknowns or subsystems. Charts the work as a shared map of investigation tickets on GitHub Issues, then resolves them one at a time until the route to the destination is clear and hands off to to-spec."
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Wayfinder: Chart Huge Work as a Map of Tickets

A loose idea has arrived — too big for one agent session, and wrapped in fog:
the way from here to the **destination** isn't visible yet. Wayfinding is about
finding that way, not charging at the destination. This skill charts the way as
a **shared map** on the repo's GitHub Issues, then works its tickets one at a
time until the route is clear.

The **destination** is named first — it fixes the scope and shapes every
ticket. It is usually a spec to hand off (via the `to-spec` skill), a decision
to lock before planning starts, or an in-place change like a data migration.

## When to use — and when not to

Load this skill when the work is **too big for one session** or **wrapped in
unknowns you can't yet phrase as sharp questions**. It is the entry point the
`/router` command sends "huge" / multi-subsystem requests to.

The **design tab's scope gate** also sends requests here: brainstorming runs
`bash .github/scripts/classify-greenfield.sh`, and `established` or
`indeterminate` oversized work stops detailed grilling and hands off to this
skill to chart the map.

Do NOT use this skill when a smaller on-ramp fits:

- A single, brainstormable new feature → **design** tab (brainstorming →
  spec → branch → plan → @tdd) — one session can hold it.
- An **existing** GitHub issue small enough to plan and execute in one pass →
  `@from-issue #NN`.
- A question or domain exploration → `@consult`.
- A bug or regression → `@debug`.

If, while charting, you surface **no fog** — the whole journey fits one session
— stop and tell the user; a map is not needed.

## Plan, don't do

Wayfinder is **planning by default**: each ticket resolves a decision, and the
map is done when the way is clear — nothing left to decide before someone goes
and does the thing. The pull to just do the work is usually the signal you've
reached the edge of the map. An effort may override this in its **Notes** —
carrying execution into the map — but absent that, produce decisions, not
deliverables. The exit is the `to-spec` skill: merge the map's decisions into a
spec when the way is clear. Wayfinding is the pre-spec discovery and
decomposition route; once the resolved map merges through `to-spec`,
implementation slicing is the `ticketing` skill's post-spec responsibility.

## Refer by name

Every map and ticket is a GitHub issue, so it has a **name** — its title. In
everything the human reads — narration, the map's Decisions-so-far — refer to
it by that name, never by a bare `#42`. A wall of bare ids is illegible; the
id rides *inside* the name (as its link), never stands in for it.

## The Map

The map is a single GitHub issue, labelled `wayfinder:map` — the canonical
artifact. Its tickets are child issues (GitHub sub-issues) of the map.

The map is an **index, not a store**. It lists decisions made and points at the
tickets that hold their detail; a decision lives in exactly one place — its
ticket — so the map never restates it, only gists it and links.

Create the map and its tickets using the `ticketing` skill's gh pattern (create
issue → GraphQL node ID → set type → REST field values → labels). Wire
dependencies with GitHub's **native blocking** relationship
(`gh issue edit <child> --add-blocked-by <blocker>`, gh ≥ 2.94.0) so the
frontier renders visually in the tracker UI. (Fallback for older gh: the
GraphQL `addBlockedBy` mutation — see `ticketing`.)

### Labels (idempotent)

Before charting, ensure the five wayfinder labels exist. Create them
**idempotently** (the same pattern `ticketing` uses for the `plan` label —
create if absent, ignore if present; `/setup-labels` is the repo-wide
equivalent):

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
for L in wayfinder:map wayfinder:research wayfinder:prototype wayfinder:grilling wayfinder:task; do
  gh label create "$L" --repo "$REPO" --color 5319e7 \
    --description "Wayfinder: $L" 2>/dev/null || true
done
```

(`labels.md` is the canonical vocabulary; `/setup-labels` reads it.)

### The map body

The whole map at low resolution, loaded once per session. Open tickets are
**not** listed — they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or change
this effort is finding its way to. One or two lines; every session orients to
it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this
effort. Reference CONTEXT.md vocabulary and relevant ADRs here.>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then
follow the link for the detail the ticket holds -->

- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the
frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never
graduates -->
```

### Tickets

Each ticket is a **child issue** of the map. Its body is the question, sized to
one ~100K-token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label — one of `research`,
`prototype`, `grilling`, `task` (see Ticket Types). A session **claims** a
ticket by assigning it to the dev driving the map **first**, before any work,
so concurrent sessions skip it.

The answer is **not** part of the body — it is recorded on resolution (see Work
through the map). Assets created while resolving a ticket are linked from the
issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** — human in the loop, worked *with* a human who
speaks for themselves — or **AFK**, driven by the agent alone.

- **Research** (`wayfinder:research`, AFK): reading docs, third-party APIs, or
  local resources. Produces a markdown summary as a linked asset. Delegate the
  gathering to `@scout` / web search when knowledge outside the working
  directory is required.
- **Prototype** (`wayfinder:prototype`, HITL): raise the fidelity of the
  discussion by making a cheap, rough, concrete artifact to react to — via the
  `prototype` skill. Links the prototype as an asset.
- **Grilling** (`wayfinder:grilling`, HITL): conversation via the `grilling`
  skill, one question at a time. The default case.
- **Task** (`wayfinder:task`, HITL or AFK): manual work that must happen before
  a *decision* can be made — provisioning access, moving data so its shape can
  be seen. The one type that *does* rather than decides; it earns its place by
  unblocking a decision.

## Fog of war

The map is **deliberately incomplete**: don't chart what you can't yet see.
Beyond the live tickets lies the **fog of war** — the dim view of decisions you
can tell are coming but can't yet pin down, because they hang on questions still
open. Resolving a ticket clears the fog ahead of it, graduating whatever's now
specifiable into fresh tickets.

The map's **Not yet specified** section holds that dim view: the suspected
question, the area to revisit. Everything there is **in scope**, just not sharp
enough to ticket.

**Fog or ticket?** The test is whether you can state the question precisely now
— *not* whether you can answer it now. **Ticket** when the question is already
sharp (even if blocked); **Not yet specified** when you can't yet phrase it that
sharply. Don't pre-slice fog into ticket-sized pieces.

**Not yet specified** excludes what's already decided (Decisions so far), what's
already a live ticket, and what's out of scope.

## Out of scope

Fog gathers only *toward* the destination. Work beyond it is **out of scope** —
it isn't fog, and never graduates. It gets its own **Out of scope** section:
work you've consciously ruled out of *this* effort. When a live ticket turns
out to sit past the destination, **close it** and leave one line here (gist +
why), linking the closed ticket. It stays out of **Decisions so far**, which
records the route actually walked.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session.**

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Load the `grilling` skill and pin down what this
   map is finding its way to. The destination fixes the scope, so settle it
   first. Use `CONTEXT.md` vocabulary; cite relevant ADRs.
2. **Map the frontier.** Grill again, **breadth-first**: fan out across the
   whole space rather than going deep on one thread, surfacing the open
   decisions and the first steps takeable now. **If this surfaces no fog**, the
   way is already clear — stop and ask the user how to proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in,
   Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues, then wire
   blocking edges in a **second pass** (issues need ids before they can
   reference each other). Everything you can't yet specify stays in the fog.
5. Stop — charting the map is one session's work; do not also resolve tickets.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional** — without
one, you pick the next decision, not the user.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first
   frontier ticket in order (open, unblocked, unclaimed). **Claim it**: assign
   it before any work.
3. Resolve it — **zoom as needed**: fetch the full body of any related or
   closed ticket on demand; invoke the skills the **Notes** block names. If in
   doubt, load `grilling`.
4. Record the resolution: post the answer as a **resolution comment**, **close**
   the issue, and **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer
   has made specifiable, clearing each graduated patch from **Not yet
   specified**. If the answer reveals a ticket sits beyond the destination,
   **rule it out of scope** rather than resolving it. If the decision
   invalidates other parts of the map, update or delete those tickets.
6. When the way to the destination is clear and no tickets remain, **merge to a
   spec** via the `to-spec` skill — the spec references the wayfinder decisions
   (link the map in its Further Notes).

The user may run unblocked tickets in parallel, so expect other sessions to be
editing the tracker concurrently.

## Cross-refs

- `ticketing` skill — the gh create-to-type-to-fields-to-labels + native
  blocking pattern used to create the map and its tickets; also the post-spec
  implementation-slicing mechanism this skill hands off to after `to-spec`.
- `grilling` skill — interview primitive for naming the destination and mapping
  the frontier.
- `prototype` skill — raising fidelity for `wayfinder:prototype` tickets.
- `to-spec` skill — the merge exit; turns the cleared map into a spec.
- `brainstorming` skill — the design-cycle scope gate; hands established and
  indeterminate oversized work here instead of decomposing it ad-hoc.
- `CONTEXT.md` — domain vocabulary every session orients to.
- `/setup-labels` — repo-wide idempotent label creation (reads `labels.md`).
- `/router` — routes "huge" requests to this skill.

## Rules

- Never resolve more than one ticket per session.
- The map is an index, not a store — a decision lives in exactly one ticket.
- Refer to issues by **name**, never bare id.
- Planning by default — produce decisions, not deliverables; merge to `to-spec`.
- Create the `wayfinder:*` labels idempotently; never hard-code the repo name.
- Exactly one `wayfinder:<type>` label per ticket.
- Pre-spec: wayfinding and the map. Post-spec: `ticketing` slices implementation.

## Gotchas

- *Resolving more than one ticket per session* — the hard rule exists so each
  decision gets a fresh, focused context and a clean resolution record.
- *Restating decisions on the map* — the map gists and links; the ticket holds
  the detail. Duplicating decisions makes the map drift out of sync with its
  tickets.
- *Pre-slicing the fog* — don't manufacture tickets for questions you can't yet
  phrase sharply. Let them graduate from **Not yet specified** as the frontier
  advances.
- *Charging at the destination* — wayfinding finds the way; the pull to "just
  do it" is the signal to hand off to `to-spec`.
- *Blocking via body text instead of native blocking* — use
  `--add-blocked-by` so the frontier is visible in the tracker UI without
  opening the map.
- *Slicing implementation on the map* — implementation slicing is `ticketing`'s
  post-spec job. Once the map merges through `to-spec`, stop re-decomposing
  the work here.
