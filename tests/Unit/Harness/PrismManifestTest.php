<?php

declare(strict_types=1);

# $KYAULabs: PrismManifestTest.php kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $




require_once dirname(__DIR__, 3) . '/.github/scripts/PrismManifest.php';

use KYAULabs\Prism\PrismJsoncException;
use KYAULabs\Prism\PrismManifest;

/**
 * Build a complete, valid schema-v6 project manifest for validation tests.
 *
 * @return \stdClass
 */
function pm_valid_project(): \stdClass
{
    return (object) [
        'setup_version' => 6,
        'timestamp' => '2026-07-29T10:00:00+00:00',
        'configured' => true,
        'app' => 'prism',
        'domain' => 'prism.test',
        'repo' => 'kyaulabs/prism',
        'signed_off_by_name' => 'kyau',
        'signed_off_by_email' => 'git@kyaulabs.com',
        'accent' => 'sky-blue',
        'scaffold_mode' => 'skip',
        'project_folder' => null,
        'models' => (object) [
            'primary' => 'm1', 'planner' => 'm2', 'design' => 'm3', 'judge' => 'm4', 'utility' => 'm5', 'frontend' => 'm6',
        ],
        'variants' => (object) [
            'primary' => 'v1', 'planner' => 'v2', 'design' => 'v3', 'judge' => 'v4', 'utility' => 'v5', 'frontend' => 'v6',
        ],
        'experimental' => (object) [
            'lsp_tool' => true, 'scout' => true, 'background_subagents' => false,
        ],
        'mcp' => (object) [
            'deepseek_websearch' => false,
            'searxng' => false,
        ],
        'plugins' => (object) [
            'opencode_quota' => false,
        ],
        'env' => (object) ['deepseek_api_key' => '', 'searxng_url' => ''],
    ];
}

/**
 * Set or remove a dotted path on a manifest fixture.
 *
 * The sentinel '__unset' removes the leaf key instead of assigning.
 *
 * @param  \stdClass $root
 * @param  string    $dotPath
 * @param  mixed     $value
 * @return void
 */
function pm_set_dot(\stdClass $root, string $dotPath, mixed $value): void
{
    $segments = explode('.', $dotPath);
    $current = $root;
    $last = array_pop($segments);

    foreach ($segments as $segment) {
        $current = $current->{$segment};
    }

    if ($value === '__unset') {
        unset($current->{$last});
    } else {
        $current->{$last} = $value;
    }
}

describe('PrismManifest::resolve', function (): void {
    it('overlays user fields recursively without erasing project siblings', function (): void {
        $resolved = PrismManifest::resolve(
            (object) ['setup_version' => 6, 'models' => (object) ['primary' => 'project', 'judge' => 'judge']],
            (object) ['setup_version' => 6, 'models' => (object) ['primary' => 'user']],
        );

        expect($resolved->models)->toEqual((object) ['primary' => 'user', 'judge' => 'judge']);
    });

    it('keeps objects as stdClass and arrays as lists so empty kinds never collapse through overlay', function (): void {
        $resolved = PrismManifest::resolve(
            (object) [
                'kept_obj' => (object) ['a' => 1],
                'kept_arr' => [2, 3],
                'empty_obj' => (object) [],
                'empty_arr' => [],
            ],
            (object) [
                'kept_obj' => (object) ['b' => 4],
                'empty_obj' => (object) [],
            ],
        );

        expect($resolved->kept_obj)->toBeObject()
            ->and($resolved->kept_obj)->not->toBeArray()
            ->and($resolved->kept_obj)->toEqual((object) ['a' => 1, 'b' => 4])
            ->and($resolved->kept_arr)->toBeArray()
            ->and($resolved->kept_arr)->toBe([2, 3])
            ->and($resolved->empty_obj)->toBeObject()
            ->and($resolved->empty_obj)->not->toBeArray()
            ->and($resolved->empty_arr)->toBeArray()
            ->and($resolved->empty_arr)->not->toBeObject();
    });

    it('replaces scalars and arrays atomically without merging', function (): void {
        $resolved = PrismManifest::resolve(
            (object) ['count' => 1, 'tags' => ['a', 'b'], 'name' => 'project'],
            (object) ['count' => 9, 'tags' => ['z'], 'name' => 'user'],
        );

        expect($resolved->count)->toBe(9)
            ->and($resolved->tags)->toBe(['z'])
            ->and($resolved->name)->toBe('user');
    });

    it('returns a deep clone of the project when the user is null and never aliases inputs', function (): void {
        $project = (object) ['models' => (object) ['primary' => 'p'], 'tags' => ['a']];
        $resolved = PrismManifest::resolve($project, null);

        expect($resolved)->toEqual($project)
            ->and($resolved)->not->toBe($project)
            ->and($resolved->models)->not->toBe($project->models);

        $resolved->models->primary = 'changed';
        $resolved->tags[] = 'b';

        expect($project->models->primary)->toBe('p')
            ->and($project->tags)->toBe(['a']);
    });

    it('inherits project defaults for fields the user omits', function (): void {
        $resolved = PrismManifest::resolve(
            (object) [
                'app' => 'prism',
                'domain' => 'prism.test',
                'models' => (object) ['primary' => 'p', 'judge' => 'j'],
            ],
            (object) ['app' => 'override'],
        );

        expect($resolved->app)->toBe('override')
            ->and($resolved->domain)->toBe('prism.test')
            ->and($resolved->models->primary)->toBe('p')
            ->and($resolved->models->judge)->toBe('j');
    });

    it('merges nested objects recursively at every level', function (): void {
        $resolved = PrismManifest::resolve(
            (object) ['a' => (object) ['b' => (object) ['c' => (object) ['d' => 1, 'e' => 2]]]],
            (object) ['a' => (object) ['b' => (object) ['c' => (object) ['e' => 9, 'f' => 10]]]],
        );

        expect($resolved->a->b->c)->toEqual((object) ['d' => 1, 'e' => 9, 'f' => 10]);
    });
});

describe('PrismManifest::validateProject', function (): void {
    it('accepts a complete schema-v6 project manifest', function (): void {
        $validate = function (): void {
            PrismManifest::validateProject(pm_valid_project());
        };

        expect($validate)->not->toThrow(PrismJsoncException::class);
    });

    it('requires frontend model and variant values in schema-v6 projects', function (string $section): void {
        $manifest = pm_valid_project();
        unset($manifest->{$section}->frontend);

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class, "missing required field: {$section}.frontend");
    })->with(['models', 'variants']);

    it('rejects a project manifest missing a required field', function (string $field): void {
        $manifest = pm_valid_project();
        unset($manifest->{$field});

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'setup_version', 'timestamp', 'configured', 'app', 'domain', 'repo',
        'signed_off_by_name', 'signed_off_by_email', 'accent', 'scaffold_mode',
        'project_folder', 'models', 'variants', 'experimental', 'env',
    ]);

    it('rejects a project manifest with a wrong-typed field', function (string $field, mixed $bad): void {
        $manifest = pm_valid_project();
        $manifest->{$field} = $bad;

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'setup_version is string' => ['setup_version', '5'],
        'timestamp is int' => ['timestamp', 123],
        'configured is string' => ['configured', 'yes'],
        'app is int' => ['app', 1],
        'accent is int' => ['accent', 5],
        'scaffold_mode is int' => ['scaffold_mode', 1],
        'project_folder is int' => ['project_folder', 7],
        'models is array' => ['models', ['x']],
        'env is array' => ['env', ['x']],
    ]);

    it('rejects a project manifest with an empty required string', function (string $dotPath): void {
        $manifest = pm_valid_project();
        pm_set_dot($manifest, $dotPath, '');

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'app', 'domain', 'repo', 'signed_off_by_name', 'signed_off_by_email',
        'models.primary', 'models.utility', 'variants.judge',
    ]);

    it('rejects a project manifest with a bad enum value', function (string $field, mixed $bad): void {
        $manifest = pm_valid_project();
        $manifest->{$field} = $bad;

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'accent wrong' => ['accent', 'red'],
        'scaffold_mode wrong' => ['scaffold_mode', 'fast'],
    ]);

    it('rejects a non-empty committed env value as a secret', function (): void {
        $manifest = pm_valid_project();
        $manifest->env->deepseek_api_key = 'leaked-secret';

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    });

    it('rejects nested section violations', function (string $dotPath, mixed $bad): void {
        $manifest = pm_valid_project();
        pm_set_dot($manifest, $dotPath, $bad);

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'missing model tier' => ['models.design', '__unset'],
        'experimental non-bool' => ['experimental.scout', 'yes'],
        'missing experimental flag' => ['experimental.lsp_tool', '__unset'],
        'env value non-string' => ['env.searxng_url', 5],
    ]);

    it('accepts safe project-local app webroot names', function (string $app): void {
        $manifest = pm_valid_project();
        $manifest->app = $app;

        expect(fn () => PrismManifest::validateProject($manifest))
            ->not->toThrow(PrismJsoncException::class);
    })->with(['prism', 'shop-2', 'site_v2', 'portal.example']);

    it('rejects unsafe or protected project app webroot names', function (string $app): void {
        $manifest = pm_valid_project();
        $manifest->app = $app;

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class, 'field app must be a safe project-local webroot name');
    })->with([
        '../backend',
        'foo/bar',
        '<app>',
        '{env:HOME}',
        ' backend',
        str_repeat('a', 256),
        'adr',
        'aurora',
        'backend',
        'Backend',
        'cdn',
        'docs',
        'node_modules',
        'tests',
        'vendor',
    ]);

    it('rejects a project manifest whose timestamp is not ISO-8601', function (): void {
        $manifest = pm_valid_project();
        $manifest->timestamp = 'not-a-date';

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    });

    it('accepts ISO-8601 timestamp variants', function (string $timestamp): void {
        $manifest = pm_valid_project();
        $manifest->timestamp = $timestamp;

        expect(fn () => PrismManifest::validateProject($manifest))
            ->not->toThrow(PrismJsoncException::class);
    })->with([
        'date-time with Z' => ['2026-07-28T14:30:00Z'],
        'date-time with offset' => ['2026-07-28T14:30:00+00:00'],
        'date only' => ['2026-07-28'],
    ]);
});

describe('PrismManifest::validateUser', function (): void {
    it('allows a schema-v6 user manifest to inherit frontend defaults', function (): void {
        $user = (object) ['setup_version' => 6];

        expect(fn () => PrismManifest::validateUser($user))
            ->not->toThrow(PrismJsoncException::class);

        $resolved = PrismManifest::resolve(pm_valid_project(), $user);
        expect($resolved->models->frontend)->toBe('m6')
            ->and($resolved->variants->frontend)->toBe('v6');
    });

    it('accepts a minimal partial user manifest', function (): void {
        $validate = function (): void {
            PrismManifest::validateUser((object) [
                'setup_version' => 6,
                'models' => (object) ['primary' => 'my-model'],
            ]);
        };

        expect($validate)->not->toThrow(PrismJsoncException::class);
    });

    it('rejects an empty user manifest because setup_version is required', function (): void {
        expect(fn () => PrismManifest::validateUser((object) []))
            ->toThrow(PrismJsoncException::class);
    });

    it('requires setup_version to be exactly 6 when present', function (): void {
        expect(fn () => PrismManifest::validateUser((object) ['setup_version' => 4]))
            ->toThrow(PrismJsoncException::class);
    });

    it('requires setup_version even when other fields are present', function (): void {
        expect(fn () => PrismManifest::validateUser((object) ['models' => (object) ['primary' => 'x']]))
            ->toThrow(PrismJsoncException::class);
    });

    it('accepts non-empty env overrides in a user manifest', function (): void {
        $validate = function (): void {
            PrismManifest::validateUser((object) [
                'setup_version' => 6,
                'env' => (object) ['deepseek_api_key' => 'user-secret'],
            ]);
        };

        expect($validate)->not->toThrow(PrismJsoncException::class);
    });

    it('rejects invalid present fields in a user manifest', function (\stdClass $user): void {
        expect(fn () => PrismManifest::validateUser($user))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'setup_version not 6' => [(object) ['setup_version' => 4]],
        'configured non-bool' => [(object) ['setup_version' => 6, 'configured' => 'yes']],
        'accent bad enum' => [(object) ['setup_version' => 6, 'accent' => 'red']],
        'scaffold_mode bad enum' => [(object) ['setup_version' => 6, 'scaffold_mode' => 'fast']],
        'app empty' => [(object) ['setup_version' => 6, 'app' => '']],
        'models.design empty' => [(object) ['setup_version' => 6, 'models' => (object) ['design' => '']]],
        'experimental non-bool' => [(object) ['setup_version' => 6, 'experimental' => (object) ['scout' => 'yes']]],
        'env non-string value' => [(object) ['setup_version' => 6, 'env' => (object) ['deepseek_api_key' => 5]]],
    ]);

    it('rejects unsafe or protected user app overrides', function (string $app): void {
        $user = (object) ['setup_version' => 6, 'app' => $app];

        expect(fn () => PrismManifest::validateUser($user))
            ->toThrow(PrismJsoncException::class, 'field app must be a safe project-local webroot name');
    })->with(['../backend', 'backend', 'Backend', 'cdn', 'tests', 'vendor']);
});

describe('PrismManifest::resolve sensitive-path union', function (): void {
    it('unions project and user additions order-preserving with exact-string dedup', function (): void {
        $resolved = PrismManifest::resolve(
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => ['~/vault/', '/etc/proj/']],
            ],
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => ['/etc/user/', '/etc/proj/']],
            ],
        );

        expect($resolved->security->additional_sensitive_paths)
            ->toBe(['~/vault/', '/etc/proj/', '/etc/user/']);
    });

    it('keeps the user additions when only the user tier defines them', function (): void {
        $resolved = PrismManifest::resolve(
            (object) ['setup_version' => 6],
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => ['/etc/user/']],
            ],
        );

        expect($resolved->security->additional_sensitive_paths)->toBe(['/etc/user/']);
    });

    it('keeps the project additions when the user tier omits the security field', function (): void {
        $resolved = PrismManifest::resolve(
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => ['~/vault/']],
            ],
            (object) ['setup_version' => 6],
        );

        expect($resolved->security->additional_sensitive_paths)->toBe(['~/vault/']);
    });

    it('restores the project additions when the user tier clobbers security with a scalar', function (): void {
        $resolved = PrismManifest::resolve(
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => ['~/vault/']],
            ],
            (object) ['setup_version' => 6, 'security' => 'junk'],
        );

        expect($resolved->security)->toBeObject()
            ->and($resolved->security->additional_sensitive_paths)->toBe(['~/vault/']);
    });

    it('skips a non-array list from a tier instead of letting it drop the other tier', function (): void {
        $resolved = PrismManifest::resolve(
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => ['~/vault/']],
            ],
            (object) [
                'setup_version' => 6,
                'security' => (object) ['additional_sensitive_paths' => 'not-an-array'],
            ],
        );

        expect($resolved->security->additional_sensitive_paths)->toBe(['~/vault/']);
    });
});

describe('PrismManifest sensitive-path field validation', function (): void {
    it('accepts a valid additional_sensitive_paths list in a project manifest', function (): void {
        $manifest = pm_valid_project();
        $manifest->security = (object) ['additional_sensitive_paths' => ['~/vault/', '/etc/myapp/keys/']];

        expect(fn () => PrismManifest::validateProject($manifest))
            ->not->toThrow(PrismJsoncException::class);
    });

    it('accepts a valid additional_sensitive_paths list in a user manifest', function (): void {
        expect(fn () => PrismManifest::validateUser((object) [
            'setup_version' => 6,
            'security' => (object) ['additional_sensitive_paths' => ['~/vault/']],
        ]))->not->toThrow(PrismJsoncException::class);
    });

    it('accepts project and user manifests without a security section', function (): void {
        expect(fn () => PrismManifest::validateProject(pm_valid_project()))
            ->not->toThrow(PrismJsoncException::class);

        expect(fn () => PrismManifest::validateUser((object) ['setup_version' => 6]))
            ->not->toThrow(PrismJsoncException::class);
    });

    it('accepts a security section that omits the additional_sensitive_paths field', function (): void {
        $manifest = pm_valid_project();
        $manifest->security = (object) [];

        expect(fn () => PrismManifest::validateProject($manifest))
            ->not->toThrow(PrismJsoncException::class);

        expect(fn () => PrismManifest::validateUser((object) [
            'setup_version' => 6,
            'security' => (object) [],
        ]))->not->toThrow(PrismJsoncException::class);
    });

    it('rejects malformed additional_sensitive_paths in a project manifest', function (string $dotPath, mixed $bad): void {
        $manifest = pm_valid_project();
        $manifest->security = (object) [];
        pm_set_dot($manifest, $dotPath, $bad);

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class, 'fail closed');
    })->with([
        'string value' => ['security.additional_sensitive_paths', '/not-an-array'],
        'relative entry' => ['security.additional_sensitive_paths', ['relative/path']],
        'control character entry' => ['security.additional_sensitive_paths', ["/etc/\x01bad/"]],
        'non-string entry' => ['security.additional_sensitive_paths', ['/ok/', 5]],
        'security not an object' => ['security', 'junk'],
    ]);

    it('rejects malformed additional_sensitive_paths in a user manifest', function (string $dotPath, mixed $bad): void {
        $user = (object) ['setup_version' => 6];
        $user->security = (object) [];
        pm_set_dot($user, $dotPath, $bad);

        expect(fn () => PrismManifest::validateUser($user))
            ->toThrow(PrismJsoncException::class, 'fail closed');
    })->with([
        'string value' => ['security.additional_sensitive_paths', '/not-an-array'],
        'relative entry' => ['security.additional_sensitive_paths', ['relative/path']],
        'control character entry' => ['security.additional_sensitive_paths', ["/etc/\x01bad/"]],
        'security not an object' => ['security', 'junk'],
    ]);
});

describe('mcp and plugins integration preferences', function (): void {
    it('accepts schema-v6 project manifests that predate optional integration sections', function (): void {
        $manifest = pm_valid_project();
        unset($manifest->mcp, $manifest->plugins);

        expect(fn () => PrismManifest::validateProject($manifest))
            ->not->toThrow(PrismJsoncException::class);
    });

    it('rejects non-boolean integration preferences', function (string $path): void {
        $manifest = pm_valid_project();
        pm_set_dot($manifest, $path, 'false');

        expect(fn () => PrismManifest::validateProject($manifest))
            ->toThrow(PrismJsoncException::class);
    })->with(['mcp.deepseek_websearch', 'mcp.searxng', 'plugins.opencode_quota']);

    it('accepts partial user integration overrides', function (): void {
        expect(fn () => PrismManifest::validateUser((object) [
            'setup_version' => 6,
            'mcp' => (object) ['searxng' => true],
            'plugins' => (object) ['opencode_quota' => true],
        ]))->not->toThrow(PrismJsoncException::class);
    });

    it('overlays integration preferences without erasing sibling defaults', function (): void {
        $resolved = PrismManifest::resolve(
            (object) ['mcp' => (object) ['deepseek_websearch' => false, 'searxng' => false]],
            (object) ['mcp' => (object) ['searxng' => true]],
        );

        expect($resolved->mcp->deepseek_websearch)->toBeFalse()
            ->and($resolved->mcp->searxng)->toBeTrue();
    });
});










// vim: ft=php sts=4 sw=4 ts=4 et :
