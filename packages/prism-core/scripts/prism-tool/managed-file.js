// $KYAULabs: managed-file.js kyau@aura.kyaulabs 2026/09/06 -0700 Exp $

'use strict';

function isSafeManagedMode(mode, canonicalMode) {
    const permissions = mode & 0o7777;
    const required = canonicalMode === 0o755 ? 0o500 : 0o400;
    return (permissions & ~canonicalMode) === 0 &&
        (permissions & required) === required;
}

class ManagedFileError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function requireManagedMode(mode, canonicalMode, relativePath) {
    if (isSafeManagedMode(mode, canonicalMode)) return;
    const observed = (mode & 0o7777).toString(8).padStart(4, '0');
    const required = canonicalMode === 0o755 ? '0500' : '0400';
    const allowed = canonicalMode.toString(8).padStart(4, '0');
    throw new ManagedFileError('MANAGED_MODE',
        `managed file permissions are invalid: ${relativePath} (observed ${observed}; requires ${required} within ${allowed})`);
}

module.exports = {ManagedFileError, isSafeManagedMode, requireManagedMode};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
