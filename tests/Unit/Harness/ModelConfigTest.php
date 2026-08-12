<?php

declare(strict_types=1);

# $KYAULabs: ModelConfigTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $













use KYAULabs\Prism\PrismJsoncDocument;
use PHPUnit\Framework\Assert;

require_once dirname(__DIR__, 3) . '/.github/scripts/PrismJsoncDocument.php';

/**
 * Load and return the project prism.jsonc manifest (v6 schema) as an
 * associative array via the production JSONC reader.
 *
 * @return array<string, mixed>
 */
function prism_manifest(): array
{
    $root = PrismJsoncDocument::fromFile(dirname(__DIR__, 3) . '/prism.jsonc')->root();

    return json_decode(json_encode($root), true);
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

it('has a prism.jsonc manifest at the v6 schema version', function () {
    $manifest = prism_manifest();

    expect($manifest['setup_version'])->toBe(6);
});

it('has a prism.jsonc manifest with six tier model values', function () {
    $setup = prism_manifest();

    Assert::assertArrayHasKey('models', $setup, 'prism.jsonc must have a models section');
    Assert::assertIsArray($setup['models'], 'prism.jsonc models must be an object');

    $tiers = ['primary', 'planner', 'design', 'judge', 'utility', 'frontend'];
    foreach ($tiers as $tier) {
        Assert::assertArrayHasKey($tier, $setup['models'], "prism.jsonc models must define '{$tier}'");
        Assert::assertIsString($setup['models'][$tier], "prism.jsonc models.{$tier} must be a string");
        Assert::assertNotEmpty($setup['models'][$tier], "prism.jsonc models.{$tier} must not be empty");
    }
});

it('has an envrc file that loads prism.jsonc via the env0 CLI', function () {
    $path = __DIR__ . '/../../../.envrc';
    Assert::assertFileExists($path, '.envrc must exist in project root');

    $content = file_get_contents($path);
    Assert::assertStringContainsString('prism.jsonc', $content, '.envrc must reference the prism.jsonc manifest');
    Assert::assertStringContainsString('prism_manifest.php', $content, '.envrc must load the manifest via the prism_manifest CLI');
    Assert::assertStringContainsString('env0', $content, '.envrc must invoke the env0 subcommand');
    Assert::assertStringNotContainsString(' jq ', ' ' . $content . ' ', '.envrc must not read the manifest via jq');
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

it('has consistent model keys between prism.jsonc and opencode.json', function () {
    $setup = prism_manifest();
    $config = file_get_contents(opencode_config_path());

    $modelKeys = ['primary', 'planner', 'design', 'judge', 'utility', 'frontend'];

    foreach ($modelKeys as $key) {
        Assert::assertArrayHasKey($key, $setup['models'], "prism.jsonc models must define '{$key}'");
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

it('has all required model and variant keys in prism.jsonc', function () {
    $setup = prism_manifest();
    $expectedKeys = ['primary', 'planner', 'design', 'judge', 'utility', 'frontend'];
    foreach ($expectedKeys as $key) {
        Assert::assertArrayHasKey($key, $setup['models'], "prism.jsonc models must have key '{$key}'");
        Assert::assertArrayHasKey($key, $setup['variants'], "prism.jsonc variants must have key '{$key}'");
    }
});

it('has correct default variant values', function () {
    $setup = prism_manifest();
    expect($setup['variants']['primary'])->toBe('max');
    expect($setup['variants']['planner'])->toBe('xhigh');
    expect($setup['variants']['design'])->toBe('xhigh');
    expect($setup['variants']['judge'])->toBe('medium');
    expect($setup['variants']['utility'])->toBe('medium');
    expect($setup['variants']['frontend'])->toBe('xhigh');
});

it('has OPENCODE_MODEL_JUDGE with correct default in prism.jsonc', function () {
    $setup = prism_manifest();
    expect($setup['models']['judge'])->toBe('deepseek/deepseek-v4-pro');
});

it('has planner and design defaulting to GPT-5.6 Sol', function () {
    $setup = prism_manifest();
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

it('design prompt runs the classifier scope gate and preserves the ADR-0030 boundary (ADR-0050)', function () {
    $config = load_opencode_config();
    $designPrompt = $config['agent']['design']['prompt'];

    Assert::assertStringContainsString('classify-greenfield.sh', $designPrompt, 'design prompt must run the strict-greenfield classifier before grilling');
    Assert::assertStringContainsString('wayfinder', $designPrompt, 'design prompt must end the design cycle by loading wayfinder for established/indeterminate work');
    Assert::assertStringContainsString('walking-skeleton bootstrap', $designPrompt, 'design prompt must permit only the walking-skeleton bootstrap for greenfield');
    Assert::assertStringContainsString('Do NOT invoke `writing-plans`', $designPrompt, 'design prompt must preserve the no-writing-plans boundary (ADR-0030)');
    Assert::assertStringContainsString('Do NOT dispatch `@tdd`', $designPrompt, 'design prompt must preserve the no-@tdd boundary (ADR-0030)');
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

it('has frontend defaulting to GPT-5.6 Sol at xhigh on the FRONTEND tier', function () {
    $setup = prism_manifest();
    expect($setup['models']['frontend'])->toBe('openai/gpt-5.6-sol');
    expect($setup['variants']['frontend'])->toBe('xhigh');
});

it('configures the hidden frontend agent on the FRONTEND tier', function (): void {
    $config = load_opencode_config();
    $frontend = $config['agent']['frontend'];

    expect($config['subagent_depth'])->toBe(3)
        ->and($frontend['model'])->toBe('{env:OPENCODE_MODEL_FRONTEND}')
        ->and($frontend['variant'])->toBe('{env:OPENCODE_VARIANT_FRONTEND}')
        ->and($frontend['temperature'])->toBe(0.3)
        ->and($frontend['hidden'])->toBeTrue();
});

it('gates exactly two Design-owned and four frontend skills, re-enabling them only for their owners', function (): void {
    $frontendSkills = frontend_skill_names();
    expect($frontendSkills)->toBe([
        'frontend-design',
        'frontend-architecture',
        'scss-mobile-first',
        'accessibility',
    ]);

    $config = load_opencode_config();
    $designOwned = ['brainstorming', 'prototype'];
    $expected = array_merge(
        ['*' => 'allow'],
        array_fill_keys($designOwned, 'deny'),
        array_fill_keys($frontendSkills, 'deny'),
    );

    expect($config['permission']['skill'])->toBe($expected);
    expect($config['agent']['design']['permission']['skill'])->toBe([
        'brainstorming' => 'allow',
        'prototype' => 'allow',
    ]);

    $frontend = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/agents/frontend.md');
    foreach ($frontendSkills as $skill) {
        Assert::assertMatchesRegularExpression(
            '/^\s+' . preg_quote($skill, '/') . ':\s+allow$/m',
            $frontend,
        );
    }
    Assert::assertStringNotContainsString('aurora-page: allow', $frontend);
    Assert::assertStringNotContainsString('pest-browser: allow', $frontend);
});

it('limits tdd dispatch to frontend and makes frontend terminal', function (): void {
    // agent_contents() fails with a diagnostic when a file is missing; the
    // (string) cast on file_get_contents() would silently coerce to ''.
    $tdd = agent_contents('tdd');
    $frontend = agent_contents('frontend');

    Assert::assertMatchesRegularExpression('/task:\s+"\*": deny\s+"frontend": allow/s', $tdd);
    Assert::assertMatchesRegularExpression('/^\s+task:\s+deny$/m', $frontend);
    Assert::assertStringContainsString('standards checklist', $tdd);
    Assert::assertStringContainsString('failing test output', $tdd);
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

    // After granting frontend lsp:allow, nine agents carry the tool.
    expect($enabled)->toHaveCount(9);
    expect($enabled)->toBe([
        'build', 'chat', 'debug', 'design', 'docs-writer',
        'explore', 'frontend', 'general', 'tdd',
    ]);

    $agentsMd = file_get_contents(__DIR__ . '/../../../AGENTS.md');

    // Stale counts must be gone.
    Assert::assertStringNotContainsString('six agents', $agentsMd);
    Assert::assertStringNotContainsString('Seven agents', $agentsMd);
    Assert::assertStringNotContainsString('Eight agents', $agentsMd);
    // Current count is stated.
    Assert::assertStringContainsString('Nine agents', $agentsMd);
    // Every enabled agent is named in the LSP sentence.
    foreach (['build', 'design', 'explore', 'general', 'chat', '@tdd', '@debug', '@docs-writer', '@frontend'] as $name) {
        Assert::assertStringContainsString(
            $name,
            $agentsMd,
            "AGENTS.md LSP section must name '{$name}' among the opt-in agents",
        );
    }
});

it('AGENTS.md frontend roster allows focused checks but not test authorship', function (): void {
    $agentsMd = file_get_contents(__DIR__ . '/../../../AGENTS.md');

    preg_match('/^\| `@frontend` \|.*$/m', $agentsMd, $matches);
    Assert::assertCount(1, $matches, 'AGENTS.md must have exactly one @frontend roster row');
    $row = $matches[0];

    Assert::assertStringContainsString(
        'focused checks',
        $row,
        '@frontend roster must state it may run focused checks',
    );
    Assert::assertStringContainsString(
        'cannot author tests',
        $row,
        '@frontend roster must forbid test authorship',
    );
    Assert::assertStringNotContainsString(
        'cannot test',
        $row,
        '@frontend roster must not deny running focused checks',
    );
});

it('README and CODING_HARNESS tier tables match prism.jsonc defaults', function (): void {
    $setup = prism_manifest();

    foreach (['README.md', 'CODING_HARNESS.md'] as $doc) {
        $text = file_get_contents(__DIR__ . '/../../../' . $doc);

        // Each tier's shipped default model and model env var must appear in
        // the table; CODING_HARNESS additionally carries the variant env var
        // column so every tier's variant env var must appear there too.
        foreach (['primary', 'planner', 'design', 'judge', 'utility', 'frontend'] as $tier) {
            Assert::assertStringContainsString(
                $setup['models'][$tier],
                $text,
                "{$doc} must list the prism.jsonc default model for the '{$tier}' tier",
            );
            Assert::assertStringContainsString(
                'OPENCODE_MODEL_' . strtoupper($tier),
                $text,
                "{$doc} must list the model env var for the '{$tier}' tier",
            );
            if ($doc === 'CODING_HARNESS.md') {
                Assert::assertStringContainsString(
                    'OPENCODE_VARIANT_' . strtoupper($tier),
                    $text,
                    "{$doc} must list the variant env var for the '{$tier}' tier",
                );
            }
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

it('README FRONTEND row lists the model env var, Sol default, and frontend agent', function (): void {
    $readme = file_get_contents(__DIR__ . '/../../../README.md');

    // Anchor on the model env var so the Skills (on-demand) category row
    // ("| Frontend | frontend-design, ... |") cannot satisfy this test.
    preg_match('/^\| Frontend \| `OPENCODE_MODEL_FRONTEND` \|.*$/m', $readme, $matches);
    Assert::assertCount(1, $matches, 'README must have exactly one Frontend tier-table row');
    $row = $matches[0];

    Assert::assertStringContainsString('openai/gpt-5.6-sol', $row, 'README Frontend row must list the Sol default');
    Assert::assertStringContainsString('frontend', $row, 'README Frontend row must name the frontend agent');
});

it('README install verify comment matches the shipped Primary default', function (): void {
    $setup = prism_manifest();
    $readme = file_get_contents(__DIR__ . '/../../../README.md');

    Assert::assertMatchesRegularExpression(
        '/verify:\s*' . preg_quote($setup['models']['primary'], '/') . '/',
        $readme,
        'README verify comment must echo the actual Primary default',
    );
});

it('CODING_HARNESS variant column reflects xhigh for planner, design, and frontend', function (): void {
    $harness = file_get_contents(__DIR__ . '/../../../CODING_HARNESS.md');

    // Assert per tier row, not document-wide: a single `xhigh` (only one
    // tier updated, or the token appearing in unrelated prose) must not
    // satisfy this test. Planner, Design, and Frontend are `xhigh` per
    // ADR-0040 and ADR-0049. Match the full backtick-delimited token to
    // avoid the trap where `xhigh` contains the substring `high`.
    preg_match_all('/^\| Planner \|.*$/m', $harness, $planner);
    preg_match_all('/^\| Design \|.*$/m', $harness, $design);
    preg_match_all('/^\| Frontend \| `OPENCODE_MODEL_FRONTEND` \|.*$/m', $harness, $frontend);

    Assert::assertCount(1, $planner[0], 'CODING_HARNESS has exactly one Planner tier row');
    Assert::assertCount(1, $design[0], 'CODING_HARNESS has exactly one Design tier row');
    Assert::assertCount(1, $frontend[0], 'CODING_HARNESS has exactly one Frontend tier row');
    Assert::assertStringContainsString('`xhigh`', $planner[0][0], 'Planner variant column is `xhigh`');
    Assert::assertStringContainsString('`xhigh`', $design[0][0], 'Design variant column is `xhigh`');
    Assert::assertStringContainsString('`xhigh`', $frontend[0][0], 'Frontend variant column is `xhigh`');
});





// vim: ft=php sts=4 sw=4 ts=4 et :
