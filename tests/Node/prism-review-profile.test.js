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
const CORE_PACKAGE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_PACKAGE_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');

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

test('loads the complete packaged Core review policy', () => {
    const packageRoot = path.resolve(__dirname, '../../packages/prism-core');

    const loaded = loadCoreProfile({packageRoot});

    assert.equal(loaded.resources.length, 14);
    assert.deepEqual(loaded.profile.axes.map(({id}) => id), AXES);
    assert.deepEqual(loaded.profile.axes.map(({lenses}) => lenses.length), [2, 4, 3, 4]);
    assert.equal(loaded.profile.sessionSkill, 'prism-review-session');
    assert.deepEqual(loaded.profile.verifierSkills, [
        'prism-review-verifier',
        'prism-review-false-positive-check',
    ]);
    assert.deepEqual(
        loaded.profile.exemptions.map(({kind}) => kind),
        ['binary', 'symlink', 'gitlink', 'unsupported-mode']
    );
    assert.equal(loaded.resources.every(({sha256}) => /^[0-9a-f]{64}$/.test(sha256)), true);
    assert.deepEqual(
        loaded.profile.resources.filter(({source}) => source !== undefined).map(({id, license, source}) => ({
            id,
            license,
            sourceLicense: source.license,
            sourceSha256: source.sha256,
        })),
        [
            {id: 'prism-review-readability', license: 'CC0-1.0', sourceLicense: 'CC0-1.0', sourceSha256: 'dcb6f83d241ea45c2bd55ebb0e6adffa685a2cdfc714375956a65d90a98fe724'},
            {id: 'prism-review-duplication', license: 'CC0-1.0', sourceLicense: 'CC0-1.0', sourceSha256: 'b3579019191ced792449f09b7c206380bf8471eaf1af2f5f38a01c41c5c93d3f'},
            {id: 'prism-review-error-handling', license: 'CC0-1.0', sourceLicense: 'CC0-1.0', sourceSha256: '8688863241834ed78a3e9d2a701a716eca19ca2acd167584de7c1806e92b0de6'},
            {id: 'prism-review-authorization', license: 'CC0-1.0', sourceLicense: 'CC0-1.0', sourceSha256: '791b7d94e613acd1d63bc7cc34cbb391055f3586f3ecc17cd7005f92911eb353'},
            {id: 'prism-review-input-validation', license: 'CC0-1.0', sourceLicense: 'CC0-1.0', sourceSha256: '130cac2d1847689c7575fb8b3f1e73beccddc909549183e41024aa8e5e7b3fc3'},
            {id: 'prism-review-differential', license: 'CC-BY-SA-4.0', sourceLicense: 'CC-BY-SA-4.0', sourceSha256: 'f9af6a8193fc1a9f8ca3c54bb8d19095a5f20c9472ca6d014488bbde50b67da0'},
            {id: 'prism-review-spec-compliance', license: 'CC-BY-SA-4.0', sourceLicense: 'CC-BY-SA-4.0', sourceSha256: 'eb0d91b50a9c06f50baf8763d1e23566897b9fa3e7ffcf13134eee4e1ccaefe5'},
            {id: 'prism-review-false-positive-check', license: 'CC-BY-SA-4.0', sourceLicense: 'CC-BY-SA-4.0', sourceSha256: '129223b79b8cb1e7c289c90cbe4ba288d9b210e318a0d1464f319e30329481b3'},
        ]
    );
});

test('composes installed and local PHP/web lenses from conservative path triggers', (t) => {
    const core = loadCoreProfile({packageRoot: CORE_PACKAGE_ROOT});
    const installedRoot = tempRoot(t);
    fs.cpSync(ADAPTER_PACKAGE_ROOT, installedRoot, {recursive: true});
    const registrations = [ADAPTER_PACKAGE_ROOT, installedRoot].map((packageRoot) => ({
        packageName: '@kyaulabs/prism-php-web',
        packageRoot,
        reviewPath: path.join(packageRoot, 'config', 'prism-review.json'),
    }));
    const cases = [
        ['README.md', []],
        ['src/Account.php', ['php-web-stack', 'rcs-header', 'tdd-php', 'security-coding-php']],
        ['assets/account.scss', ['php-web-stack', 'rcs-header', 'scss-mobile-first', 'visual-review', 'accessibility']],
        ['assets/account.js', ['php-web-stack', 'rcs-header', 'frontend-architecture', 'visual-review', 'accessibility', 'security-coding-php']],
        ['migrations/001_account.sql', ['php-web-stack', 'database', 'security-coding-php']],
        ['tests/Browser/account.php', ['php-web-stack', 'rcs-header', 'tdd-php', 'pest-browser', 'visual-review', 'accessibility', 'security-coding-php']],
    ];

    for (const registration of registrations) {
        const adapter = loadAdapterProfile({registration});
        for (const [changedPath, expected] of cases) {
            const plan = buildReviewPlan({core, adapter, changedPaths: [changedPath]});
            const coreLenses = plan.axes.flatMap(({lenses}) =>
                lenses.filter(({package: packageName}) => packageName === '@kyaulabs/prism-core'));
            const adapterSkills = [...new Set(plan.axes.flatMap(({lenses}) =>
                lenses.filter(({package: packageName}) => packageName === '@kyaulabs/prism-php-web')
                    .map(({skill}) => skill)))];
            assert.equal(coreLenses.length, 13, `${changedPath} keeps Core lenses`);
            assert.deepEqual(adapterSkills, expected, changedPath);
            assert.deepEqual(plan.changedPaths, [{
                oldPath: null,
                newPath: changedPath,
                kind: 'text',
                text: true,
            }]);
        }
        for (const changedPath of ['backend/account', 'backend/accessibility']) {
            const plan = buildReviewPlan({core, adapter, changedPaths: [changedPath]});
            const skills = plan.axes.flatMap(({lenses}) => lenses.map(({skill}) => skill));
            assert.equal(skills.includes('database'), false);
            assert.equal(skills.includes('accessibility'), false);
        }
    }
});

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
        Object.defineProperty({}, 'hidden', {value: true}),
        {[Symbol('hidden')]: true},
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
        ['missing adapted provenance', (p) => { p.resources[0].license = 'CC0-1.0'; }],
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

test('rejects a changed-path text flag that contradicts its kind', () => {
    const core = loadCoreProfile({packageRoot: CORE_PACKAGE_ROOT});

    assert.throws(() => buildReviewPlan({
        core,
        changedPaths: [{newPath: 'src/example.js', kind: 'text', text: false}],
    }), /descriptor/);
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

test('rejects a relative adapter profile registration before filesystem access', (t) => {
    const root = tempRoot(t);
    writeProfilePackage(root, adapterProfile());

    assert.throws(() => loadAdapterProfile({
        registration: {
            packageName: '@fixture/adapter',
            packageRoot: root,
            reviewPath: 'relative-profile.json',
        },
    }), /adapter review registration is invalid/);
});

test('requires a protected base for repository-local adapter policy', (t) => {
    const repositoryRoot = tempRoot(t);
    const adapterRoot = path.join(repositoryRoot, 'packages', 'adapter');
    const reviewPath = writeProfilePackage(adapterRoot, adapterProfile());

    assert.throws(() => loadAdapterProfile({
        registration: {packageName: '@fixture/adapter', packageRoot: adapterRoot, reviewPath},
        repositoryRoot,
    }), /protected base is required/);
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
