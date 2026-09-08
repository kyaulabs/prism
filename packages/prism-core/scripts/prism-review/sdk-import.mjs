// $KYAULabs: sdk-import.mjs kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

export function resolveEntry() {
    return import.meta.resolve('@earendil-works/pi-coding-agent');
}

export function importSdk() {
    return import('@earendil-works/pi-coding-agent');
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
