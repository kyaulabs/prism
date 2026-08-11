# Redaction-Safe Manifest Presence Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix issue #299 by letting human-invoked `/setup` determine whether a resolved MCP prerequisite is present without exposing its value or weakening existing `env.*` redaction.

**Architecture:** Add a generic `present PROJECT USER_OR_DASH DOT_PATH` operation at the existing Prism manifest CLI boundary. It emits one Boolean bit (`true` or `false`) from the resolved project/user snapshot, while the sensitive-path plugin grants the user-manifest exception only to direct, exact-shape `present … env.*` invocations. `/setup` consumes and validates those literals before writing integration preferences.

**Tech Stack:** PHP 8.5, Pest 4/PHPUnit 12, Bash, TypeScript, Node test runner, OpenCode plugin hooks.

## Global constraints

- Issue #299 is classified `Security`; use `fix` commits and the `fix/…` branch prefix.
- Preserve the existing uncommitted seven-test `describe('prism_manifest present', …)` Red baseline in `tests/Unit/Harness/PrismManifestCliTest.php`; do not replace or discard it.
- `cmd_get()` and `cmd_values0()` must continue returning `[redacted]` for every `env.*` lookup. Do not change `env0`, `PRISM_ENV_MAP`, `PrismOpenCodeConfig`, or its 22-pair framing.
- `present` stdout is exactly `true` or `false`, without a value, prefix, length, path, diagnostic, or trailing newline.
- Presence truth table: absent/null, empty string, and Boolean false → `false`; non-empty string, Boolean true, and every integer/float including numeric `0` → `true`; arrays/objects → exit 1 with empty stdout; invalid arity → exit 2.
- The CLI operation is generic, but the sensitive-path exception trusts it only for direct depth-0 argv shaped exactly as `present PROJECT USER_OR_DASH env.*`. Broad `env.*` trust is an explicit human decision recorded by ADR-0053.
- Existing `get`/`validate` plugin trust stays unchanged. `env0`, `values0`, and `decode` remain untrusted.
- Never access a real user Prism manifest or credential. Tests use temporary fake homes and synthetic canary values only.
- No new dependencies, schema changes, generated assets, or external APIs.
- Load the `rcs-header` skill before changing PHP, TypeScript, or shell sources; preserve each existing RCS header and vim modeline.
- Plan approval accepts the complete ADR-0053 text below. Write that accepted ADR before editing implementation code, satisfying the architecture gate `ADR-required: 0053`.
- Restart OpenCode after the plugin and command changes; configuration-time files are not hot-reloaded.

---

### Task 1: Record and implement the redaction-safe presence operation

**Files:**
- Create: `adr/0053-prism-present-subcommand-trust.md`
- Modify: `.github/scripts/prism_manifest.php:15-27,153-185,315,873`
- Modify: `tests/Unit/Harness/PrismManifestCliTest.php:989-1089,1631-1655`
- Modify: `tests/Shell/prism_manifest_integration_test.sh:1243`
- Track: `docs/plans/2026-08-11-redaction-safe-manifest-presence.md`

**Interfaces:**
- Consumes: `pm_load_resolved(string $projectFile, string $userDash): array`, `pm_resolve_dot(array $root, string $dotPath): mixed`, and `PrismCliResult`.
- Produces: `cmd_present(array $argv): PrismCliResult`, `pm_presence_bool(mixed $value): bool`, and CLI syntax `present PROJECT USER_OR_DASH DOT_PATH`.

- [ ] **Step 1: Write accepted ADR-0053 before implementation**

Create `adr/0053-prism-present-subcommand-trust.md` with this complete content:

```markdown
# 0053. Present-Subcommand Trust for the Prism Manifest CLI

Date: 2026-08-11

## Status

Accepted

## Context

Human-invoked `/setup` reports both requested and active states for optional
MCP integrations. Active state depends on whether the resolved user-tier
`env.deepseek_api_key` or `env.searxng_url` prerequisite is non-empty.

ADR-0047 requires `prism_manifest.php get` and `values0` to return the literal
`[redacted]` for every `env.*` path, including an empty value. This prevents
secret output but makes empty and populated prerequisites indistinguishable.
The `env0` operation retains the distinction by emitting values and is
therefore forbidden to agents. Reading storage directly would bypass the
manifest boundary and the trusted `/setup` exception.

A Boolean presence operation discloses one bit of metadata. It must never
emit a value, prefix, length, path, or value-derived diagnostic. Trusting the
operation by subcommand name alone would also make arbitrary invocation shapes
eligible for the prism-user-manifest exception.

## Decision

We add `present PROJECT USER_OR_DASH DOT_PATH` to the Prism manifest CLI. It
loads one resolved project/user snapshot and emits exactly `true` or `false`.
Absent/null, the empty string, and Boolean false emit `false`; a non-empty
string, Boolean true, and every number including numeric zero emit `true`.
Arrays and objects fail closed with exit 1 and empty stdout. Invalid arity
exits 2. Existing `get`/`values0` redaction and `env0` behavior do not change.

We add `present` to the setup trust set only for direct depth-0 argv shaped
exactly as `present PROJECT USER_OR_DASH env.*`. No option or assignment token
may appear between `prism_manifest.php` and `present`. The project argument
must be path-shaped; the user argument must be path-shaped or `-`; the dot
path may be any path beginning `env.`; no extra argument is accepted. Every
other `present` shape is `untrusted-subcommand`. Existing `get` and `validate`
trust does not change, and `env0`, `values0`, and `decode` remain untrusted.

The broad `env.*` prefix is deliberate: future setup-managed integration
prerequisites can use the same one-bit operation without widening plugin code
for each new key. Exact arity, path-shaped operands, invocation depth, scalar
fail-closed behavior, and Boolean-only output bound that future-facing trust.

`/setup` uses `present` for MCP prerequisites, accepts only literal `true` or
`false`, and aborts before writing when the command fails or emits anything
else. It computes active state as requested state AND literal presence.

This decision partially supersedes only ADR-0047 §4 and ADR-0048 §2 where
they limit trusted Prism manifest operations to `get` and `validate`. Their
remaining sensitive-path and invocation-scope decisions stay in force.

## Consequences

- `/setup` accurately distinguishes empty and populated MCP prerequisites.
- Secret values never enter the model-facing command output or setup report.
- The presence operation deliberately exposes one Boolean bit for any scalar
  `env.*` path when invoked through the exact trusted setup shape.
- New setup-managed `env.*` prerequisites do not require another plugin trust
  change.
- The matcher, CLI, setup command, living security documentation, and canary
  tests must evolve together.
- OpenCode must restart before the plugin and command changes take effect.

## Alternatives Considered

### Trust `present` by subcommand name alone

Rejected because arbitrary argument shapes would receive the
prism-user-manifest exception.

### Allow only the two current MCP prerequisite paths

Rejected by the human decision maker in favor of broad `env.*` trust so future
setup-managed prerequisites do not require plugin changes. The exact argv
shape and one-bit output remain mandatory.

### Reuse `get`, `values0`, or `env0`

Rejected because `get` and `values0` intentionally conflate empty and set
`env.*` values as `[redacted]`, while `env0` emits secret-bearing values and is
forbidden to agents.

### Read the user manifest directly

Rejected because it bypasses the shared manifest validation/resolution
boundary and violates the sensitive-path deny floor.
```

Run:

```bash
test -f adr/0053-prism-present-subcommand-trust.md
```

Expected: exit 0. Do not edit implementation code until the accepted ADR exists.

- [ ] **Step 2: Extend the existing Red contract without discarding it**

Keep all seven pre-seeded tests. Inside `describe('prism_manifest present', …)`, add numeric-zero coverage immediately before the wrong-arity test:

```php
    it('reports true for a numeric zero in a user overlay', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 6, "retry_count": 0 }');

        try {
            [$code, $stdout] = pm_dispatch(['present', $project, $user, 'retry_count']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('true');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });
```

Add both exact-arity guards to the malformed command dataset:

```php
        'values0 arity' => [['values0', 'x', '-']],
        'present arity' => [['present', 'x', '-']],
        'present extra' => [['present', 'x', '-', 'p', 'extra']],
        'patch arity' => [['patch', 'x']],
```

The arity rows pass while the command is unknown; the semantic tests carry the Red signal.

- [ ] **Step 3: Add the real-process shell canary while still Red**

Immediately after Test 9's existing env-redaction invocation, add this Test 9b block to `tests/Shell/prism_manifest_integration_test.sh`:

```bash
# ── Test 9b: present reports env.* presence without leaking values ─────────

test_present_command() {
	local project_root fake_home manifest user_manifest present_canary
	local present_out present_err arity_rc scalar_rc failures
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	make_project_root "$project_root"
	make_user_home "$fake_home"
	write_default_project_manifest "$project_root"
	manifest="$project_root/prism.jsonc"
	user_manifest="$fake_home/.config/opencode/prism.jsonc"
	present_canary="sk-live-PRESENT-CANARY-3b6d9c1e-DO_NOT_LEAK"

	cat > "$user_manifest" <<'JSON'
{
  "setup_version": 6,
  "env": {
    "deepseek_api_key": "sk-live-PRESENT-CANARY-3b6d9c1e-DO_NOT_LEAK"
  }
}
JSON

	present_out=$(mktemp)
	present_err=$(mktemp)
	register_temp_dir "$present_out"
	register_temp_dir "$present_err"
	failures=0

	if php "$MANIFEST_CLI" present "$manifest" "$user_manifest" env.deepseek_api_key >"$present_out" 2>"$present_err"; then
		if [ "$(cat "$present_out")" != "true" ]; then
			echo "  present set — got '$(cat "$present_out")' want 'true'" >&2
			failures=$((failures+1))
		fi
		if grep -qF "$present_canary" "$present_out" "$present_err"; then
			echo "  present set — canary leaked to a result stream" >&2
			failures=$((failures+1))
		fi
	else
		echo "  present set — exited non-zero: $(cat "$present_err")" >&2
		failures=$((failures+1))
	fi

	if php "$MANIFEST_CLI" present "$manifest" - env.deepseek_api_key >"$present_out" 2>"$present_err"; then
		if [ "$(cat "$present_out")" != "false" ]; then
			echo "  present empty — got '$(cat "$present_out")' want 'false'" >&2
			failures=$((failures+1))
		fi
	else
		echo "  present empty — exited non-zero: $(cat "$present_err")" >&2
		failures=$((failures+1))
	fi

	set +e
	php "$MANIFEST_CLI" present "$manifest" - >"$present_out" 2>"$present_err"
	arity_rc=$?
	php "$MANIFEST_CLI" present "$manifest" - models >"$present_out" 2>"$present_err"
	scalar_rc=$?
	set -e

	if [ "$arity_rc" -ne 2 ]; then
		echo "  present arity — got rc $arity_rc want 2" >&2
		failures=$((failures+1))
	fi
	if [ "$scalar_rc" -ne 1 ]; then
		echo "  present non-scalar — got rc $scalar_rc want 1" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "present — true/false only, no canary leakage, fail-closed errors"
	else
		fail "present — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 9b: present reports env.* presence without leaking values ──"
test_present_command
```

- [ ] **Step 4: Run the focused tests and observe Red**

Run:

```bash
php vendor/bin/pest --no-coverage tests/Unit/Harness/PrismManifestCliTest.php --filter='prism_manifest present'
bash tests/Shell/prism_manifest_integration_test.sh
```

Expected: the presence semantic tests fail because dispatch reports `unknown command: present`; the shell suite reports only the new presence test failing. Existing redaction tests remain green.

- [ ] **Step 5: Implement the minimal CLI operation**

Change the file header from “Ten commands” to “Eleven commands” and add:

```text
 *   present PROJECT USER_OR_DASH DOT_PATH
```

Add `present` to the dispatch table and match:

```php
    $known = [
        'decode' => 1, 'validate' => 1, 'env0' => 1, 'get' => 1, 'values0' => 1,
        'present' => 1, 'patch' => 1, 'upgrade-v6' => 1, 'migrate-preview' => 1,
        'migrate' => 1, 'check-secrets' => 1,
    ];
```

```php
            'values0' => cmd_values0($argv),
            'present' => cmd_present($argv),
            'patch' => cmd_patch($argv, $stdin),
```

Add after `cmd_values0()`:

```php
/**
 * Report whether a resolved path is present without emitting its value.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_present(array $argv): PrismCliResult
{
    if (count($argv) !== 5) {
        return new PrismCliResult(2, stderr: 'prism_manifest: present requires PROJECT USER_OR_DASH DOT_PATH');
    }

    [, , $projectFile, $userDash, $dotPath] = $argv;
    $resolved = pm_load_resolved($projectFile, $userDash);

    return new PrismCliResult(0, stdout: pm_presence_bool(pm_resolve_dot($resolved, $dotPath)) ? 'true' : 'false');
}
```

Add after `pm_scalar_to_string()`:

```php
/**
 * Determine presence using the ADR-0053 scalar truth table.
 *
 * @param  mixed $value
 * @return bool
 * @throws PrismJsoncException When the value is an object or array.
 */
function pm_presence_bool(mixed $value): bool
{
    if ($value === null) {
        return false;
    }

    if (is_bool($value)) {
        return $value;
    }

    if (is_string($value)) {
        return $value !== '';
    }

    if (is_int($value) || is_float($value)) {
        return true;
    }

    throw new PrismJsoncException('value is not a scalar');
}
```

Do not touch `cmd_get()`, `cmd_values0()`, or `cmd_env0()`.

- [ ] **Step 6: Run Green verification and commit the slice**

Run:

```bash
php vendor/bin/pest --no-coverage tests/Unit/Harness/PrismManifestCliTest.php
bash tests/Shell/prism_manifest_integration_test.sh
php vendor/bin/php-cs-fixer fix --dry-run --diff .github/scripts/prism_manifest.php tests/Unit/Harness/PrismManifestCliTest.php
```

Expected: Pest passes all manifest CLI tests (including numeric zero and unchanged `get`/`values0` redaction); the shell suite passes all existing tests plus Test 9b; PHP CS Fixer reports no changes required.

Commit:

```bash
SIGNED_OFF_BY=$(bash .github/scripts/resolve-identity.sh)
git add adr/0053-prism-present-subcommand-trust.md docs/plans/2026-08-11-redaction-safe-manifest-presence.md .github/scripts/prism_manifest.php tests/Unit/Harness/PrismManifestCliTest.php tests/Shell/prism_manifest_integration_test.sh
git commit -S -m $'fix(security): add redaction-safe manifest presence\n\nRefs: #299\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNED_OFF_BY"
```

---

### Task 2: Enforce exact argv-shaped `env.*` trust

**Files:**
- Modify: `.opencode/plugins/sensitive-paths.ts:50,192-214`
- Modify: `tests/Plugin/sensitive-paths.test.ts:179`

**Interfaces:**
- Consumes: CLI syntax `present PROJECT USER_OR_DASH DOT_PATH` from Task 1 and the existing `setupScriptTrust(tokens, opts, depth)` trust result.
- Produces: direct depth-0 trust for any exact-shape `present PROJECT USER_OR_DASH env.*` invocation; all malformed, wrapped, or non-`env.*` forms return `untrusted-subcommand`.

- [ ] **Step 1: Add failing plugin trust tests**

Append this test block after the existing ADR-0048 invocation-scope tests:

```ts
describe("prism_manifest.php present trust is argv-shaped (ADR-0053)", () => {
    it("trusts the exact present PROJECT USER_OR_DASH env.* shape", () => {
        assert.equal(
            sensitiveOperandCheck(
                "php .github/scripts/prism_manifest.php present prism.jsonc ~/.config/opencode/prism.jsonc env.deepseek_api_key",
                OPTS,
            ),
            null,
        );
        assert.equal(
            sensitiveOperandCheck(
                "php .github/scripts/prism_manifest.php present prism.jsonc ~/.config/opencode/prism.jsonc env.future_provider_token",
                OPTS,
            ),
            null,
        );
    });

    it("blocks present with a non-env.* dot path", () => {
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present prism.jsonc - models.primary", OPTS));
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present prism.jsonc - setup_version", OPTS));
    });

    it("blocks present with wrong arity", () => {
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present prism.jsonc -", OPTS));
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present prism.jsonc - env.deepseek_api_key extra", OPTS));
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present", OPTS));
    });

    it("blocks present with option-shaped project or user arguments", () => {
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present - prism.jsonc env.deepseek_api_key", OPTS));
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php present prism.jsonc -x env.deepseek_api_key", OPTS));
    });

    it("blocks option or assignment tokens before present", () => {
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php --ignored present prism.jsonc - env.deepseek_api_key", OPTS));
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php X=1 present prism.jsonc - env.deepseek_api_key", OPTS));
    });

    it("blocks wrapped present invocations", () => {
        assert.ok(sensitiveOperandCheck('sh -c "php prism_manifest.php present prism.jsonc - env.deepseek_api_key"', OPTS));
        assert.ok(sensitiveOperandCheck("env X=1 php .github/scripts/prism_manifest.php present prism.jsonc - env.deepseek_api_key", OPTS));
    });

    it("preserves the existing trusted and untrusted subcommands", () => {
        assert.equal(sensitiveOperandCheck("php .github/scripts/prism_manifest.php get prism.jsonc - app", OPTS), null);
        assert.equal(sensitiveOperandCheck("php .github/scripts/prism_manifest.php validate prism.jsonc project", OPTS), null);
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php env0 prism.jsonc", OPTS));
        assert.ok(sensitiveOperandCheck("php .github/scripts/prism_manifest.php values0 prism.jsonc - app env.deepseek_api_key", OPTS));
    });
});
```

- [ ] **Step 2: Run the plugin tests and observe Red**

Run:

```bash
npm run test:plugin
```

Expected: exact-shape calls carrying the synthetic user-manifest operand fail because `present` is not yet trusted; existing tests remain green.

- [ ] **Step 3: Implement the minimal trust guard**

Extend the trusted set:

```ts
const TRUSTED_PM_SUBCOMMANDS = new Set(["get", "validate", "present"]);
```

Replace only the `prism_manifest.php` branch in `setupScriptTrust()` with:

```ts
        if (name === "prism_manifest.php") {
            let j = i + 1;
            while (j < tokens.length && (tokens[j].startsWith("-") || tokens[j].includes("="))) j++;
            if (j >= tokens.length || !TRUSTED_PM_SUBCOMMANDS.has(tokens[j])) return "untrusted-subcommand";
            if (tokens[j] === "present") {
                const shapeOk =
                    j === i + 1 &&
                    tokens.length === j + 4 &&
                    !tokens[j + 1].startsWith("-") &&
                    !tokens[j + 1].includes("=") &&
                    (tokens[j + 2] === "-" ||
                        (!tokens[j + 2].startsWith("-") && !tokens[j + 2].includes("="))) &&
                    tokens[j + 3].startsWith("env.");
                if (!shapeOk) return "untrusted-subcommand";
            }
        }
```

Do not alter the depth check, sensitive-class matching, wrapper handling, or existing `get`/`validate` branch behavior.

- [ ] **Step 4: Run Green verification and commit the slice**

Run:

```bash
npm run test:plugin
npx tsc --noEmit
```

Expected: all plugin tests pass and TypeScript reports no errors.

Commit:

```bash
SIGNED_OFF_BY=$(bash .github/scripts/resolve-identity.sh)
git add .opencode/plugins/sensitive-paths.ts tests/Plugin/sensitive-paths.test.ts
git commit -S -m $'fix(security): constrain manifest presence trust\n\nRefs: #299\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNED_OFF_BY"
```

---

### Task 3: Consume presence safely in `/setup` and align security documentation

**Files:**
- Modify: `.opencode/commands/setup.md:258-317`
- Modify: `tests/Unit/Harness/SetupCommandPrismManifestTest.php:314`
- Modify: `.opencode/skills/credential-protection/SKILL.md:58-61`
- Modify: `adr/0047-sensitive-path-enforcement.md:5-8` (Status section only)
- Modify: `adr/0048-sensitive-path-enforcement-corrections.md:5-8` (Status section only)
- Modify: `CONTEXT.md:45,225-230`

**Interfaces:**
- Consumes: literal `true`/`false` output from Task 1 and exact-shape trust from Task 2.
- Produces: fail-closed `/setup` prerequisite capture and `active = requested AND presence` reporting, plus living documentation aligned with ADR-0053.

- [ ] **Step 1: Add failing `/setup` contract tests**

Inside the existing `/setup` Prism manifest contract describe block, add:

```php
it('reads MCP prerequisites via present and never get env.*', function (): void {
    $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");

    Assert::assertStringContainsString(
        'prism_manifest.php present "$PROJECT" "$USER_ARG" env.deepseek_api_key',
        $togglesSection,
    );
    Assert::assertStringContainsString(
        'prism_manifest.php present "$PROJECT" "$USER_ARG" env.searxng_url',
        $togglesSection,
    );
    Assert::assertStringNotContainsString(
        'get "$PROJECT" "$USER_ARG" env.',
        $togglesSection,
    );
});

it('validates presence literals and fails closed before writing', function (): void {
    $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");

    Assert::assertStringContainsString('true|false', $togglesSection);
    Assert::assertStringContainsString('aborting', $togglesSection);
    Assert::assertStringContainsString('no write performed', $togglesSection);
});

it('computes active state from literal presence booleans', function (): void {
    $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");

    Assert::assertStringContainsString(
        'active = requested AND DS_PRESENT=true',
        $togglesSection,
    );
    Assert::assertStringContainsString(
        'active = requested AND SX_PRESENT=true',
        $togglesSection,
    );
    Assert::assertStringContainsString('[ "$DS_PRESENT" = "true" ]', $togglesSection);
    Assert::assertStringContainsString('[ "$SX_PRESENT" = "true" ]', $togglesSection);
});
```

- [ ] **Step 2: Run the setup contract test and observe Red**

Run:

```bash
php vendor/bin/pest --no-coverage tests/Unit/Harness/SetupCommandPrismManifestTest.php
```

Expected: the new assertions fail because §3.5 still uses `get` and value non-emptiness.

- [ ] **Step 3: Replace prerequisite capture with fail-closed Boolean capture**

In `.opencode/commands/setup.md` §3.5, replace the two `get env.*` reads with:

```bash
# Read prerequisites as presence booleans for the active-state report.
if ! DS_PRESENT=$(php .github/scripts/prism_manifest.php present "$PROJECT" "$USER_ARG" env.deepseek_api_key); then
    echo "✗ cannot determine DEEPSEEK_API_KEY presence; aborting /setup (no write performed)" >&2
    exit 1
fi
if ! SX_PRESENT=$(php .github/scripts/prism_manifest.php present "$PROJECT" "$USER_ARG" env.searxng_url); then
    echo "✗ cannot determine SEARXNG_URL presence; aborting /setup (no write performed)" >&2
    exit 1
fi
case "$DS_PRESENT" in
    true|false) ;;
    *) echo "✗ cannot determine DEEPSEEK_API_KEY presence; aborting /setup (no write performed)" >&2; exit 1 ;;
esac
case "$SX_PRESENT" in
    true|false) ;;
    *) echo "✗ cannot determine SEARXNG_URL presence; aborting /setup (no write performed)" >&2; exit 1 ;;
esac
```

Keep these reads before the toggle writer so every failure leaves the user manifest unchanged.

Replace the report instructions with:

```markdown
After writing, report requested preferences with prerequisite gating without
printing key or URL values. Compute active state from the literal presence
booleans captured before the write:

- deepseek-websearch: `active = requested AND DS_PRESENT=true`
- SearXNG: `active = requested AND SX_PRESENT=true`

Compare with `[ "$DS_PRESENT" = "true" ]` and
`[ "$SX_PRESENT" = "true" ]`; never test string emptiness because the literal
`false` is non-empty. A requested MCP whose presence literal is `false` remains
inactive and includes the existing missing-prerequisite parenthetical. When
the literal is `true`, report `active=true` and omit that parenthetical.
```

- [ ] **Step 4: Align accepted-ADR status and living security documentation**

Do not edit the Context, Decision, Consequences, or Alternatives bodies of ADR-0047 or ADR-0048. Under each `## Status`, preserve the current status and add this narrow supersession note:

```markdown
ADR-0053 partially supersedes only the get/validate-only trusted-subcommand
clause by adding exact argv-shaped `present PROJECT USER_OR_DASH env.*` trust.
```

Replace the trusted manifest paragraph in `.opencode/skills/credential-protection/SKILL.md` with:

```markdown
`prism_manifest.php` is trusted only for the `get`/`validate` subcommands and
the `present` subcommand in the exact argv shape
`present PROJECT USER_OR_DASH env.*` (ADR-0053) — never `env0`/`values0`/
`decode`, whose stdout can carry secrets. `present` prints only `true` or
`false`, never the value; any other `present` shape is untrusted. All other
path classes remain enforced for setup scripts.
```

Extend the `sensitive path` glossary entry in `CONTEXT.md` to state:

```markdown
The trusted `/setup` boundary permits `prism_manifest.php` at invocation depth
0 only for `get`, `validate`, and exact argv-shaped
`present PROJECT USER_OR_DASH env.*` (ADR-0047, ADR-0048, ADR-0053).
```

Append this accepted-ADR index entry:

```markdown
- `adr/0053-prism-present-subcommand-trust.md` — Add a Boolean-only Prism manifest presence operation and trust it for the `/setup` prism-user-manifest exception only as exact-shape `present PROJECT USER_OR_DASH env.*`, partially superseding ADR-0047 §4 and ADR-0048 §2
```

- [ ] **Step 5: Run Green verification and the security contract checks**

Run:

```bash
php vendor/bin/pest --no-coverage tests/Unit/Harness/SetupCommandPrismManifestTest.php
php vendor/bin/pest --no-coverage tests/Unit/Harness/PrismManifestDocsTest.php
bash .github/scripts/validate-harness.sh
php vendor/bin/pest --no-coverage tests/Unit/Harness/PrismManifestCliTest.php
bash tests/Shell/prism_manifest_integration_test.sh
npm run test:plugin
npx tsc --noEmit
```

Expected: all commands pass; validation still reports the sensitive-path contract intact; existing `get`/`values0` redaction regressions remain green.

- [ ] **Step 6: Run coverage and final local gate**

Run:

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: all tests pass and changed files satisfy the 80% line-coverage gate.

Then run `/check`. Expected: PHP CS Fixer, Stylelint, ESLint, Pest, shell checks, and coverage all pass. Do not claim completion from focused tests alone.

- [ ] **Step 7: Commit the completed fix**

```bash
SIGNED_OFF_BY=$(bash .github/scripts/resolve-identity.sh)
git add .opencode/commands/setup.md tests/Unit/Harness/SetupCommandPrismManifestTest.php .opencode/skills/credential-protection/SKILL.md adr/0047-sensitive-path-enforcement.md adr/0048-sensitive-path-enforcement-corrections.md CONTEXT.md
git commit -S -m $'fix(setup): use redaction-safe prerequisite presence\n\nFixes: #299\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNED_OFF_BY"
```

After the commit, quit and restart OpenCode before manually exercising `/setup`. Run `@code-review` as the separate pre-push review gate; only the human pushes.

---

## Plan self-review

- **Requirement coverage:** Task 1 covers Boolean-only resolved presence, numeric-zero semantics, fail-closed non-scalars, arity, unchanged redaction, and a shell canary. Task 2 covers broad `env.*` trust with exact arity/prefix/path-shape/depth constraints and unchanged subcommand trust. Task 3 covers `/setup` literal handling, failure-before-write, ADR supersession, living documentation, coverage, and final gates.
- **Scope:** One security fix spanning one established manifest boundary, one trust matcher, and one consumer; no independent subsystem or unresolved viability question remains.
- **Dependencies:** None added.
- **Type consistency:** `cmd_present(array): PrismCliResult` uses `pm_presence_bool(mixed): bool`; `/setup` consumes only its literal stdout; plugin trust recognizes the same four-token operation shape.
- **Placeholder scan:** No implementation placeholders remain. Commit attribution uses current project model defaults and dynamically resolves the human identity.
