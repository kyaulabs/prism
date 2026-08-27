// $KYAULabs: authorization.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {createRequire} from 'node:module';
import {WebAccessError} from './errors.ts';

const require = createRequire(import.meta.url);

interface ConsentResult {
    state: string;
}

export interface AuthorizationDependencies {
    requireWebConsent?: () => ConsentResult;
}

function launcherRequireWebConsent(): ConsentResult {
    const launcher = require('../../scripts/prism-tool/consent.js') as {
        requireWebConsent(): ConsentResult;
    };
    return launcher.requireWebConsent();
}

export function requireStandingWebAccess(deps: AuthorizationDependencies = {}): void {
    try {
        const consent = (deps.requireWebConsent ?? launcherRequireWebConsent)();
        if (consent.state !== 'GRANTED') throw new Error();
    } catch {
        throw new WebAccessError(
            'WEB_ACCESS_CONSENT_REQUIRED',
            'standing web-access consent is required; run /setup',
        );
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
