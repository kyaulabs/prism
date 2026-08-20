<?php

declare(strict_types=1);

# $KYAULabs: negative.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# This file uses safe query patterns — no request-reachable data
# reaches the SQL string (first) argument of query(). The
# kyaulabs-sqli-interpolated-query rule must NOT fire.

$id = $_GET['id'];

# 1. Bound parameters via the real Aurora API — the tainted value
#    travels in query()'s bound-params array (arg 2), not the SQL
#    string (arg 1). The arg-1-focused sink must not fire.
$result = $db->query("SELECT * FROM users WHERE id = ?", [$id]);

# 2. Hardcoded placeholder string passed to query() — not tainted.
$sql = "SELECT * FROM users WHERE id = ?";
$result = $db->query($sql);

# 3. intval() integer cast neutralizes taint for an integer context.
$safe = intval($_GET['id']);
$result = $db->query("SELECT * FROM users WHERE id = " . $safe);

# 4. (int) cast neutralizes taint for an integer context.
$safe = (int) $_GET['id'];
$result = $db->query("SELECT * FROM users WHERE id = " . $safe);

# 5. Commented-out injection — AST-based taint mode cannot produce
#    findings from comments.
# $db->query("SELECT * FROM users WHERE id = $id");

// vim: ft=php sts=4 sw=4 ts=4 et :
