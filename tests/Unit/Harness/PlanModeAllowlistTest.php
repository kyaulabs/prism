<?php

declare(strict_types=1);

# $KYAULabs: PlanModeAllowlistTest.php kyau@nova 2026/07/21 -0700 Exp $




use PHPUnit\Framework\Assert;

/**
 * Harness tests for the plan primary agent's task allowlist (issue #184).
 *
 * Asserts Plan mode's task allowlist is exactly the six read-only agents
 * enumerated in ADR-0006 Decision #3: test-audit, code-review, semgrep,
 * architect, explore, scout. Plan mode is read-only — write-capable agents
 * (docs-writer, from-issue, tdd, debug, resolve-merge-conflicts) are excluded.
 */

it('plan agent task allowlist defaults to deny', function (): void {
    $cfg = load_opencode_config();
    $task = $cfg['agent']['plan']['permission']['task'] ?? [];

    Assert::assertSame('*', array_key_first($task), "plan task allowlist's first key must be '*'");
    Assert::assertSame('deny', $task['*'] ?? null, 'plan task allowlist must default to deny');
});

it('plan agent task allowlist contains exactly the 6 read-only agents (ADR-0006 Decision #3)', function (): void {
    $cfg = load_opencode_config();
    $task = $cfg['agent']['plan']['permission']['task'] ?? [];

    $expected = [
        '*'            => 'deny',
        'test-audit'   => 'allow',
        'code-review'  => 'allow',
        'semgrep'      => 'allow',
        'architect'    => 'allow',
        'explore'      => 'allow',
        'scout'        => 'allow',
    ];

    // Exact match — no extra agents, no missing agents.
    Assert::assertSame($expected, $task, 'plan task allowlist must be exactly the 6 read-only agents per ADR-0006');
});

it('plan agent task allowlist excludes write-capable agents (issue #184)', function (): void {
    $cfg = load_opencode_config();
    $task = $cfg['agent']['plan']['permission']['task'] ?? [];

    foreach (['docs-writer', 'from-issue', 'tdd', 'debug', 'resolve-merge-conflicts'] as $agent) {
        Assert::assertArrayNotHasKey(
            $agent,
            $task,
            "plan task allowlist must NOT include '{$agent}' (Plan is read-only per ADR-0006)",
        );
    }
});


// vim: ft=php sts=4 sw=4 ts=4 et :
