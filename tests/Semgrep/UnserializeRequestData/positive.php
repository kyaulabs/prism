<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@nova 2026/07/05 -0700 Exp $

# This file intentionally unserializes data from $_POST — a deserialization
# vulnerability. The kyaulabs-unserialize-request-data rule must fire.

$data = $_POST['serialized'];
$obj = unserialize($data);

// vim: ft=php sts=4 sw=4 ts=4 et :
