<?php

declare(strict_types=1);

# $KYAULabs: TsconfigInvariantTest.php kyau@cosmos.kyaulabs 2026/07/28 -0700 Exp $




test('tsconfig.json enables strict type-checking', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $path = $repoRoot . DIRECTORY_SEPARATOR . 'tsconfig.json';

    expect(file_exists($path))->toBeTrue("tsconfig.json not found at {$path}");

    $config = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

    expect($config)
        ->toBeArray()
        ->toHaveKey('compilerOptions')
        ->and($config['compilerOptions'])
        ->toHaveKey('strict')
        ->and($config['compilerOptions']['strict'])
        ->toBeTrue('tsconfig.json compilerOptions.strict must be true (issue #222).');
});


// vim: ft=php sts=4 sw=4 ts=4 et :
