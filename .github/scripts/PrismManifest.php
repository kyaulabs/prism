<?php

declare(strict_types=1);

# $KYAULabs: PrismManifest.php kyau@cosmos.kyaulabs 2026/08/02 -0700 Exp $




namespace KYAULabs\Prism;

require_once __DIR__ . '/PrismJsoncException.php';
require_once __DIR__ . '/PrismJsoncDocument.php';

/**
 * Project/user manifest resolution and validation for ADR-0043.
 *
 * {@see self::resolve()} produces a recursive field-by-field overlay of an
 * optional user manifest over the required project manifest: object keys
 * merge recursively while arrays and scalars are replaced atomically. Objects
 * remain {@see \stdClass} throughout so `{}` and `[]` never collapse. The
 * result is always a fresh tree; neither input is mutated.
 *
 * One security-scoped exception to the atomic-array-replace rule (ADR-0048 §1):
 * `security.additional_sensitive_paths` is unioned across tiers — the user
 * tier can add paths but never remove project-tier entries.
 */
final class PrismManifest
{
    /** @var list<string> */
    private const array TIERS = ['primary', 'planner', 'design', 'judge', 'utility'];

    /** @var list<string> */
    private const array EXPERIMENTAL = ['lsp_tool', 'scout', 'background_subagents'];

    /** @var list<string> */
    private const array ACCENTS = ['sky-blue', 'light-purple'];

    /** @var list<string> */
    private const array SCAFFOLD_MODES = ['skip', 'clone', 'new'];

    /** @var list<string> */
    private const array MCP = ['deepseek_websearch', 'searxng'];

    /** @var list<string> */
    private const array PLUGINS = ['opencode_quota'];

    /**
     * Overlay an optional user manifest over the project manifest.
     *
     * @param  \stdClass       $project  Required project defaults.
     * @param  \stdClass|null  $user     Optional user overrides; null is valid.
     * @return \stdClass  A fresh resolved tree (neither input is mutated).
     */
    public static function resolve(\stdClass $project, ?\stdClass $user): \stdClass
    {
        $base = self::cloneObject($project);

        if ($user !== null) {
            self::overlay($base, $user);
        }

        self::unionSensitivePaths($base, $project, $user);

        return $base;
    }

    /**
     * Union the security.additional_sensitive_paths lists across both tiers.
     *
     * ADR-0048 §1 scoped exception to the atomic-array-replace overlay rule:
     * the user tier can add sensitive paths but never silently drop
     * project-tier additions. Reads the field from the original project and
     * user trees (when present and arrays), concatenates project then user,
     * deduplicates exact strings preserving order, and sets the union on the
     * base tree. A field absent from both tiers leaves the base untouched.
     * Malformed (non-array) lists are skipped here; validation and the env0
     * transport fail closed on them.
     *
     * @param  \stdClass      $base     Resolved tree (mutated in place).
     * @param  \stdClass|null $project  Original project manifest (read only).
     * @param  \stdClass|null $user     Original user manifest (read only).
     * @return void
     */
    private static function unionSensitivePaths(\stdClass $base, ?\stdClass $project, ?\stdClass $user): void
    {
        $sources = [];

        foreach ([$project, $user] as $tier) {
            if (
                $tier instanceof \stdClass
                && property_exists($tier, 'security')
                && $tier->security instanceof \stdClass
                && property_exists($tier->security, 'additional_sensitive_paths')
            ) {
                $sources[] = $tier->security->additional_sensitive_paths;
            }
        }

        if ($sources === []) {
            return;
        }

        if (!property_exists($base, 'security') || !($base->security instanceof \stdClass)) {
            $base->security = new \stdClass();
        }

        $merged = [];

        foreach ($sources as $list) {
            if (!is_array($list)) {
                continue;
            }

            foreach ($list as $entry) {
                if (is_string($entry) && !in_array($entry, $merged, true)) {
                    $merged[] = $entry;
                }
            }
        }

        $base->security->additional_sensitive_paths = $merged;
    }

    /**
     * Recursively overlay a user object onto a base object in place.
     *
     * Object keys present in both merge recursively; every other user value
     * replaces the base value atomically. User values are deep-cloned so the
     * user tree is never mutated or aliased into the result.
     *
     * @param  \stdClass $base  Resolved tree (mutated in place).
     * @param  \stdClass $user  User overlay source (read only).
     * @return void
     */
    private static function overlay(\stdClass $base, \stdClass $user): void
    {
        foreach (get_object_vars($user) as $key => $userValue) {
            $baseValue = property_exists($base, $key) ? $base->{$key} : null;

            if ($baseValue instanceof \stdClass && $userValue instanceof \stdClass) {
                self::overlay($baseValue, $userValue);
            } else {
                $base->{$key} = self::cloneValue($userValue);
            }
        }
    }

    /**
     * Deep-clone a stdClass object into a fresh tree.
     *
     * @param  \stdClass $object
     * @return \stdClass
     */
    private static function cloneObject(\stdClass $object): \stdClass
    {
        $clone = new \stdClass();

        foreach (get_object_vars($object) as $key => $value) {
            $clone->{$key} = self::cloneValue($value);
        }

        return $clone;
    }

    /**
     * Deep-clone a decoded value, preserving stdClass vs list distinction.
     *
     * @param  mixed $value
     * @return mixed
     */
    private static function cloneValue(mixed $value): mixed
    {
        if ($value instanceof \stdClass) {
            return self::cloneObject($value);
        }

        if (is_array($value)) {
            return array_map(self::cloneValue(...), $value);
        }

        return $value;
    }

    /**
     * Validate a complete schema-v5 project manifest.
     *
     * Every required section must be present with the correct type. Unknown
     * fields are preserved and never rejected. Throws on the first violation;
     * diagnostics name only the offending field path, never any value.
     *
     * @param  \stdClass $manifest
     * @return void
     * @throws PrismJsoncException  On any missing field, wrong type, bad enum,
     *                              or non-empty committed env value.
     */
    public static function validateProject(\stdClass $manifest): void
    {
        self::requireVersion($manifest);
        self::requireTimestamp($manifest, 'timestamp');
        self::requireBoolean($manifest, 'configured');

        foreach (['app', 'domain', 'repo', 'signed_off_by_name', 'signed_off_by_email'] as $field) {
            self::requireNonEmptyString($manifest, $field);
        }

        self::requireEnum($manifest, 'accent', self::ACCENTS);
        self::requireEnum($manifest, 'scaffold_mode', self::SCAFFOLD_MODES);
        self::requireStringOrNull($manifest, 'project_folder');
        self::requireStringSection($manifest, 'models', self::TIERS);
        self::requireStringSection($manifest, 'variants', self::TIERS);
        self::requireBooleanSection($manifest, 'experimental', self::EXPERIMENTAL);
        self::optionalBooleanSection($manifest, 'mcp', self::MCP);
        self::optionalBooleanSection($manifest, 'plugins', self::PLUGINS);
        self::requireEmptyEnv($manifest);
        self::validateSensitivePathList($manifest, 'project');
    }

    /**
     * Validate a partial schema-v5 user manifest.
     *
     * setup_version is required and must be exactly 5. Every other field is
     * optional, but any present field must still carry a correct type and
     * value (enums, non-empty strings, booleans). Unlike the project
     * manifest, non-empty env overrides are permitted because the user
     * manifest is the legitimate secret home.
     *
     * @param  \stdClass $manifest
     * @return void
     * @throws PrismJsoncException  On a missing or wrong setup_version, or a
     *                              wrong-typed/wrong-valued present field.
     */
    public static function validateUser(\stdClass $manifest): void
    {
        self::requireVersion($manifest);

        self::optionalTimestamp($manifest, 'timestamp');
        self::optionalBoolean($manifest, 'configured');

        foreach (['app', 'domain', 'repo', 'signed_off_by_name', 'signed_off_by_email'] as $field) {
            self::optionalNonEmptyString($manifest, $field);
        }

        self::optionalEnum($manifest, 'accent', self::ACCENTS);
        self::optionalEnum($manifest, 'scaffold_mode', self::SCAFFOLD_MODES);
        self::optionalStringOrNull($manifest, 'project_folder');
        self::optionalStringSection($manifest, 'models', self::TIERS);
        self::optionalStringSection($manifest, 'variants', self::TIERS);
        self::optionalBooleanSection($manifest, 'experimental', self::EXPERIMENTAL);
        self::optionalBooleanSection($manifest, 'mcp', self::MCP);
        self::optionalBooleanSection($manifest, 'plugins', self::PLUGINS);
        self::optionalStringEnvSection($manifest, 'env');
        self::validateSensitivePathList($manifest, 'user');
    }

    /**
     * Validate a present security.additional_sensitive_paths list fails closed.
     *
     * ADR-0048 §7: when present, the field must be an array whose entries are
     * all ~/-prefixed or absolute path strings free of control characters; the
     * security section itself must be an object. Any other shape throws so
     * malformed additions surface at validation time, before env0 or CI
     * consumers see them. Diagnostics name only the field path and tier,
     * never a value.
     *
     * @param  \stdClass $manifest
     * @param  string    $tier     'project' or 'user' for the diagnostic.
     * @return void
     * @throws PrismJsoncException  On a malformed security section or list.
     */
    private static function validateSensitivePathList(\stdClass $manifest, string $tier): void
    {
        if (!property_exists($manifest, 'security')) {
            return;
        }

        if (!($manifest->security instanceof \stdClass)) {
            throw new PrismJsoncException(
                'field security in the ' . $tier . ' manifest must be an object — fail closed (ADR-0048)',
            );
        }

        if (!property_exists($manifest->security, 'additional_sensitive_paths')) {
            return;
        }

        $list = $manifest->security->additional_sensitive_paths;

        if (!is_array($list)) {
            throw new PrismJsoncException(
                'security.additional_sensitive_paths in the ' . $tier
                . ' manifest must be an array of ~/-prefixed or absolute path strings — fail closed (ADR-0048)',
            );
        }

        foreach ($list as $entry) {
            self::validateSensitivePathEntry($entry, 'security.additional_sensitive_paths in the ' . $tier . ' manifest');
        }
    }

    /**
     * Validate one additional-sensitive-path entry fails closed.
     *
     * Single source of the load-bearing entry rule (ADR-0047/0048): a string
     * that is ~/-prefixed or absolute and free of control characters. Shared
     * with the env0 transport coercion in prism_manifest.php so the two
     * layers cannot drift. Diagnostics name only the field path, never a
     * value.
     *
     * @param  mixed  $entry
     * @param  string $label  Dotted manifest path for the diagnostic.
     * @return void
     * @throws PrismJsoncException  On a malformed entry.
     */
    public static function validateSensitivePathEntry(mixed $entry, string $label): void
    {
        if (
            !is_string($entry)
            || preg_match('/^(~\/|\/)/', $entry) !== 1
            || preg_match('/[\x00-\x1f\x7f]/', $entry) === 1
        ) {
            throw new PrismJsoncException(
                $label . ' must be an array of ~/-prefixed or absolute path strings — fail closed (ADR-0048)',
            );
        }
    }

    /**
     * Require setup_version to be exactly the integer 5.
     *
     * @param  \stdClass $manifest
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireVersion(\stdClass $manifest): void
    {
        if (!property_exists($manifest, 'setup_version') || $manifest->setup_version !== 5) {
            throw new PrismJsoncException('setup_version must be exactly 5');
        }
    }

    // ── Required field helpers (missing → throw) ────────────────────────────

    /**
     * Require a non-empty string field; throw if missing, non-string, or empty.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireNonEmptyString(\stdClass $manifest, string $field): void
    {
        if (!property_exists($manifest, $field)) {
            throw new PrismJsoncException('missing required field: ' . $field);
        }

        self::assertNonEmptyString($manifest, $field);
    }

    /**
     * Require a present ISO-8601 timestamp field; throw if missing or malformed.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireTimestamp(\stdClass $manifest, string $field): void
    {
        if (!property_exists($manifest, $field)) {
            throw new PrismJsoncException('missing required field: ' . $field);
        }

        self::guardTimestamp($manifest->{$field}, $field);
    }

    /**
     * Require a boolean field; throw if missing or non-boolean.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireBoolean(\stdClass $manifest, string $field): void
    {
        if (!property_exists($manifest, $field)) {
            throw new PrismJsoncException('missing required field: ' . $field);
        }

        self::assertBoolean($manifest, $field);
    }

    /**
     * Require a field to be one of an allowlisted set; throw if missing/invalid.
     *
     * @param  \stdClass       $manifest
     * @param  string          $field
     * @param  list<string>    $allowed
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireEnum(\stdClass $manifest, string $field, array $allowed): void
    {
        if (!property_exists($manifest, $field)) {
            throw new PrismJsoncException('missing required field: ' . $field);
        }

        self::assertEnum($manifest, $field, $allowed);
    }

    /**
     * Require a field to be null or a string; throw if missing or wrong type.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireStringOrNull(\stdClass $manifest, string $field): void
    {
        if (!property_exists($manifest, $field)) {
            throw new PrismJsoncException('missing required field: ' . $field);
        }

        self::assertStringOrNull($manifest, $field);
    }

    /**
     * Require a nested object section whose named keys are non-empty strings.
     *
     * @param  \stdClass    $manifest
     * @param  string       $section
     * @param  list<string> $keys
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireStringSection(\stdClass $manifest, string $section, array $keys): void
    {
        $value = self::requireObjectSection($manifest, $section);

        foreach ($keys as $key) {
            if (!property_exists($value, $key)) {
                throw new PrismJsoncException('missing required field: ' . $section . '.' . $key);
            }

            self::guardNonEmptyString($value->{$key}, $section . '.' . $key);
        }
    }

    /**
     * Require a nested object section whose named keys are booleans.
     *
     * @param  \stdClass    $manifest
     * @param  string       $section
     * @param  list<string> $keys
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireBooleanSection(\stdClass $manifest, string $section, array $keys): void
    {
        $value = self::requireObjectSection($manifest, $section);

        foreach ($keys as $key) {
            if (!property_exists($value, $key)) {
                throw new PrismJsoncException('missing required field: ' . $section . '.' . $key);
            }

            self::guardBoolean($value->{$key}, $section . '.' . $key);
        }
    }

    /**
     * Require a section to exist and be an object; return it.
     *
     * @param  \stdClass $manifest
     * @param  string    $section
     * @return \stdClass
     * @throws PrismJsoncException
     */
    private static function requireObjectSection(\stdClass $manifest, string $section): \stdClass
    {
        if (!property_exists($manifest, $section)) {
            throw new PrismJsoncException('missing required field: ' . $section);
        }

        $value = $manifest->{$section};

        if (!($value instanceof \stdClass)) {
            throw new PrismJsoncException('field ' . $section . ' must be an object');
        }

        return $value;
    }

    /**
     * Require the env section to be an object whose values are all empty.
     *
     * @param  \stdClass $manifest
     * @return void
     * @throws PrismJsoncException
     */
    private static function requireEmptyEnv(\stdClass $manifest): void
    {
        if (!property_exists($manifest, 'env')) {
            throw new PrismJsoncException('missing required field: env');
        }

        $env = $manifest->env;

        if (!($env instanceof \stdClass)) {
            throw new PrismJsoncException('field env must be an object');
        }

        foreach (get_object_vars($env) as $key => $value) {
            if ($value !== '') {
                throw new PrismJsoncException('env.' . $key . ' must be empty in the project manifest');
            }
        }
    }

    // ── Optional field helpers (skip when absent) ───────────────────────────

    /**
     * Validate a present non-empty string field; no-op when absent.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalNonEmptyString(\stdClass $manifest, string $field): void
    {
        if (property_exists($manifest, $field)) {
            self::assertNonEmptyString($manifest, $field);
        }
    }

    /**
     * Validate a present ISO-8601 timestamp field; no-op when absent.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalTimestamp(\stdClass $manifest, string $field): void
    {
        if (property_exists($manifest, $field)) {
            self::guardTimestamp($manifest->{$field}, $field);
        }
    }

    /**
     * Validate a present boolean field; no-op when absent.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalBoolean(\stdClass $manifest, string $field): void
    {
        if (property_exists($manifest, $field)) {
            self::assertBoolean($manifest, $field);
        }
    }

    /**
     * Validate a present enum field; no-op when absent.
     *
     * @param  \stdClass       $manifest
     * @param  string          $field
     * @param  list<string>    $allowed
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalEnum(\stdClass $manifest, string $field, array $allowed): void
    {
        if (property_exists($manifest, $field)) {
            self::assertEnum($manifest, $field, $allowed);
        }
    }

    /**
     * Validate a present string-or-null field; no-op when absent.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalStringOrNull(\stdClass $manifest, string $field): void
    {
        if (property_exists($manifest, $field)) {
            self::assertStringOrNull($manifest, $field);
        }
    }

    /**
     * Validate a present string section; no-op when absent.
     *
     * @param  \stdClass    $manifest
     * @param  string       $section
     * @param  list<string> $keys
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalStringSection(\stdClass $manifest, string $section, array $keys): void
    {
        if (property_exists($manifest, $section)) {
            self::assertStringSection($manifest, $section, $keys);
        }
    }

    /**
     * Validate a present boolean section; no-op when absent.
     *
     * @param  \stdClass    $manifest
     * @param  string       $section
     * @param  list<string> $keys
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalBooleanSection(\stdClass $manifest, string $section, array $keys): void
    {
        if (property_exists($manifest, $section)) {
            self::assertBooleanSection($manifest, $section, $keys);
        }
    }

    /**
     * Validate a present env section as string-valued; no-op when absent.
     *
     * Unlike the project manifest, values may be non-empty (user secrets).
     *
     * @param  \stdClass $manifest
     * @param  string    $section
     * @return void
     * @throws PrismJsoncException
     */
    private static function optionalStringEnvSection(\stdClass $manifest, string $section): void
    {
        if (!property_exists($manifest, $section)) {
            return;
        }

        $env = $manifest->{$section};

        if (!($env instanceof \stdClass)) {
            throw new PrismJsoncException('field ' . $section . ' must be an object');
        }

        foreach (get_object_vars($env) as $key => $value) {
            if (!is_string($value)) {
                throw new PrismJsoncException('env.' . $key . ' must be a string');
            }
        }
    }

    // ── Value assertions (assume the field is present) ──────────────────────

    /**
     * Guard that a present value is a non-empty string.
     *
     * @param  mixed  $value
     * @param  string $path  Dotted field path for the diagnostic.
     * @return void
     * @throws PrismJsoncException
     */
    private static function guardNonEmptyString(mixed $value, string $path): void
    {
        if (!is_string($value) || $value === '') {
            throw new PrismJsoncException('field ' . $path . ' must be a non-empty string');
        }
    }

    /**
     * Guard that a present value is a non-empty ISO-8601 timestamp string.
     *
     * Accepts the date, date-time-with-Z, and date-time-with-offset subsets
     * (e.g. {@code 2026-07-28}, {@code 2026-07-28T14:30:00Z},
     * {@code 2026-07-28T14:30:00+00:00}). A well-shaped but impossible date
     * (e.g. month 13) is rejected via {@see \DateTimeImmutable} overflow
     * warnings.
     *
     * @param  mixed  $value
     * @param  string $path  Dotted field path for the diagnostic.
     * @return void
     * @throws PrismJsoncException
     */
    private static function guardTimestamp(mixed $value, string $path): void
    {
        if (!is_string($value) || $value === '') {
            throw new PrismJsoncException('field ' . $path . ' must be a non-empty string');
        }

        if (!self::isIso8601($value)) {
            throw new PrismJsoncException('field ' . $path . ' must be an ISO-8601 timestamp');
        }
    }

    /**
     * Whether a string is a real ISO-8601 timestamp in the accepted subset.
     *
     * @param  string $value
     * @return bool
     */
    private static function isIso8601(string $value): bool
    {
        if (
            preg_match(
                '/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/',
                $value,
            ) !== 1
        ) {
            return false;
        }

        $parsed = @date_create_immutable($value);

        if ($parsed === false) {
            return false;
        }

        $errors = \DateTimeImmutable::getLastErrors();

        return $errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0);
    }

    /**
     * Guard that a present value is a boolean.
     *
     * @param  mixed  $value
     * @param  string $path  Dotted field path for the diagnostic.
     * @return void
     * @throws PrismJsoncException
     */
    private static function guardBoolean(mixed $value, string $path): void
    {
        if (!is_bool($value)) {
            throw new PrismJsoncException('field ' . $path . ' must be a boolean');
        }
    }

    /**
     * Assert a present field is a non-empty string.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function assertNonEmptyString(\stdClass $manifest, string $field): void
    {
        self::guardNonEmptyString($manifest->{$field}, $field);
    }

    /**
     * Assert a present field is a boolean.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function assertBoolean(\stdClass $manifest, string $field): void
    {
        self::guardBoolean($manifest->{$field}, $field);
    }

    /**
     * Assert a present field is one of an allowlisted set of strings.
     *
     * @param  \stdClass       $manifest
     * @param  string          $field
     * @param  list<string>    $allowed
     * @return void
     * @throws PrismJsoncException
     */
    private static function assertEnum(\stdClass $manifest, string $field, array $allowed): void
    {
        $value = $manifest->{$field};

        if (!is_string($value) || !in_array($value, $allowed, true)) {
            throw new PrismJsoncException(
                'field ' . $field . ' must be one of: ' . implode(', ', $allowed),
            );
        }
    }

    /**
     * Assert a present field is null or a string.
     *
     * @param  \stdClass $manifest
     * @param  string    $field
     * @return void
     * @throws PrismJsoncException
     */
    private static function assertStringOrNull(\stdClass $manifest, string $field): void
    {
        $value = $manifest->{$field};

        if ($value !== null && !is_string($value)) {
            throw new PrismJsoncException('field ' . $field . ' must be a string or null');
        }
    }

    /**
     * Assert a present section is an object whose named keys are non-empty strings.
     *
     * Missing keys are allowed (partial user overrides); only present keys are
     * checked.
     *
     * @param  \stdClass    $manifest
     * @param  string       $section
     * @param  list<string> $keys
     * @return void
     * @throws PrismJsoncException
     */
    private static function assertStringSection(\stdClass $manifest, string $section, array $keys): void
    {
        $value = $manifest->{$section};

        if (!($value instanceof \stdClass)) {
            throw new PrismJsoncException('field ' . $section . ' must be an object');
        }

        foreach ($keys as $key) {
            if (!property_exists($value, $key)) {
                continue;
            }

            self::guardNonEmptyString($value->{$key}, $section . '.' . $key);
        }
    }

    /**
     * Assert a present section is an object whose named keys are booleans.
     *
     * Missing keys are allowed (partial user overrides); only present keys are
     * checked.
     *
     * @param  \stdClass    $manifest
     * @param  string       $section
     * @param  list<string> $keys
     * @return void
     * @throws PrismJsoncException
     */
    private static function assertBooleanSection(\stdClass $manifest, string $section, array $keys): void
    {
        $value = $manifest->{$section};

        if (!($value instanceof \stdClass)) {
            throw new PrismJsoncException('field ' . $section . ' must be an object');
        }

        foreach ($keys as $key) {
            if (!property_exists($value, $key)) {
                continue;
            }

            self::guardBoolean($value->{$key}, $section . '.' . $key);
        }
    }
}









// vim: ft=php sts=4 sw=4 ts=4 et :
