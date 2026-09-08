# 0111. Native Pi session continuity

Date: 2026-09-07

## Status

Accepted

Partially supersedes ADR-0055's consequence prescribing `/handoff` for context
management. Its single-agent pipeline and non-orchestration boundaries remain.

## Context

Prism retained a session-handoff prompt and fixed context-percentage rules from
its earlier execution model. These rules can interrupt a well-defined task,
write a repository document, and ask the human to start another session solely
because the conversation is long.

Pi supports native compaction during an active run and resumes within the same
session. Prism already has approved plans, specifications, verification
records, and tracker state for durable workflow facts. A separate handoff
capability duplicates those surfaces and imposes avoidable interruption.

## Decision

Prism removes its `/handoff` prompt, active command listings, and instructions
that recommend session-handoff documents. Long-running work continues in the
current Pi session using native compaction. Fixed percentage rules do not
require a session change. Current task status, approval boundaries, interfaces,
and verification evidence remain in the workflow's existing owned artifacts.

Prism does not add a compaction extension, replacement slash command, new
continuation store, or automatic settings mutation. Pi and the human retain
control of compaction settings and manual `/compact` invocation. Agents do not
claim to have invoked a slash command through Bash or an unavailable tool.

Actual blockers and safety gates still stop unsafe work. Fatal tool states
retain their existing recovery contract. The human can request a new session.
Normal transitions between skills and isolated review sessions are unrelated
to this removal and remain unchanged.

Historical ADR bodies and changelog entries stay intact. The removal does not
delete user-authored historical handoff documents or unrelated artifacts.

## Consequences

- Session length alone no longer causes Prism to stop an otherwise executable
  plan or investigation.
- There is one fewer packaged command and no replacement persistence surface.
- Workflow-owned records must remain current across compaction.
- Pi compaction is not a substitute for checking current repository state,
  reloading relevant skills, or respecting approval and verification gates.
- Documentation and contract tests distinguish session handoffs from ordinary
  skill transitions so the removal does not damage pipeline semantics.

## Alternatives Considered

### Keep the command but remove automatic recommendations

Rejected by the user in favor of removing the capability entirely.

### Replace handoff with a Prism compaction extension

Rejected. Pi owns compaction, and an extension would recreate orchestration
rather than reduce the workflow surface.

### Delete all uses of the word handoff

Rejected. Skill transitions, release handoffs, and historical records have
independent meanings and remain valid.
