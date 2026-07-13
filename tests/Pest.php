<?php

declare(strict_types=1);

# $KYAULabs: Pest.php kyau@nova 2026/07/13 -0700 Exp $




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


// vim: ft=php sts=4 sw=4 ts=4 et :
