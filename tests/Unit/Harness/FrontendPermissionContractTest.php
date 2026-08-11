<?php

declare(strict_types=1);

# $KYAULabs: FrontendPermissionContractTest.php kyau@localhost 2026/08/10 -0700 Exp $

use KYAULabs\Prism\PrismJsoncDocument;
use KYAULabs\Prism\PrismManifest;
use KYAULabs\Prism\PrismOpenCodeConfig;
use PHPUnit\Framework\Assert;

require_once dirname(__DIR__, 3) . '/.github/scripts/PrismJsoncDocument.php';
require_once dirname(__DIR__, 3) . '/.github/scripts/PrismManifest.php';
require_once dirname(__DIR__, 3) . '/.github/scripts/PrismOpenCodeConfig.php';

/**
 * Effective skill verdict for one agent: the global skill rules overlaid with
 * the agent's own skill rules. OpenCode merges agent permissions over the
 * global config with agent rules taking precedence (permissions.mdx), so an
 * agent rule replaces the global verdict for that skill name.
 *
 * @param  array<string, mixed> $config  Decoded opencode.jsonc.
 * @param  string               $agent   Agent key.
 * @param  string               $skill   Skill name.
 * @return string|null          The effective verdict ('allow'|'deny'|...) or null when unspecified.
 */
function effective_skill_permission(array $config, string $agent, string $skill): ?string
{
    $global = $config['permission']['skill'] ?? [];
    $agentRules = $config['agent'][$agent]['permission']['skill'] ?? [];

    if (array_key_exists($skill, $agentRules)) {
        return $agentRules[$skill];
    }

    return $global[$skill] ?? null;
}

/**
 * Extract the permission.edit rule pairs from an agent's frontmatter.
 *
 * @param  string $frontmatter  Frontmatter including the --- delimiters.
 * @return list<array{0: string, 1: string}>  [pattern, verdict] pairs.
 */
function frontmatter_edit_rules(string $frontmatter): array
{
    if (preg_match('/^  edit:\n(.*?)\n  (?:bash|task|webfetch|websearch|lsp|skill|external_directory):/ms', $frontmatter, $section) !== 1) {
        return [];
    }

    $rules = [];
    if (preg_match_all('/"([^"]+)":\s*(allow|deny)/', $section[1], $pairs, PREG_SET_ORDER) > 0) {
        foreach ($pairs as $pair) {
            $rules[] = [$pair[1], $pair[2]];
        }
    }

    return $rules;
}

/**
 * Resolve a last-match-wins permission verdict for one path.
 *
 * @param  array<string, string> $rules
 * @param  string                $path
 * @return string|null
 */
function frontend_edit_verdict(array $rules, string $path): ?string
{
    $verdict = null;
    foreach ($rules as $pattern => $action) {
        if (fnmatch($pattern, $path)) {
            $verdict = $action;
        }
    }

    return $verdict;
}

describe('frontend permission contract (issue #296)', function () {
    it('no agent prompt instructs loading a frontend skill denied to that agent', function () {
        $config = load_opencode_config();
        $frontendSkills = frontend_skill_names();

        $violations = [];
        foreach ($config['agent'] as $name => $agent) {
            $prompt = (string) ($agent['prompt'] ?? '');
            if ($prompt === '') {
                continue;
            }

            // Explicit load instructions: "load the X skill" or "load X skill".
            preg_match_all(
                '/load the\s+([a-z0-9-]+)\s+skill|load\s+([a-z0-9-]+)\s+skill/i',
                $prompt,
                $matches,
                PREG_SET_ORDER,
            );

            foreach ($matches as $match) {
                $skill = strtolower($match[1] !== '' ? $match[1] : $match[2]);
                if (! in_array($skill, $frontendSkills, true)) {
                    continue;
                }

                $verdict = effective_skill_permission($config, $name, $skill);
                if ($verdict !== 'allow') {
                    $violations[] = sprintf(
                        "agent '%s' prompt instructs loading '%s' but the effective skill permission is '%s' "
                        . '— the global skill rules deny the four frontend skills to every agent except @frontend (ADR-0049). '
                        . 'Route visual work via @tdd → @frontend instead of loading the skill directly.',
                        $name,
                        $skill,
                        $verdict ?? '<unset>',
                    );
                }
            }
        }

        Assert::assertSame([], $violations, implode("\n", $violations));
    });

    it('frontend edit permissions split static containment from composed app scope', function () {
        $sourcePairs = frontmatter_edit_rules(agent_frontmatter('frontend'));
        $source = [];
        foreach ($sourcePairs as [$pattern, $verdict]) {
            $source[$pattern] = $verdict;
        }

        Assert::assertSame([
            '*' => 'deny',
            'cdn/sass/**' => 'allow',
            'cdn/js/**' => 'allow',
            'cdn/css/**' => 'deny',
            'cdn/javascript/**' => 'deny',
        ], $source);

        foreach (array_keys($source) as $pattern) {
            Assert::assertDoesNotMatchRegularExpression('/<[^>]+>|\{(?:env|file):[^}]+\}/', $pattern);
        }

        $root = PrismJsoncDocument::fromFile(dirname(__DIR__, 3) . '/prism.jsonc')->root();
        PrismManifest::validateProject($root);
        $inline = json_decode(
            PrismOpenCodeConfig::compose($root, null),
            true,
            64,
            JSON_THROW_ON_ERROR,
        );
        $composed = $inline['agent']['frontend']['permission']['edit'];

        Assert::assertSame([
            'prism/*.php' => 'allow',
            'prism/**/*.php' => 'allow',
            'prism/*.html' => 'allow',
            'prism/**/*.html' => 'allow',
        ], $composed);

        $effective = array_merge($source, $composed);
        Assert::assertSame([
            '*',
            'cdn/sass/**',
            'cdn/js/**',
            'cdn/css/**',
            'cdn/javascript/**',
            'prism/*.php',
            'prism/**/*.php',
            'prism/*.html',
            'prism/**/*.html',
        ], array_keys($effective));

        foreach (['prism/index.php', 'prism/pages/home.php', 'prism/index.html', 'prism/pages/home.html'] as $path) {
            Assert::assertSame('allow', frontend_edit_verdict($effective, $path), "expected frontend edit allow for {$path}");
        }
        foreach (['backend/index.php', 'tests/Feature/HomeTest.php', 'aurora/index.php', 'vendor/index.php'] as $path) {
            Assert::assertSame('deny', frontend_edit_verdict($effective, $path), "expected frontend edit deny for {$path}");
        }
    });
});


// vim: ft=php sts=4 sw=4 ts=4 et :
