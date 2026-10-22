'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'packages/prism-core');
const installer = path.join(source, 'scripts/install-global.sh');
const cli = path.join(root, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');

test('real Pi install, source switching and installed refresh preserve custom settings and filters', {timeout: 30000}, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pi-install-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const agent = path.join(directory, 'custom-agent');
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(agent, {mode: 0o700});
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'pi'), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,[${JSON.stringify(cli)},...process.argv.slice(2)],{stdio:'inherit'});process.exit(r.status??1);\n`, {mode: 0o755});
    // Registry/package-manager boundary only. Pi's actual package commands,
    // settings edits and source reconciliation execute unchanged, offline.
    const npm = path.join(bin, 'npm-fixture.cjs');
    fs.writeFileSync(npm, `const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2);
if(args[0]==='view') console.log(JSON.stringify(require(${JSON.stringify(path.join(source, 'package.json'))}).version));
else if(args[0]==='install') {
 const prefix=args[args.indexOf('--prefix')+1];
 const dest=path.join(prefix,'node_modules/@kyaulabs/prism-core');
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(${JSON.stringify(source)},dest,{recursive:true});
} else process.exit(2);
`);
    const settingsFile = path.join(agent, 'settings.json');
    const user = {$schema: 'https://pi.dev/schemas/settings.schema.json', theme: 'custom', futureUserSetting: {preserve: true},
        defaultTools: ['read'], npmCommand: [process.execPath, npm], packages: []};
    fs.writeFileSync(settingsFile, JSON.stringify(user));
    const env = {...process.env, HOME: directory, PI_CODING_AGENT_DIR: agent, PRISM_CORE_SOURCE: source, PATH: `${bin}:${process.env.PATH}`};
    const run = (script = installer, overrides = {}) => {
        const result = spawnSync('bash', [script], {cwd: directory, env: {...env, ...overrides}, encoding: 'utf8', timeout: 15000});
        assert.equal(result.status, 0, result.stderr + result.stdout);
    };
    run();
    assert.equal(fs.existsSync(path.join(agent, 'APPEND_SYSTEM.md')), false);
    let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const localSource = path.relative(agent, source);
    assert.deepEqual(settings.packages, [localSource]);
    const filter = {source: localSource, skills: [], prompts: ['prompts/check.md']};
    settings.packages = [filter];
    fs.writeFileSync(settingsFile, JSON.stringify(settings));
    run();
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.deepEqual(settings.packages, [filter]);
    const npmSource = `npm:@kyaulabs/prism-core@${JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version}`;
    run(installer, {PRISM_CORE_SOURCE: npmSource});
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.deepEqual(settings.packages, [{...filter, source: npmSource}]);
    const installed = path.join(agent, 'npm/node_modules/@kyaulabs/prism-core/scripts/install-global.sh');
    run(installed, {PRISM_CORE_SOURCE: '', PI_CODING_AGENT_DIR: 'custom-agent'});
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')), settings);
    run();
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.deepEqual(settings.packages, [filter]);
    const retained = {...settings};
    const original = {...user};
    delete retained.packages;
    delete original.packages;
    assert.deepEqual(retained, original);
});
