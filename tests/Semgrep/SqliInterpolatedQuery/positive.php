<?php

# $KYAULabs: positive.php kyau@nova 2026/07/05 -0700 Exp $


declare(strict_types=1);

# This file intentionally contains a SQL injection pattern: string
# concatenation in a query() call. The kyaulabs-sqli-interpolated-query
# rule must fire.

$id = $_GET['id'];
$result = $db->query("SELECT * FROM users WHERE id = " . $id);
$result = $db->query("SELECT * FROM users WHERE id = $id");

// vim: ft=php sts=4 sw=4 ts=4 et :
