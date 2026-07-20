<?php

declare(strict_types=1);

# $KYAULabs: ModelConfigTest.php kyau@nova 2026/07/19 -0700 Exp $




























use PHPUnit\Framework\Assert;

/**
 * Load and return the project setup.json (v4 schema) as an associative array.
 *
 * @return array<string, mixed>
 */
function setup_json(): array
{
    return json_decode(file_get_contents(__DIR__ . '/../../../.opencode/setup.json'), true);
}

it('has a setup.json with five tier model values', function () {
    $setup = setup_json();

    Assert::assertArrayHasKey('models', $setup, 'setup.json must have a models section');
    Assert::assertIsArray($setup['models'], 'setup.json models must be an object');

    $tiers = ['primary', 'planner', 'design', 'judge', 'utility'];
    foreach ($tiers as $tier) {
        Assert::assertArrayHasKey($tier, $setup['models'], "setup.json models must define '{$tier}'");
        Assert::assertIsString($setup['models'][$tier], "setup.json models.{$tier} must be a string");
        Assert::assertNotEmpty($setup['models'][$tier], "setup.json models.{$tier} must not be empty");
    }
});

it('has an envrc file that reads setup.json via jq', function () {
    $path = __DIR__ . '/../../../.envrc';
    Assert::assertFileExists($path, '.envrc must exist in project root');

    $content = file_get_contents($path);
    Assert::assertStringContainsString('setup.json', $content);
});

it('uses env var substitution for all model fields in opencode.json', function () {
    $config = load_opencode_config();

    // Guard: config structure must be intact
    Assert::assertIsArray($config, 'opencode.jsonc must parse as valid JSON');
    Assert::assertArrayHasKey('model', $config, 'opencode.jsonc must have top-level model key');
    Assert::assertArrayHasKey('agent', $config, 'opencode.jsonc must have agent key');

    // Top-level model must use {env:VAR}
    Assert::assertIsString($config['model']);
    Assert::assertStringContainsString(
        '{env:OPENCODE_MODEL_',
        $config['model'],
        'Top-level model must use {env:VAR} substitution',
    );

    // Every agent with a model field must use {env:VAR}
    Assert::assertIsArray($config['agent']);
    foreach ($config['agent'] as $name => $agent) {
        if (isset($agent['model'])) {
            Assert::assertIsString($agent['model']);
            Assert::assertStringContainsString(
                '{env:OPENCODE_MODEL_',
                $agent['model'],
                "Agent '{$name}' model must use {env:VAR} substitution",
            );
        }
    }
});

it('has no bare provider/model-id patterns in opencode.json or agent md files', function () {
    $paths = [
        opencode_config_path(),
    ];

    // Agent .md files
    $agentFiles = glob(__DIR__ . '/../../../.opencode/agents/*.md');
    $paths = array_merge($paths, $agentFiles);

    // Matches provider/model-name patterns NOT wrapped in {env:...}
    $pattern = '/"model"\s*:\s*"(?!\{env:)\w+\/\S+"/';

    foreach ($paths as $path) {
        $content = file_get_contents($path);
        $basename = basename($path);

        Assert::assertDoesNotMatchRegularExpression(
            $pattern,
            $content,
            "File '{$basename}' must not contain bare model IDs outside {env:VAR} substitution",
        );
    }
});

it('does not use dollar-prefixed env var syntax anywhere', function () {
    $paths = [
        opencode_config_path(),
    ];

    $agentFiles = glob(__DIR__ . '/../../../.opencode/agents/*.md');
    $paths = array_merge($paths, $agentFiles);

    foreach ($paths as $path) {
        $content = file_get_contents($path);
        $basename = basename($path);

        Assert::assertStringNotContainsString(
            '${env:',
            $content,
            "File '{$basename}' must not use \${env:} syntax (openCode uses {env:}, no \$ prefix)",
        );
    }
});

it('uses env var substitution for model in all agent md files', function () {
    $agentDir = __DIR__ . '/../../../.opencode/agents';
    $files = glob($agentDir . '/*.md');

    Assert::assertNotEmpty($files, 'Agent .md files must exist');

    foreach ($files as $file) {
        $content = file_get_contents($file);
        $basename = basename($file);

        // Extract frontmatter
        if (!preg_match('/^---\n(.*?)\n---/s', $content, $matches)) {
            continue;
        }
        $frontmatter = $matches[1];

        // If model: is present, it must use {env:VAR} (handle leading whitespace)
        if (preg_match('/^\s*model:\s*(.+)$/m', $frontmatter, $modelMatch)) {
            $modelValue = trim($modelMatch[1]);
            Assert::assertStringContainsString(
                '{env:OPENCODE_MODEL_',
                $modelValue,
                "Agent '{$basename}' model frontmatter must use {env:VAR} substitution",
            );
        }
    }
});

it('agent md files do not define model or variant in frontmatter', function () {
    $agentDir = __DIR__ . '/../../../.opencode/agents';
    $files = glob($agentDir . '/*.md');

    Assert::assertNotEmpty($files, 'Agent .md files must exist');

    foreach ($files as $file) {
        $content = file_get_contents($file);
        $basename = basename($file);

        // Extract frontmatter
        if (!preg_match('/^---\n(.*?)\n---/s', $content, $matches)) {
            continue;
        }
        $frontmatter = $matches[1];

        Assert::assertDoesNotMatchRegularExpression(
            '/^model:/m',
            $frontmatter,
            "Agent '{$basename}' frontmatter must not define model (model lives in opencode.jsonc agent section — ADR-0022)",
        );
        Assert::assertDoesNotMatchRegularExpression(
            '/^variant:/m',
            $frontmatter,
            "Agent '{$basename}' frontmatter must not define variant (variant lives in opencode.jsonc agent section — ADR-0022)",
        );
    }
});

it('has consistent model keys between setup.json and opencode.json', function () {
    $setup = setup_json();
    $config = file_get_contents(opencode_config_path());

    $modelKeys = ['primary', 'planner', 'design', 'judge', 'utility'];

    foreach ($modelKeys as $key) {
        Assert::assertArrayHasKey($key, $setup['models'], "setup.json models must define '{$key}'");
        $varName = 'OPENCODE_MODEL_' . strtoupper($key);
        Assert::assertStringContainsString($varName, $config, "opencode.jsonc must reference {$varName}");
    }
});

it('uses env var substitution for variant, keeps temperature as literal', function () {
    // opencode.jsonc agent block
    $config = load_opencode_config();

    Assert::assertIsArray($config['agent']);
    foreach ($config['agent'] as $name => $agent) {
        // variant MUST use {env:VAR} substitution
        if (isset($agent['variant'])) {
            Assert::assertStringContainsString(
                '{env:',
                (string) $agent['variant'],
                "Agent '{$name}' variant must use {env:VAR} substitution",
            );
        }
        // temperature must NOT use {env:VAR} — stays literal
        if (isset($agent['temperature'])) {
            Assert::assertStringNotContainsString(
                '{env:',
                (string) $agent['temperature'],
                "Agent '{$name}' temperature must be a literal, not {env:VAR}",
            );
        }
    }

    // Agent .md files
    $agentFiles = glob(__DIR__ . '/../../../.opencode/agents/*.md');
    foreach ($agentFiles as $file) {
        $content = file_get_contents($file);
        $basename = basename($file);

        if (!preg_match('/^---\n(.*?)\n---/s', $content, $matches)) {
            continue;
        }
        $frontmatter = $matches[1];

        // variant MUST use {env:VAR} substitution
        if (preg_match('/^\s*variant:\s*(.+)$/m', $frontmatter, $m)) {
            $value = trim($m[1]);
            Assert::assertStringContainsString(
                '{env:',
                $value,
                "Agent '{$basename}' variant must use {env:VAR} substitution",
            );
        }
        // temperature must NOT use {env:VAR} — stays literal
        if (preg_match('/^\s*temperature:\s*(.+)$/m', $frontmatter, $m)) {
            $value = trim($m[1]);
            Assert::assertStringNotContainsString(
                '{env:',
                $value,
                "Agent '{$basename}' temperature must be a literal, not {env:VAR}",
            );
        }
    }
});

it('has all required model and variant keys in setup.json', function () {
    $setup = setup_json();
    $expectedKeys = ['primary', 'planner', 'design', 'judge', 'utility'];
    foreach ($expectedKeys as $key) {
        Assert::assertArrayHasKey($key, $setup['models'], "setup.json models must have key '{$key}'");
        Assert::assertArrayHasKey($key, $setup['variants'], "setup.json variants must have key '{$key}'");
    }
});

it('has correct default variant values', function () {
    $setup = setup_json();
    expect($setup['variants']['primary'])->toBe('max');
    expect($setup['variants']['planner'])->toBe('high');
    expect($setup['variants']['design'])->toBe('high');
    expect($setup['variants']['judge'])->toBe('medium');
    expect($setup['variants']['utility'])->toBe('medium');
});

it('has OPENCODE_MODEL_JUDGE with correct default in setup.json', function () {
    $setup = setup_json();
    expect($setup['models']['judge'])->toBe('openrouter/z-ai/glm-5.2');
});

it('uses {env:VAR} for variant in all opencode.json agents', function () {
    $json = load_opencode_config();
    foreach ($json['agent'] as $name => $agent) {
        if (isset($agent['variant'])) {
            expect($agent['variant'])->toStartWith('{env:OPENCODE_VARIANT_');
        }
    }
});

it('judge agent uses OPENCODE_MODEL_JUDGE not PLANNER', function () {
    $json = load_opencode_config();
    expect($json['agent']['judge']['model'])->toBe('{env:OPENCODE_MODEL_JUDGE}');
});

it('judge agent has a description', function () {
    $json = load_opencode_config();
    expect($json['agent']['judge']['description'])
        ->toBeString()
        ->not->toBeEmpty();
});

it('judge agent is a primary agent (eval runner needs --agent CLI access)', function () {
    $json = load_opencode_config();
    expect($json['agent']['judge']['mode'])->toBe('primary');
    // hidden must NOT be set — subagent-only; primary agents ignore it but
    // its presence would be misleading
    expect(array_key_exists('hidden', $json['agent']['judge']))->toBeFalse();
});

it('design agent exists with the DESIGN-tier contract (ADR-0030)', function () {
    $json = load_opencode_config();
    Assert::assertArrayHasKey('design', $json['agent'], 'opencode.jsonc must define a design agent');

    $design = $json['agent']['design'];
    expect($design['mode'])->toBe('primary', 'design agent must be primary (TUI tab)');
    expect($design['model'])->toBe('{env:OPENCODE_MODEL_DESIGN}', 'design agent must use DESIGN tier model');
    expect($design['variant'])->toBe('{env:OPENCODE_VARIANT_DESIGN}', 'design agent must use DESIGN tier variant');
    expect($design['temperature'])->toBe(0.3, 'design agent temperature must be 0.3 (creative exploration per ADR-0030)');

    // Permission block mirrors build (self-contained workspace) — see ADR-0030.
    expect($design['permission']['bash']['*'])->toBe('allow', 'design agent bash must be allow (exploration + spec writing + new-branch.sh)');
    expect($design['permission']['bash']['git add*'])->toBe('ask', 'design agent git add must be ask-gated');
    expect($design['permission']['bash']['git commit*'])->toBe('ask', 'design agent git commit must be ask-gated');
    expect($design['permission']['bash']['git push*'])->toBe('deny', 'design agent git push must be denied (humans push)');
    expect($design['permission']['lsp'])->toBe('allow', 'design agent must allow LSP (navigate code semantically)');

    // Prompt must load the brainstorming skill (hybrid split, ADR-0030).
    Assert::assertStringContainsString('brainstorming', $design['prompt'], 'design agent prompt must reference the brainstorming skill');
});

it('every agent has an explicit temperature — no silent default inheritance', function () {
    // opencode.json agents
    $config = load_opencode_config();
    Assert::assertIsArray($config['agent'] ?? null, 'opencode.jsonc must define agents');
    foreach ($config['agent'] as $name => $agent) {
        Assert::assertArrayHasKey(
            'temperature',
            $agent,
            "Agent '{$name}' in opencode.jsonc must set an explicit temperature "
            . "(cannot use {env:VAR} — ADR-0013; must be a literal). "
            . 'See .opencode/docs/model-configuration.md §5.'
        );
        Assert::assertIsFloat(
            $agent['temperature'],
            "Agent '{$name}' temperature must be numeric (float)."
        );
    }

    // agent .md frontmatter
    $agentFiles = glob(__DIR__ . '/../../../.opencode/agents/*.md');
    Assert::assertNotEmpty($agentFiles, 'Agent .md files must exist');
    foreach ($agentFiles as $file) {
        $content = file_get_contents($file);
        $basename = basename($file);
        if (!preg_match('/^---\n(.*?)\n---/s', $content, $matches)) {
            continue;
        }
        $frontmatter = $matches[1];
        Assert::assertMatchesRegularExpression(
            '/^\s*temperature:\s*[\d.]+/m',
            $frontmatter,
            "Agent '{$basename}' frontmatter must set an explicit numeric temperature."
        );
    }
});









// vim: ft=php sts=4 sw=4 ts=4 et :
