# Code Complexity Audit Remediation — Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Workstream A tasks follow the characterization-test pattern: write
> tests against current behavior first (green), then refactor and keep them
> green (no red phase — pure refactor).

**Goal:** Remediate audit findings 1–5 + 7 and the dead-code note: de-complex the
safety extension, deduplicate `coverage-gate.php`, and add real static gates —
all behavior-preserving.

**Architecture:** Three independent workstreams. A: characterize the safety
extension with node tests, then extract per-policy rules (`classifyCommandImpl`),
a `judgeToken` predicate, a shared `resolvePathToken`, and delete
`DenialOutcomeTracker`. B: make the package copy of `coverage-gate.php` canonical
with a CI shim and extract `print_report`. C: repair tsconfig coverage and add
warn-level eslint complexity rules (dependency-gated).

**Tech Stack:** TypeScript (node:test runner with type stripping, node v26.7.0),
PHP 8.5 CLI, eslint 10 flat config, GitHub Actions.

## Global constraints

- **No behavior change** to safety policy: ADRs 0023/0025/0036/0042/0047/0048/0056
  untouched in substance. Characterization tests pin current behavior; if a test
  reveals an anomaly, report it to the user — never silently "fix" it.
- **Characterization tests first** (Tasks 1–3 committed) before any refactor
  (Task 4+).
- **Commits:** conventional commits + three footers in order per ADR-0064 —
  `Implemented-by:` (active session model), `Tested-by:` (via
  `bash packages/prism-core/scripts/resolve-ocr-model.sh`), `Signed-off-by:` (via
  `bash packages/prism-core/scripts/resolve-identity.sh`). Signed commits
  (`git commit -S`). Both resolvers currently emit `deepseek-v4-flash` and
  `kyau <kyau@kyau.net>`.
- **RCS headers + vim modelines** are managed by the pre-commit hook (ADR-0041):
  write new source files **without** a `$KYAULabs:` header line — the hook's
  strip-then-insert normalizer adds the canonical header (real identity/date)
  on commit. Never write literal `creator@host` / `YYYY/MM/DD` header text —
  the hook blocks it. Add the vim modeline as the last line yourself:
  TS: `// vim: ft=typescript sts=4 sw=4 ts=4 et :`; PHP: `// vim: ft=php sts=4 sw=4 ts=4 et :`.
- **Registry access needs human approval** (consent boundary): `npm install` /
  `npm view` only after the user approves (Task 11).
- **Session gotcha:** the harness's own safety extension is live and blocks bash
  tool calls whose text contains `rm -rf` + path patterns (including inside
  `printf`/heredoc fixtures). Create fixtures with the `write` tool or avoid
  literal destructive patterns in bash commands.
- **Verification baseline:** `npm run test:node`, `npx tsc --noEmit`,
  `bash tests/Shell/coverage_gate_test.sh`, `npx eslint` on the linted globs.
  Final gate: `/check-php` + `code-review`.

---

### Task 1: classifyCommand characterization tests + test-runner wiring

**Files:**
- Create: `tests/Node/safety-classify.test.ts`
- Modify: `package.json` (`scripts.test:node`)

**Interfaces:**
- Consumes: `classifyCommand(command: string, opts: ClassifyOptions): Finding` from
  `packages/prism-core/extensions/safety/pre-tool-use.ts` (public, unchanged).
- Produces: the behavior matrix later tasks must keep green.

- [x] **Step 1: Write the characterization tests**

> Executed: as written, with one correction — the depth guard fires only after
> FOUR nested unwraps (3 evals stay clean); the plan's original
> `eval eval eval echo hi → block` expectation was wrong (verified against the
> code).

`tests/Node/safety-classify.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../packages/prism-core/extensions/safety/pre-tool-use.ts";

const OPTS = { projectDir: "/repo" };
const CLEAN = { severity: null, reason: "" };

test("empty command passes open", () => {
    assert.deepEqual(classifyCommand("", OPTS), CLEAN);
});

test("rm -rf inside a safe zone passes", () => {
    assert.deepEqual(classifyCommand("rm -rf node_modules", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("rm -rf /tmp/xyz", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("cd /repo && rm -rf vendor/pkg", OPTS), CLEAN);
});

test("rm -rf outside safe zones blocks", () => {
    assert.equal(classifyCommand("rm -rf /", OPTS).severity, "block");
    assert.equal(classifyCommand("rm -rf .", OPTS).severity, "block");
    assert.equal(classifyCommand("rm -rf x", OPTS).severity, "block");
    assert.equal(classifyCommand("sudo rm -rf /etc", OPTS).severity, "block");
});

test("rm -rf with no operands at head passes; via xargs blocks", () => {
    assert.deepEqual(classifyCommand("rm -rf", OPTS), CLEAN);
    assert.equal(classifyCommand("xargs rm -rf", OPTS).severity, "block");
});

test("rm without -r is not blocked", () => {
    assert.deepEqual(classifyCommand("rm -f node_modules", OPTS), CLEAN);
});

test("rm -rf of a safe-zone path containing = stays allowed", () => {
    assert.deepEqual(classifyCommand("rm -rf node_modules/foo=bar", OPTS), CLEAN);
});

test("find -delete and find -exec rm block; other find -exec passes", () => {
    assert.equal(classifyCommand("find . -delete", OPTS).severity, "block");
    assert.equal(classifyCommand("find . -exec rm {} ;", OPTS).severity, "block");
    assert.deepEqual(classifyCommand("find . -exec echo {} ;", OPTS), CLEAN);
});

test("destructive SQL DROP warns", () => {
    assert.equal(classifyCommand("DROP TABLE users", OPTS).severity, "warn");
    assert.equal(classifyCommand("DROP DATABASE db", OPTS).severity, "warn");
});

test("git reset --hard warns", () => {
    assert.equal(classifyCommand("git reset --hard", OPTS).severity, "warn");
});

test("git push --delete warns", () => {
    assert.equal(classifyCommand("git push origin --delete feature/x", OPTS).severity, "warn");
});

test("git push --force variants block; --force-with-lease passes", () => {
    assert.equal(classifyCommand("git push -f", OPTS).severity, "block");
    assert.equal(classifyCommand("git push --force", OPTS).severity, "block");
    assert.equal(classifyCommand("git push -uf origin main", OPTS).severity, "block");
    assert.deepEqual(classifyCommand("git push --force-with-lease", OPTS), CLEAN);
});

test("git push -n is dry-run, not no-verify", () => {
    assert.deepEqual(classifyCommand("git push -n", OPTS), CLEAN);
});

test("git commit --no-verify and -n block", () => {
    assert.equal(classifyCommand("git commit --no-verify -m x", OPTS).severity, "block");
    assert.equal(classifyCommand("git commit -n -m x", OPTS).severity, "block");
});

test("git log -n 5 is max-count, not no-verify", () => {
    assert.deepEqual(classifyCommand("git log -n 5", OPTS), CLEAN);
});

test("git global options are consumed before the subcommand", () => {
    assert.deepEqual(classifyCommand("git -c core.hooksPath=/tmp/x commit -m y", OPTS), CLEAN);
});

test("wrapper unwrap: clean inner passes, destructive inner blocks", () => {
    assert.deepEqual(classifyCommand('bash -c "rm -rf /tmp/x"', OPTS), CLEAN);
    assert.equal(classifyCommand('bash -c "rm -rf /"', OPTS).severity, "block");
    assert.deepEqual(classifyCommand("env FOO=1 rm -rf node_modules", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("command rm -rf node_modules", OPTS), CLEAN);
});

test("unwrap depth guard blocks deeply nested clean wrappers", () => {
    assert.deepEqual(classifyCommand("eval eval echo hi", OPTS), CLEAN);
    assert.deepEqual(classifyCommand("eval eval eval echo hi", OPTS), CLEAN);
    assert.equal(classifyCommand("eval eval eval eval echo hi", OPTS).severity, "block");
});

test("non-string command fails closed", () => {
    const f = classifyCommand(undefined as unknown as string, OPTS);
    assert.equal(f.severity, "block");
    assert.match(f.reason, /internal error/);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Extend the test runner to include TS tests**

In `package.json`, change:

```json
"test:node": "node --test tests/Node/*.test.js tests/Node/*.test.ts"
```

- [x] **Step 3: Run the new tests — expect PASS**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: all tests PASS (characterization — current behavior is the contract).
Result: 18/18 PASS.

- [x] **Step 4: Commit**

```bash
git add tests/Node/safety-classify.test.ts package.json
git commit -S -m $'test(safety): characterize classifyCommand behavior\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: sensitive-paths characterization tests

**Files:**
- Create: `tests/Node/safety-sensitive-paths.test.ts`

**Interfaces:**
- Consumes: `sensitiveOperandCheck(command: string, opts: SensitivePathOptions): SensitiveMatch | null`
  from `packages/prism-core/extensions/safety/sensitive-paths.ts` (public, unchanged).
- Produces: the deny-floor behavior matrix later tasks must keep green.

- [x] **Step 1: Write the characterization tests**

> Executed with one deviation: `cat -d@.env.example` is pinned as `dynamic`
> (denied) — the characterization exposed a latent bug in `isEnvExampleRef`:
> the `^-[^=]*@?` prefix strip greedily consumes the `@`, so short-option
> glued forms fall through to the fallback. Reported to the user; approved
> fix B (restore documented ADR-0048 intent) lands as Task 2A.

`tests/Node/safety-sensitive-paths.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sensitiveOperandCheck } from "../../packages/prism-core/extensions/safety/sensitive-paths.ts";

const OPTS = { projectDir: "/repo", home: "/home/tester" };

test("deny floor: ssh, cloud, netrc, git-credentials, ssl-private", () => {
    assert.equal(sensitiveOperandCheck("cat /home/tester/.ssh/id_rsa", OPTS)?.className, "ssh");
    assert.equal(sensitiveOperandCheck("cat ~/.ssh/id_rsa", OPTS)?.className, "ssh");
    assert.equal(sensitiveOperandCheck("cat ~/.aws/credentials", OPTS)?.className, "cloud-credentials");
    assert.equal(sensitiveOperandCheck("echo x > ~/.netrc", OPTS)?.className, "netrc");
    assert.equal(sensitiveOperandCheck("cat ~/.git-credentials", OPTS)?.className, "git-credentials");
    assert.equal(sensitiveOperandCheck("cat /etc/ssl/private/key.pem", OPTS)?.className, "ssl-private");
});

test("env files denied; .env.example exempt including glued forms", () => {
    assert.equal(sensitiveOperandCheck("cat .env", OPTS)?.className, "env");
    assert.equal(sensitiveOperandCheck("cat .env.local", OPTS)?.className, "env");
    assert.equal(sensitiveOperandCheck("cat .env.example", OPTS), null);
    assert.equal(sensitiveOperandCheck("cat -d@.env.example", OPTS), null);
});

test("glued and option-prefixed credential forms fall back to dynamic", () => {
    assert.equal(sensitiveOperandCheck("curl -d@~/.ssh/id_rsa", OPTS)?.className, "dynamic");
    assert.equal(sensitiveOperandCheck("cat --output=~/.aws/credentials", OPTS)?.className, "dynamic");
});

test("wrapper unwrap reaches inner operands", () => {
    assert.equal(sensitiveOperandCheck('bash -c "cat ~/.ssh/id_rsa"', OPTS)?.className, "ssh");
});

test("prism-user-manifest denied normally; kept for trusted setup scripts", () => {
    assert.equal(sensitiveOperandCheck("cat ~/.config/opencode/foo", OPTS)?.className, "prism-user-manifest");
    assert.equal(sensitiveOperandCheck(".github/scripts/setup-rulesets.sh --config ~/.config/opencode/x", OPTS), null);
});

test("untrusted setup subcommand resolves unresolvable", () => {
    assert.equal(sensitiveOperandCheck('bash -c "setup-rulesets.sh"', OPTS)?.className, "unresolvable");
});

test("non-string or empty input passes", () => {
    assert.equal(sensitiveOperandCheck(undefined as unknown as string, OPTS), null);
    assert.equal(sensitiveOperandCheck("", OPTS), null);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run the new tests — expect PASS**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: all PASS.

- [x] **Step 3: Commit**

```bash
git add tests/Node/safety-sensitive-paths.test.ts
git commit -S -m $'test(safety): characterize sensitive-path operand checks\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2A: fix glued `.env.example` exemption (user-approved deviation B)

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts:69-73`
- Modify: `tests/Node/safety-sensitive-paths.test.ts` (flip one expectation, add `--opt=` case)

**Interfaces:**
- Consumes: `isEnvExampleRef` (private) — restores the behavior its own
  docblock and commit 83b68af document.
- Produces: `-d@.env.example` / `--opt=.env.example` / `@.env.example` exempt;
  `-d@~/.ssh/id_rsa.env.example`, `--output=~/.aws/credentials`, bare `-d`
  unchanged (denied / clean).

- [x] **Step 1: Fix the prefix-strip regex**

In `isEnvExampleRef`, change:

```ts
const bare = token.replace(/^-[^=]*@?/, "").replace(/^@/, "");
```

to:

```ts
const bare = token.replace(/^-{1,2}[^=@]*[=@]/, "").replace(/^@/, "");
```

Verified against all six documented forms: `-d@.env.example` and
`--opt=.env.example` strip to `.env.example` (exempt); `@.env.example`
unchanged; `-d@~/.ssh/id_rsa.env.example` still denied (basename guard);
`--output=~/.aws/credentials` still denied; bare `-d` still clean.

- [x] **Step 2: Flip the expectation + add the `--opt=` case**

In the test, replace the pinned `dynamic` assertion with:

```ts
    assert.equal(sensitiveOperandCheck("cat -d@.env.example", OPTS), null);
    assert.equal(sensitiveOperandCheck("cat --opt=.env.example", OPTS), null);
```

- [x] **Step 3: Run — expect PASS**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: 7/7 PASS (previously failing assertion now green).

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts tests/Node/safety-sensitive-paths.test.ts
git commit -S -m $'fix(security): restore glued .env.example exemption\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: DenialCircuitBreaker characterization tests

**Files:**
- Create: `tests/Node/safety-circuit-breaker.test.ts`

**Interfaces:**
- Consumes: `DenialCircuitBreaker` from
  `packages/prism-core/extensions/safety/denial-circuit-breaker.ts`:
  `constructor(opts: DenialCircuitBreakerOptions = {})` (threshold defaults to 3),
  `observe(sessionID: string, denied: boolean): DenialObservation` ({count, tripped, transitioned}),
  `count(sessionID): number`, `isTripped(sessionID): boolean`,
  `reset(sessionID): void`, `clearAll(): void`.
- Produces: pins the breaker contract Task 7 must not disturb.

- [x] **Step 1: Write the characterization tests**

`tests/Node/safety-circuit-breaker.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker } from "../../packages/prism-core/extensions/safety/denial-circuit-breaker.ts";

test("trips at the default threshold of 3", () => {
    const b = new DenialCircuitBreaker();
    assert.equal(b.observe("s1", true).count, 1);
    assert.equal(b.isTripped("s1"), false);
    assert.equal(b.observe("s1", true).count, 2);
    assert.equal(b.isTripped("s1"), false);
    const third = b.observe("s1", true);
    assert.equal(third.count, 3);
    assert.equal(third.tripped, true);
    assert.equal(third.transitioned, true);
    assert.equal(b.isTripped("s1"), true);
});

test("denials keep counting past the threshold but stay tripped", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    const fourth = b.observe("s1", true);
    assert.equal(fourth.count, 4);
    assert.equal(fourth.tripped, true);
    assert.equal(fourth.transitioned, false);
});

test("a success resets the streak", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    const obs = b.observe("s1", false);
    assert.deepEqual(obs, { count: 0, tripped: false, transitioned: false });
    assert.equal(b.isTripped("s1"), false);
});

test("sessions are isolated", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    assert.equal(b.isTripped("s1"), true);
    assert.equal(b.isTripped("s2"), false);
    assert.equal(b.count("s2"), 0);
});

test("custom threshold", () => {
    const b = new DenialCircuitBreaker({ threshold: 2 });
    assert.equal(b.observe("s1", true).tripped, false);
    const second = b.observe("s1", true);
    assert.equal(second.tripped, true);
    assert.equal(second.transitioned, true);
});

test("reset and clearAll return to never-seen state", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    b.reset("s1");
    assert.equal(b.count("s1"), 0);
    assert.equal(b.isTripped("s1"), false);
    b.observe("s2", true);
    b.clearAll();
    assert.equal(b.count("s2"), 0);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run the full node suite — expect PASS**

Run: `npm run test:node`
Expected: all existing JS tests + the three new TS files PASS.

- [x] **Step 3: Commit**

```bash
git add tests/Node/safety-circuit-breaker.test.ts
git commit -S -m $'test(safety): characterize denial circuit breaker\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: A1 — split `classifyCommandImpl` into per-policy rules

**Files:**
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts:220-356` (replace
  `classifyCommandImpl` with the rule table + rules)

**Interfaces:**
- Consumes: unchanged `resolveTarget`, `isWithinSafeZone`, `parseRmTokens`,
  `findRmAnywhere`, `findGitSubcommand`, `expandShortFlags`, `basename`,
  `tokenizeCommand`, `tryUnwrapSegment`.
- Produces: `classifyCommand` behavior identical to Tasks 1's matrix; internal
  `SegmentRule` / `CommandRule` types used by later tasks' style.

- [ ] **Step 1: Replace the `classifyCommandImpl` body (lines 220-356)**

Delete the entire old `classifyCommandImpl` (including the stray indented blocks)
and insert:

```ts
interface RuleCtx {
    projectDir: string;
    home: string;
    safeRelDirs: readonly string[];
}

type SegmentRule = (tokens: string[], ctx: RuleCtx) => Finding | null;

type CommandRule = (command: string, tokens: string[], ctx: RuleCtx) => Finding | null;

const SEGMENT_RULES: readonly SegmentRule[] = [rmRfRule, findDeleteRule];

// Whole-command rules run after the segment phase, in this order: block
// results win over warns (ADR-0023/0036), matching the pre-refactor
// statement order.
const COMMAND_RULES: readonly CommandRule[] = [
    sqlDropWarn,
    gitResetWarn,
    gitPushDeleteWarn,
    gitForcePushBlock,
    gitNoVerifyBlock,
];

function classifyCommandImpl(command: string, opts: ClassifyOptions, depth: number): Finding {
    if (depth > MAX_UNWRAP_DEPTH) {
        return { severity: "block", reason: "nested wrapper depth exceeded — failing closed" };
    }
    const ctx: RuleCtx = {
        projectDir: opts.projectDir,
        home: process.env.HOME || "/",
        safeRelDirs: opts.safeRelDirs ?? SAFE_REL_DIRS,
    };
    for (const segment of command.split(/[;&|\n]/)) {
        const tokens = tokenizeCommand(segment);
        if (tokens.length === 0) continue;

        const innerCmd = tryUnwrapSegment(tokens);
        if (innerCmd !== null) {
            const innerFinding = classifyCommandImpl(innerCmd, opts, depth + 1);
            if (innerFinding.severity !== null) return innerFinding;
            continue;
        }
        for (const rule of SEGMENT_RULES) {
            const finding = rule(tokens, ctx);
            if (finding !== null) return finding;
        }
    }
    const commandTokens = tokenizeCommand(command);
    for (const rule of COMMAND_RULES) {
        const finding = rule(command, commandTokens, ctx);
        if (finding !== null) return finding;
    }
    return { severity: null, reason: "" };
}

/** BLOCK: rm -rf outside safe zones, including piped/xargs conservatism. */
function rmRfRule(tokens: string[], ctx: RuleCtx): Finding | null {
    let parsed = parseRmTokens(tokens, 0);
    let foundIdx = -1;
    if (!parsed) {
        foundIdx = findRmAnywhere(tokens);
        if (foundIdx > 0) {
            parsed = parseRmTokens(tokens, foundIdx);
        }
    }
    if (!parsed || !(parsed.recursive && parsed.force)) return null;

    if (parsed.operands.length === 0) {
        if (foundIdx > 0 || tokens[0] === "xargs") {
            return {
                severity: "block",
                reason: "rm -rf detected with unresolvable targets (likely piped/stdin input)",
            };
        }
        return null;
    }
    for (const operand of parsed.operands) {
        const abs = resolveTarget(operand, ctx.projectDir, ctx.home);
        if (abs === null || !isWithinSafeZone(abs, ctx.projectDir, ctx.safeRelDirs)) {
            return {
                severity: "block",
                reason: `rm -rf targets path outside safe zones: ${operand}`,
            };
        }
    }
    return null;
}

/** BLOCK: find -delete / find -exec/-execdir rm — unconditional. */
function findDeleteRule(tokens: string[], _ctx: RuleCtx): Finding | null {
    if (basename(tokens[0]) !== "find") return null;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "-delete") {
            return {
                severity: "block",
                reason: "find -delete removes files; destructive action blocked",
            };
        }
        if ((t === "-exec" || t === "-execdir") && i + 1 < tokens.length) {
            if (basename(tokens[i + 1]) === "rm") {
                return {
                    severity: "block",
                    reason: "find -exec/-execdir rm removes files; destructive action blocked",
                };
            }
        }
    }
    return null;
}

/** WARN: destructive SQL drops. */
function sqlDropWarn(command: string, _tokens: string[], _ctx: RuleCtx): Finding | null {
    if (/\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i.test(command)) {
        return { severity: "warn", reason: "SQL DROP statement destroys data" };
    }
    return null;
}

/** WARN: git reset --hard (discards uncommitted work). */
function gitResetWarn(command: string, _tokens: string[], _ctx: RuleCtx): Finding | null {
    if (/\bgit\s+reset\s+--hard\b/.test(command)) {
        return { severity: "warn", reason: "git reset --hard discards uncommitted changes" };
    }
    return null;
}

/** WARN: git push --delete (removes a remote ref). */
function gitPushDeleteWarn(command: string, _tokens: string[], _ctx: RuleCtx): Finding | null {
    if (/\bgit\s+push\s+(?:[-\w]+\s+)*--delete\b/.test(command)) {
        return { severity: "warn", reason: "git push --delete removes a remote ref" };
    }
    return null;
}

/**
 * BLOCK: git push --force / -f.
 *
 * Skips global options via findGitSubcommand and catches bundled flags like
 * -uf via expandShortFlags. --force-with-lease is untouched because
 * expandShortFlags leaves long flags intact.
 */
function gitForcePushBlock(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const gitInfo = findGitSubcommand(tokens);
    if (gitInfo && gitInfo.subcmd === "push") {
        const expanded = gitInfo.rest.flatMap(expandShortFlags);
        if (expanded.includes("-f") || expanded.includes("--force")) {
            return { severity: "block", reason: "git push --force rewrites published history" };
        }
    }
    return null;
}

/**
 * BLOCK: --no-verify / scoped -n — prevents bypassing pre-commit, commit-msg,
 * and pre-push hooks. --no-verify is never legitimate for agent work, so it
 * blocks on any git command. -n means --no-verify ONLY on `git commit` (on
 * other commands -n is --dry-run/--no-commit/max-count and must not be
 * blocked). See ADR-0025.
 */
function gitNoVerifyBlock(_command: string, tokens: string[], _ctx: RuleCtx): Finding | null {
    const gitInfo = findGitSubcommand(tokens);
    if (gitInfo) {
        const expanded = gitInfo.rest.flatMap(expandShortFlags);
        if (
            expanded.includes("--no-verify") ||
            (gitInfo.subcmd === "commit" && expanded.includes("-n"))
        ) {
            return {
                severity: "block",
                reason: "--no-verify bypasses commit/push hooks (pre-commit, commit-msg, pre-push); local CI-parity checks must run",
            };
        }
    }
    return null;
}
```

> The mis-indented body and stray bare blocks (old lines 227-356) disappear with
> this rewrite. The `// BLOCK:`/`// WARN:` comments move into each rule's
> docblock. `classifyCommand` (empty-string contract + fail-closed catch) is
> unchanged.

- [ ] **Step 2: Run the characterization tests — expect PASS**

Run: `node --test tests/Node/safety-classify.test.ts`
Expected: all PASS — the refactor is behavior-identical.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0 (extension files currently fall outside tsconfig include —
this step is a no-op smoke check until Task 8).

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety/pre-tool-use.ts
git commit -S -m $'refactor(safety): split classifyCommandImpl into per-policy rules\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: A2 — extract `judgeToken` predicate

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts:238-274`

**Interfaces:**
- Consumes: unchanged `resolveOperand`, `sensitivePathMatch`, `isEnvExampleRef`,
  `SENSITIVE_FALLBACK_RE`, `setupScriptTrust`, `tokenizeCommand`, `tryUnwrapSegment`.
- Produces: `judgeToken(token: string, trustedSetup: boolean, opts: SensitivePathOptions): SensitiveMatch | null`.

- [x] **Step 1: Extract the predicate**

In `sensitive-paths.ts`, before `sensitiveOperandCheckImpl`, insert:

```ts
/**
 * Judge one command token against the deny floor (ADR-0047/0048 §5).
 *
 * Review follow-up (ADR-0048): the class-specific fallback runs against
 * tokens that resolve without a denied-class match (or that are
 * option-prefixed), so argv-prefix and glued-token forms
 * (-d@~/.ssh/id_rsa, @~/.ssh/id_rsa, user@host:~/.ssh/id_rsa,
 * --output=~/.aws/credentials) cannot bypass the deny floor.
 * .env.example references stay exempt (basename-scoped), and a
 * trusted-setup prism-user-manifest skip suppresses the fallback so
 * /setup scripts keep their narrow exception.
 */
function judgeToken(token: string, trustedSetup: boolean, opts: SensitivePathOptions): SensitiveMatch | null {
    const abs = token.startsWith("-") ? null : resolveOperand(token, opts);
    const match = abs === null ? null : sensitivePathMatch(abs, opts);
    if (match) {
        if (match.className === "prism-user-manifest" && trustedSetup) return null;
        return match;
    }
    if (!isEnvExampleRef(token) && SENSITIVE_FALLBACK_RE.test(token)) {
        return { className: "dynamic" };
    }
    return null;
}
```

- [x] **Step 2: Replace the inline token loop**

In `sensitiveOperandCheckImpl`, replace the whole token loop (the 9-line comment
plus the three-way ladder) with:

```ts
        for (const token of tokens) {
            const match = judgeToken(token, trustedSetup, opts);
            if (match) return match;
        }
```

- [x] **Step 3: Run the sensitive-paths tests — expect PASS**

Run: `node --test tests/Node/safety-sensitive-paths.test.ts`
Expected: all PASS.

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts
git commit -S -m $'refactor(safety): extract judgeToken predicate\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: A3 — shared `resolvePathToken` + single `MAX_UNWRAP_DEPTH`

**Files:**
- Modify: `packages/prism-core/extensions/safety/sensitive-paths.ts`
- Modify: `packages/prism-core/extensions/safety/pre-tool-use.ts`

**Interfaces:**
- Produces: `export function resolvePathToken(token: string, projectDir: string,
  home: string, opts?: { rejectAssignments?: boolean }): string | null` and
  `export const MAX_UNWRAP_DEPTH = 3` in `sensitive-paths.ts`; `resolveTarget` and
  `resolveOperand` become one-line delegates.

- [x] **Step 1: Add the shared resolver + export the depth constant**

In `sensitive-paths.ts`:
- Change `const MAX_UNWRAP_DEPTH = 3;` → `export const MAX_UNWRAP_DEPTH = 3;`
- Replace the `resolveOperand` function with:

```ts
/**
 * Resolve one command token to an absolute path, or null when it cannot be
 * resolved safely (metacharacters, or `=`-assignments when rejected).
 *
 * Shared by the bash classifier (pre-tool-use.ts) and the sensitive-path
 * check so quote-strip / ~-expand / bail semantics cannot drift between the
 * two gates (audit finding 5). `rejectAssignments` preserves resolveOperand's
 * historical `=` bail; the classifier's rm-operand path intentionally stays
 * `=`-tolerant.
 */
export function resolvePathToken(token: string, projectDir: string, home: string,
                                 opts: { rejectAssignments?: boolean } = {}): string | null {
    let p = token.trim();
    if (
        (p.startsWith('"') && p.endsWith('"')) ||
        (p.startsWith("'") && p.endsWith("'"))
    ) {
        p = p.slice(1, -1);
    }
    if (p.startsWith("~")) p = home + p.slice(1);
    if (opts.rejectAssignments && p.includes("=")) return null;
    if (/[*?$`(<]/.test(p)) return null;
    return normalize(resolvePath(projectDir, p));
}

function resolveOperand(token: string, opts: SensitivePathOptions): string | null {
    return resolvePathToken(token, opts.projectDir, opts.home, { rejectAssignments: true });
}
```

- [x] **Step 2: Update pre-tool-use.ts**

In `pre-tool-use.ts`:
- Change the import to:
  `import { tokenizeCommand, tryUnwrapSegment, resolvePathToken, MAX_UNWRAP_DEPTH } from "./sensitive-paths.ts";`
- Delete the local `const MAX_UNWRAP_DEPTH = 3;` (old line 59).
- Replace `resolveTarget` with:

```ts
function resolveTarget(token: string, projectDir: string, home: string): string | null {
    return resolvePathToken(token, projectDir, home);
}
```

- [x] **Step 3: Run the full node suite — expect PASS**

Run: `npm run test:node`
Expected: all PASS (classify + sensitive-paths + breaker + existing JS tests).

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety/sensitive-paths.ts packages/prism-core/extensions/safety/pre-tool-use.ts
git commit -S -m $'refactor(safety): share path-token resolution and unwrap depth\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 7: A4 — delete dead `DenialOutcomeTracker` code

**Files:**
- Modify: `packages/prism-core/extensions/safety/denial-circuit-breaker.ts:146-364`

**Interfaces:**
- Consumes: nothing (verified dead — zero references in the repo, including tests).
- Produces: `denial-circuit-breaker.ts` exports only `DenialCircuitBreakerOptions`,
  `DenialObservation`, `DenialCircuitBreaker`.

- [x] **Step 1: Verify dead code**

Run: `grep -rn "DenialOutcomeTracker\|ToolCallSnapshot" packages/ tests/ --include="*.ts" | grep -v denial-circuit-breaker.ts`
Expected: no output (exit 1).

- [x] **Step 2: Delete the dead block**

Delete everything in `denial-circuit-breaker.ts` after the `DenialCircuitBreaker`
class's closing brace (line 145) and before the trailing blank lines + vim
modeline — i.e. the `ToolCallSnapshot` docblock/interface,
`DenialOutcomeTrackerOptions`, and the `DenialOutcomeTracker` class (~215 lines).

- [x] **Step 3: Run the full node suite — expect PASS**

Run: `npm run test:node`
Expected: all PASS, including `safety-circuit-breaker.test.ts`.

- [x] **Step 4: Commit**

```bash
git add packages/prism-core/extensions/safety/denial-circuit-breaker.ts
git commit -S -m $'refactor(safety): drop dead DenialOutcomeTracker code\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 8: C1 — make `tsc --noEmit` cover the extension and tests

**Files:**
- Modify: `tsconfig.json` (`include`)

- [x] **Step 1: Extend tsconfig include**

> Deviation (spec risk clause): `index.ts` is excluded — it imports the pi SDK
> (`@earendil-works/pi-coding-agent`, declared but not installed locally; types
> resolve via the global pi store at runtime). The three pure modules + tests
> are explicitly included instead of the `**/*.ts` glob.

In `tsconfig.json`, add to `include`:

```json
"packages/prism-core/extensions/**/*.ts",
"tests/Node/*.test.ts",
```

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0. **If latent type errors surface:** fix them forward in the
same commit (they are pre-existing, now exposed); if they balloon beyond a few
lines, halt and re-plan with the user (spec risk clause).

- [x] **Step 3: Run the full node suite — expect PASS**

Run: `npm run test:node`
Expected: all PASS.

- [x] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -S -m $'chore(tsc): type-check safety extension and node tests\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 9: B1 — shim `.github/scripts/coverage-gate.php` to the canonical copy

**Files:**
- Replace: `.github/scripts/coverage-gate.php` (331 lines → 8 lines)

**Interfaces:**
- Consumes: canonical `packages/prism-php-web/scripts/coverage-gate.php` (its
  `COVERAGE_GATE_AS_LIBRARY` guard + `exit(main($argc, $argv));` run at require
  time).
- Produces: identical CLI contract for CI (`ci.yml:246`) and
  `tests/Shell/coverage_gate_test.sh:20` — both invoke `.github/scripts/coverage-gate.php`.

- [x] **Step 1: Replace the duplicate with a shim**

`.github/scripts/coverage-gate.php` becomes:

```php
<?php

declare(strict_types=1);

/*
 * Shim to the canonical package copy (packages/prism-php-web/scripts/).
 * The canonical file's COVERAGE_GATE_AS_LIBRARY guard + exit(main(...))
 * run at require time, so behavior is byte-identical to invoking it
 * directly. Keep the canonical copy the single source of truth.
 * The pre-commit hook inserts the RCS header (ADR-0041).
 */
require __DIR__ . '/../../packages/prism-php-web/scripts/coverage-gate.php';

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run the shell test suite**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: all tests PASS (it drives `.github/scripts/coverage-gate.php`).

- [x] **Step 3: Byte-diff both entry points on a fixture**

```bash
mkdir -p /tmp/cg-fixture/src
printf '<?php echo 1;' > /tmp/cg-fixture/src/app.php
cat > /tmp/cg-fixture/clover.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<coverage generated="1">
  <project timestamp="1">
    <file name="/tmp/cg-fixture/src/app.php">
      <line type="stmt" num="1" count="5" />
      <line type="stmt" num="2" count="5" />
    </file>
  </project>
</coverage>
EOF
printf 'src/app.php\n' | php .github/scripts/coverage-gate.php /tmp/cg-fixture/clover.xml --root=/tmp/cg-fixture > /tmp/out-ci.txt
printf 'src/app.php\n' | php packages/prism-php-web/scripts/coverage-gate.php /tmp/cg-fixture/clover.xml --root=/tmp/cg-fixture > /tmp/out-pkg.txt
diff /tmp/out-ci.txt /tmp/out-pkg.txt && echo BYTE-IDENTICAL
```

Expected: `BYTE-IDENTICAL` and both runs exit 0 with a PASS line.

- [x] **Step 4: Commit**

```bash
git add .github/scripts/coverage-gate.php
git commit -S -m $'refactor(ci): shim coverage-gate to the canonical package copy\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 10: B2 — extract `print_report` from `main()`

**Files:**
- Modify: `packages/prism-php-web/scripts/coverage-gate.php:263-328`

**Interfaces:**
- Consumes: `classify_changed_files` result shape
  `array{passed:list, failed:list, warned:list, skipped:list}` and `exit_code_for`.
- Produces: `print_report(array $result, int $min): void` with byte-identical output.

- [x] **Step 1: Extract the printer**

In `packages/prism-php-web/scripts/coverage-gate.php`, add before `main()`:

```php
/**
 * Print the per-file coverage gate report.
 *
 * Output format is part of the CLI contract (asserted by
 * tests/Shell/coverage_gate_test.sh) and must stay byte-identical.
 *
 * @param array{passed:list, failed:list, warned:list, skipped:list} $result
 * @param int $min
 * @return void
 */
function print_report(array $result, int $min): void
{
    echo "Changed-file coverage gate (min {$min}%):\n\n";
    printf("  %-55s %8s   %s\n", 'File', 'Coverage', 'Gate');
    foreach ($result['passed'] as [$f, $pct, $c, $t]) {
        printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'PASS', $c, $t);
    }
    foreach ($result['failed'] as [$f, $pct, $c, $t]) {
        printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'FAIL', $c, $t);
    }
    foreach ($result['warned'] as [$f, $reason]) {
        fwrite(STDERR, sprintf("  %-55s %8s   %s  (%s)\n", $f, '-', 'WARN', $reason));
    }
    foreach ($result['skipped'] as [$f, $reason]) {
        printf("  %-55s %8s   %s  (%s)\n", $f, '-', 'SKIP', $reason);
    }
    echo "\n";
}
```

- [x] **Step 2: Slim `main()`**

Replace the header echo + four print loops in `main()` with:

```php
    print_report($result, $min);
```

- [x] **Step 3: Verify byte-identical output**

Run: `bash tests/Shell/coverage_gate_test.sh` — all PASS.
Then re-run Task 9's Step 3 fixture byte-diff (both entry points) — `BYTE-IDENTICAL`.

- [x] **Step 4: Commit**

```bash
git add packages/prism-php-web/scripts/coverage-gate.php
git commit -S -m $'refactor(tooling): extract print_report from coverage-gate main\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 11: C2 — warn-level eslint complexity rules for TypeScript

**Files:**
- Modify: `package.json` (devDependencies), `eslint.config.mjs`,
  `.github/workflows/ci.yml`

**Gate:** registry access (npm view / npm install) is a consent boundary — get
human approval before Step 1.

- [x] **Step 1: Compatibility check (human approval first)**

> **DROPPED (drop-gate):** `typescript-eslint@8.67.0` peers require
> `typescript >=4.8.4 <6.1.0`; the repo pins `^7.0.2` (Go-native compiler).
> No version supports TS 7. Installing would break the peer contract or need
> `--legacy-peer-deps`. Per the spec risk clause, C2 is dropped: the A
> refactor removed the offenders and C1 restored tsc coverage.

Run: `npm view typescript-eslint@latest peerDependencies --json`
Expected: a version whose eslint peer range includes 10.x, compatible with the
installed `typescript` (^7.0.2) and eslint 10.8.1. **If none exists, stop here,
report, and drop this task** (spec risk clause) — do not downgrade eslint.

- [x] ~~**Step 2: Install the dev dependency**~~ (skipped — C2 dropped)

Run: `npm install --save-dev typescript-eslint`
Expected: lockfile + package.json updated; commit the lockfile.

- [x] ~~**Step 3: Add the TS block to eslint.config.mjs**~~ (skipped — C2 dropped)

Add `import tseslint from "typescript-eslint";` at the top, and a new config
object:

```js
{
    files: ["packages/**/*.ts", "tests/Node/**/*.ts"],
    languageOptions: {
        parser: tseslint.parser,
        globals: {
            Buffer: "readonly",
            process: "readonly",
            console: "readonly",
            __dirname: "readonly",
            module: "readonly",
            require: "readonly",
        },
    },
    rules: {
        complexity: ["warn", 12],
        "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
        "max-depth": ["warn", 4],
        "no-unused-vars": "warn",
    },
},
```

- [x] ~~**Step 4: Extend the CI eslint step**~~ (skipped — C2 dropped)

In `.github/workflows/ci.yml`:
- `hashFiles` guard: add `'packages/**/*.ts', 'tests/Node/**/*.ts'`
- eslint globs: add `"packages/**/*.ts" "tests/Node/**/*.ts"`

- [x] ~~**Step 5: Verify**~~ (skipped — C2 dropped)

Run: `npx eslint "packages/**/*.ts" "tests/Node/**/*.ts" --no-error-on-unmatched-pattern`
Expected: exits 0 with at most warn-level output (the refactored extension must
be under the thresholds after Tasks 4-7).

Run: `npm run test:node` and `npx tsc --noEmit` — both PASS.

- [x] ~~**Step 6: Commit**~~ (skipped — C2 dropped)

```bash
git add package.json package-lock.json eslint.config.mjs .github/workflows/ci.yml
git commit -S -m $'chore(lint): add warn-level complexity rules for TypeScript\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

## Final verification (after Task 11)

1. `npm run test:node` — full node suite green.
2. `npx tsc --noEmit` — green, now actually covering the extension.
3. `bash tests/Shell/coverage_gate_test.sh` — green.
4. `npx eslint "packages/**/*.ts" "tests/Node/**/*.ts"` — no errors.
5. `/check-php` (full adapter gate) and `code-review` before the human pushes.
