<?php

declare(strict_types=1);

# $KYAULabs: AuroraConstructorDisplayErrorsTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

beforeEach(function () {
    if (!is_file(dirname(__DIR__, 2) . '/aurora/aurora.inc.php')) {
        $this->markTestSkipped('aurora submodule not initialized — run: git submodule update --init');
    }
});

/**
 * Execute assertions against a temporary PHP script and remove it afterward.
 *
 * @param  string $prefix  Prefix used by tempnam().
 * @param  string $source  PHP source written to the temporary script.
 * @param  Closure(string): void $assertions  Assertions that consume the path.
 * @return void
 * @throws RuntimeException  If the script cannot be created or written.
 */
function withAuroraDisplayErrorsScript(string $prefix, string $source, Closure $assertions): void
{
    $script = tempnam(sys_get_temp_dir(), $prefix);
    if ($script === false) {
        throw new RuntimeException('Unable to create temporary Aurora display_errors script');
    }

    try {
        if (file_put_contents($script, $source) === false) {
            throw new RuntimeException('Unable to write temporary Aurora display_errors script');
        }

        $assertions($script);
    } finally {
        if (is_file($script)) {
            unlink($script);
        }
    }
}

test('display_errors remains off when Aurora throws with status=false', function () {
    $auroraPath = dirname(__DIR__, 2) . '/aurora/aurora.inc.php';

    $source = <<<PHP
<?php
declare(strict_types=1);
require_once '{$auroraPath}';
ob_start();
try {
    new KYAULabs\\Aurora(template: 'nonexistent.html', cdn: '/cdn', status: false);
} catch (KYAULabs\\AuroraException \$e) {
    ob_end_clean();
    echo ini_get('display_errors');
}
PHP;

    withAuroraDisplayErrorsScript('aurora_de_false_', $source, function (string $script) {
        $output = [];
        $exitCode = 0;
        exec('php ' . escapeshellarg($script) . ' 2>&1', $output, $exitCode);

        $stdout = implode("\n", $output);
        expect($stdout)->toBe('0');
        expect($exitCode)->toBe(0);
    });
});

test('display_errors is enabled when Aurora throws with status=true', function () {
    $auroraPath = dirname(__DIR__, 2) . '/aurora/aurora.inc.php';

    $source = <<<PHP
<?php
declare(strict_types=1);
require_once '{$auroraPath}';
ob_start();
try {
    new KYAULabs\\Aurora(template: 'nonexistent.html', cdn: '/cdn', status: true);
} catch (KYAULabs\\AuroraException \$e) {
    ob_end_clean();
    echo ini_get('display_errors');
}
PHP;

    withAuroraDisplayErrorsScript('aurora_de_true_', $source, function (string $script) {
        $output = [];
        $exitCode = 0;
        exec('php ' . escapeshellarg($script) . ' 2>&1', $output, $exitCode);

        $stdout = implode("\n", $output);
        expect($stdout)->toBe('1');
        expect($exitCode)->toBe(0);
    });
});

test('temporary display_errors scripts are removed after assertion failures', function () {
    $script = null;

    try {
        withAuroraDisplayErrorsScript(
            'aurora_de_failure_',
            '<?php declare(strict_types=1);',
            function (string $path) use (&$script): void {
                $script = $path;
                expect('actual')->toBe('expected');
            },
        );
    } catch (PHPUnit\Framework\ExpectationFailedException) {
    }

    expect($script)->not->toBeNull();
    assert(is_string($script));
    expect(is_file($script))->toBeFalse();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
