<?php

declare(strict_types=1);

# $KYAULabs: negative.php kyau@nova 2026/07/13 -0700 Exp $




# This file uses safe query patterns — no request-reachable data
# reaches query(). The kyaulabs-sqli-interpolated-query rule must
# NOT fire.

$id = $_GET['id'];

# 1. Parameterized query via execute() — execute() is not a sink.
$result = $db->execute("SELECT * FROM users WHERE id = ?", [$id]);

# 2. Hardcoded placeholder string passed to query() — not tainted.
$sql = "SELECT * FROM users WHERE id = ?";
$result = $db->query($sql);

# 3. Commented-out injection — the old pattern-regex fired on this
#    comment (false positive); taint mode is AST-based so comments
#    cannot produce findings.
# $db->query("SELECT * FROM users WHERE id = $id");



// vim: ft=php sts=4 sw=4 ts=4 et :
