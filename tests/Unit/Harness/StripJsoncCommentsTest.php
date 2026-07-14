<?php

declare(strict_types=1);

# $KYAULabs: StripJsoncCommentsTest.php kyau@nova 2026/07/14 -0700 Exp $









/**
 * Unit tests for strip_jsonc_comments() — the JSONC → JSON comment-stripper.
 *
 * Verifies that // line comments and / * * / block comments are removed
 * while preserving string content (URLs, escaped quotes) and newlines.
 */

test('strips // line comments, preserves newlines', function (): void {
    $input  = "{\n  \"key\": \"value\"\n} // trailing\n";
    $output = strip_jsonc_comments($input);

    expect($output)
        ->not->toContain('//')
        ->not->toContain('trailing');

    $decoded = json_decode($output, true);
    expect($decoded)->toBeArray();
    expect($decoded['key'])->toBe('value');
});

test('strips / * * / block comments, inline between values', function (): void {
    $input  = '{"a": 1, /* comment */ "b": 2}';
    $output = strip_jsonc_comments($input);

    $decoded = json_decode($output, true);
    expect($decoded)->toBeArray();
    expect($decoded['a'])->toEqual(1);
    expect($decoded['b'])->toEqual(2);
});

test('strips / * * / block comments, multi-line', function (): void {
    $input  = "{\"a\": /* multi\nline\ncomment */ 1}";
    $output = strip_jsonc_comments($input);

    $decoded = json_decode($output, true);
    expect($decoded)->toBeArray();
    expect($decoded['a'])->toEqual(1);
});

test('preserves URLs containing // inside strings', function (): void {
    $input  = '{"url": "https://opencode.ai/config.json"}';
    $output = strip_jsonc_comments($input);

    $decoded = json_decode($output, true);
    expect($decoded['url'])->toBe('https://opencode.ai/config.json');
});

test('preserves escaped quotes inside strings', function (): void {
    $input  = '{"msg": "he said \\"hi\\""} // trailing comment';
    $output = strip_jsonc_comments($input);

    $decoded = json_decode($output, true);
    expect($decoded['msg'])->toBe('he said "hi"');
});

test('strips standalone // comment with leading whitespace', function (): void {
    $input  = "  // line comment\n{\"key\": \"value\"}";
    $output = strip_jsonc_comments($input);

    $decoded = json_decode($output, true);
    expect($decoded['key'])->toBe('value');
});

test('returns identical output for input with no comments', function (): void {
    $input  = '{"a": 1, "b": "hi"}';
    $output = strip_jsonc_comments($input);

    expect($output)->toBe($input);
});




// vim: ft=php sts=4 sw=4 ts=4 et :
