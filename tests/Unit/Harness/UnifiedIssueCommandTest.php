<?php

declare(strict_types=1);

# $KYAULabs: UnifiedIssueCommandTest.php kyau@nova 2026/07/15 -0700 Exp $




test('ticketing skill exists with correct frontmatter', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $skillPath = $repoRoot . '/.opencode/skills/ticketing/SKILL.md';

    expect(file_exists($skillPath))->toBeTrue(
        'Expected ticketing skill at .opencode/skills/ticketing/SKILL.md'
    );

    $content = file_get_contents($skillPath);

    expect($content)->toContain('name: ticketing');
    expect($content)->toContain('description: Use when');
});

test('four unified command aliases exist and reference the ticketing skill', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $commandsDir = $repoRoot . '/.opencode/commands';

    foreach (['issue.md', 'ticket.md', 'issues.md', 'tickets.md'] as $alias) {
        $path = $commandsDir . '/' . $alias;

        expect(file_exists($path))->toBeTrue(
            "Expected command file .opencode/commands/{$alias}"
        );

        $content = file_get_contents($path);
        expect($content)->toContain('ticketing');
        expect($content)->toContain('$ARGUMENTS');
    }
});

test('singular commands reference single-issue mode', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $commandsDir = $repoRoot . '/.opencode/commands';

    foreach (['issue.md', 'ticket.md'] as $alias) {
        $content = file_get_contents($commandsDir . '/' . $alias);

        expect($content)->toContain('Single');
    }
});

test('plural commands reference from-spec decomposition mode', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $commandsDir = $repoRoot . '/.opencode/commands';

    foreach (['issues.md', 'tickets.md'] as $alias) {
        $content = file_get_contents($commandsDir . '/' . $alias);

        expect($content)->toContain('From-spec');
    }
});

test('plan-to-issues command has been hard-deleted', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $path = $repoRoot . '/.opencode/commands/plan-to-issues.md';

    expect(file_exists($path))->toBeFalse(
        '/plan-to-issues should be hard-deleted — file still exists'
    );
});

test('ADR-0020 exists and partially supersedes ADR-0019', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $adrDir = $repoRoot . '/adr';

    $adr020Files = glob($adrDir . '/0020-*.md');

    expect($adr020Files)->not->toBeEmpty(
        'Expected ADR-0020 file in adr/'
    );

    $content = file_get_contents($adr020Files[0]);

    expect($content)->toContain('Partially supersedes ADR-0019');
    expect($content)->toContain('## Status');
    expect($content)->toContain('Accepted');
});

test('ADR-0019 status reflects partial supersession', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $adrDir = $repoRoot . '/adr';

    $adr019Files = glob($adrDir . '/0019-*.md');

    expect($adr019Files)->not->toBeEmpty();

    $content = file_get_contents($adr019Files[0]);

    expect($content)->toContain('partially superseded by ADR-0020');
});

test('AGENTS.md commands and skills tables reflect unified structure', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $content = file_get_contents($repoRoot . '/AGENTS.md');

    // New aliases present in Commands table
    expect($content)->toContain('`/ticket`');
    expect($content)->toContain('`/issues`');
    expect($content)->toContain('`/tickets`');

    // /plan-to-issues row removed from Commands table (check for table row pattern)
    expect(preg_match('/^\| `\/plan-to-issues` \|/m', $content))->toBe(0);

    // ticketing skill present in Skills Available
    expect($content)->toContain('`ticketing`');
});

test('README.md commands and skills tables reflect unified structure', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $content = file_get_contents($repoRoot . '/README.md');

    expect($content)->toContain('`/ticket`');
    expect($content)->toContain('`/issues`');
    expect($content)->toContain('`/tickets`');
    expect(preg_match('/^\| `\/plan-to-issues` \|/m', $content))->toBe(0);
    expect($content)->toContain('ticketing');
});

test('CONTEXT.md lists ADR-0019 and ADR-0020', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $content = file_get_contents($repoRoot . '/CONTEXT.md');

    expect($content)->toContain('0019');
    expect($content)->toContain('0020');
});


// vim: ft=php sts=4 sw=4 ts=4 et :
