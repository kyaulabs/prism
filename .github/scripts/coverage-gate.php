<?php

declare(strict_types=1);

# $KYAULabs: coverage-gate.php kyau@aura.kyaulabs 2026/08/16 -0700 Exp $






/*
 * Shim to the canonical package copy (packages/prism-php-web/scripts/).
 * The canonical file's COVERAGE_GATE_AS_LIBRARY guard + exit(main(...))
 * run at require time, so behavior is byte-identical to invoking it
 * directly. Keep the canonical copy the single source of truth.
 * The pre-commit hook inserts the RCS header (ADR-0041).
 */
require_once __DIR__ . '/../../packages/prism-php-web/scripts/coverage-gate.php';



// vim: ft=php sts=4 sw=4 ts=4 et :
