<?php

declare(strict_types=1);

# $KYAULabs: CliffConfigTest.php kyau@akira.kyaulabs 2026/07/10 -0700 Exp $







/**
 * Contract tests for cliff.toml ↔ commitlint.config.js consistency.
 *
 * Ensures every commit type allowed by commitlint's type-enum has a
 * corresponding message parser in cliff.toml's commit_parsers. This
 * prevents config-pair drift where accepted commits would appear
 * ungrouped in the changelog (filter_commits = false).
 */

/**
 * Extracts the type-enum values from commitlint.config.js.
 *
 * Parses the JavaScript config file with regex to find the
 * 'type-enum' rule array and extract all quoted type strings.
 *
 * @return list<string> The allowed commit types (e.g. ['build', 'chore', ...]).
 */
function harness_config_load_commitlint_types(): array
{
    $configPath = dirname(__DIR__, 3) . '/commitlint.config.js';

    if (! file_exists($configPath)) {
        throw new RuntimeException("commitlint.config.js not found at: {$configPath}");
    }

    $contents = file_get_contents($configPath);

    if ($contents === false) {
        throw new RuntimeException("Failed to read commitlint.config.js: {$configPath}");
    }

    if (! preg_match("/['\"]type-enum['\"]\s*:\s*\[[^,]+,\s*['\"]always['\"],\s*\[(.*?)\]\]/s", $contents, $matches)) {
        throw new RuntimeException('Failed to find type-enum rule in commitlint.config.js');
    }

    if (! preg_match_all("/'([^']+)'/", $matches[1], $typeMatches)) {
        throw new RuntimeException('Failed to extract types from type-enum array');
    }

    return $typeMatches[1];
}

/**
 * Extracts commit type prefixes from cliff.toml's commit_parsers.
 *
 * Parses the TOML config file with regex to find all message-based
 * parsers and extracts the type prefix (the word after ^) from each
 * regex pattern. Body-based parsers are ignored — they are not
 * type-specific.
 *
 * @return list<string> Unique type prefixes (e.g. ['feat', 'fix', ...]).
 */
function harness_config_load_cliff_parser_types(): array
{
    $configPath = dirname(__DIR__, 3) . '/cliff.toml';

    if (! file_exists($configPath)) {
        throw new RuntimeException("cliff.toml not found at: {$configPath}");
    }

    $contents = file_get_contents($configPath);

    if ($contents === false) {
        throw new RuntimeException("Failed to read cliff.toml: {$configPath}");
    }

    if (! preg_match_all('/message\s*=\s*"(\^[^"]+)"/', $contents, $matches)) {
        throw new RuntimeException('Failed to extract commit_parsers from cliff.toml');
    }

    $types = [];
    foreach ($matches[1] as $pattern) {
        if (preg_match('/^\^(\w+)/', $pattern, $typeMatch)) {
            $types[] = $typeMatch[1];
        }
    }

    return array_values(array_unique($types));
}

test('commitlint type-enum is non-empty', function (): void {
    $types = harness_config_load_commitlint_types();

    expect($types)->not->toBeEmpty(
        'commitlint type-enum is empty — check commitlint.config.js parsing.'
    );
});

test('cliff.toml commit_parsers is non-empty', function (): void {
    $types = harness_config_load_cliff_parser_types();

    expect($types)->not->toBeEmpty(
        'cliff.toml commit_parsers is empty — check cliff.toml parsing.'
    );
});

test('cliff.toml parsers cover all commitlint type-enum types', function (): void {
    $commitlintTypes = harness_config_load_commitlint_types();
    $cliffTypes = harness_config_load_cliff_parser_types();

    $missing = array_diff($commitlintTypes, $cliffTypes);

    if ($missing !== []) {
        $message = sprintf(
            "cliff.toml is missing parsers for %d commitlint type(s):\n\n%s\n\n"
            . 'Add a { message = "^<type>", group = "..." } parser '
            . "to cliff.toml's commit_parsers for each missing type.",
            count($missing),
            implode("\n", array_map(fn (string $t): string => "  - {$t}", $missing)),
        );
        expect($missing)->toBeEmpty($message);
    } else {
        expect($missing)->toBeEmpty();
    }
});



// vim: ft=php sts=4 sw=4 ts=4 et :
