# Eval Runner Stash Pop Robustness Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make a failed `git stash pop --index` in `propagateUncommittedChanges()` fail the eval run loudly with a recovery hint instead of silently emitting a non-fatal STDERR warning, so the developer's uncommitted work is never stranded on the stash stack by a "successful" suite run.

**Architecture:** Preserve the existing stash-push / worktree-apply / source-pop round-trip (well-tested, proven). Add an `$applied` flag so the `finally` block can distinguish "apply succeeded but pop failed" (the data-loss case → throw) from "apply failed and pop also failed" (do not mask the in-flight apply exception → STDERR hint only). Extract the pop into a `protected popStashInSource()` seam and capture the top-stash ref via `protected captureStashRef()` so the pop-failure path is deterministically exercisable in tests without fragile mid-execution git manipulation. No change to `run-eval.php` — it already catches `\Throwable` and emits `Verdict::Invalid` with exit 1 (acceptance criterion #3, enforced by `tests/Unit/Eval/RunEvalCliTest.php:90` referencing #188).

**Tech Stack:** PHP 8.5+, Pest v4, git (stash/worktree), no framework.

## Global constraints

- File uses `declare(strict_types=1)`, namespace `KYAULabs\Eval`, and an RCS header (already present — modifying an existing file, no new file created, so the `rcs-header` skill does not require a new header).
- PHPDoc on every new method (PSR-5, params + return + `@throws`).
- Indentation: 4-space (PSR-12) for PHP.
- `escapeshellarg()` on every path interpolated into a shell command (existing pattern, preserved).
- Commit type for a Bug is `fix` (per `docs/agents/labels.md`); scope `eval`.
- Signed commits (`git commit -S`); footers resolved at commit time: `Authored-by: glm-5.2`, `Tested-by: deepseek-v4-pro`, `Signed-off-by:` via `bash .github/scripts/resolve-identity.sh`. This fix closes the issue, so `Fixes: #211` heads the footer.
- Minimum 80% line coverage on the changed file (`EvalRunner.php`), enforced by `.github/scripts/coverage-gate.php`.

## Scope (explicit non-goals)

- **Do NOT touch `run-eval.php`.** Acceptance criterion #3 ("A `\RuntimeException` exits 1 with a JSON INVALID result") is already satisfied — the catch is `\Throwable` (line 175), guarded by `RunEvalCliTest.php:90`.
- **Do NOT replace stash semantics with patches.** This plan hardens the existing stash round-trip (Option B from the issue), not the patch-based rewrite (Option A). The stash round-trip is already covered by five passing tests; replacing it would be a larger, riskier change.
- **Do NOT add an ADR.** This strengthens the existing non-goal/invariant "No eval execution inside the source tree" (`CONTEXT.md`); it does not change it. The decision is localized and reversible.
- **`rcs-header` / `domain-context` / `security-coding` skills are NOT triggered.** No new source file is created; the change is eval-runner git plumbing, not domain entities or user-input/auth/SQL handling (the `escapeshellarg` boundary is unchanged).

## File structure

- **Modify:** `.opencode/evals/bin/includes/EvalRunner.php`
  - `propagateUncommittedChanges()` (current lines 1062–1122): add `$applied` flag, capture stash ref, route pop failure through the new conditional.
  - Add `protected captureStashRef(): ?string` immediately after `propagateUncommittedChanges()`.
  - Add `protected popStashInSource(): array` immediately after `captureStashRef()`.
- **Modify:** `tests/Unit/Eval/RunnerTest.php` — append three new tests at the end of the file (after the last `createWorktree propagates untracked files` test, before EOF).

No new files. No other files touched.

---

### Task 1: Fail loudly when the source-tree stash pop fails after a successful apply

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (method `propagateUncommittedChanges` at lines 1062–1122; insert two helpers after it)
- Test: `tests/Unit/Eval/RunnerTest.php` (append one test)

**Interfaces:**
- Consumes: existing `propagateUncommittedChanges(string $worktree): bool` call site in `createWorktree()` (line 1156) — unchanged signature.
- Produces: new `protected popStashInSource(): array{exit: int, output: list<string>}` and `protected captureStashRef(): ?string`. Both are `protected` (not `private`) deliberately, so an anonymous-subclass test double can override `popStashInSource()` to force the failure path. This is the only clean way to exercise the pop-failure branch without fragile mid-execution git manipulation.

- [ ] **Step 1: Write the failing test**

Append to `tests/Unit/Eval/RunnerTest.php` (after the final `createWorktree propagates untracked files to the worktree` test):

```php
it('propagateUncommittedChanges throws a recovery hint when the source-tree stash pop fails after a successful apply', function () {
    $repo = sys_get_temp_dir() . '/eval-runner-test-' . bin2hex(random_bytes(4));
    mkdir($repo);
    exec('git -C ' . escapeshellarg($repo) . ' init -q');
    exec('git -C ' . escapeshellarg($repo) . ' config user.email t@t');
    exec('git -C ' . escapeshellarg($repo) . ' config user.name t');
    file_put_contents($repo . '/skill.md', "original content\n");
    exec('git -C ' . escapeshellarg($repo) . ' add skill.md');
    exec('git -C ' . escapeshellarg($repo) . ' commit -q -m init');

    // Uncommitted modification — triggers a real stash push.
    file_put_contents($repo . '/skill.md', "modified content\n");

    $worktree = null;
    try {
        $worktree = sys_get_temp_dir() . '/eval-worktree-' . bin2hex(random_bytes(8));
        exec(sprintf(
            'git -C %s worktree add --detach %s 2>&1',
            escapeshellarg($repo),
            escapeshellarg($worktree),
        ));

        // The anonymous subclass overrides the pop seam to simulate a pop
        // failure. The real stash push + worktree apply still run, so
        // $applied is true and the data-loss branch is exercised.
        $runner = new class($repo) extends Runner {
            protected function popStashInSource(): array
            {
                return [
                    'exit' => 1,
                    'output' => ['CONFLICT (content): Merge conflict in skill.md'],
                ];
            }
        };

        $thrown = null;
        try {
            $runner->propagateUncommittedChanges($worktree);
        } catch (\RuntimeException $e) {
            $thrown = $e;
        }

        expect($thrown)->not->toBeNull();
        expect($thrown->getMessage())->toContain('git stash pop failed in source tree');
        expect($thrown->getMessage())->toContain('Recover with:');
        expect($thrown->getMessage())->toContain($repo);
        // The recovery hint names the stranded stash by its 40-char SHA,
        // captured from the real repo right after the push.
        expect($thrown->getMessage())->toMatch('/[0-9a-f]{40}/');
    } finally {
        if ($worktree !== null && is_dir($worktree)) {
            exec('git -C ' . escapeshellarg($repo) . ' worktree remove --force ' . escapeshellarg($worktree) . ' 2>/dev/null');
        }
        // The overridden pop never ran, so the stash is still on the stack.
        exec('git -C ' . escapeshellarg($repo) . ' stash clear 2>/dev/null');
        if (is_dir($repo)) {
            exec('rm -rf ' . escapeshellarg($repo));
        }
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'throws a recovery hint when the source-tree stash pop fails'`
Expected: FAIL — the current `finally` only writes a `WARNING` to STDERR and does not throw, so `$thrown` is `null` and `expect($thrown)->not->toBeNull()` fails. (Also a static resolution check: `popStashInSource` does not yet exist — PHP will not fatal because the anonymous class defines it, but the parent call `$this->popStashInSource()` in the not-yet-modified method does not exist either; the test fails at the assertion, confirming Red.)

- [ ] **Step 3: Implement the fix**

In `.opencode/evals/bin/includes/EvalRunner.php`, replace the entire body of `propagateUncommittedChanges()` (current lines 1062–1122) with the version below, and add the two new helper methods immediately after it (before the `createWorktree()` docblock at current line 1124).

Replace this method:

```php
    public function propagateUncommittedChanges(string $worktree): bool
    {
        $stashCmd = sprintf(
            'git -C %s stash push --include-untracked '
            . '--message eval-propagation 2>&1',
            escapeshellarg($this->repoRoot),
        );

        $stashOutput = [];
        $stashExit = 0;
        exec($stashCmd, $stashOutput, $stashExit);

        if ($stashExit !== 0) {
            throw new \RuntimeException(
                'git stash push failed in source tree: '
                . implode("\n", $stashOutput),
            );
        }

        $stashSummary = implode("\n", $stashOutput);

        // If no local changes to save, the working tree is clean.
        if (str_contains($stashSummary, 'No local changes to save')) {
            return false;
        }

        try {
            $applyCmd = sprintf(
                'git -C %s stash apply 2>&1',
                escapeshellarg($worktree),
            );

            $applyOutput = [];
            $applyExit = 0;
            exec($applyCmd, $applyOutput, $applyExit);

            if ($applyExit !== 0) {
                throw new \RuntimeException(
                    'Failed to apply uncommitted changes to worktree: '
                    . implode("\n", $applyOutput),
                );
            }
        } finally {
            // Restore the source working tree even if apply fails.
            // git stash pop --index applies the stash back and drops it.
            $popCmd = sprintf(
                'git -C %s stash pop --index 2>&1',
                escapeshellarg($this->repoRoot),
            );
            $popOutput = [];
            $popExit = 0;
            exec($popCmd, $popOutput, $popExit);
            if ($popExit !== 0) {
                fwrite(STDERR, "WARNING: git stash pop failed in source tree — "
                    . "stash may still be on the stack. Output: "
                    . implode("\n", $popOutput) . "\n");
            }
        }

        return true;
    }
```

With this method plus two helpers:

```php
    public function propagateUncommittedChanges(string $worktree): bool
    {
        $stashCmd = sprintf(
            'git -C %s stash push --include-untracked '
            . '--message eval-propagation 2>&1',
            escapeshellarg($this->repoRoot),
        );

        $stashOutput = [];
        $stashExit = 0;
        exec($stashCmd, $stashOutput, $stashExit);

        if ($stashExit !== 0) {
            throw new \RuntimeException(
                'git stash push failed in source tree: '
                . implode("\n", $stashOutput),
            );
        }

        $stashSummary = implode("\n", $stashOutput);

        // If no local changes to save, the working tree is clean.
        if (str_contains($stashSummary, 'No local changes to save')) {
            return false;
        }

        // Record the stash ref so a failed pop can be recovered from.
        $stashRef = $this->captureStashRef();

        $applied = false;
        try {
            $applyCmd = sprintf(
                'git -C %s stash apply 2>&1',
                escapeshellarg($worktree),
            );

            $applyOutput = [];
            $applyExit = 0;
            exec($applyCmd, $applyOutput, $applyExit);

            if ($applyExit !== 0) {
                throw new \RuntimeException(
                    'Failed to apply uncommitted changes to worktree: '
                    . implode("\n", $applyOutput),
                );
            }
            $applied = true;
        } finally {
            // Restore the source working tree even if apply fails.
            $pop = $this->popStashInSource();
            if ($pop['exit'] !== 0) {
                $refHint = $stashRef !== null
                    ? " at stash {$stashRef}"
                    : ' (stash ref unavailable)';
                $recovery = 'Recover with: git -C '
                    . $this->repoRoot . ' stash pop --index.';

                if (!$applied) {
                    // An apply exception is already propagating; do not mask
                    // it. Surface the stranded-stash ref on STDERR so the
                    // developer can restore manually.
                    fwrite(STDERR, "WARNING: git stash pop also failed in "
                        . 'source tree — uncommitted changes preserved'
                        . $refHint . '. ' . $recovery . ' Pop output: '
                        . implode("\n", $pop['output']) . "\n");
                } else {
                    // Apply succeeded but the source restore failed — the
                    // developer's uncommitted work is stranded on the stash
                    // stack. Fail loudly so the run exits non-zero with a
                    // recovery hint instead of silently dropping state.
                    throw new \RuntimeException(
                        'git stash pop failed in source tree — uncommitted '
                        . 'changes are preserved on the stash stack'
                        . $refHint . '. ' . $recovery
                        . ' Pop output: ' . implode("\n", $pop['output']),
                    );
                }
            }
        }

        return true;
    }

    /**
     * Capture the ref of the top stash entry (the one just pushed).
     *
     * Used to build a recovery hint when a subsequent stash pop fails, so the
     * developer can restore their uncommitted work with
     * `git stash pop --index` against the named ref.
     *
     * @return string|null  The stash commit SHA, or null when the ref is
     *                      unavailable (older git, or the stack is empty).
     */
    protected function captureStashRef(): ?string
    {
        $cmd = sprintf(
            'git -C %s rev-parse --quiet --verify refs/stash 2>/dev/null',
            escapeshellarg($this->repoRoot),
        );

        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0 || !isset($output[0]) || $output[0] === '') {
            return null;
        }

        return trim($output[0]);
    }

    /**
     * Pop the eval-propagation stash back into the source working tree.
     *
     * Extracted from propagateUncommittedChanges() as a seam so the pop
     * failure path can be exercised in tests without fragile mid-execution
     * git manipulation (the stash push and worktree apply still run for real).
     *
     * @return array{exit: int, output: list<string>}
     */
    protected function popStashInSource(): array
    {
        $popCmd = sprintf(
            'git -C %s stash pop --index 2>&1',
            escapeshellarg($this->repoRoot),
        );

        $output = [];
        $exit = 0;
        exec($popCmd, $output, $exit);

        return ['exit' => $exit, 'output' => $output];
    }
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'throws a recovery hint when the source-tree stash pop fails'`
Expected: PASS.

- [ ] **Step 5: Run the full propagation suite to confirm no happy-path regression**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'propagateUncommittedChanges'`
Expected: PASS for all five existing propagation tests (`applies modified tracked files`, `applies untracked files`, `returns false on a clean tree`, `createWorktree propagates uncommitted modifications`, `createWorktree propagates untracked files`) plus the new test. The happy path has no behavior delta.

- [ ] **Step 6: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php
git commit -S -m $'fix(eval): fail loudly on source-tree stash pop failure\n\npropagateUncommittedChanges() restored the source tree via\n`git stash pop --index` in a finally block that only warned on failure,\nleaving the developer\'s uncommitted work stranded on the stash stack with\na non-fatal STDERR warning. When the worktree apply had already succeeded,\na pop failure now throws a RuntimeException naming the stranded stash ref\nand a recovery command, so the run exits non-zero with a recovery hint\ninstead of silently dropping state. The apply-failed branch still avoids\nmasking the in-flight apply exception.\n\nThe stash pop is extracted into a protected popStashInSource() seam and\nthe top-stash ref is captured via captureStashRef() so the pop-failure\npath is exercisable without fragile mid-execution git manipulation.\n\nFixes: #211\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

> *The `Signed-off-by:` value is resolved by running `bash .github/scripts/resolve-identity.sh` and pasting the result; the `commit-msg` hook validates the full trailer set.*

---

### Task 2: Do not mask the apply exception when both apply and pop fail

**Files:**
- Modify: `tests/Unit/Eval/RunnerTest.php` (append one test)
- No production-code change in this task — it validates the `!$applied` branch introduced in Task 1.

**Interfaces:**
- Consumes: `popStashInSource()` seam (overridden to fail) and the real `git stash apply` (forced to fail via a genuine worktree conflict — no apply seam needed).
- Produces: none.

- [ ] **Step 1: Write the failing test**

Append to `tests/Unit/Eval/RunnerTest.php`:

```php
it('propagateUncommittedChanges does not mask the apply exception when both apply and pop fail', function () {
    $repo = sys_get_temp_dir() . '/eval-runner-test-' . bin2hex(random_bytes(4));
    mkdir($repo);
    exec('git -C ' . escapeshellarg($repo) . ' init -q');
    exec('git -C ' . escapeshellarg($repo) . ' config user.email t@t');
    exec('git -C ' . escapeshellarg($repo) . ' config user.name t');
    file_put_contents($repo . '/skill.md', "original content\n");
    exec('git -C ' . escapeshellarg($repo) . ' add skill.md');
    exec('git -C ' . escapeshellarg($repo) . ' commit -q -m init');

    // Source: uncommitted modification that will be stashed.
    file_put_contents($repo . '/skill.md', "modified content\n");

    $worktree = null;
    try {
        $worktree = sys_get_temp_dir() . '/eval-worktree-' . bin2hex(random_bytes(8));
        exec(sprintf(
            'git -C %s worktree add --detach %s 2>&1',
            escapeshellarg($repo),
            escapeshellarg($worktree),
        ));

        // Plant a conflicting uncommitted change IN THE WORKTREE so the real
        // `git stash apply` conflicts (exit 1) and the apply branch throws —
        // no apply seam required.
        file_put_contents($worktree . '/skill.md', "worktree-local conflict\n");

        $runner = new class($repo) extends Runner {
            protected function popStashInSource(): array
            {
                return ['exit' => 1, 'output' => ['pop conflict']];
            }
        };

        $thrown = null;
        try {
            $runner->propagateUncommittedChanges($worktree);
        } catch (\RuntimeException $e) {
            $thrown = $e;
        }

        // The APPLY exception must propagate — the pop failure must not
        // mask it (that would hide the real cause and could lose data).
        expect($thrown)->not->toBeNull();
        expect($thrown->getMessage())
            ->toContain('Failed to apply uncommitted changes to worktree');
        expect($thrown->getMessage())
            ->not->toContain('git stash pop failed in source tree');
    } finally {
        if ($worktree !== null && is_dir($worktree)) {
            exec('git -C ' . escapeshellarg($repo) . ' worktree remove --force ' . escapeshellarg($worktree) . ' 2>/dev/null');
        }
        exec('git -C ' . escapeshellarg($repo) . ' stash clear 2>/dev/null');
        if (is_dir($repo)) {
            exec('rm -rf ' . escapeshellarg($repo));
        }
    }
});
```

- [ ] **Step 2: Run the test to verify it passes (Green-on-existing-impl)**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'does not mask the apply exception when both apply and pop fail'`
Expected: PASS. (This test is Green immediately against the Task 1 implementation, because the `!$applied` branch already routes a dual-failure to the STDERR-only path and lets the apply exception propagate. It is a guard test that locks in the "do not mask" invariant for the new code added in Task 1.)

- [ ] **Step 3: Commit**

```bash
git add tests/Unit/Eval/RunnerTest.php
git commit -S -m $'test(eval): guard dual apply/pop failure does not mask apply exception\n\nLock in the !$applied branch added in the #211 fix: when the worktree\nstash apply fails AND the source-tree pop also fails, the apply exception\nmust propagate unchanged — the pop failure must not mask it (which would\nhide the real cause and could lose data). The apply failure is forced with\na genuine worktree conflict; the pop failure is forced via the\npopStashInSource() test seam.\n\nRefs: #211\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 3: Characterize the ref-identical happy-path invariant + full verification

**Files:**
- Modify: `tests/Unit/Eval/RunnerTest.php` (append one characterization test)
- No production-code change.

**Interfaces:**
- Consumes: `propagateUncommittedChanges()` happy path (unchanged).
- Produces: none.

**Why:** Acceptance criterion #1 ("The source tree and its stash stack are ref-identical before and after a suite run") is not explicitly asserted by any existing test — the five propagation tests assert the *worktree* received the right content, not that the *source* was fully restored and no stash was stranded. This characterization test pins that invariant.

- [ ] **Step 1: Write the characterization test**

Append to `tests/Unit/Eval/RunnerTest.php`:

```php
it('propagateUncommittedChanges leaves the source tree and stash stack ref-identical after a successful round-trip', function () {
    $repo = sys_get_temp_dir() . '/eval-runner-test-' . bin2hex(random_bytes(4));
    mkdir($repo);
    exec('git -C ' . escapeshellarg($repo) . ' init -q');
    exec('git -C ' . escapeshellarg($repo) . ' config user.email t@t');
    exec('git -C ' . escapeshellarg($repo) . ' config user.name t');
    file_put_contents($repo . '/skill.md', "original content\n");
    exec('git -C ' . escapeshellarg($repo) . ' add skill.md');
    exec('git -C ' . escapeshellarg($repo) . ' commit -q -m init');

    // Uncommitted modification to be round-tripped.
    file_put_contents($repo . '/skill.md', "modified content\n");
    $headBefore = trim((string) shell_exec('git -C ' . escapeshellarg($repo) . ' rev-parse HEAD'));

    $worktree = null;
    try {
        $worktree = sys_get_temp_dir() . '/eval-worktree-' . bin2hex(random_bytes(8));
        exec(sprintf(
            'git -C %s worktree add --detach %s 2>&1',
            escapeshellarg($repo),
            escapeshellarg($worktree),
        ));

        $runner = new Runner($repo);
        $propagated = $runner->propagateUncommittedChanges($worktree);

        expect($propagated)->toBeTrue();

        // Source working tree restored to the uncommitted state (the pop
        // brought "modified content" back, not the committed original).
        expect(file_get_contents($repo . '/skill.md'))->toBe("modified content\n");

        // No stash stranded on the stack.
        $stashList = trim((string) shell_exec('git -C ' . escapeshellarg($repo) . ' stash list'));
        expect($stashList)->toBe('');

        // HEAD unchanged — no commit was created by the round-trip.
        $headAfter = trim((string) shell_exec('git -C ' . escapeshellarg($repo) . ' rev-parse HEAD'));
        expect($headAfter)->toBe($headBefore);
    } finally {
        if ($worktree !== null && is_dir($worktree)) {
            exec('git -C ' . escapeshellarg($repo) . ' worktree remove --force ' . escapeshellarg($worktree) . ' 2>/dev/null');
        }
        if (is_dir($repo)) {
            exec('rm -rf ' . escapeshellarg($repo));
        }
    }
});
```

- [ ] **Step 2: Run the characterization test (Green)**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'leaves the source tree and stash stack ref-identical'`
Expected: PASS (happy path is unchanged; this pins the existing behavior).

- [ ] **Step 3: Run the full eval test directory**

Run: `php vendor/bin/pest tests/Unit/Eval/`
Expected: all PASS (including `RunEvalCliTest.php` — confirms `catch (\Throwable)` is intact and the `\TypeError` ban still holds).

- [ ] **Step 4: Run the coverage gate on the changed file**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Eval/RunnerTest.php --coverage`
Expected: `EvalRunner.php` line coverage ≥ 80%. Confirm `propagateUncommittedChanges`, `captureStashRef`, and `popStashInSource` are all covered (the new throw branch, the `!$applied` STDERR branch, and the clean-tree return are all exercised).

- [ ] **Step 5: Commit**

```bash
git add tests/Unit/Eval/RunnerTest.php
git commit -S -m $'test(eval): pin source-tree ref-identical invariant on happy-path round-trip\n\nAcceptance criterion #1 of #211 ("source tree and stash stack ref-identical\nbefore and after a suite run") was not explicitly asserted by any existing\npropagation test — they assert the worktree received the right content, not\nthat the source tree was fully restored and no stash was stranded. This\ncharacterization test pins that invariant: after a successful round-trip\nthe source working tree holds the uncommitted modification, the stash list\nis empty, and HEAD is unchanged.\n\nRefs: #211\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Self-review

1. **Spec coverage (acceptance criteria of #211):**
   - #1 "source tree and stash stack ref-identical before and after a suite run" → Task 3 characterization test. ✓
   - #2 "Pop/apply failure produces a non-zero eval exit with a recovery hint" → Task 1 (pop-failure throws RuntimeException with recovery hint + stash ref; that propagates through `createWorktree()` → `run-eval.php` `\Throwable` catch → `Verdict::Invalid` + exit 1) and Task 2 (apply-failure path already produces Invalid via the same route). ✓
   - #3 "A `\RuntimeException` exits 1 with a JSON INVALID result" → already satisfied, explicitly out of scope (do NOT touch `run-eval.php`). ✓
2. **Placeholder scan:** No TBD/TODO/"add error handling". All code blocks are complete. Commit messages carry full footer sets with resolved model IDs. ✓
3. **Type consistency:** `popStashInSource(): array{exit: int, output: list<string>}` — same shape returned by the real method and both test overrides (`['exit' => 1, 'output' => [...]]`). `captureStashRef(): ?string` — null-coalesced into `$refHint` in both branches. `$applied` is `bool` throughout. ✓
4. **Happy-path no-delta:** Task 1 Step 5 runs all five existing propagation tests to confirm no regression. The only behavioral change is the pop-failure path (previously non-fatal WARNING → now throws when apply succeeded). ✓

## Execution handoff

After approval, dispatch per task to `@tdd` (Red → Green → Refactor), reviewing between tasks. Then `verification-before-completion` → `/check` → `@code-review` before the human pushes.
