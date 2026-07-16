<?php

declare(strict_types=1);

# $KYAULabs: CodeReviewCoordinatorTest.php kyau@nova 2026/07/16 -0700 Exp $




























use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @code-review multi-axis coordinator (issue #137).
 *
 * Asserts the coordinator exists with scoped task: allow for its 3 read-only
 * review axes, retains edit: deny, is registered in opencode.jsonc at the
 * PRIMARY tier, dispatches @standards-review/@spec-review/@semgrep, is indexed
 * in the canonical doc tables, and that ADR-0021 records the permission-model
 * carve-out. The broad compliance sweep (every agent has a literal
 * temperature, no bare model IDs) is already covered by ModelConfigTest.php.
 */

it('ADR-0021 exists and records the coordinator permission-model carve-out', function (): void {
    $adr = __DIR__ . '/../../../adr/0021-code-review-coordinator-permission-model.md';
    Assert::assertFileExists($adr);
    $body = file_get_contents($adr);
    Assert::assertStringContainsString('code-review', $body);
    Assert::assertStringContainsString('0006', $body);
    Assert::assertStringContainsString('task:', $body);
    Assert::assertMatchesRegularExpression('/coordinator/i', $body);
});

it('standards-review agent exists with read-only frontmatter', function (): void {
    $fm = agent_frontmatter('standards-review');
    Assert::assertMatchesRegularExpression('/^mode:\s*subagent/m', $fm);
    Assert::assertStringContainsString('edit: deny', $fm);
    Assert::assertStringContainsString('task: deny', $fm);
    Assert::assertStringContainsString('"*": deny', $fm);
});

it('standards-review is registered in opencode.jsonc at PRIMARY tier', function (): void {
    $cfg = load_opencode_config();
    Assert::assertSame('{env:OPENCODE_MODEL_PRIMARY}', $cfg['agent']['standards-review']['model']);
});

it('AGENTS.md and README.md index @standards-review', function (): void {
    Assert::assertStringContainsString(
        '| `@standards-review`',
        file_get_contents(__DIR__ . '/../../../AGENTS.md')
    );
    Assert::assertStringContainsString(
        '| `@standards-review`',
        file_get_contents(__DIR__ . '/../../../README.md')
    );
});

it('standards-review body documents Fowler 12 smells and de-dup contract', function (): void {
    $body = agent_contents('standards-review');
    Assert::assertMatchesRegularExpression('/Duplicated Code/i', $body);
    Assert::assertMatchesRegularExpression('/Long Method/i', $body);
    Assert::assertMatchesRegularExpression('/de-?dup/i', $body);
    Assert::assertStringContainsString('PSR-12', $body);
    Assert::assertStringContainsString('does not auto-fix', $body);
});

it('spec-review agent exists with read-only frontmatter', function (): void {
    $fm = agent_frontmatter('spec-review');
    Assert::assertMatchesRegularExpression('/^mode:\s*subagent/m', $fm);
    Assert::assertStringContainsString('edit: deny', $fm);
    Assert::assertStringContainsString('task: deny', $fm);
    Assert::assertStringContainsString('"*": deny', $fm);
});

it('spec-review is registered in opencode.jsonc at PRIMARY tier', function (): void {
    $cfg = load_opencode_config();
    Assert::assertSame('{env:OPENCODE_MODEL_PRIMARY}', $cfg['agent']['spec-review']['model']);
});

it('AGENTS.md and README.md index @spec-review', function (): void {
    Assert::assertStringContainsString(
        '| `@spec-review`',
        file_get_contents(__DIR__ . '/../../../AGENTS.md')
    );
    Assert::assertStringContainsString(
        '| `@spec-review`',
        file_get_contents(__DIR__ . '/../../../README.md')
    );
});

it('spec-review body documents branch-name spec discovery and coverage reporting', function (): void {
    $body = agent_contents('spec-review');
    Assert::assertStringContainsString('branch', $body);
    Assert::assertStringContainsString('docs/specs', $body);
    Assert::assertMatchesRegularExpression('/Covered|Omitted|Deliberately-?omitted/i', $body);
    Assert::assertStringContainsString('no spec found', $body);
    Assert::assertStringContainsString('does not auto-fix', $body);
});

it('spec-review body includes acceptance-criteria and diff instructions', function (): void {
    $body = agent_contents('spec-review');
    Assert::assertMatchesRegularExpression('/acceptance criteria/i', $body);
    Assert::assertStringContainsString('diff', $body);
    Assert::assertStringContainsString('fuzzy', $body);
});


// vim: ft=php sts=4 sw=4 ts=4 et :
