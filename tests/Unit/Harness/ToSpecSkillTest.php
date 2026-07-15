<?php

declare(strict_types=1);

# $KYAULabs: ToSpecSkillTest.php kyau@nova 2026/07/15 -0700 Exp $







/**
 * Asserts the to-spec skill (issue #133) meets its acceptance criteria:
 * exists with derived-from metadata, declares no-interview synthesis, uses
 * CONTEXT.md vocabulary and cites ADRs, sketches test seams with a
 * confirmation gate, defines a spec template targeting docs/specs/, and
 * includes a Gotchas section. Index consistency (AGENTS.md / README.md) is
 * enforced separately by validate-harness.sh.
 */

test('to-spec skill file exists with required frontmatter', function (): void {
    $skillPath = __DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md';
    expect(file_exists($skillPath))->toBeTrue("to-spec SKILL.md not found at {$skillPath}");

    $content = file_get_contents($skillPath);
    expect($content)->not->toBeFalse("Could not read {$skillPath}");

    // name matches directory; description is a "Use when" trigger;
    // derived-from attributes the mattpocock/skills source.
    expect($content)->toContain('name: to-spec');
    expect($content)->toMatch('/^description:.*Use when/m');
    expect($content)->toContain('derived-from: mattpocock/skills');
});

test('to-spec skill declares no-interview synthesis', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md');

    // Acceptance criterion: "no interview performed".
    expect($content)->toContain('NOT interview');
    expect($content)->toContain('No interview');
});

test('to-spec skill uses CONTEXT.md vocabulary and cites ADRs', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md');

    expect($content)->toContain('CONTEXT.md');
    expect($content)->toMatch('/\bADRs?\b/');
});

test('to-spec skill sketches test seams with a confirmation gate', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md');

    expect($content)->toMatch('/\bseam\b/i');
    expect($content)->toMatch('/existing seam/i');
    expect($content)->toMatch('/highest seam/i');
    expect($content)->toMatch('/confirm/i');
});

test('to-spec skill defines a spec template targeting docs/specs/', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md');

    expect($content)->toContain('docs/specs/');
    expect($content)->toContain('Problem Statement');
    expect($content)->toContain('Out of Scope');
});

test('to-spec skill has a Gotchas section', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md');

    expect($content)->toContain('## Gotchas');
});



// vim: ft=php sts=4 sw=4 ts=4 et :
