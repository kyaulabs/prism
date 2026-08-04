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

it('limits strict-greenfield brainstorming to a walking skeleton', function (): void {
    $brainstorming = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/brainstorming/SKILL.md');

    expect($brainstorming)->toContain('walking-skeleton bootstrap')
        ->toContain('one thin vertical slice')
        ->toContain('single-root seed')
        ->toContain('human')
        ->toContain('never push');
});

it('requires map evidence before artifact cleanup', function (): void {
    $finishing = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/finishing-a-development-branch/SKILL.md');

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
    $wayfinder = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/wayfinder/SKILL.md');

    expect($wayfinder)->toContain('strict greenfield')
        ->toContain('bootstrap first')
        ->toContain('immutable')
        ->toContain('Notes');
});


// vim: ft=php sts=4 sw=4 ts=4 et :
