<?php

declare(strict_types=1);

# $KYAULabs: ChatAgentTest.php kyau@cosmos.kyaulabs 2026/08/02 -0700 Exp $




use PHPUnit\Framework\Assert;

/**
 * Harness tests for the chat primary agent (issue #176).
 *
 * Asserts the inline agent definition exists in opencode.jsonc with the
 * correct read-only contract: deny edit/bash/task; allow read/glob/grep/
 * list (path-pattern objects with a '*' catch-all, ADR-0047/ADR-0048) and
 * lsp/webfetch/websearch. Runs on the UTILITY model tier
 * to minimize cost. Visible as a user-facing TUI tab (not hidden). The
 * broad compliance sweep (literal temperature, {env:VAR} substitution,
 * no bare model IDs) is already covered by ModelConfigTest.php; these
 * tests assert the chat-specific contract plus documentation coverage.
 */

it('opencode.jsonc defines a chat primary agent (issue #176)', function () {
    $config = load_opencode_config();

    Assert::assertArrayHasKey('chat', $config['agent'], 'opencode.jsonc must define a chat agent');
    Assert::assertSame('primary', $config['agent']['chat']['mode'], 'chat agent must be primary (TUI tab)');
});

it('chat agent runs on the UTILITY model tier', function () {
    $config = load_opencode_config();
    $chat = $config['agent']['chat'];

    Assert::assertSame('{env:OPENCODE_MODEL_UTILITY}', $chat['model'], 'chat model must use UTILITY tier');
    Assert::assertSame('{env:OPENCODE_VARIANT_UTILITY}', $chat['variant'], 'chat variant must use UTILITY tier');
    Assert::assertSame(0.2, $chat['temperature'], 'chat temperature must be pinned to 0.2 (low-cost conversational tier)');
});

it('chat agent is read-only: edit, bash, and task are denied', function () {
    $config = load_opencode_config();
    $permission = $config['agent']['chat']['permission'];

    Assert::assertSame('deny', $permission['edit'], 'chat must deny edit (read-only contract)');
    Assert::assertSame('deny', $permission['bash'], 'chat must deny bash (no shell commands)');
    Assert::assertSame('deny', $permission['task'], 'chat must deny task (no subagent dispatch)');
});

it('chat agent can self-serve read-only navigation tools', function () {
    $config = load_opencode_config();
    $permission = $config['agent']['chat']['permission'];

    // File tools are path-pattern objects (ADR-0047/ADR-0048): catch-all
    // '*' => 'allow' plus sensitive-path denies — not the legacy string form.
    foreach (['read', 'glob', 'grep', 'list'] as $tool) {
        Assert::assertIsArray($permission[$tool], "chat {$tool} must be a path-pattern object (ADR-0047)");
        Assert::assertSame('allow', $permission[$tool]['*'] ?? null, "chat must allow {$tool} via '*' catch-all (self-sufficient read-only navigation)");
    }

    // read carries the credential/env deny set (issue #288, ADR-0047).
    Assert::assertSame('deny', $permission['read']['*.env'] ?? null, 'chat read must deny *.env (sensitive paths)');
    Assert::assertSame('deny', $permission['read']['*.env.*'] ?? null, 'chat read must deny *.env.* (sensitive paths)');
    Assert::assertSame('allow', $permission['read']['*.env.example'] ?? null, 'chat read must allow *.env.example (documented exception)');
    Assert::assertSame('deny', $permission['read']['*auth.json*'] ?? null, 'chat read must deny *auth.json* (sensitive paths)');
    Assert::assertSame('deny', $permission['read']['*mcp-auth.json*'] ?? null, 'chat read must deny *mcp-auth.json* (sensitive paths)');

    // Web tools remain plain allows.
    foreach (['lsp', 'webfetch', 'websearch'] as $tool) {
        Assert::assertSame('allow', $permission[$tool], "chat must allow {$tool} (self-sufficient read-only navigation)");
    }
});

it('chat agent is not hidden — user-facing TUI tab', function () {
    $config = load_opencode_config();

    Assert::assertArrayHasKey('chat', $config['agent']);
    Assert::assertFalse(
        $config['agent']['chat']['hidden'] ?? false,
        'chat must be visible in the TUI (contrast with judge hidden: true)',
    );
});

it('chat agent has a description and prompt', function () {
    $config = load_opencode_config();
    $chat = $config['agent']['chat'];

    Assert::assertIsString($chat['description'], 'chat must have a description');
    Assert::assertNotEmpty($chat['description'], 'chat description must not be empty');
    Assert::assertIsString($chat['prompt'], 'chat must have a prompt');
    Assert::assertNotEmpty($chat['prompt'], 'chat prompt must not be empty');
});

it('AGENTS.md documents the chat agent in the LSP section', function () {
    $agentsMd = file_get_contents(__DIR__ . '/../../../AGENTS.md');

    // Extract the LSP section (## LSP ... until the next ## heading).
    if (! preg_match('/^## LSP \(.*?\).*?(?=^## )/ms', $agentsMd, $m)) {
        Assert::fail('Could not find LSP section in AGENTS.md');
    }

    Assert::assertStringContainsString('chat', $m[0], 'AGENTS.md LSP section must list chat among lsp-enabled agents');
});

it('chat agent prompt is defined inline in opencode.jsonc — no .opencode/agents/chat.md file', function () {
    // ADR-0034 §Rationale: primary agents inline their prompt in opencode.jsonc
    // (same pattern as build/plan/design/general/judge). A chat.md file would
    // also fail validate-harness.sh:193-196 (mode must be subagent for .md).
    Assert::assertFalse(
        file_exists(__DIR__ . '/../../../.opencode/agents/chat.md'),
        '.opencode/agents/chat.md must NOT exist — chat prompt is inline in opencode.jsonc (ADR-0034)',
    );
});

it('.opencode/docs/lsp.md indexes the chat agent in the LSP permissions table', function () {
    $lspDoc = file_get_contents(__DIR__ . '/../../../.opencode/docs/lsp.md');

    Assert::assertStringContainsString('chat', $lspDoc, '.opencode/docs/lsp.md must list chat in the LSP-enabled agents table');
});

it('README.md indexes the chat agent', function () {
    $readme = file_get_contents(__DIR__ . '/../../../README.md');

    Assert::assertStringContainsString('chat', $readme, 'README.md must index the chat agent');
});

it('CONTEXT.md glossary defines chat agent', function () {
    $context = file_get_contents(__DIR__ . '/../../../CONTEXT.md');

    Assert::assertStringContainsString('chat agent', $context, 'CONTEXT.md glossary must define the chat agent term');
});

it('ADR-0034 records the chat agent decision', function () {
    Assert::assertFileExists(__DIR__ . '/../../../adr/0034-chat-primary-agent.md');
});







// vim: ft=php sts=4 sw=4 ts=4 et :
