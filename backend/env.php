<?php

declare(strict_types=1);

# $KYAULabs: env.php kyau@nova 2026/07/06 -0700 Exp $

/**
 * Safely reads a boolean environment variable.
 *
 * Uses filter_var with FILTER_VALIDATE_BOOL to correctly handle
 * string values from the environment (e.g., "false" → false),
 * unlike (bool) casts which treat all non-empty strings as true.
 *
 * Reads from $_ENV first, falling back to getenv().
 *
 * @param  string $key      Environment variable name.
 * @param  bool   $default  Default value if the variable is unset or unparseable.
 * @return bool             Parsed boolean value.
 */
function env_bool(string $key, bool $default = false): bool
{
    $value = $_ENV[$key] ?? getenv($key);

    if ($value === false || $value === null) {
        return $default;
    }

    return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
}

// vim: ft=php sts=4 sw=4 ts=4 et :
