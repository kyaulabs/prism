# Secrets Audit Remediation Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remediate audit findings F1–F4: keep the DeepSeek API key and `.env`
secrets out of process-exposed surfaces, remove the stale gitleaks allowlist,
and document the rotation convention.

**Architecture:** Four independent, small changes: (1) websearch sends its auth
header via a 0600 mktemp file (`--header @file`) instead of argv; (2)
`.gitleaks.toml` loses its dead `[allowlist]`; (3) `.env.example` documents the
key-ring rotation convention + DB runbook; (4) `load_env()` stops exporting the
three `SECRET_KEYS` to child-process env via `putenv()`.

**Tech Stack:** bash + curl (websearch skill), PHP 8.5 + Pest 5 (env loader),
gitleaks TOML config, dotenv convention docs.

## Global constraints

- Signed commits (`git commit -S`) in Conventional Commits format with
  `Authored-by:` / `Implemented-by:` / `Tested-by:` / `Signed-off-by:` footers
  (ADR-0040).
- Every modified source file keeps its existing RCS header and vim modeline;
  no header churn.
- Shell edits must pass `shellcheck --severity=warning` (CI step).
- PHP edits must pass php-cs-fixer and Pest coverage ≥ 80% on changed files
  (`/check-php` gate at the end).
- No new dependencies.
- `searxng/search.sh` is NOT modified (sends no auth header).
- `.gitleaks.toml` keeps `useDefault = true`.

---

### Task 1: Trap restoration in `search_request()` (discovered regression, blocks Task 2)

**Files:**
- Modify: `packages/prism-core/skills/lib/search_common.sh` (trap-restore block at end of `search_request()`)
- Test: `tests/Shell/search_skills_test.sh` (new section after the "caller EXIT trap survives" blocks)

**Interfaces:**
- Consumes: `search_request()`'s existing `prev_trap` capture and chained-trap registration.
- Produces: caller's EXIT trap restored only in the caller's own shell; cleared in command-substitution subshells so the caller's cleanup cannot fire early. Direct-call behavior unchanged.

- [x] **Step 1: Write the failing test** — insert after the `search_request preserves multi-word caller traps` block in `tests/Shell/search_skills_test.sh`:

```sh
printf '%s\n' '── search_request: caller EXIT trap not fired inside command substitution ──'
CMDS_MARKER=$(mktemp)
CMDS_OUTFILE=$(mktemp)
CMDS_REPORT=$(mktemp)
rm -f "$CMDS_MARKER"
FAKE_DIR3=$(mktemp -d)
write_fake_curl "$FAKE_DIR3"
write_fake_sleep "$FAKE_DIR3"
set +e
env PATH="$FAKE_DIR3:$PATH" CMDS_MARKER="$CMDS_MARKER" CMDS_OUTFILE="$CMDS_OUTFILE" bash -c \
	'cleanup_marker() { echo ran > "$CMDS_MARKER"; rm -f "$CMDS_OUTFILE"; }
	trap cleanup_marker EXIT
	source "$1"
	status=$(search_request --output "$2" http://fake.invalid/search)
	if [ -f "$CMDS_MARKER" ]; then premature=1; else premature=0; fi
	if grep -q "fake body" "$2"; then body=present; else body=missing; fi
	printf "premature=%s body=%s status=%s\n" "$premature" "$body" "$status" > "$3"' \
	_ "$LIB" "$CMDS_OUTFILE" "$CMDS_REPORT" 2>/dev/null
rc=$?
set -e
if [ "$rc" -eq 0 ] && grep -q 'premature=0' "$CMDS_REPORT" \
	&& grep -q 'body=present' "$CMDS_REPORT" \
	&& grep -q 'status=200' "$CMDS_REPORT"; then
	pass 'search_request does not fire the caller EXIT trap inside command substitution'
else
	fail "search_request command-substitution trap (rc=$rc report=$(cat "$CMDS_REPORT" 2>/dev/null))"
fi
if [ -f "$CMDS_MARKER" ] && grep -q ran "$CMDS_MARKER"; then
	pass 'caller EXIT trap still fires at caller exit'
else
	fail 'caller EXIT trap missing at caller exit'
fi
rm -f "$CMDS_MARKER" "$CMDS_OUTFILE" "$CMDS_REPORT"
rm -rf "$FAKE_DIR3"
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/search_skills_test.sh`
Expected: FAIL `search_request command-substitution trap` with `premature=1 body=missing` (the caller's cleanup fired in the subshell and deleted the output file).

- [x] **Step 3: Write minimal implementation** — in `packages/prism-core/skills/lib/search_common.sh`, replace the trap-restore block at the end of `search_request()`:

```sh
	rm -f "$header_file"
	if [ -n "$prev_trap" ]; then
		# Restore the caller's trap only in the caller's own shell. Inside a
		# command-substitution subshell, re-registering it would fire the
		# caller's cleanup when the subshell exits, deleting the caller's
		# temp files mid-script. The parent shell keeps its own copy of the
		# trap; clearing the subshell copy prevents the premature fire.
		if [ "${BASHPID:-$$}" = "$$" ]; then
			eval "$prev_trap"
		else
			trap - EXIT
		fi
	else
		trap - EXIT
	fi
```

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/search_skills_test.sh`
Expected: all PASS, including the two new assertions; existing direct-call trap tests still pass.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/skills/lib/search_common.sh tests/Shell/search_skills_test.sh
git commit -S -m $'fix(search): stop caller trap firing inside command substitution\n\nDiscovered while verifying the F1 secrets-audit fix: search_request\nre-registered the caller EXIT trap via eval \"$prev_trap\" at its end, and\ninside a $(...) subshell that re-registration fires the caller cleanup\non subshell exit, deleting the caller temp files before the final\nresponse parse (websearch exit 6 ENOENT; regression from f5ff42b).\nRestore the trap only in the caller shell (BASHPID=$$); clear it in\nsubshells. Direct-call trap tests stay green; new command-substitution\nregression case added.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: F1 — websearch API key out of curl argv

**Files:**
- Modify: `packages/prism-core/skills/websearch/search.sh:56-62,82` (temp-file block; auth header line)
- Test: `tests/Shell/search_skills_test.sh` (new section after the "search skills: secret handling" block)

**Interfaces:**
- Consumes: existing `require_env DEEPSEEK_API_KEY` (key guaranteed set+non-empty before the temp block), existing `cleanup()` EXIT trap, existing `search_request()` retry helper.
- Produces: `AUTH_HEADER_FILE` mktemp (0600, trap-cleaned) containing one line `x-api-key: <key>`; curl invoked with separate argv entries `--header` and `@<path>`.

- [x] **Step 1: Write the failing test** — insert after the `pass 'searxng does not print the configured URL value'` block in `tests/Shell/search_skills_test.sh`:

```sh
printf '%s\n' '── websearch: API key never enters curl argv (F1) ──'
ARGV_LOG=$(mktemp)
FAKE_DIR=$(mktemp -d)
cat > "$FAKE_DIR/curl" <<'FAKE_CURL_ARGV'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >> "$FAKE_CURL_ARGV_LOG"
out=''
while [ $# -gt 0 ]; do
	case "$1" in
		--output) out="$2"; shift 2 ;;
		--output=*) out="${1#--output=}"; shift ;;
		-o) out="$2"; shift 2 ;;
		-o*) out="${1#-o}"; shift ;;
		--dump-header) shift 2 ;;
		*) shift ;;
	esac
done
[ -n "$out" ] || { printf 'fake curl argv: no --output\n' >&2; exit 1; }
printf '%s\n' '{"content":[{"type":"text","text":"search ok"}]}' > "$out"
printf '200'
FAKE_CURL_ARGV
chmod +x "$FAKE_DIR/curl"
set +e
env PATH="$FAKE_DIR:$PATH" FAKE_CURL_ARGV_LOG="$ARGV_LOG" \
	DEEPSEEK_API_KEY="sk-live-TEST-1234567890abcdef-DO_NOT_LEAK" \
	bash "$WEB" 'test query' >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
	fail "websearch argv-isolation run (rc=$rc)"
else
	pass 'websearch argv-isolation run completes'
fi
if grep -q 'sk-live-TEST-1234567890abcdef-DO_NOT_LEAK' "$ARGV_LOG"; then
	fail 'websearch API key leaked into curl argv'
else
	pass 'websearch API key absent from curl argv'
fi
HDR_FILE=$(awk '$0=="--header" { getline; if ($0 ~ /^@/) { print substr($0, 2); exit } }' "$ARGV_LOG")
if [ -n "$HDR_FILE" ] && [ -f "$HDR_FILE" ] \
	&& grep -qx 'x-api-key: sk-live-TEST-1234567890abcdef-DO_NOT_LEAK' "$HDR_FILE"; then
	pass 'websearch auth header delivered via --header @file'
else
	fail "websearch auth header not via --header @file (file='$HDR_FILE')"
fi
rm -f "$ARGV_LOG"
rm -rf "$FAKE_DIR"
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/search_skills_test.sh`
Expected: FAIL `websearch API key leaked into curl argv` (the key is currently in argv) and FAIL on the `--header @file` assertion.

- [x] **Step 3: Write minimal implementation** — in `packages/prism-core/skills/websearch/search.sh`:

After the existing `chmod 600 "$REQUEST_FILE" "$RESPONSE_FILE" "$ERROR_FILE"` line, add:

```sh
AUTH_HEADER_FILE=$(mktemp)
printf 'x-api-key: %s\n' "$DEEPSEEK_API_KEY" > "$AUTH_HEADER_FILE"
chmod 600 "$AUTH_HEADER_FILE"
```

Extend `cleanup()` to `rm -f "$REQUEST_FILE" "$RESPONSE_FILE" "$ERROR_FILE" "$AUTH_HEADER_FILE"`, and replace the auth header line:

```sh
	--header 'content-type: application/json' \
	--header "@$AUTH_HEADER_FILE" \
```

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/search_skills_test.sh`
Expected: all PASS, including the three new assertions; summary `0 failed`.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/skills/websearch/search.sh tests/Shell/search_skills_test.sh
git commit -S -m $'fix(websearch): keep API key out of curl argv\n\nF1 of the secrets audit (CWE-214): deliver x-api-key via a 0600\nmktemp header file (--header @file) instead of a command-line\nargument, so the key never appears in /proc/<pid>/cmdline. The\nfile is re-read per attempt, preserving search_request retries.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: F2 — remove stale gitleaks allowlist

**Files:**
- Modify: `.gitleaks.toml` (delete comment block + `[allowlist]` section)

- [x] **Step 1: Edit `.gitleaks.toml`** — remove everything except:

```toml
[extend]
useDefault = true
```

(Delete the `# Deliberate leak-detection canary allowlist.` comment block and the `[allowlist]` section with its two regexes — the canary test files were deleted in `9cc6e7b` and the strings exist nowhere in the tree.)

- [x] **Step 2: Verify config**

Run: `gitleaks version` and `git add .gitleaks.toml` then `gitleaks git --pre-commit --staged`
Expected: no leaks found (the pre-commit hook runs the same command automatically at commit time).

- [x] **Step 3: Commit**

```bash
git commit -S -m $'chore(gitleaks): remove stale canary allowlist\n\nF2 of the secrets audit: the allowlist references canary test\nfiles deleted in 9cc6e7b and the anchored strings exist nowhere\nin the tree. Dead config erodes scanner trust; git history\npreserves the exact strings if canary tests return (ADR-0048\n§8 discipline is forward-looking and unaffected).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: F3 — rotation docs in `.env.example`

**Files:**
- Modify: `.env.example` (header comment, before the "Copy this file to .env" line)

- [x] **Step 1: Edit `.env.example`** — insert before `# Copy this file to .env in the repository root and fill in values. NEVER`:

```sh
# Rotation
#   - Key-ring convention (for consumers): comma-separate key generations,
#     e.g. APP_KEY=<new-hex>,<old-hex>. Verify against ALL listed keys and
#     sign/encrypt with the FIRST (newest) so rotation has a dual-acceptance
#     window; drop the old key after the window closes.
#   - DB password rotation runbook: create a new DB user (or ALTER USER to
#     set a new password), update DB_PASSWORD in the server environment,
#     reload PHP-FPM, then drop the old credential.
```

- [x] **Step 2: Verify** — `git diff --stat` shows only `.env.example`; no code touched.

- [x] **Step 3: Commit**

```bash
git add .env.example
git commit -S -m $'docs(env): document key rotation convention\n\nF3 of the secrets audit: no tracked code consumes APP_KEY/\nCSRF_KEY/DB_PASSWORD (verified against the checked-out aurora\nsubmodule), so rotation is documented as a consumer contract in\n.env.example rather than implemented as dead loader code.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: F4 — keep SECRET_KEYS out of child-process env

**Files:**
- Modify: `backend/env.php` (const + `load_env()` loop; docblock)
- Test: `tests/Unit/LoadEnvTest.php` (cleanup lists + two new tests)

**Interfaces:**
- Produces: top-level `const SECRET_KEYS = ['APP_KEY', 'CSRF_KEY', 'DB_PASSWORD'];` consumed by `load_env()`; behavior: secret keys populate `$_ENV` only, non-secrets keep dual-population.
- Consumes: existing `$_ENV`/`getenv()` server-env-wins precedence, `parse_env_value()`, `is_dangerous_env_name()` — all untouched.

- [x] **Step 1: Write the failing tests** — in `tests/Unit/LoadEnvTest.php`:

Add to `beforeEach` (after `putenv('LD_PRELOAD');`):
```php
    putenv('APP_KEY');
    putenv('CSRF_KEY');
    putenv('DB_PASSWORD');
    putenv('DB_USER');
    unset($_ENV['APP_KEY'], $_ENV['CSRF_KEY'], $_ENV['DB_PASSWORD'], $_ENV['DB_USER']);
```

Add to `afterEach(restoreEnvVars(` list (after `'LD_PRELOAD',`):
```php
    'APP_KEY',
    'CSRF_KEY',
    'DB_PASSWORD',
    'DB_USER',
```

Append two tests at the end of the file:

```php
test('load_env keeps SECRET_KEYS out of getenv but present in $_ENV', function () {
    $path = sys_get_temp_dir() . '/test_env_secret_key.env';
    file_put_contents($path, "APP_KEY=deadbeefcafe\n");

    load_env($path);

    expect($_ENV['APP_KEY'])->toBe('deadbeefcafe');
    expect(getenv('APP_KEY'))->toBeFalse();

    unlink($path);
});

test('load_env non-secret keys still dual-populate $_ENV and getenv', function () {
    $path = sys_get_temp_dir() . '/test_env_non_secret.env';
    file_put_contents($path, "DB_USER=app\n");

    load_env($path);

    expect($_ENV['DB_USER'])->toBe('app');
    expect(getenv('DB_USER'))->toBe('app');

    unlink($path);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: `load_env keeps SECRET_KEYS out of getenv but present in $_ENV` FAILS — `getenv('APP_KEY')` returns `'deadbeefcafe'`, not false. (The non-secret guard test passes already — it pins the contract.)

- [x] **Step 3: Write minimal implementation** — in `backend/env.php`, after the `is_dangerous_env_name()` function, add:

```php
/**
 * Environment keys whose values are secrets and must not be exported to
 * child-process environments via putenv(). They remain readable through
 * $_ENV. Keep in sync with the Secrets section of .env.example.
 *
 * @var string[]
 */
const SECRET_KEYS = ['APP_KEY', 'CSRF_KEY', 'DB_PASSWORD'];
```

In `load_env()`, replace:

```php
        $_ENV[$key] = $value;
        putenv("{$key}={$value}");
```

with:

```php
        $_ENV[$key] = $value;

        // Secrets stay out of child-process environments (CWE-526); they
        // remain readable via $_ENV by the app itself.
        if (!in_array($key, SECRET_KEYS, true)) {
            putenv("{$key}={$value}");
        }
```

And add one sentence to `load_env()`'s docblock: "Keys named in SECRET_KEYS populate $_ENV only and are not exported via putenv(), keeping them out of child-process environments."

- [x] **Step 4: Run tests to verify they pass**

Run: `vendor/bin/pest tests/Unit/LoadEnvTest.php tests/Unit/EnvBoolTest.php`
Expected: all PASS; the new secret-key test green, existing dual-population contract test green.

- [x] **Step 5: Commit**

```bash
git add backend/env.php tests/Unit/LoadEnvTest.php
git commit -S -m $'fix(env): keep secret keys out of child-process env\n\nF4 of the secrets audit (CWE-526): stop exporting APP_KEY/\nCSRF_KEY/DB_PASSWORD via putenv() in load_env() so a future\nexec()/proc_open() child never inherits them. Secrets remain\nreadable via $_ENV; all other keys keep the tested dual\npopulation contract. The SECRET_KEYS list is pinned by new\nLoadEnvTest cases.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

**Final verification (after Task 5):** `bash tests/Shell/search_skills_test.sh`, `vendor/bin/pest`, `shellcheck --severity=warning packages/prism-core/skills/websearch/search.sh packages/prism-core/skills/lib/search_common.sh`, then `/check` (delegates to `/check-php`), then `code-review` before push.
