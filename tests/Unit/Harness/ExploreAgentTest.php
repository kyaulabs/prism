<?php

declare(strict_types=1);

# $KYAULabs: ExploreAgentTest.php kyau@nova 2026/07/21 -0700 Exp $










use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @explore subagent (issue #184).
 *
 * Asserts @explore carries a true read-only permission contract per ADR-0006:
 * edit: deny, bash catch-all deny with a scoped read-only allowlist (incl.
 * Graphify navigation carve-out), webfetch: deny, task: deny. After issue
 * #184, @explore lives in .opencode/agents/explore.md (moved out of inline
 * opencode.jsonc per the 12-subagent precedent) — model/variant/temperature
 * stay inline in opencode.jsonc per ADR-0022.
 */

it('explore agent definition file exists (moved out of opencode.jsonc inline)', function (): void {
    Assert::assertFileExists(__DIR__ . '/../../../.opencode/agents/explore.md');
});

it('explore agent has mode subagent and a literal temperature', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertMatchesRegularExpression(
        '/^mode:\s*subagent/m',
        $fm,
        'explore.md must declare mode: subagent',
    );
    Assert::assertMatchesRegularExpression(
        '/^temperature:\s*[\d.]+/m',
        $fm,
        'explore.md must set an explicit numeric temperature',
    );
});

it('explore agent is read-only: edit, webfetch, and task are denied', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertStringContainsString('edit: deny', $fm, 'explore must deny edit (read-only contract, ADR-0006)');
    Assert::assertStringContainsString('webfetch: deny', $fm, 'explore must deny webfetch');
    Assert::assertStringContainsString('task: deny', $fm, 'explore must deny task (no subagent dispatch)');
});

it('explore agent has bash catch-all deny plus read-only allowlist', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertStringContainsString('"*": deny', $fm, 'explore must have bash catch-all deny');

    foreach (['ls*', 'cat*', 'grep*', 'find*', 'git log*', 'git show*'] as $pattern) {
        Assert::assertStringContainsString(
            "\"{$pattern}\": allow",
            $fm,
            "explore must allow read-only bash pattern '{$pattern}'",
        );
    }
});

it('explore agent preserves Graphify-first navigation carve-out', function (): void {
    $fm = agent_frontmatter('explore');

    foreach (['test -f*', 'graphify query*', 'graphify path*', 'graphify explain*'] as $pattern) {
        Assert::assertStringContainsString(
            "\"{$pattern}\": allow",
            $fm,
            "explore must allow Graphify navigation pattern '{$pattern}' (primary navigation path)",
        );
    }
});

it('explore agent description claims read-only (validator keyword trigger)', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertMatchesRegularExpression(
        '/^description:\s*.+(read-only|does not modify)/im',
        $fm,
        'explore description must contain a read-only keyword so validate-harness.sh enforces the contract',
    );
});

it('explore agent preserves the Graphify-first protocol in its prompt body', function (): void {
    $body = agent_contents('explore');

    Assert::assertStringContainsString('graphify-out/graph.json', $body);
    Assert::assertStringContainsString('graphify query', $body);
});

it('explore is registered in opencode.jsonc at the JUDGE tier (model/variant/temperature only)', function (): void {
    $cfg = load_opencode_config();

    Assert::assertArrayHasKey('explore', $cfg['agent']);
    $explore = $cfg['agent']['explore'];

    Assert::assertSame('{env:OPENCODE_MODEL_JUDGE}', $explore['model']);
    Assert::assertSame('{env:OPENCODE_VARIANT_JUDGE}', $explore['variant']);
    Assert::assertIsFloat($explore['temperature']);

    // After issue #184, prompt + permission live in the .md file — NOT inline.
    Assert::assertArrayNotHasKey(
        'prompt',
        $explore,
        'explore prompt must live in .opencode/agents/explore.md (not inline in opencode.jsonc)',
    );
    Assert::assertArrayNotHasKey(
        'permission',
        $explore,
        'explore permission block must live in .opencode/agents/explore.md (not inline in opencode.jsonc)',
    );
});


// vim: ft=php sts=4 sw=4 ts=4 et :
