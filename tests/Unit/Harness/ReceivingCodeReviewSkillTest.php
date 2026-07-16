<?php

declare(strict_types=1);

# $KYAULabs: ReceivingCodeReviewSkillTest.php kyau@nova 2026/07/16 -0700 Exp $















/**
 * Asserts the receiving-code-review skill (issue #138) extends its triage to
 * consume the 4-axis @code-review report (ocr / standards / spec / sast).
 * The 4 axes use three vocabularies; the skill must normalize them into one
 * Blocking / Suggested / Informational triage and present an axis-tagged
 * Fixed / Deferred / Informational summary.
 */

test('skill documents normalization across the 4 axes', function (): void {
    $skillPath = __DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md';
    expect(file_exists($skillPath))->toBeTrue("receiving-code-review SKILL.md not found at {$skillPath}");

    $content = file_get_contents($skillPath);
    expect($content)->not->toBeFalse("Could not read {$skillPath}");
    expect($content)->toMatch('/4[-\s]?axes/i');
    expect($content)->toContain('standards');
    expect($content)->toContain('spec');
    expect($content)->toContain('sast');
});

test('AC1 spec Omitted requirement maps to Blocking', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/Omitted.*Blocking/is');
});

test('AC2 Fowler/standards smells capped at Suggested never Blocking', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/standards.*Suggested/is');
    expect($content)->toMatch('/Never Blocking/i');
});

test('AC3 semgrep ERROR maps to Blocking', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/ERROR.*Blocking/is');
});

test('AC4 name-the-bug rule preserved at most Suggested', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/cannot articulate the bug/i');
});

test('AC5 summary is a single axis-tagged Fixed/Deferred/Informational list', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toContain('[axis]');
    expect($content)->toMatch('/\[ocr\]/');
    expect($content)->toMatch('/\[sast\]/');
    expect($content)->toMatch('/\[spec\]/');
    expect($content)->toMatch('/\[standards\]/');
});

test('skill notes the standards producer/consumer divergence as deferred cleanup', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/deferred cleanup/i');
});




// vim: ft=php sts=4 sw=4 ts=4 et :
