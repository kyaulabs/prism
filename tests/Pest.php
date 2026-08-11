<?php

declare(strict_types=1);

# $KYAULabs: Pest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $






















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
 * Extract the agent name the ticketing skill delegates gh execution to.
 *
 * @return string The subagent name declared in the skill's Cross-refs.
 *
 * @throws RuntimeException If the skill does not declare its gh executor.
 */
function ticketing_gh_executor(): string
{
    $skill = (string) file_get_contents(__DIR__ . '/../.opencode/skills/ticketing/SKILL.md');
    if (preg_match('/`@([a-z-]+)` — delegated all gh CLI execution|delegated all gh CLI execution to `@([a-z-]+)`/', $skill, $m) === 1) {
        return $m[1] ?? $m[2];
    }

    throw new RuntimeException('ticketing skill must declare its gh CLI execution agent in Cross-refs');
}

/**
 * Glob (simple `*` wildcard) to regex, matched against the full command.
 *
 * @param  string $glob Glob pattern with `*` wildcards.
 * @return string Anchored regex matching the full command string.
 */
function gh_glob_regex(string $glob): string
{
    $quoted = '';
    for ($i = 0, $len = strlen($glob); $i < $len; $i++) {
        $quoted .= $glob[$i] === '*' ? '.*' : preg_quote($glob[$i], '/');
    }

    return '/^' . $quoted . '$/';
}

/**
 * Effective bash rules for an agent: global rules, then the agent's own
 * (.md frontmatter, then inline opencode.jsonc agent section).
 *
 * @return list<array{0:string,1:string}> [pattern, verdict]
 */
function agent_bash_rules(string $name): array
{
    $config = load_opencode_config();
    $rules = [];

    foreach ($config['permission']['bash'] ?? [] as $pattern => $verdict) {
        $rules[] = [(string) $pattern, (string) $verdict];
    }

    $frontmatter = agent_frontmatter($name);
    if (preg_match('/^  bash:\s*\n(.*?)(?=^  (?:webfetch|task|lsp|edit|read|glob|grep|list|skill|external_directory):|\z)/ms', $frontmatter, $section) === 1) {
        foreach (explode("\n", $section[1]) as $line) {
            if (preg_match('/^    "?([^":]+)"?:\s*("?)(allow|deny|ask)\2\s*$/', $line, $m) === 1) {
                $rules[] = [$m[1], $m[3]];
            }
        }
    }

    if (isset($config['agent'][$name]['permission']['bash'])) {
        foreach ($config['agent'][$name]['permission']['bash'] as $pattern => $verdict) {
            $rules[] = [(string) $pattern, (string) $verdict];
        }
    }

    return $rules;
}

/**
 * Resolve a command against ordered rules (last matching rule wins).
 *
 * @param  string              $command Full command string to resolve.
 * @param  list<array{0:string,1:string}> $rules   [pattern, verdict] pairs.
 * @return string              allow|ask|deny — the last matching rule's verdict.
 */
function gh_resolve(string $command, array $rules): string
{
    $verdict = 'deny'; // no matching rule falls to the catch-all semantics
    foreach ($rules as [$pattern, $v]) {
        if (preg_match(gh_glob_regex($pattern), $command) === 1) {
            $verdict = $v;
        }
    }

    return $verdict;
}

/**
 * Extract gh commands from a workflow file's ```bash fences (optionally
 * restricted to sections whose "## " heading matches $sectionRegex).
 *
 * @return list<array{0:string,1:string}> [command, read|mutation]
 */
function gh_commands_in(string $path, ?string $sectionRegex = null): array
{
    $lines = preg_split('/\r?\n/', (string) file_get_contents($path)) ?: [];
    $commands = [];
    $inFence = false;
    $section = '';
    $i = 0;
    $count = count($lines);
    while ($i < $count) {
        $trimmed = trim($lines[$i]);
        if (preg_match('/^## /', $trimmed) === 1) {
            $section = $trimmed;
        }
        if (preg_match('/^```/', $trimmed) === 1) {
            $inFence = !$inFence;
            $i++;
            continue;
        }
        if (!$inFence || ($sectionRegex !== null && preg_match($sectionRegex, $section) !== 1) || str_starts_with($trimmed, '#')) {
            $i++;
            continue;
        }
        $line = $trimmed;
        while (str_ends_with($line, '\\') && $i + 1 < $count) {
            $i++;
            $line .= ' ' . trim($lines[$i]);
        }
        $pos = strpos($line, 'gh ');
        if ($pos !== false) {
            $cmd = trim(substr($line, $pos));
            $cmd = (string) preg_replace('~2>/dev/null.*$~', '', $cmd);
            $cmd = (string) preg_replace('~\|{2}.*$~', '', $cmd);
            $cmd = (string) preg_replace('~;.*$~', '', $cmd);
            $cmd = rtrim($cmd, ")'\"");
            if (preg_match('/^gh (auth|issue|repo|api|label|--version)\b/', $cmd) === 1) {
                $mutation = preg_match('/^gh (issue create|issue edit|issue comment|label create|label edit)\b/', $cmd) === 1
                    || str_contains($cmd, '-X POST')
                    || str_contains($cmd, 'mutation(');
                $commands[] = [$cmd, $mutation ? 'mutation' : 'read'];
            }
        }
        $i++;
    }

    return $commands;
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
