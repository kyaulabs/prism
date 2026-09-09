// $KYAULabs: readiness.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const CODES = Object.freeze({
    SDK_MISSING: 'Reinstall Core with its declared runtime dependencies using the supported installer.',
    SDK_METADATA_INVALID: 'Restore the verified Core dependency graph; SDK metadata could not be validated.',
    SDK_PROVENANCE_INVALID: 'Restore an SDK dependency outside the repository being reviewed.',
    SDK_API_UNSUPPORTED: 'Use a Core release tested with this SDK or restore its verified dependency graph.',
    SDK_LOAD_FAILED: 'Restore the verified Core dependency graph; an SDK import or transitive dependency failed.',
    AUTHORITY_INELIGIBLE: 'Use an installed Core package outside the repository being reviewed.',
    MODEL_CONTROLS_INVALID: 'Select the provider, model, and reasoning level in Pi, then retry.',
    MODEL_UNAVAILABLE: 'Verify the selected model exists in the active Pi model catalogue.',
    MODEL_REASONING_UNSUPPORTED: 'Select a reasoning level supported by the active model in Pi.',
    MODEL_RUNTIME_FAILED: 'Verify local Pi model configuration using Pi; no authentication probe was performed.',
    RESOURCE_ISOLATION_FAILED: 'Use a compatible verified Core and Pi SDK pair; isolated resources could not be validated.',
    PROFILE_INVALID: 'Restore the matching package-owned review profile and policy resources.',
    ADAPTER_PROVIDER_INVALID: 'Install the matching external adapter quality provider and verify its protected-base identity.',
    RECEIPT_STATE_UNSAFE: 'Inspect existing authority receipts with the supported read-only commands before recovery.',
    CLEANUP_FAILED: 'Inspect task-owned temporary state before retrying; cleanup did not complete.',
    RUNTIME_READINESS_FAILED: 'Verify local reviewer prerequisites; no review attempt was started.',
});
const trusted = new WeakMap();

function readinessError(code) {
    if (!Object.hasOwn(CODES, code)) throw new TypeError('unknown readiness code');
    const error = new Error(code);
    trusted.set(error, code);
    return error;
}

function diagnostic(error, fallback = 'RUNTIME_READINESS_FAILED') {
    const reason = trusted.get(error) ?? (Object.hasOwn(CODES, fallback) ? fallback : 'RUNTIME_READINESS_FAILED');
    return Object.freeze({reason, remediation: CODES[reason]});
}

function atStage(code, action) {
    try {
        return action();
    } catch (error) {
        throw trusted.has(error) ? error : readinessError(code);
    }
}

async function atStageAsync(code, action) {
    try {
        return await action();
    } catch (error) {
        throw trusted.has(error) ? error : readinessError(code);
    }
}

module.exports = {readinessError, diagnostic, atStage, atStageAsync};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
