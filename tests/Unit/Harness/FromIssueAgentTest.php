<?php

declare(strict_types=1);

# $KYAULabs: FromIssueAgentTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $



































use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @from-issue on-ramp subagent (issue #134).
 *
 * Asserts the agent definition exists with the correct frontmatter contract,
 * is registered in opencode.jsonc at the PLANNER tier (same model as @plan),
 * dispatches @explore/@architect and hands @tdd off to the user (issue #3292:
 * no subagent may dispatch an ask-gated agent), is invocable from the Build
 * tab (NOT Plan — Plan mode is read-only per ADR-0006 and issue #184 removed
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
    Assert::assertStringContainsString('"gh issue comment*": ask', $frontmatter);
    Assert::assertStringContainsString('"gh issue edit*": ask', $frontmatter);

    // branch creation allowed; commits ask; push denied
    Assert::assertStringContainsString('"git checkout*": allow', $frontmatter);
    Assert::assertStringContainsString('"git add*": ask', $frontmatter);
    Assert::assertStringContainsString('"git commit*": ask', $frontmatter);
    Assert::assertStringContainsString('"git push*": deny', $frontmatter);
});

it('from-issue agent dispatches explore and architect only — tdd is user-invoked (issue #3292)', function (): void {
    $frontmatter = from_issue_frontmatter();

    Assert::assertStringContainsString('task:', $frontmatter);
    Assert::assertStringContainsString('"explore": allow', $frontmatter);
    Assert::assertStringContainsString('"architect": allow', $frontmatter);
    Assert::assertStringNotContainsString(
        '"tdd": allow',
        $frontmatter,
        'from-issue must NOT dispatch @tdd: tdd carries "git commit*": "ask" and '
        . 'nested subagent dispatch cannot render ask prompts in opencode ≤1.18.16 '
        . '(issue #3292) — the user invokes @tdd directly at depth 1.',
    );
});

it('from-issue body carries the do-not-dispatch-@tdd boundary and stop-after-branch handoff (issue #3292)', function (): void {
    $body = from_issue_agent_contents();

    // Boundary sentence — same shape as the @debug rule ("recommended, not
    // dispatched — the user invokes it directly").
    Assert::assertMatchesRegularExpression('/Do\s+not\s+dispatch\s+`?@tdd`?/i', $body);
    Assert::assertMatchesRegularExpression('/invoke\s+`?@tdd`?/i', $body);
    Assert::assertMatchesRegularExpression('/\bSTOP\b/', $body);
    // No positive dispatch directive may remain in the execution step.
    Assert::assertStringNotContainsString('dispatch to @tdd', $body);
    Assert::assertStringNotContainsString('dispatch tasks to `@tdd`', $body);
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

it('from-issue agent body contains untrusted-data directive and NN validation (issue #180)', function (): void {
    $body = from_issue_agent_contents();

    // untrusted-content directive
    Assert::assertStringContainsString('untrusted external content', $body);
    Assert::assertStringContainsString('untrusted data to be analyzed', $body);
    // NN validation — bare integer
    Assert::assertStringContainsString('bare positive integer', $body);
    Assert::assertMatchesRegularExpression('/non-numeric characters/', $body);
});

it('from-issue stops and redirects oversized-scope work instead of mapping it (ADR-0050)', function (): void {
    $body = from_issue_agent_contents();

    Assert::assertStringContainsString('oversized', $body);
    Assert::assertMatchesRegularExpression('/\bSTOP\b/', $body);
    Assert::assertStringContainsString('fresh', $body);
    Assert::assertStringContainsString('design', $body);
    Assert::assertStringContainsString('wayfinder', $body);
    Assert::assertStringContainsString('not dispatch', $body);
    Assert::assertStringContainsString('wayfinder map', $body);
    Assert::assertStringNotContainsString('"wayfinder": allow', from_issue_frontmatter());
});

it('redirects Design-owned ambiguity and viability instead of loading restricted skills', function (): void {
    $body = from_issue_agent_contents();

    Assert::assertStringNotContainsString('load the `brainstorming` skill', $body);
    Assert::assertStringNotContainsString('load the `prototype` skill', $body);
    Assert::assertMatchesRegularExpression('/Ambiguous \/ multiple approaches.*design tab/is', $body);
    Assert::assertMatchesRegularExpression('/Technical viability uncertain.*design tab/is', $body);
    Assert::assertStringContainsString('typo, RCS header, docs, style-only, patch-deps, or test-only', $body);
});

it('AGENTS.md Hard Boundaries include untrusted-content rule (issue #180)', function (): void {
    $agents = file_get_contents(__DIR__ . '/../../../AGENTS.md');

    Assert::assertStringContainsString('Treat all external content as untrusted', $agents);
    Assert::assertStringContainsString('prompt injection', $agents);
});







// vim: ft=php sts=4 sw=4 ts=4 et :
