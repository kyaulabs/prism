<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@nova 2026/07/05 -0700 Exp $

# This file intentionally hardcodes display_errors to on — bypassing the
# Aurora constructor's $status parameter. The kyaulabs-hardcoded-display-errors-on
# rule must fire.

ini_set('display_errors', '1');
error_reporting(E_ALL);

// vim: ft=php sts=4 sw=4 ts=4 et :
