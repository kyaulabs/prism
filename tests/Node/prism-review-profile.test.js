// $KYAULabs: prism-review-profile.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {canonicalize, digestJson} = require('../../packages/prism-core/scripts/prism-review/canonical-json');
const {
    buildReviewPlan,
    loadAdapterProfile,
    loadCoreProfile,
} = require('../../packages/prism-core/scripts/prism-review/profile');

const AXES = [
    'tooling-style',
    'structural-smells',
    'requirement-coverage',
    'static-security',
];
const RESOURCE_IDS = ['session', 'tooling', 'structure', 'requirements', 'security', 'verifier'];

function tempRoot(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-profile-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return root;
}

function skillBytes(name, padding = '') {
    return Buffer.from(`---\nname: ${name}\ndescription: Fixture skill.\n---\n\n# ${name}\n${padding}\n`);
}

function coreProfile() {
    return {
        schemaVersion: 1,
        package: '@fixture/core',
        role: 'core',
        resources: RESOURCE_IDS.map((id) => ({
            id,
            path: `skills/${id}/SKILL.md`,
            license: 'AGPL-3.0-only',
        })),
        sessionSkill: 'session',
        verifierSkills: ['verifier'],
        exemptions: [],
        axes: [
            {id: 'tooling-style', lenses: [
                {id: 'core.tooling', skill: 'tooling', trigger: {mode: 'always'}},
            ]},
            {id: 'structural-smells', lenses: [
                {id: 'core.structure', skill: 'structure', trigger: {mode: 'always'}},
            ]},
            {id: 'requirement-coverage', lenses: [
                {id: 'core.requirements', skill: 'requirements', trigger: {mode: 'always'}},
            ]},
            {id: 'static-security', lenses: [
                {id: 'core.security', skill: 'security', trigger: {mode: 'always'}},
            ]},
        ],
    };
}

function adapterProfile() {
    return {
        schemaVersion: 1,
        package: '@fixture/adapter',
        role: 'adapter',
        resources: [{
            id: 'php',
            path: 'skills/php/SKILL.md',
            license: 'AGPL-3.0-only',
        }],
        exemptions: [],
        axes: [{
            id: 'tooling-style',
            lenses: [{
                id: 'adapter.php',
                skill: 'php',
                trigger: {
                    mode: 'paths',
                    suffixes: ['.php'],
                    prefixes: ['app/'],
                    basenames: ['composer.json'],
                },
            }],
        }],
    };
}

function writeProfilePackage(root, profile, options = {}) {
    fs.mkdirSync(path.join(root, 'config'), {recursive: true});
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({
        name: options.packageName ?? profile.package,
        version: '1.0.0',
    })}\n`);
    const profilePath = path.join(root, 'config', 'prism-review.json');
    fs.writeFileSync(profilePath, options.profileBytes ?? `${JSON.stringify(profile, null, 2)}\n`);
    for (const resource of profile.resources ?? []) {
        const resourcePath = path.join(root, ...resource.path.split('/'));
        fs.mkdirSync(path.dirname(resourcePath), {recursive: true});
        const name = path.basename(path.dirname(resourcePath));
        fs.writeFileSync(resourcePath, options.resourceBytes?.[resource.id] ?? skillBytes(name));
    }
    return profilePath;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadFixture(t, mutate = () => {}, options = {}) {
    const root = tempRoot(t);
    const profile = coreProfile();
    mutate(profile);
    writeProfilePackage(root, profile, options);
    return {root, profile};
}

test('canonical JSON is stable, ordered, and closed to non-JSON values', () => {
    assert.equal(canonicalize({z: [3, {b: 2, a: 1}], a: true}), '{"a":true,"z":[3,{"a":1,"b":2}]}');
    assert.equal(digestJson({b: 2, a: 1}), digestJson({a: 1, b: 2}));
    for (const value of [
        undefined,
        NaN,
        Infinity,
        9007199254740992,
        {x: undefined},
        [undefined],
        Array(1),
        new Date(),
    ]) {
        assert.throws(() => canonicalize(value));
    }
});

test('loads the complete Core profile with deterministic resource and policy digests', (t) => {
    const {root} = loadFixture(t);

    const loaded = loadCoreProfile({packageRoot: root});

    assert.equal(loaded.packageName, '@fixture/core');
    assert.equal(loaded.role, 'core');
    assert.deepEqual(loaded.profile.axes.map(({id}) => id), AXES);
    assert.equal(loaded.resources.length, 6);
    assert.match(loaded.profileDigest, /^[0-9a-f]{64}$/);
    assert.match(loaded.policyDigest, /^[0-9a-f]{64}$/);
    assert.equal(new Set(loaded.resources.map(({sha256}) => sha256)).size, 6);
});

test('selects additive lenses from both old and new rename paths', (t) => {
    const coreRoot = tempRoot(t);
    writeProfilePackage(coreRoot, coreProfile());
    const adapterRoot = tempRoot(t);
    const adapter = adapterProfile();
    const reviewPath = writeProfilePackage(adapterRoot, adapter);
    const core = loadCoreProfile({packageRoot: coreRoot});
    const extension = loadAdapterProfile({
        registration: {
            packageName: '@fixture/adapter',
            packageRoot: adapterRoot,
            reviewPath,
        },
    });

    const plan = buildReviewPlan({
        core,
        adapter: extension,
        changedPaths: [{oldPath: 'app/legacy.php', newPath: 'docs/legacy.txt'}],
    });

    assert.deepEqual(plan.axes.map(({id}) => id), AXES);
    assert.deepEqual(plan.axes[0].lenses.map(({id}) => id), ['core.tooling', 'adapter.php']);
    assert.deepEqual(plan.axes.slice(1).map(({lenses}) => lenses.length), [1, 1, 1]);
    assert.match(plan.policyDigest, /^[0-9a-f]{64}$/);
    assert.match(plan.planDigest, /^[0-9a-f]{64}$/);
    assert.equal(
        buildReviewPlan({core, adapter: extension, changedPaths: ['z.txt', 'a.php']}).planDigest,
        buildReviewPlan({core, adapter: extension, changedPaths: ['a.php', 'z.txt']}).planDigest
    );
});

test('enforces closed profile, axis, trigger, and resource schemas', (t) => {
    const cases = [
        ['unknown profile key', (p) => { p.unknown = true; }],
        ['package identity', (p) => { p.package = '@fixture/other'; }, {packageName: '@fixture/core'}],
        ['role', (p) => { p.role = 'adapter'; }],
        ['duplicate resource', (p) => { p.resources[1].id = p.resources[0].id; }],
        ['missing session control', (p) => { delete p.sessionSkill; }],
        ['missing axis', (p) => { p.axes.pop(); }],
        ['axis order', (p) => { p.axes.reverse(); }],
        ['duplicate lens', (p) => { p.axes[1].lenses[0].id = p.axes[0].lenses[0].id; }],
        ['unknown skill', (p) => { p.axes[0].lenses[0].skill = 'absent'; }],
        ['glob trigger', (p) => { p.axes[0].lenses[0].trigger = {mode: 'paths', suffixes: ['.*']}; }],
        ['unsorted trigger', (p) => { p.axes[0].lenses[0].trigger = {mode: 'paths', suffixes: ['.z', '.a']}; }],
        ['path escape', (p) => { p.resources[0].path = '../SKILL.md'; }],
        ['invalid source metadata', (p) => {
            p.resources[0].source = {
                repository: 'http://github.com/example/source',
                revision: 'a'.repeat(40),
                path: 'skills/session/SKILL.md',
                sha256: 'b'.repeat(64),
                license: 'CC0-1.0',
                changes: 'Adapted for the fixture.',
            };
        }],
    ];
    for (const [label, mutate, options = {}] of cases) {
        const root = path.join(tempRoot(t), label.replaceAll(' ', '-'));
        const profile = coreProfile();
        mutate(profile);
        writeProfilePackage(root, profile, options);
        assert.throws(() => loadCoreProfile({packageRoot: root}), undefined, label);
    }
});

test('validates fixed metadata exemptions without exempting regular text', (t) => {
    const {root} = loadFixture(t, (profile) => {
        profile.exemptions = [{
            id: 'metadata.binary',
            axes: [...AXES],
            kind: 'binary',
            trigger: {mode: 'always'},
            reason: 'Binary content has no reviewable UTF-8 bytes.',
        }];
    });
    const loaded = loadCoreProfile({packageRoot: root});

    assert.equal(loaded.profile.exemptions[0].id, 'metadata.binary');
    assert.throws(() => buildReviewPlan({
        core: loaded,
        changedPaths: [{newPath: 'image.bin', kind: 'binary', text: true}],
    }), /regular text/);
    assert.throws(() => buildReviewPlan({
        core: loaded,
        changedPaths: [{newPath: 'image.bin', kind: 'invented', text: false}],
    }), /descriptor/);

    const invalid = loadFixture(t, (profile) => {
        profile.exemptions = [{
            id: 'metadata.binary',
            axes: ['static-security', 'tooling-style'],
            kind: 'binary',
            trigger: {mode: 'always'},
            reason: 'fixed',
        }];
    });
    assert.throws(() => loadCoreProfile({packageRoot: invalid.root}));
});

test('rejects symlinked, executable, non-regular, invalid UTF-8, and oversized resources', (t) => {
    const cases = [
        ['symlink', (root, file) => {
            const target = path.join(root, 'target.md');
            fs.writeFileSync(target, skillBytes('session'));
            fs.rmSync(file);
            fs.symlinkSync(target, file);
        }],
        ['executable', (_root, file) => fs.chmodSync(file, 0o755)],
        ['non-regular', (_root, file) => { fs.rmSync(file); fs.mkdirSync(file); }],
        ['invalid UTF-8', (_root, file) => fs.writeFileSync(file, Buffer.from([0xff, 0xfe]))],
        ['bad frontmatter', (_root, file) => fs.writeFileSync(file, skillBytes('wrong-name'))],
        ['malformed frontmatter', (_root, file) => fs.writeFileSync(file, '---\nname: [\n---\n')],
        ['oversized', (_root, file) => fs.writeFileSync(file, skillBytes('session', 'x'.repeat(262145)))],
    ];
    for (const [label, mutate] of cases) {
        const {root} = loadFixture(t);
        const file = path.join(root, 'skills', 'session', 'SKILL.md');
        mutate(root, file);
        assert.throws(() => loadCoreProfile({packageRoot: root}), undefined, label);
    }
});

test('rejects intermediate resource symlinks and aggregate policy overflow', (t) => {
    const intermediate = loadFixture(t);
    const outside = path.join(tempRoot(t), 'skills');
    fs.renameSync(path.join(intermediate.root, 'skills'), outside);
    fs.symlinkSync(outside, path.join(intermediate.root, 'skills'));
    assert.throws(() => loadCoreProfile({packageRoot: intermediate.root}));

    const padding = 'x'.repeat(180000);
    const resourceBytes = Object.fromEntries(RESOURCE_IDS.map((id) => [id, skillBytes(id, padding)]));
    const aggregate = loadFixture(t, () => {}, {resourceBytes});
    assert.throws(() => loadCoreProfile({packageRoot: aggregate.root}), /policy/i);
});

test('validates adapter subsets and prevents Core lens replacement', (t) => {
    const coreRoot = tempRoot(t);
    writeProfilePackage(coreRoot, coreProfile());
    const core = loadCoreProfile({packageRoot: coreRoot});
    const roots = [];
    for (const mutate of [
        (p) => { p.axes.push(clone(p.axes[0])); },
        (p) => { p.axes[0].id = 'unknown-axis'; },
        (p) => { p.sessionSkill = 'php'; },
    ]) {
        const root = tempRoot(t);
        roots.push(root);
        const profile = adapterProfile();
        mutate(profile);
        const reviewPath = writeProfilePackage(root, profile);
        assert.throws(() => loadAdapterProfile({
            registration: {packageName: '@fixture/adapter', packageRoot: root, reviewPath},
        }));
    }

    const collisionRoot = tempRoot(t);
    const collision = adapterProfile();
    collision.axes[0].lenses[0].id = 'core.tooling';
    const reviewPath = writeProfilePackage(collisionRoot, collision);
    const loaded = loadAdapterProfile({
        registration: {packageName: '@fixture/adapter', packageRoot: collisionRoot, reviewPath},
    });
    assert.throws(() => buildReviewPlan({core, adapter: loaded, changedPaths: ['file.php']}));
});

test('rejects a symlink-substituted adapter profile registration', (t) => {
    const root = tempRoot(t);
    const reviewPath = writeProfilePackage(root, adapterProfile());
    const target = path.join(root, 'config', 'target.json');
    fs.renameSync(reviewPath, target);
    fs.symlinkSync(target, reviewPath);

    assert.throws(() => loadAdapterProfile({
        registration: {packageName: '@fixture/adapter', packageRoot: root, reviewPath},
    }));
});

test('reads protected-base adapter profile and skills only through immutable Git blobs', (t) => {
    const repositoryRoot = tempRoot(t);
    const packageRoot = path.join(repositoryRoot, 'packages', 'adapter');
    const profile = adapterProfile();
    const reviewPath = writeProfilePackage(packageRoot, profile, {
        profileBytes: '{worktree profile must not be read',
        resourceBytes: {php: Buffer.from('worktree skill must not be read')},
    });
    const blobs = new Map([
        ['packages/adapter/config/prism-review.json', Buffer.from(`${JSON.stringify(profile)}\n`)],
        ['packages/adapter/skills/php/SKILL.md', skillBytes('php')],
    ]);
    const reads = [];

    const loaded = loadAdapterProfile({
        registration: {packageName: '@fixture/adapter', packageRoot, reviewPath},
        repositoryRoot,
        protectedBase: 'a'.repeat(40),
        readGitBlob(base, relativePath) {
            reads.push({base, relativePath});
            if (!blobs.has(relativePath)) throw new Error('unexpected blob');
            return blobs.get(relativePath);
        },
    });

    assert.equal(loaded.packageName, '@fixture/adapter');
    assert.deepEqual(reads, [
        {base: 'a'.repeat(40), relativePath: 'packages/adapter/config/prism-review.json'},
        {base: 'a'.repeat(40), relativePath: 'packages/adapter/skills/php/SKILL.md'},
    ]);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
