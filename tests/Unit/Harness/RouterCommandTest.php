<?php

declare(strict_types=1);

# $KYAULabs: RouterCommandTest.php kyau@nova 2026/07/16 -0700 Exp $










use PHPUnit\Framework\Assert;

it('.opencode/commands/router.md exists and is readable', function () {
    $path = __DIR__ . '/../../../.opencode/commands/router.md';
    Assert::assertFileExists($path, '.opencode/commands/router.md must exist');
    Assert::assertIsReadable($path, '.opencode/commands/router.md must be readable');
});

it('.opencode/commands/feature.md exists and is readable', function () {
    $path = __DIR__ . '/../../../.opencode/commands/feature.md';
    Assert::assertFileExists($path, '.opencode/commands/feature.md must exist');
    Assert::assertIsReadable($path, '.opencode/commands/feature.md must be readable');
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

it('AGENTS.md Commands table contains a /feature row', function () {
    $path = __DIR__ . '/../../../AGENTS.md';
    $content = file_get_contents($path);

    if (! preg_match('/## Commands\n(.*?)(?=\n## |\z)/s', $content, $matches)) {
        Assert::fail('Could not find ## Commands section in AGENTS.md');
    }
    $table = $matches[1];

    Assert::assertMatchesRegularExpression(
        '/^\| `\/feature`/m',
        $table,
        'AGENTS.md Commands table must contain a /feature row',
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

it('README.md Slash commands table contains a /feature row', function () {
    $path = __DIR__ . '/../../../README.md';
    $content = file_get_contents($path);

    if (! preg_match('/### Slash commands\n(.*?)(?=\n### |\n## |\z)/s', $content, $matches)) {
        Assert::fail('Could not find ### Slash commands section in README.md');
    }
    $table = $matches[1];

    Assert::assertMatchesRegularExpression(
        '/^\| `\/feature`/m',
        $table,
        'README.md Slash commands table must contain a /feature row',
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



// vim: ft=php sts=4 sw=4 ts=4 et :
