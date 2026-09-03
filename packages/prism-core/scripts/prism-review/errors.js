// $KYAULabs: errors.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

class ReviewError extends Error {
    constructor(exitCode, publicMessage) {
        super(publicMessage);
        this.name = 'ReviewError';
        this.exitCode = exitCode;
        this.publicMessage = publicMessage;
    }
}

module.exports = {ReviewError};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
