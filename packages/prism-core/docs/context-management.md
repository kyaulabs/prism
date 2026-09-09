# Context management

Continue well-defined work in the current Pi session. Use native compaction to
reduce conversation history; session length alone is not a reason to stop.

## Preserve current state

Keep the active task, approved scope, interfaces, latest verification result,
remaining blocker, and next unchecked step in the workflow's existing owned
artifacts. Update plan checkboxes after verified tasks. Do not introduce another
continuation document or persistence mechanism.

After compaction, reload the relevant skill and current plan task when needed.
Verify repository state before acting on old evidence. Compaction does not
renew approval, turn a failed check into a pass, or change review authority.

## Native compaction

Pi can compact during an active run and continue within the same session. The
human can also use `/compact` with instructions to preserve the active task,
approvals, exact paths, interfaces, verification evidence, and next action.

Prism sets no fixed context-percentage stop threshold and does not change Pi's
compaction settings. Do not claim to invoke `/compact` through Bash or an
unavailable tool. Keep reads focused and avoid repeating large completed-task
outputs merely to reconstruct history.

## Recovery and blockers

A fatal tool or safety state follows its existing reload/recovery contract.
Missing approval, an external blocker, or invalidated plan assumptions still
stop unsafe work. Report the specific blocker rather than treating a new
session as a repair. The human may explicitly choose another session.

Pi's `/tree` can revisit conversation branches, but it does not undo durable
Git commits, tracker mutations, or filesystem changes. Do not navigate across
such effects as though they had been rolled back.

## Rules

- Continue executable work across task and skill boundaries.
- Preserve current facts in existing workflow-owned records.
- Use native compaction rather than a session-length stop rule.
- Recheck stale evidence after compaction.
- Preserve all approval, verification, and fatal-state recovery gates.
