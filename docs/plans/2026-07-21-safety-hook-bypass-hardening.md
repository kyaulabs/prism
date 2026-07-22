# Plan: Safety Hook Bypass Hardening (Issue #178)

**Date:** 2026-07-21
**Issue:** #178 — `pre-tool-use.ts` Safety Hook — Bypassable Destructive-Command Detectors
**Type:** Security (commit type: `fix`)
**ADR:** Supersedes the fail-open clause of `adr/0023-safety-hook-for-bash-tool-interception.md` → new `adr/0036-safety-hook-fail-closed-block-rules.md`
**Branch:** `fix/<user>-<hash>-safety-hook-bypass-hardening` (via `bash .github/scripts/new-branch.sh fix safety-hook-bypass-hardening`)
**Execution mode:** Inline batch with checkpoints (executing-plans skill). Each slice writes the failing test first (Red), confirms it fails for the right reason, makes the edit, confirms Green. TypeScript + `node:test`, NOT Pest.

## Goal

Close every bypass class listed in issue #178's acceptance criteria by replacing
naive `command.split(/\s+/)` tokenization with shell-aware tokenization, wrapper
unwrapping, git global-option skipping, bundled-flag expansion, `find -delete` /
`-exec rm` blocking, and a fail-closed posture on classifier exceptions. Driven
by Red → Green → Refactor across six slices plus one ADR-amendment slice.

## Why @tdd and not @debug

The issue is Type=Security, but the root cause is already fully diagnosed by 6/6
sub-reviews with exact line numbers and concrete bypass commands in the ACs.
@debug's investigation phase is redundant; the workflow's Step-8 note ("for a bug
whose root cause is already known, write the fix plan directly") applies.

## Tech stack & test surface (IMPORTANT — not PHP/Pest)

- **Source:** `.opencode/plugins/pre-tool-use.ts` (TypeScript, `@opencode-ai/plugin` SDK).
- **Tests:** `tests/Plugin/*.test.ts` using the **`node:test`** runner (`describe`/`it` from `node:test`, `assert` from `node:assert/strict`), executed via **tsx**.
- **Run tests:** `npm run test:plugin` (= `node --import tsx --test tests/Plugin/*.test.ts`).
- **Typecheck:** `npx tsc --noEmit` (tsconfig.json includes `.opencode/plugins/**/*.ts` + `tests/Plugin/**/*.ts`).
- **No Pest coverage gate applies** — `coverage-gate.php` reads Clover XML from PHP runs only. `/check` is a no-op for this diff (eslint config does not lint `.opencode/plugins/**`; pest does not run on `.ts`). The real gates are `npm run test:plugin` + `tsc --noEmit`.
- **Conventional commit type:** `fix` (Security → `fix` per `docs/agents/labels.md`).
- **File headers:** every new `.ts` file gets the RCS `$KYAULabs:` header + `// vim:` modeline (see `rcs-header` skill). Modified files already have them — preserve.

## Global constraints

- Pure, side-effect-free classifier (`classifyCommand` remains the exported test seam). No I/O inside the classifier.
- `--force-with-lease` MUST remain unblocked (regression guard — existing test at `pre-tool-use.test.ts:48-54`).
- `git log -n 5`, `git push -n`, `git cherry-pick -n` MUST remain unblocked (`-n` is `--no-verify` only on `git commit` — ADR-0025; existing tests in `no_verify_block.test.ts`).
- Safe-zone `rm -rf` (node_modules, vendor, cdn/css, cdn/javascript, /tmp, /var/tmp, os.tmpdir()) MUST remain allowed (existing tests at `pre-tool-use.test.ts:61-107`).
- Recursion depth for wrapper-unwrapping is capped (e.g. 3); exceeding it → BLOCK (conservative).
- Tokenizer is intentionally minimal (whitespace + single/double quote spans). Full POSIX shell parsing (`$()`, heredocs, arrays) is explicitly OUT OF SCOPE for v2 — document as a known limitation, do not attempt.

## Affected files

- **Modify:** `.opencode/plugins/pre-tool-use.ts` (the classifier + hook).
- **Create:** `tests/Plugin/pre-tool-use-bypass.test.ts` (new bypass-class tests).
- **Modify:** `tests/Plugin/no_verify_block.test.ts` (add git-global-option + bundled-flag cases).
- **Modify:** `tests/Plugin/pre-tool-use.test.ts` (add `/bin/rm` basename + fail-closed regression cases; keep existing green).
- **Create:** `adr/0036-safety-hook-fail-closed-block-rules.md` (fail-closed decision).
- **Modify:** `adr/0023-safety-hook-for-bash-tool-interception.md` (mark fail-open clause superseded by ADR-0036) + `CONTEXT.md` ADR list (add 0036).
- **Create:** `tests/Plugin/fail_closed_contract.test.ts` (contract test: ADR-0036 exists + Accepted, mirroring the ci-runner ADR contract pattern).

---

## Slice 1 — Quote-aware tokenizer (foundation)

**Files:** Modify `.opencode/plugins/pre-tool-use.ts`; test in `tests/Plugin/pre-tool-use-bypass.test.ts`.

**Produces:** exported `export function tokenizeCommand(segment: string): string[]` — splits a single command segment on whitespace OUTSIDE quotes, strips one layer of surrounding matching quotes from each token. Does NOT process escapes beyond `\` before a quote char (minimal). Returns `[]` for blank input.

- [ ] **Red:** Write failing tests in a new `describe("tokenizeCommand", ...)` block:

```ts
import { tokenizeCommand } from "../../.opencode/plugins/pre-tool-use.ts";

it("splits plain whitespace tokens", () => {
    assert.deepEqual(tokenizeCommand("rm -rf src"), ["rm", "-rf", "src"]);
});
it("keeps a double-quoted span as one token, strips quotes", () => {
    assert.deepEqual(tokenizeCommand('bash -c "rm -rf /etc"'), ["bash", "-c", "rm -rf /etc"]);
});
it("keeps a single-quoted span as one token, strips quotes", () => {
    assert.deepEqual(tokenizeCommand("sh -c 'git push -f'"), ["sh", "-c", "git push -f"]);
});
it("preserves spaces inside quotes", () => {
    assert.deepEqual(tokenizeCommand("rm -rf 'my dir'"), ["rm", "-rf", "my dir"]);
});
it("returns [] for blank input", () => {
    assert.deepEqual(tokenizeCommand("   "), []);
});
```

Run: `npm run test:plugin` → expect FAIL (function not exported).

- [ ] **Green:** Implement `tokenizeCommand`. Replace the `command.split(/\s+/)` call sites in `classifyCommand` (line ~114 segments-then-split, line ~144, line ~157) with `tokenizeCommand` over each segment. Existing tests must stay green.

- [ ] **Refactor:** Simplify `resolveTarget` — operands now arrive quote-stripped, so the manual quote-strip block (lines ~75-80) becomes a no-op fallback (leave it for defense-in-depth, or remove if all tests pass).

- [ ] **Verify:** `npm run test:plugin` all green; `npx tsc --noEmit` clean.

---

## Slice 2 — rm basename matching + scan-anywhere (AC1 part 1)

**Files:** Modify `.opencode/plugins/pre-tool-use.ts` (`parseRm`/detection); test in `pre-tool-use-bypass.test.ts`.

**Consumes:** `tokenizeCommand` (Slice 1). **Produces:** detection now matches `rm` by basename and scans the whole token stream, not just the head.

- [ ] **Red:** Failing tests:

```ts
it("blocks /bin/rm -rf (basename match)", () => {
    assert.equal(classifyCommand("/bin/rm -rf /etc", opts).severity, "block");
});
it("blocks sudo /usr/bin/rm -rf (basename + sudo-strip)", () => {
    assert.equal(classifyCommand("sudo /usr/bin/rm -rf src", opts).severity, "block");
});
it("blocks xargs rm -rf (rm not at head)", () => {
    assert.equal(classifyCommand("xargs rm -rf", opts).severity, "block");
});
it("blocks rm -rf appearing after a pipe in one segment via wrapper", () => {
    // confirm piped segments still handled: each segment re-scanned
    assert.equal(classifyCommand("echo hi | xargs rm -rf", opts).severity, "block");
});
```

- [ ] **Green:** (a) Add `function basename(token: string): string` returning the final path component. (b) In `parseRm`, after the optional `sudo` skip, accept the rm command at the current index if `basename(tokens[i]) === "rm"` (covers `rm`, `/bin/rm`, `/usr/bin/rm`). (c) Add a second scan path `findRmAnywhere(tokens)` that returns the first index `i` where `basename(tokens[i]) === "rm"`; `classifyCommand` calls `parseRm` on `tokens.slice(foundIndex)` when found anywhere in a segment (after sudo/env unwrap from Slice 3). For `xargs rm -rf` with no operands, the operands come from stdin → treat as unresolvable → BLOCK (extend the existing "operands empty → continue" rule: if rm -rf detected but operands empty AND command shape is `xargs`/piped-input, block conservatively).

- [ ] **Verify:** `npm run test:plugin` green; existing rm safe-zone tests still pass.

---

## Slice 3 — Wrapper unwrapping (AC1 part 2)

**Files:** Modify `.opencode/plugins/pre-tool-use.ts`; test in `pre-tool-use-bypass.test.ts`.

**Consumes:** Slices 1–2. **Produces:** `function unwrapAndClassify(tokens: string[], depth: number): Finding` — if the head is a known wrapper, reduce to the inner command and recurse (depth-limited); else run the normal per-segment classification.

Wrappers to handle:
- **Shell `-c`:** `bash`/`sh`/`zsh`/`dash`/`ksh` with next token `-c` → reclassify the THIRD token (the script string) via `tokenizeCommand` + recursion.
- **`xargs`:** drop `xargs` (+ optional `xargs` flags), classify the rest (rm targets unresolvable → block per Slice 2).
- **`env`:** drop `env` and any leading `NAME=VALUE` tokens, classify the rest.
- **`command`/`exec`:** drop head, classify the rest.
- **`eval`:** tokenize the joined remaining tokens as one string, classify.
- **Depth guard:** `depth > 3` → return `{ severity: "block", reason: "nested wrapper depth exceeded — failing closed" }`.

- [ ] **Red:** Failing tests:

```ts
it('blocks bash -c "rm -rf /etc"', () => {
    assert.equal(classifyCommand('bash -c "rm -rf /etc"', opts).severity, "block");
});
it('blocks sh -c "git push --force origin main"', () => {
    assert.equal(classifyCommand('sh -c "git push --force origin main"', opts).severity, "block");
});
it("blocks env rm -rf /etc", () => {
    assert.equal(classifyCommand("env rm -rf /etc", opts).severity, "block");
});
it('blocks eval "git push -f"', () => {
    assert.equal(classifyCommand('eval "git push -f"', opts).severity, "block");
});
it("blocks command git push --force", () => {
    assert.equal(classifyCommand("command git push --force", opts).severity, "block");
});
it("blocks deeply nested wrappers past depth cap", () => {
    assert.equal(classifyCommand('bash -c "bash -c \\"bash -c \\"bash -c \\"rm -rf /etc\\"\\"\\""', opts).severity, "block");
});
```

- [ ] **Green:** Implement `unwrapAndClassify`. Make the main rm/force-push/no-verify detection in `classifyCommand` route each segment's tokens through it. Confirm benign wrappers still pass (`bash -c "ls -la"` → null).

- [ ] **Verify:** `npm run test:plugin` green; baseline benign tests still pass.

---

## Slice 4 — git global-option skip + bundled-flag expansion (AC2, AC3)

**Files:** Modify `.opencode/plugins/pre-tool-use.ts`; add cases to `tests/Plugin/no_verify_block.test.ts` (git subcommand) and `pre-tool-use-bypass.test.ts` (force).

**Consumes:** Slice 1. **Produces:** `function findGitSubcommand(tokens: string[]): { subcmd: string; rest: string[] }` and `function expandShortFlags(token: string): string[]`.

- `findGitSubcommand`: advance past `git`, then consume global options that precede the subcommand. Value-taking globals (`-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`, `--super-prefix`, `--config-env`, `--exec-path`) consume the NEXT token as their value (or `--opt=value` inline). Value-less globals (`--bare`, `--no-replace-objects`, `-p`, `-P`, `--paginate`, `--no-pager`, `-l`, `--literal-pathspecs`, `--no-literal-pathspecs`, `--version`, `--help`) consume only themselves. Stop at the first non-option token → that is the subcommand.
- `expandShortFlags`: for a token matching `/^-[a-zA-Z]+$/` (NOT `--`), return `token.split("").map(c => "-" + c)`. `--*` long flags pass through unchanged.

- [ ] **Red:** Failing tests in `no_verify_block.test.ts`:

```ts
it("blocks git -C /tmp/x push --force (global -C skip)", () => {
    assert.equal(classifyCommand("git -C /tmp/x push --force", opts).severity, "block");
});
it("blocks git -c a=b commit -n (global -c skip, then -n on commit)", () => {
    assert.equal(classifyCommand("git -c a=b commit -n", opts).severity, "block");
});
it("does NOT block git -C ../other log -n 5 (log -n = max-count)", () => {
    assert.equal(classifyCommand("git -C ../other log -n 5", opts).severity, null);
});
it("does NOT block git -c user.email=x@y commit -m w (normal commit)", () => {
    assert.equal(classifyCommand("git -c user.email=x@y commit -m w", opts).severity, null);
});
```

and in `pre-tool-use-bypass.test.ts`:

```ts
it("blocks git push -uf (bundled -f)", () => {
    assert.equal(classifyCommand("git push -uf origin main", opts).severity, "block");
});
it("still does NOT block git push --force-with-lease (regression guard)", () => {
    assert.equal(classifyCommand("git push --force-with-lease origin main", opts).severity, null);
});
it("blocks git -C repo push -uf (global skip + bundled)", () => {
    assert.equal(classifyCommand("git -C repo push -uf", opts).severity, "block");
});
```

- [ ] **Green:** Replace the `\bgit\s+([a-z-]+)` subcommand regex (line ~155) with `findGitSubcommand(tokens)`. Replace `tokens.includes("-f")` / `tokens.includes("--force")` (line ~145) and `tokens.includes("-n")` / `tokens.includes("--no-verify")` (line ~158) with checks over the EXPANDED flag set: `const expanded = rest.flatMap(expandShortFlags);` then `if (expanded.includes("--force") || expanded.includes("-f"))` and `if (subcmd === "commit" && expanded.includes("-n"))` / `if (expanded.includes("--no-verify"))`. Confirm `--force-with-lease` is not split (it's `--*`, passes through, and is neither `--force` nor `-f`).

- [ ] **Verify:** `npm run test:plugin` green; the full `no_verify_block.test.ts` suite green (no regressions on `-n` semantics).

---

## Slice 5 — find -delete / -exec rm (AC1 part 3)

**Files:** Modify `.opencode/plugins/pre-tool-use.ts`; test in `pre-tool-use-bypass.test.ts`.

**Produces:** a `find` detector. Decision: `find ... -delete` → BLOCK unconditionally (removes files; conservative — no safe-zone carve-out for v2). `find ... -exec rm` / `-execdir rm` → BLOCK. Other `-exec` (e.g. `-exec chmod`) → PASS.

- [ ] **Red:** Failing tests:

```ts
it("blocks find . -delete", () => {
    assert.equal(classifyCommand("find . -delete", opts).severity, "block");
});
it("blocks find /etc -type f -delete", () => {
    assert.equal(classifyCommand("find /etc -type f -delete", opts).severity, "block");
});
it("blocks find . -exec rm -rf {} +", () => {
    assert.equal(classifyCommand("find . -exec rm -rf {} +", opts).severity, "block");
});
it("blocks find . -execdir rm -f {} ;", () => {
    assert.equal(classifyCommand("find . -execdir rm -f {} ;", opts).severity, "block");
});
it("does NOT block find . -name x -exec chmod 644 {} + (non-rm exec)", () => {
    assert.equal(classifyCommand("find . -name x -exec chmod 644 {} +", opts).severity, null);
});
```

- [ ] **Green:** In `classifyCommand`, after the rm detection block, add: `if (subcmd-detect === "find")` (using a head basename check on tokens for `find`) → scan tokens; if any token === `-delete` → BLOCK; if `-exec`/`-execdir` present AND the token immediately after is `rm` (basename) → BLOCK. Insert BEFORE the warn-level SQL/reset checks so the block wins.

- [ ] **Verify:** `npm run test:plugin` green.

---

## Slice 6 — Fail-closed posture (AC4) + ADR amendment

**Files:** Modify `.opencode/plugins/pre-tool-use.ts`; create `adr/0036-safety-hook-fail-closed-block-rules.md`; modify `adr/0023-*.md` + `CONTEXT.md`; create `tests/Plugin/fail_closed_contract.test.ts`.

**Decision (reverses ADR-0023's fail-open clause):** `classifyCommand` now fails CLOSED. The outer hook handler also fails closed once a command string is present. Rationale: the fail-open posture documented in ADR-0023 provided false confidence (issue #178 finding #6); a classifier that cannot analyze a command it was asked to evaluate must refuse it.

- [ ] **Red:** Refactor classifier into `classifyCommandImpl(command, opts): Finding` (may throw) + thin wrapper `classifyCommand` that `try`s the impl and on `catch` returns:

```ts
return { severity: "block", reason: "safety classifier internal error — failing closed per #178 / ADR-0036" };
```

Failing test (force the impl to throw via a crafted input — e.g. a non-string coerced through, or call `classifyCommandImpl` directly with malformed state and assert the wrapper blocks):

```ts
import { classifyCommand } from "../../.opencode/plugins/pre-tool-use.ts";
it("classifyCommand fails CLOSED on internal error (block, not pass)", () => {
    // Passing an object that makes impl throw; the public wrapper must surface block.
    const result = classifyCommand({} as unknown as string, opts);
    assert.equal(result.severity, "block");
});
```

(Run: `npm run test:plugin` → FAIL: current code returns `{severity: null}` on non-string at line ~106-108 and on any internal throw.)

- [ ] **Green:** Apply the refactor. Keep the explicit empty-string short-circuit (`""` → `{severity: null}` — empty command = nothing to evaluate, not an error), but ANY other internal throw → block. Update the outer hook handler (lines ~188-192): change `catch { return; // fail open }` to:

```ts
catch (e) {
    throw new Error(
        "[pre-tool-use] BLOCKED: classifier failure — failing closed per #178/ADR-0036: " +
        (e instanceof Error ? e.message : String(e)),
    );
}
```

Update the JSDoc on `classifyCommand` and the `PreToolUse` plugin docblock: replace "fails open" language with "fails closed on block-level rule evaluation per #178 / ADR-0036".

- [ ] **Red (contract test):** Create `tests/Plugin/fail_closed_contract.test.ts` reading `adr/0036-*.md` and asserting `Status: Accepted` exists (mirror the ci-runner ADR contract pattern). Run → FAIL (file absent).

- [ ] **Green (ADR):** Write `adr/0036-safety-hook-fail-closed-block-rules.md` (Nygard format: Date 2026-07-21, Status Accepted, Context = issue #178 finding #6 + ADR-0023 fail-open rationale, Decision = fail-closed on block-level rule evaluation, Consequences = a buggy classifier now blocks rather than silently passes; trade-off accepted for security; mitigation = robust pure-function tests). In `adr/0023-*.md` add a one-line note under Status: "Fail-open clause superseded by ADR-0036 (2026-07-21)." Add `adr/0036-...` to the CONTEXT.md ADR list.

- [ ] **Verify:** `npm run test:plugin` green (incl. new contract test); `npx tsc --noEmit` clean.

---

## Slice 7 — Full regression + final verification

- [ ] **Run the whole plugin suite:** `npm run test:plugin` — every existing test (baseline, rm safe-zones, --no-verify block, hook integration) PLUS all new bypass tests green.
- [ ] **Typecheck:** `npx tsc --noEmit` — clean.
- [ ] **Spot-check the ACs against the suite:**
  - AC1: `bash -c "rm -rf /etc"`, `xargs rm -rf`, `find . -delete` all block ✓ (Slices 2/3/5)
  - AC2: `git -C /tmp/x push --force`, `git push -uf` block ✓ (Slice 4)
  - AC3: `git -c a=b commit -n` blocks ✓ (Slice 4)
  - AC4: classifier exceptions on block-level rules → block ✓ (Slice 6)
- [ ] **Regression guards confirmed green:** `--force-with-lease` pass, `git log -n 5` pass, `git push -n` pass, `git cherry-pick -n` pass, rm safe-zone allowlist intact.
- [ ] **verification-before-completion:** no debug `console.log`, no leftover instrumentation, RCS headers + vim modelines on every new `.ts` file.
- [ ] **Commits:** one signed conventional commit per slice (`fix(pre-tool-use): ...`), `Fixes: #178` on the final/closing commit's footer above `Authored-by:`. Footers resolved via `bash .github/scripts/resolve-identity.sh`.

## Risks & notes

- **ADR reversal:** Slice 6 reverses a documented Accepted decision (ADR-0023 fail-open). This is deliberate and recorded in ADR-0036. If the reviewer prefers a narrower change (fail-closed only inside block-rule branches, outer hook stays fail-open), that is a legitimate alternative — surface it at review, do not silently pick.
- **Tokenizer is minimal:** `$(...)`, heredocs, brace expansion, and ANSI-C quoting beyond `\`-before-quote are NOT handled. This matches the ACs (which use plain quoting). A future v3 could pull in a real shell parser; document as a known limitation in ADR-0036 Consequences.
- **`@architect` optional:** the issue already passed 6/6 sub-reviews + master review (a form of architecture review). If the reviewer wants a formal go/no-go against CONTEXT.md before execution, dispatch `@architect` on this plan + ADR-0036 draft. Not blocking per the user's directive to proceed to @tdd.
