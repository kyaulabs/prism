// $KYAULabs: glob-match.js kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

// Shared glob-to-regex matcher retained for harness path/rule checkers.
// Implements the legacy permission-pattern wildcard semantics carried by
// those pure checkers: '*' matches zero or more of any character, '?'
// matches exactly one character, everything else literal. A catch-all
// '*' rule therefore matches path values too — this is the documented
// semantics the harness must model, not filesystem glob semantics.

'use strict';

/**
 * Match a permission pattern against a value.
 *
 * @param  {string} pattern  Permission pattern ('*' and '?' wildcards).
 * @param  {string} value    The value to test.
 * @return {boolean}         True when the value matches the pattern.
 */
function globMatches(pattern, value) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`).test(value);
}

module.exports = { globMatches };

// vim: ft=javascript sts=4 sw=4 ts=4 et :
