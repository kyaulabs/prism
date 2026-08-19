<?php

declare(strict_types=1);

# $KYAULabs: negative.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# This file sets display_errors to disabled values or delegates to
# Aurora. The kyaulabs-hardcoded-display-errors-on rule must NOT fire.

ini_set('display_errors', '0');
ini_set('display_errors', 0);
ini_set('display_errors', 'Off');
ini_set('display_errors', "Off");
ini_set('display_errors', 'false');
ini_set('display_errors', "false");
ini_set('display_errors', false);
ini_set('display_errors', 'no');
ini_set('display_errors', "no");

# Aurora-managed: constructor $status handles this
$site = new KYAULabs\Aurora(
    template: "index.html",
    cdn: "/cdn",
    status: env_bool('APP_DEBUG'),
    html: true,
);

// vim: ft=php sts=4 sw=4 ts=4 et :
