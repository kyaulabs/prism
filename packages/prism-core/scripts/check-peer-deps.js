// $KYAULabs: check-peer-deps.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

// Verify that any pi bundled-core package imported by a package's extensions/
// is declared in that package.json's peerDependencies.
//
// pi loads each package under its own module root and provides its bundled
// cores (@earendil-works/pi-ai, pi-agent-core, pi-coding-agent, pi-tui,
// typebox) to the host. A package whose extensions import one of these must
// declare it as a peerDependency (never bundle it), or the import fails to
// resolve in a consumer install. See NPM.md and the pi packages doc
// ("Dependencies" section).
//
// Usage: node check-peer-deps.js <package.json>
// Prints one message per violation to stdout (plain text; the caller formats
// and counts). Always exits 0 so the caller controls the exit code.

'use strict';

const fs = require('fs');
const path = require('path');

const PI_CORES = new Set([
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-coding-agent',
    '@earendil-works/pi-tui',
    'typebox',
]);

// Reduce an import specifier to its package root:
//   "@scope/name/sub" -> "@scope/name"
//   "name/sub"        -> "name"
//   "name"            -> "name"
function packageRoot(spec) {
    if (spec.startsWith('@')) {
        const seg = spec.split('/');
        return seg.length >= 2 ? `${seg[0]}/${seg[1]}` : spec;
    }
    return spec.split('/')[0];
}

const pkgJsonPath = process.argv[2];
const rel = pkgJsonPath ? path.relative(process.cwd(), pkgJsonPath) : '<none>';

if (!pkgJsonPath) {
    console.log('check-peer-deps.js: missing package.json path argument');
    process.exit(0);
}

let pkg;
try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
} catch (e) {
    console.log(`${rel}: cannot parse package.json: ${e.message}`);
    process.exit(0);
}

const packageRootDir = path.dirname(pkgJsonPath);
const scanRoots = [
    {label: 'extensions/', path: path.join(packageRootDir, 'extensions')},
    {label: 'scripts/prism-review/', path: path.join(packageRootDir, 'scripts', 'prism-review')},
];

const peers = new Set(Object.keys(pkg.peerDependencies || {}));
const imported = new Set();
const importRe = /\b(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g;

function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            walk(full);
        } else if (/\.[mc]?[tj]s$/.test(ent.name)) {
            const src = fs.readFileSync(full, 'utf8');
            let m;
            while ((m = importRe.exec(src)) !== null) {
                const root = packageRoot(m[1]);
                if (PI_CORES.has(root)) imported.add(root);
            }
        }
    }
}
for (const root of scanRoots) {
    let identity;
    try {
        identity = fs.statSync(root.path);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.log(`${rel}: cannot stat ${root.label}: ${error.message}`);
        }
        continue;
    }
    if (!identity.isDirectory()) continue;
    try {
        walk(root.path);
    } catch (error) {
        console.log(`${rel}: cannot scan ${root.label}: ${error.message}`);
        process.exit(0);
    }
}

for (const core of imported) {
    if (!peers.has(core)) {
        console.log(`${rel}: package imports pi bundled core '${core}' but package.json does not list it in peerDependencies (pi cores are host-provided — declare as peerDependencies, never bundle; see NPM.md)`);
    }
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
