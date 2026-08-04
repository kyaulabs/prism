<?php

declare(strict_types=1);

# $KYAULabs: PipelineConsistencyTest.php kyau@cosmos.kyaulabs 2026/08/04 -0700 Exp $




















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

test('session bootstrap shows wayfinder as the oversized pre-spec branch with the strict-greenfield sole exception', function (): void {
    $contents = harness_read_file(dirname(__DIR__, 3) . '/.opencode/docs/session-bootstrap.md');

    expect($contents)
        ->toContain('wayfinder')
        ->toContain('oversized')
        ->toContain('strict greenfield')
        ->toContain('sole exception');
});

test('canonical docs route oversized work through the pipeline in the same order (ADR-0050)', function (): void {
    $sections = [
        'AGENTS.md' => '/## Engineering Pipeline\n(.*?)(?=\n## |\z)/s',
        'README.md' => '/### Quick-start loop\n(.*?)(?=\n### |\n## |\z)/s',
        'CODING_HARNESS.md' => '/## How the pieces fit together\n(.*?)(?=\n## |\z)/s',
        'session-bootstrap.md' => '/## Pipeline reminder\n(.*?)(?=\n## |\z)/s',
    ];

    $tokens = ['design tab', 'wayfinder', 'prototype (if needed)', '@architect (if cross-cutting)'];

    foreach ($sections as $label => $pattern) {
        $contents = harness_read_file(harness_pipeline_files()[$label]);

        expect($contents)->toMatch($pattern, "{$label} pipeline section not found");

        preg_match($pattern, $contents, $matches);
        $section = $matches[1] ?? '';

        $positions = [];
        foreach ($tokens as $token) {
            $pos = strpos($section, $token);
            expect($pos)->not->toBeFalse("{$label} pipeline section must mention '{$token}' (ADR-0050 routing)");
            $positions[] = $pos;
        }

        for ($i = 0; $i < count($positions) - 1; $i++) {
            expect($positions[$i])->toBeLessThan(
                $positions[$i + 1],
                "{$label} pipeline section must mention the tokens in order: design tab → wayfinder → prototype (if needed) → @architect (if cross-cutting)",
            );
        }
    }
});

test('AGENTS and README pin strict greenfield by reference without the full predicate', function (): void {
    foreach (['AGENTS.md', 'README.md'] as $label) {
        $contents = harness_read_file(harness_pipeline_files()[$label]);

        expect($contents)
            ->toContain('strict greenfield')
            ->toContain('ADR-0050')
            ->not->toContain('quality-surface.manifest');
    }
});






// vim: ft=php sts=4 sw=4 ts=4 et :
