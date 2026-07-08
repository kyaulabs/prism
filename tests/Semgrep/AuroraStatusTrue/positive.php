<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@nova 2026/07/05 -0700 Exp $

# This file intentionally contains a violation: Aurora constructor $status
# is a literal true. The kyaulabs-aurora-status-true-literal rule must fire.

$site = new KYAULabs\Aurora("index.html", "/cdn", true, true);

// vim: ft=php sts=4 sw=4 ts=4 et :
