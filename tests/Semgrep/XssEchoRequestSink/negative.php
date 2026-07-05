<?php

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $


declare(strict_types=1);

# This file properly escapes output with htmlspecialchars(). The
# kyaulabs-xss-echo-request-sink rule must NOT fire.

$search = $_GET['search'] ?? '';
echo htmlspecialchars($search, ENT_QUOTES | ENT_HTML5, 'UTF-8');

// vim: ft=php sts=4 sw=4 ts=4 et :
