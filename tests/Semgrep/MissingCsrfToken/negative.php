<?php

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $


# This file contains a POST form WITH a CSRF token hidden input.
# The kyaulabs-missing-csrf-token rule must NOT fire because the
# form block contains the word "csrf" (pattern-not-regex suppresses).

$csrf = bin2hex(random_bytes(32));
$_SESSION['csrf'] = $csrf;

header('Content-Type: text/html; charset=UTF-8');
?>
<form method="post" action="/submit">
    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES | ENT_HTML5, 'UTF-8') ?>">
    <input type="text" name="username">
    <button type="submit">Send</button>
</form>

// vim: ft=php sts=4 sw=4 ts=4 et :
