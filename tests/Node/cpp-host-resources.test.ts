import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {hostFixture} from './pi-host-fixture.ts';

const root = path.resolve(import.meta.dirname, '../..');
const names = ['cpp-stack', 'setup-cpp', 'cpp-build', 'tdd-cpp', 'cpp-review'];

test('packed Core/CPP/PHP coexist, commands expand and native filters survive reload', async t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-cpp-host-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const packages = ['prism-core', 'prism-cpp', 'prism-php-web'].map(name => {
        const destination = path.join(temp, name);
        fs.mkdirSync(destination);
        const report = JSON.parse(execFileSync('npm', ['pack', path.join(root, 'packages', name), '--json', '--ignore-scripts', '--pack-destination', destination], {encoding: 'utf8'}));
        const packed = Array.isArray(report) ? report[0] : Object.values(report)[0] as {filename: string};
        execFileSync('tar', ['-xzf', path.join(destination, packed.filename), '-C', destination]);
        const extracted = path.join(destination, 'package');
        if (name === 'prism-core') fs.symlinkSync(path.join(root, 'node_modules'), path.join(extracted, 'node_modules'), 'dir');
        return extracted;
    });
    for (const selection of [packages.slice(0, 1), packages.slice(0, 2), packages]) {
        const target = await hostFixture(t, {}, {packages: selection});
        const skills = target.loader.getSkills();
        assert.deepEqual(skills.diagnostics, []);
        assert.deepEqual(target.loader.getPrompts().diagnostics, []);
        assert.equal(new Set(skills.skills.map(skill => skill.name)).size, skills.skills.length);
        assert.equal(target.loader.getExtensions().extensions.filter(extension => extension.path.startsWith(packages[0])).length, 2);
        assert.ok(target.session.getAllTools().some(tool => tool.name === 'web_search'));
        if (selection.length === 1) { assert.ok(!skills.skills.some(s => s.name === 'cpp-stack')); continue; }
        for (const name of names) assert.ok(skills.skills.some(s => s.name === name));
        assert.ok(target.loader.getPrompts().prompts.some(p => p.name === 'check-cpp'));
        assert.equal((await target.run('read', {path: path.join(packages[1], 'README.md')}, '/skill:cpp-stack plain CPU utility')).isError, false);
        assert.ok(JSON.stringify(target.session.messages).includes('<skill name=\\"cpp-stack\\"'));
        await target.run('read', {path: path.join(packages[1], 'README.md')}, '/check-cpp baseline');
        assert.ok(JSON.stringify(target.session.messages).includes('Check C++ scope: baseline'));
        // Core stays global, CPP is project-local, and unrelated PHP remains.
        target.settings.setProjectTrusted(true);
        target.settings.setPackages([packages[0], ...selection.slice(2)]);
        target.settings.setProjectPackages([packages[1]]);
        await target.session.reload();
        assert.ok(target.loader.getSkills().skills.some(s => s.name === 'cpp-stack'));
        const before = target.settings.getGlobalSettings();
        target.settings.setProjectPackages([{source: packages[1], skills: [], prompts: ['prompts/check-cpp.md']}]);
        await target.session.reload();
        assert.ok(!target.loader.getSkills().skills.some(s => names.includes(s.name)));
        assert.ok(target.loader.getSkills().skills.some(s => s.name === 'setup'));
        assert.ok(target.loader.getPrompts().prompts.some(p => p.name === 'check-cpp'));
        assert.deepEqual(target.settings.getGlobalSettings(), before);
    }
});

test('native project-local CPP install/remove preserves synthetic project settings and unrelated packages', t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-cpp-install-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const agent = path.join(temp, 'agent');
    fs.mkdirSync(agent, {mode: 0o700});
    fs.mkdirSync(path.join(temp, '.pi'));
    const file = path.join(temp, '.pi/settings.json');
    const original = {futureSetting: {preserve: true}, packages: [{source: '/synthetic/unrelated', skills: []}]};
    fs.writeFileSync(file, JSON.stringify(original));
    const source = path.join(root, 'packages/prism-cpp');
    const cli = path.join(root, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
    const invoke = (command: string) => execFileSync(process.execPath, [cli, command, '--local', '--approve', source], {
        cwd: temp, env: {...process.env, HOME: temp, PI_CODING_AGENT_DIR: agent}, encoding: 'utf8',
    });
    invoke('install'); invoke('install');
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(settings.futureSetting, original.futureSetting);
    assert.deepEqual(settings.packages[0], original.packages[0]);
    assert.equal(settings.packages.length, 2);
    invoke('remove');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original);
});

test('native malformed skills and duplicate names produce diagnostics rather than merged guidance', async t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-cpp-collision-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    fs.mkdirSync(path.join(temp, 'skills/bad'), {recursive: true});
    fs.mkdirSync(path.join(temp, 'skills/cpp-stack'), {recursive: true});
    fs.writeFileSync(path.join(temp, 'skills/bad/SKILL.md'), '---\nname: bad\n---\nMissing description\n');
    fs.writeFileSync(path.join(temp, 'skills/cpp-stack/SKILL.md'), '---\nname: cpp-stack\ndescription: Duplicate fixture\n---\nDuplicate\n');
    const target = await hostFixture(t, {}, {packages: [path.join(root, 'packages/prism-cpp'), temp]});
    assert.equal(target.loader.getSkills().skills.filter(s => s.name === 'cpp-stack').length, 1);
    assert.ok(!target.loader.getSkills().skills.some(s => s.name === 'bad'));
    assert.match(JSON.stringify(target.loader.getSkills().diagnostics), /collision|duplicate/i);
    assert.match(JSON.stringify(target.loader.getSkills().diagnostics), /description/i);
});
