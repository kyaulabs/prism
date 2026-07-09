<?php

declare(strict_types=1);

# $KYAULabs: SuiteExitCodeTest.php kyau@nova 2026/07/08 -0700 Exp $

/**
 * SuiteExitCodeTest — Unit tests for Runner::computeSuiteExitCode().
 *
 * Covers the all-skipped self-masking fix (issue #50): a suite where
 * every case is SKIPPED must exit non-zero (2), and --fail-on-skip
 * promotes any SKIPPED case to a failure (1).
 */

use KYAULabs\Eval\Runner;

it('returns 0 when all cases pass', function () {
    expect(Runner::computeSuiteExitCode(3, 0, 0, 0, 0, false))->toBe(0);
});

it('returns 1 when any case fails', function () {
    expect(Runner::computeSuiteExitCode(2, 1, 0, 0, 0, false))->toBe(1);
});

it('returns 1 when any case times out', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 1, 0, 0, false))->toBe(1);
});

it('returns 1 when any case is invalid', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 0, 0, 1, false))->toBe(1);
});

it('returns 2 when every case is skipped', function () {
    expect(Runner::computeSuiteExitCode(0, 0, 0, 3, 0, false))->toBe(2);
});

it('returns 0 for mixed pass and skip without failures', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 0, 1, 0, false))->toBe(0);
});

it('returns 1 for any skip when --fail-on-skip is set', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 0, 1, 0, true))->toBe(1);
});

it('returns 1 for all-skipped when --fail-on-skip is set', function () {
    expect(Runner::computeSuiteExitCode(0, 0, 0, 3, 0, true))->toBe(1);
});

it('returns 0 for an empty suite', function () {
    expect(Runner::computeSuiteExitCode(0, 0, 0, 0, 0, false))->toBe(0);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
