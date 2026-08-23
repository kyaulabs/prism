# Uninterrupted Plan Execution

## Problem

The `executing-plans` skill asks whether the user wants to review each completed task before continuing. This pauses an implementation plan even though the user already approved the complete plan.

## Design

Plan approval authorizes uninterrupted execution of every task in that plan. The executing agent performs each task's TDD cycle, verification, internal spec-compliance review, internal code-quality review, checkbox update, and atomic commit without requesting intermediate review or approval.

The existing per-task review remains mandatory but is an agent-owned internal quality gate rather than a user checkpoint. The agent continues automatically after that gate passes.

Execution pauses only when an existing halt condition applies: required capabilities are unavailable, repeated attempts cannot make a task green, consecutive tasks require re-planning, findings invalidate plan assumptions, an architectural blocker appears, or the user changes requirements.

## Changes

- Remove the instruction to ask whether the user wants to review after each task.
- Rename and clarify the per-task gate as an internal review gate.
- Explicitly prohibit routine between-task prompts after plan approval.
- Remove obsolete wording that implies per-commit approval.
- Update the global skill description to describe uninterrupted execution with internal review gates.

## Acceptance Criteria

1. `executing-plans` instructs the agent to proceed automatically from one successful task to the next.
2. No routine user review or approval prompt occurs between approved plan tasks.
3. Per-task verification, spec-compliance review, code-quality review, checkbox updates, and commits remain required.
4. Existing halt and re-plan conditions still require user intervention where specified.
5. Core global instructions describe the per-task review gates as internal and uninterrupted.

## Verification

- Search the changed harness resources for instructions that request routine between-task review or approval.
- Run the relevant documentation and harness validation checks through `/check`.
