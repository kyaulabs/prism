<?php

# $KYAULabs: positive.php kyau@nova 2026/07/05 -0700 Exp $


# This file intentionally contains a POST form without a CSRF token hidden
# input. The kyaulabs-missing-csrf-token rule must fire (INFO severity).

?>
<form method="post" action="/submit">
    <input type="text" name="username">
    <button type="submit">Send</button>
</form>

// vim: ft=php sts=4 sw=4 ts=4 et :
