// $KYAULabs: jsonc-strip.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


'use strict';

function stripJsoncComments(content) {
    let stripped = '';
    let i = 0;
    let inString = false;

    while (i < content.length) {
        const ch = content[i];
        if (inString) {
            if (ch === '\\' && i + 1 < content.length) {
                stripped += ch + content[i + 1];
                i += 2;
                continue;
            }
            if (ch === '"') inString = false;
            stripped += ch;
            i++;
            continue;
        }
        if (ch === '"') { inString = true; stripped += ch; i++; continue; }
        if (ch === '/' && content[i + 1] === '/') {
            i += 2;
            while (i < content.length && content[i] !== '\n') i++;
            continue;
        }
        if (ch === '/' && content[i + 1] === '*') {
            i += 2;
            while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        stripped += ch;
        i++;
    }

    return stripped;
}

module.exports = { stripJsoncComments };


// vim: ft=javascript sts=4 sw=4 ts=4 et :
