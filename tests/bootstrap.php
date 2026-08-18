<?php

declare(strict_types=1);

# $KYAULabs: bootstrap.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

// ── Platform-aware coverage driver selection ────────────────────────
// PHPUnit auto-detects PCOV > Xdebug > phpdbg.
// PCOV is preferred on Linux/macOS (lower overhead).
// Xdebug is used on Windows (PCOV Windows DLLs only exist up to PHP 8.3;
//   this project targets PHP 8.5+, so Xdebug is required on Windows).
//
// No manual configuration needed — PHPUnit 11+ handles this.
// Just ensure EITHER extension is loaded:
//   Linux/macOS:  sudo pecl install pcov
//   Windows:      install matching php_xdebug.dll from xdebug.org/download

error_reporting(E_ALL);
ini_set('display_errors', '0');

// vim: ft=php sts=4 sw=4 ts=4 et :
