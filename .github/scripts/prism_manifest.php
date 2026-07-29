<?php

declare(strict_types=1);

# $KYAULabs: prism_manifest.php kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $




namespace KYAULabs\Prism;

/**
 * Shell-facing CLI for the ADR-0043 prism manifest boundary.
 *
 * Nine commands operate on schema-v5 JSONC manifests via the dependency-free
 * {@see PrismJsoncDocument} parser and {@see PrismManifest} resolver/validator:
 *
 *   validate FILE project|user
 *   decode  FILE
 *   env0    PROJECT [USER]
 *   get     PROJECT USER_OR_DASH DOT_PATH
 *   values0 PROJECT USER_OR_DASH DOT_PATH...
 *   patch   FILE project|user OCTAL_MODE < updates.json
 *   migrate-preview LEGACY project|user
 *   migrate LEGACY TARGET project|user OCTAL_MODE
 *   check-secrets FILE
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

/**
 * Allowlisted dot-path to environment-variable name map for the env0 command.
 *
 * Exactly fifteen variables: thirteen OPENCODE_* plus DEEPSEEK_API_KEY and
 * SEARXNG_URL.
 *
 * @var array<string, string>
 */
const PRISM_ENV_MAP = [
    'models.primary' => 'OPENCODE_MODEL_PRIMARY',
    'models.planner' => 'OPENCODE_MODEL_PLANNER',
    'models.design' => 'OPENCODE_MODEL_DESIGN',
    'models.judge' => 'OPENCODE_MODEL_JUDGE',
    'models.utility' => 'OPENCODE_MODEL_UTILITY',
    'variants.primary' => 'OPENCODE_VARIANT_PRIMARY',
    'variants.planner' => 'OPENCODE_VARIANT_PLANNER',
    'variants.design' => 'OPENCODE_VARIANT_DESIGN',
    'variants.judge' => 'OPENCODE_VARIANT_JUDGE',
    'variants.utility' => 'OPENCODE_VARIANT_UTILITY',
    'experimental.lsp_tool' => 'OPENCODE_EXPERIMENTAL_LSP_TOOL',
    'experimental.scout' => 'OPENCODE_EXPERIMENTAL_SCOUT',
    'experimental.background_subagents' => 'OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS',
    'env.deepseek_api_key' => 'DEEPSEEK_API_KEY',
    'env.searxng_url' => 'SEARXNG_URL',
];

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
        'patch' => 1, 'migrate-preview' => 1, 'migrate' => 1, 'check-secrets' => 1,
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
 * all fifteen pairs before producing any output. Rejects non-scalar values
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

    return new PrismCliResult(0, stdout: implode("\0", pm_env_pairs($resolved)));
}

/**
 * get PROJECT USER_OR_DASH DOT_PATH — print one resolved scalar value.
 *
 * USER_OR_DASH is '-' for no user manifest. Object/array results fail closed.
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

    return new PrismCliResult(0, stdout: pm_scalar_to_string($value));
}

/**
 * values0 PROJECT USER_OR_DASH DOT_PATH... — emit requested scalars as NUL pairs.
 *
 * Resolves one immutable project/user snapshot, then emits each requested dot
 * path interleaved with its scalar value. Used by identity/scaffold consumers
 * so files cannot change between reads.
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
        $pairs[] = pm_scalar_to_string(pm_resolve_dot($resolved, $dotPath));
    }

    return new PrismCliResult(0, stdout: implode("\0", $pairs));
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
        $updates = json_decode($stdin, true, 512, JSON_THROW_ON_ERROR);
    } catch (\JsonException $e) {
        throw new PrismJsoncException('patch input is not valid JSON', 0, $e);
    }

    if (!is_array($updates)) {
        throw new PrismJsoncException('patch input must be a JSON object');
    }

    foreach (array_keys($updates) as $key) {
        if (!is_string($key)) {
            throw new PrismJsoncException('patch input must be a JSON object');
        }
    }

    $patched = PrismJsoncDocument::fromFile($file)->withValues($updates);
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
 * migrate-preview LEGACY project|user — print the v5 projection without writing.
 *
 * Reads a legacy source, refuses a version newer than 5, and prints the
 * normalized strict-JSON projection (setup_version forced to 5). No file is
 * created, modified, or deleted.
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
        pm_project_v5($root),
        JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
    );

    return new PrismCliResult(0, stdout: $json);
}

/**
 * migrate LEGACY TARGET project|user OCTAL_MODE — atomically migrate to v5.
 *
 * Refuses an existing target and a source version newer than 5, writes a
 * canonical commented v5 document, reparses it for validation, writes
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

    $canonical = pm_canonical_v5(pm_project_v5($root));
    PrismJsoncDocument::parse($canonical)->writeAtomic($target, intval($modeString, 8));

    if (!@unlink($legacy)) {
        throw new PrismJsoncException('cannot remove legacy file');
    }

    return new PrismCliResult(0);
}

/**
 * check-secrets FILE — report non-empty committed env values.
 *
 * Walks the env section and prints the dotted key path of every value that is
 * not the empty string (a secret invariant violation). Values are never
 * printed. Exits 1 when any violation is found, 0 otherwise.
 *
 * @param  array<int, string> $argv
 * @return PrismCliResult
 */
function cmd_check_secrets(array $argv): PrismCliResult
{
    if (count($argv) !== 3) {
        return new PrismCliResult(2, stderr: 'prism_manifest: check-secrets requires one FILE argument');
    }

    $root = PrismJsoncDocument::fromFile($argv[2])->root();
    $violations = [];

    if (property_exists($root, 'env') && $root->env instanceof \stdClass) {
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
 * Guard that a source manifest is not a version newer than 5.
 *
 * @param  \stdClass $root
 * @return void
 * @throws PrismJsoncException  When setup_version is an integer greater than 5.
 */
function pm_guard_source_version(\stdClass $root): void
{
    if (property_exists($root, 'setup_version') && is_int($root->setup_version) && $root->setup_version > 5) {
        throw new PrismJsoncException('refusing source version newer than 5');
    }
}

/**
 * Deep-clone a source manifest and force its schema version to 5.
 *
 * @param  \stdClass $source
 * @return \stdClass
 * @throws JsonException  If the value cannot be re-encoded (should not occur).
 */
function pm_project_v5(\stdClass $source): \stdClass
{
    $clone = json_decode(
        json_encode($source, JSON_THROW_ON_ERROR),
        false,
        64,
        JSON_THROW_ON_ERROR,
    );

    $clone->setup_version = 5;

    return $clone;
}

/**
 * Render a canonical commented schema-v5 JSONC document.
 *
 * @param  \stdClass $projection
 * @return string
 * @throws JsonException  If the projection cannot be encoded.
 */
function pm_canonical_v5(\stdClass $projection): string
{
    $json = json_encode(
        $projection,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
    );

    return "// Prism manifest (schema v5)\n" . $json . "\n";
}

/**
 * Build the flat allowlisted env name/value pair list from a resolved manifest.
 *
 * @param  \stdClass        $resolved
 * @return list<string>     Interleaved [name, value, name, value, ...].
 * @throws PrismJsoncException  On a non-scalar value or a NUL byte in a value.
 */
function pm_env_pairs(\stdClass $resolved): array
{
    $pairs = [];

    foreach (PRISM_ENV_MAP as $dotPath => $envName) {
        $value = pm_resolve_dot($resolved, $dotPath);
        $scalar = pm_scalar_to_string($value);

        if (str_contains($scalar, "\0")) {
            throw new PrismJsoncException('NUL byte in value for ' . $envName);
        }

        $pairs[] = $envName;
        $pairs[] = $scalar;
    }

    return $pairs;
}

/**
 * Load and resolve a project manifest plus an optional user overlay.
 *
 * @param  string          $projectFile
 * @param  string          $userDash  User path, or '-' for no user manifest.
 * @return \stdClass       Resolved overlay tree.
 * @throws PrismJsoncException  On a malformed or missing file.
 */
function pm_load_resolved(string $projectFile, string $userDash): \stdClass
{
    $project = PrismJsoncDocument::fromFile($projectFile)->root();
    $user = $userDash === '-' ? null : PrismJsoncDocument::fromFile($userDash)->root();

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
