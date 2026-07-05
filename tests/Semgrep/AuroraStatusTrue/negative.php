<?php

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $


declare(strict_types=1);

# This file uses the correct pattern: $status wired to APP_DEBUG via
# named arguments and html=true is safe (literal true for html mode is
# acceptable). The kyaulabs-aurora-status-true-literal rule must NOT fire.

$site = new KYAULabs\Aurora(
    template: "index.html",
    cdn: "/cdn",
    status: (bool)($_ENV['APP_DEBUG'] ?? false),
    html: true,
);

// vim: ft=php sts=4 sw=4 ts=4 et :
