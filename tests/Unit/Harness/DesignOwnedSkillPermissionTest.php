<?php

declare(strict_types=1);

# $KYAULabs: DesignOwnedSkillPermissionTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $




use PHPUnit\Framework\Assert;

it('globally denies Design-owned skills and re-allows them only for Design', function (): void {
    $config = load_opencode_config();
    $global = $config['permission']['skill'] ?? [];
    $design = $config['agent']['design']['permission']['skill'] ?? [];

    Assert::assertSame('allow', $global['*'] ?? null);
    Assert::assertSame('deny', $global['brainstorming'] ?? null);
    Assert::assertSame('deny', $global['prototype'] ?? null);
    Assert::assertSame(['brainstorming' => 'allow', 'prototype' => 'allow'], $design);

    foreach (['build', 'plan', 'chat', 'general', 'consult', 'from-issue', 'tdd'] as $agent) {
        $inline = $config['agent'][$agent]['permission']['skill'] ?? [];
        Assert::assertArrayNotHasKey('brainstorming', $inline, "{$agent} must not re-allow brainstorming");
        Assert::assertArrayNotHasKey('prototype', $inline, "{$agent} must not re-allow prototype");
    }

    foreach (['consult', 'from-issue', 'tdd'] as $agent) {
        $frontmatter = agent_frontmatter($agent);
        Assert::assertDoesNotMatchRegularExpression('/brainstorming.*allow|prototype.*allow/is', $frontmatter);
    }
});

it('canonical non-Design workflows contain no direct load instruction for Design-owned skills', function (): void {
    $paths = [
        __DIR__ . '/../../../AGENTS.md',
        __DIR__ . '/../../../CODING_HARNESS.md',
        __DIR__ . '/../../../README.md',
        __DIR__ . '/../../../.opencode/skills/executing-plans/SKILL.md',
        __DIR__ . '/../../../.opencode/skills/finding-duplicate-functions/SKILL.md',
    ];

    foreach ($paths as $path) {
        $content = (string) file_get_contents($path);
        Assert::assertDoesNotMatchRegularExpression('/\bload(?:s|ing)?(?: the)? `?(?:brainstorming|prototype)`? skill/i', $content, $path);
    }
});


// vim: ft=php sts=4 sw=4 ts=4 et :
