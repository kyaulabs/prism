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

    // Top-level model must use {env:VAR}
    Assert::assertStringContainsString(
        '{env:OPENCODE_MODEL_',
        $config['model'],
        'Top-level model must use {env:VAR} substitution'
    );

    // Every agent with a model field must use {env:VAR}
    foreach ($config['agent'] as $name => $agent) {
        if (isset($agent['model'])) {
            Assert::assertStringContainsString(
                '{env:OPENCODE_MODEL_',
                $agent['model'],
                "Agent '{$name}' model must use {env:VAR} substitution"
            );
        }
    }
});

it('has no hard-coded model IDs in opencode.json', function () {
    $path = __DIR__ . '/../../../opencode.json';
    $content = file_get_contents($path);

    $hardcodedPatterns = [
        'deepseek/deepseek-v4-pro',
        'deepseek/deepseek-v4-flash',
        'openrouter/z-ai/glm-5.2',
    ];

    foreach ($hardcodedPatterns as $pattern) {
        Assert::assertStringNotContainsString(
            $pattern,
            $content,
            "opencode.json must not contain hard-coded model ID: {$pattern}"
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

        // If model: is present, it must use {env:VAR}
        if (preg_match('/^model:\s*(.+)$/m', $frontmatter, $modelMatch)) {
            $modelValue = trim($modelMatch[1]);
            Assert::assertStringContainsString(
                '{env:OPENCODE_MODEL_',
                $modelValue,
                "Agent '{$basename}' model frontmatter must use {env:VAR} substitution"
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

// vim: ft=php sts=4 sw=4 ts=4 et :
