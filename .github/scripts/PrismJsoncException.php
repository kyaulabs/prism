<?php

declare(strict_types=1);

# $KYAULabs: PrismJsoncException.php kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $




namespace KYAULabs\Prism;

/**
 * Fail-closed exception for the Prism JSONC document boundary.
 *
 * Thrown by {@see PrismJsoncDocument} for every rejected input: malformed
 * JSONC, unterminated strings or comments, control characters, malformed
 * numbers, duplicate object keys, excessive nesting or size, multiple root
 * values, and unsafe (symlink) file inputs. Diagnostics never embed decoded
 * values, preserving the secret-redaction invariant from ADR-0043.
 */
final class PrismJsoncException extends \RuntimeException
{
}


// vim: ft=php sts=4 sw=4 ts=4 et :
