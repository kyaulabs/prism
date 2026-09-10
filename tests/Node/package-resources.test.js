'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

for (const name of ['prism-core', 'prism-php-web']) {
    test(`${name} packs ordinary Pi resources without engines or catalogue metadata`, t => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-package-'));
        t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
        const packagePath = path.join(root, 'packages', name);
        const report = JSON.parse(execFileSync('npm', ['pack', packagePath, '--json', '--ignore-scripts', '--pack-destination', directory], {encoding:'utf8'}));
        const packed = Array.isArray(report) ? report[0] : Object.values(report)[0];
        const files = packed.files.map(file => file.path);
        const manifest = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));
        assert.equal(manifest.bin, undefined);
        assert.equal(manifest.prism, undefined);
        assert.ok(manifest.pi.skills.length);
        assert.ok(manifest.pi.prompts.length);
        assert.ok(!files.some(file => /prism-tool|prism-review|toolchain|catalogue|safe-dirs/.test(file)));
        assert.ok(files.includes('NOTICE'));
        assert.ok(files.includes(name === 'prism-core' ? 'skills/setup/SKILL.md' : 'skills/setup-php-web/SKILL.md'));
        const extracted = path.join(directory, 'package');
        execFileSync('tar', ['-xzf', path.join(directory, packed.filename), '-C', directory]);
        if (name === 'prism-core') {
            assert.equal(manifest.peerDependencies['@earendil-works/pi-coding-agent'], '*');
            assert.equal(manifest.dependencies['@earendil-works/pi-coding-agent'], undefined);
            for (const file of ['extensions/safety/index.ts', 'extensions/web-access/index.ts', 'scripts/web-access/config.js']) assert.ok(files.includes(file));
            const destination = path.join(directory, 'agent');
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, 'AGENTS.md'), 'User instructions\n');
            require(path.join(extracted, 'scripts/deploy-context')).deployContext(extracted, destination);
            assert.ok(fs.readFileSync(path.join(destination, 'AGENTS.md'), 'utf8').startsWith('User instructions\n'));
            assert.deepEqual(require(path.join(extracted, 'scripts/web-access/config')).inspectWebAccessConfig({piDir:destination}).config,
                {browser:'auto', searxngUrl:null});
        } else {
            assert.ok(files.includes('scripts/coverage-gate.php'));
        }
    });
}
