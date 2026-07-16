<?php

declare(strict_types=1);

# $KYAULabs: PipelineConsistencyTest.php kyau@nova 2026/07/16 -0700 Exp $














/**
 * Pipeline-consistency tests across the canonical documentation files.
 *
 * The `@architect` gate placement is documented in four canonical locations.
 * These tests assert they stay in sync so the always-injected session bootstrap
 * never contradicts AGENTS.md, README.md, or CODING_HARNESS.md.
 * Regression guard for issue #96.
 */

/**
 * Returns the canonical pipeline-section source files that must agree.
 *
 * @return array<string, string>
 */
function harness_pipeline_files(): array
{
    $root = dirname(__DIR__, 3);

    return [
        'AGENTS.md' => $root . '/AGENTS.md',
        'CODING_HARNESS.md' => $root . '/CODING_HARNESS.md',
        'README.md' => $root . '/README.md',
        'session-bootstrap.md' => $root . '/.opencode/docs/session-bootstrap.md',
    ];
}

/**
 * Reads a file, throwing on failure (strict-types-safe).
 *
 * @param  string $path
 * @return string
 */
function harness_read_file(string $path): string
{
    if (! file_exists($path)) {
        throw new RuntimeException("File not found: {$path}");
    }

    $contents = file_get_contents($path);

    if ($contents === false) {
        throw new RuntimeException("Failed to read: {$path}");
    }

    return $contents;
}

test('every canonical doc places @architect after spec and before ticketing/planning', function (): void {
    foreach (harness_pipeline_files() as $label => $path) {
        $contents = harness_read_file($path);
        expect($contents)
            ->toContain('`@architect` after the spec and before ticketing/planning');
    }
});

test('no canonical doc uses the stale before-step-4 placement', function (): void {
    foreach (harness_pipeline_files() as $label => $path) {
        $contents = harness_read_file($path);
        expect($contents)
            ->not->toContain('insert `@architect` before step 4');
    }
});





// vim: ft=php sts=4 sw=4 ts=4 et :
