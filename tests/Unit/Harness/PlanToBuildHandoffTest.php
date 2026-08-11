<?php

declare(strict_types=1);

# $KYAULabs: PlanToBuildHandoffTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $





/**
 * Regression tests for the read-only Plan-to-Build handoff (issue #297).
 *
 * Plan mode is read-only per ADR-0006: it denies all direct I/O, dispatches
 * only the six read-only subagents (test-audit, code-review, semgrep,
 * architect, explore, scout), and its cycle ENDS when the plan is approved —
 * persistence and execution are Build-mode concerns. PlanModeAllowlistTest.php
 * (issue #184) locks the permission block; these tests lock the Plan-facing
 * *instruction text* (the plan prompt in opencode.jsonc plus the skills Plan
 * is directed to load) so workflow prose cannot drift back into referencing
 * capabilities Plan is denied: the executing-plans skill, the @docs-writer
 * and @tdd agents, and direct write/commit operations.
 */

/**
 * Extract a section from a skill document between two markers.
 *
 * Fails closed: a missing start marker throws instead of returning '' — a
 * renamed heading must disarm the guard loudly, not vacuously pass.
 *
 * @param  string  $content  Full document content.
 * @param  string  $start    Start marker (heading or bold lead-in).
 * @param  string  $end      End marker (next heading or bold lead-in).
 * @return string            The section text between the markers (exclusive).
 * @throws RuntimeException  When the start marker is absent.
 */
function harness_skill_section(string $content, string $start, string $end): string
{
    $startPos = strpos($content, $start);

    if ($startPos === false) {
        throw new RuntimeException(
            'Section start marker not found: ' . $start . ' (renamed heading '
            . 'disarms the guard — fix the marker or the lock is vacuous).',
        );
    }

    $sectionStart = $startPos + strlen($start);
    $endPos = strpos($content, $end, $sectionStart);

    if ($endPos === false) {
        return substr($content, $sectionStart);
    }

    return substr($content, $sectionStart, $endPos - $sectionStart);
}

/**
 * Strip "Do NOT invoke/dispatch/load <needle>" negative references from text.
 *
 * The design agent prompt legitimately says "Do NOT invoke `writing-plans`"
 * (asserted by ModelConfigTest, ADR-0030) — a negative reference prohibits a
 * capability rather than directing its use. The Plan prompt and skills may
 * reference denied skills/agents ONLY in this negative form; any other
 * occurrence is a directive that violates the read-only boundary.
 *
 * @param  string  $text    Text to strip.
 * @param  string  $needle  Capability name to protect (e.g. "executing-plans").
 * @return string           Text with negative references removed.
 */
function harness_strip_negations(string $text, string $needle): string
{
    $pattern = '/Do\s+not\s+(?:invoke|dispatch|load|run|use|execute)\s+(?:`)?'
        . preg_quote($needle, '/') . '(?:`)?/i';

    return (string) preg_replace($pattern, '', $text);
}

it('plan prompt does not direct the Plan agent to the executing-plans skill (ADR-0006 read-only boundary)', function (): void {
    $prompt = (string) (load_opencode_config()['agent']['plan']['prompt'] ?? '');

    $stripped = harness_strip_negations($prompt, 'executing-plans');

    PHPUnit\Framework\Assert::assertStringNotContainsString(
        'executing-plans',
        $stripped,
        'The Plan agent must not be directed to the executing-plans skill '
        . '(only "Do NOT invoke" references are permitted, mirroring the '
        . 'design prompt\'s "Do NOT invoke `writing-plans`" boundary): '
        . 'execution (inline implementation, @tdd dispatch, commits) is denied '
        . 'to Plan per ADR-0006. The plan prompt must end the Plan cycle at '
        . 'approval and direct the user to the build tab instead (issue #297).',
    );
});

it('plan prompt does not direct the Plan agent to write-capable agents or git mutation', function (): void {
    $prompt = (string) (load_opencode_config()['agent']['plan']['prompt'] ?? '');

    foreach (['@docs-writer', '@tdd'] as $needle) {
        $stripped = harness_strip_negations($prompt, $needle);

        PHPUnit\Framework\Assert::assertStringNotContainsString(
            $needle,
            $stripped,
            "The Plan prompt must not direct the Plan agent to '{$needle}' "
            . '(only "Do NOT invoke/dispatch" references are permitted): Plan '
            . 'is read-only and cannot dispatch write-capable agents (ADR-0006).',
        );
    }

    foreach (['git add', 'git commit', 'git push'] as $needle) {
        $stripped = harness_strip_negations($prompt, $needle);

        PHPUnit\Framework\Assert::assertStringNotContainsString(
            $needle,
            $stripped,
            "The Plan prompt must not reference '{$needle}' (only \"Do NOT "
            . 'run/use/execute\' prohibitions are permitted): Plan cannot run '
            . 'git mutations (ADR-0006).',
        );
    }
});

it('every agent mentioned in the plan prompt is dispatchable via the plan task allowlist', function (): void {
    $config = load_opencode_config();
    $prompt = (string) ($config['agent']['plan']['prompt'] ?? '');
    $allowlist = $config['agent']['plan']['permission']['task'] ?? [];

    preg_match_all('/@([a-z][a-z-]+)/', $prompt, $matches);

    foreach (array_unique($matches[1]) as $agent) {
        // Negative references ("Do NOT dispatch `@tdd`") prohibit a capability
        // rather than directing its use — permitted by this test's negation
        // contract (see harness_strip_negations), mirroring the design
        // prompt's "Do NOT dispatch `@tdd`" boundary (ModelConfigTest).
        // Only non-negative mentions must be dispatchable.
        $stripped = harness_strip_negations($prompt, '@' . $agent);

        if (!str_contains($stripped, '@' . $agent)) {
            continue;
        }

        PHPUnit\Framework\Assert::assertSame(
            'allow',
            $allowlist[$agent] ?? null,
            "Plan prompt references '@{$agent}' but the plan task allowlist "
            . "does not permit dispatching it (ADR-0006 Decision #3). Plan may "
            . 'only reference subagents it can actually dispatch.',
        );
    }
});

it('plan prompt directs the user to the build tab when the plan is approved', function (): void {
    $prompt = (string) (load_opencode_config()['agent']['plan']['prompt'] ?? '');

    PHPUnit\Framework\Assert::assertMatchesRegularExpression(
        '/`?build`?\s+tab/',
        $prompt,
        'The Plan prompt must end the Plan cycle at approval by directing the '
        . 'user to the build tab for implementation — mirroring the design '
        . "agent's cycle boundary ('direct the user to the plan tab'). "
        . 'Plan must never hand off to executing-plans itself (issue #297).',
    );
});

it('writing-plans skill does not delegate plan persistence to @docs-writer', function (): void {
    $content = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/writing-plans/SKILL.md');

    $planDelivery = harness_skill_section($content, '**Plan delivery:**', '**Plan lifecycle:**');

    PHPUnit\Framework\Assert::assertStringNotContainsString(
        '@docs-writer',
        $planDelivery,
        "writing-plans 'Plan delivery' must not delegate file writing to "
        . '@docs-writer: docs-writer was removed from the Plan task allowlist '
        . 'by ADR-0006 Decision #3 — Plan cannot dispatch it. Persistence is '
        . 'delegated to the build agent (issue #297).',
    );

    PHPUnit\Framework\Assert::assertStringNotContainsString(
        'delegate writing the plan file to disk',
        $content,
        "writing-plans cross-refs must not direct plan-file persistence to "
        . '@docs-writer (ADR-0006: file saving is delegated to the build '
        . 'agent). Reword the cross-ref to the build tab (issue #297).',
    );
});

it('writing-plans skill does not instruct the Plan agent to hand off to executing-plans', function (): void {
    $content = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/writing-plans/SKILL.md');

    $cycleBoundary = harness_skill_section($content, '## Cycle boundary', '## Remember');
    $stripped = harness_strip_negations($cycleBoundary, 'executing-plans');

    PHPUnit\Framework\Assert::assertStringNotContainsString(
        'executing-plans',
        $stripped,
        "writing-plans 'Cycle boundary' must not direct the Plan agent to "
        . "load/invoke the executing-plans skill (only \"Do NOT invoke\" "
        . "references are permitted): execution is denied to Plan (ADR-0006). "
        . 'The Plan cycle ends at approval; the build agent runs '
        . 'executing-plans (issue #297).',
    );
});

it('writing-plans cross-refs carry explicit Plan-mode prohibitions for executing-plans and @tdd', function (): void {
    $content = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/writing-plans/SKILL.md');

    $crossRefs = harness_skill_section($content, '## Cross-refs', '## Gotchas');

    PHPUnit\Framework\Assert::assertMatchesRegularExpression(
        '/Do\s+not\s+invoke\s+`?executing-plans`?/i',
        $crossRefs,
        "writing-plans 'Cross-refs' must explicitly prohibit the Plan agent "
        . 'from invoking executing-plans (ADR-0006): a positive cross-ref '
        . '("the step after this one") re-directs Plan to a capability it is '
        . 'denied — the drift class issue #297 exists to kill.',
    );

    PHPUnit\Framework\Assert::assertMatchesRegularExpression(
        '/Do\s+not\s+dispatch\s+`?@tdd`?/i',
        $crossRefs,
        "writing-plans 'Cross-refs' must explicitly prohibit the Plan agent "
        . 'from dispatching @tdd (ADR-0006): Plan is read-only and the cycle '
        . 'ends at approval — execution happens in build mode (issue #297).',
    );
});


// vim: ft=php sts=4 sw=4 ts=4 et :
