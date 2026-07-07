<?php

# $KYAULabs: AuroraConstructorDisplayErrorsTest.php kyau@nova 2026/07/07 -0700 Exp $

declare(strict_types=1);

test('display_errors remains off when Aurora throws with status=false', function () {
    $auroraPath = dirname(__DIR__, 2) . '/aurora/aurora.inc.php';
    $script = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'aurora_de_false_' . uniqid() . '.php';

    file_put_contents($script, <<<PHP
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
PHP);

    $output = [];
    $exitCode = 0;
    exec("php {$script} 2>&1", $output, $exitCode);

    $stdout = implode("\n", $output);
    expect($stdout)->toBe('0');
    expect($exitCode)->toBe(0);

    unlink($script);
});

test('display_errors is enabled when Aurora throws with status=true', function () {
    $auroraPath = dirname(__DIR__, 2) . '/aurora/aurora.inc.php';
    $script = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'aurora_de_true_' . uniqid() . '.php';

    file_put_contents($script, <<<PHP
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
PHP);

    $output = [];
    $exitCode = 0;
    exec("php {$script} 2>&1", $output, $exitCode);

    $stdout = implode("\n", $output);
    expect($stdout)->toBe('1');
    expect($exitCode)->toBe(0);

    unlink($script);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
