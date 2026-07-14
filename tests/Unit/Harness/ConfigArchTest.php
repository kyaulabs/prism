<?php

declare(strict_types=1);

# $KYAULabs: ConfigArchTest.php kyau@nova 2026/07/14 -0700 Exp $










/**
 * Config assertion tests for opencode.jsonc agent definitions.
 *
 * Unlike ArchTest.php which scans PHP source files via filesystem walkers,
 * these tests assert on the static configuration in opencode.jsonc — ensuring
 * agent variants, prompts, and permissions remain at their intended values.
 */

test('plan agent uses {env:VAR} for variant', function (): void {
    $config = load_opencode_config();

    expect($config['agent']['plan']['variant'])
        ->toBe('{env:OPENCODE_VARIANT_PLANNER}');
});

test('plan agent prompt contains complexity assessment protocol', function (): void {
    $config = load_opencode_config();

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
