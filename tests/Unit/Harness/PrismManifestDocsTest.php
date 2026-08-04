<?php

declare(strict_types=1);

# $KYAULabs: PrismManifestDocsTest.php kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $










require_once dirname(__DIR__, 3) . '/.github/scripts/PrismJsoncDocument.php';
require_once dirname(__DIR__, 3) . '/.github/scripts/PrismManifest.php';

use KYAULabs\Prism\PrismJsoncDocument;
use KYAULabs\Prism\PrismManifest;
use PHPUnit\Framework\Assert;

/**
 * Load and return the project prism.jsonc manifest (v6 schema) as an
 * associative array via the production JSONC reader.
 *
 * @return array<string, mixed>
 */
function pmd_manifest(): array
{
    $root = PrismJsoncDocument::fromFile(dirname(__DIR__, 3) . '/prism.jsonc')->root();

    return json_decode(json_encode($root), true);
}

/**
 * Return absolute paths of every living documentation file.
 *
 * Living = checked-in, actively-maintained docs that participate in the
 * manifest contract. Historical ADRs, specs, and plans are excluded — they
 * capture decisions at a point in time and may name legacy paths.
 *
 * @return list<string>
 */
function living_doc_files(): array
{
    $repoRoot = dirname(__DIR__, 3);
    $files = [];

    // Living directories (filesystem walk, non-recursive for root, recursive
    // for scoped subdirs that are not historical).
    $livingDirs = [
        '.github',
        '.opencode',
        'docs/agents',
    ];

    foreach ($livingDirs as $dir) {
        $full = $repoRoot . '/' . $dir;
        if (!is_dir($full)) {
            continue;
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($full, RecursiveDirectoryIterator::SKIP_DOTS),
        );
        foreach ($iterator as $item) {
            if ($item->isFile() && $item->getExtension() === 'md') {
                $files[] = $item->getPathname();
            }
        }
    }

    // Root-level .md files
    foreach (glob($repoRoot . '/*.md') as $file) {
        $files[] = $file;
    }

    // opencode.jsonc (JSONC config, not .md — manually added)
    $files[] = $repoRoot . '/opencode.jsonc';

    // .envrc (shell, not .md — manually added for sourcing assertions)
    $envrc = $repoRoot . '/.envrc';
    if (file_exists($envrc)) {
        $files[] = $envrc;
    }

    sort($files);

    return $files;
}

/**
 * Return a human-readable short path relative to the repo root.
 *
 * @param  string $absolute Absolute path.
 * @return string
 */
function pmd_short_path(string $absolute): string
{
    return str_replace(dirname(__DIR__, 3) . '/', '', $absolute);
}

describe('Prism manifest — living documentation (ADR-0043 cutover)', function (): void {
    $manifest = pmd_manifest();

    it('names prism.jsonc in every living doc that references the project manifest', function (): void {
        $failing = [];
        foreach (living_doc_files() as $file) {
            $content = (string) file_get_contents($file);

            // Skip files that don't reference any config path at all.
            if (!str_contains($content, '.opencode/setup.json')
                && !str_contains($content, 'prism.jsonc')
                && !str_contains($content, 'setup.json')
                && !str_contains($content, 'setup_version')
            ) {
                continue;
            }

            if (!str_contains($content, 'prism.jsonc')) {
                $failing[] = pmd_short_path($file);
            }
        }

        Assert::assertEmpty(
            $failing,
            "These living docs reference config but do not name prism.jsonc:\n  - "
            . implode("\n  - ", $failing),
        );
    });

    it('contains no active project .opencode/setup.json path in living docs', function (): void {
        $failing = [];
        foreach (living_doc_files() as $file) {
            $content = (string) file_get_contents($file);
            $short = pmd_short_path($file);

            // .envrc and opencode.jsonc have their own dedicated assertions.
            if ($short === '.envrc' || $short === 'opencode.jsonc') {
                continue;
            }

            // CONTEXT.md is the domain glossary — it intentionally documents
            // the legacy entity as a term. The /setup command doc and the
            // setup scaffold test are the canonical places that may reference
            // the legacy path in a deprecation/migration context.
            $legacyOk = in_array($short, [
                'CONTEXT.md',
                '.opencode/commands/setup.md',
                'tests/Shell/setup_scaffold_test.sh',
            ], true);

            if (!$legacyOk && str_contains($content, '.opencode/setup.json')) {
                $failing[] = $short;
            }
        }

        Assert::assertEmpty(
            $failing,
            "These living docs still reference the legacy .opencode/setup.json project path:\n  - "
            . implode("\n  - ", $failing),
        );
    });

    it('contains no active ~/.config/opencode/setup.json user path in living docs', function (): void {
        $failing = [];
        foreach (living_doc_files() as $file) {
            $content = (string) file_get_contents($file);
            $short = pmd_short_path($file);

            // CONTEXT.md is the domain glossary — it intentionally documents
            // the legacy user path. AGENTS.md's Hard Boundaries section
            // references the legacy path in the narrow exception for /setup
            // during ADR-0043 migration. The /setup command is the canonical
            // place for the legacy user path in a migration context.
            $legacyOk = in_array($short, [
                'AGENTS.md',
                'CONTEXT.md',
                '.opencode/commands/setup.md',
            ], true);

            if (!$legacyOk && str_contains($content, '~/.config/opencode/setup.json')) {
                $failing[] = $short;
            }
        }

        Assert::assertEmpty(
            $failing,
            "These living docs still reference the legacy ~/.config/opencode/setup.json user path:\n  - "
            . implode("\n  - ", $failing),
        );
    });

    it('has model tier tables in model-configuration.md aligned with prism.jsonc', function () use ($manifest): void {
        $path = dirname(__DIR__, 3) . '/.opencode/docs/model-configuration.md';
        Assert::assertFileExists($path, 'model-configuration.md must exist');
        $content = (string) file_get_contents($path);

        foreach (['primary', 'planner', 'design', 'judge', 'utility', 'frontend'] as $tier) {
            Assert::assertStringContainsString(
                $manifest['models'][$tier],
                $content,
                "model-configuration.md must list the prism.jsonc default model for the '{$tier}' tier",
            );
            Assert::assertStringContainsString(
                'OPENCODE_MODEL_' . strtoupper($tier),
                $content,
                "model-configuration.md must list the model env var for the '{$tier}' tier",
            );
            Assert::assertStringContainsString(
                'OPENCODE_VARIANT_' . strtoupper($tier),
                $content,
                "model-configuration.md must list the variant env var for the '{$tier}' tier",
            );
        }
    });

    it('documents the six-tier vocabulary across living docs', function (): void {
        $agents = (string) file_get_contents(dirname(__DIR__, 3) . '/AGENTS.md');
        $readme = (string) file_get_contents(dirname(__DIR__, 3) . '/README.md');
        $codingHarness = (string) file_get_contents(dirname(__DIR__, 3) . '/CODING_HARNESS.md');
        $modelConfiguration = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/docs/model-configuration.md');

        $requirements = [
            [$agents, 'Six tiers', 'AGENTS.md must state six model/variant tiers'],
            [$agents, 'Nine agents', 'AGENTS.md must state nine LSP-enabled agents'],
            [$agents, 'restart OpenCode', 'AGENTS.md must require an OpenCode restart after config changes'],
            [$readme, 'Six tiers', 'README must state six model/variant tiers'],
            [$readme, 'OPENCODE_MODEL_FRONTEND', 'README tier table must list OPENCODE_MODEL_FRONTEND'],
            [$codingHarness, 'Six tiers', 'CODING_HARNESS must state six model/variant tiers'],
            [$codingHarness, 'OPENCODE_VARIANT_FRONTEND', 'CODING_HARNESS tier table must list OPENCODE_VARIANT_FRONTEND'],
            [$modelConfiguration, 'six-tier', 'model-configuration.md must describe a six-tier system'],
            [$modelConfiguration, 'OPENCODE_MODEL_FRONTEND', 'model-configuration.md must list OPENCODE_MODEL_FRONTEND'],
            [$modelConfiguration, 'OPENCODE_VARIANT_FRONTEND', 'model-configuration.md must list OPENCODE_VARIANT_FRONTEND'],
            [$modelConfiguration, 'weekly window', 'model-configuration.md must document the Sol rolling weekly window'],
            [$modelConfiguration, 'no automatic fallback', 'model-configuration.md must rule out automatic quota fallback'],
            [$modelConfiguration, '@tdd', 'model-configuration.md must document TDD-owned frontend use'],
        ];

        foreach ($requirements as [$content, $needle, $message]) {
            Assert::assertStringContainsString($needle, $content, $message);
        }
    });

    it('documents the FRONTEND literal temperature within the frontend tier section', function (): void {
        $modelConfiguration = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/docs/model-configuration.md');

        // Bound to the FRONTEND prose block: a bare '0.3' needle also matches
        // the shared temperature table and the DESIGN row, so it cannot catch
        // a Frontend-specific temperature drift on its own.
        $anchor = 'FRONTEND also runs';
        $sectionEnd = 'The **judge** agent';
        Assert::assertStringContainsString(
            $anchor,
            $modelConfiguration,
            'model-configuration.md must describe the FRONTEND OAuth backing',
        );
        Assert::assertStringContainsString(
            $sectionEnd,
            $modelConfiguration,
            'model-configuration.md must keep the FRONTEND prose block before the judge section',
        );
        $frontendRegion = substr(
            $modelConfiguration,
            (int) strpos($modelConfiguration, $anchor),
            (int) strpos($modelConfiguration, $sectionEnd) - (int) strpos($modelConfiguration, $anchor),
        );
        Assert::assertStringContainsString(
            '0.3',
            $frontendRegion,
            'model-configuration.md FRONTEND section must document the literal temperature 0.3',
        );
    });

    it('documents schema v6 and the frontend glossary terms in CONTEXT.md', function (): void {
        $context = (string) file_get_contents(dirname(__DIR__, 3) . '/CONTEXT.md');

        foreach ([
            'FRONTEND model tier',
            'frontend agent',
            'frontend implementation slice',
        ] as $term) {
            Assert::assertStringContainsString(
                $term,
                $context,
                "CONTEXT.md glossary must define '{$term}'",
            );
        }

        Assert::assertStringContainsString(
            'currently v6',
            $context,
            'CONTEXT.md Prism manifest entry must describe the v6 schema',
        );
        Assert::assertStringContainsString(
            '(6 tiers)',
            $context,
            'CONTEXT.md Prism manifest entity must describe six model/variant tiers',
        );
    });

    it('attributes the v6 schema to ADR-0049 and records ADR-0043 as its v5 source', function (): void {
        $context = (string) file_get_contents(dirname(__DIR__, 3) . '/CONTEXT.md');

        // ADR-0049 records the v6 advance; ADR-0043 established schema v5 and
        // its exact schema/five-tier clauses are partially superseded. The
        // glossary must not credit ADR-0043 with the current v6 schema.
        Assert::assertStringContainsString(
            'currently v6 per ADR-0049',
            $context,
            'CONTEXT.md Prism manifest entry must attribute the current v6 schema to ADR-0049',
        );
        Assert::assertStringNotContainsString(
            'v6 per ADR-0043',
            $context,
            'CONTEXT.md Prism manifest entry must not attribute the v6 schema to ADR-0043',
        );
        Assert::assertStringContainsString(
            'ADR-0043 established schema v5',
            $context,
            'CONTEXT.md Prism manifest entry must record ADR-0043 as the v5 source',
        );
        Assert::assertStringContainsString(
            'partially superseded',
            $context,
            'CONTEXT.md Prism manifest entry must state ADR-0043 is partially superseded',
        );
    });

    it('has model tier tables in AGENTS.md Model selection section aligned with prism.jsonc', function () use ($manifest): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/AGENTS.md');

        // AGENTS.md does not have a full six-tier table — it delegates to
        // model-configuration.md.  But it must not contain stale model IDs.
        Assert::assertStringNotContainsString(
            'openrouter/',
            $content,
            'AGENTS.md must not contain stale openrouter provider prefixes',
        );

        // The Model selection paragraph must reference prism.jsonc, not .opencode/setup.json
        Assert::assertStringContainsString(
            'prism.jsonc',
            $content,
            'AGENTS.md Model selection section must name the prism.jsonc manifest',
        );
    });

    it('has the envrc sourcing chain reference prism.jsonc, not setup.json', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/.envrc');

        Assert::assertStringContainsString('prism.jsonc', $content, '.envrc must reference prism.jsonc');
        Assert::assertStringNotContainsString('.opencode/setup.json', $content, '.envrc must not reference .opencode/setup.json');
        Assert::assertStringNotContainsString(' jq ', ' ' . $content . ' ', '.envrc must not invoke jq for manifest parsing');
    });

    it('has the opencode.jsonc MCP section describe OPENCODE_CONFIG_CONTENT composition', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/opencode.jsonc');

        // The tracked MCP definitions are permanently disabled; enablement is
        // composed from the resolved Prism manifest into OPENCODE_CONFIG_CONTENT.
        Assert::assertStringContainsString(
            'OPENCODE_CONFIG_CONTENT',
            $content,
            'opencode.jsonc MCP section must describe OPENCODE_CONFIG_CONTENT composition',
        );
        Assert::assertStringNotContainsString(
            '~/.config/opencode/setup.json',
            $content,
            'opencode.jsonc must not reference the legacy user setup.json path',
        );
    });

    it('documents experimental flags sourced from prism.jsonc in AGENTS.md', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/AGENTS.md');

        Assert::assertStringNotContainsString(
            '.opencode/setup.json',
            $content,
            'AGENTS.md must not reference .opencode/setup.json for experimental flag sourcing',
        );

        Assert::assertStringContainsString(
            'prism.jsonc',
            $content,
            'AGENTS.md must reference prism.jsonc for experimental flag sourcing',
        );
    });

    it('records the manifest-driven integration boundary in ADR-0045', function (): void {
        $root = dirname(__DIR__, 3);
        $path = $root . '/adr/0045-manifest-driven-mcp-plugin-toggles.md';

        Assert::assertFileExists($path);
        $adr = (string) file_get_contents($path);
        $context = (string) file_get_contents($root . '/CONTEXT.md');

        foreach ([
            '## Status',
            'Accepted',
            'OPENCODE_CONFIG_CONTENT',
            'setup_version',
            'deepseek_websearch',
            'searxng',
            'opencode_quota',
            'ADR-0032',
            'ADR-0043',
            'ADR-0040',
        ] as $required) {
            Assert::assertStringContainsString($required, $adr);
        }

        Assert::assertStringContainsString(
            'adr/0045-manifest-driven-mcp-plugin-toggles.md',
            $context,
        );
    });

    it('records the FRONTEND tier and TDD-owned agent boundary in ADR-0049', function (): void {
        $root = dirname(__DIR__, 3);
        $path = $root . '/adr/0049-frontend-model-tier-and-tdd-owned-agent.md';

        Assert::assertFileExists($path);

        $adr = (string) file_get_contents($path);
        foreach ([
            '# 0049.',
            'FRONTEND',
            'setup_version 6',
            'openai/gpt-5.6-sol',
            'xhigh',
            'subagent_depth',
            'permission.skill',
            'build → @tdd → @frontend',
            'Implemented-by:',
            '/build-assets',
            'ADR-0043',
            'weekly window',
        ] as $required) {
            Assert::assertStringContainsString($required, $adr);
        }

        foreach (frontend_skill_names() as $skill) {
            Assert::assertStringContainsString($skill, $adr);
        }

        $context = (string) file_get_contents($root . '/CONTEXT.md');
        Assert::assertMatchesRegularExpression('/## Status\s+Accepted/s', $adr);
        Assert::assertStringContainsString(
            'adr/0049-frontend-model-tier-and-tdd-owned-agent.md',
            $context,
        );
    });

    it('keeps bootstrap shell seeds aligned with the schema constant', function (): void {
        $root = dirname(__DIR__, 3);
        $needle = '"setup_version": ' . PrismManifest::SCHEMA_VERSION;

        foreach ([
            '.github/scripts/setup-write-project-config.sh',
            '.github/scripts/setup-write-user-config.sh',
        ] as $file) {
            Assert::assertStringContainsString($needle, (string) file_get_contents($root . '/' . $file));
        }

        Assert::assertStringNotContainsString(
            'setup_version === 5',
            (string) file_get_contents($root . '/.github/scripts/setup-scaffold.sh'),
        );
    });

    it('keeps optional integrations statically off in tracked OpenCode config', function (): void {
        $config = PrismJsoncDocument::fromFile(dirname(__DIR__, 3) . '/opencode.jsonc')->root();

        Assert::assertFalse(property_exists($config, 'plugin'));
        Assert::assertFalse($config->mcp->{'deepseek-websearch'}->enabled);
        Assert::assertFalse($config->mcp->searxng->enabled);
        Assert::assertSame(
            ['npx', '-y', '@kyaulabs/deepseek-websearch@1.0.4'],
            $config->mcp->{'deepseek-websearch'}->command,
        );
        Assert::assertSame(
            ['npx', '-y', 'mcp-searxng@1.12.0'],
            $config->mcp->searxng->command,
        );
    });

    it('has a quota plugin glossary row in CONTEXT.md', function (): void {
        $context = (string) file_get_contents(dirname(__DIR__, 3) . '/CONTEXT.md');

        Assert::assertStringContainsString(
            'quota plugin',
            $context,
            'CONTEXT.md must define a quota plugin glossary entry',
        );
    });

    it('names mcp.* and plugins.* in the Prism manifest glossary row', function (): void {
        $context = (string) file_get_contents(dirname(__DIR__, 3) . '/CONTEXT.md');

        Assert::assertStringContainsString(
            'mcp.*',
            $context,
            'CONTEXT.md Prism manifest entry must name mcp.* preference keys',
        );
        Assert::assertStringContainsString(
            'plugins.*',
            $context,
            'CONTEXT.md Prism manifest entry must name plugins.* preference keys',
        );
    });

    it('names permanent disabled definitions and OPENCODE_CONFIG_CONTENT in MCP server glossary row', function (): void {
        $context = (string) file_get_contents(dirname(__DIR__, 3) . '/CONTEXT.md');

        Assert::assertStringContainsString(
            'permanent',
            $context,
            'CONTEXT.md MCP server entry must describe permanent disabled definitions',
        );
        Assert::assertStringContainsString(
            'OPENCODE_CONFIG_CONTENT',
            $context,
            'CONTEXT.md MCP server entry must reference OPENCODE_CONFIG_CONTENT composition',
        );
    });

    it('names manifest-driven enablement in mcp.md', function (): void {
        $mcpDoc = (string) file_get_contents(dirname(__DIR__, 3) . '/.opencode/docs/mcp.md');

        foreach ([
            '/setup',
            'direnv allow',
            'restart',
            'prerequisite',
            'requested',
            'active',
            'quota',
        ] as $required) {
            Assert::assertStringContainsString(
                $required,
                $mcpDoc,
                "mcp.md must describe {$required}",
            );
        }
    });

    it('has no living doc instructing users to uncomment an MCP block', function (): void {
        $failing = [];
        foreach (living_doc_files() as $file) {
            $content = (string) file_get_contents($file);
            if (preg_match('/uncomment.*(?:MCP|block)/i', $content)
                || preg_match('/commented[- ]out.*MCP/i', $content)
            ) {
                $failing[] = pmd_short_path($file);
            }
        }

        Assert::assertEmpty(
            $failing,
            "These living docs still instruct users to uncomment MCP blocks:\n  - "
            . implode("\n  - ", $failing),
        );
    });

    it('names ADR-0045 in AGENTS.md MCP section', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/AGENTS.md');

        Assert::assertStringContainsString(
            'ADR-0045',
            $content,
            'AGENTS.md must reference ADR-0045 for manifest-driven MCP/plugin toggles',
        );
    });

    it('names ADR-0045 in CODING_HARNESS.md', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/CODING_HARNESS.md');

        Assert::assertStringContainsString(
            'ADR-0045',
            $content,
            'CODING_HARNESS.md must reference ADR-0045',
        );
    });

    it('says nineteen env vars instead of fifteen in transport comments', function (): void {
        $files = [
            dirname(__DIR__, 3) . '/prism.jsonc',
            dirname(__DIR__, 3) . '/.envrc',
            dirname(__DIR__, 3) . '/.opencode/commands/doctor.md',
        ];

        foreach ($files as $file) {
            $content = (string) file_get_contents($file);
            $short = str_replace(dirname(__DIR__, 3) . '/', '', $file);

            Assert::assertStringNotContainsString(
                'fifteen',
                $content,
                "{$short} must not say fifteen env variables",
            );
        }
    });

    it('describes twenty-two NUL pairs in prism.jsonc header', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/prism.jsonc');

        Assert::assertStringContainsString(
            'twenty-two',
            $content,
            'prism.jsonc header must describe twenty-two NUL-delimited pairs',
        );
    });
});





















// vim: ft=php sts=4 sw=4 ts=4 et :
