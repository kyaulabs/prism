<?php

declare(strict_types=1);

# $KYAULabs: EnvBoolTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

require_once __DIR__ . '/../../backend/env.php';

afterEach(restoreEnvVars('APP_DEBUG', 'UNSET_KEY'));

test('env_bool returns false when value is the string "false"', function () {
    $_ENV['APP_DEBUG'] = 'false';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

test('env_bool returns false when value is the string "0"', function () {
    $_ENV['APP_DEBUG'] = '0';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

test('env_bool returns false when value is the string "off"', function () {
    $_ENV['APP_DEBUG'] = 'off';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

test('env_bool returns false when value is an empty string', function () {
    putenv('APP_DEBUG');
    $_ENV['APP_DEBUG'] = '';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

test('env_bool returns false when key is not set in $_ENV', function () {
    unset($_ENV['APP_DEBUG']);

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

test('env_bool returns true when value is the string "1"', function () {
    $_ENV['APP_DEBUG'] = '1';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});

test('env_bool returns true when value is the string "true"', function () {
    $_ENV['APP_DEBUG'] = 'true';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});

test('env_bool returns true when value is the string "on"', function () {
    $_ENV['APP_DEBUG'] = 'on';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});

test('env_bool returns true when value is the string "yes"', function () {
    $_ENV['APP_DEBUG'] = 'yes';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});

test('env_bool returns default true when key is unset and default is true', function () {
    unset($_ENV['UNSET_KEY']);

    $result = env_bool('UNSET_KEY', true);

    expect($result)->toBeTrue();
});

test('env_bool respects getenv() fallback when $_ENV is not set but getenv() returns "false"', function () {
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG=false');

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

test('env_bool prefers $_ENV over getenv() when both are set with conflicting values', function () {
    $_ENV['APP_DEBUG'] = 'true';
    putenv('APP_DEBUG=false');

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});

test('env_bool returns false for unrecognized string value', function () {
    unset($_ENV['UNSET_KEY']);

    $result = env_bool('UNSET_KEY');

    expect($result)->toBeFalse();
});

test('env_bool falls back to getenv() when the $_ENV value is an empty string', function () {
    $_ENV['APP_DEBUG'] = '';
    putenv('APP_DEBUG=true');

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});

test('env_bool logs an unparseable value with key, value, and default', function () {
    $_ENV['APP_DEBUG'] = 'ture';

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        $result = env_bool('APP_DEBUG');

        expect($result)->toBeFalse();
        expect(is_file($logPath) ? (string) file_get_contents($logPath) : '')->toContain('env_bool');
        expect(is_file($logPath) ? (string) file_get_contents($logPath) : '')->toContain('"ture"');
        expect(is_file($logPath) ? (string) file_get_contents($logPath) : '')->toContain('APP_DEBUG');
        expect(is_file($logPath) ? (string) file_get_contents($logPath) : '')->toContain('using default false');
    } finally {
        ini_set('error_log', $prevLog);
        if (is_file($logPath)) {
            unlink($logPath);
        }
    }
});

test('env_bool unset key stays silent (no log)', function () {
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect(is_file($logPath) ? (string) file_get_contents($logPath) : '')->toBe('');
    } finally {
        ini_set('error_log', $prevLog);
        if (is_file($logPath)) {
            unlink($logPath);
        }
    }
});

test('env_bool empty-string value stays silent (treated as unset)', function () {
    $_ENV['APP_DEBUG'] = '';
    putenv('APP_DEBUG');

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect(is_file($logPath) ? (string) file_get_contents($logPath) : '')->toBe('');
    } finally {
        ini_set('error_log', $prevLog);
        if (is_file($logPath)) {
            unlink($logPath);
        }
    }
});

// vim: ft=php sts=4 sw=4 ts=4 et :
