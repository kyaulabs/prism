<?php

declare(strict_types=1);

# $KYAULabs: FromIssueAgentTest.php kyau@nova 2026/07/21 -0700 Exp $




















use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @from-issue on-ramp subagent (issue #134).
 *
 * Asserts the agent definition exists with the correct frontmatter contract,
 * is registered in opencode.jsonc at the PLANNER tier (same model as @plan),
 * dispatches @explore/@architect/@tdd, is invocable from the Build tab (NOT
 * Plan — Plan mode is read-only per ADR-0006 and issue #184 removed
 * @from-issue from its allowlist), is indexed in the canonical doc tables,
 * and that its triage-state meta labels are documented. The broad compliance
 * sweep (every agent has a literal temperature, no bare model IDs) is already
 * covered by ModelConfigTest.php; these tests assert the @from-issue-specific
 * contract.
 */

/**
 * Absolute path to the from-issue agent definition.
 *
 * @return string
 */
function from_issue_agent_path(): string
{
    return __DIR__ . '/../../../.opencode/agents/from-issue.md';
}

/**
 * Reads the from-issue agent file, failing loudly if it is missing.
 *
 * @return string
 */
function from_issue_agent_contents(): string
{
    $path = from_issue_agent_path();
    Assert::assertFileExists($path, '.opencode/agents/from-issue.md must exist');

    $contents = file_get_contents($path);
    Assert::assertNotFalse($contents, "Failed to read {$path}");

    return $contents;
}

/**
 * Extracts the YAML frontmatter block from the from-issue agent file.
 *
 * @return string
 */
function from_issue_frontmatter(): string
{
    $contents = from_issue_agent_contents();

    if (! preg_match('/^---\n(.*?)\n---/s', $contents, $matches)) {
        Assert::fail('from-issue.md has no frontmatter delimiters');
    }

    return $matches[1];
}

it('has the from-issue agent definition file', function (): void {
    Assert::assertFileExists(from_issue_agent_path());
});

it('from-issue agent has mode subagent and a literal temperature', function (): void {
    $frontmatter = from_issue_frontmatter();

    Assert::assertMatchesRegularExpression(
        '/^mode:\s*subagent/m',
        $frontmatter,
        'from-issue.md must declare mode: subagent',
    );
    Assert::assertMatchesRegularExpression(
        '/^temperature:\s*[\d.]+/m',
        $frontmatter,
        'from-issue.md must set an explicit numeric temperature',
    );
});

it('from-issue agent has scoped write (specs + plans), gh access, branch + ask-commit, no push', function (): void {
    $frontmatter = from_issue_frontmatter();

    // edit: deny by default, allow docs/specs/* (to-spec exit) + docs/plans/* (writing-plans exit)
    Assert::assertStringContainsString('edit:', $frontmatter);
    Assert::assertStringContainsString('"docs/specs/*": allow', $frontmatter);
    Assert::assertStringContainsString('"docs/plans/*": allow', $frontmatter);

    // gh read/comment/edit access for triage (space-less prefix form)
    Assert::assertStringContainsString('"gh issue view*": allow', $frontmatter);
    Assert::assertStringContainsString('"gh issue comment*": allow', $frontmatter);
    Assert::assertStringContainsString('"gh issue edit*": allow', $frontmatter);

    // branch creation allowed; commits ask; push denied
    Assert::assertStringContainsString('"git checkout*": allow', $frontmatter);
    Assert::assertStringContainsString('"git add*": ask', $frontmatter);
    Assert::assertStringContainsString('"git commit*": ask', $frontmatter);
    Assert::assertStringContainsString('"git push*": deny', $frontmatter);
});

it('from-issue agent dispatches explore, architect, and tdd (task: allow)', function (): void {
    $frontmatter = from_issue_frontmatter();

    Assert::assertStringContainsString('task:', $frontmatter);
    Assert::assertStringContainsString('"explore": allow', $frontmatter);
    Assert::assertStringContainsString('"architect": allow', $frontmatter);
    Assert::assertStringContainsString('"tdd": allow', $frontmatter);
});

it('from-issue agent is registered in opencode.jsonc at the PLANNER tier', function (): void {
    $config = load_opencode_config();

    Assert::assertArrayHasKey('from-issue', $config['agent'], 'opencode.jsonc must register from-issue');

    $agent = $config['agent']['from-issue'];
    Assert::assertSame('{env:OPENCODE_MODEL_PLANNER}', $agent['model']);
    Assert::assertSame('{env:OPENCODE_VARIANT_PLANNER}', $agent['variant']);
    Assert::assertIsFloat($agent['temperature']);
});

it('from-issue is NOT invocable from Plan mode (issue #184, ADR-0006)', function (): void {
    $config = load_opencode_config();

    $taskAllow = $config['agent']['plan']['permission']['task'] ?? [];

    Assert::assertArrayNotHasKey(
        'from-issue',
        $taskAllow,
        'plan agent task allowlist must NOT include from-issue — Plan is read-only per ADR-0006 (issue #184 Option A)',
    );
    Assert::assertSame('deny', $taskAllow['*'] ?? null, 'plan agent task allowlist must default to deny');
});

it('AGENTS.md indexes @from-issue in the Agents Available table', function (): void {
    $agents = file_get_contents(__DIR__ . '/../../../AGENTS.md');
    Assert::assertStringContainsString('| `@from-issue`', $agents);
});

it('README.md indexes @from-issue in the Custom agents table', function (): void {
    $readme = file_get_contents(__DIR__ . '/../../../README.md');
    Assert::assertStringContainsString('| `@from-issue`', $readme);
});

it('labels.md documents the needs-info and ready-for-agent triage labels', function (): void {
    $labels = file_get_contents(__DIR__ . '/../../../docs/agents/labels.md');
    Assert::assertStringContainsString('`needs-info`', $labels);
    Assert::assertStringContainsString('`ready-for-agent`', $labels);
});

it('from-issue agent body references the merged workflow and triage labels', function (): void {
    $body = from_issue_agent_contents();

    // triage layer
    Assert::assertStringContainsString('grilling', $body);
    Assert::assertStringContainsString('to-spec', $body);
    Assert::assertStringContainsString('needs-info', $body);
    Assert::assertStringContainsString('ready-for-agent', $body);
    // execution layer (absorbed from /work-issue)
    Assert::assertStringContainsString('writing-plans', $body);
    Assert::assertStringContainsString('executing-plans', $body);
    Assert::assertStringContainsString('@explore', $body);
    Assert::assertStringContainsString('@architect', $body);
    Assert::assertStringContainsString('@tdd', $body);
    // approval gate before execution
    Assert::assertMatchesRegularExpression('/\bhalt\b/i', $body);
    // AI-disclaimer on posted comments (acceptance criterion)
    Assert::assertMatchesRegularExpression('/Generated by/i', $body);
});




// vim: ft=php sts=4 sw=4 ts=4 et :
