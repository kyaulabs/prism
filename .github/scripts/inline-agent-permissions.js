// $KYAULabs: inline-agent-permissions.js kyau@cosmos.kyaulabs 2026/08/02 -0700 Exp $




// Walk agent.* in opencode.jsonc and emit TSV rows for each inline agent.
// Usage: node inline-agent-permissions.js <opencode.jsonc-path>
// Emits one row per agent (pipe-separated):
//   name | description | edit | bash_restricted | git_commit | has_permission
//   | sensitive_denies | read_sensitive_denies
// Where:
//   edit            = the permission.edit value ('deny', 'allow', 'ask', or '')
//   bash_restricted = 'true' if bash is fully denied OR has a catch-all deny
//                     entry; 'false' otherwise; '' if bash key is absent.
//   git_commit      = the 'git commit*' verdict ('allow', 'ask', 'deny'), or
//                     '' if the key is absent or bash is not an object.
//   has_permission  = 'true' if the agent defines a permission block (even if
//                     empty); 'false' if no permission key exists at all
//                     (built-in agents with no project-level permission cfg).
//   sensitive_denies = 'true' if the bash object carries the ADR-0047 deny set
//                     ('*.env'/'*.env.*'/'*auth.json*'/'*mcp-auth.json*' deny +
//                     '*.env.example' allow); 'false' if bash is an object
//                     without the full set; '' if bash is absent/not an object.
//   read_sensitive_denies = 'true' if read/glob/grep/list are objects each
//                     carrying env-class denies with '.env.example' allow;
//                     'false' if any is an object without them; '' otherwise.
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

    // git commit* verdict (allow/ask/deny), or '' if absent. Consumed by the
    // inline git-commit gating check (issue #202): a non-denied agent must
    // gate git commit explicitly rather than inherit the permissive default.
    let gitCommit = '';
    if (perm.bash && typeof perm.bash === 'object') {
        const v = perm.bash['git commit*'];
        if (typeof v === 'string') gitCommit = v;
    }

    // Sensitive-path deny contract (ADR-0047): a bash object must carry the
    // five env/auth patterns; read/glob/grep/list objects must deny the env
    // class with '.env.example' allow (last-match-wins). Consumed by the
    // inline sensitive-path deny check in validate-harness.sh.
    let sensitiveDenies = '';
    if (perm.bash && typeof perm.bash === 'object') {
        sensitiveDenies =
            perm.bash['*.env'] === 'deny' &&
            perm.bash['*.env.*'] === 'deny' &&
            perm.bash['*.env.example'] === 'allow' &&
            perm.bash['*auth.json*'] === 'deny' &&
            perm.bash['*mcp-auth.json*'] === 'deny'
                ? 'true'
                : 'false';
    }
    let readSensitiveDenies = '';
    const readTools = ['read', 'glob', 'grep', 'list'];
    if (readTools.every((t) => perm[t] && typeof perm[t] === 'object')) {
        const readOk =
            perm.read['*.env'] === 'deny' &&
            perm.read['*.env.*'] === 'deny' &&
            perm.read['*.env.example'] === 'allow';
        const searchOk = ['glob', 'grep', 'list'].every(
            (t) => perm[t]['*.env*'] === 'deny' && perm[t]['*.env.example*'] === 'allow',
        );
        readSensitiveDenies = readOk && searchOk ? 'true' : 'false';
    }

    process.stdout.write(`${name}|${desc}|${edit}|${bashRestricted}|${gitCommit}|${a.permission !== undefined ? 'true' : 'false'}|${sensitiveDenies}|${readSensitiveDenies}\n`);
}

process.exit(0);




// vim: ft=javascript sts=4 sw=4 ts=4 noet :
