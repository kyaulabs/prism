// $KYAULabs: constants.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const AUTHORITY_BASE_REFS = Object.freeze(['origin/develop', 'origin/main']);
const CRITERIA_ROLES = Object.freeze(['SPEC', 'PLAN', 'ISSUE', 'CONTEXT']);

const AXES = Object.freeze([
    'tooling-style',
    'structural-smells',
    'requirement-coverage',
    'static-security',
]);

const EXIT = Object.freeze({
    OK: 0,
    USAGE: 2,
    READINESS: 3,
    REVIEW: 4,
});

const OUTCOME = Object.freeze({
    PASS: 'PASS',
    BLOCKING: 'BLOCKING',
    INCONCLUSIVE: 'INCONCLUSIVE',
});

const FINDING_CLASS = Object.freeze({
    BLOCKING: 'BLOCKING',
    ADVISORY: 'ADVISORY',
    SUGGESTED: 'SUGGESTED',
});

const LIMIT = Object.freeze({
    CHANGED_PATHS: 512,
    FILE_BYTES: 262144,
    INPUT_BYTES: 1048576,
    RESOURCE_BYTES: 262144,
    POLICY_BYTES: 1048576,
    TOOL_BYTES: 32768,
    AXIS_FINDINGS: 64,
    REVIEW_FINDINGS: 256,
    VERIFIER_FINDINGS: 16,
    SESSION_TIMEOUT_MS: 600000,
    REVIEW_TIMEOUT_MS: 3600000,
    OUTPUT_BYTES: 1048576,
});

module.exports = {
    AUTHORITY_BASE_REFS,
    AXES,
    CRITERIA_ROLES,
    EXIT,
    FINDING_CLASS,
    LIMIT,
    OUTCOME,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
