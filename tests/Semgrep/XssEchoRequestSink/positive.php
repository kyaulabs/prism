<?php

# $KYAULabs: positive.php kyau@nova 2026/07/05 -0700 Exp $


declare(strict_types=1);

# This file intentionally contains an unescaped request superglobal echo —
# an XSS sink. The kyaulabs-xss-echo-request-sink rule must fire.

$username = $_GET['username'];
echo $username;
echo $_GET['search'];

// vim: ft=php sts=4 sw=4 ts=4 et :
