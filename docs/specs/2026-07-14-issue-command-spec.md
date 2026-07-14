# $KYAULabs:$

# Spec: `/issue` Command — AI-Assisted GitHub Issue Creation

**Date:** 2026-07-14
**Status:** Approved
**Author:** Plan Agent (brainstorming session)

## Overview

A new `/issue` command that lets the developer describe an issue in natural
language, then uses AI to generate a properly formatted GitHub issue with a
conventional-commit title, 5-section body, org-level issue type, custom
fields, and applicable labels. The command runs in the Plan agent context
(no `agent` field in frontmatter), conducting an interactive interview, then
delegates `gh` CLI execution to the `@explore` subagent.

## Conventional Commit → Issue Type Mapping

The command maps conventional commit types to GitHub org-level issue types.
The mapping is hard-coded in the command template:

| Commit Type   | Issue Type   |
|---------------|--------------|
| `feat`        | Feature      |
| `fix`         | Bug          |
| `docs`        | Documentation|
| `refactor`    | Refactor     |
| `perf`        | Performance  |
| `test`        | Testing      |
| `build`       | Build        |
| `ci`          | CI           |
| `chore`       | Chore        |
| `style`       | Style        |
| `revert`      | Revert       |
| `security`    | Security     |
| `deps`        | Dependencies |
| `release`     | Release      |

## Security Scope Override

`security` is an explicit issue type (not a scope of `fix`). When the AI
detects a security concern, it uses `security(scope):` as the commit-type
prefix and sets the issue type to Security — following the ADR-0019
convention.

## Dynamic Repo Detection

Repo names are detected dynamically — never hard-coded:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

## Command Frontmatter

The command file has only a `description` field in frontmatter (no `agent`
field), so it runs in the current agent context (Plan agent):

```yaml
---
description: >-
  Interactive issue creation — describe the issue, AI generates
  conventional-commit title and 5-section body, then creates a GitHub
  issue with org-level type, custom fields, and labels via @explore.
---
```

## Two-Phase Architecture

1. **Phase 1 (Plan agent):** Interactive interview → AI generates title,
   body, issue type, fields, and labels. The Plan agent presents the result
   for human review.
2. **Phase 2 (@explore):** Delegated `gh` CLI execution — runs pre-flight
   checks, creates the issue, sets fields, and applies labels. Reports the
   result back.

## Label Options

The command supports these label options:

- `bug` — Something isn't working
- `enhancement` — New feature or request
- `documentation` — Improvements or additions to documentation
- `good first issue` — Good for newcomers
- `help wanted` — Extra attention is needed
- `question` — Further information is requested
- `wontfix` — This will not be worked on

Labels are applied via `gh issue edit --add-label`.

## Body Format (5-Section)

Every generated issue body follows this markdown template:

```markdown
## 📋 Summary

<!-- Brief description of the issue -->

## 📍 Location

<!-- Files, directories, or components affected (or "N/A") -->

## 🧠 Why It Matters

<!-- Why this issue matters — impact, urgency, rationale -->

## 🛠️ Recommended Implementation

<!-- Suggested approach, if known. Leave blank if unsure. -->

## ✅ Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

## Field Rules

Custom fields are set based on the issue type:

- **Feature:** `Priority` (required), `Team` (optional), `Sprint` (optional)
- **Bug:** `Priority` (required), `Severity` (required), `Team` (optional),
  `Sprint` (optional)
- **Security:** `Priority` (required), `Severity` (required, default Critical)
- **Documentation:** `Team` (optional), `Sprint` (optional)
- **Refactor:** `Priority` (optional), `Team` (optional)
- All others: No required fields

Fields are set via `gh issue edit` with GraphQL field IDs.

## 8-Step Workflow

1. **Pre-flight (@explore):** Verify `gh` is authenticated, repo exists, and
   org-level issue types are available.
2. **Description prompt (Plan agent):** Ask the developer "Describe the issue
   in natural language — what's the problem, where is it, and why does it
   matter?"
3. **AI generation (Plan agent):** Generate conventional-commit title,
   5-section body, issue type, field values, and label suggestions.
4. **Review (Plan agent):** Present the generated issue to the developer for
   review and editing. Allow iterative refinement.
5. **Fields (Plan agent):** Confirm or adjust custom field values.
6. **Labels (Plan agent):** Confirm or adjust label selection.
7. **Preview & create (@explore):** Show final preview, then execute `gh
   issue create` with title and body, then `gh issue edit` to set fields and
   labels.
8. **Report:** Print the created issue URL and a brief summary.

## Title Format

- `type(scope): subject`
- Parentheses for scope, never brackets
- Lowercase subject
- No trailing period
- Max 100 characters

## Commit Footers

Every commit related to this command uses these standard footers:

```
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

## Rules

1. The command MUST NOT hard-code repo names — all repos are detected
   dynamically via `gh repo view`.
2. The command MUST NOT have an `agent` frontmatter field — it runs in the
   Plan agent context.
3. Phase 2 (`@explore`) MUST verify pre-flight conditions before creating
   the issue.
4. The AI-generated title MUST follow conventional commit format with
   parentheses for scope.
5. Security-sensitive issues MUST use the `security` commit type (not
   `fix(security):`) and the Security issue type.
6. The developer MUST have an opportunity to review and edit the generated
   issue before creation.
7. All label names MUST match GitHub label names exactly (case-sensitive).
8. The command MUST report the final issue URL on success.
