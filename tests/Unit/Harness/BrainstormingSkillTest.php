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


// vim: ft=php sts=4 sw=4 ts=4 et :
