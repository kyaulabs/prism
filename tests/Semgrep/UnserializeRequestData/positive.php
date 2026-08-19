<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# This file intentionally unserializes data from request-reachable
# sources — a deserialization vulnerability. The
# kyaulabs-unserialize-request-data rule must fire on all vectors.

$data = $_POST['serialized'];
$obj = unserialize($data);

// Additional vector: unserialize on php://input body (single-quoted)
$input = file_get_contents('php://input');
$obj2 = unserialize($input);

// Additional vector: unserialize on php://input body (double-quoted)
$input2 = file_get_contents("php://input");
$obj3 = unserialize($input2);

// vim: ft=php sts=4 sw=4 ts=4 et :
