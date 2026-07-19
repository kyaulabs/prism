# Wayfinder Skill (#142) — Implementation Plan

> **For agentic workers:** Implement task-by-task via `@tdd` (Red → Green → Refactor). Steps use `- [ ]` checkboxes. Commits are signed (`-S`); every commit carries `Plan-by:` / `Acked-by:` / `Signed-off-by:` footers; use `Refs: #142` on intermediate commits and `Fixes: #142` on the final commit (above `Plan-by:`).

**Goal:** Add a `wayfinder` skill (derived from mattpocock/skills v1.1) that plans work too big for one session as a shared map of investigation tickets on GitHub Issues, resolving them one at a time until the route is clear and hands off to `to-spec`.

**Architecture:** A single on-demand markdown skill (no runtime code) that adapts the upstream map/ticket/fog-of-war/frontier model to GitHub Issues via the existing `ticketing` gh pattern. Faithful to the upstream contract; only the tracker-specifics and cross-refs are localized. Label set is extended with 5 colon-prefixed `wayfinder:*` labels (idempotently creatable).

**Tech Stack:** Markdown skill (`SKILL.md`); Pest PHP v4 harness test (PHP 8.5+, `declare(strict_types=1)`); GitHub Issues + `gh` CLI; no new dependencies.

## Global constraints

- Skill frontmatter `description` must start with `Use when …` (writing-skills convention); `name: wayfinder` matches the directory.
- `derived-from: mattpocock/skills (MIT, © Matt Pocock)` frontmatter line required (matches `brainstorming`, `to-spec`).
- Cross-refs use skill/doc/**command** names, never markdown links (writing-skills).
- Mandatory `## Gotchas` section at the end.
- New PHP test file: RCS header + `declare(strict_types=1)` + vim modeline (conventions.md / rcs-header skill).
- Never edit the `aurora/` submodule or generated `cdn/` files.
- Exactly one Type (`Feature`) and one Progress (`Under Construction`) on the issue.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `tests/Unit/Harness/WayfinderSkillTest.php` | Asserts `SKILL.md` satisfies all 4 ACs of #142 | **Create** |
| `.opencode/skills/wayfinder/SKILL.md` | The skill — adapted upstream wayfinder model | **Create** |
| `docs/agents/labels.md` | Canonical label vocabulary — add 5 `wayfinder:*` labels | **Modify** |
| `.opencode/commands/setup-labels.md` | Idempotent label creator — sync duplicated enumeration | **Modify** |
| `AGENTS.md` | Skills table — add `wayfinder` row | **Modify** |
| `README.md` | Skills category list — add `wayfinder` | **Modify** |
| `.opencode/commands/router.md` | Refresh forward-ref `(#142, planned)` → now available | **Modify** |

---

### Task 1: Red — write `WayfinderSkillTest.php`

**Files:**
- Create: `tests/Unit/Harness/WayfinderSkillTest.php`

**Interfaces:**
- Produces: a Pest test file asserting #142's ACs against `.opencode/skills/wayfinder/SKILL.md`. Modeled on `ToSpecSkillTest.php` and `ReceivingCodeReviewSkillTest.php`.

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/Harness/WayfinderSkillTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: WayfinderSkillTest.php kyau@nova 2026/07/16 -0700 Exp $






/**
 * Asserts the wayfinder skill (issue #142) meets its acceptance criteria:
 * exists with derived-from metadata; produces a wayfinder:map parent plus
 * research/prototype/grilling/task child tickets with correct labels via the
 * ticketing gh pattern; defines the resolution cycle (close child -> map
 * updates -> frontier advances); and merges to a spec via the to-spec skill
 * referencing wayfinder decisions. Index consistency (AGENTS.md / README.md)
 * is enforced separately by .github/scripts/validate-harness.sh.
 */

function wayfinder_skill_path(): string
{
    return __DIR__ . '/../../../.opencode/skills/wayfinder/SKILL.md';
}

function wayfinder_skill_content(): string
{
    $path = wayfinder_skill_path();
    expect(file_exists($path))->toBeTrue("wayfinder SKILL.md not found at {$path}");

    $content = file_get_contents($path);
    expect($content)->not->toBeFalse("Could not read {$path}");

    return $content;
}

test('wayfinder skill file exists with required frontmatter', function (): void {
    $content = wayfinder_skill_content();

    // AC1: exists with derived-from; name matches directory;
    // description is a "Use when" trigger; attributes mattpocock/skills source.
    expect($content)->toContain('name: wayfinder');
    expect($content)->toMatch('/^description:.*Use when/m');
    expect($content)->toContain('derived-from: mattpocock/skills');
});

test('AC2 wayfinder map and four ticket-type labels are prescribed', function (): void {
    $content = wayfinder_skill_content();

    // The map label and the four child ticket-type labels.
    expect($content)->toContain('wayfinder:map');
    expect($content)->toContain('wayfinder:research');
    expect($content)->toContain('wayfinder:prototype');
    expect($content)->toContain('wayfinder:grilling');
    expect($content)->toContain('wayfinder:task');

    // Labels are created idempotently (ticketing / setup-labels pattern).
    expect($content)->toMatch('/idempotent/i');
});

test('AC2 child tickets created via the ticketing gh pattern with native blocking', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('ticketing');
    // Native blocking relationship (gh >= 2.94.0) renders the frontier visually.
    expect($content)->toMatch('/add-blocked-by|addBlockedBy|blocked by/i');
});

test('AC3 resolution cycle closes child, updates map, advances frontier', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('Decisions so far');
    expect($content)->toMatch('/\bfrontier\b/i');
    // The hard rule: one ticket resolved per session.
    expect($content)->toMatch('/one ticket per session|never resolve more than one ticket/i');
});

test('AC3 fog of war and out-of-scope are modelled', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toMatch('/fog of war/i');
    expect($content)->toMatch('/Not yet specified/');
    expect($content)->toMatch('/Out of scope/');
});

test('AC4 merges to a spec via the to-spec skill', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('to-spec');
    expect($content)->toMatch('/\bmerge\b/i');
});

test('skill contrasts its boundary with /feature and @from-issue', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('/feature');
    expect($content)->toContain('@from-issue');
});

test('skill refers to tickets by name and plans rather than does', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toMatch('/refer by name/i');
    expect($content)->toMatch('/plan.*don.t do|plan, not do|planning by default/i');
});

test('wayfinder skill has a Gotchas section', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('## Gotchas');
});



// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
php vendor/bin/pest tests/Unit/Harness/WayfinderSkillTest.php
```
Expected: **FAIL** — `wayfinder SKILL.md not found at …` (file does not exist yet).

- [ ] **Step 3: Commit (Red)**

```bash
git add tests/Unit/Harness/WayfinderSkillTest.php
git commit -S -m "test(skills): add wayfinder skill acceptance tests

Red: WayfinderSkillTest asserts the four ACs of #142 against
.opencode/skills/wayfinder/SKILL.md, which does not exist yet.

Refs: #142
Plan-by: deepseek-v4-pro
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Green — author `.opencode/skills/wayfinder/SKILL.md`

**Files:**
- Create: `.opencode/skills/wayfinder/SKILL.md`

**Interfaces:**
- Consumes: the `ticketing` skill (gh create/blocking pattern), the `grilling` + `prototype` skills, the `to-spec` skill (merge exit), the `CONTEXT.md` vocabulary.
- Produces: a skill the `/router` points "huge feature" requests at; produces `wayfinder:map` + `wayfinder:<type>` tickets.

- [ ] **Step 1: Write the skill**

Create `.opencode/skills/wayfinder/SKILL.md` — see the skill content from the @from-issue agent's output (canonical version in this plan session).

- [ ] **Step 2: Run the test to verify it passes**

```bash
php vendor/bin/pest tests/Unit/Harness/WayfinderSkillTest.php
```
Expected: **PASS** — all 10 tests green.

- [ ] **Step 3: Commit (Green)**

```bash
git add .opencode/skills/wayfinder/SKILL.md
git commit -S -m "feat(skills): add wayfinder skill for huge features

Derived from mattpocock/skills v1.1 (MIT, (c) Matt Pocock). Charts work too
big for one session as a shared map of investigation tickets on GitHub
Issues: wayfinder:map parent + research/prototype/grilling/task children.
Resolve one -> update map -> frontier advances -> merge to to-spec. Adapted
to native GitHub Issues via the ticketing gh pattern; /grilling -> grilling,
/prototype -> prototype, /domain-modeling dropped.

Refs: #142
Plan-by: deepseek-v4-pro
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Wire the `wayfinder:*` labels into the vocabulary

**Files:**
- Modify: `docs/agents/labels.md` (Wayfinder section + counts/invariants)
- Modify: `.opencode/commands/setup-labels.md` (duplicated enumeration — keep in sync)

**Interfaces:**
- Produces: the 5 labels become part of the canonical vocabulary so `/setup-labels` manages them and the skill's idempotent-create matches the documented names/colors.

- [ ] **Step 1: Extend `labels.md` Wayfinder section**

Replace the Wayfinder table (lines 45–53) with the flat + colon-prefixed labels:

```markdown
### Wayfinder — Optional navigation labels

Flat labels with no prefix, used for epic/task relationship tracking, plus the
colon-prefixed `wayfinder:*` set used by the `wayfinder` skill to mark a
decision-map and its ticket types.

| Label | Color | Description |
| :--- | :---: | --- |
| `epic` | `#5319e7` | Parent epic tracking multiple sub-issues (non-wayfinder) |
| `task` | `#5319e7` | Sub-issue linked to an epic (non-wayfinder) |
| `wayfinder:map` | `#5319e7` | The wayfinder decision-map issue (canonical artifact) |
| `wayfinder:research` | `#5319e7` | Wayfinder ticket: AFK research / doc reading |
| `wayfinder:prototype` | `#5319e7` | Wayfinder ticket: HITL prototype via the prototype skill |
| `wayfinder:grilling` | `#5319e7` | Wayfinder ticket: HITL grilling, one question at a time |
| `wayfinder:task` | `#5319e7` | Wayfinder ticket: manual work unblocking a decision |
```

Update count references from "2 Wayfinder + 10 Meta" → "7 Wayfinder + 10 Meta" and "12 actual labels" → "17 actual labels".

- [ ] **Step 2: Sync the duplicated enumeration in `setup-labels.md`**

- Line with "12 actual labels — 2 Wayfinder + 10 Meta" → "17 actual labels — 7 Wayfinder + 10 Meta"
- Wayfinder labels table: header "Wayfinder labels (2)" → "Wayfinder labels (7)"; add the five `wayfinder:*` rows
- Step 4 loop "For each of the 12 labels" → "For each of the 17 labels"
- Summary table: add the five rows under wayfinder group; update counts

- [ ] **Step 3: Commit**

```bash
git add docs/agents/labels.md .opencode/commands/setup-labels.md
git commit -S -m "docs(labels): add wayfinder:* label vocabulary

Add the five colon-prefixed wayfinder labels (map, research, prototype,
grilling, task) used by the wayfinder skill, documenting them in
docs/agents/labels.md and syncing the duplicated enumeration in
.opencode/commands/setup-labels.md (2 -> 7 Wayfinder, 12 -> 17 total).

Refs: #142
Plan-by: deepseek-v4-pro
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: Index the skill across the harness docs + refresh `/router`

**Files:**
- Modify: `AGENTS.md` (`## Skills Available` table)
- Modify: `README.md` (skills category list)
- Modify: `.opencode/commands/router.md` (forward-ref)
- Possibly: `CODING_HARNESS.md` (if `validate-harness.sh` flags it)

- [ ] **Step 1: Add the `wayfinder` row to `AGENTS.md`**

In the `## Skills Available` table, insert alphabetically before `writing-plans`:

```markdown
| `wayfinder` | Work too big or too foggy for one session — chart it as a shared map of investigation tickets on GitHub Issues, resolve one at a time, merge to `to-spec` |
```

- [ ] **Step 2: Add to `README.md` skills category list**

Add `wayfinder` to the "Engineering pipeline" category group (after `ticketing`, before `verification-before-completion`).

- [ ] **Step 3: Refresh the `/router` forward-ref**

Change `(#142, planned)` to reflect the skill is now available.

- [ ] **Step 4: Run harness validation**

```bash
bash .github/scripts/validate-harness.sh
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md .opencode/commands/router.md
git commit -S -m "docs(harness): index wayfinder skill and refresh router ref

Add wayfinder to the AGENTS.md skills table and README.md engineering-
pipeline category, and drop the (#142, planned) forward-ref in /router now
that the skill exists.

Refs: #142
Plan-by: deepseek-v4-pro
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 5: Final verification (issue-closing commit)

- [ ] **Step 1: Full Pest suite green**

```bash
php vendor/bin/pest
```
Expected: PASS.

- [ ] **Step 2: Harness self-check clean**

```bash
bash .github/scripts/validate-harness.sh
```
Expected: PASS.

- [ ] **Step 3: Pre-push gate**

Run `/check` (php-cs-fixer + pest --coverage).

- [ ] **Step 4: Confirm ACs by inspection**

- AC1 — `.opencode/skills/wayfinder/SKILL.md` exists with `derived-from`
- AC2 — produces `wayfinder:map` + child tickets with correct labels
- AC3 — resolution cycle: close child → map updates → frontier advances
- AC4 — merge to `to-spec` produces spec referencing wayfinder decisions

- [ ] **Step 5: Issue-closing commit**

```bash
git commit -S --allow-empty -m "feat(skills): close wayfinder skill (#142)

Fixes: #142
Plan-by: deepseek-v4-pro
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

> Note: prefer folding `Fixes: #142` onto the substantive Task 2 commit instead of an empty commit.

---

## AC coverage

- **AC1** → Task 1 test 1 + Task 2
- **AC2** → Task 1 tests 2–3 + Task 2 + Task 3
- **AC3** → Task 1 tests 4–5 + Task 2
- **AC4** → Task 1 test 6 + Task 2

## Triage

- **Type:** `Feature` (already set)
- **Progress:** `Under Construction` (to set via GitHub UI — native issue field)
- **Labels:** `plan` (already set), `ready-for-agent` (applied)
