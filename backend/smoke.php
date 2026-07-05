<?php

declare(strict_types=1);

# $KYAULabs: smoke.php,v 1.0.0 2026/07/04 -0700 kyau Exp $

/**
 * Minimal production code used by the unit test smoke test to produce
 * measurable code coverage for the --min=80 CI gate.
 *
 * @return bool  Always returns true.
 */
function smoke_test(): bool
{
    return true;
}

// vim: ft=php sts=4 sw=4 ts=4 et :
