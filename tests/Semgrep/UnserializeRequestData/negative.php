<?php

declare(strict_types=1);

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $

# This file unserializes a static, hardcoded string — no taint from
# request data. The kyaulabs-unserialize-request-data rule must NOT fire.

$data = 'a:2:{s:4:"name";s:3:"foo";s:5:"value";i:42;}';
$obj = unserialize($data);

// vim: ft=php sts=4 sw=4 ts=4 et :
