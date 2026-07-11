<?php

declare(strict_types=1);

# $KYAULabs: ModelConfigTest.php kyau@akira.kyaulabs 2026/07/10 -0700 Exp $




use PHPUnit\Framework\Assert;

it('has a models default env file with three tier exports', function () {
    $path = __DIR__ . '/../../../.opencode/models.default.env';
    Assert::assertFileExists($path, '.opencode/models.default.env must exist');

    $content = file_get_contents($path);
    Assert::assertStringContainsString('export OPENCODE_MODEL_PRIMARY=', $content);
    Assert::assertStringContainsString('export OPENCODE_MODEL_PLANNER=', $content);
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

it('keeps variant and temperature as literals, not env var references', function () {
    // opencode.json agent block
    $configPath = __DIR__ . '/../../../opencode.json';
    $config = json_decode(file_get_contents($configPath), true);

    Assert::assertIsArray($config['agent']);
    foreach ($config['agent'] as $name => $agent) {
        foreach (['variant', 'temperature'] as $field) {
            if (isset($agent[$field])) {
                Assert::assertStringNotContainsString(
                    '{env:',
                    (string) $agent[$field],
                    "Agent '{$name}' {$field} must be a literal, not {env:VAR}",
                );
            }
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

        foreach (['variant', 'temperature'] as $field) {
            if (preg_match('/^\s*' . $field . ':\s*(.+)$/m', $frontmatter, $m)) {
                $value = trim($m[1]);
                Assert::assertStringNotContainsString(
                    '{env:',
                    $value,
                    "Agent '{$basename}' {$field} must be a literal, not {env:VAR}",
                );
            }
        }
    }
});

// vim: ft=php sts=4 sw=4 ts=4 et :
