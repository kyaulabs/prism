// $KYAULabs: server.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

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

async function runValidatedServer(request, context = {}) {
    const {registration, handler, profileId, toolId, toolArgs} = request;
    if (registration === null || typeof registration !== 'object' ||
        handler === null || typeof handler !== 'object' || typeof handler.resolveTool !== 'function' ||
        typeof profileId !== 'string' || typeof toolId !== 'string' || !Array.isArray(toolArgs) ||
        toolArgs.length > 256 || toolArgs.some((argument) => typeof argument !== 'string' ||
            argument.length > 4096 || /[\x00-\x1f\x7f]/.test(argument) || path.isAbsolute(argument))) {
        throw new Error('validated server request is invalid');
    }
    const profile = registration.contract.serverProfiles?.find(({id}) => id === profileId);
    const client = profile?.clients.find(({toolId: allowed}) => allowed === toolId);
    const component = registration.contract.components.find(({id}) => id === toolId);
    if (!profile || !client || !component || component.kind !== 'command') {
        throw new Error('validated server selection is unavailable');
    }
    const env = context.env ?? process.env;
    const resolve = context.resolveExecutable ?? resolveExecutable;
    const commands = [profile.server, ...(profile.health ? [profile.health] : [])];
    if (commands.some(({executable}) => !resolve(executable, env))) {
        throw Object.assign(new Error('server executable is unavailable'), {code: 'READINESS_FAILED'});
    }
    const projectRoot = fs.realpathSync(request.projectRoot);
    const clientExecutable = handler.resolveTool({component, projectRoot});
    if (typeof clientExecutable !== 'string' || clientExecutable.length === 0) {
        throw new Error('server client executable is unavailable');
    }
    const runClient = context.runClient ?? ((selected) => {
        const argv = [...(selected.component.argvPrefix ?? []), clientExecutable, ...selected.args];
        return (context.run ?? runBounded)(argv[0], argv.slice(1), {
            cwd: projectRoot,
            env: selected.env,
            encoding: null,
            maxBuffer: context.maxBuffer ?? 1048577,
            timeout: context.timeout ?? selected.component.executionTimeoutMs ?? 30000,
        });
    });
    const supervisor = context.serverSupervisor ?? superviseServer;
    return supervisor({
        profile,
        client,
        projectRoot,
        env,
        runClient: (clientEnv) => runClient({component, args: toolArgs, env: clientEnv}),
    });
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
    let handler;
    try {
        registration = discoverAdapter({
            projectRoot,
            piDir: context.piDir ?? path.join(projectRoot, '.pi'),
        });
        handler = loadAdapterHandler(registration);
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
    try {
        return await runValidatedServer({
            registration,
            handler,
            profileId: parsed.profileId,
            toolId: parsed.toolId,
            toolArgs: parsed.toolArgs,
            projectRoot,
        }, {
            env,
            resolveExecutable,
            serverSupervisor: context.serverSupervisor ?? superviseServer,
            runClient: ({env: clientEnv}) => runClient([
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

module.exports = {runValidatedServer, serverCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
