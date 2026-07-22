<?php

declare(strict_types=1);

# $KYAULabs: ReadOnlyInlineAgentContractTest.php kyau@nova 2026/07/21 -0700 Exp $




use PHPUnit\Framework\Assert;

/**
 * Pest-level regression guard for the inline read-only contract (issue #184).
 *
 * Complements validate-harness.sh's inline-agent check (Tests 28-30) with a
 * PHP-side assertion: every agent defined inline in opencode.jsonc whose
 * description contains a read-only keyword MUST carry edit: deny and a bash
 * catch-all deny. Catches drift on `php vendor/bin/pest` without requiring
 * the shell validator to run.
 *
 * ADR-0006 is the governing contract.
 */

/**
 * Read-only keyword set — mirrors validate-harness.sh RO_KEYWORDS exactly.
 * Keep in sync if the shell-side set changes.
 */
function readonly_inline_keywords(): string
{
    return 'read-only|report only|does not modify|makes no code changes|does not auto-fix|does not automatically fix';
}

/**
 * Yield [name, description, permission] for every inline agent whose
 * description matches a read-only keyword.
 *
 * @return array<int, array{0:string, 1:string, 2:array<string, mixed>}>
 */
function readonly_inline_agents(): array
{
    $cfg = load_opencode_config();
    $agents = $cfg['agent'] ?? [];
    $pattern = '/' . readonly_inline_keywords() . '/i';

    $out = [];
    foreach ($agents as $name => $def) {
        if (!is_array($def)) {
            continue;
        }
        $desc = $def['description'] ?? '';
        if (!is_string($desc) || !preg_match($pattern, $desc)) {
            continue;
        }
        /** @var array<string, mixed> $perm */
        $perm = $def['permission'] ?? [];
        $out[] = [$name, $desc, $perm];
    }

    // Vacuity guard — fail loudly if the keyword set stops matching anything.
    if ($out === []) {
        Assert::fail('No inline read-only agents found — keyword detection may need updating (mirrors validate-harness.sh)');
    }

    return $out;
}

it('every inline read-only agent denies edit', function (): void {
    foreach (readonly_inline_agents() as [$name, $_desc, $perm]) {
        Assert::assertSame(
            'deny',
            $perm['edit'] ?? null,
            "inline agent '{$name}' claims read-only but edit is '" . ($perm['edit'] ?? '<unset>') . "' (must be deny, ADR-0006)",
        );
    }
});

it('every inline read-only agent has bash catch-all deny', function (): void {
    foreach (readonly_inline_agents() as [$name, $_desc, $perm]) {
        $bash = $perm['bash'] ?? null;

        // Acceptable forms per ADR-0006:
        //   - bash: 'deny'                 (full deny)
        //   - bash: { '*': 'deny', ... }   (catch-all deny + scoped allows)
        $restricted = $bash === 'deny'
            || (is_array($bash) && ($bash['*'] ?? null) === 'deny');

        Assert::assertTrue(
            $restricted,
            "inline agent '{$name}' claims read-only but bash is not restricted "
            . "(needs 'bash: deny' or '\"*\": deny' catch-all; got: "
            . json_encode($bash, JSON_UNESCAPED_SLASHES) . ')',
        );
    }
});


// vim: ft=php sts=4 sw=4 ts=4 et :
