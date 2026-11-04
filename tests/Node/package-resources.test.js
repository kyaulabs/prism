'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

const resources = {
    'prism-core': ['skills/tdd/SKILL.md'],
    'prism-php-web': ['skills/tdd-php/SKILL.md', 'scripts/coverage-gate.php'],
    'prism-cpp': [
        ...['cpp-stack', 'cpp-build', 'tdd-cpp', 'cpp-review'].map(name => `skills/${name}/SKILL.md`),
        ...['lifetime', 'strong-types', 'errors', 'concurrency', 'performance', 'build-tooling'].map(name => `skills/cpp-stack/references/${name}.md`),
        'prompts/check-cpp.md', 'docs/verification.md',
    ],
};
for (const [name, required] of Object.entries(resources)) {
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
        assert.ok(!files.some(file => /prism-tool|prism-review|catalogue|safe-dirs/.test(file)));
        assert.ok(files.includes('NOTICE'));
        for (const file of required) assert.ok(files.includes(file), `${name}: missing ${file}`);
        const expectedSkills = {
            'prism-core': ['adr', 'architect', 'audit-deps', 'brainstorming', 'code-review', 'conventional-commits', 'debug', 'distill', 'docs-writer', 'pi-docs', 'prototype', 'research', 'security-coding', 'tdd', 'test-audit', 'tracker-operator', 'writing-plans', 'writing-skills'],
            'prism-php-web': ['accessibility', 'architect-php', 'aurora-page', 'database', 'frontend-architecture', 'frontend-design', 'pest-browser', 'php-web-stack', 'rcs-header', 'scss-mobile-first', 'security-coding-php', 'tdd-php', 'visual-review'],
            'prism-cpp': ['cpp-build', 'cpp-review', 'cpp-stack', 'tdd-cpp'],
        };
        assert.deepEqual(files.filter(file => file.endsWith('/SKILL.md')).map(file => file.split('/')[1]).sort(), expectedSkills[name].sort());
        const expectedPrompts = {
            'prism-core': ['check', 'improve-architecture', 'issue', 'issues', 'pr', 'prime', 'release', 'research', 'router', 'security', 'teach', 'ticket', 'tickets'],
            'prism-php-web': ['build-assets', 'check-php', 'deploy'],
            'prism-cpp': ['check-cpp'],
        };
        assert.deepEqual(files.filter(file => /^prompts\/[^/]+\.md$/.test(file)).map(file => path.basename(file, '.md')).sort(), expectedPrompts[name]);
        const extracted = path.join(directory, 'package');
        execFileSync('tar', ['-xzf', path.join(directory, packed.filename), '-C', directory]);
        // Resolve bundled Markdown links from an unrelated consumer directory.
        for (const file of files.filter(file => file.endsWith('/SKILL.md'))) {
            const text = fs.readFileSync(path.join(extracted, file), 'utf8');
            assert.ok(text.startsWith('---\n'), `${file}: frontmatter must start at byte zero`);
            for (const link of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
                if (!link[1].includes('://')) assert.ok(fs.existsSync(path.resolve(extracted, path.dirname(file), link[1])), `${file}: ${link[1]}`);
            }
        }
        if (name === 'prism-core') {
            assert.equal(files.includes('APPEND_SYSTEM.md'), false);
            assert.equal(fs.existsSync(path.join(packagePath, 'APPEND_SYSTEM.md')), false);
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
        } else if (name === 'prism-cpp') {
            assert.equal(manifest.name, '@kyaulabs/prism-cpp');
            assert.equal(manifest.license, 'AGPL-3.0-only');
            assert.equal(manifest.publishConfig.access, 'public');
            assert.ok(manifest.keywords.includes('pi-package'));
            for (const key of ['dependencies', 'peerDependencies', 'scripts']) assert.equal(manifest[key], undefined);
            assert.deepEqual(Object.keys(manifest.pi).sort(), ['prompts', 'skills']);
            assert.equal(files.filter(file => file.endsWith('/SKILL.md')).length, 4);
            assert.ok(!files.some(file => /^(tests|build|node_modules)\//.test(file)));
            for (const file of files.filter(file => file.endsWith('.md'))) {
                const text = fs.readFileSync(path.join(extracted, file), 'utf8');
                for (const link of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
                    if (!link[1].includes('://')) assert.ok(fs.existsSync(path.resolve(extracted, path.dirname(file), link[1])), `${file}: ${link[1]}`);
                }
            }
        }
    });
}
