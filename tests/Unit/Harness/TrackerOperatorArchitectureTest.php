<?php

declare(strict_types=1);

# $KYAULabs: TrackerOperatorArchitectureTest.php kyau@aura.kyaulabs 2026/08/11 -0700 Exp $



#
# Locks ADR-0052 (tracker-operator agent for ticketing gh execution, issue
# #298) and its CONTEXT.md glossary/index entries, mirroring the
# WayfinderDelegationArchitectureTest pattern.

use PHPUnit\Framework\Assert;

it('records the tracker-operator decision in an accepted ADR', function (): void {
    $root = dirname(__DIR__, 3);
    $path = $root . '/adr/0052-tracker-operator-agent.md';

    Assert::assertFileExists($path);
    $adr = (string) file_get_contents($path);
    Assert::assertMatchesRegularExpression('/## Status\s+Accepted/s', $adr);
    Assert::assertStringContainsString('tracker-operator', $adr);
    Assert::assertStringContainsString('@explore', $adr);
    Assert::assertStringContainsString('least-privilege', strtolower($adr));
    Assert::assertStringContainsString('ask', strtolower($adr));
    Assert::assertStringContainsString('ADR-0019', $adr);
    Assert::assertStringContainsString('ADR-0020', $adr);
    Assert::assertStringContainsString('ADR-0022', $adr);
    Assert::assertStringContainsString('ADR-0047', $adr);
    Assert::assertStringContainsString('ADR-0049', $adr);
});

it('indexes the tracker-operator decision and glossary term in project context', function (): void {
    $context = (string) file_get_contents(dirname(__DIR__, 3) . '/CONTEXT.md');

    Assert::assertStringContainsString('adr/0052-tracker-operator-agent.md', $context);
    Assert::assertStringContainsString('tracker operator agent', strtolower($context));
});


// vim: ft=php sts=4 sw=4 ts=4 et :
