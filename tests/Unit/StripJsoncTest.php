<?php

declare(strict_types=1);

# $KYAULabs: StripJsoncTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

test('strip_jsonc_comments strips an unterminated block comment', function () {
    expect(strip_jsonc_comments('{"a":1} /* x'))->toBe('{"a":1} ');
});

test('strip_jsonc_comments strips an unterminated line comment', function () {
    expect(strip_jsonc_comments('{"a":1} // note'))->toBe('{"a":1} ');
});

test('strip_jsonc_comments leaves // inside a quoted string', function () {
    expect(strip_jsonc_comments('{"url":"https://x.test/a"}'))->toBe('{"url":"https://x.test/a"}');
});

test('strip_jsonc_comments strips a terminated block comment', function () {
    expect(strip_jsonc_comments('{"a":1} /* c */ {"b":2}'))->toBe('{"a":1}  {"b":2}');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
