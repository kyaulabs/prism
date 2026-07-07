<?php

declare(strict_types=1);

# $KYAULabs: .php-cs-fixer.dist.php kyau@nova 2026/07/07 -0700 Exp $

use PhpCsFixer\Config;
use PhpCsFixer\Finder;

return (new Config())
    ->setRiskyAllowed(true)
    ->setRules([
        '@PSR12' => true,
        'declare_strict_types' => true,
    ])
    // 💡 by default, Fixer looks for `*.php` files excluding `./vendor/` - here, you can groom this config
    ->setFinder(
        (new Finder())
            // 💡 root folder to check
            ->in(__DIR__)
            // 💡 exclude third-party dependencies
            ->exclude(['vendor', 'node_modules', 'aurora'])
        // 💡 additional files, eg bin entry file
        // ->append([__DIR__.'/bin-entry-file'])
        // 💡 folders to exclude, if any
        // ->exclude([/* ... */])
        // 💡 path patterns to exclude, if any
        // ->notPath([/* ... */])
        // 💡 extra configs
        // ->ignoreDotFiles(false) // true by default in v3, false in v4 or future mode
        // ->ignoreVCS(true) // true by default
    )
;

// vim: ft=php sts=4 sw=4 ts=4 et :
