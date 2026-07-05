<?php

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $


# This file uses AJAX/JSON POST (no HTML form element), so the CSRF token
# is sent via JavaScript fetch() with a header. The CSRF heuristic rule
# must NOT fire because no traditional POST form tag is present.

$csrf = bin2hex(random_bytes(32));
$_SESSION['csrf'] = $csrf;

header('Content-Type: text/html; charset=UTF-8');
?>
<p>Form submission handled via fetch() with CSRF in X-CSRF-Token header.</p>
<input type="text" name="username" id="username">
<button type="button" id="submit-btn">Send</button>
<script>
document.getElementById('submit-btn').addEventListener('click', function () {
    fetch('/submit', {
        method: 'POST',
        headers: {'X-CSRF-Token': '<?= htmlspecialchars($csrf) ?>'},
        body: JSON.stringify({username: document.getElementById('username').value}),
    });
});
</script>

// vim: ft=php sts=4 sw=4 ts=4 et :
