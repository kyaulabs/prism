<?php

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $


declare(strict_types=1);

# This file sets display_errors off or delegates to Aurora. The
# kyaulabs-hardcoded-display-errors-on rule must NOT fire.

ini_set('display_errors', '0');

# Aurora-managed: constructor $status handles this
$site = new KYAULabs\Aurora(
    template: "index.html",
    cdn: "/cdn",
    status: (bool)($_ENV['APP_DEBUG'] ?? false),
    html: true,
);

// vim: ft=php sts=4 sw=4 ts=4 et :
