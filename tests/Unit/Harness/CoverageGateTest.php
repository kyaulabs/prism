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

test('build_coverage_map relativizes file nodes', function (): void {
    $xml = simplexml_load_string(
        '<?xml version="1.0"?><coverage><project>'
        . '<file name="/r/backend/a.php"><line num="1" type="stmt" count="1"/></file>'
        . '<file name="/r/backend/b.php"><line num="1" type="stmt" count="0"/></file>'
        . '</project></coverage>'
    );
    $map = build_coverage_map($xml, '/r/');
    expect($map)->toHaveKey('backend/a.php')
        ->and($map['backend/a.php'])->toBe([1, 1])
        ->and($map['backend/b.php'])->toBe([0, 1]);
});

test('classify: in-source above threshold passes', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');
    $r = classify_changed_files(['backend/a.php'], ['backend/a.php' => [10, 10]], $dir . '/', 80);
    expect($r['passed'])->toHaveCount(1)
        ->and($r['failed'])->toBeEmpty()
        ->and($r['warned'])->toBeEmpty();
    unlink($dir . '/backend/a.php');
    rmdir($dir . '/backend');
    rmdir($dir);
});

test('classify: deleted file is skipped', function (): void {
    $r = classify_changed_files(['backend/gone.php'], [], '/r/', 80);
    expect($r['skipped'][0][1])->toBe('deleted/not found');
});

test('classify: out-of-source file with executable code is warned', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/extra.php', "<?php\necho 'x';\n");
    $r = classify_changed_files(['backend/extra.php'], [], $dir . '/', 80);
    expect($r['warned'])->toHaveCount(1)->and($r['skipped'])->toBeEmpty();
    array_map('unlink', glob($dir . '/backend/*'));
    rmdir($dir . '/backend');
    rmdir($dir);
});

test('exit_code_for: failures exit 1; strict+warned exits 1; else 0', function (): void {
    $ok = ['passed' => [['a', 100.0, 1, 1]], 'failed' => [], 'warned' => [], 'skipped' => []];
    $fail = ['passed' => [], 'failed' => [['a', 50.0, 1, 2]], 'warned' => [], 'skipped' => []];
    $warn = ['passed' => [], 'failed' => [], 'warned' => [['a', 'reason']], 'skipped' => []];
    expect(exit_code_for($ok, false))->toBe(0)
        ->and(exit_code_for($fail, false))->toBe(1)
        ->and(exit_code_for($warn, false))->toBe(0)
        ->and(exit_code_for($warn, true))->toBe(1);
});

test('empty clover (no file nodes) exits 2', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    $clover = $dir . '/empty.xml';
    file_put_contents($clover, '<?xml version="1.0"?><coverage><project></project></coverage>');
    $cmd = sprintf('printf %s | php %s %s --root=%s 2>&1', escapeshellarg('backend/a.php'), escapeshellarg(getcwd() . '/.github/scripts/coverage-gate.php'), escapeshellarg($clover), escapeshellarg($dir));
    exec($cmd, $out, $rc);
    expect($rc)->toBe(2);
    expect(implode("\n", $out))->toContain('<source>');
    unlink($clover);
    rmdir($dir);
});



