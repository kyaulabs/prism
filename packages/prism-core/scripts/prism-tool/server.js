// $KYAULabs: server.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {loadCoreContract} = require('./core-toolchain');
const {discoverAdapter, loadAdapterHandler} = require('./discovery');
const {checkExternalTools, resolveExecutable} = require('./preflight');
const {runBounded} = require('./process');
const {superviseServer} = require('./server-lifecycle');

const USAGE = 'usage: prism-tool server run PACKAGE:PROFILE --tool TOOL_ID -- ARGUMENTS';
const REFERENCE = /^(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*):([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/;
const TOOL_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LIFECYCLE_MESSAGES = Object.freeze({
    PORT_EXHAUSTED: 'prism-tool: server ports exhausted',
    SERVER_STARTUP_FAILED: 'prism-tool: server startup failed',
    SERVER_STARTUP_TIMEOUT: 'prism-tool: server startup timed out',
    HEALTH_FAILED: 'prism-tool: server health check failed',
    CLEANUP_FAILED: 'prism-tool: server cleanup failed',
});

function parseServerInvocation(args) {
    const match = typeof args[1] === 'string' ? REFERENCE.exec(args[1]) : null;
    if (
        args.length < 5 ||
        args[0] !== 'run' ||
        match === null ||
        args[2] !== '--tool' ||
        !TOOL_ID.test(args[3] ?? '') ||
        args[4] !== '--'
    ) {
        throw new Error(USAGE);
    }
    return {
        packageName: match[1],
        profileId: match[2],
        toolId: args[3],
        toolArgs: args.slice(5),
    };
}

async function serverCommand(args, context, runTool, exit) {
    let parsed;
    try {
        parsed = parseServerInvocation(args);
    } catch {
        process.stderr.write(`${USAGE}\n`);
        return exit.USAGE;
    }
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    let coreContract;
    try {
        coreContract = loadCoreContract(coreRoot);
    } catch {
        process.stderr.write('prism-tool: invalid core toolchain contract\n');
        return exit.USAGE;
    }
    const env = context.env ?? process.env;
    const readiness = checkExternalTools({
        contract: coreContract,
        env,
        run: context.run ?? runBounded,
    });
    if (readiness.some(({status}) => status !== 'PASS')) {
        process.stderr.write('prism-tool: mandatory external readiness failed\n');
        return exit.READINESS;
    }
    const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
    let registration;
    try {
        registration = discoverAdapter({
            projectRoot,
            piDir: context.piDir ?? path.join(projectRoot, '.pi'),
        });
        loadAdapterHandler(registration);
    } catch {
        process.stderr.write('prism-tool: active adapter discovery failed\n');
        return exit.USAGE;
    }
    if (registration.packageName !== parsed.packageName) {
        process.stderr.write('prism-tool: requested server profile is not active\n');
        return exit.USAGE;
    }
    const profile = registration.contract.serverProfiles?.find(({id}) => id === parsed.profileId);
    if (!profile) {
        process.stderr.write('prism-tool: requested server profile is unavailable\n');
        return exit.USAGE;
    }
    const client = profile.clients.find(({toolId}) => toolId === parsed.toolId);
    if (!client) {
        process.stderr.write('prism-tool: client tool is not permitted by server profile\n');
        return exit.USAGE;
    }
    const commands = [profile.server, ...(profile.health ? [profile.health] : [])];
    if (commands.some(({executable}) => !resolveExecutable(executable, env))) {
        process.stderr.write('prism-tool: server profile executable is unavailable\n');
        return exit.READINESS;
    }
    const runClient = context.runDeclaredTool ?? runTool;
    const supervisor = context.serverSupervisor ?? superviseServer;
    try {
        return await supervisor({
            profile,
            client,
            projectRoot: fs.realpathSync(projectRoot),
            env,
            runClient: (clientEnv) => runClient([
                parsed.toolId,
                '--',
                ...parsed.toolArgs,
            ], {...context, env: clientEnv, input: ''}),
        });
    } catch (error) {
        const message = LIFECYCLE_MESSAGES[error.code] ??
            'prism-tool: supervised server operation failed';
        process.stderr.write(`${message}\n`);
        return exit.TOOL;
    }
}

module.exports = {serverCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
