<?php

declare(strict_types=1);

# $KYAULabs: SecurityCodingSkillTest.php kyau@cosmos.kyaulabs 2026/07/26 -0700 Exp $






/**
 * Absolute path to the security-coding skill markdown file.
 *
 * @return non-empty-string
 */
function security_coding_skill_path(): string
{
    $repoRoot = dirname(__DIR__, 3);

    return $repoRoot . DIRECTORY_SEPARATOR
        . '.opencode' . DIRECTORY_SEPARATOR
        . 'skills' . DIRECTORY_SEPARATOR
        . 'security-coding' . DIRECTORY_SEPARATOR
        . 'SKILL.md';
}

/**
 * Extracts the CSRF section body from the security-coding skill.
 *
 * Captures from the "## CSRF" heading up to (not including) the next "## "
 * heading, or end of file. Returns the empty string when the section is
 * absent so callers can assert non-emptiness with a clear message.
 */
function security_coding_csrf_section(string $content): string
{
    if (preg_match('/^## CSRF\b.*?(?=^## |\z)/ms', $content, $matches) !== 1) {
        return '';
    }

    return $matches[0];
}

test('security-coding skill file exists', function (): void {
    expect(security_coding_skill_path())->toBeFile();
});

test('security-coding CSRF guidance validates with hash_equals', function (): void {
    $content = (string) file_get_contents(security_coding_skill_path());
    $section = security_coding_csrf_section($content);

    expect($section)
        ->not->toBeEmpty('CSRF section not found in security-coding skill')
        ->and($section)->toContain('hash_equals(');
});

test('security-coding CSRF guidance escapes with full htmlspecialchars flags', function (): void {
    $content = (string) file_get_contents(security_coding_skill_path());
    $section = security_coding_csrf_section($content);

    expect($section)
        ->not->toBeEmpty('CSRF section not found in security-coding skill')
        ->and($section)->toContain('ENT_QUOTES | ENT_HTML5, \'UTF-8\'');
});

test('security-coding CSRF guidance generates the token once per session', function (): void {
    $content = (string) file_get_contents(security_coding_skill_path());
    $section = security_coding_csrf_section($content);

    expect($section)
        ->not->toBeEmpty('CSRF section not found in security-coding skill')
        ->and($section)->toContain('empty($_SESSION[\'csrf\'])');
});




// vim: ft=php sts=4 sw=4 ts=4 et :
