<?php

declare(strict_types=1);

# $KYAULabs: ExploreAgentTest.php kyau@cosmos.kyaulabs 2026/07/26 -0700 Exp $










use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @explore subagent (issue #184).
 *
 * Asserts @explore carries a true read-only permission contract per ADR-0006:
 * edit: deny, bash catch-all deny with a scoped read-only allowlist, webfetch:
 * deny, task: deny. After issue #184, @explore lives in .opencode/agents/
 * explore.md (moved out of inline opencode.jsonc per the 12-subagent
 * precedent) — model/variant/temperature stay inline in opencode.jsonc per
 * ADR-0022. The Graphify-first integration was aborted (ADR-0038); a guard
 * test below locks that decision in against silent re-introduction.
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

it('explore agent has NO Graphify integration (aborted per ADR-0038)', function (): void {
    $fm = agent_frontmatter('explore');
    $body = agent_contents('explore');

    // Graphify carve-out must not be re-added silently.
    foreach (['graphify query*', 'graphify path*', 'graphify explain*'] as $pattern) {
        Assert::assertStringNotContainsString(
            "\"{$pattern}\": allow",
            $fm,
            "explore must NOT carry Graphify pattern '{$pattern}' — @explore integration aborted per ADR-0038",
        );
    }
    // Graphify-first protocol must not be re-added to the prompt body.
    Assert::assertStringNotContainsString(
        'Graphify-first protocol',
        $body,
        'explore prompt must NOT contain the Graphify-first protocol — aborted per ADR-0038',
    );
});

it('explore agent description claims read-only (validator keyword trigger)', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertMatchesRegularExpression(
        '/^description:\s*.+(read-only|does not modify)/im',
        $fm,
        'explore description must contain a read-only keyword so validate-harness.sh enforces the contract',
    );
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

it('explore agent allows LSP for semantic code navigation', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertStringContainsString(
        'lsp: allow',
        $fm,
        'explore must allow LSP — its prompt expects an LSP workflow and it '
        . 'navigates code semantically (read-only contract per ADR-0006 preserved)',
    );
});

it('explore agent prompt steers structural queries to LSP over grep', function (): void {
    $body = agent_contents('explore');

    // ADR-0038 follow-up: with Graphify removed, LSP is the structural-
    // navigation tool. The prompt must actively steer structural queries
    // (callers, references, definitions) to LSP rather than defaulting to grep.
    Assert::assertStringContainsString(
        'findReferences',
        $body,
        'explore prompt must reference LSP findReferences for "who calls X" queries',
    );
    Assert::assertStringContainsString(
        'callHierarchy',
        $body,
        'explore prompt must reference LSP callHierarchy for call-chain queries',
    );
});






// vim: ft=php sts=4 sw=4 ts=4 et :
