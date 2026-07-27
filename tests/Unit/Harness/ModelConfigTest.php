<?php

declare(strict_types=1);

# $KYAULabs: ModelConfigTest.php kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $




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

/**
 * Compute the canonical set of agents granted `lsp: allow`, combining inline
 * primary agents (opencode.jsonc) and subagent frontmatter (.opencode/agents).
 *
 * @return list<string>
 */
function lsp_enabled_agents(): array
{
    $agents = [];

    foreach (load_opencode_config()['agent'] as $name => $def) {
        if ((($def['permission'] ?? [])['lsp'] ?? null) === 'allow') {
            $agents[] = $name;
        }
    }

    $agentFiles = glob(__DIR__ . '/../../../.opencode/agents/*.md');
    foreach (is_array($agentFiles) ? $agentFiles : [] as $file) {
        $frontmatter = file_get_contents($file);
        if (preg_match('/^\s*lsp:\s*allow/m', $frontmatter)) {
            $agents[] = basename($file, '.md');
        }
    }

    return array_values(array_unique($agents));
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
    expect($setup['variants']['planner'])->toBe('xhigh');
    expect($setup['variants']['design'])->toBe('xhigh');
    expect($setup['variants']['judge'])->toBe('medium');
    expect($setup['variants']['utility'])->toBe('medium');
});

it('has OPENCODE_MODEL_JUDGE with correct default in setup.json', function () {
    $setup = setup_json();
    expect($setup['models']['judge'])->toBe('deepseek/deepseek-v4-pro');
});

it('has planner and design defaulting to GPT-5.6 Sol', function () {
    $setup = setup_json();
    expect($setup['models']['planner'])->toBe('openai/gpt-5.6-sol');
    expect($setup['models']['design'])->toBe('openai/gpt-5.6-sol');
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

it('judge agent is primary but hidden from TUI — eval-only; eval runner invokes by name', function () {
    $json = load_opencode_config();
    expect($json['agent']['judge']['mode'])->toBe('primary');
    expect($json['agent']['judge']['hidden'] ?? false)->toBeTrue('judge must be hidden from TUI (eval-only per ADR-0030)');
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

it('architect and consult use PLANNER tier', function () {
    $json = load_opencode_config();
    expect($json['agent']['architect']['model'])->toBe('{env:OPENCODE_MODEL_PLANNER}');
    expect($json['agent']['architect']['variant'])->toBe('{env:OPENCODE_VARIANT_PLANNER}');
    expect($json['agent']['consult']['model'])->toBe('{env:OPENCODE_MODEL_PLANNER}');
    expect($json['agent']['consult']['variant'])->toBe('{env:OPENCODE_VARIANT_PLANNER}');
});

it('explore code-review standards-review spec-review test-audit use JUDGE tier', function () {
    $json = load_opencode_config();
    foreach (['explore', 'code-review', 'standards-review', 'spec-review', 'test-audit'] as $agent) {
        expect($json['agent'][$agent]['model'])->toBe('{env:OPENCODE_MODEL_JUDGE}', "Agent '{$agent}' must use JUDGE tier model");
        expect($json['agent'][$agent]['variant'])->toBe('{env:OPENCODE_VARIANT_JUDGE}', "Agent '{$agent}' must use JUDGE tier variant");
    }
});

it('general stays on PRIMARY tier', function () {
    $json = load_opencode_config();
    expect($json['agent']['general']['model'])->toBe('{env:OPENCODE_MODEL_PRIMARY}');
    expect($json['agent']['general']['variant'])->toBe('{env:OPENCODE_VARIANT_PRIMARY}');
});

it('from-issue stays on PLANNER tier', function () {
    $json = load_opencode_config();
    expect($json['agent']['from-issue']['model'])->toBe('{env:OPENCODE_MODEL_PLANNER}');
    expect($json['agent']['from-issue']['variant'])->toBe('{env:OPENCODE_VARIANT_PLANNER}');
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

it('AGENTS.md LSP opt-in count and membership match agents granted lsp allow', function (): void {
    $enabled = lsp_enabled_agents();
    sort($enabled);

    // After granting explore lsp:allow, eight agents carry the tool.
    expect($enabled)->toHaveCount(8);
    expect($enabled)->toBe([
        'build', 'chat', 'debug', 'design', 'docs-writer',
        'explore', 'general', 'tdd',
    ]);

    $agentsMd = file_get_contents(__DIR__ . '/../../../AGENTS.md');

    // Stale counts must be gone.
    Assert::assertStringNotContainsString('six agents', $agentsMd);
    Assert::assertStringNotContainsString('Seven agents', $agentsMd);
    // Current count is stated.
    Assert::assertStringContainsString('Eight agents', $agentsMd);
    // Every enabled agent is named in the LSP sentence.
    foreach (['build', 'design', 'explore', 'general', 'chat', '@tdd', '@debug', '@docs-writer'] as $name) {
        Assert::assertStringContainsString(
            $name,
            $agentsMd,
            "AGENTS.md LSP section must name '{$name}' among the opt-in agents",
        );
    }
});

it('README and CODING_HARNESS tier tables match setup.json defaults', function (): void {
    $setup = setup_json();

    foreach (['README.md', 'CODING_HARNESS.md'] as $doc) {
        $text = file_get_contents(__DIR__ . '/../../../' . $doc);

        // Each tier's shipped default model must appear in the table.
        foreach (['primary', 'planner', 'design', 'judge', 'utility'] as $tier) {
            Assert::assertStringContainsString(
                $setup['models'][$tier],
                $text,
                "{$doc} must list the setup.json default model for the '{$tier}' tier",
            );
        }

        // The stale OpenRouter provider prefix must be gone (drifted form was
        // openrouter/z-ai/glm-5.2; shipped default is zai-coding-plan/glm-5.2).
        Assert::assertStringNotContainsString(
            'openrouter/z-ai/glm-5.2',
            $text,
            "{$doc} must not use the stale openrouter/z-ai provider prefix",
        );
    }
});

it('README install verify comment matches the shipped Primary default', function (): void {
    $setup = setup_json();
    $readme = file_get_contents(__DIR__ . '/../../../README.md');

    Assert::assertMatchesRegularExpression(
        '/verify:\s*' . preg_quote($setup['models']['primary'], '/') . '/',
        $readme,
        'README verify comment must echo the actual Primary default',
    );
});

it('CODING_HARNESS variant column reflects xhigh for planner and design', function (): void {
    $harness = file_get_contents(__DIR__ . '/../../../CODING_HARNESS.md');

    // Planner and Design are now `xhigh` (ADR-0040); the variant column must
    // show it. (Substring trap: `xhigh` contains `high`, so match the full
    // backtick-delimited token, not a bare contains('high').)
    Assert::assertStringContainsString('`xhigh`', $harness);
});


// vim: ft=php sts=4 sw=4 ts=4 et :
