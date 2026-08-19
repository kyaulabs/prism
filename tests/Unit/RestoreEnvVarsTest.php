<?php

declare(strict_types=1);

# $KYAULabs: RestoreEnvVarsTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

afterEach(function () {
    foreach (['TEST_RESTORE_KEY', 'TEST_RESTORE_A', 'TEST_RESTORE_B', 'TEST_RESTORE_C'] as $key) {
        unset($_ENV[$key]);
        putenv($key);
    }
});

test('restoreEnvVars restores getenv value modified by putenv', function () {
    putenv('TEST_RESTORE_KEY=original');

    $restore = restoreEnvVars('TEST_RESTORE_KEY');

    putenv('TEST_RESTORE_KEY=modified');
    expect(getenv('TEST_RESTORE_KEY'))->toBe('modified');

    $restore();
    expect(getenv('TEST_RESTORE_KEY'))->toBe('original');
});

test('restoreEnvVars restores $_ENV value', function () {
    $_ENV['TEST_RESTORE_KEY'] = 'original';

    $restore = restoreEnvVars('TEST_RESTORE_KEY');

    $_ENV['TEST_RESTORE_KEY'] = 'modified';
    expect($_ENV['TEST_RESTORE_KEY'])->toBe('modified');

    $restore();
    expect($_ENV['TEST_RESTORE_KEY'])->toBe('original');
});

test('restoreEnvVars unsets getenv key that was originally unset', function () {
    putenv('TEST_RESTORE_KEY');

    $restore = restoreEnvVars('TEST_RESTORE_KEY');

    putenv('TEST_RESTORE_KEY=leaked');
    expect(getenv('TEST_RESTORE_KEY'))->toBe('leaked');

    $restore();
    expect(getenv('TEST_RESTORE_KEY'))->toBeFalse();
});

test('restoreEnvVars unsets $_ENV key that was originally unset', function () {
    unset($_ENV['TEST_RESTORE_KEY']);

    $restore = restoreEnvVars('TEST_RESTORE_KEY');

    $_ENV['TEST_RESTORE_KEY'] = 'leaked';
    expect($_ENV['TEST_RESTORE_KEY'])->toBe('leaked');

    $restore();
    expect(array_key_exists('TEST_RESTORE_KEY', $_ENV))->toBeFalse();
});

test('restoreEnvVars handles multiple keys simultaneously', function () {
    putenv('TEST_RESTORE_A=orig_a');
    $_ENV['TEST_RESTORE_B'] = 'orig_b';

    $restore = restoreEnvVars('TEST_RESTORE_A', 'TEST_RESTORE_B', 'TEST_RESTORE_C');

    putenv('TEST_RESTORE_A=leaked');
    $_ENV['TEST_RESTORE_B'] = 'leaked';
    putenv('TEST_RESTORE_C=leaked');

    $restore();

    expect(getenv('TEST_RESTORE_A'))->toBe('orig_a');
    expect($_ENV['TEST_RESTORE_B'])->toBe('orig_b');
    expect(getenv('TEST_RESTORE_C'))->toBeFalse();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
