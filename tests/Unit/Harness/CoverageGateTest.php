<?php

declare(strict_types=1);

# $KYAULabs: CoverageGateTest.php kyau@cosmos.kyaulabs 2026/07/23 -0700 Exp $














/**
 * Unit tests for the executable-code heuristic extracted from
 * coverage-gate.php. Pure string inputs — no filesystem.
 */

define('COVERAGE_GATE_AS_LIBRARY', true);
require_once dirname(__DIR__, 3) . '/.github/scripts/coverage-gate.php';

test('procedural echo is executable', function (): void {
    expect(has_executable_code("<?php\necho 'hi';\n"))->toBeTrue();
});

test('class with a method body is executable', function (): void {
    expect(has_executable_code("<?php\nclass A { public function go(): void { if (true) { return; } } }\n"))->toBeTrue();
});

test('interface with no bodies is not executable', function (): void {
    expect(has_executable_code("<?php\ninterface I { public function go(): void; }\n"))->toBeFalse();
});

test('constants-only class is not executable', function (): void {
    expect(has_executable_code("<?php\nclass C { public const X = 1; }\n"))->toBeFalse();
});

test('bare open tag is not executable', function (): void {
    expect(has_executable_code("<?php\n"))->toBeFalse();
});

test('inline HTML is executable', function (): void {
    expect(has_executable_code("<h1>hi</h1><?php echo 1;"))->toBeTrue();
});

test('parse_args reads clover positional and defaults', function (): void {
    $a = parse_args(['script.php', 'clover.xml']);
    expect($a['clover'])->toBe('clover.xml')
        ->and($a['min'])->toBe(80)
        ->and($a['strict'])->toBeFalse();
});

test('parse_args reads --min=N and --min N forms', function (): void {
    expect(parse_args(['s', 'c.xml', '--min=90'])['min'])->toBe(90)
        ->and(parse_args(['s', 'c.xml', '--min', '75'])['min'])->toBe(75);
});

test('parse_args reads --root and --strict flags', function (): void {
    $a = parse_args(['s', 'c.xml', '--root=/tmp', '--strict']);
    expect($a['root'])->toBe('/tmp')->and($a['strict'])->toBeTrue();
});



// vim: ft=php sts=4 sw=4 ts=4 et :
