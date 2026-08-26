#!/usr/bin/env bash
# $KYAULabs: toolchain_entrypoints_test.sh kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

# ── Toolchain entrypoint contract (Task 9) ──────────────────────────────────
# Prompts, skills, and docs must route every declared tool through the
# prism-tool launcher, preserve standing OCR consent, atomic commits, and
# dedicated review boundaries, and never invoke declared tools directly or
# treat OCR as optional.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CORE_PROMPTS="$REPO_ROOT/packages/prism-core/prompts"
CORE_SKILLS="$REPO_ROOT/packages/prism-core/skills"
ADAPTER_PROMPTS="$REPO_ROOT/packages/prism-php-web/prompts"
ADAPTER_SKILLS="$REPO_ROOT/packages/prism-php-web/skills"
ADAPTER_DOCS="$REPO_ROOT/packages/prism-php-web/docs"
PR_TOOL="$REPO_ROOT/packages/prism-core/scripts/prism-tool/pr.js"

failures=0
assert_file_contains() {
	local file="$1" pattern="$2" label="$3"
	if grep -qE -e "$pattern" "$file"; then
		pass "$label"
	else
		fail "$label (missing pattern $pattern in $file)"
		failures=$((failures + 1))
	fi
}
assert_file_not_contains() {
	local file="$1" pattern="$2" label="$3"
	if grep -qE -e "$pattern" "$file"; then
		fail "$label (found forbidden pattern $pattern in $file)"
		failures=$((failures + 1))
	else
		pass "$label"
	fi
}

echo "── /setup standing consent and apply/verify sequence ──"
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup resolve' 'setup runs setup resolve'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup apply' 'setup runs setup apply'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup verify' 'setup runs setup verify'
assert_file_contains "$CORE_PROMPTS/setup.md" '--network-approved=yes' 'setup requires exact registry approval'
assert_file_contains "$CORE_PROMPTS/setup.md" '--approval=yes' 'setup requires literal yes mutation approval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool consent status --json' 'setup inspects standing OCR consent'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool consent grant-ocr --approval=yes' 'setup grants standing OCR consent once'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool consent revoke-ocr' 'setup documents standing consent revocation'
assert_file_contains "$CORE_PROMPTS/setup.md" 'one question at a time' 'setup asks one question per turn'
assert_file_contains "$CORE_PROMPTS/setup.md" 'candidate diff|diff' 'setup displays the candidate diff before apply'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --json' 'setup classifies the canonical root before established setup'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Template.*recommended default|recommended default.*Template' 'strict-empty setup recommends Template by default'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Blank' 'strict-empty setup offers Blank'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Cancel' 'strict-empty setup offers Cancel'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --source=template --json' 'setup validates Template routing through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --source=blank --json' 'setup validates Blank routing through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --source=cancel --json' 'setup validates Cancel routing through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'unknown.*schema|unknown.*disposition|fail closed' 'setup fails closed on unknown route reports'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Cancel.*no template access|Cancel.*template access.*package acquisition.*project mutation' 'Cancel forbids bootstrap effects'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter catalogue --json' 'strict-empty setup reads the Core adapter catalogue'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Choose the bootstrap adapter: Core only, PHP/web, or Cancel[?]' 'strict-empty setup offers Core-only'
assert_file_contains "$CORE_PROMPTS/setup.md" 'PHP/web' 'strict-empty setup offers the PHP/web adapter'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter select --adapter=core-only --source=' 'strict-empty setup records Core-only without acquisition'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter select --adapter=php-web --source=.*--network-approved=yes' 'strict-empty setup obtains explicit registry approval for adapter acquisition'
assert_file_contains "$CORE_PROMPTS/setup.md" 'unknown.*adapter.*schema|unknown.*adapter.*disposition|adapter.*fail closed' 'strict-empty setup fails closed on unknown adapter reports'
assert_file_contains "$CORE_PROMPTS/setup.md" 'exact displayed package.*version|displayed.*exact package.*version' 'strict-empty setup displays the exact package and version'
assert_file_contains "$CORE_PROMPTS/setup.md" 'No second adapter-installation question|no redundant.*install' 'strict-empty adapter selection is the installation authorization'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter cleanup --attempt=' 'strict-empty setup cleans provisional adapter state on stop'
assert_file_not_contains "$CORE_PROMPTS/setup.md" 'setup adapter select.*--package=|setup adapter select.*--version=|setup adapter select.*--url=' 'strict-empty setup accepts no caller package authority'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup source --source=.*--adapter=' 'strict-empty setup inspects the selected source after adapter selection'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Choose optional project capabilities.*none' 'strict-empty setup leaves every optional capability disabled by default'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup project metadata --source=' 'strict-empty setup obtains selected metadata fields from the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Preview identity-bearing metadata|identity-bearing metadata preview' 'strict-empty setup previews public identity metadata'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Publish the displayed identity-bearing metadata[?].*\(yes/no\)' 'strict-empty setup separately confirms identity publication'
assert_file_contains "$CORE_PROMPTS/setup.md" "<<'PRISM_PROJECT_METADATA'" 'strict-empty setup passes bounded metadata through inert stdin'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup project plan --source=' 'strict-empty setup composes one complete project plan'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Approve the complete displayed project plan[?].*\(yes/no\)' 'strict-empty setup retains literal complete-plan approval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup project recover --attempt=' 'strict-empty plan decline restores transaction-owned state'
assert_file_not_contains "$CORE_PROMPTS/setup.md" 'Until the selected source route.*immediately clean' 'strict-empty setup no longer stops after adapter selection'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup project status --json' 'setup inspects retained bootstrap state before established discovery'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup project validate --attempt=' 'strict-empty setup revalidates the approved project plan'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup project apply --attempt=.*--approval=yes' 'strict-empty setup applies only the approved plan'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup repository create --attempt=' 'strict-empty setup creates Git only after durability'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup hooks inspect --attempt=' 'strict-empty setup inspects canonical hooks before approval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Activate the displayed canonical Git hooks[?].*\(yes/no\)' 'strict-empty hook activation has a separate question'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup hooks apply --attempt=.*--approval=yes' 'strict-empty setup activates hooks only after approval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup seed prepare --attempt=' 'strict-empty setup prepares the attested root seed after hooks'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool commit create --type ignore --subject "bootstrap prism project"' 'strict-empty setup uses the reserved exclusive root commit'
assert_file_contains "$CORE_PROMPTS/setup.md" 'only tool call in its assistant batch' 'strict-empty root commit preserves launcher exclusivity'
assert_file_contains "$CORE_PROMPTS/setup.md" 'ROOT_SEED_COMMIT|REPOSITORY_CREATION|HOOK_ACTIVATION|ROOT_SEED_PREPARATION' 'strict-empty setup dispatches only closed resume phases'
assert_file_contains "$CORE_PROMPTS/setup.md" 'create/configure the hosted repository.*add the remote.*push `develop`.*rulesets' 'strict-empty final reporting leaves publication to the human'
assert_file_not_contains "$CORE_PROMPTS/setup.md" 'git remote add|git push|gh repo create' 'strict-empty setup never executes publication commands'

SETUP_ENTRY_SECTION="${RESULT_FILE}.setup-entry"
SETUP_CONTINUATION_SECTION="${RESULT_FILE}.setup-continuation"
register_temp_dir "$SETUP_ENTRY_SECTION" "$SETUP_CONTINUATION_SECTION"
awk '/^## Setup entry routing$/ { active=1 } /^## Strict-empty continuation and recovery$/ { active=0 } active' \
    "$CORE_PROMPTS/setup.md" > "$SETUP_ENTRY_SECTION"
awk '/^## Strict-empty continuation and recovery$/ { active=1 } /^## 1[.] Pre-flight$/ { active=0 } active' \
    "$CORE_PROMPTS/setup.md" > "$SETUP_CONTINUATION_SECTION"

setup_source_choice_line=$({ grep -niF 'Choose the strict-empty setup source' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_adapter_catalogue_line=$({ grep -niF 'prism-tool setup adapter catalogue --json' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_adapter_question_line=$({ grep -niF 'Choose the bootstrap adapter' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
if [ -n "$setup_source_choice_line" ] && [ -n "$setup_adapter_catalogue_line" ] \
    && [ -n "$setup_adapter_question_line" ] \
    && [ "$setup_source_choice_line" -lt "$setup_adapter_catalogue_line" ] \
    && [ "$setup_adapter_catalogue_line" -lt "$setup_adapter_question_line" ]; then
    pass '/setup selects the source route before the adapter catalogue and question'
else
    fail '/setup does not sequence source routing before adapter selection'
    failures=$((failures + 1))
fi

setup_source_inspect_line=$({ grep -niF 'prism-tool setup source --source=' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_capabilities_line=$({ grep -niF 'Choose optional project capabilities' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_metadata_line=$({ grep -niF 'prism-tool setup project metadata --source=' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_identity_approval_line=$({ grep -niF 'Publish the displayed identity-bearing metadata?' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_plan_line=$({ grep -niF 'prism-tool setup project plan --source=' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_plan_approval_line=$({ grep -niF 'Approve the complete displayed project plan?' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
setup_recover_line=$({ grep -niF 'prism-tool setup project recover --attempt=' "$SETUP_ENTRY_SECTION" || true; } | cut -d: -f1 | head -1)
if [ -n "$setup_source_inspect_line" ] && [ -n "$setup_capabilities_line" ] \
    && [ -n "$setup_metadata_line" ] && [ -n "$setup_identity_approval_line" ] \
    && [ -n "$setup_plan_line" ] && [ -n "$setup_plan_approval_line" ] \
    && [ -n "$setup_recover_line" ] \
    && [ "$setup_adapter_question_line" -lt "$setup_source_inspect_line" ] \
    && [ "$setup_source_inspect_line" -lt "$setup_capabilities_line" ] \
    && [ "$setup_capabilities_line" -lt "$setup_metadata_line" ] \
    && [ "$setup_metadata_line" -lt "$setup_identity_approval_line" ] \
    && [ "$setup_identity_approval_line" -lt "$setup_plan_line" ] \
    && [ "$setup_plan_line" -lt "$setup_plan_approval_line" ] \
    && [ "$setup_plan_approval_line" -lt "$setup_recover_line" ]; then
    pass 'strict-empty setup preserves source, metadata, publication, and plan ordering'
else
    fail 'strict-empty setup reorders source, metadata, publication, or plan stages'
    failures=$((failures + 1))
fi

setup_validate_line=$({ grep -niF 'prism-tool setup project validate --attempt=' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_apply_line=$({ grep -niF 'prism-tool setup project apply --attempt=' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_repository_line=$({ grep -niF 'prism-tool setup repository create --attempt=' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_hook_inspect_line=$({ grep -niF 'prism-tool setup hooks inspect --attempt=' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_hook_approval_line=$({ grep -niF 'Activate the displayed canonical Git hooks?' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_hook_apply_line=$({ grep -niF 'prism-tool setup hooks apply --attempt=' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_seed_line=$({ grep -niF 'prism-tool setup seed prepare --attempt=' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
setup_commit_line=$({ grep -niF 'prism-tool commit create --type ignore --subject "bootstrap prism project"' "$SETUP_CONTINUATION_SECTION" || true; } | cut -d: -f1 | head -1)
if [ -n "$setup_validate_line" ] && [ -n "$setup_apply_line" ] \
    && [ -n "$setup_repository_line" ] && [ -n "$setup_hook_inspect_line" ] \
    && [ -n "$setup_hook_approval_line" ] && [ -n "$setup_hook_apply_line" ] \
    && [ -n "$setup_seed_line" ] && [ -n "$setup_commit_line" ] \
    && [ "$setup_validate_line" -lt "$setup_apply_line" ] \
    && [ "$setup_apply_line" -lt "$setup_repository_line" ] \
    && [ "$setup_repository_line" -lt "$setup_hook_inspect_line" ] \
    && [ "$setup_hook_inspect_line" -lt "$setup_hook_approval_line" ] \
    && [ "$setup_hook_approval_line" -lt "$setup_hook_apply_line" ] \
    && [ "$setup_hook_apply_line" -lt "$setup_seed_line" ] \
    && [ "$setup_seed_line" -lt "$setup_commit_line" ]; then
    pass 'strict-empty setup preserves validation, application, repository, hooks, and seed ordering'
else
    fail 'strict-empty setup reorders validation, application, repository, hooks, or seed stages'
    failures=$((failures + 1))
fi

setup_route_line=$({ grep -niF 'prism-tool setup route --json' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_status_line=$({ grep -niF 'prism-tool setup project status --json' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_release_line=$({ grep -niF 'prism-tool package-release inspect --json' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_adapter_line=$({ grep -niF 'Inspect project-local evidence only' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
if [ -n "$setup_route_line" ] && [ -n "$setup_status_line" ] \
    && [ -n "$setup_release_line" ] && [ -n "$setup_adapter_line" ] \
    && [ "$setup_route_line" -lt "$setup_status_line" ] \
    && [ "$setup_status_line" -lt "$setup_release_line" ] \
    && [ "$setup_status_line" -lt "$setup_adapter_line" ]; then
    pass '/setup routes and inspects bootstrap status before established discovery'
else
    fail '/setup does not isolate retained bootstrap state from established discovery stages'
    failures=$((failures + 1))
fi

CONSENT_SCAN_PATHS=(
	"$CORE_PROMPTS"
	"$CORE_SKILLS"
	"$ADAPTER_PROMPTS"
	"$ADAPTER_SKILLS"
	"$ADAPTER_DOCS"
	"$REPO_ROOT/packages/prism-core/AGENTS.md"
	"$REPO_ROOT/packages/prism-core/README.md"
	"$REPO_ROOT/README.md"
	"$REPO_ROOT/CODING_HARNESS.md"
	"$REPO_ROOT/CONTRIBUTING.md"
)
consent_prompt_count=$({ grep -RiohE 'Grant standing OCR consent.*\(yes/no\)' \
	"${CONSENT_SCAN_PATHS[@]}" || true; } | wc -l | tr -d ' ')
setup_status_line=$({ grep -niF 'prism-tool consent status --json' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_prompt_line=$({ grep -niE 'Grant standing OCR consent.*\(yes/no\)' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_grant_line=$({ grep -niF 'prism-tool consent grant-ocr --approval=yes' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_doctor_line=$({ grep -niE '^prism-tool doctor$' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
if [ "$consent_prompt_count" -eq 1 ] \
	&& [ -n "$setup_status_line" ] && [ -n "$setup_prompt_line" ] \
	&& [ -n "$setup_grant_line" ] && [ -n "$setup_doctor_line" ] \
	&& [ "$setup_status_line" -lt "$setup_prompt_line" ] \
	&& [ "$setup_prompt_line" -lt "$setup_grant_line" ] \
	&& [ "$setup_grant_line" -lt "$setup_doctor_line" ]; then
	pass '/setup uniquely orders status, consent prompt, grant, and full readiness'
else
	fail "/setup consent prompt is duplicated or out of order (count=$consent_prompt_count)"
	failures=$((failures + 1))
fi

echo "── /doctor standing-consent readiness ──"
assert_file_contains "$CORE_PROMPTS/doctor.md" 'prism-tool doctor' 'full doctor uses the launcher without an approval flag'
assert_file_contains "$CORE_PROMPTS/doctor.md" 'standing-consent|standing consent' 'full doctor requires standing OCR consent'
assert_file_not_contains "$CORE_PROMPTS/doctor.md" '--ocr-test-approved' 'doctor has no per-run OCR approval flag'
assert_file_not_contains "$CORE_PROMPTS/doctor.md" '\(yes/no\)' 'doctor never asks for OCR consent'
assert_file_contains "$REPO_ROOT/packages/prism-core/scripts/install-global.sh" 'doctor --local-only' 'installer performs local-only readiness'
assert_file_contains "$REPO_ROOT/packages/prism-core/scripts/install-global.sh" 'Run /setup' 'installer directs the human to /setup'
assert_file_not_contains "$REPO_ROOT/packages/prism-core/scripts/install-global.sh" 'grant-ocr|--ocr-test-approved' 'installer neither grants nor requests OCR consent'

echo "── local-only readiness on /check, /pr, and release ──"
assert_file_contains "$CORE_PROMPTS/check.md" 'prism-tool doctor --local-only' 'check performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/check.md" 'prism-tool markdown lint --changed-from' 'check runs changed Markdown through the shared gate'
assert_file_contains "$CORE_PROMPTS/check.md" 'one tool call.*retain.*literal SHA|retain.*literal SHA.*later call' 'check resolves and retains the Markdown base separately'
assert_file_contains "$CORE_PROMPTS/pr.md" 'prism-tool pr preflight' 'pr delegates preflight to the launcher'
assert_file_contains "$CORE_PROMPTS/pr.md" 'prism-tool pr validate-title' 'pr delegates title validation to the launcher'
assert_file_contains "$PR_TOOL" "'doctor', '--local-only'" 'pr launcher operation performs local-only readiness'
assert_file_contains "$PR_TOOL" "'commitlint'" 'pr launcher operation validates titles through commitlint'
assert_file_contains "$CORE_PROMPTS/release.md" 'prism-tool doctor --local-only' 'release performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/release.md" 'prism-tool run git-cliff' 'release uses bundled git-cliff through the launcher'

assert_file_contains "$CORE_SKILLS/conventional-commits/SKILL.md" 'prism-tool commit create' 'conventional-commits creates atomically through the launcher'
assert_file_contains "$CORE_SKILLS/conventional-commits/SKILL.md" 'only tool call in its assistant batch' 'commit creation is exclusive'
assert_file_contains "$CORE_SKILLS/conventional-commits/SKILL.md" '/reload' 'commit failure documents fatal recovery'
assert_file_not_contains "$CORE_SKILLS/conventional-commits/SKILL.md" '\$\(' 'conventional-commits avoids command substitution blocked by the safety extension'

echo "── /security scans through the launcher ──"
assert_file_contains "$CORE_PROMPTS/security.md" 'prism-tool run semgrep' 'security runs Semgrep through the launcher'

echo "── code-review uses standing consent and the dedicated OCR boundary ──"
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'Standing OCR consent' 'code-review relies on global standing consent'
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool code-review ocr' 'code-review uses the dedicated OCR operation'
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool code-review chain inspect --json' 'code-review inspects bounded review-chain evidence'
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool code-review chain record' 'code-review records bounded review-chain evidence'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" '--ocr-test-approved|--code-egress-approved' 'code-review has no per-run approval flags'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool run ocr' 'code-review cannot use generic OCR passthrough'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" 'optional.*[Oo]cr|OCR.*optional|SKIPPED.*OCR' 'code-review treats OCR as mandatory, not optional'

echo "── adapter checks/build use declared tool IDs ──"
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run php-cs-fixer -- fix --dry-run --diff' 'check-php runs php-cs-fixer through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run stylelint --' 'check-php runs stylelint through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run eslint --' 'check-php runs eslint through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run pest -- --coverage' 'check-php runs pest through the launcher'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" '\$\(' 'check-php avoids command substitution blocked by the safety extension'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" 'mktemp' 'check-php uses project-local temp files instead of mktemp'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" '\btrap\b' 'check-php avoids deferred-execution builtins blocked by the safety extension'
assert_file_contains "$ADAPTER_PROMPTS/build-assets.md" 'prism-tool run sass --' 'build-assets runs sass through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/build-assets.md" 'prism-tool run uglify-js --' 'build-assets runs uglify-js through the launcher'
CANONICAL_PEST='PEST_BROWSER_BASE_URL="http://localhost:8080" prism-tool run pest -- --coverage'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run pest -- --coverage' 'tdd-php runs pest through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" "$CANONICAL_PEST" 'check-php uses the canonical Pest coverage command'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" "$CANONICAL_PEST" 'tdd-php uses the canonical Pest coverage command'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" '^prism-tool run pest -- --coverage$' 'check-php has no bare coverage fallback'
assert_file_not_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" '^prism-tool run pest -- --coverage$' 'tdd-php has no bare coverage fallback'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" 'vendor/bin/pest|--min=100' 'check-php has no direct Pest or invented minimum'
assert_file_not_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'vendor/bin/pest|--min=100' 'tdd-php has no direct Pest or invented minimum'
assert_file_contains "$CORE_SKILLS/writing-plans/SKILL.md" 'active adapter.*verbatim|verbatim.*active adapter' 'plan authoring validates adapter-owned commands'
assert_file_contains "$CORE_SKILLS/executing-plans/SKILL.md" 'reject.*direct stack-tool|direct stack-tool.*reject' 'plan execution rejects direct stack tools'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run php-cs-fixer -- fix --dry-run --diff' 'tdd-php runs php-cs-fixer through the launcher'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run stylelint --' 'tdd-php runs stylelint through the launcher'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run eslint --' 'tdd-php runs eslint through the launcher'
assert_file_contains "$ADAPTER_SKILLS/pest-browser/SKILL.md" 'prism-tool run playwright -- install chromium' 'pest-browser installs only the Chromium target'
CANONICAL_VISUAL='prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" "$CANONICAL_VISUAL" 'tdd-php runs visual review through the launcher'
assert_file_contains "$ADAPTER_SKILLS/visual-review/SKILL.md" "$CANONICAL_VISUAL" 'visual-review owns the canonical capture command'
assert_file_contains "$ADAPTER_SKILLS/pest-browser/SKILL.md" 'Visual design iteration belongs to `visual-review`' 'pest-browser remains functional-test-only'
assert_file_contains "$REPO_ROOT/packages/prism-php-web/README.md" 'visual-review' 'adapter README documents visual review'
assert_file_contains "$REPO_ROOT/CODING_HARNESS.md" 'visual-review' 'harness docs catalogue visual review'
assert_file_contains "$ADAPTER_SKILLS/scss-mobile-first/SKILL.md" 'prism-tool run stylelint --' 'scss-mobile-first runs stylelint through the launcher'
assert_file_contains "$ADAPTER_SKILLS/scss-mobile-first/SKILL.md" 'prism-tool run sass --' 'scss-mobile-first compiles sass through the launcher'
assert_file_not_contains "$ADAPTER_DOCS/tests.md" 'vendor/bin/pest' 'adapter test doc never invokes pest directly'

echo "── Core-only post-durable repository seed boundary ──"
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'PROJECT_DURABLE / REPOSITORY_BOOTSTRAP' 'Core README documents the post-durable start state'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'REPOSITORY_CREATED / HOOK_ACTIVATION' 'Core README documents repository creation before hooks'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'HOOKS_ACTIVE / ROOT_SEED_PREPARATION' 'Core README documents hook activation before staging'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'SEED_READY / ROOT_SEED_COMMIT' 'Core README documents attested seed readiness'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'prism-tool setup repository create' 'Core README documents repository creation through the launcher'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'prism-tool setup hooks apply --approval=yes' 'Core README documents separate hook approval'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'prism-tool setup seed prepare' 'Core README documents exact seed preparation'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'commit create --type ignore' 'Core README documents the reserved seed commit'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'creates no remote' 'Core README preserves the no-remote boundary'
assert_file_contains "$REPO_ROOT/packages/prism-core/README.md" 'human .*develop.* push' 'Core README leaves initial publication to the human'
assert_file_not_contains "$REPO_ROOT/packages/prism-core/README.md" 'deferred to task 12' 'Core README removes stale task 12 deferral'
assert_file_contains "$REPO_ROOT/README.md" 'Strict-empty `/setup`.*Template.*Blank.*Cancel' 'public README documents strict-empty setup choices'
assert_file_contains "$REPO_ROOT/CODING_HARNESS.md" 'Strict-empty `/setup`.*established-project' 'harness docs preserve established setup isolation'
assert_file_contains "$REPO_ROOT/packages/prism-php-web/README.md" 'separate hook approval.*signed root seed' 'adapter README documents completed seed orchestration'

echo "── hooks perform local-only readiness ──"
assert_file_contains "$REPO_ROOT/.github/hooks/pre-commit" 'doctor --local-only' 'pre-commit runs local doctor'
assert_file_contains "$REPO_ROOT/.github/hooks/pre-commit" 'markdown lint --cached' 'pre-commit runs staged Markdown through the shared gate'
assert_file_contains "$REPO_ROOT/.github/workflows/ci.yml" 'markdown lint --changed-from' 'CI runs changed Markdown through the shared gate'
assert_file_contains "$REPO_ROOT/.github/hooks/pre-push" 'doctor --local-only' 'pre-push runs local doctor'
assert_file_contains "$REPO_ROOT/.github/hooks/commit-msg" 'doctor --local-only' 'commit-msg runs local doctor'

echo "── user-facing approval-free workflow documentation ──"
for doc in \
	"$REPO_ROOT/packages/prism-core/README.md" \
	"$REPO_ROOT/README.md" \
	"$REPO_ROOT/CODING_HARNESS.md"; do
	assert_file_contains "$doc" 'standing OCR consent' "$doc documents standing OCR consent"
	assert_file_contains "$doc" 'consent revoke-ocr' "$doc documents consent revocation"
	assert_file_contains "$doc" 'prism-tool commit create' "$doc documents atomic commit creation"
	assert_file_contains "$doc" '/reload' "$doc documents fatal commit recovery"
	assert_file_contains "$doc" 'fresh finalization acceptance' "$doc documents one-attempt finalization recovery"
done
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'prism-tool commit create' 'CONTRIBUTING documents atomic signed commits'
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'finalization acceptance' 'CONTRIBUTING documents automatic finalization'
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'Humans push work branches and merge pull requests' 'CONTRIBUTING preserves human-only publication'
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'one complete initial review' 'CONTRIBUTING documents initial review-chain evidence'
assert_file_contains "$REPO_ROOT/CODING_HARNESS.md" 'continuous repair delta' 'CODING_HARNESS documents repair-delta review'
assert_file_contains "$REPO_ROOT/README.md" 'Advisory findings do not block' 'README documents non-blocking Advisory findings'
assert_file_contains "$REPO_ROOT/packages/prism-core/AGENTS.md" 'base or history changes' 'packaged AGENTS documents chain invalidation'

echo "── stale workflow scan across active resources ──"
STALE_SCAN_PATHS=(
	"$CORE_PROMPTS"
	"$CORE_SKILLS"
	"$ADAPTER_PROMPTS"
	"$ADAPTER_SKILLS"
	"$ADAPTER_DOCS"
	"$REPO_ROOT/packages/prism-core/AGENTS.md"
	"$REPO_ROOT/packages/prism-core/APPEND_SYSTEM.md"
	"$REPO_ROOT/packages/prism-core/README.md"
	"$REPO_ROOT/AGENTS.md"
	"$REPO_ROOT/README.md"
	"$REPO_ROOT/CODING_HARNESS.md"
	"$REPO_ROOT/CONTRIBUTING.md"
	"$REPO_ROOT/.github/hooks"
	"$REPO_ROOT/packages/prism-core/scripts/prism-tool"
	"$REPO_ROOT/packages/prism-core/extensions/safety"
)
stale_found=0
for candidate in "${STALE_SCAN_PATHS[@]}"; do
	[ -e "$candidate" ] || continue
	if grep -rnE '(^|[[:space:]])npx (stylelint|eslint|commitlint|playwright)($|[[:space:]])' "$candidate" 2>/dev/null; then
		stale_found=1
	fi
	for forbidden in \
		'vendor/bin/pest' \
		'vendor/bin/php-cs-fixer' \
		'git cliff' \
		'command -v ocr' \
		'--ocr-test-approved' \
		'--code-egress-approved' \
		'prism-tool run ocr' \
		'prism-tool commit prepare' \
		'prism-tool commit apply' \
		'prism-tool commit discard'; do
		if grep -rnF -- "$forbidden" "$candidate" 2>/dev/null; then
			stale_found=1
		fi
	done
	if grep -rniE 'optional.*[Oo]cr|OCR.*optional|SKIPPED.*[Oo]cr|OCR.*SKIPPED' "$candidate" 2>/dev/null; then
		stale_found=1
	fi
done
if [ "$stale_found" -eq 0 ]; then
	pass 'active resources contain no retired approvals, generic OCR, old commits, or direct declared-tool invocation'
else
	fail 'active resources contain a retired workflow or direct declared-tool invocation'
	failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
	print_summary "toolchain entrypoints"
	exit 1
fi
print_summary "toolchain entrypoints"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
