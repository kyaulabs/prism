// $KYAULabs: consent.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const os = require('node:os');
const path = require('node:path');
const {
    STATE,
    inspectManagedRecord,
    publishManagedRecord,
    removeManagedRecord,
} = require('./managed-record');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});
const EMPTY_RECORD = Object.freeze({schemaVersion: 2, ocr: false, webAccess: false});
const CONSENT_FILE = 'prism-consent.json';

class ConsentError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function resolveConsentPath(context = {}) {
    if (context.consentPath !== undefined) return path.resolve(context.consentPath);
    const env = context.env ?? process.env;
    const piDir = context.piDir ?? env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
    return path.join(path.resolve(piDir), CONSENT_FILE);
}

function managedContext(context = {}) {
    return {...context, managedPath: resolveConsentPath(context)};
}

function parseConsentRecord(record) {
    if (record === null || Array.isArray(record) || typeof record !== 'object') throw new Error();
    const keys = JSON.stringify(Object.keys(record).sort());
    if (record.schemaVersion === 1 &&
        keys === JSON.stringify(['ocr', 'schemaVersion']) &&
        typeof record.ocr === 'boolean') {
        return {schemaVersion: 2, ocr: record.ocr, webAccess: false};
    }
    if (record.schemaVersion === 2 &&
        keys === JSON.stringify(['ocr', 'schemaVersion', 'webAccess']) &&
        typeof record.ocr === 'boolean' && typeof record.webAccess === 'boolean') {
        return record;
    }
    throw new Error();
}

function inspectConsentDetail(context = {}) {
    const detail = inspectManagedRecord({
        context: managedContext(context),
        filename: CONSENT_FILE,
        parse: parseConsentRecord,
    });
    if (detail.state !== STATE.GRANTED) return detail;
    return {...detail, state: detail.record.ocr ? STATE.GRANTED : STATE.ABSENT};
}

function inspectConsent(context = {}) {
    const detail = inspectConsentDetail(context);
    return {state: detail.state, path: detail.path};
}

function requireOcrConsent(context = {}) {
    const consent = inspectConsent(context);
    if (consent.state !== STATE.GRANTED) {
        throw new ConsentError(EXIT.READINESS, 'standing OCR consent is required');
    }
    return consent;
}

function requireWebConsent(context = {}) {
    const detail = inspectConsentDetail(context);
    if (detail.state === STATE.UNSAFE || detail.record?.webAccess !== true) {
        throw new ConsentError(EXIT.READINESS, 'standing web-access consent is required');
    }
    return {state: STATE.GRANTED, path: detail.path};
}

function detailForMutation(context) {
    const detail = inspectManagedRecord({
        context: managedContext(context),
        filename: CONSENT_FILE,
        parse: parseConsentRecord,
    });
    if (detail.state === STATE.UNSAFE) {
        throw new ConsentError(EXIT.TRANSACTION, 'standing consent requires human remediation');
    }
    return detail;
}

function publish(context, detail, record) {
    try {
        publishManagedRecord({
            context: managedContext(context),
            detail,
            filename: CONSENT_FILE,
            record,
            parse: parseConsentRecord,
        });
        return EXIT.OK;
    } catch {
        throw new ConsentError(EXIT.TRANSACTION, 'standing consent publication failed');
    }
}

function grant(context, capability) {
    const detail = detailForMutation(context);
    const current = detail.record ?? EMPTY_RECORD;
    if (current[capability] === true) return EXIT.OK;
    return publish(context, detail, {...current, schemaVersion: 2, [capability]: true});
}

function revoke(context, capability) {
    const detail = detailForMutation(context);
    if (!detail.record || detail.record[capability] === false) return EXIT.OK;
    const record = {...detail.record, schemaVersion: 2, [capability]: false};
    if (record.ocr || record.webAccess) return publish(context, detail, record);
    try {
        removeManagedRecord({context: managedContext(context), detail});
        return EXIT.OK;
    } catch {
        throw new ConsentError(EXIT.TRANSACTION, 'standing consent record could not be removed safely');
    }
}

function fail(error) {
    if (error instanceof ConsentError) {
        process.stderr.write(`prism-tool: consent ${error.message}\n`);
        return error.code;
    }
    process.stderr.write('prism-tool: consent operation failed\n');
    return EXIT.TOOL;
}

function consentCommand(args, context = {}) {
    try {
        if (args.length === 2 && args[0] === 'status' && args[1] === '--json') {
            const detail = inspectManagedRecord({
                context: managedContext(context),
                filename: CONSENT_FILE,
                parse: parseConsentRecord,
            });
            const ocr = detail.record?.ocr === true;
            const webAccess = detail.record?.webAccess === true;
            const status = detail.state === STATE.UNSAFE
                ? STATE.UNSAFE
                : ocr || webAccess ? STATE.GRANTED : STATE.ABSENT;
            process.stdout.write(`${JSON.stringify({
                schemaVersion: 2,
                command: 'consent status',
                status,
                ocr,
                webAccess,
            })}\n`);
            return EXIT.OK;
        }
        if (args.length === 2 && args[0] === 'grant-ocr' && args[1] === '--approval=yes') {
            return grant(context, 'ocr');
        }
        if (args.length === 2 && args[0] === 'grant-web' && args[1] === '--approval=yes') {
            return grant(context, 'webAccess');
        }
        if (args.length === 1 && args[0] === 'revoke-ocr') return revoke(context, 'ocr');
        if (args.length === 1 && args[0] === 'revoke-web') return revoke(context, 'webAccess');
        process.stderr.write(
            'usage: prism-tool consent status --json | consent grant-ocr --approval=yes | ' +
            'consent revoke-ocr | consent grant-web --approval=yes | consent revoke-web\n'
        );
        return EXIT.USAGE;
    } catch (error) {
        return fail(error);
    }
}

module.exports = {
    STATE,
    consentCommand,
    inspectConsent,
    requireOcrConsent,
    requireWebConsent,
    resolveConsentPath,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
