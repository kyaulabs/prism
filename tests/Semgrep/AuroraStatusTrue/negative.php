<?php

declare(strict_types=1);

# $KYAULabs: negative.php kyau@nova 2026/07/05 -0700 Exp $

# This file uses the correct pattern: $status wired to APP_DEBUG via
# env_bool() — filter_var coercion prevents the (bool) cast bug where
# the string "false" is cast to true. The kyaulabs-aurora-status-true-literal
# rule must NOT fire.

$site = new KYAULabs\Aurora(
    template: "index.html",
    cdn: "/cdn",
    status: env_bool('APP_DEBUG'),
    html: true,
);

// vim: ft=php sts=4 sw=4 ts=4 et :
