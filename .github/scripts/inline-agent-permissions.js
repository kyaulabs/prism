// $KYAULabs: inline-agent-permissions.js kyau@nova 2026/07/21 -0700 Exp $


// Walk agent.* in opencode.jsonc and emit TSV rows for each inline agent.
// Usage: node inline-agent-permissions.js <opencode.jsonc-path>
// Emits one row per agent (tab-separated):
//   name \t description \t edit \t bash_restricted
// Where:
//   edit            = the permission.edit value ('deny', 'allow', 'ask', or '')
//   bash_restricted = 'true' if bash is fully denied OR has a catch-all deny
//                     entry; 'false' otherwise; '' if bash key is absent.
// Exits 0 on success, 1 on parse error.

'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) {
    console.error('Usage: node inline-agent-permissions.js <opencode.jsonc-path>');
    process.exit(2);
}

let content;
try {
    content = fs.readFileSync(file, 'utf8');
} catch (e) {
    console.error(`Error reading ${file}: ${e.message}`);
    process.exit(1);
}

// Strip JSONC comments (// line comments and /* */ block comments) while
// preserving string content. Mirrors tests/Pest.php strip_jsonc_comments().
content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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

let cfg;
try {
    cfg = JSON.parse(stripped);
} catch (e) {
    console.error(`JSON parse error in ${file}: ${e.message}`);
    process.exit(1);
}

const agents = cfg.agent || {};
for (const name of Object.keys(agents)) {
    const a = agents[name] || {};
    const desc = typeof a.description === 'string' ? a.description : '';
    const perm = a.permission || {};
    const edit = typeof perm.edit === 'string' ? perm.edit : '';
    let bashRestricted = '';
    if (typeof perm.bash === 'string') {
        bashRestricted = perm.bash === 'deny' ? 'true' : 'false';
    } else if (perm.bash && typeof perm.bash === 'object') {
        bashRestricted = perm.bash['*'] === 'deny' ? 'true' : 'false';
    }
    process.stdout.write(`${name}\t${desc}\t${edit}\t${bashRestricted}\n`);
}

process.exit(0);


// vim: ft=javascript sts=4 sw=4 ts=4 noet :
