<?php

declare(strict_types=1);

# $KYAULabs: PrismManifestDocsTest.php kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $














require_once dirname(__DIR__, 3) . '/.github/scripts/PrismJsoncDocument.php';

use KYAULabs\Prism\PrismJsoncDocument;
use PHPUnit\Framework\Assert;

/**
 * Load and return the project prism.jsonc manifest (v5 schema) as an
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

        foreach (['primary', 'planner', 'design', 'judge', 'utility'] as $tier) {
            Assert::assertStringContainsString(
                $manifest['models'][$tier],
                $content,
                "model-configuration.md must list the prism.jsonc default model for the '{$tier}' tier",
            );
        }
    });

    it('has model tier tables in AGENTS.md Model selection section aligned with prism.jsonc', function () use ($manifest): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/AGENTS.md');

        // AGENTS.md does not have a full five-tier table — it delegates to
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

    it('has the opencode.jsonc MCP comments point to prism.jsonc for keys', function (): void {
        $content = (string) file_get_contents(dirname(__DIR__, 3) . '/opencode.jsonc');

        // The MCP enablement comments should reference prism.jsonc (user manifest)
        // not the legacy setup.json.
        Assert::assertStringContainsString(
            'prism.jsonc',
            $content,
            'opencode.jsonc MCP comments must point to prism.jsonc for env keys',
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
});







// vim: ft=php sts=4 sw=4 ts=4 et :
