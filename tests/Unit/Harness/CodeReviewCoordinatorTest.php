<?php

declare(strict_types=1);

# $KYAULabs: CodeReviewCoordinatorTest.php kyau@nova 2026/07/16 -0700 Exp $



















use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @code-review multi-axis coordinator (issue #137).
 *
 * Asserts the coordinator exists with scoped task: allow for its 3 read-only
 * review axes, retains edit: deny, is registered in opencode.jsonc at the
 * PRIMARY tier, dispatches @standards-review/@spec-review/@semgrep, is indexed
 * in the canonical doc tables, and that ADR-0021 records the permission-model
 * carve-out. The broad compliance sweep (every agent has a literal
 * temperature, no bare model IDs) is already covered by ModelConfigTest.php.
 */

it('ADR-0021 exists and records the coordinator permission-model carve-out', function (): void {
    $adr = __DIR__ . '/../../../adr/0021-code-review-coordinator-permission-model.md';
    Assert::assertFileExists($adr);
    $body = file_get_contents($adr);
    Assert::assertStringContainsString('code-review', $body);
    Assert::assertStringContainsString('0006', $body);
    Assert::assertStringContainsString('task:', $body);
    Assert::assertMatchesRegularExpression('/coordinator/i', $body);
});



// vim: ft=php sts=4 sw=4 ts=4 et :
