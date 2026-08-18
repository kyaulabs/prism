<?php

declare(strict_types=1);

# $KYAULabs: positive.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# This file intentionally contains Aurora constructor calls where $status
# is a literal true. The kyaulabs-aurora-status-true-literal rule must fire
# exactly once per call below (4 findings total).

# 1. Qualified positional — baseline violation.
$a = new KYAULabs\Aurora("index.html", "/cdn", true, true);

# 2. Qualified positional, APP_DEBUG in a later arg — must NOT be suppressed
#    (regression for the pattern-not-regex escape-hatch defect, issue #90).
$b = new KYAULabs\Aurora("index.html", "/cdn", true, env_bool('APP_DEBUG'));

# 3. Fully-qualified (leading backslash) positional — must fire (FQN
#    false-negative defect, issue #90).
$c = new \KYAULabs\Aurora("index.html", "/cdn", true, true);

# 4. Fully-qualified named argument — must fire (FQN false-negative, #90).
$d = new \KYAULabs\Aurora("index.html", "/cdn", status: true);

// vim: ft=php sts=4 sw=4 ts=4 et :
