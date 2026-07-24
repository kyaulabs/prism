<?php

declare(strict_types=1);

# $KYAULabs: CoverageGateTest.php kyau@cosmos.kyaulabs 2026/07/23 -0700 Exp $






































/**
 * Unit tests for the executable-code heuristic extracted from
 * coverage-gate.php. Pure string inputs — no filesystem.
 */

define('COVERAGE_GATE_AS_LIBRARY', true);
require_once dirname(__DIR__, 3) . '/.github/scripts/coverage-gate.php';

/**
 * Recursively remove a temp directory tree created by a test.
 *
 * Replaces the per-test unlink/rmdir chains so teardown does not assume an
 * exact file structure and survives added fixtures.
 *
 * @param string $dir
 * @return void
 */
function cg_rrmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (array_diff((array) scandir($dir), ['.', '..']) as $entry) {
        $path = $dir . '/' . $entry;
        is_dir($path) ? cg_rrmdir($path) : unlink($path);
    }
    rmdir($dir);
}

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

test('build_coverage_map ignores non-stmt lines', function (): void {
    $xml = simplexml_load_string(
        '<?xml version="1.0"?><coverage><project>'
        . '<file name="/r/backend/a.php">'
        . '<line num="1" type="method" count="1"/>'
        . '<line num="2" type="stmt" count="1"/>'
        . '</file></project></coverage>'
    );
    // Only the stmt line counts; the method line is ignored.
    expect(build_coverage_map($xml, '/r/')['backend/a.php'])->toBe([1, 1]);
});

test('relativize_path falls back to realpath() for a symlinked prefix', function (): void {
    // Reproduces the macOS /tmp -> /private/tmp asymmetry: the Clover path is
    // expressed through a symlink while --root is the realpath target, so the
    // literal str_starts_with match fails and the realpath() fallback fires.
    $real = sys_get_temp_dir() . '/cg_real_' . bin2hex(random_bytes(4));
    mkdir($real . '/backend', 0777, true);
    file_put_contents($real . '/backend/a.php', '<?php');
    $link = sys_get_temp_dir() . '/cg_link_' . bin2hex(random_bytes(4));

    if (!@symlink($real, $link)) {
        // Symlinks unavailable (e.g. restricted platforms) — skip cleanly.
        cg_rrmdir($real);
        $this->markTestSkipped('symlinks not supported on this platform');
    }

    // Clover-style absolute path THROUGH the symlink, rootPrefix at the realpath.
    $rel = relativize_path($link . '/backend/a.php', $real . '/');
    expect($rel)->toBe('backend/a.php');

    unlink($link);
    cg_rrmdir($real);
});

test('relativize_path returns the path unchanged when it cannot be relativized', function (): void {
    // realpath() resolves but lives outside the root prefix → identity fallback.
    $outside = sys_get_temp_dir() . '/cg_outside_' . bin2hex(random_bytes(4)) . '.php';
    file_put_contents($outside, '<?php');
    expect(relativize_path($outside, '/nonexistent/root/'))->toBe($outside);
    unlink($outside);
});

test('classify: in-source above threshold passes', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');
    $r = classify_changed_files(['backend/a.php'], ['backend/a.php' => [10, 10]], $dir . '/', 80);
    expect($r['passed'])->toHaveCount(1)
        ->and($r['failed'])->toBeEmpty()
        ->and($r['warned'])->toBeEmpty();
    cg_rrmdir($dir);
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
    cg_rrmdir($dir);
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
    cg_rrmdir($dir);
});

test('main() prints PASS for files above threshold', function (): void {
    $dir = sys_get_temp_dir() . '/cg_main_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');

    $clover = $dir . '/report.xml';
    file_put_contents(
        $clover,
        '<?xml version="1.0"?><coverage><project>'
        . '<file name="' . $dir . '/backend/a.php">'
        . '<line num="1" type="stmt" count="5"/><line num="2" type="stmt" count="5"/>'
        . '</file></project></coverage>'
    );

    $stdinFile = $dir . '/stdin.txt';
    file_put_contents($stdinFile, "backend/a.php\n");

    ob_start();
    $code = main(3, ['script', $clover, '--root=' . $dir], $stdinFile);
    $out = ob_get_clean();

    expect($code)->toBe(0);
    expect($out)->toContain('PASS');
    // The filename only appears in output if the injected $stdinFile was read
    // and classified — an empty php://stdin would print "0 file(s) checked".
    expect($out)->toContain('backend/a.php');

    cg_rrmdir($dir);
});

test('main() exits 2 for missing clover path', function (): void {
    $stdinFile = sys_get_temp_dir() . '/cg_stdin_' . bin2hex(random_bytes(4));
    file_put_contents($stdinFile, "backend/a.php\n");

    ob_start();
    $code = main(2, ['script'], $stdinFile);
    ob_get_clean();

    expect($code)->toBe(2);

    unlink($stdinFile);
});

test('main() exits 2 for unparseable clover XML', function (): void {
    $dir = sys_get_temp_dir() . '/cg_main_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);

    $badXml = $dir . '/bad.xml';
    file_put_contents($badXml, 'not xml');

    $stdinFile = $dir . '/stdin.txt';
    file_put_contents($stdinFile, "backend/a.php\n");

    // simplexml_load_file emits an E_WARNING on bad XML; route libxml errors
    // internally so the test verifies exit-2 without noisy warning leakage.
    $prevLibxml = libxml_use_internal_errors(true);
    try {
        ob_start();
        $code = main(3, ['script', $badXml, '--root=' . $dir], $stdinFile);
        ob_get_clean();
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($prevLibxml);
    }

    expect($code)->toBe(2);

    cg_rrmdir($dir);
});

test('main() exits 2 and returns early for empty clover (no file nodes)', function (): void {
    $dir = sys_get_temp_dir() . '/cg_main_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);

    $emptyXml = $dir . '/empty.xml';
    file_put_contents($emptyXml, '<?xml version="1.0"?><coverage><project></project></coverage>');

    $stdinFile = $dir . '/stdin.txt';
    file_put_contents($stdinFile, "backend/a.php\n");

    ob_start();
    $code = main(3, ['script', $emptyXml, '--root=' . $dir], $stdinFile);
    $out = ob_get_clean();

    expect($code)->toBe(2);
    // The remediation hint ('<source>') is written to STDERR, not stdout — it
    // is verified by the existing subprocess test above (2>&1 merge). Here we
    // confirm the early return skipped the results table entirely.
    expect($out)->not->toContain('Changed-file coverage gate');

    cg_rrmdir($dir);
});

test('main() exits 1 and prints FAIL when files are below threshold', function (): void {
    $dir = sys_get_temp_dir() . '/cg_main_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');

    $clover = $dir . '/report.xml';
    file_put_contents(
        $clover,
        '<?xml version="1.0"?><coverage><project>'
        . '<file name="' . $dir . '/backend/a.php">'
        . '<line num="1" type="stmt" count="0"/><line num="2" type="stmt" count="0"/>'
        . '<line num="3" type="stmt" count="0"/><line num="4" type="stmt" count="0"/>'
        . '<line num="5" type="stmt" count="0"/>'
        . '</file></project></coverage>'
    );

    $stdinFile = $dir . '/stdin.txt';
    file_put_contents($stdinFile, "backend/a.php\n");

    ob_start();
    $code = main(3, ['script', $clover, '--root=' . $dir], $stdinFile);
    $out = ob_get_clean();

    expect($code)->toBe(1);
    expect($out)->toContain('FAIL');

    cg_rrmdir($dir);
});

test('main() renders SKIP rows and emits WARN rows for mixed changed files', function (): void {
    $dir = sys_get_temp_dir() . '/cg_main_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/env.php', '<?php');
    file_put_contents($dir . '/backend/other.php', "<?php\necho 'x';\n");

    $clover = $dir . '/report.xml';
    // env.php is in <source> (100%); other.php is out-of-source; gone.php is deleted.
    file_put_contents(
        $clover,
        '<?xml version="1.0"?><coverage><project>'
        . '<file name="' . $dir . '/backend/env.php">'
        . '<line num="1" type="stmt" count="1"/>'
        . '</file></project></coverage>'
    );

    $stdinFile = $dir . '/stdin.txt';
    file_put_contents($stdinFile, "backend/env.php\nbackend/other.php\nbackend/gone.php\n");

    ob_start();
    $code = main(3, ['script', $clover, '--root=' . $dir], $stdinFile);
    $out = ob_get_clean();

    expect($code)->toBe(0);
    // PASS row (in source) and SKIP row (deleted) render to stdout; the WARN
    // row writes to STDERR, so it executes (covering that branch) but is not
    // visible in $out — its text is verified by the shell suite (test 3).
    expect($out)->toContain('backend/env.php');
    expect($out)->toContain('SKIP');
    expect($out)->toContain('backend/gone.php');

    cg_rrmdir($dir);
});

test('parse_args reads --root with space-separated value', function (): void {
    expect(parse_args(['s', 'c.xml', '--root', '/custom/path'])['root'])->toBe('/custom/path');
});

test('classify: empty string in changed files is silently skipped', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');
    $r = classify_changed_files(['', 'backend/a.php'], ['backend/a.php' => [10, 10]], $dir . '/', 80);
    // backend/a.php passes; the empty entry is skipped via `continue` without
    // landing in any bucket (not even skipped[]).
    expect($r['passed'])->toHaveCount(1)
        ->and($r['skipped'])->toBeEmpty();
    cg_rrmdir($dir);
});

test('classify: file with zero executable lines is skipped', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');
    $r = classify_changed_files(['backend/a.php'], ['backend/a.php' => [0, 0]], $dir . '/', 80);
    expect($r['skipped'][0][1])->toBe('no executable lines');
    cg_rrmdir($dir);
});

test('classify: file below threshold fails', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/a.php', '<?php');
    // 1 of 10 lines covered → 10.0%, below the 80% gate.
    $r = classify_changed_files(['backend/a.php'], ['backend/a.php' => [1, 10]], $dir . '/', 80);
    expect($r['failed'])->toHaveCount(1)
        ->and($r['failed'][0][1])->toBe(10.0);
    cg_rrmdir($dir);
});

test('classify: out-of-source file with no executable code is skipped', function (): void {
    $dir = sys_get_temp_dir() . '/cg_cls_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/consts.php', "<?php\nclass C { public const X = 1; }\n");
    $r = classify_changed_files(['backend/consts.php'], [], $dir . '/', 80);
    expect($r['skipped'])->toHaveCount(1)
        ->and($r['skipped'][0][1])->toContain('no executable code');
    cg_rrmdir($dir);
});






// vim: ft=php sts=4 sw=4 ts=4 et :
