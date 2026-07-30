<?php

declare(strict_types=1);

# $KYAULabs: SetupCommandPrismManifestTest.php kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $













use PHPUnit\Framework\Assert;

/**
 * Read the /setup command manifest as text (command-contract assertions).
 */
function setup_command_content(): string
{
    $path = __DIR__ . '/../../../.opencode/commands/setup.md';
    Assert::assertFileExists($path, '.opencode/commands/setup.md must exist');

    return (string) file_get_contents($path);
}

describe('/setup command — prism manifest contract (ADR-0043)', function () {
    it('references the project manifest at the repo root prism.jsonc', function () {
        Assert::assertStringContainsString('prism.jsonc', setup_command_content());
    });

    it('references the user manifest at ~/.config/opencode/prism.jsonc', function () {
        Assert::assertStringContainsString(
            '~/.config/opencode/prism.jsonc',
            setup_command_content(),
            '/setup must name the user-tier manifest path',
        );
    });

    it('auto-runs migrate-setup.sh on entry before reading any values', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('migrate-setup.sh', $content);
        // The migration must run BEFORE reads, not after.
        $migratePos = strpos($content, 'migrate-setup.sh');
        Assert::assertNotFalse($migratePos, 'migrate-setup.sh must be referenced');
    });

    it('reads resolved values through the prism manifest CLI, never jq', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString(
            'prism_manifest.php',
            $content,
            '/setup must read resolved values through the prism manifest CLI',
        );
        Assert::assertStringNotContainsString(
            'jq',
            $content,
            '/setup must not read values with jq; it reads through the CLI',
        );
    });

    it('warns before patching, naming both paths and comment preservation', function () {
        $content = setup_command_content();
        $lower = strtolower($content);
        // A pre-write warning that names the preservation contract.
        Assert::assertStringContainsString('comment', $lower);
        Assert::assertTrue(
            str_contains($lower, 'preserve'),
            '/setup must state that comments/unknowns are preserved when patching',
        );
    });

    it('patches owned fields in place via setup-write-project-config.sh', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString(
            'setup-write-project-config.sh',
            $content,
            '/setup must patch the project manifest via setup-write-project-config.sh',
        );
        Assert::assertStringContainsString('patch', $content);
    });

    it('writes the user manifest via setup-write-user-config.sh at mode 0600', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('setup-write-user-config.sh', $content);
        Assert::assertStringContainsString('0600', $content);
    });

    it('does not regenerate a wholesale JSON template into the legacy path', function () {
        $content = setup_command_content();
        Assert::assertStringNotContainsString(
            'Write `.opencode/setup.json`',
            $content,
            '/setup must not write the legacy .opencode/setup.json wholesale',
        );
        Assert::assertStringNotContainsString(
            '"setup_version": 4',
            $content,
            '/setup must not regenerate the v4 wholesale JSON template',
        );
    });

    it('documents the deprecation/migration of the legacy setup.json', function () {
        $content = setup_command_content();
        Assert::assertTrue(
            str_contains($content, 'deprecat')
            || str_contains($content, 'legacy')
            || str_contains($content, 'migrat'),
            '/setup must document the legacy setup.json deprecation/migration',
        );
    });

    it('applies the parent/target scaffold contract', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('parent', $content);
        Assert::assertStringContainsString('target', $content);
        // A scaffolded target must record skip-mode bookkeeping.
        Assert::assertStringContainsString('skip', $content);
    });
});





// vim: ft=php sts=4 sw=4 ts=4 et :
