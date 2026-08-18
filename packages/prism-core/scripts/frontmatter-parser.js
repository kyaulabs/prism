// $KYAULabs: frontmatter-parser.js kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

// Extract a YAML frontmatter key's value from a Markdown file (or stdin).
// Usage: node frontmatter-parser.js [--stdin] <file> <key>
//   <file> <key>     read content from <file>
//   --stdin <key>    read content from stdin (for staged-blob piping)
// Prints the value to stdout (empty string if not found).
// Exits 1 on parse error.
//
// Note: no shebang — always invoked via `node` (validate-harness.sh, the
// pre-commit skill-frontmatter check). See ADR-0025.
//
// Importable: require('./frontmatter-parser').parseFrontmatter(content)
// returns the typed YAML frontmatter object (or null when absent) and throws
// on malformed YAML; the CLI body only runs when this file is executed
// directly (require.main === module).

'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

function parseFrontmatter(content) {
    const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    if (lines[0] !== '---') return null;

    const fmLines = [];
    let foundClosing = false;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') { foundClosing = true; break; }
        fmLines.push(lines[i]);
    }
    if (!foundClosing) return null;

    const doc = yaml.load(fmLines.join('\n'));
    return doc && typeof doc === 'object' ? doc : null;
}

function runCli(argv) {
    const useStdin = argv[2] === '--stdin';
    const file = useStdin ? null : argv[2];
    const key = argv[3];
    const label = useStdin ? '<stdin>' : file;

    if ((useStdin && !key) || (!useStdin && (!file || !key))) {
        console.error(useStdin
            ? 'Usage: node frontmatter-parser.js --stdin <key>'
            : 'Usage: node frontmatter-parser.js [--stdin] <file> <key>');
        return 2;
    }

    let content;
    try {
        content = useStdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
    } catch (error) {
        console.error(`Error reading ${useStdin ? 'stdin' : 'file'}: ${error.message}`);
        return 1;
    }

    let doc;
    try {
        doc = parseFrontmatter(content);
    } catch (error) {
        console.error(`YAML parse error in ${label}: ${error.message}`);
        return 1;
    }

    const value = doc === null ? undefined : doc[key];
    process.stdout.write(value === undefined || value === null ? '' : String(value));
    return 0;
}

module.exports = { parseFrontmatter };

if (require.main === module) {
    process.exitCode = runCli(process.argv);
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
