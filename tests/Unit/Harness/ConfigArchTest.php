<?php

declare(strict_types=1);

# $KYAULabs: ConfigArchTest.php kyau@akira.kyaulabs 2026/07/10 -0700 Exp $







/**
 * Config assertion tests for opencode.json agent definitions.
 *
 * Unlike ArchTest.php which scans PHP source files via filesystem walkers,
 * these tests assert on the static configuration in opencode.json — ensuring
 * agent variants, prompts, and permissions remain at their intended values.
 */

/**
 * Loads and decodes opencode.json as an associative array.
 *
 * @return array<string, mixed>
 */
function harness_config_load_opencode_json(): array
{
    $configPath = dirname(__DIR__, 3) . '/opencode.json';

    if (! file_exists($configPath)) {
        throw new RuntimeException("opencode.json not found at: {$configPath}");
    }

    $contents = file_get_contents($configPath);

    if ($contents === false) {
        throw new RuntimeException("Failed to read opencode.json: {$configPath}");
    }

    /** @var array<string, mixed> $config */
    $config = json_decode($contents, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('Failed to parse opencode.json: ' . json_last_error_msg());
    }

    return $config;
}

test('plan agent uses {env:VAR} for variant', function (): void {
    $config = harness_config_load_opencode_json();

    expect($config['agent']['plan']['variant'])
        ->toBe('{env:OPENCODE_VARIANT_PLANNER}');
});

test('plan agent prompt contains complexity assessment protocol', function (): void {
    $config = harness_config_load_opencode_json();

    /** @var array<string, mixed> $planAgent */
    $planAgent = $config['agent']['plan'];

    expect($planAgent)->toHaveKey('prompt');

    /** @var string $prompt */
    $prompt = $planAgent['prompt'];

    expect($prompt)
        ->toContain('Complexity Assessment Protocol')
        ->and($prompt)->toContain('architectural changes')
        ->and($prompt)->toContain('security-sensitive')
        ->and($prompt)->toContain('database schema')
        ->and($prompt)->toContain('documentation')
        ->and($prompt)->toContain('style fixes');
});



// vim: ft=php sts=4 sw=4 ts=4 et :
