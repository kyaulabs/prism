<?php

declare(strict_types=1);

# $KYAULabs: LoadEnvTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $































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
    putenv('APP_KEY');
    putenv('CSRF_KEY');
    putenv('DB_PASSWORD');
    putenv('DB_USER');
    putenv('A');
    putenv('FOO');
    unset($_ENV['EXPORT_KEY'], $_ENV['COMMENT_KEY'], $_ENV['VALID_KEY'], $_ENV['LD_PRELOAD']);
    unset($_ENV['APP_KEY'], $_ENV['CSRF_KEY'], $_ENV['DB_PASSWORD'], $_ENV['DB_USER'], $_ENV['A'], $_ENV['FOO']);
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
    'APP_KEY',
    'CSRF_KEY',
    'DB_PASSWORD',
    'DB_USER',
    'A',
    'FOO',
));

/**
 * Write $contents to a unique temp file for load_env() fixtures.
 *
 * tempnam() guarantees a fresh path per call, so parallel Pest workers and
 * concurrent checkouts never collide. The caller must unlink() the returned
 * path (tests wrap their body in try/finally).
 *
 * @param  string $contents  .env file contents.
 * @return string            Path to the created temp file.
 */
function env_fixture(string $contents): string
{
    $path = tempnam(sys_get_temp_dir(), 'prism_env_');
    file_put_contents($path, $contents);

    return $path;
}

test('load_env parses .env with APP_DEBUG=true and env_bool returns true', function () {
    $path = env_fixture("APP_DEBUG=true\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeTrue();
    } finally {
        unlink($path);
    }
});

test('load_env parses .env with APP_DEBUG=false and env_bool returns false', function () {
    $path = env_fixture("APP_DEBUG=false\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeFalse();
    } finally {
        unlink($path);
    }
});

test('load_env with file absent does not change env_bool default', function () {
    $path = sys_get_temp_dir() . '/nonexistent.env';

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeFalse();
});

test('load_env does not overwrite pre-set $_ENV key', function () {
    $_ENV['TEST_KEY'] = 'server_value';

    $path = env_fixture("TEST_KEY=file_value\n");

    try {
        load_env($path);

        expect($_ENV['TEST_KEY'])->toBe('server_value');
    } finally {
        unlink($path);
    }
});

test('load_env does not overwrite pre-set getenv key when $_ENV is not set', function () {
    unset($_ENV['TEST_KEY']);
    putenv('TEST_KEY=server_value');

    $path = env_fixture("TEST_KEY=file_value\n");

    try {
        load_env($path);

        expect(getenv('TEST_KEY'))->toBe('server_value');
    } finally {
        unlink($path);
    }
});

test('load_env skips hash comment lines', function () {
    $path = env_fixture("# this is a comment\nAPP_DEBUG=true\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeTrue();
    } finally {
        unlink($path);
    }
});

test('load_env skips semicolon comment lines', function () {
    $path = env_fixture("; this is a comment\nAPP_DEBUG=true\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeTrue();
    } finally {
        unlink($path);
    }
});

test('load_env skips blank lines', function () {
    $path = env_fixture("\n\nAPP_DEBUG=true\n\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeTrue();
    } finally {
        unlink($path);
    }
});

test('load_env strips surrounding double quotes from value', function () {
    $path = env_fixture('QUOTED_KEY="value with spaces"' . "\n");

    try {
        load_env($path);

        expect($_ENV['QUOTED_KEY'])->toBe('value with spaces');
    } finally {
        unlink($path);
    }
});

test('load_env strips surrounding single quotes from value', function () {
    $path = env_fixture("QUOTED_KEY='single quoted'" . "\n");

    try {
        load_env($path);

        expect($_ENV['QUOTED_KEY'])->toBe('single quoted');
    } finally {
        unlink($path);
    }
});

test('load_env splits only on first = in line', function () {
    $path = env_fixture("EQUALS_KEY=value=with=equals\n");

    try {
        load_env($path);

        expect($_ENV['EQUALS_KEY'])->toBe('value=with=equals');
    } finally {
        unlink($path);
    }
});

test('load_env sets both $_ENV and getenv for each key', function () {
    $path = env_fixture("APP_DEBUG=true\n");

    try {
        load_env($path);

        expect($_ENV['APP_DEBUG'])->toBe('true');
        expect(getenv('APP_DEBUG'))->toBe('true');
    } finally {
        unlink($path);
    }
});


test('load_env strips a leading `export ` shell prefix', function () {
    $path = env_fixture("export EXPORT_KEY=42\n");

    try {
        load_env($path);

        expect($_ENV)->toHaveKey('EXPORT_KEY');
        expect($_ENV['EXPORT_KEY'])->toBe('42');
        expect($_ENV)->not->toHaveKey('export EXPORT_KEY');
    } finally {
        unlink($path);
    }
});

test('load_env strips a leading UTF-8 BOM from the first line', function () {
    $path = env_fixture("\xEF\xBB\xBFAPP_DEBUG=true\n");

    try {
        load_env($path);

        expect($_ENV)->toHaveKey('APP_DEBUG');
        expect($_ENV['APP_DEBUG'])->toBe('true');
    } finally {
        unlink($path);
    }
});

test('load_env strips an inline `#` comment from an unquoted value', function () {
    $path = env_fixture("COMMENT_KEY=hello # a note\n");

    try {
        load_env($path);

        expect($_ENV['COMMENT_KEY'])->toBe('hello');
    } finally {
        unlink($path);
    }
});

test('load_env preserves a `#` inside a quoted value', function () {
    $path = env_fixture('COMMENT_KEY="a # b"' . "\n");

    try {
        load_env($path);

        expect($_ENV['COMMENT_KEY'])->toBe('a # b');
    } finally {
        unlink($path);
    }
});

test('load_env drops a trailing comment after a closing quote', function () {
    $path = env_fixture('COMMENT_KEY="value" # trailing' . "\n");

    try {
        load_env($path);

        expect($_ENV['COMMENT_KEY'])->toBe('value');
    } finally {
        unlink($path);
    }
});

test('load_env skips lines with invalid key names', function () {
    $path = env_fixture("BAD KEY=1\n1LEADING_DIGIT=2\nVALID_KEY=3\n");

    try {
        load_env($path);

        expect($_ENV)->not->toHaveKey('BAD KEY');
        expect($_ENV)->not->toHaveKey('1LEADING_DIGIT');
        expect($_ENV['VALID_KEY'])->toBe('3');
    } finally {
        unlink($path);
    }
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
    $path = env_fixture("LD_PRELOAD=/evil/preload.so\nBASH_ENV=/evil.sh\nAPP_DEBUG=true\n");

    try {
        load_env($path);

        expect($_ENV)->not->toHaveKey('LD_PRELOAD');
        expect(getenv('LD_PRELOAD'))->toBeFalse();
        expect($_ENV)->not->toHaveKey('BASH_ENV');
        expect(getenv('BASH_ENV'))->toBeFalse();
        expect(env_bool('APP_DEBUG'))->toBeTrue();
    } finally {
        unlink($path);
    }
});



test('load_env returns raw value when a quoted value has no closing quote', function () {
    $path = env_fixture("COMMENT_KEY=\"no closing quote\n");

    try {
        load_env($path);

        expect($_ENV['COMMENT_KEY'])->toBe('no closing quote');
    } finally {
        unlink($path);
    }
});

test('load_env treats a value starting with # as an empty value', function () {
    $path = env_fixture("COMMENT_KEY=#this is a comment\n");

    try {
        load_env($path);

        expect($_ENV['COMMENT_KEY'])->toBe('');
    } finally {
        unlink($path);
    }
});

test('load_env strips a tab-separated inline # comment from an unquoted value', function () {
    $path = env_fixture("COMMENT_KEY=hello\t# note\n");

    try {
        load_env($path);

        expect($_ENV['COMMENT_KEY'])->toBe('hello');
    } finally {
        unlink($path);
    }
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

test('load_env keeps SECRET_KEYS out of getenv but present in $_ENV', function () {
    $path = env_fixture("APP_KEY=deadbeefcafe\n");

    try {
        load_env($path);

        expect($_ENV['APP_KEY'])->toBe('deadbeefcafe');
        expect(getenv('APP_KEY'))->toBeFalse();
    } finally {
        unlink($path);
    }
});

test('load_env non-secret keys still dual-populate $_ENV and getenv', function () {
    $path = env_fixture("DB_USER=app\n");

    try {
        load_env($path);

        expect($_ENV['DB_USER'])->toBe('app');
        expect(getenv('DB_USER'))->toBe('app');
    } finally {
        unlink($path);
    }
});
test('load_env no-ops on a .env larger than 1 MiB', function () {
    // 3000 lines x ~400 bytes — over the 1 MiB size cap but under the
    // 10000-line cap, so only the size cap can trip (OCR round 4).
    $path = env_fixture(str_repeat("A=" . str_repeat("0", 396) . "\n", 3000));

    try {
        load_env($path);

        expect($_ENV)->not->toHaveKey('A');
        expect(getenv('A'))->toBeFalse();
    } finally {
        unlink($path);
    }
});

test('load_env no-ops on a .env with more than 10000 lines', function () {
    $path = env_fixture(str_repeat("FOO=bar\n", 20000));

    try {
        load_env($path);

        expect($_ENV)->not->toHaveKey('FOO');
        expect(getenv('FOO'))->toBeFalse();
    } finally {
        unlink($path);
    }
});








// vim: ft=php sts=4 sw=4 ts=4 et :
