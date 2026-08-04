<?php

declare(strict_types=1);

# $KYAULabs: BrainstormingSkillTest.php kyau@cosmos.kyaulabs 2026/08/04 -0700 Exp $







/**
 * Asserts the brainstorming skill (issue #287) runs its strict-greenfield
 * scope gate before detailed grilling, hands established and indeterminate
 * oversized requests to the wayfinder skill, and retains no manual
 * sub-project decomposition fallback. Also pins the writing-plans Scope
 * Check contract: an approved spec that is still oversized returns to
 * wayfinder instead of producing multiple plans.
 */

/**
 * Returns the absolute path to the brainstorming SKILL.md file.
 *
 * @return string
 */
function brainstorming_skill_path(): string
{
    return __DIR__ . '/../../../.opencode/skills/brainstorming/SKILL.md';
}

/**
 * Reads and returns the brainstorming SKILL.md content.
 *
 * Asserts the file exists and is readable before returning.
 *
 * @return string
 */
function brainstorming_skill_content(): string
{
    $path = brainstorming_skill_path();
    expect(file_exists($path))->toBeTrue("brainstorming SKILL.md not found at {$path}");

    $content = file_get_contents($path);
    expect($content)->not->toBeFalse("Could not read {$path}");

    return $content;
}

it('checks scope before detailed grilling', function (): void {
    $skill = brainstorming_skill_content();
    $scope = strpos($skill, 'classify-greenfield.sh');
    $grilling = strpos($skill, 'Gather requirements via grilling');

    expect($scope)->not->toBeFalse()
        ->and($grilling)->not->toBeFalse()
        ->and($scope)->toBeLessThan($grilling);
});

it('hands established and indeterminate oversized work to wayfinder', function (): void {
    $skill = brainstorming_skill_content();

    expect($skill)->toContain('established')
        ->toContain('indeterminate')
        ->toContain('wayfinder')
        ->toContain('stop detailed grilling');
});

it('does not retain manual sub-project decomposition', function (): void {
    expect(brainstorming_skill_content())
        ->not->toContain('help the user decompose into sub-projects')
        ->not->toContain('brainstorm the first sub-project');
});

it('returns oversized approved specs to wayfinder instead of creating multiple plans', function (): void {
    $writingPlans = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/writing-plans/SKILL.md');

    expect($writingPlans)->toContain('wayfinder')
        ->toContain('return it to wayfinder')
        ->not->toContain('one per subsystem');
});

/**
 * Extracts the strict-greenfield bootstrap path section from the skill.
 *
 * Returns an empty string when the section heading is absent so the
 * assertions fail meaningfully during the Red phase.
 *
 * @param  string  $skill  Full brainstorming SKILL.md content.
 * @return string  The bootstrap section text.
 */
function brainstorming_bootstrap_section(string $skill): string
{
    $heading = '## Strict-greenfield bootstrap path';
    $start = strpos($skill, $heading);
    if ($start === false) {
        return '';
    }

    $next = strpos($skill, '## ', $start + strlen($heading));
    if ($next === false) {
        $next = strlen($skill);
    }

    return substr($skill, $start, $next - $start);
}

it('makes the greenfield result the sole exception to immediate wayfinding', function (): void {
    expect(brainstorming_skill_content())
        ->toContain('sole exception to immediate wayfinding')
        ->toContain('strict-greenfield bootstrap path');
});

it('scopes the greenfield design to a walking skeleton with one thin vertical slice', function (): void {
    expect(brainstorming_skill_content())
        ->toContain('walking-skeleton bootstrap')
        ->toContain('one thin vertical slice')
        ->toContain('quality scaffold');
});

it('hands the approved bootstrap spec to the root seed without design planning', function (): void {
    $section = brainstorming_bootstrap_section(brainstorming_skill_content());

    expect($section)->toContain('## Strict-greenfield bootstrap path')
        ->toContain('single-root seed')
        ->toContain('human')
        ->toContain('never push')
        ->toContain('new-branch.sh')
        ->toContain('plan tab')
        ->toContain('ADR-0044')
        ->toContain('ADR-0030');
});

it('documents the bootstrap completion checkpoint before wayfinding', function (): void {
    $section = brainstorming_bootstrap_section(brainstorming_skill_content());

    expect($section)->toContain('/check')
        ->toContain('@code-review')
        ->toContain('immutable')
        ->toContain('Notes');
});



// vim: ft=php sts=4 sw=4 ts=4 et :
