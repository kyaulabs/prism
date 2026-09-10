<?php

declare(strict_types=1);

# $KYAULabs: FixtureRepository.php kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

namespace Tests\Semgrep;

/**
 * Owns the disposable committed input used by the Semgrep rule suite.
 */
final class FixtureRepository
{
    /**
     * Copy known rule inputs, scan them through Prism, and remove the fixture.
     *
     * @param string $sourceRoot Original rule-suite root.
     * @param list<string> $paths Known rule and positive/negative fixture paths.
     * @return array{stdout: string, stderr: string, exitCode: int} Scanner outcome.
     * @throws \RuntimeException When inputs, execution, or cleanup cannot be verified.
     */
    public static function scan(string $sourceRoot, array $paths): array
    {
        $source = realpath($sourceRoot);
        $temporary = realpath(sys_get_temp_dir());

        if ($source === false || $temporary === false || $temporary === $source
            || str_starts_with($temporary, $source . DIRECTORY_SEPARATOR)) {
            throw new \RuntimeException('Semgrep fixture storage is unsafe');
        }

        $root = $temporary . '/prism-rule-fixture-' . bin2hex(random_bytes(16));

        if (!mkdir($root, 0700)) {
            throw new \RuntimeException('Semgrep fixture creation failed');
        }

        $identity = lstat($root);

        try {
            if ($identity === false || !chmod($root, 0700)) {
                throw new \RuntimeException('Semgrep fixture identity is unavailable');
            }

            foreach (['work', 'home', 'tmp', 'template'] as $directory) {
                if (!mkdir($root . '/' . $directory, 0700)) {
                    throw new \RuntimeException('Semgrep fixture directory creation failed');
                }
            }

            foreach ($paths as $relative) {
                if (!is_string($relative) || !preg_match('~^(?:\.semgrep/kyaulabs\.yml|tests/Semgrep/[A-Za-z]+/(?:positive|negative)\.php)$~D', $relative)) {
                    throw new \RuntimeException('Semgrep fixture input is unsupported');
                }

                $file = $source . '/' . $relative;
                clearstatcache(true, $file);
                $before = lstat($file);

                if ($before === false || !is_file($file) || is_link($file) || realpath($file) !== $file
                    || $before['uid'] !== $identity['uid']
                    || ($before['mode'] & 0400) !== 0400 || ($before['mode'] & 07777 & ~0644) !== 0
                    || $before['size'] > 1048576) {
                    throw new \RuntimeException('Semgrep fixture input is unsafe');
                }

                $handle = fopen($file, 'rb');

                if ($handle === false) {
                    throw new \RuntimeException('Semgrep fixture input is unreadable');
                }

                try {
                    $held = fstat($handle);

                    foreach (['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtime', 'ctime'] as $field) {
                        if ($held === false || $before[$field] !== $held[$field]) {
                            throw new \RuntimeException('Semgrep fixture input changed');
                        }
                    }

                    $bytes = stream_get_contents($handle, 1048577);
                    clearstatcache(true, $file);
                    $after = lstat($file);
                    $held = fstat($handle);

                    if ($bytes === false || strlen($bytes) !== $before['size'] || $after === false
                        || $held === false || is_link($file) || realpath($file) !== $file) {
                        throw new \RuntimeException('Semgrep fixture input changed');
                    }

                    foreach (['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtime', 'ctime'] as $field) {
                        if ($before[$field] !== $after[$field] || $before[$field] !== $held[$field]) {
                            throw new \RuntimeException('Semgrep fixture input changed');
                        }
                    }
                } finally {
                    fclose($handle);
                }

                $destination = $root . '/work/' . $relative;

                if (!is_dir(dirname($destination)) && !mkdir(dirname($destination), 0700, true)) {
                    throw new \RuntimeException('Semgrep fixture input directory failed');
                }

                if (file_put_contents($destination, $bytes) !== strlen($bytes) || !chmod($destination, 0600)) {
                    throw new \RuntimeException('Semgrep fixture input copy failed');
                }
            }

            $env = [
                'PATH' => getenv('PATH') ?: '',
                'HOME' => $root . '/home',
                'TMPDIR' => $root . '/tmp',
                'LC_ALL' => 'C',
                'GIT_CONFIG_GLOBAL' => '/dev/null',
                'GIT_CONFIG_NOSYSTEM' => '1',
                'GIT_TERMINAL_PROMPT' => '0',
                'GIT_OPTIONAL_LOCKS' => '0',
            ];

            foreach ([
                ['git', 'init', '--quiet', '--template=' . $root . '/template'],
                ['git', 'add', '--', ...$paths],
                ['git', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
                    '-c', 'user.name=Semgrep Fixture', '-c', 'user.email=fixture@example.test',
                    'commit', '--quiet', '-m', 'committed rule fixtures'],
            ] as $command) {
                if (self::execute($command, $root, $env, 30)['exitCode'] !== 0) {
                    throw new \RuntimeException('Semgrep fixture Git preparation failed');
                }
            }

            return self::execute(['semgrep', 'scan', '--config', '.semgrep/kyaulabs.yml',
                '--json', '--metrics', 'off', '--disable-version-check', '--x-ignore-semgrepignore-files',
                'tests/Semgrep/'], $root, $env, 660);
        } finally {
            clearstatcache(true, $root);
            $current = lstat($root);

            if ($identity === false || $current === false || is_link($root) || $current['dev'] !== $identity['dev']
                || $current['ino'] !== $identity['ino'] || $current['uid'] !== $identity['uid']) {
                throw new \RuntimeException('Semgrep fixture cleanup identity changed');
            }

            self::remove($root);
        }
    }

    /**
     * Execute a bounded fixture command without a shell or inherited baseline.
     *
     * @param list<string> $command Argument array.
     * @param string $root Owned fixture directory.
     * @param array<string, string> $env Explicit child environment.
     * @param int $seconds Execution limit.
     * @return array{stdout: string, stderr: string, exitCode: int} Process outcome.
     * @throws \RuntimeException When process evidence is unavailable or exceeds bounds.
     */
    private static function execute(array $command, string $root, array $env, int $seconds): array
    {
        $stdout = fopen($root . '/stdout', 'w+b');
        $stderr = fopen($root . '/stderr', 'w+b');

        if ($stdout === false || $stderr === false || !chmod($root . '/stdout', 0600) || !chmod($root . '/stderr', 0600)) {
            throw new \RuntimeException('Semgrep fixture output creation failed');
        }

        $process = proc_open($command, [['file', '/dev/null', 'r'], $stdout, $stderr], $pipes, $root . '/work', $env);

        if (!is_resource($process)) {
            fclose($stdout);
            fclose($stderr);
            throw new \RuntimeException('Semgrep fixture process unavailable');
        }

        $started = hrtime(true);

        try {
            do {
                $state = proc_get_status($process);

                if (fstat($stdout)['size'] > 1048576 || fstat($stderr)['size'] > 1048576
                    || hrtime(true) - $started > $seconds * 1000000000) {
                    throw new \RuntimeException('Semgrep fixture process exceeds limit');
                }

                if ($state['running']) {
                    usleep(10000);
                }
            } while ($state['running']);

            rewind($stdout);
            rewind($stderr);

            return ['stdout' => stream_get_contents($stdout), 'stderr' => stream_get_contents($stderr),
                'exitCode' => $state['exitcode']];
        } finally {
            if (proc_get_status($process)['running']) {
                proc_terminate($process);
                $until = hrtime(true) + 5000000000;

                while (proc_get_status($process)['running'] && hrtime(true) < $until) {
                    usleep(10000);
                }

                if (proc_get_status($process)['running']) {
                    proc_terminate($process, 9);
                }
            }

            proc_close($process);
            fclose($stdout);
            fclose($stderr);
        }
    }

    /**
     * Remove only an owned fixture subtree, never following links.
     *
     * @param string $path Owned path.
     * @return void
     * @throws \RuntimeException When cleanup fails.
     */
    private static function remove(string $path): void
    {
        if (is_link($path) || !is_dir($path)) {
            if (!unlink($path)) {
                throw new \RuntimeException('Semgrep fixture file cleanup failed');
            }

            return;
        }

        $names = scandir($path);

        if ($names === false) {
            throw new \RuntimeException('Semgrep fixture directory cleanup failed');
        }

        foreach ($names as $name) {
            if ($name !== '.' && $name !== '..') {
                self::remove($path . '/' . $name);
            }
        }

        if (!rmdir($path)) {
            throw new \RuntimeException('Semgrep fixture directory cleanup failed');
        }
    }
}

// vim: ft=php sts=4 sw=4 ts=4 et :
