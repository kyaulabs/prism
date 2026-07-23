<?php

declare(strict_types=1);

# $KYAULabs: GeneralAgentPermissionTest.php kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $






use PHPUnit\Framework\Assert;

/**
 * Regression guard for issue #202: the inline primary agent `general` must
 * gate git mutations (add/stage/commit: ask, push: deny) rather than inherit
 * the top-level permissive bash default.
 */
it('general agent gates git add/stage/commit and denies push', function () {
    $config = load_opencode_config();

    Assert::assertArrayHasKey('agent', $config);
    Assert::assertArrayHasKey('general', $config['agent']);
    $general = $config['agent']['general'];

    // general must define its OWN bash permission block — not inherit defaults.
    Assert::assertArrayHasKey(
        'permission',
        $general,
        'general must define a permission block (issue #202)',
    );
    Assert::assertArrayHasKey(
        'bash',
        $general['permission'],
        'general must define a bash permission object, not inherit the top-level default (issue #202)',
    );
    Assert::assertIsArray(
        $general['permission']['bash'],
        'general bash permission must be an object',
    );

    $bash = $general['permission']['bash'];

    Assert::assertSame('ask', $bash['git add*'] ?? null, "general 'git add*' must be 'ask'");
    Assert::assertSame('ask', $bash['git stage*'] ?? null, "general 'git stage*' must be 'ask'");
    Assert::assertSame('ask', $bash['git commit*'] ?? null, "general 'git commit*' must be 'ask'");
    Assert::assertSame('deny', $bash['git push*'] ?? null, "general 'git push*' must be 'deny'");
});


// vim: ft=php sts=4 sw=4 ts=4 et :
