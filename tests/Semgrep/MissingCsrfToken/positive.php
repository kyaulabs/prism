<?php


# $KYAULabs: positive.php kyau@nova 2026/07/14 -0700 Exp $







# This file intentionally contains POST forms without a token hidden
# input, in various attribute-order, case, and quote variants. The
# kyaulabs-missing-csrf-token rule must fire once per form (5 findings).
# NOTE: this file must not contain the word that triggers the
# pattern-not-regex suppression, anywhere.

?>
<form method="post" action="/submit">
    <input type="text" name="username">
    <button type="submit">Send</button>
</form>

<form action="/contact" method="post">
    <input type="text" name="email">
    <button type="submit">Send</button>
</form>

<form method="POST" action="/login">
    <input type="password" name="password">
    <button type="submit">Login</button>
</form>

<form method='post' action="/register">
    <input type="text" name="name">
    <button type="submit">Register</button>
</form>

<form method="post" action="/api/update">
    <input type="hidden" name="id" value="42">
    <button type="submit">Update</button>

