<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@nova 2026/07/14 -0700 Exp $




# This file intentionally hardcodes display_errors to enabled values —
# bypassing the Aurora constructor's $status parameter. The
# kyaulabs-hardcoded-display-errors-on rule must fire once per call
# below (10 findings).

ini_set('display_errors', '1');
ini_set('display_errors', 1);
ini_set('display_errors', 'On');
ini_set('display_errors', "On");
ini_set('display_errors', 'true');
ini_set('display_errors', "true");
ini_set('display_errors', true);
ini_set('display_errors', 'yes');
ini_set('display_errors', "yes");
ini_set("display_errors", "On");


// vim: ft=php sts=4 sw=4 ts=4 et :
