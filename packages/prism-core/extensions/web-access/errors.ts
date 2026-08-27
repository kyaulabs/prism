// $KYAULabs: errors.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

export class WebAccessError extends Error {
    readonly code: string;
    readonly fallbackEligible: boolean;

    constructor(code: string, message: string, fallbackEligible = false) {
        super(message);
        this.name = 'WebAccessError';
        this.code = code;
        this.fallbackEligible = fallbackEligible;
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
