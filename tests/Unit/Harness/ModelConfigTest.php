<?php

declare(strict_types=1);

# $KYAULabs: ModelConfigTest.php kyau@akira.kyaulabs 2026/07/10 -0700 Exp $













use PHPUnit\Framework\Assert;

it('has a models default env file with four tier model exports', function () {
    $path = __DIR__ . '/../../../.opencode/models.default.env';
    Assert::assertFileExists($path, '.opencode/models.default.env must exist');

    $content = file_get_contents($path);
    Assert::assertStringContainsString('export OPENCODE_MODEL_PRIMARY=', $content);
    Assert::assertStringContainsString('export OPENCODE_MODEL_PLANNER=', $content);
    Assert::assertStringContainsString('export OPENCODE_MODEL_JUDGE=', $content);
    Assert::assertStringContainsString('export OPENCODE_MODEL_UTILITY=', $content);
});

it('has an envrc file that sources the defaults', function () {
    $path = __DIR__ . '/../../../.envrc';
    Assert::assertFileExists($path, '.envrc must exist in project root');

    $content = file_get_contents($path);
    Assert::assertStringContainsString('models.default.env', $content);
});

it('uses env var substitution for all model fields in opencode.json', function () {
    $path = __DIR__ . '/../../../opencode.json';
    $content = file_get_contents($path);
    $config = json_decode($content, true);

    // Guard: config structure must be intact
    Assert::assertIsArray($config, 'opencode.json must parse as valid JSON');
    Assert::assertArrayHasKey('model', $config, 'opencode.json must have top-level model key');
    Assert::assertArrayHasKey('agent', $config, 'opencode.json must have agent key');

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
        __DIR__ . '/../../../opencode.json',
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
        __DIR__ . '/../../../opencode.json',
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

it('has consistent env var names between defaults and config', function () {
    $defaultsPath = __DIR__ . '/../../../.opencode/models.default.env';
    $configPath = __DIR__ . '/../../../opencode.json';

    $defaults = file_get_contents($defaultsPath);
    $config = file_get_contents($configPath);

    $expectedVars = ['OPENCODE_MODEL_PRIMARY', 'OPENCODE_MODEL_PLANNER', 'OPENCODE_MODEL_UTILITY'];

    foreach ($expectedVars as $var) {
        Assert::assertStringContainsString($var, $defaults, "Default env file must define {$var}");
        Assert::assertStringContainsString($var, $config, "opencode.json must reference {$var}");
    }
});

it('uses env var substitution for variant, keeps temperature as literal', function () {
    // opencode.json agent block
    $configPath = __DIR__ . '/../../../opencode.json';
    $config = json_decode(file_get_contents($configPath), true);

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

it('has all required env var exports in models.default.env', function () {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/models.default.env');
    $expectedVars = [
        'OPENCODE_MODEL_PRIMARY', 'OPENCODE_MODEL_PLANNER', 'OPENCODE_MODEL_JUDGE', 'OPENCODE_MODEL_UTILITY',
        'OPENCODE_VARIANT_PRIMARY', 'OPENCODE_VARIANT_PLANNER', 'OPENCODE_VARIANT_JUDGE', 'OPENCODE_VARIANT_UTILITY',
    ];
    foreach ($expectedVars as $var) {
        expect($content)->toContain("export {$var}=");
    }
});

it('has correct default variant values', function () {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/models.default.env');
    expect($content)
        ->toContain("export OPENCODE_VARIANT_PRIMARY='max'")
        ->and($content)->toContain("export OPENCODE_VARIANT_PLANNER='high'")
        ->and($content)->toContain("export OPENCODE_VARIANT_JUDGE='medium'")
        ->and($content)->toContain("export OPENCODE_VARIANT_UTILITY='medium'");
});

it('has OPENCODE_MODEL_JUDGE with correct default', function () {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/models.default.env');
    expect($content)->toContain("export OPENCODE_MODEL_JUDGE='openrouter/z-ai/glm-5.2'");
});

it('uses {env:VAR} for variant in all opencode.json agents', function () {
    $json = json_decode(file_get_contents(__DIR__ . '/../../../opencode.json'), true);
    foreach ($json['agent'] as $name => $agent) {
        if (isset($agent['variant'])) {
            expect($agent['variant'])->toStartWith('{env:OPENCODE_VARIANT_');
        }
    }
});

it('judge agent uses OPENCODE_MODEL_JUDGE not PLANNER', function () {
    $json = json_decode(file_get_contents(__DIR__ . '/../../../opencode.json'), true);
    expect($json['agent']['judge']['model'])->toBe('{env:OPENCODE_MODEL_JUDGE}');
});

it('every agent has an explicit temperature — no silent default inheritance', function () {
    // opencode.json agents
    $config = json_decode(file_get_contents(__DIR__ . '/../../../opencode.json'), true);
    Assert::assertIsArray($config['agent'] ?? null, 'opencode.json must define agents');
    foreach ($config['agent'] as $name => $agent) {
        Assert::assertArrayHasKey(
            'temperature',
            $agent,
            "Agent '{$name}' in opencode.json must set an explicit temperature "
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
