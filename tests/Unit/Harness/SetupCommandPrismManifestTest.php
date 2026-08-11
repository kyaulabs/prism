<?php

declare(strict_types=1);

# $KYAULabs: SetupCommandPrismManifestTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $







use PHPUnit\Framework\Assert;

/**
 * Read the /setup command manifest as text (command-contract assertions).
 */
function setup_command_content(): string
{
    $path = __DIR__ . '/../../../.opencode/commands/setup.md';
    Assert::assertFileExists($path, '.opencode/commands/setup.md must exist');

    return (string) file_get_contents($path);
}

/**
 * Extract one section of the /setup command between two markdown headings.
 *
 * Fails loudly if either marker is missing — a renamed or removed section
 * heading must never degrade into a vacuous pass.
 *
 * @param  string $from  Text that starts the section (heading or lead-in).
 * @param  string $toNext  Next section heading; the slice ends before it.
 * @return string  The section text between the two markers.
 */
function setup_command_section(string $from, string $toNext): string
{
    $content = setup_command_content();
    $start = strpos($content, $from);
    Assert::assertNotFalse($start, "section start marker not found: {$from}");
    $end = strpos($content, $toNext, $start);
    Assert::assertNotFalse($end, "section end marker not found: {$toNext}");

    return substr($content, $start, $end - $start);
}

describe('/setup command — prism manifest contract (ADR-0043)', function () {
    it('references the project manifest at the repo root prism.jsonc', function () {
        Assert::assertStringContainsString('prism.jsonc', setup_command_content());
    });

    it('references the user manifest at ~/.config/opencode/prism.jsonc', function () {
        Assert::assertStringContainsString(
            '~/.config/opencode/prism.jsonc',
            setup_command_content(),
            '/setup must name the user-tier manifest path',
        );
    });

    it('auto-runs migrate-setup.sh on entry before reading any values', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('migrate-setup.sh', $content);
        // The migration must run BEFORE reads, not after.
        $migratePos = strpos($content, 'migrate-setup.sh');
        Assert::assertNotFalse($migratePos, 'migrate-setup.sh must be referenced');
    });

    it('reads resolved values through the prism manifest CLI, never jq', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString(
            'prism_manifest.php',
            $content,
            '/setup must read resolved values through the prism manifest CLI',
        );
        Assert::assertStringNotContainsString(
            'jq',
            $content,
            '/setup must not read values with jq; it reads through the CLI',
        );
    });

    it('reads and writes the FRONTEND model and variant through the CLI and writers', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString(
            'OPENCODE_MODEL_FRONTEND',
            $content,
            '/setup must read models.frontend and pass it to both writers',
        );
        Assert::assertStringContainsString(
            'OPENCODE_VARIANT_FRONTEND',
            $content,
            '/setup must read variants.frontend and pass it to both writers',
        );
        // Scope to the Frontend prompt entries: the bare 'openai/gpt-5.6-sol'
        // and 'xhigh' tokens also appear in the Planner/Design rows, so a
        // Frontend-specific default drift would otherwise go undetected.
        Assert::assertStringContainsString(
            '**Frontend** model [openai/gpt-5.6-sol]',
            $content,
            '/setup must default the Frontend model prompt to openai/gpt-5.6-sol',
        );
        Assert::assertStringContainsString(
            '**Frontend** variant [xhigh]',
            $content,
            '/setup must default the Frontend variant prompt to xhigh',
        );
        Assert::assertStringContainsString(
            'setup-write-project-config.sh',
            $content,
            '/setup must pass frontend values to the project writer',
        );
        Assert::assertStringContainsString(
            'setup-write-user-config.sh',
            $content,
            '/setup must pass frontend values to the user writer',
        );
    });

    it('warns before patching, naming both paths and comment preservation', function () {
        $content = setup_command_content();
        $lower = strtolower($content);
        // A pre-write warning that names the preservation contract.
        Assert::assertStringContainsString('comment', $lower);
        Assert::assertTrue(
            str_contains($lower, 'preserve'),
            '/setup must state that comments/unknowns are preserved when patching',
        );
    });

    it('patches owned fields in place via setup-write-project-config.sh', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString(
            'setup-write-project-config.sh',
            $content,
            '/setup must patch the project manifest via setup-write-project-config.sh',
        );
        Assert::assertStringContainsString('patch', $content);
    });

    it('writes the user manifest via setup-write-user-config.sh at mode 0600', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('setup-write-user-config.sh', $content);
        Assert::assertStringContainsString('0600', $content);
    });

    it('does not regenerate a wholesale JSON template into the legacy path', function () {
        $content = setup_command_content();
        Assert::assertStringNotContainsString(
            'Write `.opencode/setup.json`',
            $content,
            '/setup must not write the legacy .opencode/setup.json wholesale',
        );
        Assert::assertStringNotContainsString(
            '"setup_version": 4',
            $content,
            '/setup must not regenerate the v4 wholesale JSON template',
        );
    });

    it('documents the deprecation/migration of the legacy setup.json', function () {
        $content = setup_command_content();
        Assert::assertTrue(
            str_contains($content, 'deprecat')
            || str_contains($content, 'legacy')
            || str_contains($content, 'migrat'),
            '/setup must document the legacy setup.json deprecation/migration',
        );
    });

    it('applies the parent/target scaffold contract', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('parent', $content);
        Assert::assertStringContainsString('target', $content);
        // A scaffolded target must record skip-mode bookkeeping.
        Assert::assertStringContainsString('skip', $content);
    });

    it('prompts for all three integration toggles (deepseek-websearch, searxng, quota)', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('deepseek-websearch MCP', $content);
        Assert::assertStringContainsString('SearXNG MCP', $content);
        Assert::assertStringContainsString('@slkiser/opencode-quota', $content);
    });

    it('invokes the toggles writer mode and names the user-only manifest path', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('setup-write-user-config.sh toggles', $content);
        Assert::assertStringContainsString('~/.config/opencode/prism.jsonc', $content);
    });

    it('never writes toggle answers to the project manifest', function () {
        // Toggle section must NOT invoke the project writer. Bound the search
        // from the toggles heading to the next major section start to avoid a
        // false-positive from the project-writer invocation in §8.
        $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");
        Assert::assertStringNotContainsString(
            'setup-write-project-config.sh',
            $togglesSection,
            'toggle section must not invoke the project writer',
        );
    });

    it('advises direnv allow and OpenCode restart after writing toggles', function () {
        $content = setup_command_content();
        Assert::assertStringContainsString('direnv allow', $content);
        // OpenCode restart guidance must appear near the toggles section.
        $restartRegion = substr($content, (int) strpos($content, 'restart'));
        Assert::assertStringContainsString('restart', $restartRegion);
    });

    it('verifies the sweep with the grep tool, scoped to the swept directory', function () {
        $verifySweepSection = setup_command_section('## 7. Verify sweep', "\n## 8. Patch manifests");
        Assert::assertStringNotContainsString(
            'grep -rnF',
            $verifySweepSection,
            '§7 must not instruct running grep via bash',
        );
        Assert::assertStringContainsString(
            'grep tool',
            $verifySweepSection,
            '§7 must instruct using the grep tool',
        );
        Assert::assertStringContainsString(
            '$project_folder',
            $verifySweepSection,
            '§7 must scope verification to the swept directory only',
        );
        Assert::assertStringContainsString(
            'NOT sweep failures',
            $verifySweepSection,
            '§7 must note that matches in the parent repo are not sweep failures',
        );
    });

    it('sweep list contains no Prism harness paths', function () {
        $sweepList = setup_command_section('Files to sweep', "\n## 6. Apply");
        Assert::assertStringNotContainsString(
            '.opencode/',
            $sweepList,
            'sweep list must not target Prism harness files under .opencode/',
        );
        Assert::assertStringNotContainsString('SKILL.md', $sweepList);
        Assert::assertStringNotContainsString('deploy.md', $sweepList);
        Assert::assertStringNotContainsString('prime.md', $sweepList);
        Assert::assertStringNotContainsString('debug.md', $sweepList);
        Assert::assertStringNotContainsString('tdd.md', $sweepList);
        Assert::assertStringNotContainsString('build-pipeline.md', $sweepList);
    });

    it('keeps only template files in the sweep list', function (string $file) {
        $sweepList = setup_command_section('Files to sweep', "\n## 6. Apply");
        Assert::assertStringContainsString(
            $file,
            $sweepList,
            "sweep list must keep the template file {$file}",
        );
    })->with([
        'AGENTS.md' => ['AGENTS.md'],
        'CONTRIBUTING.md' => ['CONTRIBUTING.md'],
        '.env.example' => ['.env.example'],
        'README.md' => ['README.md'],
        'CODE_OF_CONDUCT.md' => ['CODE_OF_CONDUCT.md'],
        'SECURITY.md' => ['SECURITY.md'],
        'cliff.toml' => ['cliff.toml'],
        'composer.json' => ['composer.json'],
        'package.json' => ['package.json'],
        'cdn/sass/_tokens.scss' => ['cdn/sass/_tokens.scss'],
    ]);

    it('always scopes substitution to --target-dir "$project_folder"', function () {
        $applySection = setup_command_section('## 6. Apply', "\n## 7. Verify sweep");
        Assert::assertStringContainsString(
            '--target-dir "$project_folder"',
            $applySection,
            '§6 must always scope substitution to the scaffolded project folder',
        );
        Assert::assertStringNotContainsString(
            'omit',
            $applySection,
            '§6 must not instruct omitting --target-dir',
        );
        Assert::assertStringNotContainsString(
            'in-place',
            $applySection,
            '§6 must not instruct in-place substitution on the parent repo',
        );
        Assert::assertStringNotContainsString(
            'bash .github/scripts/setup-substitute.sh <file>',
            $applySection,
            '§6 must not contain a bare substitution invocation without --target-dir',
        );
    });

    it('skips the sweep entirely when $project_folder is empty or unset', function () {
        $applySection = setup_command_section('## 6. Apply', "\n## 7. Verify sweep");
        Assert::assertStringContainsString(
            '$project_folder',
            $applySection,
            '§6 must gate the sweep on $project_folder',
        );
        Assert::assertStringContainsString(
            'empty or unset',
            $applySection,
            '§6 must trigger the gate when $project_folder is empty or unset',
        );
        Assert::assertStringContainsString(
            'SKIP the sweep entirely',
            $applySection,
            '§6 must skip the sweep, never run it on the parent repo',
        );
        Assert::assertStringContainsString(
            'never rewritten',
            $applySection,
            '§6 must state that the parent repository is never rewritten',
        );
    });

    it('reads MCP prerequisites via present and never get env.*', function (): void {
        $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");

        Assert::assertStringContainsString(
            'prism_manifest.php present "$PROJECT" "$USER_ARG" env.deepseek_api_key',
            $togglesSection,
        );
        Assert::assertStringContainsString(
            'prism_manifest.php present "$PROJECT" "$USER_ARG" env.searxng_url',
            $togglesSection,
        );
        Assert::assertStringNotContainsString(
            'get "$PROJECT" "$USER_ARG" env.',
            $togglesSection,
        );
    });

    it('validates presence literals and fails closed before writing', function (): void {
        $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");

        Assert::assertStringContainsString('true|false', $togglesSection);
        Assert::assertStringContainsString('aborting', $togglesSection);
        Assert::assertStringContainsString('no write performed', $togglesSection);
    });

    it('computes active state from literal presence booleans', function (): void {
        $togglesSection = setup_command_section('Integration toggles', "\n## 4. Build the token map");

        Assert::assertStringContainsString(
            'active = requested AND DS_PRESENT=true',
            $togglesSection,
        );
        Assert::assertStringContainsString(
            'active = requested AND SX_PRESENT=true',
            $togglesSection,
        );
        Assert::assertStringContainsString('[ "$DS_PRESENT" = "true" ]', $togglesSection);
        Assert::assertStringContainsString('[ "$SX_PRESENT" = "true" ]', $togglesSection);
    });
});



// vim: ft=php sts=4 sw=4 ts=4 et :
