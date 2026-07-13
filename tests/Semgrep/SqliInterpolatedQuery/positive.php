<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@nova 2026/07/13 -0700 Exp $




# This file intentionally contains SQL injection patterns: request-
# reachable data flowing into query() calls via several construction
# styles. The kyaulabs-sqli-interpolated-query rule must fire once
# per sink below (7 findings).

$id = $_GET['id'];

# 1. Direct concatenation — baseline violation.
$result = $db->query("SELECT * FROM users WHERE id = " . $id);

# 2. String interpolation inside the query argument.
$result = $db->query("SELECT * FROM users WHERE id = $id");

# 3. Assign-then-query: tainted variable built via concatenation.
$sql = "SELECT * FROM users WHERE id = " . $id;
$result = $db->query($sql);

# 4. sprintf construction — taint propagates through the return value.
$sql = sprintf("SELECT * FROM users WHERE id = %d", $id);
$result = $db->query($sql);

# 5. Heredoc interpolation — taint propagates through the string.
$sql = <<<SQL
SELECT * FROM users WHERE id = {$_GET['id']}
SQL;
$result = $db->query($sql);

# 6. query() with a second argument — taint in the first arg fires.
$result = $db->query("SELECT * FROM users WHERE id = " . $id, true);

# 7. Over-suppression regression: SQL contains "execute" as a table
#    name. The old pattern-not-regex suppressed this; taint mode
#    correctly fires because execute() is not the method being called.
$result = $db->query("SELECT * FROM execute_log WHERE id = " . $id);




// vim: ft=php sts=4 sw=4 ts=4 et :
