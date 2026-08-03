<?php

declare(strict_types=1);

# $KYAULabs: PrismManifestCliTest.php kyau@cosmos.kyaulabs 2026/08/02 -0700 Exp $





















use KYAULabs\Prism\PrismJsoncDocument;
use KYAULabs\Prism\PrismJsoncException;

use function KYAULabs\Prism\dispatch;
use function KYAULabs\Prism\main;
use function KYAULabs\Prism\pm_env_pairs;

use const KYAULabs\Prism\PRISM_ENV_MAP;
use const KYAULabs\Prism\PRISM_LIST_ENV_MAP;
use const KYAULabs\Prism\PRISM_TOGGLE_ENV_MAP;

const PM_CLI_SCRIPT = __DIR__ . '/../../..' . '/.github/scripts/prism_manifest.php';

define('PRISM_MANIFEST_AS_LIBRARY', true);
require_once dirname(__DIR__, 3) . '/.github/scripts/prism_manifest.php';

/**
 * Run the prism_manifest CLI as a subprocess and capture all three streams.
 *
 * @param  list<string> $args
 * @param  string       $stdin
 * @return array{0:int,1:string,2:string}  [exitCode, stdout, stderr]
 */
function pm_run(array $args, string $stdin = ''): array
{
    $command = array_merge([PHP_BINARY, PM_CLI_SCRIPT], $args);
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $proc = proc_open($command, $descriptors, $pipes);

    if (!is_resource($proc)) {
        throw new RuntimeException('could not spawn prism_manifest subprocess');
    }

    fwrite($pipes[0], $stdin);
    fclose($pipes[0]);

    $stdout = (string) stream_get_contents($pipes[1]);
    $stderr = (string) stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    return [proc_close($proc), $stdout, $stderr];
}

/**
 * Dispatch a command in-process and return [exit, stdout, stderr].
 *
 * Exercises the pure command logic (covered by pcov) while asserting the same
 * process-boundary contract the subprocess helper verifies.
 *
 * @param  list<string> $args  Command arguments (without the script name).
 * @param  string       $stdin
 * @return array{0:int,1:string,2:string}
 */
function pm_dispatch(array $args, string $stdin = ''): array
{
    $result = dispatch(array_merge(['script'], $args), $stdin);

    return [$result->exit, $result->stdout, $result->stderr];
}

/**
 * Parse NUL-delimited pairs the way a bash {@code read -r -d ''} loop does.
 *
 * Returns the interleaved [key, value, ...] list, discarding the single
 * trailing empty element produced by the terminal NUL terminator.
 *
 * @param  string $stdout
 * @return list<string>
 */
function pm_parse_nul_pairs(string $stdout): array
{
    $parts = explode("\0", $stdout);

    if ($parts !== [] && end($parts) === '') {
        array_pop($parts);
    }

    return $parts;
}

/**
 * Write a temp JSONC fixture and return its path.
 *
 * @param  string $content
 * @return string
 */
function pm_fixture(string $content): string
{
    $path = tempnam(sys_get_temp_dir(), 'prism_cli_');

    if ($path === false) {
        throw new RuntimeException('could not create temp fixture');
    }

    file_put_contents($path, $content);

    return $path;
}

/**
 * Remove a temp path only if it exists (migrate tests delete their inputs).
 *
 * @param  string $path
 * @return void
 */
function pm_clean(string $path): void
{
    if (is_file($path) || is_link($path)) {
        @unlink($path);
    }
}

/**
 * A complete valid schema-v5 project manifest as JSONC text.
 *
 * @return string
 */
function pm_valid_project_jsonc(): string
{
    return <<<'JSONC'
{
  // project manifest
  "setup_version": 5,
  "timestamp": "2026-07-29T10:00:00+00:00",
  "configured": true,
  "app": "prism",
  "domain": "prism.test",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": { "primary": "m1", "planner": "m2", "design": "m3", "judge": "m4", "utility": "m5" },
  "variants": { "primary": "v1", "planner": "v2", "design": "v3", "judge": "v4", "utility": "v5" },
  "experimental": { "lsp_tool": true, "scout": true, "background_subagents": false },
  "mcp": { "deepseek_websearch": false, "searxng": false },
  "plugins": { "opencode_quota": false },
  "env": { "deepseek_api_key": "", "searxng_url": "" }
}
JSONC;
}

describe('prism_manifest decode', function (): void {
    it('prints strict normalized JSON for a parsed document', function (): void {
        $fixture = pm_fixture('{"b": 2, "a": "x"}');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['decode', $fixture]);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('{"b":2,"a":"x"}')
                ->and($stderr)->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });

    it('fails closed on a malformed file without leaking values', function (): void {
        $fixture = pm_fixture('{ "env": { "deepseek_api_key": "SECRET-LEAK-VALUE" }');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['decode', $fixture]);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and($stdout . $stderr)->not->toContain('SECRET-LEAK-VALUE');
        } finally {
            pm_clean($fixture);
        }
    });
});

describe('prism_manifest validate', function (): void {
    it('exits 0 for a valid project manifest', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['validate', $fixture, 'project']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('')
                ->and($stderr)->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 1 for an invalid project manifest', function (): void {
        $fixture = pm_fixture('{ "setup_version": 5, "configured": true }');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['validate', $fixture, 'project']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and($stderr)->not->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 0 for a valid partial user manifest', function (): void {
        $fixture = pm_fixture('{ "setup_version": 5, "models": { "primary": "x" } }');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['validate', $fixture, 'user']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('')
                ->and($stderr)->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 1 for an invalid user manifest', function (): void {
        $fixture = pm_fixture('{ "setup_version": 4 }');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['validate', $fixture, 'user']);

            expect($code)->toBe(1)
                ->and($stderr)->not->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });
});

describe('prism_manifest env0', function (): void {
    it('emits exactly twenty NUL-separated name/value pairs with bool coercion', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['env0', $project]);

            expect($code)->toBe(0)
                ->and($stderr)->toBe('')
                ->and(substr($stdout, -1))->toBe("\0");

            $parts = pm_parse_nul_pairs($stdout);

            expect($parts)->toHaveCount(40)
                ->and($parts[0])->toBe('OPENCODE_MODEL_PRIMARY')
                ->and($parts[1])->toBe('m1')
                ->and($parts[20])->toBe('OPENCODE_EXPERIMENTAL_LSP_TOOL')
                ->and($parts[21])->toBe('true')
                ->and($parts[26])->toBe('DEEPSEEK_API_KEY')
                ->and($parts[27])->toBe('')
                ->and($parts[28])->toBe('SEARXNG_URL')
                ->and($parts[29])->toBe('')
                ->and($parts[30])->toBe('OPENCODE_SENSITIVE_PATHS')
                ->and($parts[31])->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('produces no stdout when a value fails mid-build', function (): void {
        $project = pm_fixture('{ "models": { "primary": { "nested": 1 } } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project]);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('overlays a user manifest onto the project defaults', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "models": { "primary": "overridden" }, "env": { "deepseek_api_key": "user-key" } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);
            $parts = pm_parse_nul_pairs($stdout);

            expect($code)->toBe(0)
                ->and($parts[1])->toBe('overridden')
                ->and($parts[27])->toBe('user-key');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('emits only the allowlisted variable names in their defined order', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project]);
            $parts = pm_parse_nul_pairs($stdout);
            $names = [];

            for ($i = 0; $i < count($parts); $i += 2) {
                $names[] = $parts[$i];
            }

            $expectedNames = array_merge(array_values(PRISM_ENV_MAP), array_values(PRISM_LIST_ENV_MAP), array_values(PRISM_TOGGLE_ENV_MAP), ['OPENCODE_CONFIG_CONTENT']);

            expect($code)->toBe(0)
                ->and($names)->toBe($expectedNames);
        } finally {
            pm_clean($project);
        }
    });

    it('rejects a NUL byte in an emitted value', function (): void {
        $resolved = (object) ['models' => (object) ['primary' => "ba\0d"]];

        expect(fn () => pm_env_pairs($resolved))->toThrow(PrismJsoncException::class);
    });

    it('emits all-off toggle diagnostics and inline MCP enabled false by default', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project]);

            expect($code)->toBe(0);

            $parts = pm_parse_nul_pairs($stdout);
            $pairs = [];
            for ($i = 0; $i < count($parts); $i += 2) {
                $pairs[$parts[$i]] = $parts[$i + 1];
            }

            expect($pairs['OPENCODE_MCP_DEEPSEEK_WEBSEARCH'])->toBe('false')
                ->and($pairs['OPENCODE_MCP_SEARXNG'])->toBe('false')
                ->and($pairs['OPENCODE_PLUGIN_OPENCODE_QUOTA'])->toBe('false');

            $inline = json_decode($pairs['OPENCODE_CONFIG_CONTENT'], false, 64, JSON_THROW_ON_ERROR);
            expect($inline->mcp->{'deepseek-websearch'}->enabled)->toBeFalse()
                ->and($inline->mcp->searxng->enabled)->toBeFalse();
        } finally {
            pm_clean($project);
        }
    });

    it('produces effective MCP enabled true when user preference and prerequisite are both satisfied', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "mcp": { "searxng": true }, "env": { "searxng_url": "https://search.example" } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);

            expect($code)->toBe(0);

            $parts = pm_parse_nul_pairs($stdout);
            $pairs = [];
            for ($i = 0; $i < count($parts); $i += 2) {
                $pairs[$parts[$i]] = $parts[$i + 1];
            }

            // Diagnostic reflects user preference (true)
            expect($pairs['OPENCODE_MCP_SEARXNG'])->toBe('true');

            // Effective inline config has searxng enabled (prerequisite satisfied)
            $inline = json_decode($pairs['OPENCODE_CONFIG_CONTENT'], false, 64, JSON_THROW_ON_ERROR);
            expect($inline->mcp->searxng->enabled)->toBeTrue();
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('keeps diagnostic true but effective enablement false when prerequisite is missing', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "mcp": { "deepseek_websearch": true }, "env": { "deepseek_api_key": "" } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);

            expect($code)->toBe(0);

            $parts = pm_parse_nul_pairs($stdout);
            $pairs = [];
            for ($i = 0; $i < count($parts); $i += 2) {
                $pairs[$parts[$i]] = $parts[$i + 1];
            }

            // Diagnostic remains true (requested preference)
            expect($pairs['OPENCODE_MCP_DEEPSEEK_WEBSEARCH'])->toBe('true');

            // Effective inline config has it disabled (missing prerequisite)
            $inline = json_decode($pairs['OPENCODE_CONFIG_CONTENT'], false, 64, JSON_THROW_ON_ERROR);
            expect($inline->mcp->{'deepseek-websearch'}->enabled)->toBeFalse();
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('preserves unrelated keys and plugins from inherited OPENCODE_CONFIG_CONTENT', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        // Set OPENCODE_CONFIG_CONTENT in the environment for the subprocess
        $envCopy = getenv();
        $args = array_merge([PHP_BINARY, PM_CLI_SCRIPT], ['env0', $project]);
        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];

        $baseInline = '{"theme":"dark","plugin":["custom/plugin","@slkiser/opencode-quota"],"mcp":{"custom-srv":{"enabled":true}}}';

        $proc = proc_open(
            $args,
            $descriptors,
            $pipes,
            null,
            array_merge($envCopy, ['OPENCODE_CONFIG_CONTENT' => $baseInline]),
        );

        if (!is_resource($proc)) {
            throw new RuntimeException('could not spawn prism_manifest subprocess');
        }

        fclose($pipes[0]);
        $stdout = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);

        pm_clean($project);

        expect($code)->toBe(0);

        $parts = pm_parse_nul_pairs($stdout);
        $pairs = [];
        for ($i = 0; $i < count($parts); $i += 2) {
            $pairs[$parts[$i]] = $parts[$i + 1];
        }

        $inline = json_decode($pairs['OPENCODE_CONFIG_CONTENT'], false, 64, JSON_THROW_ON_ERROR);
        expect($inline->theme)->toBe('dark')
            ->and($inline->mcp->{'custom-srv'}->enabled)->toBeTrue()
            ->and($inline->plugin)->toBe(['custom/plugin']);
    });

    it('fails closed on malformed inherited OPENCODE_CONFIG_CONTENT with exit 1 and no stdout', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        $envCopy = getenv();
        $args = array_merge([PHP_BINARY, PM_CLI_SCRIPT], ['env0', $project]);
        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];

        $proc = proc_open(
            $args,
            $descriptors,
            $pipes,
            null,
            array_merge($envCopy, ['OPENCODE_CONFIG_CONTENT' => '{']),
        );

        if (!is_resource($proc)) {
            throw new RuntimeException('could not spawn prism_manifest subprocess');
        }

        fclose($pipes[0]);
        $stdout = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);

        pm_clean($project);

        expect($code)->toBe(1)
            ->and($stdout)->toBe('');
    });

    it('emits no secret canary in inline JSON', function (): void {
        $canary = 'SK-SECRET-CANARY-9876543210';
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "mcp": { "deepseek_websearch": true }, "env": { "deepseek_api_key": "' . $canary . '" } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);

            expect($code)->toBe(0);

            $parts = pm_parse_nul_pairs($stdout);
            $pairs = [];
            for ($i = 0; $i < count($parts); $i += 2) {
                $pairs[$parts[$i]] = $parts[$i + 1];
            }

            expect($pairs['OPENCODE_CONFIG_CONTENT'])->not->toContain($canary);
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('emits false diagnostics for old schema-v5 fixtures without mcp or plugins sections', function (): void {
        $oldFixture = pm_fixture(<<<'JSONC'
{
  "setup_version": 5,
  "timestamp": "2026-07-29T10:00:00+00:00",
  "configured": true,
  "app": "prism",
  "domain": "prism.test",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": { "primary": "m1", "planner": "m2", "design": "m3", "judge": "m4", "utility": "m5" },
  "variants": { "primary": "v1", "planner": "v2", "design": "v3", "judge": "v4", "utility": "v5" },
  "experimental": { "lsp_tool": true, "scout": true, "background_subagents": false },
  "env": { "deepseek_api_key": "", "searxng_url": "" }
}
JSONC);

        try {
            [$code, $stdout] = pm_dispatch(['env0', $oldFixture]);

            expect($code)->toBe(0);

            $parts = pm_parse_nul_pairs($stdout);
            $pairs = [];
            for ($i = 0; $i < count($parts); $i += 2) {
                $pairs[$parts[$i]] = $parts[$i + 1];
            }

            expect($pairs['OPENCODE_MCP_DEEPSEEK_WEBSEARCH'])->toBe('false')
                ->and($pairs['OPENCODE_MCP_SEARXNG'])->toBe('false')
                ->and($pairs['OPENCODE_PLUGIN_OPENCODE_QUOTA'])->toBe('false');
        } finally {
            pm_clean($oldFixture);
        }
    });
});

describe('prism_manifest env0 sensitive-paths transport', function (): void {
    it('joins a valid additional_sensitive_paths list with newlines', function (): void {
        $resolved = (object) [
            'security' => (object) ['additional_sensitive_paths' => ['~/vault/', '/etc/myapp/keys/']],
        ];

        $pairs = pm_env_pairs($resolved);
        $index = array_search('OPENCODE_SENSITIVE_PATHS', $pairs, true);

        expect($index)->not->toBeFalse()
            ->and($pairs[$index + 1])->toBe("~/vault/\n/etc/myapp/keys/");
    });

    it('emits an empty OPENCODE_SENSITIVE_PATHS when the field is absent', function (): void {
        $pairs = pm_env_pairs((object) []);
        $index = array_search('OPENCODE_SENSITIVE_PATHS', $pairs, true);

        expect($index)->not->toBeFalse()
            ->and($pairs[$index + 1])->toBe('');
    });

    it('fails closed on a non-array additional_sensitive_paths value', function (): void {
        $resolved = (object) [
            'security' => (object) ['additional_sensitive_paths' => '/not-an-array'],
        ];

        expect(fn () => pm_env_pairs($resolved))
            ->toThrow(PrismJsoncException::class, 'fail closed');
    });

    it('fails closed on a relative additional_sensitive_paths entry', function (): void {
        $resolved = (object) [
            'security' => (object) ['additional_sensitive_paths' => ['relative/path']],
        ];

        expect(fn () => pm_env_pairs($resolved))
            ->toThrow(PrismJsoncException::class, 'fail closed');
    });

    it('fails closed on a control character in an additional_sensitive_paths entry', function (): void {
        $resolved = (object) [
            'security' => (object) ['additional_sensitive_paths' => ["/etc/\x01bad/"]],
        ];

        expect(fn () => pm_env_pairs($resolved))
            ->toThrow(PrismJsoncException::class, 'fail closed');
    });
});

describe('prism_manifest resolved-load validation', function (): void {
    it('env0 fails closed when the project manifest lacks setup_version', function (): void {
        $project = pm_fixture('{ "app": "prism" }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project]);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('env0 fails closed when the project manifest has an unsupported schema version', function (): void {
        $project = pm_fixture('{ "setup_version": 4 }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project]);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('env0 fails closed when the user manifest is malformed', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "app": ');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('get fails closed on an invalid project manifest', function (): void {
        $project = pm_fixture('{ "setup_version": 4 }');

        try {
            [$code, $stdout] = pm_dispatch(['get', $project, '-', 'models.primary']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('values0 fails closed on an invalid project manifest', function (): void {
        $project = pm_fixture('{ "setup_version": 4 }');

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, '-', 'setup_version']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('env0 accepts a valid project plus a valid partial user manifest', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "models": { "primary": "partial" } }');

        try {
            [$code] = pm_dispatch(['env0', $project, $user]);

            expect($code)->toBe(0);
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });
});

describe('prism_manifest NUL framing', function (): void {
    it('env0 output ends with a trailing NUL byte when the last value is non-empty', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "env": { "searxng_url": "http://x:8080" } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);

            expect($code)->toBe(0)
                ->and(substr($stdout, -1))->toBe("\0");
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('values0 output ends with a trailing NUL byte when the last value is non-empty', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, '-', 'setup_version']);

            expect($code)->toBe(0)
                ->and(substr($stdout, -1))->toBe("\0");
        } finally {
            pm_clean($project);
        }
    });

    it('env0 round-trips all twenty NUL-delimited pairs through a read -d loop', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "env": { "searxng_url": "http://x:8080" } }');

        try {
            [$code, $stdout] = pm_dispatch(['env0', $project, $user]);

            // Simulate: while read -r -d '' key && read -r -d '' val
            $pairs = [];
            $rest = $stdout;

            while (true) {
                $kp = strpos($rest, "\0");
                if ($kp === false) {
                    break;
                }
                $key = substr($rest, 0, $kp);
                $rest = substr($rest, $kp + 1);
                $vp = strpos($rest, "\0");
                if ($vp === false) {
                    break;
                }
                $pairs[$key] = substr($rest, 0, $vp);
                $rest = substr($rest, $vp + 1);
            }

            expect($code)->toBe(0)
                ->and($pairs)->toHaveCount(20)
                ->and($pairs['OPENCODE_MODEL_PRIMARY'])->toBe('m1')
                ->and($pairs['SEARXNG_URL'])->toBe('http://x:8080')
                ->and($pairs['OPENCODE_SENSITIVE_PATHS'])->toBe('');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });
});

describe('prism_manifest get', function (): void {
    it('prints a scalar value using dash for no user', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['get', $project, '-', 'models.primary']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('m1');
        } finally {
            pm_clean($project);
        }
    });

    it('coerces a boolean value to true or false', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['get', $project, '-', 'experimental.background_subagents']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('false');
        } finally {
            pm_clean($project);
        }
    });

    it('rejects an object result with exit 1 and no stdout', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['get', $project, '-', 'models']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and($stderr)->not->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('redacts an env.* value as [redacted] and never prints the secret', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "env": { "deepseek_api_key": "sk-live-CANARY-4f8d0c2e-DO_NOT_LEAK" } }');

        try {
            [$code, $stdout] = pm_dispatch(['get', $project, $user, 'env.deepseek_api_key']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('[redacted]')
                ->and($stdout)->not->toContain('CANARY');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });
});

describe('prism_manifest values0', function (): void {
    it('emits each requested dot path and scalar as NUL pairs from one snapshot', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, '-', 'setup_version', 'models.primary', 'project_folder']);
            $parts = pm_parse_nul_pairs($stdout);

            expect($code)->toBe(0)
                ->and($parts)->toBe(['setup_version', '5', 'models.primary', 'm1', 'project_folder', '']);
        } finally {
            pm_clean($project);
        }
    });

    it('reflects user overlay in the single snapshot', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "signed_off_by_name": "alice" }');

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, $user, 'signed_off_by_name', 'signed_off_by_email']);
            $parts = pm_parse_nul_pairs($stdout);

            expect($code)->toBe(0)
                ->and($parts)->toBe(['signed_off_by_name', 'alice', 'signed_off_by_email', 'git@kyaulabs.com']);
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('rejects an object value with exit 1 and no stdout', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, '-', 'models', 'models.primary']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
        }
    });

    it('fails closed when a value contains a NUL byte', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "signed_off_by_name": "evil\u0000inject" }');

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, $user, 'signed_off_by_name']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });

    it('redacts an env.* value in the pair stream without leaking the secret', function (): void {
        $project = pm_fixture(pm_valid_project_jsonc());
        $user = pm_fixture('{ "setup_version": 5, "env": { "deepseek_api_key": "sk-live-CANARY-4f8d0c2e-DO_NOT_LEAK" } }');

        try {
            [$code, $stdout] = pm_dispatch(['values0', $project, $user, 'signed_off_by_name', 'env.deepseek_api_key']);
            $parts = pm_parse_nul_pairs($stdout);

            expect($code)->toBe(0)
                ->and($parts)->toBe(['signed_off_by_name', 'kyau', 'env.deepseek_api_key', '[redacted]'])
                ->and($stdout)->not->toContain('CANARY');
        } finally {
            pm_clean($project);
            pm_clean($user);
        }
    });
});

describe('prism_manifest patch', function (): void {
    it('patches a value, validates, and writes atomically at the requested mode', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], '{"models.primary": "new-model"}');

            $root = PrismJsoncDocument::fromFile($fixture)->root();

            expect($code)->toBe(0)
                ->and($root->models->primary)->toBe('new-model')
                ->and(fileperms($fixture) & 0777)->toBe(0644);
        } finally {
            pm_clean($fixture);
        }
    });

    it('creates missing object ancestors when patching a new section', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], '{"extras.nested.value": 42}');

            $root = PrismJsoncDocument::fromFile($fixture)->root();

            expect($code)->toBe(0)
                ->and($root->extras->nested->value)->toBe(42);
        } finally {
            pm_clean($fixture);
        }
    });

    it('fails with exit 1 on a scalar-ancestor collision without modifying the file', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());
        $original = file_get_contents($fixture);

        try {
            [$code, $stdout] = pm_dispatch(['patch', $fixture, 'project', '0644'], '{"app.sub": "x"}');

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and(file_get_contents($fixture))->toBe($original);
        } finally {
            pm_clean($fixture);
        }
    });

    it('validates the patched result and leaves the file unchanged on failure', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());
        $original = file_get_contents($fixture);

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], '{"models.primary": ""}');

            expect($code)->toBe(1)
                ->and(file_get_contents($fixture))->toBe($original);
        } finally {
            pm_clean($fixture);
        }
    });

    it('writes at mode 0600 when requested', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0600'], '{"models.primary": "z"}');

            expect($code)->toBe(0)
                ->and(fileperms($fixture) & 0777)->toBe(0600);
        } finally {
            pm_clean($fixture);
        }
    });

    it('rejects a non-octal mode string with exit 2', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '644'], '{}');

            expect($code)->toBe(2);
        } finally {
            pm_clean($fixture);
        }
    });

    it('validates a partial user manifest on a user-mode patch', function (): void {
        $fixture = pm_fixture('{ "setup_version": 5 }');

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'user', '0600'], '{"models.primary": "u1"}');

            $root = PrismJsoncDocument::fromFile($fixture)->root();

            expect($code)->toBe(0)
                ->and($root->models->primary)->toBe('u1');
        } finally {
            pm_clean($fixture);
        }
    });

    it('rejects malformed patch stdin with exit 1', function (string $stdin): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], $stdin);

            expect($code)->toBe(1);
        } finally {
            pm_clean($fixture);
        }
    })->with([
        'invalid json' => ['{not json'],
        'json array' => ['[1, 2]'],
        'json scalar' => ['"hello"'],
        'json number' => ['42'],
    ]);

    it('rejects an empty JSON array as patch input', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], '[]');

            expect($code)->toBe(1);
        } finally {
            pm_clean($fixture);
        }
    });

    it('preserves an empty nested object as an object through patch', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], '{"extras": {}}');

            $root = PrismJsoncDocument::fromFile($fixture)->root();

            expect($code)->toBe(0)
                ->and($root->extras)->toBeObject()
                ->and($root->extras)->not->toBeArray();
        } finally {
            pm_clean($fixture);
        }
    });

    it('accepts an empty patch object as a validating no-op write', function (): void {
        $fixture = pm_fixture(pm_valid_project_jsonc());

        try {
            [$code] = pm_dispatch(['patch', $fixture, 'project', '0644'], '{}');

            expect($code)->toBe(0)
                ->and(fileperms($fixture) & 0777)->toBe(0644);
        } finally {
            pm_clean($fixture);
        }
    });
});

describe('prism_manifest migrate-preview', function (): void {
    it('projects a legacy source to normalized v5 JSON without filesystem mutation', function (): void {
        $legacy = pm_fixture('{ "setup_version": 4, "app": "prism" }');
        $before = file_get_contents($legacy);

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['migrate-preview', $legacy, 'project']);

            expect($code)->toBe(0)
                ->and($stderr)->toBe('')
                ->and($stdout)->toBe('{"setup_version":5,"app":"prism"}')
                ->and(file_get_contents($legacy))->toBe($before);
        } finally {
            pm_clean($legacy);
        }
    });
});

describe('prism_manifest migrate', function (): void {
    it('refuses to migrate when the v5 projection fails project validation, preserving the legacy', function (): void {
        $legacy = pm_fixture('{ "setup_version": 4 }');
        $target = sys_get_temp_dir() . '/prism_tgt_' . uniqid('', true);

        try {
            [$code, $stdout] = pm_dispatch(['migrate', $legacy, $target, 'project', '0644']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and(file_exists($legacy))->toBeTrue()
                ->and(file_exists($target))->toBeFalse();
        } finally {
            pm_clean($legacy);
            pm_clean($target);
        }
    });

    it('refuses to migrate when the v5 projection fails user validation, preserving the legacy', function (): void {
        $legacy = pm_fixture('{ "setup_version": 4, "accent": "red" }');
        $target = sys_get_temp_dir() . '/prism_tgt_' . uniqid('', true);

        try {
            [$code, $stdout] = pm_dispatch(['migrate', $legacy, $target, 'user', '0644']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and(file_exists($legacy))->toBeTrue()
                ->and(file_exists($target))->toBeFalse();
        } finally {
            pm_clean($legacy);
            pm_clean($target);
        }
    });

    it('rejects a source whose setup_version is not a positive integer no greater than 5', function (string $versionPayload): void {
        $legacy = pm_fixture('{ "setup_version": ' . $versionPayload . ' }');
        $target = sys_get_temp_dir() . '/prism_tgt_' . uniqid('', true);

        try {
            [$code] = pm_dispatch(['migrate', $legacy, $target, 'project', '0644']);

            expect($code)->toBe(1)
                ->and(file_exists($legacy))->toBeTrue()
                ->and(file_exists($target))->toBeFalse();
        } finally {
            pm_clean($legacy);
            pm_clean($target);
        }
    })->with([
        'zero' => ['0'],
        'negative' => ['-1'],
        'string' => ['"abc"'],
        'null' => ['null'],
        'newer than 5' => ['6'],
    ]);

    it('refuses to migrate when the target already exists', function (): void {
        $legacy = pm_fixture('{ "setup_version": 4 }');
        $target = pm_fixture('pre-existing target');

        try {
            [$code, $stdout] = pm_dispatch(['migrate', $legacy, $target, 'project', '0644']);

            expect($code)->toBe(1)
                ->and($stdout)->toBe('')
                ->and(file_get_contents($target))->toBe('pre-existing target');
        } finally {
            pm_clean($legacy);
            pm_clean($target);
        }
    });

    it('refuses a source version newer than 5', function (): void {
        $legacy = pm_fixture('{ "setup_version": 6 }');
        $target = sys_get_temp_dir() . '/prism_tgt_' . uniqid('', true);

        try {
            [$code] = pm_dispatch(['migrate', $legacy, $target, 'project', '0644']);

            expect($code)->toBe(1)
                ->and(file_exists($target))->toBeFalse();
        } finally {
            pm_clean($legacy);
            pm_clean($target);
        }
    });

    it('writes a canonical v5 document, removes legacy, at the requested mode', function (): void {
        $legacy = pm_fixture(str_replace('"setup_version": 5', '"setup_version": 4', pm_valid_project_jsonc()));
        $target = sys_get_temp_dir() . '/prism_tgt_' . uniqid('', true);

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['migrate', $legacy, $target, 'project', '0644']);

            $root = PrismJsoncDocument::fromFile($target)->root();

            expect($code)->toBe(0)
                ->and($stdout)->toBe('')
                ->and(file_exists($legacy))->toBeFalse()
                ->and(file_exists($target))->toBeTrue()
                ->and($root->setup_version)->toBe(5)
                ->and($root->app)->toBe('prism')
                ->and(fileperms($target) & 0777)->toBe(0644);
        } finally {
            pm_clean($legacy);
            pm_clean($target);
        }
    });
});

describe('prism_manifest check-secrets', function (): void {
    it('exits 0 when all env values are empty', function (): void {
        $fixture = pm_fixture('{ "env": { "deepseek_api_key": "", "searxng_url": "" } }');

        try {
            [$code, $stdout] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 0 for a user manifest with no env section', function (): void {
        $fixture = pm_fixture('{ "setup_version": 5 }');

        try {
            [$code] = pm_dispatch(['check-secrets', $fixture, 'user']);

            expect($code)->toBe(0);
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 1 and prints the violating key path when an env value is non-empty', function (): void {
        $fixture = pm_fixture('{ "env": { "deepseek_api_key": "super-secret-value" } }');

        try {
            [$code, $stdout] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(1)
                ->and($stdout)->toContain('env.deepseek_api_key')
                ->and($stdout)->not->toContain('super-secret-value');
        } finally {
            pm_clean($fixture);
        }
    });

    it('never prints the offending value in any result stream', function (): void {
        $fixture = pm_fixture('{ "env": { "searxng_url": "http://secret-host:8080" } }');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(1)
                ->and($stdout)->toContain('env.searxng_url')
                ->and($stdout . $stderr)->not->toContain('http://secret-host:8080');
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 1 when env holds a non-empty non-string value', function (): void {
        $fixture = pm_fixture('{ "env": { "deepseek_api_key": 5 } }');

        try {
            [$code] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(1);
        } finally {
            pm_clean($fixture);
        }
    });
});

describe('prism_manifest check-secrets env contract', function (): void {
    it('fails closed for a project manifest with no env section', function (): void {
        $fixture = pm_fixture('{ "setup_version": 5 }');

        try {
            [$code] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(1);
        } finally {
            pm_clean($fixture);
        }
    });

    it('fails closed for a project manifest whose env is not an object', function (string $envJson): void {
        $fixture = pm_fixture('{ "env": ' . $envJson . ' }');

        try {
            [$code] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(1);
        } finally {
            pm_clean($fixture);
        }
    })->with([
        'string env' => ['"not-an-object"'],
        'array env' => ['[]'],
        'number env' => ['5'],
    ]);

    it('accepts a user manifest with no env section', function (): void {
        $fixture = pm_fixture('{ "setup_version": 5 }');

        try {
            [$code] = pm_dispatch(['check-secrets', $fixture, 'user']);

            expect($code)->toBe(0);
        } finally {
            pm_clean($fixture);
        }
    });

    it('accepts a project manifest with an object env of empty values', function (): void {
        $fixture = pm_fixture('{ "env": { "deepseek_api_key": "", "searxng_url": "" } }');

        try {
            [$code, $stdout] = pm_dispatch(['check-secrets', $fixture, 'project']);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });
});

describe('prism_manifest process boundary', function (): void {
    it('exits 2 for an unknown command', function (): void {
        [$code, $stdout, $stderr] = pm_dispatch(['bogus-command']);

        expect($code)->toBe(2)
            ->and($stdout)->toBe('')
            ->and($stderr)->not->toBe('');
    });

    it('exits 2 for wrong arity', function (): void {
        [$code] = pm_dispatch(['decode']);

        expect($code)->toBe(2);
    });

    it('exits 2 when no command is given', function (): void {
        [$code] = pm_dispatch([]);

        expect($code)->toBe(2);
    });

    it('never leaks secret values in diagnostics', function (): void {
        $fixture = pm_fixture('{ "env": { "deepseek_api_key": "DIAG-SECRET-TOKEN-XYZ" }, "x": }');

        try {
            [$code, $stdout, $stderr] = pm_dispatch(['validate', $fixture, 'project']);

            expect($code)->toBe(1)
                ->and($stdout . $stderr)->not->toContain('DIAG-SECRET-TOKEN-XYZ');
        } finally {
            pm_clean($fixture);
        }
    });

    it('returns the generic secret-free message on an unexpected throwable', function (): void {
        [$code, $stdout, $stderr] = pm_dispatch(['decode', null]);

        expect($code)->toBe(1)
            ->and($stdout)->toBe('')
            ->and($stderr)->toBe('prism_manifest: unexpected manifest failure');
    });

    it('rejects malformed arity or mode for each command with exit 2', function (array $args): void {
        [$code] = pm_dispatch($args);

        expect($code)->toBe(2);
    })->with([
        'decode arity' => [['decode']],
        'validate arity' => [['validate', 'x']],
        'validate mode' => [['validate', 'x', 'bogus']],
        'env0 arity' => [['env0']],
        'get arity' => [['get', 'x', '-']],
        'values0 arity' => [['values0', 'x', '-']],
        'patch arity' => [['patch', 'x']],
        'patch mode' => [['patch', 'x', 'bogus', '0644']],
        'patch octal' => [['patch', 'x', 'project', '644']],
        'migrate-preview arity' => [['migrate-preview', 'x']],
        'migrate-preview mode' => [['migrate-preview', 'x', 'bogus']],
        'migrate arity' => [['migrate', 'x', 'y']],
        'migrate mode' => [['migrate', 'x', 'y', 'bogus', '0644']],
        'migrate octal' => [['migrate', 'x', 'y', 'project', '644']],
        'check-secrets arity' => [['check-secrets']],
        'check-secrets mode' => [['check-secrets', 'x', 'bogus']],
    ]);
});

describe('prism_manifest main I/O shell', function (): void {
    it('emits dispatched stdout and returns the exit code', function (): void {
        $fixture = pm_fixture('{"k": 9}');

        ob_start();
        $code = main(['script', 'decode', $fixture]);
        $out = ob_get_clean();

        try {
            expect($code)->toBe(0)
                ->and($out)->toBe('{"k":9}');
        } finally {
            pm_clean($fixture);
        }
    });
});

describe('prism_manifest real process boundary', function (): void {
    it('exits with the dispatched code and separates stdout from stderr via main()', function (): void {
        $fixture = pm_fixture('{"k": 7}');

        try {
            [$code, $stdout, $stderr] = pm_run(['decode', $fixture]);

            expect($code)->toBe(0)
                ->and($stdout)->toBe('{"k":7}')
                ->and($stderr)->toBe('');
        } finally {
            pm_clean($fixture);
        }
    });

    it('exits 2 at the process level for an unknown command', function (): void {
        [$code, $stdout] = pm_run(['nope']);

        expect($code)->toBe(2)
            ->and($stdout)->toBe('');
    });
});








// vim: ft=php sts=4 sw=4 ts=4 et :
