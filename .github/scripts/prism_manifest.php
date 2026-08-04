<?php

declare(strict_types=1);

# $KYAULabs: prism_manifest.php kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $




namespace KYAULabs\Prism;

/**
 * Shell-facing CLI for the ADR-0043 prism manifest boundary.
 *
 * Ten commands operate on schema-v6 JSONC manifests via the dependency-free
 * {@see PrismJsoncDocument} parser and {@see PrismManifest} resolver/validator:
 *
 *   validate FILE project|user
 *   decode  FILE
 *   env0    PROJECT [USER]
 *   get     PROJECT USER_OR_DASH DOT_PATH
 *   values0 PROJECT USER_OR_DASH DOT_PATH...
 *   patch   FILE project|user OCTAL_MODE < updates.json
 *   upgrade-v6 FILE project|user OCTAL_MODE
 *   migrate-preview LEGACY project|user
 *   migrate LEGACY TARGET project|user OCTAL_MODE
 *   check-secrets FILE project|user
 *
 * Exit codes: 0 success; 1 malformed/unsafe input, validation failure, secret
 * violation, write failure, or migration conflict; 2 invalid command or arity.
 * Diagnostics go to stderr and never embed decoded values.
 *
 * Command logic is pure: {@see dispatch()} returns a {@see PrismCliResult}
 * without touching streams, so it is fully testable in-process. {@see main()}
 * is the thin I/O shell that reads stdin, emits the result streams, and exits.
 */

require_once __DIR__ . '/PrismManifest.php';
require_once __DIR__ . '/PrismOpenCodeConfig.php';

/**
 * Allowlisted dot-path to environment-variable name map for the env0 command.
 *
 * Seventeen scalar variables: fifteen OPENCODE_* plus DEEPSEEK_API_KEY and
 * SEARXNG_URL. The eighteenth stable env0 pair is the list-valued
 * OPENCODE_SENSITIVE_PATHS from {@see PRISM_LIST_ENV_MAP}.
 *
 * @var array<string, string>
 */
const PRISM_ENV_MAP = [
    'models.primary' => 'OPENCODE_MODEL_PRIMARY',
    'models.planner' => 'OPENCODE_MODEL_PLANNER',
    'models.design' => 'OPENCODE_MODEL_DESIGN',
    'models.judge' => 'OPENCODE_MODEL_JUDGE',
    'models.utility' => 'OPENCODE_MODEL_UTILITY',
    'models.frontend' => 'OPENCODE_MODEL_FRONTEND',
    'variants.primary' => 'OPENCODE_VARIANT_PRIMARY',
    'variants.planner' => 'OPENCODE_VARIANT_PLANNER',
    'variants.design' => 'OPENCODE_VARIANT_DESIGN',
    'variants.judge' => 'OPENCODE_VARIANT_JUDGE',
    'variants.utility' => 'OPENCODE_VARIANT_UTILITY',
    'variants.frontend' => 'OPENCODE_VARIANT_FRONTEND',
    'experimental.lsp_tool' => 'OPENCODE_EXPERIMENTAL_LSP_TOOL',
    'experimental.scout' => 'OPENCODE_EXPERIMENTAL_SCOUT',
    'experimental.background_subagents' => 'OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS',
    'env.deepseek_api_key' => 'DEEPSEEK_API_KEY',
    'env.searxng_url' => 'SEARXNG_URL',
];

/**
 * List-valued dot-path to environment-variable name map for the env0 command.
 *
 * The sixteenth stable env0 pair: additional sensitive paths from the security
 * section (ADR-0047), newline-joined. Absent key emits the empty string;
 * malformed values fail closed.
 *
 * @var array<string, string>
 */
const PRISM_LIST_ENV_MAP = [
    'security.additional_sensitive_paths' => 'OPENCODE_SENSITIVE_PATHS',
];

/**
 * Direct-preference dot-path to environment-variable name map for the env0 command.
 *
 * Three diagnostic booleans: user-requested MCP and plugin preferences from the
 * resolved Prism manifest, emitted after the eighteen stable env0 pairs. Default to
 * false when the dot path is absent.
 *
 * @var array<string, string>
 */
const PRISM_TOGGLE_ENV_MAP = [
    'mcp.deepseek_websearch' => 'OPENCODE_MCP_DEEPSEEK_WEBSEARCH',
    'mcp.searxng' => 'OPENCODE_MCP_SEARXNG',
    'plugins.opencode_quota' => 'OPENCODE_PLUGIN_OPENCODE_QUOTA',
];

/**
 * Default FRONTEND model injected by project-mode v6 migration.
 *
 * @var string
 */
const PRISM_FRONTEND_MODEL = 'openai/gpt-5.6-sol';

/**
 * Default FRONTEND variant injected by project-mode v6 migration.
 *
 * @var string
 */
const PRISM_FRONTEND_VARIANT = 'xhigh';

if (defined('PRISM_MANIFEST_AS_LIBRARY')) {
    return;
}

exit(main($argv));

/**
 * Thin process I/O shell: read stdin, dispatch, emit streams, exit.
 *
 * @param  array<int, string> $argv
 * @return int
 */
function main(array $argv): int
{
    $stdin = ($argv[1] ?? '') === 'patch' ? (string) stream_get_contents(STDIN) : '';
    $result = dispatch($argv, $stdin);

    if ($result->stdout !== '') {
        echo $result->stdout;
    }

    if ($result->stderr !== '') {
        fwrite(STDERR, $result->stderr);
    }

    return $result->exit;
}

/**
 * Dispatch a command to its handler, mapping exceptions to redacted results.
 *
 * Pure with respect to the process streams: every command returns a
 * {@see PrismCliResult} carrying its exit code, stdout, and stderr. Expected
 * boundary failures (PrismJsoncException, JsonException) map to a redacted
 * exit-1 result; any other Throwable maps to a generic secret-free exit-1
 * result. Invalid command or arity maps to exit 2.
 *
 * @param  array<int, string> $argv
 * @param  string             $stdin  Patch updates JSON (empty otherwise).
 * @return PrismCliResult
 */
function dispatch(array $argv, string $stdin): PrismCliResult
{
    $command = $argv[1] ?? '';

    $known = [
        'decode' => 1, 'validate' => 1, 'env0' => 1, 'get' => 1, 'values0' => 1,
        'patch' => 1, 'upgrade-v6' => 1, 'migrate-preview' => 1, 'migrate' => 1,
        'check-secrets' => 1,
    ];

    if (!isset($known[$command])) {
        return new PrismCliResult(2, stderr: 'prism_manifest: unknown command: ' . $command);
    }

    try {
        return match ($command) {
            'decode' => cmd_decode($argv),
            'validate' => cmd_validate($argv),
            'env0' => cmd_env0($argv),
            'get' => cmd_get($argv),
            'values0' => cmd_values0($argv),
            'patch' => cmd_patch($argv, $stdin),
            'upgrade-v6' => cmd_upgrade_v6($argv),
            'migrate-preview' => cmd_migrate_preview($argv),
            'migrate' => cmd_migrate($argv),
            'check-secrets' => cmd_check_secrets($argv),
        };
    } catch (PrismJsoncException | \JsonException $e) {
        return new PrismCliResult(1, stderr: 'prism_manifest: ' . $e->getMessage());
    } catch (\Throwable $e) {
        return new PrismCliResult(1, stderr: 'prism_manifest: unexpected manifest failure');
    }
}

/**
 * decode FILE — print the parsed root as strict normalized JSON.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_decode(array $argv): PrismCliResult
{
    if (count($argv) !== 3) {
        return new PrismCliResult(2, stderr: 'prism_manifest: decode requires exactly one FILE argument');
    }

    $root = PrismJsoncDocument::fromFile($argv[2])->root();

    return new PrismCliResult(0, stdout: json_encode($root, JSON_THROW_ON_ERROR));
}

/**
 * validate FILE project|user — validate a manifest against its tier contract.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_validate(array $argv): PrismCliResult
{
    if (count($argv) !== 4) {
        return new PrismCliResult(2, stderr: 'prism_manifest: validate requires FILE and project|user');
    }

    [, , $file, $mode] = $argv;

    if ($mode !== 'project' && $mode !== 'user') {
        return new PrismCliResult(2, stderr: 'prism_manifest: validate mode must be project or user');
    }

    $root = PrismJsoncDocument::fromFile($file)->root();

    if ($mode === 'project') {
        PrismManifest::validateProject($root);
    } else {
        PrismManifest::validateUser($root);
    }

    return new PrismCliResult(0);
}

/**
 * env0 PROJECT [USER] — emit allowlisted env vars as NUL-separated pairs.
 *
 * Resolves the project plus optional user overlay, then buffers and validates
 * all twenty-two pairs before producing any output. Rejects non-scalar values
 * and NUL bytes (which would corrupt the NUL-delimited framing).
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_env0(array $argv): PrismCliResult
{
    if (count($argv) !== 3 && count($argv) !== 4) {
        return new PrismCliResult(2, stderr: 'prism_manifest: env0 requires PROJECT and optional USER');
    }

    $resolved = pm_load_resolved($argv[2], $argv[3] ?? '-');
    $existing = getenv('OPENCODE_CONFIG_CONTENT');
    $inline = is_string($existing) ? $existing : null;

    return new PrismCliResult(0, stdout: pm_nul_pairs(pm_env_pairs($resolved, $inline)));
}

/**
 * get PROJECT USER_OR_DASH DOT_PATH — print one resolved scalar value.
 *
 * USER_OR_DASH is '-' for no user manifest. Object/array results fail closed.
 * env.* values are redacted to "[redacted]" (ADR-0047 CLI exfiltration close);
 * the real value remains reachable only through env0 for direnv.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_get(array $argv): PrismCliResult
{
    if (count($argv) !== 5) {
        return new PrismCliResult(2, stderr: 'prism_manifest: get requires PROJECT USER_OR_DASH DOT_PATH');
    }

    [, , $projectFile, $userDash, $dotPath] = $argv;
    $resolved = pm_load_resolved($projectFile, $userDash);
    $value = pm_resolve_dot($resolved, $dotPath);

    if (str_starts_with($dotPath, 'env.')) {
        return new PrismCliResult(0, stdout: '[redacted]');
    }

    return new PrismCliResult(0, stdout: pm_scalar_to_string($value));
}

/**
 * values0 PROJECT USER_OR_DASH DOT_PATH... — emit requested scalars as NUL pairs.
 *
 * Resolves one immutable project/user snapshot, then emits each requested dot
 * path interleaved with its scalar value. Used by identity/scaffold consumers
 * so files cannot change between reads. env.* values are redacted to
 * "[redacted]" in the emitted pairs (ADR-0047 CLI exfiltration close); env0
 * remains the only stdout path that carries real values.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_values0(array $argv): PrismCliResult
{
    if (count($argv) < 5) {
        return new PrismCliResult(2, stderr: 'prism_manifest: values0 requires PROJECT USER_OR_DASH DOT_PATH...');
    }

    $resolved = pm_load_resolved($argv[2], $argv[3]);
    $pairs = [];

    for ($i = 4, $n = count($argv); $i < $n; $i++) {
        $dotPath = $argv[$i];
        $pairs[] = $dotPath;
        $pairs[] = str_starts_with($dotPath, 'env.')
            ? '[redacted]'
            : pm_scalar_to_transport(pm_resolve_dot($resolved, $dotPath), $dotPath);
    }

    return new PrismCliResult(0, stdout: pm_nul_pairs($pairs));
}

/**
 * patch FILE project|user OCTAL_MODE < updates.json — patch and rewrite.
 *
 * Reads a strict JSON object (dot path => value) from stdin, delegates to
 * {@see PrismJsoncDocument::withValues()}, validates the result per the tier,
 * and writes it atomically at the octal mode. The file is never modified when
 * patching or validation fails.
 *
 * @param  array<int, string> $argv
 * @param  string             $stdin  Strict JSON object of dot-path updates.
 * @return PrismCliResult
 */
function cmd_patch(array $argv, string $stdin): PrismCliResult
{
    if (count($argv) !== 5) {
        return new PrismCliResult(2, stderr: 'prism_manifest: patch requires FILE project|user OCTAL_MODE');
    }

    [, , $file, $mode, $modeString] = $argv;

    if ($mode !== 'project' && $mode !== 'user') {
        return new PrismCliResult(2, stderr: 'prism_manifest: patch mode must be project or user');
    }

    if (preg_match('/^0[0-7]{3}$/', $modeString) !== 1) {
        return new PrismCliResult(2, stderr: 'prism_manifest: OCTAL_MODE must match ^0[0-7]{3}$');
    }

    try {
        $updates = json_decode($stdin, false, 512, JSON_THROW_ON_ERROR);
    } catch (\JsonException $e) {
        throw new PrismJsoncException('patch input is not valid JSON', 0, $e);
    }

    if (!($updates instanceof \stdClass)) {
        throw new PrismJsoncException('patch input must be a JSON object');
    }

    $patched = PrismJsoncDocument::fromFile($file)->withValues(get_object_vars($updates));
    $root = $patched->root();

    if ($mode === 'project') {
        PrismManifest::validateProject($root);
    } else {
        PrismManifest::validateUser($root);
    }

    $patched->writeAtomic($file, intval($modeString, 8));

    return new PrismCliResult(0);
}

/**
 * upgrade-v6 FILE project|user OCTAL_MODE — patch a manifest in place to v6.
 *
 * Pushes setup_version to 6 via {@see PrismJsoncDocument::withValues()} so
 * comments, unknown fields, and every unrelated byte are preserved. In project
 * mode, absent models.frontend/variants.frontend keys gain the shipped
 * defaults; user mode patches only setup_version so partial manifests keep
 * inheriting project values. The upgraded tree is validated per the tier and
 * written atomically at the octal mode only when something actually changed,
 * so a repeat run is byte-idempotent.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_upgrade_v6(array $argv): PrismCliResult
{
    if (count($argv) !== 5) {
        return new PrismCliResult(2, stderr: 'prism_manifest: upgrade-v6 requires FILE project|user OCTAL_MODE');
    }

    [, , $file, $mode, $modeString] = $argv;
    if ($mode !== 'project' && $mode !== 'user') {
        return new PrismCliResult(2, stderr: 'prism_manifest: upgrade-v6 mode must be project or user');
    }
    if (preg_match('/^0[0-7]{3}$/', $modeString) !== 1) {
        return new PrismCliResult(2, stderr: 'prism_manifest: OCTAL_MODE must match ^0[0-7]{3}$');
    }

    $document = PrismJsoncDocument::fromFile($file);
    $root = $document->root();
    pm_guard_source_version($root);

    $updates = ['setup_version' => PrismManifest::SCHEMA_VERSION];
    if ($mode === 'project') {
        $updates = array_merge($updates, pm_add_frontend_defaults($root, true));
    }

    $upgraded = $document->withValues($updates);
    $upgradedRoot = $upgraded->root();
    if ($mode === 'project') {
        PrismManifest::validateProject($upgradedRoot);
    } else {
        PrismManifest::validateUser($upgradedRoot);
    }

    if (!pm_objects_equal($root, $upgradedRoot)) {
        $upgraded->writeAtomic($file, intval($modeString, 8));
    }

    return new PrismCliResult(0);
}

/**
 * migrate-preview LEGACY project|user — print the v6 projection without writing.
 *
 * Reads a legacy source, refuses a version newer than 6, and prints the
 * normalized strict-JSON projection (setup_version forced to 6; project mode
 * adds absent frontend defaults). No file is created, modified, or deleted.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_migrate_preview(array $argv): PrismCliResult
{
    if (count($argv) !== 4) {
        return new PrismCliResult(2, stderr: 'prism_manifest: migrate-preview requires LEGACY and project|user');
    }

    [, , $legacy, $mode] = $argv;

    if ($mode !== 'project' && $mode !== 'user') {
        return new PrismCliResult(2, stderr: 'prism_manifest: migrate-preview mode must be project or user');
    }

    $root = PrismJsoncDocument::fromFile($legacy)->root();
    pm_guard_source_version($root);

    $json = json_encode(
        pm_project_v6($root, $mode),
        JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
    );

    return new PrismCliResult(0, stdout: $json);
}

/**
 * migrate LEGACY TARGET project|user OCTAL_MODE — atomically migrate to v6.
 *
 * Refuses an existing target and a source version newer than 6, writes a
 * canonical commented v6 document, reparses it for validation, writes
 * atomically at the octal mode, then removes the legacy source.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_migrate(array $argv): PrismCliResult
{
    if (count($argv) !== 6) {
        return new PrismCliResult(2, stderr: 'prism_manifest: migrate requires LEGACY TARGET project|user OCTAL_MODE');
    }

    [, , $legacy, $target, $mode, $modeString] = $argv;

    if ($mode !== 'project' && $mode !== 'user') {
        return new PrismCliResult(2, stderr: 'prism_manifest: migrate mode must be project or user');
    }

    if (preg_match('/^0[0-7]{3}$/', $modeString) !== 1) {
        return new PrismCliResult(2, stderr: 'prism_manifest: OCTAL_MODE must match ^0[0-7]{3}$');
    }

    if (file_exists($target)) {
        throw new PrismJsoncException('migration target already exists');
    }

    $root = PrismJsoncDocument::fromFile($legacy)->root();
    pm_guard_source_version($root);

    $projection = pm_project_v6($root, $mode);

    if ($mode === 'project') {
        PrismManifest::validateProject($projection);
    } else {
        PrismManifest::validateUser($projection);
    }

    $canonical = pm_canonical_v6($projection);
    PrismJsoncDocument::parse($canonical)->writeAtomic($target, intval($modeString, 8));

    // Re-read the written target and verify it matches the projection before
    // deleting the legacy source, so a torn write never loses the original.
    $verified = PrismJsoncDocument::fromFile($target)->root();

    if (!pm_objects_equal($verified, $projection)) {
        throw new PrismJsoncException('migration target did not verify against its projection');
    }

    if (!@unlink($legacy)) {
        throw new PrismJsoncException('cannot remove legacy file');
    }

    return new PrismCliResult(0);
}

/**
 * check-secrets FILE project|user — report non-empty committed env values.
 *
 * Walks the env section and prints the dotted key path of every value that is
 * not the empty string (a secret invariant violation). Values are never
 * printed. For project manifests a missing or non-object env is a structural
 * violation and fails closed; for user manifests env is optional, but a
 * present non-object env still fails closed. Exits 1 when any violation is
 * found, 0 otherwise.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_check_secrets(array $argv): PrismCliResult
{
    if (count($argv) !== 4) {
        return new PrismCliResult(2, stderr: 'prism_manifest: check-secrets requires FILE and project|user');
    }

    [, , $file, $mode] = $argv;

    if ($mode !== 'project' && $mode !== 'user') {
        return new PrismCliResult(2, stderr: 'prism_manifest: check-secrets mode must be project or user');
    }

    $root = PrismJsoncDocument::fromFile($file)->root();
    $hasEnv = property_exists($root, 'env');
    $envIsObject = $hasEnv && $root->env instanceof \stdClass;

    if ($mode === 'project' && !$envIsObject) {
        throw new PrismJsoncException('project manifest env must be an object');
    }

    if ($mode === 'user' && $hasEnv && !$envIsObject) {
        throw new PrismJsoncException('field env must be an object');
    }

    $violations = [];

    if ($envIsObject) {
        foreach (get_object_vars($root->env) as $key => $value) {
            if ($value !== '') {
                $violations[] = 'env.' . $key;
            }
        }
    }

    if ($violations === []) {
        return new PrismCliResult(0);
    }

    return new PrismCliResult(1, stdout: implode("\n", $violations) . "\n");
}

/**
 * Build ordered dot-path additions for absent FRONTEND defaults.
 *
 * @param  \stdClass $root
 * @param  bool      $includeMissingSections
 * @return array<string, string>
 */
function pm_add_frontend_defaults(\stdClass $root, bool $includeMissingSections): array
{
    $updates = [];
    $defaults = [
        'models' => PRISM_FRONTEND_MODEL,
        'variants' => PRISM_FRONTEND_VARIANT,
    ];

    foreach ($defaults as $section => $default) {
        $hasSection = property_exists($root, $section) && $root->{$section} instanceof \stdClass;
        if (($includeMissingSections || $hasSection)
            && (! $hasSection || ! property_exists($root->{$section}, 'frontend'))) {
            $updates[$section . '.frontend'] = $default;
        }
    }

    return $updates;
}

/**
 * Guard that a source manifest version is migratable.
 *
 * Accepts only positive integers no greater than the current schema version
 * (older schemas that the projection can upgrade, plus the current version
 * for idempotent migration). Rejects missing, non-integer, zero, negative,
 * and newer-than-current versions.
 *
 * @param  \stdClass $root
 * @return void
 * @throws PrismJsoncException  When setup_version is absent or not an integer in [1, SCHEMA_VERSION].
 */
function pm_guard_source_version(\stdClass $root): void
{
    if (
        !property_exists($root, 'setup_version')
        || !is_int($root->setup_version)
        || $root->setup_version < 1
        || $root->setup_version > PrismManifest::SCHEMA_VERSION
    ) {
        throw new PrismJsoncException(
            'setup_version must be a positive integer no greater than ' . PrismManifest::SCHEMA_VERSION,
        );
    }
}

/**
 * Compare two decoded objects for semantic equality by normalized JSON form.
 *
 * Used to verify a freshly written migration target round-trips to the same
 * tree as the projection computed before writing.
 *
 * @param  \stdClass $a
 * @param  \stdClass $b
 * @return bool
 */
function pm_objects_equal(\stdClass $a, \stdClass $b): bool
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

    return json_encode($a, $flags) === json_encode($b, $flags);
}

/**
 * Deep-clone a source manifest and force its schema version to 6.
 *
 * Project mode adds the shipped FRONTEND defaults when the models/variants
 * sections exist but lack a frontend key, so a v5 project gains its required
 * tier without overwriting pre-existing custom values. User mode only forces
 * the version; partial manifests keep inheriting project frontend values.
 *
 * @param  \stdClass $source
 * @param  string    $mode    'project' or 'user'.
 * @return \stdClass
 * @throws JsonException  If the value cannot be re-encoded (should not occur).
 */
function pm_project_v6(\stdClass $source, string $mode): \stdClass
{
    $clone = json_decode(
        json_encode($source, JSON_THROW_ON_ERROR),
        false,
        64,
        JSON_THROW_ON_ERROR,
    );

    $clone->setup_version = PrismManifest::SCHEMA_VERSION;

    if ($mode === 'project') {
        foreach (pm_add_frontend_defaults($clone, false) as $path => $default) {
            [$section] = explode('.', $path, 2);
            $clone->{$section}->frontend = $default;
        }
    }

    return $clone;
}

/**
 * Render a canonical commented schema-v6 JSONC document.
 *
 * @param  \stdClass $projection
 * @return string
 * @throws JsonException  If the projection cannot be encoded.
 */
function pm_canonical_v6(\stdClass $projection): string
{
    $json = json_encode(
        $projection,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
    );

    return "// Prism manifest (schema v" . PrismManifest::SCHEMA_VERSION . ")\n" . $json . "\n";
}

/**
 * Build the flat allowlisted env name/value pair list from a resolved manifest.
 *
 * Emits the eighteen stable env0 pairs (seventeen PRISM_ENV_MAP scalars plus the
 * PRISM_LIST_ENV_MAP path list), then three requested-preference toggle
 * diagnostics, then the composed OPENCODE_CONFIG_CONTENT. All pairs are
 * buffered before output so a mid-buffer failure produces no partial stream.
 *
 * @param  \stdClass        $resolved
 * @param  string|null      $existingInlineConfig  Inherited OPENCODE_CONFIG_CONTENT value.
 * @return list<string>     Interleaved [name, value, name, value, ...].
 * @throws PrismJsoncException  On a non-scalar value, a NUL byte in a value, or
 *                              a malformed additional-sensitive-paths list.
 */
function pm_env_pairs(\stdClass $resolved, ?string $existingInlineConfig = null): array
{
    $pairs = [];

    foreach (PRISM_ENV_MAP as $dotPath => $envName) {
        $pairs[] = $envName;
        $pairs[] = pm_scalar_to_transport(pm_resolve_dot($resolved, $dotPath), $envName);
    }
    foreach (PRISM_LIST_ENV_MAP as $dotPath => $envName) {
        $pairs[] = $envName;
        $pairs[] = pm_path_list_to_transport(pm_resolve_dot($resolved, $dotPath), $dotPath);
    }
    foreach (PRISM_TOGGLE_ENV_MAP as $dotPath => $envName) {
        $pairs[] = $envName;
        $pairs[] = pm_scalar_to_transport(pm_boolean_default_false($resolved, $dotPath), $envName);
    }

    $pairs[] = 'OPENCODE_CONFIG_CONTENT';
    $pairs[] = pm_scalar_to_transport(
        PrismOpenCodeConfig::compose($resolved, $existingInlineConfig),
        'OPENCODE_CONFIG_CONTENT',
    );

    return $pairs;
}

/**
 * Resolve a boolean preference from the manifest, defaulting to false when absent.
 *
 * @param  \stdClass $root
 * @param  string    $dotPath
 * @return bool
 * @throws PrismJsoncException  When the value exists but is not a boolean.
 */
function pm_boolean_default_false(\stdClass $root, string $dotPath): bool
{
    $value = pm_resolve_dot($root, $dotPath);
    if ($value === null) {
        return false;
    }
    if (!is_bool($value)) {
        throw new PrismJsoncException('field ' . $dotPath . ' must be a boolean');
    }

    return $value;
}

/**
 * Coerce the additional-sensitive-paths value to its transport string form.
 *
 * An absent key resolves to the empty string; an array whose entries are all
 * ~/-prefixed or absolute path strings free of control characters joins with
 * newlines (the plugin's newline-delimited OPENCODE_SENSITIVE_PATHS framing).
 * Any other shape fails closed so the deny floor can never be silently widened
 * by a malformed manifest (ADR-0047).
 *
 * @param  mixed  $value
 * @param  string $label  Dotted manifest path for the diagnostic (never a value).
 * @return string
 * @throws PrismJsoncException  When the value is not a valid path list.
 */
function pm_path_list_to_transport(mixed $value, string $label): string
{
    if ($value === null) {
        return '';
    }

    if (!is_array($value)) {
        throw new PrismJsoncException(
            $label . ' must be an array of ~/-prefixed or absolute path strings — fail closed (ADR-0047)',
        );
    }

    foreach ($value as $entry) {
        PrismManifest::validateSensitivePathEntry($entry, $label);
    }

    return implode("\n", $value);
}

/**
 * Encode interleaved name/value pairs as NUL-delimited transport bytes.
 *
 * The trailing NUL terminator is always appended so a shell reader using
 * paired {@code read -r -d ''} calls completes its final value read.
 * Centralized so env0 and values0 cannot drift in framing.
 *
 * @param  list<string> $pairs  Interleaved [name, value, name, value, ...].
 * @return string
 */
function pm_nul_pairs(array $pairs): string
{
    return implode("\0", $pairs) . "\0";
}

/**
 * Load and resolve a project manifest plus an optional user overlay.
 *
 * Both manifests are validated against their tier contract before overlay so
 * that unsupported schema versions, missing required project fields, or an
 * invalid user manifest fail closed here rather than reaching shell
 * consumers downstream.
 *
 * @param  string          $projectFile
 * @param  string          $userDash  User path, or '-' for no user manifest.
 * @return \stdClass       Resolved overlay tree.
 * @throws PrismJsoncException  On a malformed/missing file or invalid manifest.
 */
function pm_load_resolved(string $projectFile, string $userDash): \stdClass
{
    $project = PrismJsoncDocument::fromFile($projectFile)->root();
    PrismManifest::validateProject($project);

    $user = null;

    if ($userDash !== '-') {
        $user = PrismJsoncDocument::fromFile($userDash)->root();
        PrismManifest::validateUser($user);
    }

    return PrismManifest::resolve($project, $user);
}

/**
 * Resolve a dotted path against a resolved manifest root.
 *
 * @param  \stdClass $root
 * @param  string    $dotPath
 * @return mixed     The decoded value, or null when absent.
 */
function pm_resolve_dot(\stdClass $root, string $dotPath): mixed
{
    $current = $root;

    foreach (explode('.', $dotPath) as $segment) {
        if (!($current instanceof \stdClass) || !property_exists($current, $segment)) {
            return null;
        }

        $current = $current->{$segment};
    }

    return $current;
}

/**
 * Coerce a decoded value to its transport string form.
 *
 * Booleans render as true/false; null as the empty string; numbers via their
 * string cast. Objects and arrays cannot be transported and fail closed.
 *
 * @param  mixed $value
 * @return string
 * @throws PrismJsoncException  When the value is an object or array.
 */
function pm_scalar_to_string(mixed $value): string
{
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }

    if ($value === null) {
        return '';
    }

    if (is_string($value)) {
        return $value;
    }

    if (is_int($value) || is_float($value)) {
        return (string) $value;
    }

    throw new PrismJsoncException('value is not a scalar');
}

/**
 * Coerce a decoded value to a NUL-safe transport string.
 *
 * Delegates to {@see pm_scalar_to_string} and then rejects any NUL byte,
 * which would corrupt the NUL-delimited framing used by env0 and values0.
 * Shared so both commands apply identical framing safety.
 *
 * @param  mixed  $value
 * @param  string $label  Field/env name for the diagnostic (never a value).
 * @return string
 * @throws PrismJsoncException  When the value is non-scalar or holds a NUL byte.
 */
function pm_scalar_to_transport(mixed $value, string $label): string
{
    $scalar = pm_scalar_to_string($value);

    if (str_contains($scalar, "\0")) {
        throw new PrismJsoncException('NUL byte in value for ' . $label);
    }

    return $scalar;
}

/**
 * Immutable result of a CLI command: exit code plus captured stdout and stderr.
 */
final class PrismCliResult
{
    public function __construct(
        public readonly int $exit,
        public readonly string $stdout = '',
        public readonly string $stderr = '',
    ) {
    }
}











// vim: ft=php sts=4 sw=4 ts=4 et :
