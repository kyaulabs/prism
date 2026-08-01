<?php

declare(strict_types=1);

# $KYAULabs: PrismOpenCodeConfigTest.php kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $

















require_once dirname(__DIR__, 3) . '/.github/scripts/PrismOpenCodeConfig.php';

use KYAULabs\Prism\PrismJsoncException;
use KYAULabs\Prism\PrismOpenCodeConfig;

describe('PrismOpenCodeConfig::compose', function (): void {
    it('emits explicit all-off MCP leaves without a plugin key', function (): void {
        $json = PrismOpenCodeConfig::compose((object) [], null);
        $config = json_decode($json, false, 64, JSON_THROW_ON_ERROR);

        expect($config->mcp->{'deepseek-websearch'}->enabled)->toBeFalse()
            ->and($config->mcp->searxng->enabled)->toBeFalse()
            ->and(property_exists($config, 'plugin'))->toBeFalse();
    });

    it('requires both preference and prerequisite for MCP activation', function (): void {
        $resolved = (object) [
            'mcp' => (object) ['deepseek_websearch' => true, 'searxng' => true],
            'plugins' => (object) ['opencode_quota' => false],
            'env' => (object) ['deepseek_api_key' => '', 'searxng_url' => 'https://search.test'],
        ];
        $config = json_decode(PrismOpenCodeConfig::compose($resolved, null));

        expect($config->mcp->{'deepseek-websearch'}->enabled)->toBeFalse()
            ->and($config->mcp->searxng->enabled)->toBeTrue();
    });

    it('preserves unrelated inline config and toggles only quota membership', function (): void {
        $base = '{"theme":"keep","plugin":["other/plugin","@slkiser/opencode-quota"],"mcp":{"custom":{"enabled":true}}}';
        $off = json_decode(PrismOpenCodeConfig::compose((object) [], $base));
        $on = json_decode(PrismOpenCodeConfig::compose((object) [
            'plugins' => (object) ['opencode_quota' => true],
        ], $base));

        expect($off->theme)->toBe('keep')
            ->and($off->mcp->custom->enabled)->toBeTrue()
            ->and($off->plugin)->toBe(['other/plugin'])
            ->and($on->plugin)->toBe(['other/plugin', '@slkiser/opencode-quota']);
    });

    it('never copies resolved secrets into inline JSON', function (): void {
        $json = PrismOpenCodeConfig::compose((object) [
            'mcp' => (object) ['deepseek_websearch' => true],
            'env' => (object) ['deepseek_api_key' => 'CANARY-SECRET'],
        ], null);

        expect($json)->not->toContain('CANARY-SECRET');
    });

    it('fails closed on malformed or incompatible inherited inline config', function (string $base): void {
        expect(fn () => PrismOpenCodeConfig::compose((object) [], $base))
            ->toThrow(PrismJsoncException::class);
    })->with([
        'malformed JSON' => ['{'],
        'non-object root' => ['[]'],
        'non-object mcp' => ['{"mcp":false}'],
        'non-object owned server' => ['{"mcp":{"searxng":false}}'],
        'non-array plugin' => ['{"plugin":{}}'],
    ]);

    it('collapses duplicate quota entries', function (): void {
        $base = '{"plugin":["@slkiser/opencode-quota","other/plugin","@slkiser/opencode-quota"]}';
        $on = json_decode(PrismOpenCodeConfig::compose((object) [
            'plugins' => (object) ['opencode_quota' => true],
        ], $base));

        expect($on->plugin)->toBe(['other/plugin', '@slkiser/opencode-quota']);
    });

    it('survives tuple-form unrelated plugin entries', function (): void {
        $base = '{"plugin":["@slkiser/opencode-quota",["@scope/pkg",{"path":"./local"}]]}';
        $off = json_decode(PrismOpenCodeConfig::compose((object) [], $base));

        expect($off->plugin)->toEqual([['@scope/pkg', (object) ['path' => './local']]]);
    });

    it('produces byte-identical output for identical inputs', function (): void {
        $resolved = (object) [
            'mcp' => (object) ['deepseek_websearch' => true, 'searxng' => false],
            'plugins' => (object) ['opencode_quota' => true],
            'env' => (object) ['deepseek_api_key' => 'sk-abc123', 'searxng_url' => ''],
        ];

        $first = PrismOpenCodeConfig::compose($resolved, null);
        $second = PrismOpenCodeConfig::compose($resolved, null);

        expect($first)->toBe($second);
    });
});






// vim: ft=php sts=4 sw=4 ts=4 et :
