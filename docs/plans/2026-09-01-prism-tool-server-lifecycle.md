# Prism Tool Server Lifecycle Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add a Core-owned `prism-tool` supervisor that runs contract-declared loopback test servers on the nearest available profile port and cleans up only its owned process group.

**Architecture:** Adapter `toolchain.json` files may declare closed server profiles. Core validates those profiles, supervises the foreground server lifecycle, and runs only a profile-permitted declared client tool; the PHP/web adapter supplies the concrete PHP fixture profile and uses it from local and CI quality paths.

**Tech Stack:** Node.js 24 built-ins (`child_process`, `events`, `net`), CommonJS, Node test runner, Bash-generated PHP/web quality script, Markdown skills and references

**Originating issue:** none

## Global constraints

- Core has no default preferred port; every server profile declares its own port.
- Candidate order for preferred port `P` is `P`, `P+1`, `P-1`, `P+2`, `P-2`, skipping values outside `1–65535`.
- Equal-distance candidates prefer the higher port.
- Existing listeners are never reused or terminated.
- Hosts are validated loopback addresses only.
- Server and health commands come only from validated installed adapter contracts and execute as argv arrays without a shell.
- Client tools must be command components from the same adapter contract and explicitly permitted by the selected profile.
- TCP readiness is mandatory; semantic health is optional and contract-declared.
- Servers remain foreground-scoped and are cleaned up after success, failure, timeout, or interruption.
- Public failures retain stable Prism exit categories; client non-zero status maps to the existing tool-failure category.
- Core contains no PHP, Pest, HTTP, browser, fixture-path, or `8080` policy.
- The PHP/web profile alone requests `127.0.0.1:8080` and supplies `PEST_BROWSER_BASE_URL`.
- Add no dependencies.
- Apply the repository-managed RCS header and vim modeline to every changed `.js` and `.sh` source file.

---

### Task 1: Validate contract-declared server profiles

**Files:**

- Modify: `tests/Node/toolchain-contract.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/contract.js`
- Modify: `packages/prism-php-web/toolchain.json`

**Interfaces:**

- Consumes: schema-v1 `toolchain.json` contracts and existing command component IDs.
- Produces: frozen optional `contract.serverProfiles`; profile shape `{id, host, preferredPort, startupTimeoutMs, server, health?, clients}`.

- [ ] **Step 1: Write the failing contract tests**

Add this fixture and these behavior tests to `tests/Node/toolchain-contract.test.js`:

```javascript
function serverProfileContract(overrides = {}) {
    return {
        schemaVersion: 1,
        package: '@fixture/adapter',
        role: 'adapter',
        components: [{
            id: 'fixture-client',
            kind: 'command',
            ecosystem: 'npm',
            package: 'fixture-client',
            version: '1.0.0',
            provisioning: 'consumer-dev',
            authentication: 'none',
            executable: 'fixture-client',
            versionArguments: ['--version'],
            argumentPolicy: {mode: 'passthrough'},
        }],
        serverProfiles: [{
            id: 'fixture',
            host: '127.0.0.1',
            preferredPort: 8080,
            startupTimeoutMs: 10000,
            server: {
                executable: 'fixture-server',
                arguments: ['--listen', '{host}:{port}'],
            },
            health: {
                executable: 'fixture-health',
                arguments: ['--host', '{host}', '--port', '{port}'],
            },
            clients: [{
                toolId: 'fixture-client',
                environment: {FIXTURE_ENDPOINT: 'tcp://{host}:{port}'},
            }],
            ...overrides,
        }],
    };
}

test('accepts and freezes a bounded adapter server profile', () => {
    const contract = validateContract(serverProfileContract(), 'fixture.json');

    assert.equal(contract.serverProfiles[0].preferredPort, 8080);
    assert.equal(Object.isFrozen(contract.serverProfiles[0]), false);
});

test('loads the PHP browser fixture as an adapter-owned server profile', () => {
    const contract = loadContract(adapterContract);
    const [profile] = contract.serverProfiles;

    assert.equal(profile.id, 'browser-fixture');
    assert.equal(profile.host, '127.0.0.1');
    assert.equal(profile.preferredPort, 8080);
    assert.deepEqual(profile.clients, [{
        toolId: 'pest',
        environment: {PEST_BROWSER_BASE_URL: 'http://{host}:{port}'},
    }]);
});

test('rejects malformed or unsafe server profiles', () => {
    const invalid = [
        {...serverProfileContract(), role: 'core'},
        serverProfileContract({id: 'UPPER'}),
        serverProfileContract({host: '0.0.0.0'}),
        serverProfileContract({preferredPort: 0}),
        serverProfileContract({preferredPort: 65536}),
        serverProfileContract({startupTimeoutMs: 99}),
        serverProfileContract({server: {executable: '../server', arguments: []}}),
        serverProfileContract({server: {executable: 'server', arguments: ['$(id)']}}),
        serverProfileContract({clients: [{toolId: 'missing', environment: {}}]}),
        serverProfileContract({clients: [{toolId: 'fixture-client', environment: {'bad-key': 'x'}}]}),
    ];

    for (const contract of invalid) {
        assert.throws(() => validateContract(contract, 'fixture.json'), /fixture\.json/);
    }
});

test('rejects duplicate server profiles and duplicate clients', () => {
    const duplicateProfile = serverProfileContract();
    duplicateProfile.serverProfiles.push({...duplicateProfile.serverProfiles[0]});
    const duplicateClient = serverProfileContract();
    duplicateClient.serverProfiles[0].clients.push(
        {...duplicateClient.serverProfiles[0].clients[0]}
    );

    assert.throws(() => validateContract(duplicateProfile, 'fixture.json'), /duplicate server profile/);
    assert.throws(() => validateContract(duplicateClient, 'fixture.json'), /duplicate server client/);
});
```

During Green, change the frozen assertion to `true`; it is deliberately Red against direct `validateContract()` until validation returns the established deep-frozen contract shape.

- [ ] **Step 2: Run the contract tests and verify Red**

Run:

```bash
node --test tests/Node/toolchain-contract.test.js
```

Expected: FAIL because `serverProfiles` is an unknown top-level key and the PHP/web contract does not declare `browser-fixture`.

- [ ] **Step 3: Implement the closed profile schema**

In `packages/prism-core/scripts/prism-tool/contract.js`:

1. Add `serverProfiles` to `TOP_LEVEL_KEYS`.
2. Add constants for profile, command, client, environment, and template keys.
3. Add validators with these exact signatures:

```javascript
function validateServerCommand(command, filePath, label) {}
function validateServerClient(client, componentIds, filePath, profileId) {}
function validateServerProfile(profile, componentIds, filePath) {}
function validateServerProfiles(value, role, components, filePath) {}
```

Implement these rules:

```text
serverProfiles: optional array, 1–32 entries, adapter role only
profile keys: clients, health, host, id, preferredPort, server, startupTimeoutMs
id: existing IDENTIFIER pattern
host: exactly 127.0.0.1 or ::1
preferredPort: integer 1–65535
startupTimeoutMs: integer 100–60000
server/health keys: arguments, executable
executable: existing EXECUTABLE pattern
arguments: array 0–64; each string 1–4096 bytes; no NUL/CR/LF
arguments: only {host} and {port} brace substitutions; reject shell substitution spelling
clients: array 1–32 with unique toolId values
client keys: environment, toolId
client toolId: an existing command component ID from the same contract
environment: plain object with 0–32 unique keys matching ^[A-Z][A-Z0-9_]{0,63}$
environment values: strings 1–1024 bytes with only {host}/{port} substitutions
profile IDs: unique
```

Call `validateServerProfiles(value.serverProfiles, value.role, value.components, filePath)` after component IDs are known. Change `validateContract()` to return `deepFreeze(value)` and remove the second freeze in `loadContract()` so direct and file-loaded validation share immutability.

Add this exact profile to `packages/prism-php-web/toolchain.json`:

```json
"serverProfiles": [
  {
    "id": "browser-fixture",
    "host": "127.0.0.1",
    "preferredPort": 8080,
    "startupTimeoutMs": 10000,
    "server": {
      "executable": "php",
      "arguments": ["-S", "{host}:{port}", "-t", "tests/Browser/fixtures"]
    },
    "health": {
      "executable": "php",
      "arguments": [
        "-r",
        "exit(@file_get_contents('http://{host}:{port}/smoke.html') === false ? 1 : 0);"
      ]
    },
    "clients": [
      {
        "toolId": "pest",
        "environment": {
          "PEST_BROWSER_BASE_URL": "http://{host}:{port}"
        }
      }
    ]
  }
]
```

Permit punctuation needed by inert PHP `-r` argv while still rejecting NUL, line breaks, unsupported brace tokens, command substitution tokens, backticks, and shell control operators. No string is passed to a shell.

- [ ] **Step 4: Run the contract tests and verify Green**

Run:

```bash
node --test tests/Node/toolchain-contract.test.js
```

Expected: PASS.

- [ ] **Step 5: Stage and commit the schema slice**

Stage:

```bash
git add tests/Node/toolchain-contract.test.js packages/prism-core/scripts/prism-tool/contract.js packages/prism-php-web/toolchain.json
```

Then load `conventional-commits` and run as the only tool call in its batch:

```bash
prism-tool commit create --type feat --scope toolchain --subject "declare supervised server profiles"
```

---

### Task 2: Implement nearest-port lifecycle supervision

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/server-lifecycle.js`
- Create: `tests/Node/prism-tool-server-lifecycle.test.js`

**Interfaces:**

- Consumes: one validated server profile, canonical project root, base environment, and a `runClient(env)` callback.
- Produces: `candidatePorts(preferredPort)`, `expandServerTemplate(value, host, port)`, `tcpListening(options)`, and `superviseServer(options)` returning the client callback's stable Prism status.

- [ ] **Step 1: Write failing deterministic lifecycle tests**

Create `tests/Node/prism-tool-server-lifecycle.test.js` with the required RCS header/modeline and tests for:

```javascript
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const test = require('node:test');
const {
    candidatePorts,
    expandServerTemplate,
    superviseServer,
} = require('../../packages/prism-core/scripts/prism-tool/server-lifecycle');

function profile(preferredPort = 8080) {
    return {
        id: 'fixture',
        host: '127.0.0.1',
        preferredPort,
        startupTimeoutMs: 1000,
        server: {executable: 'server', arguments: ['--listen={host}:{port}']},
        health: {executable: 'health', arguments: ['{host}', '{port}']},
        clients: [{toolId: 'client', environment: {ENDPOINT: 'tcp://{host}:{port}'}}],
    };
}

function child(pid = 101) {
    const process = new EventEmitter();
    process.pid = pid;
    process.exitCode = null;
    process.signalCode = null;
    return process;
}

test('orders arbitrary preferred ports by distance with higher ties first', () => {
    assert.deepEqual([...candidatePorts(8080)].slice(0, 7), [8080, 8081, 8079, 8082, 8078, 8083, 8077]);
    assert.deepEqual([...candidatePorts(1)].slice(0, 4), [1, 2, 3, 4]);
    assert.deepEqual([...candidatePorts(65535)].slice(0, 4), [65535, 65534, 65533, 65532]);
});

test('expands only validated host and port tokens as inert values', () => {
    assert.equal(expandServerTemplate('tcp://{host}:{port}', '127.0.0.1', 8081), 'tcp://127.0.0.1:8081');
});

test('skips occupied ports without starting or stopping their processes', async () => {
    const started = [];
    const stopped = [];
    const selected = await superviseServer({
        profile: profile(),
        client: profile().clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async (_host, port) => port === 8080,
        start: async (command) => {
            started.push(command);
            return child();
        },
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: 0}),
        runClient: (env) => env.ENDPOINT.endsWith(':8081') ? 0 : 97,
        stop: async (owned) => stopped.push(owned.pid),
    });

    assert.equal(selected, 0);
    assert.deepEqual(started.map(({port}) => port), [8081]);
    assert.deepEqual(stopped, [101]);
});

test('retries a bind race but stops on a real startup failure', async () => {
    const probes = new Map([[8080, [false, true]], [8081, [false]]]);
    const status = await superviseServer({
        profile: profile(),
        client: profile().clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async (_host, port) => probes.get(port).shift() ?? false,
        start: async ({port}) => child(port),
        awaitReadiness: async (owned) => owned.pid === 8080
            ? {status: 'EXITED'}
            : {status: 'READY'},
        runHealth: () => ({status: 0}),
        runClient: () => 0,
        stop: async () => {},
    });
    assert.equal(status, 0);

    await assert.rejects(() => superviseServer({
        profile: profile(),
        client: profile().clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'EXITED'}),
        runHealth: () => ({status: 0}),
        runClient: () => 0,
        stop: async () => {},
    }), /server startup failed/);
});

test('does not run the client when semantic health fails', async () => {
    let clientRuns = 0;
    await assert.rejects(() => superviseServer({
        profile: profile(),
        client: profile().clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: 1}),
        runClient: () => { clientRuns += 1; return 0; },
        stop: async () => {},
    }), /health check failed/);
    assert.equal(clientRuns, 0);
});

test('always cleans up its owned server after client failure', async () => {
    const stopped = [];
    const status = await superviseServer({
        profile: {...profile(), health: undefined},
        client: profile().clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(909),
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: 0}),
        runClient: () => 4,
        stop: async (owned) => stopped.push(owned.pid),
    });
    assert.equal(status, 4);
    assert.deepEqual(stopped, [909]);
});
```

Add focused tests for timeout, complete candidate exhaustion through an injected candidate list, and cleanup failure replacing a successful client result with a lifecycle failure.

Add one real loopback integration named `preserves an occupied preferred port and cleans up its selected server`. Its fixture must:

1. find a free three-port range in `30000–50000` by binding test-owned listeners;
2. retain the middle listener as the unrelated preferred-port owner and release both neighbors;
3. use `process.execPath` as the profile server executable with `-e` source that listens on `{port}` and remains foregrounded;
4. assert the client receives the higher adjacent port;
5. assert the preferred listener still accepts connections after the client;
6. assert the selected adjacent port refuses connections after supervisor cleanup; and
7. close the preferred listener in `t.after()`.

This test uses production `tcpListening`, spawn, readiness, and process-group cleanup; only the client callback is local to the test.

- [ ] **Step 2: Run the lifecycle tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-server-lifecycle.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND` for `server-lifecycle.js`.

- [ ] **Step 3: Implement the lifecycle deep module**

Create `packages/prism-core/scripts/prism-tool/server-lifecycle.js` with the required RCS header/modeline and these exports:

```javascript
module.exports = {
    candidatePorts,
    expandServerTemplate,
    superviseServer,
    tcpListening,
};
```

Implement:

```javascript
function* candidatePorts(preferredPort) {
    yield preferredPort;
    for (let distance = 1; distance <= 65534; distance += 1) {
        const higher = preferredPort + distance;
        const lower = preferredPort - distance;
        if (higher <= 65535) yield higher;
        if (lower >= 1) yield lower;
        if (higher > 65535 && lower < 1) return;
    }
}

function expandServerTemplate(value, host, port) {
    return value.replaceAll('{host}', host).replaceAll('{port}', String(port));
}
```

Use `net.createConnection()` for `tcpListening()`, resolving `true` on connect and `false` on refusal, reset, or bounded probe timeout. Use `child_process.spawn()` with argv arrays, `shell: false`, `stdio: 'ignore'`, canonical project `cwd`, and a POSIX-owned process group. Keep the server in the foreground.

`superviseServer()` must:

1. use injected seams when provided and production socket/process implementations otherwise;
2. skip pre-existing listeners;
3. start one candidate with expanded argv and `PRISM_SERVER_HOST`/`PRISM_SERVER_PORT`;
4. distinguish `READY`, `EXITED`, and `TIMED_OUT` startup outcomes;
5. retry only when a post-exit probe proves contention;
6. run optional health argv after TCP readiness;
7. expand only the selected client's environment templates;
8. call `runClient()` once;
9. stop the owned process group in `finally` with bounded `SIGTERM` then `SIGKILL` escalation;
10. preserve the client callback's stable Prism status unless cleanup cannot prove termination.

Use typed internal errors carrying stable codes `PORT_EXHAUSTED`, `SERVER_STARTUP_FAILED`, `SERVER_STARTUP_TIMEOUT`, `HEALTH_FAILED`, and `CLEANUP_FAILED`. Do not include raw argv or subprocess output in messages.

- [ ] **Step 4: Run lifecycle tests and verify Green**

Run:

```bash
node --test tests/Node/prism-tool-server-lifecycle.test.js
```

Expected: PASS.

- [ ] **Step 5: Stage and commit the lifecycle slice**

Stage:

```bash
git add packages/prism-core/scripts/prism-tool/server-lifecycle.js tests/Node/prism-tool-server-lifecycle.test.js
```

Then load `conventional-commits` and run exclusively:

```bash
prism-tool commit create --type feat --scope core --subject "supervise foreground test servers"
```

---

### Task 3: Add the narrow `prism-tool server run` command

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/server.js`
- Create: `tests/Node/prism-tool-server.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-run.test.js`

**Interfaces:**

- Consumes: `prism-tool server run PACKAGE:PROFILE --tool TOOL_ID -- ARGUMENTS`, active adapter registration, validated profile, and `runDeclaredTool()`.
- Produces: `serverCommand(args, context, runTool)` returning `Promise<EXIT>` and CLI dispatch from `main()`.

- [ ] **Step 1: Write failing command-boundary tests**

Create `tests/Node/prism-tool-server.test.js` using the existing temporary adapter helpers from `prism-tool-discovery.test.js` as local copied fixtures. Cover these observable cases:

```javascript
test('rejects malformed server invocations before discovery', async () => {
    for (const args of [
        ['server'],
        ['server', 'run'],
        ['server', 'run', '@fixture/adapter:fixture'],
        ['server', 'run', '@fixture/adapter:fixture', '--tool', 'client'],
        ['server', 'run', '@fixture/adapter:fixture', '--tool', 'client', 'payload'],
    ]) {
        const result = await captureWrites(() => main(args, {serverSupervisor: async () => 0}));
        assert.equal(result.status, 2);
        assert.match(result.stderr, /usage: prism-tool server run/);
    }
});

test('rejects a package other than the active adapter', async (t) => {
    const fixture = writeServerAdapter(t);
    const result = await captureWrites(() => main([
        'server', 'run', '@other/adapter:fixture', '--tool', 'client', '--', '--coverage',
    ], fixture.context));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /requested server profile is not active/);
    assert.equal(fixture.supervisorCalls.length, 0);
});

test('rejects unknown profiles and clients not permitted by the profile', async (t) => {
    const fixture = writeServerAdapter(t);
    for (const [reference, tool] of [
        ['@fixture/adapter:missing', 'client'],
        ['@fixture/adapter:fixture', 'other-client'],
    ]) {
        const result = await captureWrites(() => main([
            'server', 'run', reference, '--tool', tool, '--',
        ], fixture.context));
        assert.equal(result.status, 2);
    }
    assert.equal(fixture.supervisorCalls.length, 0);
});

test('passes the validated profile and selected environment to the declared client', async (t) => {
    const fixture = writeServerAdapter(t, {
        serverSupervisor: async (options) => options.runClient({
            ...options.env,
            ENDPOINT: 'tcp://127.0.0.1:8081',
        }),
    });
    const result = await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--', '--coverage',
    ], fixture.context));

    assert.equal(result.status, 0);
    assert.deepEqual(fixture.clientCalls, [{
        args: ['client', '--', '--coverage'],
        endpoint: 'tcp://127.0.0.1:8081',
    }]);
});

test('maps client failure and lifecycle failure to stable tool status', async (t) => {
    const clientFailure = writeServerAdapter(t, {
        serverSupervisor: async (options) => options.runClient(options.env),
        runToolStatus: 4,
    });
    assert.equal((await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
    ], clientFailure.context))).status, 4);

    const lifecycleFailure = writeServerAdapter(t, {
        serverSupervisor: async () => { throw Object.assign(new Error('failed'), {code: 'HEALTH_FAILED'}); },
    });
    const failed = await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
    ], lifecycleFailure.context));
    assert.equal(failed.status, 4);
    assert.match(failed.stderr, /server health check failed/);
});
```

The `writeServerAdapter()` fixture must create a project-local adapter with a validated profile, declared `client` and `other-client` tools, ready Semgrep/OCR stubs, and injected `serverSupervisor`/`runDeclaredTool` seams. Assertions must prove malformed input triggers no process or tool call.

In `tests/Node/prism-tool-run.test.js`, add one regression proving ordinary `prism-tool run` behavior remains unchanged after exporting `runDeclaredTool`.

- [ ] **Step 2: Run command tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-server.test.js tests/Node/prism-tool-run.test.js
```

Expected: FAIL because `server` is an unknown command.

- [ ] **Step 3: Implement parsing, discovery, readiness, and dispatch**

Create `packages/prism-core/scripts/prism-tool/server.js` with:

```javascript
const USAGE = 'usage: prism-tool server run PACKAGE:PROFILE --tool TOOL_ID -- ARGUMENTS';

async function serverCommand(args, context, runTool, exit) {}

module.exports = {serverCommand};
```

`serverCommand()` must:

1. parse exactly `run`, one namespaced package/profile reference, `--tool`, one tool ID, `--`, and inert remaining client arguments;
2. run Core mandatory external readiness before starting the server;
3. discover exactly one active adapter through `discoverAdapter()` and load its handler;
4. require the reference package to equal `registration.packageName`;
5. resolve exactly one profile and one permitted client from the already validated contract;
6. prove server and optional health executables are available through `resolveExecutable()`;
7. call `context.serverSupervisor ?? superviseServer` with the canonical project root;
8. supply `runClient(clientEnv)` that calls the injected runner or `runDeclaredTool([toolId, '--', ...clientArgs], {...context, env: clientEnv, input: ''})`;
9. map malformed/profile/tool errors to `EXIT.USAGE`, readiness errors to `EXIT.READINESS`, and lifecycle/client errors to `EXIT.TOOL`;
10. emit fixed diagnostics without raw argv or child output.

In `packages/prism-core/scripts/prism-tool/cli.js`:

```javascript
const {serverCommand} = require('./server');
```

Add dispatch before the unknown-command branch:

```javascript
if (command === 'server') return serverCommand(args, context, runDeclaredTool, EXIT);
```

Export `runDeclaredTool` for the regression seam:

```javascript
module.exports = {EXIT, doctor, main, resolveBundledComponent, runDeclaredTool};
```

Preserve all existing `runDeclaredTool()` behavior byte-for-byte except the export.

- [ ] **Step 4: Run command and lifecycle tests and verify Green**

Run:

```bash
node --test tests/Node/prism-tool-server.test.js tests/Node/prism-tool-server-lifecycle.test.js tests/Node/prism-tool-run.test.js tests/Node/prism-tool-discovery.test.js
```

Expected: PASS.

- [ ] **Step 5: Stage and commit the launcher slice**

Stage:

```bash
git add packages/prism-core/scripts/prism-tool/server.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-server.test.js tests/Node/prism-tool-run.test.js
```

Then load `conventional-commits` and run exclusively:

```bash
prism-tool commit create --type feat --scope core --subject "run declared clients with supervised servers"
```

---

### Task 4: Route PHP/web quality automation through the supervisor

**Files:**

- Modify: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/Shell/pi_ci_contract_test.sh`

**Interfaces:**

- Consumes: `@kyaulabs/prism-php-web:browser-fixture`, client tool `pest`, and ordinary Pest arguments.
- Produces: one canonical quality command in generated checks and Prism CI, without shell-owned server PID state.

- [ ] **Step 1: Replace bootstrap and CI assertions first**

In `tests/Node/prism-tool-php-web-bootstrap.test.js`:

- Change the quality-order assertion from `php -S` plus `run pest` to `server run`.
- Add exact assertions:

```javascript
assert.match(check, /prism-tool server run @kyaulabs\/prism-php-web:browser-fixture --tool pest -- --coverage --min=80/);
assert.doesNotMatch(check, /SERVER_PID|php -S|PEST_BROWSER_BASE_URL|\btrap\b/);
```

- Replace `stops only its browser fixture server when a quality gate fails` with a test that stubs `prism-tool`, forces the supervised Pest invocation to exit `97`, and proves the generated check propagates failure without invoking a direct PHP server.
- Keep syntax and executable-mode assertions.

In `tests/Shell/pi_ci_contract_test.sh`, replace the direct Pest expectation and add:

```bash
assert_ci_contains 'prism-tool(\.js)? server run @kyaulabs/prism-php-web:browser-fixture --tool pest' 'Pest coverage uses the supervised browser fixture profile'
assert_ci_not_contains 'php -S|PHP_SERVER_PID|PEST_BROWSER_BASE_URL' 'CI has no shell-owned fixed-port server lifecycle'
```

- [ ] **Step 2: Run focused automation tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-php-web-bootstrap.test.js
```

Run:

```bash
bash tests/Shell/pi_ci_contract_test.sh
```

Expected: both FAIL because generated and repository CI still own a fixed `8080` PHP process.

- [ ] **Step 3: Replace generated and repository lifecycle commands**

In the generated `.github/scripts/check-php.sh` template inside `bootstrap-scaffold.js`:

- remove `SERVER_PID`, `cleanup()`, `trap`, direct `php -S`, readiness polling, and fixed `PEST_BROWSER_BASE_URL`;
- replace the Pest section with exactly:

```bash
prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage --min=80
```

In `.github/workflows/ci.yml`:

- delete the `Start PHP dev server` and `Stop PHP dev server` steps;
- remove the fixed `PEST_BROWSER_BASE_URL` environment;
- replace the coverage invocation with:

```yaml
node packages/prism-core/scripts/prism-tool.js server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage --min=80
```

Keep the per-changed-file coverage gate in the same step after the supervised command. Do not alter unrelated workflow provisioning, permissions, actions, or Semgrep behavior.

- [ ] **Step 4: Run automation tests and verify Green**

Run:

```bash
node --test tests/Node/prism-tool-php-web-bootstrap.test.js
```

Run:

```bash
bash tests/Shell/pi_ci_contract_test.sh
```

Expected: PASS.

- [ ] **Step 5: Stage and commit the automation slice**

Stage:

```bash
git add packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js tests/Node/prism-tool-php-web-bootstrap.test.js .github/workflows/ci.yml tests/Shell/pi_ci_contract_test.sh
```

Then load `conventional-commits` and run exclusively:

```bash
prism-tool commit create --type feat --scope php-web --subject "supervise browser fixture test servers"
```

---

### Task 5: Publish the canonical server lifecycle guidance

**Files:**

- Modify: `packages/prism-core/skills/tdd/SKILL.md`
- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-php-web/prompts/check-php.md`
- Modify: `packages/prism-php-web/skills/tdd-php/SKILL.md`
- Modify: `packages/prism-php-web/docs/tests.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`

**Interfaces:**

- Consumes: the accepted ADR-0101 CLI and PHP/web profile.
- Produces: one documented canonical command and a language-independent TDD rule for test-owned servers.

- [ ] **Step 1: Update contract tests before prose**

In `tests/Shell/toolchain_entrypoints_test.sh`, replace `CANONICAL_PEST` with:

```bash
CANONICAL_PEST='prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage'
```

Require that `/check-php`, `tdd-php`, and `docs/tests.md` contain the canonical command. Add assertions that `/check-php` contains none of:

```text
php -S
PEST_BROWSER_BASE_URL=
reusing existing dev server
kill <pid>
```

Add assertions that Core TDD says profiles choose the nearest available port and never reuse occupied listeners, and Core README documents `prism-tool server run` as foreground-scoped.

- [ ] **Step 2: Run the instruction contract and verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL because current guidance hardcodes and may reuse `localhost:8080`.

- [ ] **Step 3: Update Core and adapter guidance**

Add this rule to `packages/prism-core/skills/tdd/SKILL.md` near full-suite verification:

```markdown
When a test suite needs a local listening dependency, use the active adapter's
contract-declared `prism-tool server run` profile. The profile owns its preferred
port. Core chooses the nearest available valid port, preferring the higher port
on equal distance, never reuses an occupied listener, and cleans up only its
owned foreground server process group. Do not recreate this lifecycle with
agent-authored shell commands.
```

Add a `Supervised test servers` section to `packages/prism-core/README.md` documenting:

```text
prism-tool server run PACKAGE:PROFILE --tool TOOL_ID -- ARGUMENTS
```

State that profiles are adapter contract data, every profile chooses its own preferred port, Core listens only on loopback, the client bounds the lifecycle, and arbitrary project server commands are rejected.

In `packages/prism-php-web/prompts/check-php.md`, remove the manual start/reuse/wait/kill sequence. Replace the coverage command with:

```bash
prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage
```

State that the launcher selects the nearest available port and owns readiness and cleanup. Keep changed-file discovery, coverage-driver preflight, coverage-gate invocation, and all non-Pest checks unchanged.

Replace both fixed coverage commands in `packages/prism-php-web/skills/tdd-php/SKILL.md` and the command in `packages/prism-php-web/docs/tests.md` with the same canonical supervised command. Browser-focused Pest invocations use the profile; unit-only focused invocations remain `prism-tool run pest -- ...`.

- [ ] **Step 4: Run instruction and focused regression checks**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Run:

```bash
node --test tests/Node/toolchain-contract.test.js tests/Node/prism-tool-server-lifecycle.test.js tests/Node/prism-tool-server.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
```

Expected: PASS.

- [ ] **Step 5: Stage and commit the guidance slice**

Stage:

```bash
git add packages/prism-core/skills/tdd/SKILL.md packages/prism-core/README.md packages/prism-php-web/prompts/check-php.md packages/prism-php-web/skills/tdd-php/SKILL.md packages/prism-php-web/docs/tests.md tests/Shell/toolchain_entrypoints_test.sh
```

Then load `conventional-commits` and run exclusively:

```bash
prism-tool commit create --type docs --scope testing --subject "document supervised test server profiles"
```

---

### Task 6: Verify the complete behavior and quality gates

**Files:**

- Modify only files required to repair failures causally introduced by Tasks 1–5.
- Test: complete Node, Shell, PHP/web, lint, Markdown, and pre-push surfaces.

**Interfaces:**

- Consumes: all prior task commits.
- Produces: current verification evidence for the approved specification and ADR-0101.

- [ ] **Step 1: Run the complete Node suite**

Run:

```bash
npm run test:node
```

Expected: PASS.

- [ ] **Step 2: Run the complete Shell regression suite**

Run:

```bash
composer test:shell
```

Expected: PASS.

- [ ] **Step 3: Run harness and source checks**

Resolve the scripts directory in one tool call:

```bash
prism-tool resolve scripts
```

Retain the returned absolute path and invoke in a later tool call:

```bash
bash /absolute/resolved/scripts/validate-harness.sh
```

Expected: PASS.

Run:

```bash
prism-tool run eslint -- "packages/**/*.js" "tests/Node/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
```

Expected: PASS.

- [ ] **Step 4: Run Markdown and aggregate project gates**

Stage the final intended state, then run:

```bash
prism-tool markdown lint --cached
```

Expected: PASS.

Run `/check`, which delegates to `/check-php` and includes the newly supervised full Pest coverage command.

Expected: GO.

- [ ] **Step 5: Verify the original occupied-port behavior through the integration seam**

Run:

```bash
node --test --test-name-pattern="preserves an occupied preferred port" tests/Node/prism-tool-server-lifecycle.test.js
```

Expected: PASS, proving the nearest higher port is selected on a tie, the unrelated preferred-port listener remains alive, and no supervisor-owned listener remains afterward. Contract and PHP/web automation tests separately prove that the browser-fixture profile's preferred port is `8080` and that full suites invoke this lifecycle.

- [ ] **Step 6: Commit only causal verification repairs, if any**

If verification required source changes, stage only those repaired files and load `conventional-commits`. Use task-specific structured fields and run one exclusive launcher commit. If no repair was required, create no empty verification commit.
