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

/**
 * Loads environment variables from a .env file.
 *
 * Parses a file with KEY=VALUE pairs (one per line), skipping blank lines
 * and comment lines (starting with # or ;). Values are trimmed, and
 * surrounding matching single or double quotes are stripped. Keys that
 * already exist in $_ENV or getenv() are never overwritten — server
 * environment variables take priority over file values.
 *
 * If the file does not exist, this function is a silent no-op (production
 * safety: absent .env means debug stays off).
 *
 * @param string $path  Absolute or relative path to the .env file.
 * @return void
 */
function load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || $line[0] === '#' || $line[0] === ';') {
            continue;
        }

        $pos = strpos($line, '=');

        if ($pos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));

        if ($key === '') {
            continue;
        }

        // Strip surrounding matching quotes (single or double)
        $len = strlen($value);
        if (
            $len >= 2
            && (($value[0] === '"' && $value[$len - 1] === '"')
                || ($value[0] === "'" && $value[$len - 1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        // Server env wins — never overwrite an already-set key
        if (isset($_ENV[$key]) || getenv($key) !== false) {
            continue;
        }

        $_ENV[$key] = $value;
        putenv("{$key}={$value}");
    }
}

// vim: ft=php sts=4 sw=4 ts=4 et :
