<?php

declare(strict_types=1);

# $KYAULabs: NestedDispatchAskContractTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $












use PHPUnit\Framework\Assert;

/**
 * Regression tests for the nested-subagent dispatch ask contract (issue #3292).
 *
 * opencode ≤1.18.16 cannot render permission `ask` prompts from subagents
 * dispatched by another subagent (upstream #13715): an `ask`-gated action
 * from a depth-2 subagent blocks forever with no visible dialog. The harness
 * invariant is therefore: no subagent's `task:` allowlist may reference an
 * agent whose frontmatter carries an `"ask"` verdict in its bash/edit rules
 * — the user must invoke ask-gated agents directly at depth 1, where prompts
 * render. These tests build the dispatch graph from every agent's frontmatter
 * (via the shared agent_frontmatter() helper in tests/Pest.php) and assert
 * the invariant holds, plus a negative control proving the ask detection and
 * graph extraction are non-vacuous and that user-invoked ask-carriers (debug,
 * resolve-merge-conflicts, tracker-operator, from-issue, tdd) keep zero
 * incoming dispatch edges.
 */

/**
 * Extract a permission sub-block (bash/edit/task) from agent frontmatter.
 *
 * Matches the block header (2-space-indented `key:`) and captures the
 * 4-space-indented entries until the next 0/2-space-indented key, the closing
 * `---`, or end of frontmatter. Flat forms (`key: deny`) yield '' — they have
 * no entries to scan.
 *
 * @param  string $frontmatter Raw frontmatter (with --- delimiters).
 * @param  string $key         Permission key: bash, edit, or task.
 * @return string              The block's entry lines, or '' when absent/flat.
 */
function nested_dispatch_permission_section(string $frontmatter, string $key): string
{
    if (preg_match(
        '/^  ' . preg_quote($key, '/') . ':\s*\n(.*?)(?=^[ \t]{0,2}[a-z-]+[a-z0-9-]*:|\n---|\z)/ms',
        $frontmatter,
        $m,
    ) === 1) {
        return $m[1];
    }

    return '';
}

/**
 * List every subagent definition name under .opencode/agents.
 *
 * @return list<string>  Agent names (filenames without .md), filesystem order.
 */
function nested_dispatch_agent_names(): array
{
    $names = [];

    foreach (glob(__DIR__ . '/../../../.opencode/agents/*.md') ?: [] as $file) {
        $names[] = basename($file, '.md');
    }

    return $names;
}

/**
 * Build the subagent dispatch graph from every agent's task allowlist.
 *
 * @return array<string, list<string>>  Map of source agent → dispatched names
 *                                      (excluding the "*" catch-all).
 */
function nested_dispatch_graph(): array
{
    $graph = [];

    foreach (nested_dispatch_agent_names() as $name) {
        $section = nested_dispatch_permission_section(agent_frontmatter($name), 'task');
        $targets = [];

        foreach (preg_split('/\r?\n/', $section) ?: [] as $line) {
            if (preg_match('/^[ \t]{4}"([a-z0-9-]+)"[ \t]*:[ \t]*"?allow"?[ \t]*$/', $line, $m) === 1) {
                $targets[] = $m[1];
            }
        }

        $graph[$name] = $targets;
    }

    return $graph;
}

/**
 * List agents whose frontmatter carries an "ask" verdict in bash or edit.
 *
 * @return list<string>  Agent names, in filesystem order.
 */
function nested_dispatch_ask_carriers(): array
{
    $carriers = [];

    foreach (nested_dispatch_agent_names() as $name) {
        $frontmatter = agent_frontmatter($name);
        $hasAsk = false;

        foreach (['bash', 'edit'] as $key) {
            $section = nested_dispatch_permission_section($frontmatter, $key);
            if ($section !== '' && preg_match('/^[ \t]{4}"?[^":]+"?[ \t]*:[ \t]*"?ask"?[ \t]*$/m', $section) === 1) {
                $hasAsk = true;
            }
        }

        if ($hasAsk) {
            $carriers[] = $name;
        }
    }

    return $carriers;
}

/**
 * Flat list of every agent name referenced by any task allowlist.
 *
 * @param  array<string, list<string>> $graph Dispatch graph.
 * @return list<string>                      Unique dispatched names.
 */
function nested_dispatch_dispatched(array $graph): array
{
    $dispatched = [];

    foreach ($graph as $targets) {
        foreach ($targets as $target) {
            $dispatched[] = $target;
        }
    }

    return array_values(array_unique($dispatched));
}

/**
 * User-invoked agents that legitimately carry "ask" verdicts.
 *
 * Shared by both negative controls: adding a fifth ask-carrier must update
 * this one list, not two divergent ones (each test omitting a member would
 * silently weaken the other control).
 *
 * @return list<string>
 */
function nested_dispatch_user_invoked_ask_carriers(): array
{
    return ['debug', 'resolve-merge-conflicts', 'tracker-operator', 'from-issue', 'tdd'];
}

it('no subagent dispatches an agent carrying an ask verdict in bash/edit (issue #3292)', function (): void {
    $graph = nested_dispatch_graph();
    $carriers = nested_dispatch_ask_carriers();
    $violations = [];

    foreach ($graph as $source => $targets) {
        foreach ($targets as $target) {
            if (in_array($target, $carriers, true)) {
                $violations[] = "{$source} → {$target}";
            }
        }
    }

    Assert::assertSame(
        [],
        $violations,
        'Nested subagent dispatch of an ask-gated agent hangs with no visible '
        . "prompt in opencode ≤1.18.16 (upstream #13715, issue #3292). Ask "
        . 'verdicts must surface at depth 1: the user invokes the agent '
        . 'directly, no subagent may dispatch it. Violating edges: '
        . implode(', ', $violations),
    );
});

it('negative control: ask detection and graph extraction are non-vacuous', function (): void {
    $graph = nested_dispatch_graph();
    $carriers = nested_dispatch_ask_carriers();

    // Ask detection must see the real ask-carriers (user-invoked agents whose
    // ask gates surface at depth 1 where rendering works).
    foreach (nested_dispatch_user_invoked_ask_carriers() as $agent) {
        Assert::assertContains($agent, $carriers, "{$agent} carries 'ask' verdicts and must be detected");
    }

    // Graph extraction must see the real dispatch edges.
    Assert::assertContains('explore', $graph['from-issue'] ?? [], 'from-issue must dispatch explore');
    Assert::assertContains('architect', $graph['from-issue'] ?? [], 'from-issue must dispatch architect');
    Assert::assertContains('frontend', $graph['tdd'] ?? [], 'tdd must dispatch frontend');
    Assert::assertContains('semgrep', $graph['code-review'] ?? [], 'code-review must dispatch semgrep');
});

it('negative control: user-invoked ask-carriers keep zero incoming dispatch edges', function (): void {
    $graph = nested_dispatch_graph();
    $dispatched = nested_dispatch_dispatched($graph);

    // These agents legitimately hold "ask" verdicts but nothing may dispatch
    // them — the user invokes each directly (issue #3292).
    foreach (nested_dispatch_user_invoked_ask_carriers() as $agent) {
        Assert::assertNotContains(
            $agent,
            $dispatched,
            "{$agent} must be user-invoked only: it carries 'ask' verdicts and "
            . 'a nested dispatch would hang unrendered in opencode ≤1.18.16 (issue #3292).',
        );
    }
});







// vim: ft=php sts=4 sw=4 ts=4 et :
