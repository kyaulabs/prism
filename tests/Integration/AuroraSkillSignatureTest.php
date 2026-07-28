<?php

declare(strict_types=1);

# $KYAULabs: AuroraSkillSignatureTest.php kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $




use KYAULabs\Aurora;

/**
 * Guards the aurora-page skill against documentation drift. Catches
 * two failure classes at the /check gate on every run:
 *  - signature: the Aurora constructor signature drifting from source.
 *    Pairs with AuroraConstructorStatusTest for the $status sharp edge.
 *  - env-location: .env guidance in the skill and .env.example
 *    drifting from ADR-0003's repository-root contract.
 */

test('aurora-page skill constructor signature matches actual source', function () {
    $auroraPath = __DIR__ . '/../../aurora/aurora.inc.php';
    if (!is_file($auroraPath)) {
        $this->markTestSkipped('aurora submodule not initialized — run: git submodule update --init');
    }
    require_once $auroraPath;

    // 1. Get the real signature via reflection
    $reflected = new ReflectionMethod(Aurora::class, '__construct');
    $params = $reflected->getParameters();

    $realSignature = '';
    foreach ($params as $param) {
        $type = $param->getType();
        $typeStr = '';
        assert($type instanceof ReflectionNamedType, sprintf(
            'Parameter $%s has a %s, which this test does not support. Extend the type rendering logic.',
            $param->getName(),
            $type::class,
        ));
        if ($type->allowsNull()) {
            $typeStr = '?' . $type->getName();
        } else {
            $typeStr = $type->getName();
        }

        $sig = '$' . $param->getName();
        if ($param->isDefaultValueAvailable()) {
            $default = $param->getDefaultValue();
            $sig .= ' = ';
            if ($default === null) {
                $sig .= 'null';
            } elseif ($default === false) {
                $sig .= 'false';
            } elseif ($default === true) {
                $sig .= 'true';
            } else {
                $sig .= var_export($default, true);
            }
        }

        $realSignature .= ($realSignature === '' ? '' : ' ') . ltrim($typeStr . ' ' . $sig);
    }

    // 2. Parse the documented signature from the skill file
    $skillPath = __DIR__ . '/../../.opencode/skills/aurora-page/SKILL.md';
    $skillContent = file_get_contents($skillPath);
    expect($skillContent)->not->toBeFalse("Could not read aurora-page SKILL.md at {$skillPath}");

    // Extract the constructor signature from the fenced PHP block.
    // Must match the documented signature (with type-hinted params like
    // "?string $template = null"), NOT the named-argument usage call
    // ("template: ...") that appears earlier in the skill file.
    preg_match('/new\s+KYAULabs\\\\Aurora\(\s*(\??\w+\s+\$\w+(?:\s*=\s*(?:null|true|false|\'[^\']*\'|"[^"]*"|\d+))?\s*,?\s*)+\)/', $skillContent, $matches);
    $matchText = $matches[0] ?? '';
    preg_match('/new\s+KYAULabs\\\\Aurora\(([^)]+)\)/', $matchText, $matches);

    expect($matches)->toHaveCount(2, 'Could not find Aurora constructor call in aurora-page SKILL.md');

    $docArgs = $matches[1];
    // Remove whitespace
    $docArgs = preg_replace('/\s+/', ' ', trim($docArgs));

    // 3. Build the expected signature from the doc
    $docParams = array_map('trim', explode(',', $docArgs));
    $docSignature = implode(' ', $docParams);

    // 4. Compare
    $realSignature = str_replace('  ', ' ', trim(preg_replace('/\s+/', ' ', $realSignature)));
    $docSignature = trim($docSignature);

    expect($docSignature)->toBe(
        $realSignature,
        "aurora-page SKILL.md constructor signature does not match actual Aurora source.\n" .
        "  Documented: {$docSignature}\n" .
        "  Actual:     {$realSignature}\n" .
        'Fix: update the signature in .opencode/skills/aurora-page/SKILL.md',
    );
});

test('aurora-page documentation uses repository-root env location', function () {
    $canonicalCall = "load_env(__DIR__ . '/../.env')";

    $skillPath = __DIR__ . '/../../.opencode/skills/aurora-page/SKILL.md';
    $skillContent = file_get_contents($skillPath);
    expect($skillContent)->not->toBeFalse("Could not read aurora-page SKILL.md at {$skillPath}");
    expect($skillContent)->toContain($canonicalCall);
    expect($skillContent)->toContain('repository-root `.env`');

    $envExamplePath = __DIR__ . '/../../.env.example';
    $envExampleContent = file_get_contents($envExamplePath);
    expect($envExampleContent)->not->toBeFalse("Could not read .env.example at {$envExamplePath}");
    expect($envExampleContent)->toContain('from the repository-root');
    expect($envExampleContent)->toContain('to .env in the repository root');
    expect($envExampleContent)->not->toContain('present in the webroot');
});


// vim: ft=php sts=4 sw=4 ts=4 et :
