'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fixtures = path.resolve(__dirname, '../Fixtures/Cpp');
const strict = process.env.PRISM_CPP_REQUIRED === '1';
const tools = ['cmake', 'ninja', 'clang++', 'clang-format', 'clang-tidy'];
const missing = tools.filter(tool => spawnSync(tool, ['--version']).status !== 0);
const options = {skip: missing.length && !strict ? `Unavailable: ${missing.join(', ')}` : false};
function run(command, args, cwd, env = {}) {
    const r = spawnSync(command, args, {cwd, env: {...process.env, ...env}, encoding: 'utf8', timeout: 120000});
    assert.equal(r.error, undefined, `${command}: ${r.error}`);
    const result = {status: r.status, output: r.stdout + r.stderr};
    if (process.env.PRISM_CPP_LOG_DIR) {
        fs.mkdirSync(process.env.PRISM_CPP_LOG_DIR, {recursive: true});
        fs.appendFileSync(path.join(process.env.PRISM_CPP_LOG_DIR, 'native.jsonl'),
            JSON.stringify({command, args, cwd, ...result}) + '\n');
    }
    return result;
}
function passed(r) { assert.equal(r.status, 0, r.output); return r; }
function workspace(t, name) {
    assert.deepEqual(missing, [], `Unavailable native prerequisites: ${missing}`);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism cpp '));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const source = path.join(temp, 'source');
    fs.cpSync(path.join(fixtures, name), source, {recursive: true});
    return {temp, source, build: path.join(temp, 'build')};
}
function configure(w, extra = []) {
    return run('cmake', ['-S', w.source, '-B', w.build, '-G', 'Ninja', '-DCMAKE_CXX_COMPILER=clang++', '-DCMAKE_BUILD_TYPE=Debug', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON', ...extra], w.temp);
}
const build = (w, extra = []) => run('cmake', ['--build', w.build, ...extra], w.temp);
const ctest = (w, extra = []) => run('ctest', ['--test-dir', w.build, '--output-on-failure', '--no-tests=error', ...extra], w.temp);

// Opt-in dependency acceptance: downloads the declared locked dependency through
// Conan, never installs tools. CONAN_HOME must be an isolated fixture cache.
test('F09 locked Conan dependency builds/links/tests and standard-library ABI mismatch fails', {
    skip: process.env.PRISM_CPP_CONAN !== '1' ? 'Not run: set PRISM_CPP_CONAN=1 with Conan 2 and an isolated CONAN_HOME' : false,
}, t => {
    const w = workspace(t, 'conan');
    const conan = process.env.PRISM_CONAN ?? 'conan';
    const profile = path.join(w.source, 'profiles', process.env.PRISM_CPP_PROFILE ?? 'linux-clang');
    assert.ok(process.env.CONAN_HOME, 'Use an isolated CONAN_HOME, not user credentials/settings');
    const toolVersion = passed(run(conan, ['--version'], w.temp));
    assert.match(toolVersion.output, /Conan version 2\./);
    passed(run(conan, ['install', w.source, '-pr:h', profile, '-pr:b', profile,
        '--lockfile', path.join(w.source, 'conan.lock'), '--output-folder', w.build, '--build=missing'], w.temp));
    const toolchain = path.join(w.build, 'build/Debug/generators/conan_toolchain.cmake');
    passed(configure(w, [`-DCMAKE_TOOLCHAIN_FILE=${toolchain}`]));
    passed(build(w));
    assert.match(passed(ctest(w)).output, /100% tests passed/);
    const mismatch = {...w, build: path.join(w.temp, 'mismatch')};
    passed(configure(mismatch, [`-DCMAKE_TOOLCHAIN_FILE=${toolchain}`, '-DCMAKE_CXX_FLAGS=-D_GLIBCXX_USE_CXX11_ABI=0']));
    const incompatible = build(mismatch);
    assert.notEqual(incompatible.status, 0);
    assert.match(incompatible.output, /undefined reference|undefined symbol/i);
});

test('F01/F02/F10 CPU public behavior, format/tidy, generated prerequisites and missing/stale DB', options, t => {
    const w = workspace(t, 'baseline');
    passed(configure(w));
    passed(build(w));
    const listing = JSON.parse(passed(run('ctest', ['--test-dir', w.build, '--show-only=json-v1'], w.temp)).output);
    assert.equal(listing.tests.length, 1);
    assert.match(passed(ctest(w)).output, /100% tests passed/);
    const instrumented = {...w, build: path.join(w.temp, 'asan-ubsan')};
    passed(configure(instrumented, ['-DCMAKE_CXX_FLAGS=-fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer',
        `-DCMAKE_EXE_LINKER_FLAGS=-fsanitize=address,undefined${process.platform === 'linux' ? ' -no-pie' : ''}`]));
    passed(build(instrumented));
    const clean = passed(ctest(instrumented));
    assert.doesNotMatch(clean.output, /runtime error:|ERROR: AddressSanitizer/);
    const source = path.join(w.source, 'src/checked_value.cpp');
    const format = () => run('clang-format', ['--dry-run', '--Werror', '--style=file', source], w.temp);
    passed(format());
    passed(run('clang-tidy', ['-p', w.build, source], w.temp));
    const correct = fs.readFileSync(source);
    fs.writeFileSync(source, '#include "checked_value.hpp"\nstd::optional<int> fixture::checked_add(int a, int b) { return a + b; }\n');
    passed(build(w));
    const regression = ctest(w);
    assert.notEqual(regression.status, 0);
    assert.match(regression.output, /public value\/overflow contract failed/);
    fs.writeFileSync(source, correct);
    passed(build(w)); passed(ctest(w));
    const emptySelection = JSON.parse(passed(run('ctest', ['--test-dir', w.build, '-R', '^not_registered$', '--show-only=json-v1'], w.temp)).output);
    assert.equal(emptySelection.tests.length, 0);
    assert.notEqual(ctest(w, ['-R', '^not_registered$']).status, 0);
    // An absent generated prerequisite must be produced by the build, not faked.
    fs.rmSync(path.join(w.build, 'generated.hpp'));
    const absent = run('clang-tidy', ['-p', w.build, source], w.temp);
    assert.notEqual(absent.status, 0); assert.match(absent.output, /generated.hpp/);
    passed(build(w));
    passed(run('clang-tidy', ['-p', w.build, source], w.temp));
    const database = path.join(w.build, 'compile_commands.json');
    fs.renameSync(database, database + '.saved');
    const noDatabase = run('clang-tidy', ['-p', w.build, source], w.temp);
    assert.match(noDatabase.output, /compilation database|without flags/i);
    // Its fallback is NOT valid AST evidence, even if a particular file parses.
    assert.ok(!fs.existsSync(database));
    const entries = JSON.parse(fs.readFileSync(database + '.saved', 'utf8'));
    assert.ok(entries.every(entry => entry.directory === w.build && fs.existsSync(entry.file)));
    // Generate actual commands for another configured build, leaving its native
    // generated prerequisite unbuilt. Do not invent compiler arguments or use a
    // nonexistent working directory (some analyzer versions hang on that input).
    const alternate = {...w, build: path.join(w.temp, 'wrong-build')};
    passed(configure(alternate));
    fs.copyFileSync(path.join(alternate.build, 'compile_commands.json'), database);
    const wrongDatabase = run('clang-tidy', ['-p', w.build, source], w.temp);
    assert.notEqual(wrongDatabase.status, 0, 'Wrong-build prerequisites must not be accepted as current analysis');
    assert.match(wrongDatabase.output, /generated.hpp.*file not found/);
    fs.renameSync(database + '.saved', database);
    passed(run('clang-tidy', ['-p', w.build, source], w.temp));
    fs.appendFileSync(source, '\nint   unformatted( ){return 1;}\n');
    const bytes = fs.readFileSync(source);
    assert.notEqual(format().status, 0);
    assert.deepEqual(fs.readFileSync(source), bytes);
    fs.writeFileSync(path.join(w.source, 'tests/checked_value_test.cpp'), 'int main() { return 1; }\n');
    passed(build(w));
    assert.notEqual(ctest(w).status, 0);
});

test('F03 zero registered or filtered required tests fail', options, t => {
    const w = workspace(t, 'empty-tests');
    passed(configure(w));
    const listing = JSON.parse(passed(run('ctest', ['--test-dir', w.build, '--show-only=json-v1'], w.temp)).output);
    assert.equal(listing.tests.length, 0);
    assert.notEqual(ctest(w).status, 0);
});

test('F03 a selected but skipped CTest returns zero without proving behavior execution', options, t => {
    const w = workspace(t, 'baseline');
    fs.appendFileSync(path.join(w.source, 'CMakeLists.txt'), '\nset_tests_properties(checked_value PROPERTIES SKIP_RETURN_CODE 77)\n');
    fs.writeFileSync(path.join(w.source, 'tests/checked_value_test.cpp'), 'int main() { return 77; }\n');
    passed(configure(w)); passed(build(w));
    const listing = JSON.parse(passed(run('ctest', ['--test-dir', w.build, '--show-only=json-v1'], w.temp)).output);
    assert.equal(listing.tests.length, 1);
    const skipped = passed(ctest(w));
    assert.match(skipped.output, /checked_value.*Skipped/);
    assert.match(skipped.output, /The following tests did not run/);
    // Passed here validates the native skip detector. The required behavior test
    // itself is Not run: one selected, zero behavior checks executed, one skipped.
});

test('F04/F08 UBSan recovering exit zero is still a report; strict policy and ASan catch defects', options, t => {
    const w = workspace(t, 'sanitizers');
    passed(configure(w)); passed(build(w));
    const recover = run(path.join(w.build, 'ubsan_recover'), [], w.temp, {UBSAN_OPTIONS: 'halt_on_error=0'});
    assert.equal(recover.status, 0, recover.output);
    assert.match(recover.output, /runtime error: signed integer overflow/);
    const strictRun = run(path.join(w.build, 'ubsan_recover'), [], w.temp, {UBSAN_OPTIONS: 'halt_on_error=1'});
    assert.notEqual(strictRun.status, 0);
    assert.match(strictRun.output, /runtime error: signed integer overflow/);
    const asan = run(path.join(w.build, 'asan_error'), [], w.temp, {ASAN_OPTIONS: 'detect_leaks=0'});
    assert.notEqual(asan.status, 0);
    assert.match(asan.output, /AddressSanitizer: heap-use-after-free/);
});

test('F05 affected header requires both macro-distinct consumers; owned diagnostics stay visible', options, t => {
    const w = workspace(t, 'header-consumers');
    passed(configure(w)); passed(build(w));
    const entries = JSON.parse(fs.readFileSync(path.join(w.build, 'compile_commands.json'), 'utf8'));
    assert.equal(entries.length, 2);
    assert.ok(entries.every(entry => entry.command.includes('-isystem')));
    fs.appendFileSync(path.join(w.source, 'include/policy.hpp'), '\n#ifdef SECOND_CONSUMER\nstatic_assert(false, "second consumer detects changed header");\n#endif\n');
    passed(build(w, ['--target', 'consumer_a']));
    const full = build(w);
    assert.notEqual(full.status, 0); assert.match(full.output, /second consumer detects changed header/);
    const tidy = run('clang-tidy', ['--checks=-*,clang-analyzer-core.*', '-p', w.build, path.join(w.source, 'src/consumer_b.cpp')], w.temp);
    assert.notEqual(tidy.status, 0); assert.match(tidy.output, /policy.hpp/);
});

test('F06 Debug cannot stand in for Release for the same source', options, t => {
    const w = workspace(t, 'multi-config');
    passed(configure(w)); passed(build(w)); passed(ctest(w));
    const debugEntries = JSON.parse(fs.readFileSync(path.join(w.build, 'compile_commands.json'), 'utf8'));
    const release = {...w, build: path.join(w.temp, 'release')};
    passed(configure(release, ['-DCMAKE_BUILD_TYPE=Release']));
    passed(build(release));
    const releaseEntries = JSON.parse(fs.readFileSync(path.join(release.build, 'compile_commands.json'), 'utf8'));
    assert.equal(debugEntries[0].file, releaseEntries[0].file);
    assert.notEqual(debugEntries[0].command, releaseEntries[0].command);
    const result = ctest(release);
    assert.notEqual(result.status, 0); assert.match(result.output, /config_value/);
});
