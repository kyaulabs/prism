# Prism JSONC Manifest Migration Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Replace both legacy `setup.json` manifests with schema-v5
`prism.jsonc` manifests, using one fail-closed, comment-preserving JSONC
implementation for project defaults and field-by-field user overrides.

**Architecture:** ADR-0043 defines the hard-to-reverse contract. A
dependency-free PHP 8.5 boundary under `.github/scripts/` tokenizes full JSONC,
retains source spans and trivia for round-trip field updates, rejects duplicate
keys, and exposes a narrow CLI to shell consumers. Project configuration is
required at `./prism.jsonc`; optional user configuration at
`~/.config/opencode/prism.jsonc` recursively overlays project fields.

**Tech Stack:** PHP 8.5 standard library, Bash, direnv, Pest v4/PHPUnit 12,
Git hooks, GitHub Actions.

## Global constraints

- **Blocking prerequisite:** `adr/0043-prism-jsonc-manifest-migration.md` must
  exist with status `Accepted` before implementation starts. Its acceptance
  step must also register the decision in `CONTEXT.md`, define the Prism
  manifest under Entities & Invariants, and add the narrow `/setup` user-home
  exception to `AGENTS.md` (including creation of `~/.config/opencode/` when
  absent); Task 1 must not start before those edits exist.
- The architecture review verdict is `GO-WITH-CONDITIONS` and its contract is
  `ADR-required: 0043`.
- Project manifest: repository-root `prism.jsonc`, schema version `5`, required.
- The tracked project manifest starts with a JSONC `// $KYAULabs:` RCS-style
  header resolved from the implementing human's identity/date; JSONC permits
  the header even though `.jsonc` is outside the automatic source normalizer.
- User manifest: `~/.config/opencode/prism.jsonc`, schema version `5`, optional.
- Resolution is a recursive field-by-field overlay: project defaults first,
  then user values. Object keys merge recursively; arrays and scalar values are
  replaced atomically by the user value.
- A missing user manifest is valid. A missing project manifest, malformed
  project or user manifest, duplicate key, unsupported schema version, unsafe
  symlink, excessive size, or excessive nesting fails closed.
- JSON objects and arrays remain distinct throughout parsing and overlay;
  associative-array decoding is prohibited because it collapses `{}` and `[]`.
- Support line comments, block comments, comment markers inside strings,
  escaped quotes/backslashes, multiline block comments, nested objects/arrays,
  and trailing commas in objects and arrays.
- Reject unterminated strings/comments, control characters in strings,
  malformed numbers/literals, multiple root values, and duplicate object keys.
- Limit each input to 1 MiB and nesting to 64 levels.
- `/setup` patches owned scalar fields and missing sections without changing
  unrelated fields or comments. Applying the same update twice must be
  byte-identical on the second pass.
- All writes are atomic. Project files use mode `0644`; user files use `0600`.
  Never follow a symlink for a write target.
- Delete a legacy file only after the replacement has been atomically written,
  reparsed, and verified as schema v5.
- `.envrc` must not `eval` configuration. The CLI transports allowlisted
  environment names and values as NUL-delimited pairs.
- Diagnostics go to stderr and never include secret values.
- `env.*` values in committed `prism.jsonc` remain empty; the staged-blob guard
  and both CI jobs enforce this invariant.
- `~/.config/opencode/models.env` no longer participates in resolution; the two
  `prism.jsonc` manifests are the only configuration sources.
- No new runtime or Composer dependency. The reader must work before
  `vendor/autoload.php` exists.
- Every new or modified `.php`/`.sh` file follows the `rcs-header` skill,
  including PHPDoc and a final vim modeline.
- Each enumerated test list is a queue of tracer bullets, not a batch: add one
  failing behavior, run it RED, implement only that behavior, run it GREEN,
  refactor, then advance to the next behavior. Do not write a whole corpus and
  implement afterward.
- Minimum changed-file line coverage is 80%; parser, patcher, migration, and
  injection boundaries require explicit behavioral tests regardless of the
  percentage.
- Git pushes remain human-only. After implementation run
  `verification-before-completion`, `/check`, and `@code-review`.

Before any task commit, resolve attribution dynamically and define this helper
in the current shell; do not copy model IDs or identity from this plan:

```bash
commit_with_attribution() {
  local subject="$1" issue_footer="$2" message
  : "${OPENCODE_MODEL_PLANNER:?run direnv allow before committing}"
  : "${OPENCODE_MODEL_PRIMARY:?run direnv allow before committing}"
  : "${OPENCODE_MODEL_JUDGE:?run direnv allow before committing}"
  local authored_by="${OPENCODE_MODEL_PLANNER##*/}"
  local implemented_by="${OPENCODE_MODEL_PRIMARY##*/}"
  local tested_by="${OPENCODE_MODEL_JUDGE##*/}"
  local signed_off_by
  signed_off_by="$(bash .github/scripts/resolve-identity.sh)" || return 1
  printf -v message '%s\n\n%s\nAuthored-by: %s\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
    "$subject" "$issue_footer" "$authored_by" "$implemented_by" "$tested_by" "$signed_off_by"
  git commit -S -m "$message"
}
```

---

## Overview

ADR-0043 supersedes ADR-0029's paths, schema-v4 whole-file selection, `jq`
reader, and legacy behavior, and supersedes ADR-0032's explicit rejection of
JSONC while preserving its empty committed `env.*` security invariant. The
migration establishes a visible root-level Prism manifest, gives both project
and per-user configuration the same JSONC syntax, preserves user-authored
comments during `/setup`, and introduces an explicit schema-v5 boundary.

## Manifest and CLI contracts

### PHP document API

Create these dependency-free classes under the existing covered
`.github/scripts/` source directory:

```php
namespace KYAULabs\Prism;

final class PrismJsoncException extends \RuntimeException
{
}

final class PrismJsoncDocument
{
    public const int MAX_BYTES = 1_048_576;
    public const int MAX_DEPTH = 64;

    public static function parse(string $source): self;
    public static function fromFile(string $path): self;

    public function root(): \stdClass;

    public function source(): string;

    /** @param array<string, mixed> $dotPathValues */
    public function withValues(array $dotPathValues): self;

    public function writeAtomic(string $path, int $mode): void;
}

final class PrismManifest
{
    public static function resolve(\stdClass $project, ?\stdClass $user): \stdClass;

    public static function validateProject(\stdClass $manifest): void;

    public static function validateUser(\stdClass $manifest): void;
}
```

`PrismJsoncDocument` keeps the original source plus a parsed object tree whose
nodes retain JSON kind and byte spans. Objects decode as `stdClass`; arrays
remain PHP lists, so `{}` and `[]` never collapse. `withValues()` accepts only
schema dot paths matching `[A-Za-z_][A-Za-z0-9_]*` per segment, replaces
existing value spans from right to left, and inserts missing leaves before the
owning object's closing brace. Missing object ancestors are created
recursively; an existing scalar/array ancestor is a hard collision. It then
reparses the result. It preserves every byte outside replaced/inserted spans
and returns the original source when all requested values already match.

Loading is explicit and vendor-independent:

```text
PrismJsoncDocument.php -> require_once PrismJsoncException.php
PrismManifest.php      -> require_once PrismJsoncException.php
                          require_once PrismJsoncDocument.php
prism_manifest.php     -> require_once PrismManifest.php
```

Tests require the production file they exercise; no Composer autoload change is
needed.

### CLI API

Create `.github/scripts/prism_manifest.php` with these commands:

```text
php .github/scripts/prism_manifest.php validate FILE project|user
php .github/scripts/prism_manifest.php decode FILE
php .github/scripts/prism_manifest.php env0 PROJECT [USER]
php .github/scripts/prism_manifest.php get PROJECT USER_OR_DASH DOT_PATH
php .github/scripts/prism_manifest.php values0 PROJECT USER_OR_DASH DOT_PATH...
php .github/scripts/prism_manifest.php patch FILE project|user OCTAL_MODE < updates.json
php .github/scripts/prism_manifest.php migrate-preview LEGACY project|user
php .github/scripts/prism_manifest.php migrate LEGACY TARGET project|user OCTAL_MODE
php .github/scripts/prism_manifest.php check-secrets FILE
```

- Exit `0`: success.
- Exit `1`: malformed/unsafe configuration, validation failure, secret
  violation, write failure, or migration conflict.
- Exit `2`: invalid command or arguments.
- `decode` prints strict normalized JSON only.
- `env0` emits exactly 15 allowlisted variables—13 `OPENCODE_*` variables plus
  `DEEPSEEK_API_KEY` and `SEARXNG_URL`—as NUL-separated name/value pairs;
  diagnostics remain on stderr. It buffers and validates all output before
  writing the first byte.
- `get` prints one scalar value and rejects object/array results.
- `values0` resolves one immutable project/user snapshot, then emits each
  requested dot path and scalar value as NUL-separated pairs. Identity and
  scaffold consumers use it instead of multiple `get` calls.
- `patch` reads a strict JSON object mapping dot paths to replacement values
  from stdin; its input is machine-generated and does not need JSONC syntax.
  It validates the result according to the explicit `project|user` argument.
- `OCTAL_MODE` must match `^0[0-7]{3}$` and is converted with
  `intval($mode, 8)`; decimal interpretation is prohibited.
- `migrate-preview` performs no filesystem mutation and prints normalized
  strict JSON for the source's schema-v5 semantic projection. Migration and
  final deletion use this command to compare old/new values safely.
- `migrate` refuses an existing target, refuses source versions newer than 5,
  writes a canonical commented v5 document, reparses it, then removes legacy.
- `check-secrets` prints only violating key paths, never values.

### Field contract

| Section | Project v5 | User v5 | `/setup` ownership |
|---|---|---|---|
| `setup_version` | Required, exactly `5` | Required, exactly `5` | Migration only |
| `timestamp` | Required ISO-8601 string | Optional | Project writer |
| `configured` | Required boolean | Optional | Project writer |
| `app`, `domain`, `repo` | Required non-empty strings | Optional overrides | Project writer |
| `signed_off_by_name`, `signed_off_by_email` | Required non-empty strings | Optional overrides | Project + user writer |
| `accent` | `sky-blue` or `light-purple` | Optional override | Project writer |
| `scaffold_mode` | `skip`, `clone`, or `new` | Optional override | Project writer |
| `project_folder` | String or null | Optional override | Project writer |
| `models.*` | All five non-empty strings | Partial overrides allowed | Project + user writer |
| `variants.*` | All five non-empty strings | Partial overrides allowed | Project + user writer |
| `experimental.*` | Three booleans | Partial overrides allowed | Project writer |
| `env.*` | Object; every value empty | Partial non-empty overrides allowed | User-managed; `/setup` preserves |
| Unknown fields | Preserved | Preserved and overlaid | Never removed by `/setup` |

Identity resolution uses the resolved manifest when both identity fields are
non-empty; otherwise it falls back to a complete `git config user.name` +
`user.email` pair. Git configuration is an identity fallback, not a third
manifest tier.

### Scaffold parent/target contract

- In `skip` mode, the repository root is both parent and configured target;
  `/setup` patches its `prism.jsonc` with all interview values and records
  `scaffold_mode: "skip"` plus `project_folder: null`.
- In `clone`/`new` mode, the parent root manifest records all interview values
  plus the chosen `scaffold_mode` and `project_folder`; these two fields drive
  ADR-0026 re-run short-circuiting.
- After the quality surface is copied, `/setup` patches the scaffold target's
  own `prism.jsonc` with the interview's app/domain/repo, identity, accent,
  models, variants, experimental flags, timestamp, and configured state. The
  target receives `scaffold_mode: "skip"` and `project_folder: null`; it never
  embeds its parent's filesystem path.
- The user manifest is machine-global and is never copied into a scaffold
  target. Both parent and target preserve their own comments and unknown fields.
- `setup_version`, `scaffold_mode`, and `project_folder` are project bookkeeping
  fields. Scaffold decisions read the project document directly and never apply
  user overlay values for those paths; user overlays remain available to
  runtime model, variant, experimental, env, and identity consumers.
- `clone` and `new` integration tests assert that parent bookkeeping remains in
  the parent while target runtime values match the interview.

## Touchpoint inventory

Line references describe the pre-migration tree and are anchors rather than
post-edit invariants.

### Direct readers

| File | Current behavior | Required change |
|---|---|---|
| `.envrc:5-6,15-24,26-75` | Requires `jq`, selects one whole `setup.json`, runs migration on directory entry, uses `eval`, and sources `models.env`. | Require PHP 8.5; read project root plus optional user JSONC through `env0`; overlay fields; fail closed; warn about ignored legacy files; remove auto-migration, `eval`, and `models.env` sourcing. |
| `.github/scripts/resolve-identity.sh:4-9,16-50` | Reads user then project JSON separately through `jq`, then Git. | Query the resolved two-manifest view through the CLI, use the complete resolved pair, then Git fallback. |
| `.github/scripts/setup-scaffold.sh:295-343` | Reads `.opencode/setup.json` with `sed`. | Query root `prism.jsonc` through the shared CLI so comments and overlay semantics cannot diverge. |

### Writers and migration

| File | Current behavior | Required change |
|---|---|---|
| `.opencode/commands/setup.md:6-26,95-114,171-190,349-430` | Reads/writes project JSON and delegates user JSON merge. | Auto-run v5 migration, read resolved JSONC, patch only owned fields, preserve comments/unknown keys, and warn before writes. |
| `.github/scripts/migrate-setup.sh:5-53` | In-place v1-v4 `jq` migration of one file. | Become an idempotent shell engine around the PHP CLI for both project and user renames; validate before deleting; refuse downgrade/conflicts. |
| `.github/scripts/setup-write-user-config.sh:6-71` | Deep-merges JSON with `jq` into `~/.config/opencode/setup.json`. | Write `~/.config/opencode/prism.jsonc` at `0600` through `patch`; preserve comments, `env`, experimental, and unknown fields; reject symlinks and malformed input. |
| `.github/scripts/setup-write-project-config.sh` (new) | No focused writer exists; `/setup` currently describes a whole-file write. | Patch parent or scaffold-target project manifests through one tested wrapper using the scaffold contract above. |

### Security and enforcement

| File | Current behavior | Required change |
|---|---|---|
| `.github/scripts/check-setup-secrets.sh:8-59` | Uses `jq` against `.opencode/setup.json`. | Delegate JSONC parsing and violation detection to `check-secrets`; default to root `prism.jsonc`; retain redacted fail-closed output. |
| `.github/hooks/pre-commit:144-154` | Checks the staged legacy path. | Match and extract staged `prism.jsonc`; run the same CLI-backed guard on the staged blob. |
| `.github/workflows/ci.yml:132-133,335-337` | Runs the legacy-named guard in both jobs. | Rename steps and validate root `prism.jsonc` with the same guard on Linux and macOS. |

### Existing tests

| File | Current behavior | Required change |
|---|---|---|
| `tests/Unit/Harness/ModelConfigTest.php:16-23,52-72,205-216,274-301,443-477` | Direct `json_decode` of project setup JSON and path/copy assertions. | Load `prism.jsonc` through `PrismJsoncDocument`, assert v5 and new reader wiring. |
| `tests/Shell/research_background_scout_test.sh:11-12,48-63` | Reads legacy JSON with `jq`. | Decode/query root JSONC through CLI and assert `.envrc` uses `env0`. |
| `tests/Shell/setup_secrets_test.sh:14,113-119,146-169,198,217` | Creates/stages legacy JSON. | Exercise JSONC comments and staged root path; verify malformed and secret-bearing files fail closed. |
| `tests/Shell/resolve_identity_test.sh:35-52,64-68,91` | Creates project/user `setup.json` fixtures. | Create project/user `prism.jsonc` fixtures, test field inheritance and malformed-user failure. |
| `tests/Shell/migrate_setup_test.sh:16-257` | Tests in-place v1-v4 migration. | Test two-path v4-v5 migration, deletion ordering, conflicts, permissions, idempotence, and downgrade refusal. |
| `tests/Shell/setup_scaffold_test.sh:864-1016` | Tests `should-prompt` with JSON fixtures. | Use JSONC v5 fixtures and shared CLI; retain all four prompt outcomes. |
| `tests/Shell/setup_write_user_config_test.sh:1-130` | Uses `jq` to verify user JSON merge. | Verify user JSONC patching, mode `0600`, comment preservation, symlink refusal, and unknown-field preservation via CLI. |
| `tests/Shell/setup_substitution_test.sh:169` | Historical setup filename comment. | Update terminology only; substitution behavior is unchanged. |

### Living documentation and harness metadata

| File | Required change |
|---|---|
| `AGENTS.md:157-172,238-263` | New manifest paths/precedence, schema v5, PHP reader, and narrow human-invoked `/setup` exception for the two named files under `~/.config/opencode/`. |
| `README.md:141,312-319,343,369-375` | Replace setup/jq instructions with root/user JSONC and PHP-reader instructions. |
| `CONTEXT.md:24-31,79-87,142-160` | Replace `setup.json` glossary/identity terms, add `prism.jsonc` ownership, and register ADR-0043. |
| `CODING_HARNESS.md:54,65,87-95` | Update experimental/model source descriptions. |
| `CONTRIBUTING.md:54` | Update identity-resolution description. |
| `.opencode/docs/model-configuration.md:18-22,177` | Document project defaults plus user field overlay. |
| `.opencode/docs/mcp.md:18-19,67,76-79,164` | Document user JSONC secret location and reader chain. |
| `.github/PULL_REQUEST_TEMPLATE.md:18,64,85` | Replace historical setup/jq checks with prism-v5 checks. |
| `.github/scripts/quality-surface.manifest:9-21` | Include `prism.jsonc`, both PHP classes, exception, and CLI in scaffolded repositories. |
| `.opencode/commands/doctor.md:120-126,168,206-209` | Remove the obsolete blocking `jq` prerequisite; validate PHP 8.5 plus the resolved Prism manifest/CLI boundary instead. |
| `opencode.jsonc:41-43` | Point optional MCP users to the user `prism.jsonc`. |
| `.opencode/commands/research.md:12,30` | Point experimental flags to root `prism.jsonc`. |
| `.opencode/docs/research.md:10` | Point scout enablement to root `prism.jsonc`. |
| `.opencode/skills/research-background/SKILL.md:16,91` | Update the experimental-flag source. |
| `.opencode/skills/conventional-commits/SKILL.md:54-55` | Describe resolved Prism manifests plus Git identity fallback. |
| `.opencode/agents/tdd.md:150-151` | Update commit-identity resolution paths and field-overlay behavior. |

Historical accepted ADR bodies, completed plans, and completed specs remain
unchanged. ADR-0043 records supersession rather than rewriting history.

---

## Mandatory per-behavior TDD loop

Within every numbered task, process each listed behavior separately:

1. Add exactly one assertion/example for the next behavior.
2. Run the narrowest command and observe the expected RED failure.
3. Implement only enough production behavior to make that example pass.
4. Re-run GREEN, then refactor while keeping it green.
5. Repeat from step 1 for the next listed behavior.

The task-level test lists describe ordered queues, not instructions to write a
complete suite before implementation. Task commits happen only after every
inner loop is green.

### Task 1: Build the round-trip JSONC document boundary

**Files:**
- Create: `.github/scripts/PrismJsoncException.php`
- Create: `.github/scripts/PrismJsoncDocument.php`
- Create: `tests/Unit/Harness/PrismJsoncDocumentTest.php`
- Modify: `.github/scripts/quality-surface.manifest:1-39`
- Modify: `tests/Shell/setup_scaffold_test.sh` quality-surface parity section

**Interfaces:**
- Consumes: PHP 8.5 standard-library string and JSON functions only.
- Produces: `PrismJsoncDocument::parse()`, `fromFile()`, `root()`, `source()`,
  `withValues()`, and `writeAtomic()` exactly as declared above.

- [ ] **Step 1: Start the first parser Red → Green loop**

Cover in `PrismJsoncDocumentTest.php`:

```php
it('parses full JSONC without treating comment markers in strings as comments', function (): void {
    $source = <<<'JSONC'
{
  // line
  "url": "https://example.test/a/*literal*/", // trailing
  "escaped": "quote: \" and slash: \\",
  /* block
     comment */
  "items": [1, 2,],
}
JSONC;

    $document = PrismJsoncDocument::parse($source);

    expect($document->root()->url)->toBe('https://example.test/a/*literal*/')
        ->and($document->root()->escaped)->toBe('quote: " and slash: \\')
        ->and($document->root()->items)->toBe([1, 2]);
});

it('patches owned paths while preserving every unrelated byte', function (): void {
    $source = "{\n  // keep\n  \"models\": {\"primary\": \"old\"},\n  \"custom\": 1,\n}\n";

    $patched = PrismJsoncDocument::parse($source)
        ->withValues(['models.primary' => 'new']);

    expect($patched->source())->toBe(
        "{\n  // keep\n  \"models\": {\"primary\": \"new\"},\n  \"custom\": 1,\n}\n",
    );
    expect($patched->withValues(['models.primary' => 'new'])->source())
        ->toBe($patched->source());
});
```

After the first example is GREEN, repeat the mandatory inner loop for accepted
depth 64 and rejected depth
65, escaped-equivalent duplicate keys (`"key"` and `"\u006bey"`), malformed
numbers (`01`, `1.`, `1e`), unescaped control characters, multiple roots,
read symlinks, missing intermediate-object creation, and scalar-ancestor
collision. These cases are part of Task 1—not deferred hardening.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismJsoncDocumentTest.php
```

Expected: FAIL because `PrismJsoncDocument` does not exist.

- [ ] **Step 3: Implement only the current behavior toward this end-state**

Implement one stateful byte scanner with states `normal`, `string`,
`line-comment`, and `block-comment`. Emit punctuation, string, number, literal,
and trivia tokens with start/end offsets. Parse significant tokens recursively,
enforcing the 64-level limit and recording each object property's decoded key,
dot path, value span, and closing-brace insertion offset. Reject a key already
seen in the same object. Convert comment/trailing-comma regions to whitespace
for `json_decode(..., false, 65, JSON_THROW_ON_ERROR)` while preserving newline
positions; the custom parser owns the exact accepted-64/rejected-65 boundary.
`fromFile()` uses `lstat()` and refuses symlink inputs. `withValues()` encodes
values with
`JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`, applies
right-to-left replacements, recursively materializes missing object ancestors,
rejects scalar/array ancestor collisions, inserts missing keys using the
containing object's indentation, and reparses the result. `writeAtomic()` uses
`lstat()`, refuses symlinks, writes a same-directory temporary file, applies the
requested mode, reparses the bytes, and renames atomically.
Add both PHP files to `quality-surface.manifest` in this task and make the
forward/reverse parity assertions green before committing.

- [ ] **Step 4: Run focused tests and coverage**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismJsoncDocumentTest.php
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/PrismJsoncDocumentTest.php --coverage
bash tests/Shell/setup_scaffold_test.sh
```

Expected: PASS; changed PHP files report at least 80% line coverage.

- [ ] **Step 5: Commit the parser slice**

```bash
git add .github/scripts/PrismJsoncException.php .github/scripts/PrismJsoncDocument.php tests/Unit/Harness/PrismJsoncDocumentTest.php .github/scripts/quality-surface.manifest tests/Shell/setup_scaffold_test.sh
commit_with_attribution 'refactor(config): add round-trip JSONC document parser' 'Refs: #276'
```

### Task 2: Add manifest validation, overlay, and the stable CLI

**Files:**
- Create: `.github/scripts/PrismManifest.php`
- Create: `.github/scripts/prism_manifest.php`
- Create: `tests/Unit/Harness/PrismManifestTest.php`
- Create: `tests/Unit/Harness/PrismManifestCliTest.php`
- Modify: `.github/scripts/quality-surface.manifest`
- Modify: `tests/Shell/setup_scaffold_test.sh` quality-surface parity section

**Interfaces:**
- Consumes: Task 1's document API.
- Produces: `PrismManifest::resolve()`, `validateProject()`, `validateUser()`,
  and all nine CLI commands listed in the CLI contract.

- [ ] **Step 1: Run one validation/overlay/CLI Red → Green loop at a time**

Assert recursive `stdClass` merge, distinct `{}`/`[]` handling, scalar/array
replacement, missing-user success, partial user inheritance,
malformed-either-source failure, exact schema-v5 types, empty project `env.*`,
non-empty user `env.*`, all nine CLI commands, recursive missing-section
patching, scalar-ancestor collision, octal `0644`/`0600` handling, invalid mode
rejection, redacted errors, buffered NUL transport, allowlisted environment
names, immutable multi-field snapshots, and exit codes `0/1/2`. These command
contracts receive RED tests here before their dispatch branches are written;
later tasks add integration tests around their shell callers.

```php
it('overlays user fields recursively without erasing project siblings', function (): void {
    $resolved = PrismManifest::resolve(
        (object) ['setup_version' => 5, 'models' => (object) ['primary' => 'project', 'judge' => 'judge']],
        (object) ['setup_version' => 5, 'models' => (object) ['primary' => 'user']],
    );

    expect($resolved->models)->toEqual((object) ['primary' => 'user', 'judge' => 'judge']);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php tests/Unit/Harness/PrismManifestCliTest.php
```

Expected: FAIL because the manifest and CLI interfaces do not exist.

- [ ] **Step 3: Implement validation, recursive merge, and CLI dispatch**

Implement an explicit field/type matrix matching this plan. Recursively merge
only `stdClass` objects; replace arrays and scalars atomically. Do not use a dev
dependency for runtime validation. For CLI execution, wrap `main($argv)` in a
library guard so tests can load functions without exiting. Catch only
`PrismJsoncException`/`JsonException`, emit a redacted message, and return `1`;
unknown commands/invalid arity return `2`. `env0` maps resolved paths to a
hard-coded allowlist, rejects NUL bytes, buffers all pairs, and writes only
after complete validation. `values0` resolves once and buffers likewise. Parse
mode strings only after `^0[0-7]{3}$` validation and use `intval($mode, 8)`.
At the process boundary, catch unexpected `Throwable` separately and return a
generic secret-free `unexpected manifest failure` diagnostic with exit `1`.
Add `PrismManifest.php` and `prism_manifest.php` to the quality surface in this
task so no scaffolded script can depend on an omitted CLI.

- [ ] **Step 4: Run focused tests and coverage**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php tests/Unit/Harness/PrismManifestCliTest.php
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php tests/Unit/Harness/PrismManifestCliTest.php --coverage
bash tests/Shell/setup_scaffold_test.sh
```

Expected: PASS and at least 80% changed-file line coverage.

- [ ] **Step 5: Commit the manifest boundary**

```bash
git add .github/scripts/PrismManifest.php .github/scripts/prism_manifest.php tests/Unit/Harness/PrismManifestTest.php tests/Unit/Harness/PrismManifestCliTest.php .github/scripts/quality-surface.manifest tests/Shell/setup_scaffold_test.sh
commit_with_attribution 'refactor(config): add layered prism manifest CLI' 'Refs: #276'
```

### Task 3: Source the layered manifest from direnv

**Files:**
- Create: `prism.jsonc`
- Modify: `.envrc:1-77`
- Create: `tests/Shell/prism_envrc_test.sh`
- Modify: `.github/scripts/quality-surface.manifest`
- Modify: `tests/Shell/setup_scaffold_test.sh` quality-surface parity section

**Interfaces:**
- Consumes: `prism_manifest.php env0 PROJECT [USER]`.
- Produces: unchanged `OPENCODE_*`, `DEEPSEEK_API_KEY`, and `SEARXNG_URL`
  environment variables without `eval`.

- [ ] **Step 1: Write failing shell integration tests**

Create isolated project/user fixtures with comments, partial user overrides,
shell metacharacters, malformed user JSONC, legacy files, and absent project.
Assert project defaults, per-field user inheritance, literal metacharacter
values, hard failures, and deprecation warnings without secret output.

- [ ] **Step 2: Run the shell test and verify RED**

```bash
bash tests/Shell/prism_envrc_test.sh
```

Expected: FAIL because `.envrc` still reads setup JSON through `jq`/`eval`.

- [ ] **Step 3: Add the commented v5 project manifest and update `.envrc`**

Move current values into root `prism.jsonc`, add comments for every top-level
section and field contract, add the resolved JSONC RCS-style header, set
`setup_version` to `5`, retain empty `env.*`,
and retain `.opencode/setup.json` only as a non-read transitional tracked file
until Task 13. In `.envrc`,
set project/user paths to the two `prism.jsonc` locations, reject legacy-only
project state with an instruction to run `/setup`, warn and ignore legacy user
files, and consume `env0` only after the producer succeeds: set `umask 077`,
capture the fully buffered CLI output in a temporary file, check its exit
status, read paired NUL fields with `read -r -d ''`, export with
`export "$name=$value"`, and remove the temporary file on every path. Remove
`jq`, migration-on-directory-entry, `eval`, and the `models.env` source block.
Add root `prism.jsonc` to the quality surface in this task.

- [ ] **Step 4: Run shell and model configuration tests**

```bash
bash tests/Shell/prism_envrc_test.sh
php vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php
bash tests/Shell/setup_scaffold_test.sh
```

Expected: PASS with byte-identical exported defaults.

- [ ] **Step 5: Commit the direnv slice**

```bash
git add prism.jsonc .envrc tests/Shell/prism_envrc_test.sh .github/scripts/quality-surface.manifest tests/Shell/setup_scaffold_test.sh
commit_with_attribution 'refactor(config): source root prism manifest' 'Refs: #276'
```

### Task 4: Resolve identity from the layered manifest

**Files:**
- Modify: `.github/scripts/resolve-identity.sh:4-63`
- Modify: `tests/Shell/resolve_identity_test.sh:1-100`

**Interfaces:**
- Consumes: one `prism_manifest.php values0 PROJECT USER_OR_DASH
  signed_off_by_name signed_off_by_email` snapshot.
- Produces: `Name <email>` from resolved manifest, then complete Git pair.

- [ ] **Step 1: Add failing identity cases**

Test project pair, partial user name plus inherited project email, complete user
override, absent user, malformed user fail-closed, and Git fallback only when
the resolved manifest pair is incomplete.

- [ ] **Step 2: Verify RED**

```bash
bash tests/Shell/resolve_identity_test.sh
```

Expected: FAIL on JSONC paths and field inheritance.

- [ ] **Step 3: Replace direct `jq` reads with CLI reads**

Set project path to `$REPO_ROOT/prism.jsonc` and user path to
`$HOME/.config/opencode/prism.jsonc`. Read both identity fields from one
buffered `values0` invocation so files cannot change between field reads. Do
not print parser diagnostics containing values; propagate the CLI's nonzero
status.

- [ ] **Step 4: Verify GREEN**

```bash
bash tests/Shell/resolve_identity_test.sh
```

Expected: all identity cases PASS.

- [ ] **Step 5: Commit the identity slice**

```bash
git add .github/scripts/resolve-identity.sh tests/Shell/resolve_identity_test.sh
commit_with_attribution 'refactor(identity): resolve prism manifest overlays' 'Refs: #276'
```

### Task 5: Implement atomic v4-to-v5 dual migration

**Files:**
- Modify: `.github/scripts/migrate-setup.sh:1-57`
- Modify: `tests/Shell/migrate_setup_test.sh:1-257`

**Interfaces:**
- Consumes: `prism_manifest.php migrate-preview LEGACY project|user` and
  `prism_manifest.php migrate LEGACY TARGET project|user OCTAL_MODE`.
- Produces: idempotent project and user migrations with deletion-after-verify.

- [ ] **Step 1: Replace migration tests with failing v5 cases**

Cover project and user success, canonical comments, values preserved, project
mode `0644`, user mode `0600`, source deletion after verification, source
retention on failure, target conflict, malformed source, versions 1-4, version
5 at a legacy path being moved (not left in place), version 6 downgrade refusal,
repeated invocation, read/write symlink refusal, equivalent old/new coexistence,
divergent old/new coexistence, and a tracked target arriving beside a locally
modified legacy file.
Assert `migrate-preview` prints normalized v5 JSON without changing source
bytes, creating a target, or deleting anything.
Add distinct cases for an equivalent legacy path still tracked during this
branch (retain with a transition warning) and the same path left untracked
after a downstream `git pull` (delete after equality verification).

- [ ] **Step 2: Verify RED**

```bash
bash tests/Shell/migrate_setup_test.sh
```

Expected: FAIL because the current script only edits one JSON file in place.

- [ ] **Step 3: Implement the shell migration engine**

Default paths are project old/new plus user old/new. Support explicit test
overrides without touching real `$HOME`. For each tier: skip when both files
are absent; validate a present v5 target; when old and new coexist, compute the
legacy file's canonical v5 value and remove old only if it is semantically
equal to the verified target, otherwise fail without modifying either file.
This handles the repository transition while protecting locally modified
legacy files when Git introduces the new target. A v5 document at the legacy
path is still renamed and deleted; version-based no-op applies only when the
canonical target is already valid and legacy is absent. The project migration
materializes all required v5 defaults; user migration remains partial but adds
`setup_version: 5`. Use `migrate-preview` for every comparison; never call the
mutating command on an existing target. When the equivalent legacy project path
is still tracked by Git, warn and retain it for Task 13's repository cutover;
when it is untracked (the downstream-upgrade case), delete it after equality
verification. User legacy is never tracked and follows the deletion rule.
Never suppress a migration failure.

- [ ] **Step 4: Verify GREEN**

```bash
bash tests/Shell/migrate_setup_test.sh
```

Expected: all migration and rollback cases PASS.

- [ ] **Step 5: Commit the migration slice**

```bash
git add .github/scripts/migrate-setup.sh tests/Shell/migrate_setup_test.sh
commit_with_attribution 'refactor(setup): add atomic prism v5 migration' 'Refs: #276'
```

### Task 6: Make `/setup` migrate and patch comments in place

**Files:**
- Modify: `.opencode/commands/setup.md:6-26,95-114,171-190,349-430`
- Create: `.github/scripts/setup-write-project-config.sh`
- Modify: `.github/scripts/quality-surface.manifest:1-39`
- Create: `tests/Unit/Harness/SetupCommandPrismManifestTest.php`
- Create: `tests/Shell/setup_write_project_config_test.sh`
- Modify: `tests/Shell/setup_scaffold_test.sh` quality-surface parity section

**Interfaces:**
- Consumes: migration engine, CLI `values0`/`patch`, and writer scripts.
- Produces: an idempotent `/setup` flow that preserves comments and unknowns.

- [ ] **Step 1: Write failing command-contract tests**

Assert the command names both new paths, invokes migration before reads,
contains no direct `jq` or legacy writer, warns before patching, patches owned
fields rather than regenerating the document, documents deprecation output,
and applies the explicit parent/target scaffold contract. In the shell test,
assert parent `new`/target `skip` bookkeeping, interview values in both,
target `project_folder: null`, independent comment preservation, and the six
new Prism manifest/reader/writer entries in `quality-surface.manifest`.

- [ ] **Step 2: Verify RED**

```bash
php vendor/bin/pest tests/Unit/Harness/SetupCommandPrismManifestTest.php
bash tests/Shell/setup_write_project_config_test.sh
bash tests/Shell/setup_scaffold_test.sh
```

Expected: FAIL on every legacy path and whole-file template instruction.

- [ ] **Step 3: Rewrite the `/setup` manifest sections**

Invoke `migrate-setup.sh` at entry; stop on failure. Read defaults through the
CLI. Before writing, show the exact project/user paths and state that owned
fields will change while comments/unknown fields remain. Add
`setup-write-project-config.sh <manifest> parent|target`; it validates required
environment variables, builds the fixed dot-path update map without evaluating
values, and calls `patch <manifest> project 0644`. Parent mode writes actual
scaffold bookkeeping; target mode writes `skip`/null. Use it for root and, after
`clone`/`new` copying, target manifests. Use the user writer for mode `0600`.
Add `setup-write-project-config.sh` to the quality surface in this task; the
manifest and reader/CLI entries already landed with Tasks 1-3. Change
`copy_quality_surface()` so clone mode copies `prism.jsonc` only when the clone
lacks it. If a clone already has `prism.jsonc`, validate and preserve its bytes
until the targeted patch; malformed input fails closed. New mode copies the
canonical template normally. Remove the wholesale JSON template.

- [ ] **Step 4: Verify GREEN**

```bash
php vendor/bin/pest tests/Unit/Harness/SetupCommandPrismManifestTest.php
bash tests/Shell/setup_write_project_config_test.sh
bash tests/Shell/setup_scaffold_test.sh
```

Expected: PASS.

- [ ] **Step 5: Commit the `/setup` contract**

```bash
git add .opencode/commands/setup.md .github/scripts/setup-write-project-config.sh .github/scripts/quality-surface.manifest tests/Unit/Harness/SetupCommandPrismManifestTest.php tests/Shell/setup_write_project_config_test.sh tests/Shell/setup_scaffold_test.sh
commit_with_attribution 'refactor(setup): patch prism manifests in place' 'Refs: #276'
```

### Task 7: Write user configuration as comment-preserving JSONC

**Files:**
- Modify: `.github/scripts/setup-write-user-config.sh:1-76`
- Modify: `tests/Shell/setup_write_user_config_test.sh:1-130`

**Interfaces:**
- Consumes: CLI `patch FILE user 0600` and predefined setup environment
  variables.
- Produces: partial user `prism.jsonc` with preserved comments/unrelated keys.

- [ ] **Step 1: Add failing user-writer tests**

Test new-file creation, required variable rejection, partial nested patch,
preserved `env`/experimental/custom fields and comments, malformed-file
failure without clobbering, mode `0600`, atomicity, and symlink refusal.

- [ ] **Step 2: Verify RED**

```bash
bash tests/Shell/setup_write_user_config_test.sh
```

Expected: FAIL because the script still writes plain JSON via `jq`.

- [ ] **Step 3: Replace `jq` merge with JSONC patching**

Default to `$HOME/.config/opencode/prism.jsonc`, create a canonical commented
partial v5 document when absent, build updates without interpolating values
into executable shell, call CLI patch, and enforce `0600` after rename. Keep
`SETUP_USER_CONFIG` as the test override.

- [ ] **Step 4: Verify GREEN**

```bash
bash tests/Shell/setup_write_user_config_test.sh
```

Expected: all user writer cases PASS.

- [ ] **Step 5: Commit the writer slice**

```bash
git add .github/scripts/setup-write-user-config.sh tests/Shell/setup_write_user_config_test.sh
commit_with_attribution 'refactor(setup): write user prism JSONC safely' 'Refs: #276'
```

### Task 8: Read scaffold state through the shared boundary

**Files:**
- Modify: `.github/scripts/setup-scaffold.sh:16-43,295-345`
- Modify: `tests/Shell/setup_scaffold_test.sh:864-1016`

**Interfaces:**
- Consumes: one project-only CLI `values0 PROJECT - setup_version scaffold_mode
  project_folder` snapshot.
- Produces: unchanged `should-prompt` exit behavior for JSONC v5.

- [ ] **Step 1: Add failing JSONC scaffold fixtures**

Retain version/mode/folder/drift cases and add comments, proof that user
bookkeeping values are ignored, missing project failure, and `clone`/`new` copies that
contain root `prism.jsonc` plus `setup-write-project-config.sh` for target
initialization.

- [ ] **Step 2: Verify RED**

```bash
bash tests/Shell/setup_scaffold_test.sh
```

Expected: relevant cases FAIL because `sed` reads the legacy path.

- [ ] **Step 3: Replace `sed` parsing with CLI lookups**

Default project to `$REPO_ROOT/prism.jsonc` and pass `-` as the user source so
bookkeeping cannot be overlaid. Read version/mode/folder from one buffered
`values0` snapshot. Preserve exit
`0` for prompt and `1` for short-circuit, and reserve `2` for configuration
errors so `/setup` cannot mistake malformed input for a prompt decision.

- [ ] **Step 4: Verify GREEN**

```bash
bash tests/Shell/setup_scaffold_test.sh
```

Expected: all scaffold tests PASS.

- [ ] **Step 5: Commit the scaffold slice**

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
commit_with_attribution 'refactor(setup): read scaffold state from prism JSONC' 'Refs: #276'
```

### Task 9: Preserve staged secret enforcement and CI parity

**Files:**
- Modify: `.github/scripts/check-setup-secrets.sh:1-65`
- Modify: `.github/hooks/pre-commit:144-154`
- Modify: `.github/workflows/ci.yml:132-133,335-337`
- Modify: `tests/Shell/setup_secrets_test.sh:1-220`

**Interfaces:**
- Consumes: CLI `check-secrets FILE`.
- Produces: identical local/CI rejection of any non-empty committed `env.*`.

- [ ] **Step 1: Add failing staged JSONC security tests**

Test empty comments/trailing commas pass; non-empty string/number/boolean/object
values fail; malformed JSONC, duplicate keys, a missing required project
manifest, absent PHP, and unexpected `env` shape fail; output lists key paths
but not values; staged content wins over the working tree.

- [ ] **Step 2: Verify RED**

```bash
bash tests/Shell/setup_secrets_test.sh
```

Expected: FAIL because the current guard and hook target legacy JSON.

- [ ] **Step 3: Repoint the shared guard, hook, and CI**

Default the guard to `prism.jsonc`, call the PHP CLI, change staged-path matching
and extraction to root `prism.jsonc`, and rename both CI steps. A missing default
project manifest is an error; only an explicitly optional fixture path may be
absent. Keep the same script in local and CI paths; do not add divergent
workflow parsing.

- [ ] **Step 4: Verify GREEN**

```bash
bash tests/Shell/setup_secrets_test.sh
```

Expected: all secret and staged-blob cases PASS.

- [ ] **Step 5: Commit the enforcement slice**

```bash
git add .github/scripts/check-setup-secrets.sh .github/hooks/pre-commit .github/workflows/ci.yml tests/Shell/setup_secrets_test.sh
commit_with_attribution 'refactor(security): guard staged prism manifest secrets' 'Refs: #276'
```

### Task 10: Update existing model and experimental contract tests

**Files:**
- Modify: `tests/Unit/Harness/ModelConfigTest.php:16-23,52-72,205-216,274-301,443-477`
- Modify: `tests/Shell/research_background_scout_test.sh:1-65`
- Modify: `tests/Shell/setup_substitution_test.sh:169`

**Interfaces:**
- Consumes: root `prism.jsonc` and CLI `decode`.
- Produces: path/schema/default-value parity coverage with no direct JSONC
  parsing duplication.

- [ ] **Step 1: Change assertions first and verify failures**

Require root `prism.jsonc`, schema v5, all five model/variant tiers, empty
project `env.*`, `.envrc` CLI wiring, and absence of direct setup/jq sourcing.

```bash
php vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php
bash tests/Shell/research_background_scout_test.sh
```

Expected before fixture/helper updates: FAIL on legacy path assumptions.

- [ ] **Step 2: Reuse the production JSONC reader in test bootstrap**

Replace setup-specific direct `json_decode` calls with
`PrismJsoncDocument::fromFile()`. Do not broaden this task into rewriting the
separate `opencode.jsonc` helper beyond delegating its comment stripping if the
new reader is source-compatible.

- [ ] **Step 3: Run focused suites**

```bash
php vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php
bash tests/Shell/research_background_scout_test.sh
bash tests/Shell/setup_substitution_test.sh
```

Expected: PASS.

- [ ] **Step 4: Commit the parity updates**

```bash
git add tests/Unit/Harness/ModelConfigTest.php tests/Shell/research_background_scout_test.sh tests/Shell/setup_substitution_test.sh
commit_with_attribution 'test(config): align harness tests with prism v5' 'Refs: #276'
```

### Task 11: Verify adversarial behavior across assembled consumers

**Files:**
- Create: `tests/Shell/prism_manifest_integration_test.sh`
- Test: `tests/Unit/Harness/PrismJsoncDocumentTest.php`
- Test: `tests/Unit/Harness/PrismManifestCliTest.php`

**Interfaces:**
- Consumes: all parser, overlay, patch, CLI, and migration interfaces.
- Produces: one cross-consumer regression suite; parser/CLI edge cases already
  entered RED in Tasks 1-2 and are not postponed to this task.

- [ ] **Step 1: Add cross-boundary failing integration cases**

Reuse the Task 1-2 fixture corpus through actual `.envrc`, identity, scaffold,
migration, writer, and secret-guard entry points. Assert that parser outcomes
remain identical through every consumer, migration rollback leaves source
bytes intact, later legacy detection warns, shell metacharacters remain data,
and diagnostics remain secret-redacted. Failures here may change only consumer
wiring; parser/CLI behavior changes require returning to the owning task and
its RED test first.

- [ ] **Step 2: Run the adversarial suite**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismJsoncDocumentTest.php tests/Unit/Harness/PrismManifestCliTest.php
bash tests/Shell/prism_manifest_integration_test.sh
```

Expected on first run: FAIL because the cross-consumer integration script does
not exist; production parser semantics are already green from Tasks 1-2.

- [ ] **Step 3: Re-run until all adversarial cases pass**

Run the same commands. Expected: PASS with no warnings or secret values.

- [ ] **Step 4: Run changed-file coverage**

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
git diff --name-only develop...HEAD -- '*.php' \
  | php .github/scripts/coverage-gate.php tests/coverage.xml --strict
```

Expected: coverage gate PASS and every changed PHP source file at least 80%.

- [ ] **Step 5: Commit the adversarial suite**

```bash
git add tests/Shell/prism_manifest_integration_test.sh
commit_with_attribution 'test(config): harden prism JSONC boundaries' 'Refs: #276'
```

### Task 12: Update living documentation and domain context

**Files:**
- Modify: `AGENTS.md:157-172,238-263`
- Modify: `README.md:141,312-319,343,369-375`
- Modify: `CONTEXT.md:24-31,79-87,142-160`
- Modify: `CODING_HARNESS.md:54,65,87-95`
- Modify: `CONTRIBUTING.md:54`
- Modify: `.opencode/docs/model-configuration.md:18-22,177`
- Modify: `.opencode/docs/mcp.md:18-19,67,76-79,164`
- Modify: `.opencode/docs/research.md:10`
- Modify: `.opencode/commands/research.md:12,30`
- Modify: `.opencode/commands/doctor.md:120-126,168,206-209`
- Modify: `.opencode/skills/research-background/SKILL.md:16,91`
- Modify: `.opencode/skills/conventional-commits/SKILL.md:54-55`
- Modify: `.opencode/agents/tdd.md:150-151`
- Modify: `opencode.jsonc:41-43`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md:18,64,85`
- Create: `tests/Unit/Harness/PrismManifestDocsTest.php`

**Interfaces:**
- Consumes: accepted ADR-0043 and implemented paths/CLI behavior.
- Produces: one consistent vocabulary and setup procedure.

- [ ] **Step 1: Add or update documentation parity assertions**

Create `PrismManifestDocsTest.php` to assert every living file in this task
names `prism.jsonc`, contains no active project/user setup path, and keeps model
tables aligned with the root manifest. Assert `/doctor` has no `jq` prerequisite
and runs `prism_manifest.php` validation instead. Also reject active
`~/.config/opencode/models.env` guidance. Exclude historical ADRs/plans/specs
from stale-reference assertions.

- [ ] **Step 2: Verify RED**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php
```

Expected: FAIL while living docs still use legacy vocabulary.

- [ ] **Step 3: Update all living documents**

Verify and refine the prerequisite definitions of `Prism manifest`, `project
Prism manifest`, `user Prism manifest`, and `manifest resolution order` in
`CONTEXT.md`; keep manifest invariants under Entities & Invariants, ADR-0043 in
Architectural Decisions, and root/user manifests in owned/boundary interfaces.
Verify `AGENTS.md` carries the narrow exception allowing human-invoked `/setup`
to migrate, write, chmod, and remove only `~/.config/opencode/setup.json` and
`~/.config/opencode/prism.jsonc`. Document restart/`direnv allow`, v5 migration,
PHP requirement, user secret location, and field overlay semantics elsewhere.
`/doctor` must report the already-tested PHP 8.5 floor plus a `prism-config`
row whose check validates the project and optional user manifests through the
CLI; remove `jq` from its table and rules. Missing/invalid project config and a
malformed present user config are blocking FAIL results; an absent user config
is a valid project-default-only PASS.

- [ ] **Step 4: Verify GREEN and scan active content**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php tests/Unit/Harness/ModelConfigTest.php
rg -n '\.opencode/setup\.json|~/\.config/opencode/setup\.json|~/\.config/opencode/models\.env' AGENTS.md README.md CONTEXT.md CODING_HARNESS.md CONTRIBUTING.md opencode.jsonc .opencode/agents .opencode/commands .opencode/docs .opencode/skills .github/PULL_REQUEST_TEMPLATE.md
```

Expected: tests PASS; grep returns only explicitly documented legacy migration
and deprecation references.

- [ ] **Step 5: Commit the documentation slice**

```bash
git add AGENTS.md README.md CONTEXT.md CODING_HARNESS.md CONTRIBUTING.md opencode.jsonc .opencode/docs/model-configuration.md .opencode/docs/mcp.md .opencode/docs/research.md .opencode/commands/research.md .opencode/commands/doctor.md .opencode/skills/research-background/SKILL.md .opencode/skills/conventional-commits/SKILL.md .opencode/agents/tdd.md .github/PULL_REQUEST_TEMPLATE.md tests/Unit/Harness/PrismManifestDocsTest.php
commit_with_attribution 'docs(config): document prism manifest resolution' 'Refs: #276'
```

### Task 13: Complete the quality-surface cutover and delete project legacy

**Files:**
- Modify: `tests/Shell/setup_scaffold_test.sh` quality-surface parity section
- Delete: `.opencode/setup.json`

**Interfaces:**
- Consumes: every migrated reader/writer and root `prism.jsonc`.
- Produces: a repository and scaffold surface with no project fallback.

- [ ] **Step 1: Make final parity fail while the legacy project file exists**

Retain the six Task-6 quality-surface requirements and add an assertion that
the repository and scaffold surface contain no `.opencode/setup.json`.

- [ ] **Step 2: Verify RED**

```bash
bash tests/Shell/setup_scaffold_test.sh
```

Expected: FAIL because the tracked legacy project file still exists.

- [ ] **Step 3: Update the quality surface and remove the tracked legacy file**

Before deleting `.opencode/setup.json`, use the
migration projection to compare its semantic v5 value with the verified root
`prism.jsonc`; abort the task if they differ. Delete it only after equality is
proven, then verify every active reader/writer/enforcement path targets
`prism.jsonc`. Do not add a fallback branch.

- [ ] **Step 4: Run focused and full verification**

```bash
bash tests/Shell/setup_scaffold_test.sh
for test_file in tests/Shell/*_test.sh; do bash "$test_file"; done
php -d pcov.enabled=1 vendor/bin/pest --coverage
git diff --name-only develop...HEAD -- '*.php' \
  | php .github/scripts/coverage-gate.php tests/coverage.xml --strict
rg --hidden -n '\.opencode/setup\.json|\.config/opencode/setup\.json|models\.env' \
  --glob '!.git/**' --glob '!adr/**' --glob '!docs/plans/**' --glob '!docs/specs/**' .
```

Expected: every test and coverage gate PASS; stale-reference scan shows only
intentional migration/deprecation strings.

- [ ] **Step 5: Commit the final cutover**

```bash
git add tests/Shell/setup_scaffold_test.sh prism.jsonc .opencode/setup.json
commit_with_attribution 'refactor(setup): complete prism manifest cutover' 'Fixes: #276'
```

---

## Coverage targets

- `PrismJsoncDocument.php`: at least 90% line coverage because malformed-input
  and source-span behavior are the highest-risk boundary.
- `PrismManifest.php`, `prism_manifest.php`: at least 90% line coverage.
- Every other changed PHP source file: at least 80% line coverage.
- Shell behavior is covered through explicit success/failure assertions and
  the complete `tests/Shell/*_test.sh` run.
- Coverage does not replace cases for duplicate keys, injection payloads,
  migration rollback, permissions, or secret redaction.

## Verification checklist

- [ ] ADR-0043 exists and is Accepted before Task 1.
- [ ] Project and user fixtures accept line/block comments and trailing commas.
- [ ] Comment markers and escaped delimiters inside strings survive parsing.
- [ ] Duplicate keys and malformed higher-priority user config fail closed.
- [ ] User values overlay fields while missing fields inherit project values.
- [ ] Repeated `/setup` patches are byte-idempotent and preserve comments.
- [ ] User writes are atomic, mode `0600`, and reject symlinks.
- [ ] Legacy files are deleted only after verified migration.
- [ ] `.envrc` uses no `eval` and exports byte-identical default values.
- [ ] Project `env.*` values remain empty and staged-blob checks fail closed.
- [ ] No active project-level fallback or `models.env` source remains.
- [ ] All shell tests pass on Linux-compatible Bash; CI preserves macOS parity.
- [ ] `php -d pcov.enabled=1 vendor/bin/pest --coverage` passes.
- [ ] `git diff --name-only develop...HEAD -- '*.php' | php
  .github/scripts/coverage-gate.php tests/coverage.xml --strict` passes.
- [ ] `/check` passes.
- [ ] `@code-review` completes without unresolved blocking findings.
- [ ] A human performs the push.

## Open risks

1. **Tokenizer correctness:** JSONC lexical edge cases, duplicate keys, and
   source-span insertion are the dominant risk. Task 1 needs extra review.
2. **Round-trip semantics:** Replacing scalar spans is tractable; insertion into
   sparsely formatted or comment-heavy objects must remain deterministic and
   byte-idempotent.
3. **Security:** Shell transport, symlink handling, file modes, error redaction,
   and staged-content validation are mandatory, not cleanup work.
4. **Migration conflicts:** A machine may contain both old and new user files.
   The implementation must refuse destructive reconciliation and direct the
   user to resolve it.
5. **External-directory boundary:** `/setup` needs the narrow documented human
   exception for exactly the two user manifest paths; tests must always replace
   `HOME` with a temporary directory.
6. **Cross-platform atomicity:** Same-directory temporary files and renames must
   work on Linux and macOS; permissions must be asserted without assuming GNU
   `stat` syntax.
7. **Blast radius:** More than 35 active/historical references exist. Historical
   ADRs/plans/specs remain immutable, while active source and living docs must
   have no accidental legacy reads.

After Task 2 fixes the public tokenizer/document API, request a focused
`@architect` re-review before wiring shell consumers if implementation pressure
would require changing the parser, patch, transport, or fail-closed contracts.
