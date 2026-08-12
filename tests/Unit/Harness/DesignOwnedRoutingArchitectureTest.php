<?php

declare(strict_types=1);

# $KYAULabs: DesignOwnedRoutingArchitectureTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $




use PHPUnit\Framework\Assert;

it('records Design-owned routing and fail-closed handoff permissions in ADR-0054', function (): void {
    $path = __DIR__ . '/../../../adr/0054-design-owned-routing-and-handoff-permissions.md';
    Assert::assertFileExists($path);
    $adr = (string) file_get_contents($path);

    Assert::assertMatchesRegularExpression('/## Status\s+Accepted/s', $adr);
    Assert::assertStringContainsString('partially supersedes ADR-0030', $adr);
    Assert::assertStringContainsString('extends ADR-0050', $adr);
    Assert::assertStringContainsString('generalizes ADR-0051', $adr);
    Assert::assertStringContainsString('deny', $adr);
    Assert::assertStringContainsString('ask', $adr);
    Assert::assertStringContainsString('Design', $adr);
});

it('publishes the Design ownership and documented-handoff vocabulary', function (): void {
    $context = (string) file_get_contents(__DIR__ . '/../../../CONTEXT.md');

    Assert::assertMatchesRegularExpression('/\| design agent \|.*sole owner.*classifier-driven.*prototyp/is', $context);
    Assert::assertMatchesRegularExpression('/\| documented handoff \|.*permission/is', $context);
    Assert::assertStringContainsString('adr/0054-design-owned-routing-and-handoff-permissions.md', $context);
});


// vim: ft=php sts=4 sw=4 ts=4 et :
