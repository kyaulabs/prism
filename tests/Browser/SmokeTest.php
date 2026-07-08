<?php

declare(strict_types=1);

# $KYAULabs: SmokeTest.php kyau@nova 2026/07/04 -0700 Exp $

test('smoke test verifies browser testing infrastructure works', function () {
    visit(browser_base_url() . '/smoke.html')
        ->assertSee('Smoke Test')
        ->assertSee('Browser testing infrastructure is working.');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
