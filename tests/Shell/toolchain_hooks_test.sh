#!/usr/bin/env bash
# $KYAULabs: toolchain_hooks_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Hook boundary tests: every hook routes declared tools through the
#    prism-tool launcher (Task 8) ────────────────────────────────────────────
#
# Covers:
#   - Missing launcher fails closed with /setup remediation.
#   - Each hook runs mandatory local doctor before its main operation.
#   - commit-msg invokes `run commitlint -- --edit MESSAGE`.
#   - pre-commit invokes adapter IDs only for matching staged files and never
#     calls npx/vendor/bin directly.
#   - A failed doctor prevents every later tool.
#   - Filenames/payloads with spaces remain one argument.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

FAKE="$REPO_ROOT/tests/Shell/fixtures/fake-prism-tool.sh"
COMMIT_MSG_HOOK="$REPO_ROOT/.github/hooks/commit-msg"
PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"
PRE_PUSH="$REPO_ROOT/.github/hooks/pre-push"
ZERO_OID=$(printf '0%.0s' {1..40})

prism_log_lines() {
	tr '\0' '\n' < "$1" | grep -v '^$' || true
}

# ── Test 1: missing launcher fails closed with /setup remediation ─────────────

echo "── Test 1: missing launcher fails closed with /setup remediation ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	printf 'feat: sample\n' > msg
	set +e
	output=$(PATH="$(path_without_prism_tool)" env -u PRISM_TOOL bash "$COMMIT_MSG_HOOK" msg 2>&1)
	ret=$?
	set -e
	if [ "$ret" -ne 0 ] && printf '%s\n' "$output" | grep -qE '/setup|install-global'; then
		pass "commit-msg fails closed on a missing launcher with /setup remediation"
	else
		fail "commit-msg did not fail closed on a missing launcher (exit=$ret): $output"
	fi
)

# ── Test 2: commit-msg runs local doctor then run commitlint with one argv ────

echo "── Test 2: commit-msg runs doctor then run commitlint with one argv ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	printf 'feat: sample\n' > "msg file with spaces"
	LOG="$T2/log"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" bash "$COMMIT_MSG_HOOK" "msg file with spaces" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -eq 0 ] \
		&& printf '%s\n' "$lines" | grep -Fxq 'doctor' \
		&& printf '%s\n' "$lines" | grep -Fxqe '--local-only' \
		&& printf '%s\n' "$lines" | grep -Fxq 'run' \
		&& printf '%s\n' "$lines" | grep -Fxq 'commitlint' \
		&& printf '%s\n' "$lines" | grep -Fxqe '--edit' \
		&& printf '%s\n' "$lines" | grep -Fxq 'msg file with spaces'; then
		pass "commit-msg invokes doctor and run commitlint with the message as one argument"
	else
		fail "commit-msg did not invoke the expected launcher commands: $(printf '%s' "$lines" | tr '\n' ',')"
	fi
)

# ── Test 3: a failed doctor prevents commitlint ───────────────────────────────

echo "── Test 3: a failed doctor prevents commitlint ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	printf 'feat: sample\n' > msg
	LOG="$T3/log"
	: > "$LOG"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" PRISM_DOCTOR_STATUS=1 bash "$COMMIT_MSG_HOOK" msg 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -ne 0 ] \
		&& printf '%s\n' "$lines" | grep -Fxq 'doctor' \
		&& ! printf '%s\n' "$lines" | grep -Fxq 'run'; then
		pass "a failed doctor prevents commitlint"
	else
		fail "commitlint ran despite a failed doctor (exit=$ret): $(printf '%s' "$lines" | tr '\n' ',')"
	fi
)

# ── Test 4: pre-commit invokes adapter IDs only for matching staged files ─────

echo "── Test 4: pre-commit routes declared tools through the launcher only ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	git_init_test_repo "$T4"
	LOG="$T4/log"
	: > "$LOG"
	mkdir -p cdn/js cdn/sass
	cat > bad.php <<'PHP'
<?php

declare(strict_types=1);

  $x = 1;
PHP
	printf 'body { color: red; }\n' > cdn/sass/app.scss
	printf 'const x = 1;\n' > cdn/js/app.js
	git add bad.php cdn/sass/app.scss cdn/js/app.js
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" bash "$PRE_COMMIT" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	run_count=$(printf '%s\n' "$lines" | grep -c '^run$' || true)
	if printf '%s\n' "$lines" | grep -Fxq 'php-cs-fixer' \
		&& printf '%s\n' "$lines" | grep -Fxq 'stylelint' \
		&& printf '%s\n' "$lines" | grep -Fxq 'eslint' \
		&& ! printf '%s\n' "$lines" | grep -qx 'npx' \
		&& ! printf '%s\n' "$lines" | grep -Fq 'vendor/bin' \
		&& [ "$run_count" -eq 3 ]; then
		pass "pre-commit invokes exactly php-cs-fixer, stylelint, and eslint without direct npx/vendor calls"
	else
		fail "pre-commit launcher usage is wrong (runs=$run_count): $(printf '%s' "$lines" | tr '\n' ',')"
	fi
)

# ── Test 5: pre-commit keeps filenames with spaces as one argument ────────────

echo "── Test 5: pre-commit keeps filenames with spaces as one argument ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	git_init_test_repo "$T5"
	LOG="$T5/log"
	: > "$LOG"
	mkdir -p cdn/js
	cat > "cdn/js/my file.js" <<'JS'
const value = 1;
JS
	git add "cdn/js/my file.js"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" bash "$PRE_COMMIT" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if printf '%s\n' "$lines" | grep -Fxq 'cdn/js/my file.js'; then
		pass "a staged filename with spaces reaches the launcher as one argument"
	else
		fail "filename with spaces was not preserved as one argument: $(printf '%s' "$lines" | tr '\n' ',')"
	fi
)

# ── Test 6: a failed doctor prevents every later pre-commit tool ──────────────

echo "── Test 6: a failed doctor prevents every later pre-commit tool ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
	cd "$T6"
	git_init_test_repo "$T6"
	LOG="$T6/log"
	: > "$LOG"
	cat > bad.php <<'PHP'
<?php

declare(strict_types=1);

echo "x";
PHP
	git add bad.php
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" PRISM_DOCTOR_STATUS=1 bash "$PRE_COMMIT" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -ne 0 ] \
		&& printf '%s\n' "$lines" | grep -Fxq 'doctor' \
		&& ! printf '%s\n' "$lines" | grep -Fxq 'run'; then
		pass "a failed doctor stops pre-commit before any declared tool"
	else
		fail "pre-commit ran declared tools despite a failed doctor (exit=$ret): $(printf '%s' "$lines" | tr '\n' ',')"
	fi
)

# ── Test 7: pre-push runs local doctor before harness checks ─────────────────

echo "── Test 7: pre-push runs local doctor before harness checks ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
(
	cd "$T7"
	git_init_test_repo "$T7"
	mkdir -p packages/prism-core/scripts
	cat > packages/prism-core/scripts/validate-harness.sh <<'STUB'
#!/usr/bin/env bash
printf 'stub-validate-harness-ran\n' >> "$HARNESS_MARKER"
STUB
	chmod +x packages/prism-core/scripts/validate-harness.sh
	printf 'initial\n' > seed
	git add seed packages/prism-core/scripts/validate-harness.sh
	git commit -q -m 'initial'
	LOCAL_OID=$(git rev-parse HEAD)
	LOG="$T7/log"
	: > "$LOG"
	MARKER="$T7/marker"
	rm -f "$MARKER"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" HARNESS_MARKER="$MARKER" \
		bash "$PRE_PUSH" <<< "refs/heads/feat/t-user-abc1-feature $LOCAL_OID refs/heads/feat/t-user-abc1-feature $ZERO_OID" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -eq 0 ] \
		&& printf '%s\n' "$lines" | grep -Fxq 'doctor' \
		&& [ -f "$MARKER" ]; then
		pass "pre-push runs local doctor before harness checks"
	else
		fail "pre-push did not run doctor before harness checks (exit=$ret): $(printf '%s' "$lines" | tr '\n' ',')"
	fi
)

# ── Test 8: a failed pre-push doctor blocks the harness checks ────────────────

echo "── Test 8: a failed pre-push doctor blocks the harness checks ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
(
	cd "$T8"
	git_init_test_repo "$T8"
	mkdir -p packages/prism-core/scripts
	cat > packages/prism-core/scripts/validate-harness.sh <<'STUB'
#!/usr/bin/env bash
printf 'stub-validate-harness-ran\n' >> "$HARNESS_MARKER"
STUB
	chmod +x packages/prism-core/scripts/validate-harness.sh
	printf 'initial\n' > seed
	git add seed packages/prism-core/scripts/validate-harness.sh
	git commit -q -m 'initial'
	LOCAL_OID=$(git rev-parse HEAD)
	LOG="$T8/log"
	: > "$LOG"
	MARKER="$T8/marker"
	rm -f "$MARKER"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" PRISM_DOCTOR_STATUS=1 HARNESS_MARKER="$MARKER" \
		bash "$PRE_PUSH" <<< "refs/heads/feat/t-user-abc2-feature $LOCAL_OID refs/heads/feat/t-user-abc2-feature $ZERO_OID" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -ne 0 ] \
		&& printf '%s\n' "$lines" | grep -Fxq 'doctor' \
		&& [ ! -f "$MARKER" ]; then
		pass "a failed pre-push doctor prevents the harness checks"
	else
		fail "pre-push ran harness checks despite a failed doctor (exit=$ret)"
	fi
)

# ── Test 9: a missing launcher fails closed on pre-push ───────────────────────

echo "── Test 9: a missing launcher fails closed on pre-push ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
(
	cd "$T9"
	git_init_test_repo "$T9"
	mkdir -p packages/prism-core/scripts
	cat > packages/prism-core/scripts/validate-harness.sh <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
	chmod +x packages/prism-core/scripts/validate-harness.sh
	printf 'initial\n' > seed
	git add seed packages/prism-core/scripts/validate-harness.sh
	git commit -q -m 'initial'
	LOCAL_OID=$(git rev-parse HEAD)
	set +e
	output=$(PATH="$(path_without_prism_tool)" env -u PRISM_TOOL bash "$PRE_PUSH" <<< "refs/heads/feat/t-user-abc3-feature $LOCAL_OID refs/heads/feat/t-user-abc3-feature $ZERO_OID" 2>&1)
	ret=$?
	set -e
	if [ "$ret" -ne 0 ] && printf '%s\n' "$output" | grep -qE '/setup|install-global'; then
		pass "pre-push fails closed on a missing launcher with /setup remediation"
	else
		fail "pre-push did not fail closed on a missing launcher (exit=$ret): $output"
	fi
)

# ── Test 10: pre-commit prefers the checkout blank-line checker ──────────────

echo "── Test 10: pre-commit prefers the checkout blank-line checker ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
(
	cd "$T10"
	git_init_test_repo "$T10"
	mkdir -p packages/prism-core/scripts
	cat > packages/prism-core/scripts/check-blank-lines.sh <<'STUB'
#!/usr/bin/env bash
printf '%s\n' 'checkout-blank-line-checker-ran'
exit 7
STUB
	printf 'clean\n' > staged.md
	git add staged.md
	LOG="$T10/log"
	: > "$LOG"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" bash "$PRE_COMMIT" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -eq 7 ] \
		&& printf '%s\n' "$output" | grep -Fq 'checkout-blank-line-checker-ran' \
		&& ! printf '%s\n' "$lines" | grep -Fxq 'resolve'; then
		pass "pre-commit prefers the checkout blank-line checker"
	else
		fail "pre-commit did not prefer the checkout checker (exit=$ret): $output"
	fi
)

# ── Test 11: pre-commit resolves an installed blank-line checker ──────────────

echo "── Test 11: pre-commit resolves an installed blank-line checker ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
(
	cd "$T11"
	git_init_test_repo "$T11"
	printf 'clean\n' > staged.md
	git add staged.md
	LOG="$T11/log"
	: > "$LOG"
	set +e
	output=$(PRISM_TOOL_LOG="$LOG" PRISM_TOOL="$FAKE" bash "$PRE_COMMIT" 2>&1)
	ret=$?
	set -e
	lines=$(prism_log_lines "$LOG")
	if [ "$ret" -eq 0 ] \
		&& printf '%s\n' "$lines" | grep -Fxq 'resolve' \
		&& printf '%s\n' "$lines" | grep -Fxq 'scripts' \
		&& printf '%s\n' "$output" | grep -Fq '→ blank-line policy'; then
		pass "pre-commit falls back to the resolved blank-line checker"
	else
		fail "pre-commit did not use resolver fallback (exit=$ret): $output"
	fi
)

print_summary "toolchain hooks"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
