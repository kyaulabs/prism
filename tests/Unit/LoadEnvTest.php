<?php

declare(strict_types=1);

# $KYAULabs: LoadEnvTest.php kyau@aura.kyaulabs 2026/08/16 -0700 Exp $
















require_once __DIR__ . '/../../backend/env.php';

beforeEach(function () {
    $_ENV['APP_DEBUG'] = null;
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');
    putenv('TEST_KEY');
    putenv('QUOTED_KEY');
    putenv('EQUALS_KEY');
    putenv('EXPORT_KEY');
    putenv('COMMENT_KEY');
    putenv('VALID_KEY');
    putenv('LD_PRELOAD');
    unset($_ENV['EXPORT_KEY'], $_ENV['COMMENT_KEY'], $_ENV['VALID_KEY'], $_ENV['LD_PRELOAD']);
});

afterEach(restoreEnvVars(
    'APP_DEBUG',
    'TEST_KEY',
    'QUOTED_KEY',
    'EQUALS_KEY',
    'EXPORT_KEY',
    'COMMENT_KEY',
    'VALID_KEY',
    'LD_PRELOAD',
));

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


test('load_env strips a leading `export ` shell prefix', function () {
    $path = sys_get_temp_dir() . '/test_env_export.env';
    file_put_contents($path, "export EXPORT_KEY=42\n");

    load_env($path);

    expect($_ENV)->toHaveKey('EXPORT_KEY');
    expect($_ENV['EXPORT_KEY'])->toBe('42');
    expect($_ENV)->not->toHaveKey('export EXPORT_KEY');

    unlink($path);
});

test('load_env strips a leading UTF-8 BOM from the first line', function () {
    $path = sys_get_temp_dir() . '/test_env_bom.env';
    file_put_contents($path, "\xEF\xBB\xBFAPP_DEBUG=true\n");

    load_env($path);

    expect($_ENV)->toHaveKey('APP_DEBUG');
    expect($_ENV['APP_DEBUG'])->toBe('true');

    unlink($path);
});

test('load_env strips an inline `#` comment from an unquoted value', function () {
    $path = sys_get_temp_dir() . '/test_env_inline_comment.env';
    file_put_contents($path, "COMMENT_KEY=hello # a note\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('hello');

    unlink($path);
});

test('load_env preserves a `#` inside a quoted value', function () {
    $path = sys_get_temp_dir() . '/test_env_hash_in_quotes.env';
    file_put_contents($path, 'COMMENT_KEY="a # b"' . "\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('a # b');

    unlink($path);
});

test('load_env drops a trailing comment after a closing quote', function () {
    $path = sys_get_temp_dir() . '/test_env_trailing_comment.env';
    file_put_contents($path, 'COMMENT_KEY="value" # trailing' . "\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('value');

    unlink($path);
});

test('load_env skips lines with invalid key names', function () {
    $path = sys_get_temp_dir() . '/test_env_invalid_key.env';
    file_put_contents($path, "BAD KEY=1\n1LEADING_DIGIT=2\nVALID_KEY=3\n");

    load_env($path);

    expect($_ENV)->not->toHaveKey('BAD KEY');
    expect($_ENV)->not->toHaveKey('1LEADING_DIGIT');
    expect($_ENV['VALID_KEY'])->toBe('3');

    unlink($path);
});

test('is_dangerous_env_name flags known injection vectors', function () {
    expect(is_dangerous_env_name('LD_PRELOAD'))->toBeTrue();
    expect(is_dangerous_env_name('BASH_ENV'))->toBeTrue();
    expect(is_dangerous_env_name('DYLD_INSERT_LIBRARIES'))->toBeTrue();
    expect(is_dangerous_env_name('ENV'))->toBeTrue();
    expect(is_dangerous_env_name('APP_DEBUG'))->toBeFalse();
    expect(is_dangerous_env_name('DB_HOST'))->toBeFalse();
});

test('load_env refuses to load dangerous env names from a file', function () {
    $path = sys_get_temp_dir() . '/test_env_dangerous.env';
    file_put_contents($path, "LD_PRELOAD=/evil/preload.so\nBASH_ENV=/evil.sh\nAPP_DEBUG=true\n");

    load_env($path);

    expect($_ENV)->not->toHaveKey('LD_PRELOAD');
    expect(getenv('LD_PRELOAD'))->toBeFalse();
    expect($_ENV)->not->toHaveKey('BASH_ENV');
    expect(getenv('BASH_ENV'))->toBeFalse();
    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});



test('load_env returns raw value when a quoted value has no closing quote', function () {
    $path = sys_get_temp_dir() . '/test_env_unterminated_quote.env';
    file_put_contents($path, "COMMENT_KEY=\"no closing quote\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('no closing quote');

    unlink($path);
});

test('load_env treats a value starting with # as an empty value', function () {
    $path = sys_get_temp_dir() . '/test_env_hash_value.env';
    file_put_contents($path, "COMMENT_KEY=#this is a comment\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('');

    unlink($path);
});

test('load_env strips a tab-separated inline # comment from an unquoted value', function () {
    $path = sys_get_temp_dir() . '/test_env_tab_comment.env';
    file_put_contents($path, "COMMENT_KEY=hello\t# note\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('hello');

    unlink($path);
});

test('load_env logs an unreadable env file and keeps defaults', function () {
    $path = sys_get_temp_dir() . '/unreadable_' . uniqid() . '.env';
    file_put_contents($path, "APP_DEBUG=true\n");
    chmod($path, 0000);

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    $warnings = [];
    set_error_handler(static function (int $no, string $msg) use (&$warnings): bool {
        $warnings[] = $msg;

        return true;
    });

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect((string) file_get_contents($logPath))->toContain('is not readable');
        expect((string) file_get_contents($logPath))->toContain($path);
        expect($warnings)->toBe([]);
    } finally {
        restore_error_handler();
        ini_set('error_log', $prevLog);
        @chmod($path, 0644);
        @unlink($path);
        if (is_file($logPath)) {
            unlink($logPath);
        }
    }
})->skip(function_exists('posix_geteuid') && posix_geteuid() === 0, 'permission assertions are unreliable when running as root');

test('load_env absent env file stays silent (no log, defaults kept)', function () {
    $path = sys_get_temp_dir() . '/nonexistent_' . uniqid() . '.env';

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        load_env($path);

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
