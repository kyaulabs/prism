<?php

declare(strict_types=1);

# $KYAULabs: ExecutingPlansVenueContractTest.php kyau@aura.kyaulabs 2026/08/12 -0700 Exp $




use PHPUnit\Framework\Assert;

/**
 * Read the executing-plans skill document.
 *
 * @return string The complete skill document.
 *
 * @throws RuntimeException If the skill cannot be read.
 */
function executing_plans_skill_contents(): string
{
    $path = dirname(__DIR__, 3) . '/.opencode/skills/executing-plans/SKILL.md';
    Assert::assertFileExists($path, 'executing-plans/SKILL.md must exist');

    $contents = file_get_contents($path);
    if ($contents === false) {
        throw new RuntimeException("Failed to read {$path}");
    }

    return $contents;
}

/**
 * Extract the build-mode lead-in before the skill summary.
 *
 * @param  string $skill Complete executing-plans skill document.
 * @return string The build-mode lead-in.
 *
 * @throws RuntimeException If either boundary marker is absent.
 */
function executing_plans_build_mode_leadin(string $skill): string
{
    $startMarker = '**Build-mode skill:**';
    $endMarker = 'Execute an implementation plan';
    $start = strpos($skill, $startMarker);
    $end = strpos($skill, $endMarker);

    if ($start === false || $end === false || $end <= $start) {
        throw new RuntimeException('executing-plans build-mode lead-in markers are missing or reordered');
    }

    return substr($skill, $start, $end - $start);
}

it('proves from-issue lacks executing-plans parent capabilities', function (): void {
    $frontmatter = agent_frontmatter('from-issue');
    $rules = agent_bash_rules('from-issue');

    Assert::assertStringContainsString('"*": deny', $frontmatter);
    Assert::assertStringContainsString('"docs/specs/*": allow', $frontmatter);
    Assert::assertStringContainsString('"docs/plans/*": allow', $frontmatter);
    Assert::assertStringNotContainsString('"tdd": allow', $frontmatter);

    foreach (['php -v', 'php-cs-fixer --version', 'npx eslint --version'] as $command) {
        Assert::assertSame(
            'deny',
            gh_resolve($command, $rules),
            "from-issue must not execute build command: {$command}",
        );
    }
});

it('restricts executing-plans to the build tab and excludes from-issue sessions', function (): void {
    $leadIn = executing_plans_build_mode_leadin(executing_plans_skill_contents());

    Assert::assertStringContainsString('`build` tab', $leadIn);
    Assert::assertStringContainsString('Plan agent must NOT load it', $leadIn);
    Assert::assertStringContainsString('ADR-0006', $leadIn);
    Assert::assertDoesNotMatchRegularExpression(
        '/from-issue.{0,3}sessions/is',
        $leadIn,
        'from-issue cannot run executing-plans or dispatch @tdd; it plans and hands off instead.',
    );
});


// vim: ft=php sts=4 sw=4 ts=4 et :
