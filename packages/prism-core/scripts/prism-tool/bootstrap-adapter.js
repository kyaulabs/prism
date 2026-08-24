// $KYAULabs: bootstrap-adapter.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {registrationFor} = require('./discovery');

function checkoutAdapterRoot(coreRoot) {
    const canonicalCore = fs.realpathSync(coreRoot);
    const packagesRoot = path.dirname(canonicalCore);
    if (path.basename(canonicalCore) !== 'prism-core' || path.basename(packagesRoot) !== 'packages') {
        return null;
    }
    return path.join(packagesRoot, 'prism-php-web');
}

function resolveBootstrapAcquisition({coreRoot, adapter}) {
    const localRoot = checkoutAdapterRoot(coreRoot);
    if (localRoot && fs.existsSync(localRoot)) {
        try {
            const registration = registrationFor(localRoot, adapter.packageName);
            if (
                registration.packageVersion !== adapter.packageVersion ||
                registration.bootstrapProtocol !== adapter.bootstrapProtocol
            ) {
                throw new Error('co-shipped adapter registration mismatch');
            }
            return {
                kind: 'LOCAL',
                installSource: fs.realpathSync(localRoot),
                packageRoot: fs.realpathSync(localRoot),
            };
        } catch {
            throw new Error('co-shipped adapter is incompatible');
        }
    }
    return {
        kind: 'NPM',
        installSource: `npm:${adapter.packageName}@${adapter.packageVersion}`,
        packageRoot: null,
    };
}

module.exports = {resolveBootstrapAcquisition};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
