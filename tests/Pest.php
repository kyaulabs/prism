<?php

declare(strict_types=1);

# $KYAULabs: Pest.php kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $



















/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

// pest()->extend(Tests\TestCase::class)->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" as well as code
| introspection capabilities used by the "expect()->to*" methods.
|
*/

// expect()->extend('toBeWithinRange', function (int $min, int $max) {
//     return $this->toBeGreaterThanOrEqual($min)
//                  ->toBeLessThanOrEqual($max);
// });

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Get the browser base URL for browser-based tests.
 *
 * Reads from the process environment via getenv() — not \$_ENV —
 * to avoid dependency on PHP's variables_order configuration.
 *
 * @return string The base URL from PEST_BROWSER_BASE_URL env var,
 *                or 'http://localhost:8080' as fallback.
 */
function browser_base_url(): string
{
    return getenv('PEST_BROWSER_BASE_URL') ?: 'http://localhost:8080';
}

/**
 * Snapshots environment-variable state and returns a restore closure.
 *
 * Captures both the $_ENV superglobal entry and the process-level
 * getenv() value for each key. The returned closure restores each
 * key to its pre-snapshot state — use it as an afterEach() hook
 * to prevent cross-test-file env-var pollution.
 *
 * @param  string ...$keys Environment variable names to snapshot.
 * @return Closure         Restore function — pass to afterEach().
 */
function restoreEnvVars(string ...$keys): Closure
{
    $snapshots = [];

    foreach ($keys as $key) {
        $snapshots[$key] = [
            'hasEnv' => array_key_exists($key, $_ENV),
            'envValue' => $_ENV[$key] ?? null,
            'getenvValue' => getenv($key),
        ];
    }

    return function () use ($snapshots): void {
        foreach ($snapshots as $key => $snap) {
            if ($snap['hasEnv']) {
                $_ENV[$key] = $snap['envValue'];
            } else {
                unset($_ENV[$key]);
            }

            if ($snap['getenvValue'] === false) {
                putenv($key);
            } else {
                putenv("{$key}={$snap['getenvValue']}");
            }
        }
    };
}

/**
 * Strip JSONC comments (// and / * * /) without corrupting string contents.
 *
 * String-state aware: tracks whether the cursor is inside a double-quoted
 * string and honours backslash escapes.  Newlines are preserved so source
 * line numbers stay stable after stripping.
 *
 * Handles the common gotcha: URLs like "https://opencode.ai/config.json"
 * contain // inside strings — these are left intact because the scanner
 * knows it is inside a quoted string.
 *
 * @param  string $jsonc Raw JSONC source.
 * @return string Comment-free JSON.
 */
function strip_jsonc_comments(string $jsonc): string
{
    $out = '';
    $len = strlen($jsonc);
    $i   = 0;
    $inString = false;

    while ($i < $len) {
        $ch = $jsonc[$i];

        if ($inString) {
            if ($ch === '\\' && $i + 1 < $len) {
                $out .= $ch . $jsonc[$i + 1];
                $i += 2;
                continue;
            }

            if ($ch === '"') {
                $inString = false;
            }

            $out .= $ch;
            $i++;
            continue;
        }

        if ($ch === '"') {
            $inString = true;
            $out .= $ch;
            $i++;
            continue;
        }

        if ($ch === '/' && $i + 1 < $len && $jsonc[$i + 1] === '/') {
            $i += 2;

            while ($i < $len && $jsonc[$i] !== "\n") {
                $i++;
            }

            continue;
        }

        if ($ch === '/' && $i + 1 < $len && $jsonc[$i + 1] === '*') {
            $i += 2;

            while ($i < $len && ! ($jsonc[$i] === '*' && $i + 1 < $len && $jsonc[$i + 1] === '/')) {
                $i++;
            }

            $i += 2;
            continue;
        }

        $out .= $ch;
        $i++;
    }

    return $out;
}

/**
 * Resolve the absolute path to the opencode config (JSONC).
 *
 * @return string Absolute path to opencode.jsonc at the repo root.
 */
function opencode_config_path(): string
{
    return dirname(__DIR__) . '/opencode.jsonc';
}

/**
 * Load and decode opencode.jsonc (comments stripped) as an associative array.
 *
 * @return array<string, mixed>
 *
 * @throws RuntimeException If the file is missing, unreadable, or invalid JSON.
 */
function load_opencode_config(): array
{
    $path = opencode_config_path();

    if (! file_exists($path)) {
        throw new RuntimeException("opencode.jsonc not found at: {$path}");
    }

    $contents = file_get_contents($path);

    if ($contents === false) {
        throw new RuntimeException("Failed to read opencode.jsonc: {$path}");
    }

    /** @var array<string, mixed> $config */
    $config = json_decode(strip_jsonc_comments($contents), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('Failed to parse opencode.jsonc: ' . json_last_error_msg());
    }

    return $config;
}

/**
 * Read the full contents of an agent definition file.
 *
 * @param  string             $name Agent name (filename without .md extension).
 * @return string             Full file contents.
 * @throws RuntimeException   If the agent file is missing or unreadable.
 */
function agent_contents(string $name): string
{
    // Guard against path traversal.
    $name = basename($name);

    $path = __DIR__ . '/../.opencode/agents/' . $name . '.md';

    if (! file_exists($path)) {
        throw new RuntimeException("Agent file not found: {$path}");
    }

    $contents = file_get_contents($path);

    if ($contents === false) {
        throw new RuntimeException("Failed to read agent file: {$path}");
    }

    return $contents;
}

/**
 * Read the frontmatter (YAML between --- delimiters) of an agent definition.
 *
 * @param  string             $name Agent name (filename without .md extension).
 * @return string             The frontmatter as a raw string (including --- delimiters).
 * @throws RuntimeException   If the agent file is missing or unreadable.
 */
function agent_frontmatter(string $name): string
{
    $contents = agent_contents($name);

    // Extract frontmatter: everything between the first two --- lines.
    if (! preg_match('/^---\s*\n(.*?)\n---/s', $contents, $matches)) {
        throw new RuntimeException("No valid YAML frontmatter found in agent: {$name}");
    }

    return $matches[0];
}

/**
 * Return frontend-gated skill names ordered by their self-declared metadata.
 *
 * @return list<string>
 */
function frontend_skill_names(): array
{
    $files = glob(dirname(__DIR__) . '/.opencode/skills/*/SKILL.md');
    $ordered = [];

    foreach (is_array($files) ? $files : [] as $file) {
        $content = (string) file_get_contents($file);
        if (preg_match('/^  prism\.frontend-skill-order:\s+"([1-9]\d*)"$/m', $content, $orderMatch) !== 1) {
            continue;
        }
        if (preg_match('/^name:\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/m', $content, $nameMatch) !== 1) {
            throw new RuntimeException('frontend skill metadata requires a valid skill name');
        }

        $order = (int) $orderMatch[1];
        if (array_key_exists($order, $ordered)) {
            throw new RuntimeException('frontend skill metadata order values must be unique');
        }
        $ordered[$order] = $nameMatch[1];
    }

    ksort($ordered, SORT_NUMERIC);

    return array_values($ordered);
}





// vim: ft=php sts=4 sw=4 ts=4 et :
