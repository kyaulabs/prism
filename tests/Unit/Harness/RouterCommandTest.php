<?php

declare(strict_types=1);

# $KYAULabs: RouterCommandTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $






















use PHPUnit\Framework\Assert;

it('.opencode/commands/router.md exists and is readable', function () {
    $path = __DIR__ . '/../../../.opencode/commands/router.md';
    Assert::assertFileExists($path, '.opencode/commands/router.md must exist');
    Assert::assertIsReadable($path, '.opencode/commands/router.md must be readable');
});

it('.opencode/commands/feature.md has been deleted (replaced by the design tab — ADR-0030)', function () {
    $path = __DIR__ . '/../../../.opencode/commands/feature.md';
    Assert::assertFileDoesNotExist($path, '.opencode/commands/feature.md must not exist — /feature is replaced by the design primary agent tab per ADR-0030');
});

it('opencode.jsonc defines the design primary agent as the /feature replacement (ADR-0030)', function () {
    $config = load_opencode_config();
    Assert::assertArrayHasKey('design', $config['agent'], 'opencode.jsonc must define a design agent (replaces /feature per ADR-0030)');
    Assert::assertSame('primary', $config['agent']['design']['mode'], 'design agent must be a primary agent (TUI tab)');
});

it('AGENTS.md Commands table contains a /router row', function () {
    $path = __DIR__ . '/../../../AGENTS.md';
    $content = file_get_contents($path);

    // Extract the Commands table (## Commands heading to next ## heading or EOF)
    if (! preg_match('/## Commands\n(.*?)(?=\n## |\z)/s', $content, $matches)) {
        Assert::fail('Could not find ## Commands section in AGENTS.md');
    }
    $table = $matches[1];

    // Check for a table row starting with | `/router`
    Assert::assertMatchesRegularExpression(
        '/^\| `\/router`/m',
        $table,
        'AGENTS.md Commands table must contain a /router row',
    );
});

it('AGENTS.md Commands table does not contain the deleted /feature row', function () {
    $path = __DIR__ . '/../../../AGENTS.md';
    $content = file_get_contents($path);

    if (! preg_match('/## Commands\n(.*?)(?=\n## |\z)/s', $content, $matches)) {
        Assert::fail('Could not find ## Commands section in AGENTS.md');
    }
    $table = $matches[1];

    Assert::assertDoesNotMatchRegularExpression(
        '/^\| `\/feature`/m',
        $table,
        'AGENTS.md Commands table must not contain a /feature row (deleted per ADR-0030; replaced by the design tab)',
    );
});

it('AGENTS.md Engineering Pipeline on-ramps reference the design tab (ADR-0030)', function () {
    $path = __DIR__ . '/../../../AGENTS.md';
    $content = file_get_contents($path);

    if (! preg_match('/## Engineering Pipeline\n(.*?)(?=\n## Linting & Enforcement|\z)/s', $content, $matches)) {
        Assert::fail('Could not find ## Engineering Pipeline section in AGENTS.md');
    }
    $section = $matches[1];

    Assert::assertStringContainsString(
        'design',
        $section,
        'Engineering Pipeline on-ramps must reference the design tab (ADR-0030)',
    );
    Assert::assertStringNotContainsString(
        '`/feature`',
        $section,
        'Engineering Pipeline on-ramps must not reference the deleted /feature command',
    );
});

it('README.md Slash commands table contains a /router row', function () {
    $path = __DIR__ . '/../../../README.md';
    $content = file_get_contents($path);

    // Extract the Slash commands table (### Slash commands to next ## or ### or EOF)
    if (! preg_match('/### Slash commands\n(.*?)(?=\n### |\n## |\z)/s', $content, $matches)) {
        Assert::fail('Could not find ### Slash commands section in README.md');
    }
    $table = $matches[1];

    Assert::assertMatchesRegularExpression(
        '/^\| `\/router`/m',
        $table,
        'README.md Slash commands table must contain a /router row',
    );
});

it('README.md Slash commands table does not contain the deleted /feature row', function () {
    $path = __DIR__ . '/../../../README.md';
    $content = file_get_contents($path);

    if (! preg_match('/### Slash commands\n(.*?)(?=\n### |\n## |\z)/s', $content, $matches)) {
        Assert::fail('Could not find ### Slash commands section in README.md');
    }
    $table = $matches[1];

    Assert::assertDoesNotMatchRegularExpression(
        '/^\| `\/feature`/m',
        $table,
        'README.md Slash commands table must not contain a /feature row (deleted per ADR-0030; replaced by the design tab)',
    );
});

it('AGENTS.md Engineering Pipeline section contains the 3 on-ramps', function () {
    $path = __DIR__ . '/../../../AGENTS.md';
    $content = file_get_contents($path);

    // Extract the Engineering Pipeline section
    if (! preg_match('/## Engineering Pipeline\n(.*?)(?=\n## Linting & Enforcement|\z)/s', $content, $matches)) {
        Assert::fail('Could not find ## Engineering Pipeline section in AGENTS.md');
    }
    $section = $matches[1];

    Assert::assertStringContainsString(
        '@from-issue',
        $section,
        'Engineering Pipeline section must contain @from-issue (issue on-ramp)',
    );
    Assert::assertStringContainsString(
        '@debug',
        $section,
        'Engineering Pipeline section must contain @debug (bug on-ramp)',
    );
    Assert::assertStringContainsString(
        'brainstorming',
        $section,
        'Engineering Pipeline section must contain brainstorming (idea on-ramp)',
    );
});

it('router performs no shell work and sends scope classification to Design (ADR-0054)', function (): void {
    $router = (string) file_get_contents(__DIR__ . '/../../../.opencode/commands/router.md');

    Assert::assertStringContainsString('HUGE', $router);
    Assert::assertStringContainsString('design', $router);
    Assert::assertStringContainsString('wayfinder', $router);
    Assert::assertStringNotContainsString('bash ', $router, 'router must perform no shell operation');
    Assert::assertStringNotContainsString('classify-greenfield.sh', $router, 'Design owns the classifier');
    Assert::assertMatchesRegularExpression('/strict greenfield.*design/is', $router);
});






// vim: ft=php sts=4 sw=4 ts=4 et :
