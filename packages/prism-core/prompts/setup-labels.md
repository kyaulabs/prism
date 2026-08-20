---
description: Idempotently create and update standardized issue labels on the GitHub repo via gh. Reads the vocabulary from docs/agents/labels.md. Safe to re-run — reports unchanged when all labels match.
---

Create or update the KYAULabs issue label vocabulary on the current GitHub
repository. Reads `docs/agents/labels.md` as the canonical source for label
names, colors, and descriptions. Only manages actual labels — Type and
Progress are GitHub native fields, not labels, and are not touched.

## 1. Pre-flight

Check `gh` availability, authentication, and the version floor:

```bash
# Verify gh CLI is available
gh --version > /dev/null 2>&1
```

If `gh` is not installed, stop: "gh CLI not found. Install: https://cli.github.com/"

Check authentication:

```bash
gh auth status
```

If `gh auth status` fails, stop: "Not authenticated. Run: gh auth login"

Check the version floor (v2.94.0 required for native sub-issue and blocking-link features):

```bash
gh --version 2>&1 | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1
```

If the version is below 2.94.0, issue a **warning** but continue — label
creation works on older gh, only the sub-issue/blocking-link features are
unavailable:

```text
WARNING: gh v<detected> is below v2.94.0 — native sub-issue and blocking
links unavailable. Consider upgrading.
```

Detect the repo dynamically:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

Validate and retain the returned `OWNER/REPO` as inert context. Render that
literal value in every later `--repo` argument.

## 2. Read the label vocabulary

Read `docs/agents/labels.md`. If the file does not exist, stop and tell the
user to update their branch: the vocabulary was created by issue #128 (PR
#143) and is present on `origin/develop`.

The label vocabulary defines 17 actual labels — 7 Wayfinder + 10 Meta. Type
and Progress are GitHub native fields and are NOT labels.

Wayfinder labels (7):

| Label | Color | Description |
| :--- | :---: | --- |
| `epic` | `5319e7` | Parent epic tracking multiple sub-issues |
| `task` | `5319e7` | Sub-issue linked to an epic |
| `wayfinder:map` | `5319e7` | The wayfinder decision-map issue (canonical artifact) |
| `wayfinder:research` | `5319e7` | Wayfinder ticket: AFK research / doc reading |
| `wayfinder:prototype` | `5319e7` | Wayfinder ticket: HITL prototype via the prototype skill |
| `wayfinder:grilling` | `5319e7` | Wayfinder ticket: HITL grilling, one question at a time |
| `wayfinder:task` | `5319e7` | Wayfinder ticket: manual work unblocking a decision |

Meta labels (10):

| Label | Color | Description |
| :--- | :---: | --- |
| `brainstorming` | `db2780` | Coming up with a new approach |
| `research` | `db2780` | Needs investigation before implementation |
| `request for comments` | `db2780` | External opinions requested |
| `help wanted` | `db2780` | Assistance requested from contributors |
| `good first issue` | `4e3cb2` | Suitable for new contributors |
| `plan` | `0ea5e9` | Work from a docs/plans/ implementation plan |
| `duplicate` | `cfd3d7` | Duplicate of another issue |
| `invalid` | `cfd3d7` | Not a valid issue |
| `on hold` | `cfd3d7` | Temporarily paused |
| `won't fix` | `cfd3d7` | Will not be addressed |

## 3. Fetch existing labels

Run directly in the current agent:

```bash
gh label list --repo OWNER/REPO --json name,color,description
```

Cache the returned JSON so each label from Step 2 can be compared against the
existing set. Report back:
- Which label names already exist.
- For each existing label: current color and description.

## 4. Create or update each label

For each of the 17 labels from Step 2, run directly in the current agent:

**Label does not exist** → create:
```bash
gh label create "<name>" --repo OWNER/REPO --color "<color>" --description "<description>"
```
→ Status: **Created**.

**Label exists with differing color or description** → update:
```bash
gh label edit "<name>" --repo OWNER/REPO --color "<color>" --description "<description>"
```
→ Status: **Updated** (note what changed: color, description, or both).

**Label exists with matching color and description** → skip:
→ Status: **Unchanged** (no-op).

**Label create/edit fails** → note the error, continue to next label:
→ Status: **Error**.

## 5. Report

Print a summary table:

```text
Label                  Status      Notes
---------------------  ----------  ------------------------------
epic                   Created
task                   Created
wayfinder:map          Created
wayfinder:research     Created
wayfinder:prototype    Created
wayfinder:grilling     Created
wayfinder:task         Created
brainstorming          Updated     color was db2780, description changed
research               Updated     color was db2780
help wanted            Unchanged
good first issue       Unchanged
plan                   Unchanged
duplicate              Created
invalid                Created
on hold                Created
won't fix              Created
request for comments   Error       gh label edit failed: ...

  Created:   11
  Updated:    2
  Unchanged:  3
  Errors:     1
  Total:     17
```

If all 17 labels are Unchanged, print a summary line:

```text
All 17 labels already present and up-to-date. Nothing to do.
```

If any labels had errors, print:

```text
Some labels failed — see Errors column above. Re-run /setup-labels to retry.
```

## Rules

- Never hard-code the repo name. Always detect via `gh repo view ... -q .nameWithOwner`.
- Never touch Type or Progress — those are GitHub native fields, not labels.
- Never delete labels. This command only creates and updates.
- Version warning is non-fatal — proceed with label management regardless.
- If `gh auth status` fails, stop immediately and instruct the user to authenticate.
- If `docs/agents/labels.md` is missing, stop and point the user to issue #128.
- Label edit failures are reported individually — one failing label does not block the others.
- Color values in `gh label create/edit` commands must NOT include a leading `#` — gh CLI expects bare hex.
