<?php

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $


declare(strict_types=1);

# This file uses a parameterized query with bound parameters — the safe
# pattern. The kyaulabs-sqli-interpolated-query rule must NOT fire.

$id = $_GET['id'];
$result = $db->execute("SELECT * FROM users WHERE id = ?", [$id]);

$sql = "SELECT * FROM users WHERE id = ?";
$result = $db->query($sql);

// vim: ft=php sts=4 sw=4 ts=4 et :
