<?php

declare(strict_types=1);

# $KYAULabs: GreenfieldBootstrapWorkflowTest.php kyau@cosmos.kyaulabs 2026/08/04 -0700 Exp $









/**
 * Pins the cross-surface strict-greenfield workflow (issue #287): the
 * brainstorming skill scopes a greenfield session to a walking-skeleton
 * bootstrap, the wayfinder skill keeps empty repositories out until the
 * bootstrap is complete, and the finishing skill requires map evidence
 * with an immutable spec URL before ADR-0027 artifact cleanup.
 */

/**
 * Reads and returns the SKILL.md content for a harness skill.
 *
 * Asserts the file exists and is readable before returning.
 *
 * @param  string  $name  Skill directory name, e.g. "brainstorming".
 * @return string  The SKILL.md content.
 */
function greenfield_skill_content(string $name): string
{
    $path = dirname(__DIR__, 3) . "/.opencode/skills/{$name}/SKILL.md";
    expect(file_exists($path))->toBeTrue("SKILL.md not found for {$name}");

    $content = file_get_contents($path);
    expect($content)->not->toBeFalse("Could not read {$path}");

    return $content;
}

it('limits strict-greenfield brainstorming to a walking skeleton', function (): void {
    $brainstorming = greenfield_skill_content('brainstorming');

    expect($brainstorming)->toContain('walking-skeleton bootstrap')
        ->toContain('one thin vertical slice')
        ->toContain('single-root seed')
        ->toContain('human')
        ->toContain('never push');
});

it('requires map evidence before artifact cleanup', function (): void {
    $finishing = greenfield_skill_content('finishing-a-development-branch');

    expect($finishing)->toContain('/check')
        ->toContain('@code-review')
        ->toContain('fresh wayfinder session')
        ->toContain('/blob/')
        ->toContain('map')
        ->toContain('Notes')
        ->toContain('cleanup')
        ->toContain('attestation');
});

it('keeps empty repositories out of wayfinder until bootstrap completion', function (): void {
    $wayfinder = greenfield_skill_content('wayfinder');

    expect($wayfinder)->toContain('strict greenfield')
        ->toContain('bootstrap first')
        ->toContain('immutable')
        ->toContain('Notes');
});



// vim: ft=php sts=4 sw=4 ts=4 et :
