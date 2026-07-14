<?php

declare(strict_types=1);

# $KYAULabs: VerdictTest.php kyau@nova 2026/07/13 -0700 Exp $






/**
 * VerdictTest — Verifies the Verdict backed enum.
 *
 * @package KYAULabs\Tests\Unit\Eval
 */

use KYAULabs\Eval\Verdict;

it('has six case-level verdicts', function () {
    expect(Verdict::cases())->toHaveCount(6);
});

it('maps each case to its uppercase string value', function () {
    expect(Verdict::Pass->value)->toBe('PASS');
    expect(Verdict::Fail->value)->toBe('FAIL');
    expect(Verdict::Timeout->value)->toBe('TIMEOUT');
    expect(Verdict::Invalid->value)->toBe('INVALID');
    expect(Verdict::Skipped->value)->toBe('SKIPPED');
    expect(Verdict::Undetermined->value)->toBe('UNDETERMINED');
});

it('restores from a known string via from()', function () {
    expect(Verdict::from('PASS'))->toBe(Verdict::Pass);
    expect(Verdict::from('FAIL'))->toBe(Verdict::Fail);
    expect(Verdict::from('TIMEOUT'))->toBe(Verdict::Timeout);
    expect(Verdict::from('INVALID'))->toBe(Verdict::Invalid);
    expect(Verdict::from('SKIPPED'))->toBe(Verdict::Skipped);
    expect(Verdict::from('UNDETERMINED'))->toBe(Verdict::Undetermined);
});

it('returns null for unknown verdicts via tryFrom()', function () {
    expect(Verdict::tryFrom('GARBAGE'))->toBeNull();
    expect(Verdict::tryFrom('YES'))->toBeNull();
    expect(Verdict::tryFrom('UNCLEAR'))->toBeNull();
});


// vim: ft=php sts=4 sw=4 ts=4 et :
