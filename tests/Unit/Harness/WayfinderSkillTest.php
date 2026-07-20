<?php

declare(strict_types=1);

# $KYAULabs: WayfinderSkillTest.php kyau@nova 2026/07/20 -0700 Exp $















/**
 * Asserts the wayfinder skill (issue #142) meets its acceptance criteria:
 * exists with derived-from metadata; produces a wayfinder:map parent plus
 * research/prototype/grilling/task child tickets with correct labels via the
 * ticketing gh pattern; defines the resolution cycle (close child -> map
 * updates -> frontier advances); and merges to a spec via the to-spec skill
 * referencing wayfinder decisions. Index consistency (AGENTS.md / README.md)
 * is enforced separately by .github/scripts/validate-harness.sh.
 */

/**
 * Returns the absolute path to the wayfinder SKILL.md file.
 *
 * @return string
 */
function wayfinder_skill_path(): string
{
    return __DIR__ . '/../../../.opencode/skills/wayfinder/SKILL.md';
}

/**
 * Reads and returns the wayfinder SKILL.md content.
 *
 * Asserts the file exists and is readable before returning.
 *
 * @return string
 */
function wayfinder_skill_content(): string
{
    $path = wayfinder_skill_path();
    expect(file_exists($path))->toBeTrue("wayfinder SKILL.md not found at {$path}");

    $content = file_get_contents($path);
    expect($content)->not->toBeFalse("Could not read {$path}");

    return $content;
}

test('wayfinder skill file exists with required frontmatter', function (): void {
    $content = wayfinder_skill_content();

    // AC1: exists with derived-from; name matches directory;
    // description is a "Use when" trigger; attributes mattpocock/skills source.
    expect($content)->toContain('name: wayfinder');
    expect($content)->toMatch('/^description:.*Use when/m');
    expect($content)->toContain('derived-from: mattpocock/skills');
});

test('AC2 wayfinder map and four ticket-type labels are prescribed', function (): void {
    $content = wayfinder_skill_content();

    // The map label and the four child ticket-type labels.
    expect($content)->toContain('wayfinder:map');
    expect($content)->toContain('wayfinder:research');
    expect($content)->toContain('wayfinder:prototype');
    expect($content)->toContain('wayfinder:grilling');
    expect($content)->toContain('wayfinder:task');

    // Labels are created idempotently (ticketing / setup-labels pattern).
    expect($content)->toMatch('/idempotent/i');
});

test('AC2 child tickets created via the ticketing gh pattern with native blocking', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('ticketing');
    // Native blocking relationship (gh >= 2.94.0) renders the frontier visually.
    expect($content)->toMatch('/add-blocked-by|addBlockedBy|blocked by/i');
});

test('AC3 resolution cycle closes child, updates map, advances frontier', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('Decisions so far');
    expect($content)->toMatch('/\bfrontier\b/i');
    // The hard rule: one ticket resolved per session.
    expect($content)->toMatch('/one ticket per session|never resolve more than one ticket/i');
});

test('AC3 fog of war and out-of-scope are modelled', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toMatch('/fog of war/i');
    expect($content)->toMatch('/Not yet specified/');
    expect($content)->toMatch('/Out of scope/');
});

test('AC4 merges to a spec via the to-spec skill', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('to-spec');
    expect($content)->toMatch('/\bmerge\b/i');
});

test('skill contrasts its boundary with the design tab and @from-issue', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('design');
    expect($content)->toContain('@from-issue');
});

test('skill refers to tickets by name and plans rather than does', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toMatch('/refer by name/i');
    expect($content)->toMatch('/plan.*don.t do|plan, not do|planning by default/i');
});

test('wayfinder skill has a Gotchas section', function (): void {
    $content = wayfinder_skill_content();

    expect($content)->toContain('## Gotchas');
});






// vim: ft=php sts=4 sw=4 ts=4 et :
