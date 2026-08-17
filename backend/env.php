<?php

declare(strict_types=1);

# $KYAULabs: env.php kyau@aura.kyaulabs 2026/08/16 -0700 Exp $



















/**
 * Safely reads a boolean environment variable.
 *
 * Uses filter_var with FILTER_VALIDATE_BOOL to correctly handle
 * string values from the environment (e.g., "false" → false),
 * unlike (bool) casts which treat all non-empty strings as true.
 *
 * Reads from $_ENV first, falling back to getenv(). An empty-string $_ENV
 * value is treated as unset so it does not shadow a real getenv() value.
 * An unparseable (present-but-garbage) value is logged via error_log before
 * the default is returned.
 *
 * @param  string $key      Environment variable name.
 * @param  bool   $default  Default value if the variable is unset or unparseable.
 * @return bool             Parsed boolean value.
 */
function env_bool(string $key, bool $default = false): bool
{
    $envValue = $_ENV[$key] ?? null;

    // Treat an empty-string $_ENV entry as unset so getenv() is consulted.
    // Without this, a `.env` line like `APP_DEBUG=` (empty) shadows a real
    // server value delivered only via getenv().
    $value = ($envValue === null || $envValue === '')
        ? getenv($key)
        : $envValue;

    if ($value === false || $value === null || $value === '') {
        return $default;
    }

    $parsed = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);

    if ($parsed === null) {
        error_log(sprintf(
            'env_bool: cannot parse value "%s" for %s; using default %s',
            $value,
            $key,
            $default ? 'true' : 'false'
        ));

        return $default;
    }

    return $parsed;
}

/**
 * Parses a raw `.env` value (the text after the first `=`).
 *
 * Strips an inline `#` comment from unquoted values: a `#` that begins the
 * value or is preceded by whitespace starts a comment (`FOO=1 # note` → `1`;
 * `FOO=a#b` keeps `a#b`). Quoted values are taken literally between the first
 * matching pair of single or double quotes — a `#` inside quotes is preserved,
 * and any text after the closing quote is dropped. Surrounding whitespace on
 * unquoted values is trimmed.
 *
 * @param  string $raw The untrimmed text following the first `=`.
 * @return string      The cleaned value (may be empty).
 */
function parse_env_value(string $raw): string
{
    $value = ltrim($raw);

    if ($value !== '' && ($value[0] === '"' || $value[0] === "'")) {
        $quote = $value[0];
        $close = strpos($value, $quote, 1);

        if ($close === false) {
            return substr($value, 1);
        }

        return substr($value, 1, $close - 1);
    }

    // Unquoted: locate the first `#` that starts the value or follows
    // whitespace. `FOO=a#b` is preserved (no whitespace before the `#`).
    $commentStart = null;

    if ($value !== '' && $value[0] === '#') {
        $commentStart = 0;
    } else {
        foreach ([' #', "\t#"] as $marker) {
            $at = strpos($value, $marker);

            if ($at !== false) {
                $commentStart = $at + 1;
                break;
            }
        }
    }

    if ($commentStart !== null) {
        $value = substr($value, 0, $commentStart);
    }

    return rtrim($value);
}

/**
 * Reports whether an env var name is dangerous to load from a file.
 *
 * These names yield code execution or library/module hijacking in child
 * processes (dynamic-linker preloads, shell startup files, interpreter
 * options). If a `.env` file is ever attacker-influenced, blocking them
 * prevents a file write from becoming remote code execution. Matched
 * case-sensitively — the real-world vectors use these exact canonical names.
 * The list is deliberately small and extensible.
 *
 * @param  string $key Environment variable name.
 * @return bool        True if the name must never be loaded from a file.
 */
function is_dangerous_env_name(string $key): bool
{
    static $dangerous = [
        'LD_PRELOAD',
        'LD_AUDIT',
        'LD_LIBRARY_PATH',
        'DYLD_INSERT_LIBRARIES',
        'DYLD_LIBRARY_PATH',
        'BASH_ENV',
        'ENV',
        'ZDOTDIR',
        'PERL5OPT',
        'PERL5LIB',
        'IFS',
    ];

    return in_array($key, $dangerous, true);
}

/**
 * Loads environment variables from a .env file.
 *
 * Parses a file with KEY=VALUE pairs (one per line), skipping blank lines
 * and comment lines (starting with # or ;). A leading UTF-8 BOM and an
 * optional `export ` shell prefix are stripped. Key names are validated
 * against `/^[A-Za-z_][A-Za-z0-9_]*$/` (invalid keys are skipped), and
 * dangerous child-process env names are refused (see
 * is_dangerous_env_name()). Values are trimmed, surrounding matching single
 * or double quotes are stripped, and an inline `#` comment on unquoted
 * values is removed (a `#` inside quotes is preserved). Keys that already
 * exist in $_ENV or getenv() are never overwritten — server environment
 * variables take priority over file values.
 *
 * If the file does not exist, this function is a silent no-op (production
 * safety: absent .env means debug stays off).
 *
 * @param string $path  Absolute or relative path to the .env file.
 * @return void
 * @note Never throws — unreadable files and failed reads are logged via
 *       error_log and defaults are used; absent files stay a silent no-op.
 */
function load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    if (!is_readable($path)) {
        error_log("load_env: {$path} exists but is not readable; using defaults");

        return;
    }

    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        error_log("load_env: failed to read {$path}; using defaults");

        return;
    }

    // Strip a leading UTF-8 BOM (EF BB BF) so a Windows-saved file does not
    // fold the BOM into the first key name.
    if (isset($lines[0]) && str_starts_with($lines[0], "\xEF\xBB\xBF")) {
        $lines[0] = substr($lines[0], 3);
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || $line[0] === '#' || $line[0] === ';') {
            continue;
        }

        // Strip an optional `export ` shell prefix (e.g. `export FOO=bar`).
        $line = preg_replace('/^export[ \t]+/', '', $line);

        $pos = strpos($line, '=');

        if ($pos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $pos));

        // Validate the key name: POSIX env identifiers only. Rejects malformed
        // lines and keys carrying whitespace or shell metacharacters.
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key) !== 1) {
            continue;
        }

        // Refuse to load names that execute code in child processes if the
        // file is ever attacker-influenced (issue #192).
        if (is_dangerous_env_name($key)) {
            continue;
        }

        $value = parse_env_value(substr($line, $pos + 1));

        // Server env wins — never overwrite an already-set key
        if (isset($_ENV[$key]) || getenv($key) !== false) {
            continue;
        }

        $_ENV[$key] = $value;
        putenv("{$key}={$value}");
    }
}







// vim: ft=php sts=4 sw=4 ts=4 et :
