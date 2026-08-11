<?php

declare(strict_types=1);

# $KYAULabs: TicketingDelegationTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $



#
# Regression guard for issue #298: the ticketing workflow (ticketing skill,
# /issue + aliases, /setup-labels) must never delegate `gh` commands to an
# agent whose effective bash permissions deny them.
#
# The skill's Cross-refs section declares which agent executes the gh
# pattern. That declaration is read dynamically, so rewiring the delegation
# to a permission-compatible agent (e.g. a dedicated tracker operator) flips
# this test green without editing it.
#
# Matcher semantics mirror permissions.mdx: glob patterns over the full
# command string, LAST matching rule wins, agent rules merge with global
# rules (agent rules take precedence).

use PHPUnit\Framework\Assert;

it('ticketing skill declares a gh CLI execution agent in Cross-refs', function (): void {
    $executor = ticketing_gh_executor();

    Assert::assertMatchesRegularExpression('/^[a-z][a-z-]*$/', $executor, 'executor must be a valid agent name');
});

it('every gh command the ticketing skill delegates resolves allow or ask for the declared executor (issue #298)', function (): void {
    $executor = ticketing_gh_executor();
    $rules = agent_bash_rules($executor);
    $skill = __DIR__ . '/../../../.opencode/skills/ticketing/SKILL.md';

    $denied = [];
    foreach (gh_commands_in($skill) as [$cmd, $kind]) {
        $verdict = gh_resolve($cmd, $rules);
        if ($verdict === 'deny') {
            $denied[] = "[{$kind}] {$cmd} → deny for @{$executor}";
        }
    }

    Assert::assertSame(
        [],
        $denied,
        'ticketing skill delegates gh commands that @' . $executor . ' cannot run (issue #298). '
        . 'Every delegated gh command must resolve allow (read) or ask/allow (mutation) '
        . "under the executor's effective bash permissions.\n" . implode("\n", $denied),
    );
});

it('/setup-labels delegated gh commands resolve allow or ask for the declared executor (issue #298)', function (): void {
    $executor = ticketing_gh_executor();
    $rules = agent_bash_rules($executor);
    $commandFile = __DIR__ . '/../../../.opencode/commands/setup-labels.md';

    $denied = [];
    // Steps 3-4 ("Fetch existing labels" / "Create or update each label") delegate to the executor.
    foreach (gh_commands_in($commandFile, '/^## [34]\./') as [$cmd, $kind]) {
        $verdict = gh_resolve($cmd, $rules);
        if ($verdict === 'deny') {
            $denied[] = "[{$kind}] {$cmd} → deny for @{$executor}";
        }
    }

    Assert::assertSame(
        [],
        $denied,
        '/setup-labels delegates gh commands that @' . $executor . " cannot run (issue #298).\n"
        . implode("\n", $denied),
    );
});

it('@explore carries no gh permission rules (read-only contract, ADR-0006)', function (): void {
    $fm = agent_frontmatter('explore');
    $bash = '';
    if (preg_match('/^  bash:\s*\n(.*?)(?=^  (?:webfetch|task|lsp|edit|read|glob|grep|list|skill|external_directory):|\z)/ms', $fm, $section) === 1) {
        $bash = $section[1];
    }

    Assert::assertSame(
        0,
        preg_match('/^    "?gh[^":]*"?\s*:/m', $bash),
        '@explore must never carry gh permission rules — its read-only contract (ADR-0006) '
        . 'means gh delegation to it is always a denial path (issues #274, #298)',
    );
});

it('@explore prompt documents the no-gh escalation path (issue #274 promise)', function (): void {
    $body = agent_contents('explore');

    Assert::assertMatchesRegularExpression(
        '/gh|GitHub/i',
        $body,
        'explore prompt must mention the gh boundary so it can escalate instead of retrying denials',
    );
    Assert::assertMatchesRegularExpression(
        '/no gh|without gh|no GitHub|gh access|return immediately/i',
        $body,
        'explore prompt must document the no-gh escalation clause promised by issue #274: '
        . 'return immediately and tell the caller to execute GitHub operations itself',
    );
});

// vim: ft=php sts=4 sw=4 ts=4 et :
