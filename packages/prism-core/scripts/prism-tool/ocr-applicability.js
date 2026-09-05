// $KYAULabs: ocr-applicability.js kyau@aura.kyaulabs 2026/09/05 -0700 Exp $

'use strict';

const fs = require('node:fs');
const {TextDecoder} = require('node:util');
const {runBounded} = require('./process');

const LIMIT = 1048576;
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REGULAR = new Set(['100644', '100755']);
const MODES = new Set(['000000', '100644', '100755', '120000', '160000']);

class OcrApplicabilityError extends Error {}

function reject() {
    throw new OcrApplicabilityError('OCR applicability could not be proven');
}

function gitBytes(context, args, input) {
    try {
        const result = (context.run ?? runBounded)('git', ['--no-replace-objects', ...args], {
            cwd: fs.realpathSync(context.projectRoot ?? context.cwd ?? process.cwd()),
            env: {...(context.env ?? process.env), GIT_NO_LAZY_FETCH: '1'},
            encoding: null, maxBuffer: LIMIT, timeout: 30000, input,
        });
        if (result.error || result.timedOut || result.status !== 0 ||
            !Buffer.isBuffer(result.stdout) || result.stdout.length > LIMIT) reject();
        return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(result.stdout);
    } catch {
        reject();
    }
}

function parseEntry(header, name, width) {
    const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([ADMT])$/.exec(header);
    if (!match || !name || name.startsWith('/') ||
        name.split('/').some((part) => ['', '.', '..'].includes(part))) reject();
    const [, oldMode, newMode, oldOid, newOid, status] = match;
    const zero = '0'.repeat(width);
    if (![oldMode, newMode].every((mode) => MODES.has(mode)) ||
        oldOid.length !== width || newOid.length !== width ||
        (oldMode === '000000') !== (oldOid === zero) ||
        (newMode === '000000') !== (newOid === zero)) reject();
    if (status === 'A' && (oldMode !== '000000' || newMode === '000000') ||
        status === 'D' && (newMode !== '000000' || oldMode === '000000') ||
        ['M', 'T'].includes(status) && [oldMode, newMode].includes('000000')) reject();
    if (['M', 'T'].includes(status) &&
        ((status === 'T') !== (oldMode.slice(0, 3) !== newMode.slice(0, 3)) ||
        oldMode === newMode && oldOid === newOid)) reject();
    const sides = [[oldMode, oldOid], [newMode, newOid]].filter(([mode]) => mode !== '000000');
    return {
        eligible: /\.(?:md|markdown)$/i.test(name) && sides.every(([mode]) => REGULAR.has(mode)),
        oids: sides.filter(([mode]) => REGULAR.has(mode)).map(([, oid]) => oid),
    };
}

function classifyOcrRange({from, to}, context = {}) {
    if (typeof from !== 'string' || typeof to !== 'string' || !SHA_RE.test(from) ||
        !SHA_RE.test(to) || from.length !== to.length) reject();
    for (const sha of [from, to]) {
        if (gitBytes(context, ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`]) !== `${sha}\n`) reject();
    }
    gitBytes(context, ['merge-base', '--is-ancestor', from, to]);
    const raw = gitBytes(context, [
        'diff', '--raw', '--no-abbrev', '--no-renames', '--no-relative', '--no-ext-diff',
        '--no-textconv', '--no-color', '--ignore-submodules=none', '-z', from, to, '--',
    ]);
    if (!raw || !raw.endsWith('\0')) reject();
    const fields = raw.slice(0, -1).split('\0');
    if (fields.length % 2 !== 0) reject();
    const entries = [];
    const names = new Set();
    for (let index = 0; index < fields.length; index += 2) {
        if (names.has(fields[index + 1])) reject();
        names.add(fields[index + 1]);
        entries.push(parseEntry(fields[index], fields[index + 1], from.length));
    }
    let status = 'REQUIRED';
    if (entries.every(({eligible}) => eligible)) {
        const oids = [...new Set(entries.flatMap((entry) => entry.oids))];
        const input = `${oids.join('\n')}\n`;
        if (Buffer.byteLength(input) > LIMIT) reject();
        const objects = gitBytes(context, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], input);
        if (objects !== `${oids.map((oid) => `${oid} blob`).join('\n')}\n`) reject();
        status = 'MARKDOWN_ONLY';
    }
    return {schemaVersion: 1, from, to, status};
}

module.exports = {OcrApplicabilityError, classifyOcrRange};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
