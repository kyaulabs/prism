<?php


# $KYAULabs: negative.php kyau@nova 2026/07/14 -0700 Exp $







# This file contains POST forms WITH token hidden inputs in various
# attribute-order, case, and quote variants. The
# kyaulabs-missing-csrf-token rule must NOT fire because the file
# contains the suppress word (pattern-not-regex checks the matched region).

$csrf = bin2hex(random_bytes(32));
$_SESSION['csrf'] = $csrf;

header('Content-Type: text/html; charset=UTF-8');
?>
<form method="post" action="/submit">
    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES | ENT_HTML5, 'UTF-8') ?>">
    <input type="text" name="username">
    <button type="submit">Send</button>
</form>

<form action="/contact" method="POST">
    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES | ENT_HTML5, 'UTF-8') ?>">
    <input type="text" name="email">
    <button type="submit">Send</button>
</form>

<form method='post' action="/register">
    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf, ENT_QUOTES | ENT_HTML5, 'UTF-8') ?>">
    <input type="text" name="name">
    <button type="submit">Register</button>
</form>

