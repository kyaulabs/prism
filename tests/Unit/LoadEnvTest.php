<?php

declare(strict_types=1);

# $KYAULabs: LoadEnvTest.php kyau@nova 2026/07/13 -0700 Exp $




require_once __DIR__ . '/../../backend/env.php';

beforeEach(function () {
    $_ENV['APP_DEBUG'] = null;
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');
    putenv('TEST_KEY');
    putenv('QUOTED_KEY');
    putenv('EQUALS_KEY');
});

afterEach(restoreEnvVars('APP_DEBUG', 'TEST_KEY', 'QUOTED_KEY', 'EQUALS_KEY'));

test('load_env parses .env with APP_DEBUG=true and env_bool returns true', function () {
    $path = sys_get_temp_dir() . '/test_env_true.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});

test('load_env parses .env with APP_DEBUG=false and env_bool returns false', function () {
    $path = sys_get_temp_dir() . '/test_env_false.env';
    file_put_contents($path, "APP_DEBUG=false\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeFalse();

    unlink($path);
});

test('load_env with file absent does not change env_bool default', function () {
    $path = sys_get_temp_dir() . '/nonexistent.env';

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeFalse();
});

test('load_env does not overwrite pre-set $_ENV key', function () {
    $_ENV['TEST_KEY'] = 'server_value';

    $path = sys_get_temp_dir() . '/test_env_precedence.env';
    file_put_contents($path, "TEST_KEY=file_value\n");

    load_env($path);

    expect($_ENV['TEST_KEY'])->toBe('server_value');

    unlink($path);
});

test('load_env does not overwrite pre-set getenv key when $_ENV is not set', function () {
    unset($_ENV['TEST_KEY']);
    putenv('TEST_KEY=server_value');

    $path = sys_get_temp_dir() . '/test_env_getenv_precedence.env';
    file_put_contents($path, "TEST_KEY=file_value\n");

    load_env($path);

    expect(getenv('TEST_KEY'))->toBe('server_value');

    unlink($path);
});

test('load_env skips hash comment lines', function () {
    $path = sys_get_temp_dir() . '/test_env_hash_comment.env';
    file_put_contents($path, "# this is a comment\nAPP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});

test('load_env skips semicolon comment lines', function () {
    $path = sys_get_temp_dir() . '/test_env_semicolon_comment.env';
    file_put_contents($path, "; this is a comment\nAPP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});

test('load_env skips blank lines', function () {
    $path = sys_get_temp_dir() . '/test_env_blank_lines.env';
    file_put_contents($path, "\n\nAPP_DEBUG=true\n\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});

test('load_env strips surrounding double quotes from value', function () {
    $path = sys_get_temp_dir() . '/test_env_quoted.env';
    file_put_contents($path, 'QUOTED_KEY="value with spaces"' . "\n");

    load_env($path);

    expect($_ENV['QUOTED_KEY'])->toBe('value with spaces');

    unlink($path);
});

test('load_env strips surrounding single quotes from value', function () {
    $path = sys_get_temp_dir() . '/test_env_single_quoted.env';
    file_put_contents($path, "QUOTED_KEY='single quoted'" . "\n");

    load_env($path);

    expect($_ENV['QUOTED_KEY'])->toBe('single quoted');

    unlink($path);
});

test('load_env splits only on first = in line', function () {
    $path = sys_get_temp_dir() . '/test_env_equals_split.env';
    file_put_contents($path, "EQUALS_KEY=value=with=equals\n");

    load_env($path);

    expect($_ENV['EQUALS_KEY'])->toBe('value=with=equals');

    unlink($path);
});

test('load_env sets both $_ENV and getenv for each key', function () {
    $path = sys_get_temp_dir() . '/test_env_dual_population.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    expect($_ENV['APP_DEBUG'])->toBe('true');
    expect(getenv('APP_DEBUG'))->toBe('true');

    unlink($path);
});


// vim: ft=php sts=4 sw=4 ts=4 et :
