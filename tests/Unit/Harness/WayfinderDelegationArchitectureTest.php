<?php

declare(strict_types=1);

# $KYAULabs: WayfinderDelegationArchitectureTest.php kyau@cosmos.kyaulabs 2026/08/04 -0700 Exp $




use PHPUnit\Framework\Assert;

it('records the oversized-work routing decision in an accepted ADR', function (): void {
    $root = dirname(__DIR__, 3);
    $path = $root.'/adr/0050-oversized-brainstorming-wayfinder-greenfield-bootstrap.md';

    Assert::assertFileExists($path);
    $adr = (string) file_get_contents($path);
    Assert::assertMatchesRegularExpression('/## Status\s+Accepted/s', $adr);
    Assert::assertStringContainsString('pre-spec', $adr);
    Assert::assertStringContainsString('strict greenfield', strtolower($adr));
    Assert::assertStringContainsString('indeterminate', strtolower($adr));
    Assert::assertStringContainsString('single-root', strtolower($adr));
    Assert::assertStringContainsString('immutable', strtolower($adr));
    Assert::assertStringContainsString('ADR-0020', $adr);
    Assert::assertStringContainsString('ADR-0027', $adr);
    Assert::assertStringContainsString('ADR-0030', $adr);
    Assert::assertStringContainsString('ADR-0044', $adr);
});

it('indexes ADR-0050 and its routing vocabulary in project context', function (): void {
    $context = (string) file_get_contents(dirname(__DIR__, 3).'/CONTEXT.md');

    Assert::assertStringContainsString('adr/0050-oversized-brainstorming-wayfinder-greenfield-bootstrap.md', $context);
    foreach (['oversized request', 'strict greenfield', 'walking-skeleton bootstrap', 'wayfinder map'] as $term) {
        Assert::assertStringContainsString($term, strtolower($context));
    }
});


// vim: ft=php sts=4 sw=4 ts=4 et :
