// $KYAULabs: consent.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const os = require('node:os');
const path = require('node:path');
const {STATE, inspectManagedRecord, publishManagedRecord, removeManagedRecord} = require('./managed-record');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});
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
    const keys = Object.keys(record).sort().join(',');
    if (record.schemaVersion === 1 && keys === 'ocr,schemaVersion' && typeof record.ocr === 'boolean') {
        return record;
    }
    if (record.schemaVersion === 2 && keys === 'ocr,schemaVersion,webAccess' &&
        typeof record.ocr === 'boolean' && typeof record.webAccess === 'boolean') return record;
    if (record.schemaVersion === 3 && keys === 'schemaVersion,webAccess' &&
        typeof record.webAccess === 'boolean') return record;
    throw new Error();
}

function inspect(context) {
    return inspectManagedRecord({context: managedContext(context), filename: CONSENT_FILE, parse: parseConsentRecord});
}

function requireWebConsent(context = {}) {
    const detail = inspect(context);
    if (detail.state === STATE.UNSAFE || detail.record?.webAccess !== true) {
        throw new ConsentError(EXIT.READINESS, 'standing web-access consent is required');
    }
    return {state: STATE.GRANTED, path: detail.path};
}

function mutate(context, operation) {
    const detail = inspect(context);
    if (detail.state === STATE.UNSAFE) {
        throw new ConsentError(EXIT.TRANSACTION, 'standing consent requires human remediation');
    }
    if (operation !== 'migrate' && detail.record && detail.record.schemaVersion !== 3) {
        throw new ConsentError(EXIT.TRANSACTION, 'legacy consent requires explicit setup migration');
    }
    const webAccess = operation === 'migrate' ? detail.record?.webAccess === true : operation === 'grant-web';
    const record = {schemaVersion: 3, webAccess};
    if (!detail.record && !webAccess) return EXIT.OK;
    if (detail.record?.schemaVersion === 3 && detail.record.webAccess === webAccess && webAccess) return EXIT.OK;
    try {
        if (!webAccess) removeManagedRecord({context: managedContext(context), detail});
        else publishManagedRecord({context: managedContext(context), detail, filename: CONSENT_FILE,
            record, parse: parseConsentRecord});
        return EXIT.OK;
    } catch {
        throw new ConsentError(EXIT.TRANSACTION, 'standing consent mutation failed safely');
    }
}

function consentCommand(args, context = {}) {
    try {
        if (args.length === 2 && args[0] === 'status' && args[1] === '--json') {
            const detail = inspect(context);
            const webAccess = detail.state !== STATE.UNSAFE && detail.record?.webAccess === true;
            process.stdout.write(`${JSON.stringify({schemaVersion: 3, command: 'consent status',
                status: detail.state === STATE.UNSAFE ? STATE.UNSAFE : webAccess ? STATE.GRANTED : STATE.ABSENT,
                webAccess, legacy: Boolean(detail.record && detail.record.schemaVersion !== 3)})}\n`);
            return EXIT.OK;
        }
        if (args.length === 2 && ['migrate', 'grant-web'].includes(args[0]) && args[1] === '--approval=yes') {
            return mutate(context, args[0]);
        }
        if (args.length === 1 && args[0] === 'revoke-web') return mutate(context, args[0]);
        process.stderr.write('usage: prism-tool consent status --json | consent migrate --approval=yes | ' +
            'consent grant-web --approval=yes | consent revoke-web\n');
        return EXIT.USAGE;
    } catch (error) {
        process.stderr.write(`prism-tool: consent ${error instanceof ConsentError ? error.message : 'operation failed'}\n`);
        return error instanceof ConsentError ? error.code : EXIT.TOOL;
    }
}

module.exports = {STATE, consentCommand, requireWebConsent, resolveConsentPath};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
