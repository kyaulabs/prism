import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadAdditionalSensitivePaths, sensitiveOperandCheck, sensitivePathMatch, sensitivePatternCheck} from './sensitive-paths.ts';

export interface ToolCallDeps {cwd:string; home:string; extraPaths:string[]}
export type ToolCallResult = {block:true; reason:string} | undefined;
const blocked = ():ToolCallResult => ({block:true, reason:'[prism safety] Protected credential access or failed secret-safety inspection.'});

export function resolveExtraPaths(value?:string, log: (message:string) => void = console.error):string[] {
    const paths:string[] = [];
    for (const entry of (value ?? '').split('\n')) {
        try { paths.push(...loadAdditionalSensitivePaths(entry)); }
        catch { log('[prism safety] Invalid additional path ignored; other credential protection remains active.'); }
    }
    return paths;
}

function inspectCommit(command:string, deps:ToolCallDeps):ToolCallResult {
    let cwd = deps.cwd;
    for (const segment of command.split(/&&|[;\n]/)) {
        const tokens = (segment.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [])
            .map(token => token.replace(/^["']|["']$/g, ''));
        if (tokens[0] === 'cd' && tokens[1]) cwd = path.resolve(cwd, tokens[1]);
        const git = tokens[0] === 'command' ? 1 : 0;
        if (path.basename(tokens[git] ?? '') !== 'git') continue;
        let subcommand = git + 1;
        while (tokens[subcommand]?.startsWith('-')) {
            const takesValue = ['-C','-c','--git-dir','--work-tree','--namespace','--config-env','--super-prefix'].includes(tokens[subcommand]);
            subcommand += takesValue ? 2 : 1;
        }
        if (tokens[subcommand] !== 'commit') continue;
        const prefix = tokens.slice(git + 1, subcommand);
        const run = (args:string[]) => spawnSync('git', [...prefix, ...args], {cwd, encoding:'utf8', timeout:10000, maxBuffer:4 * 1024 * 1024});
        const root = run(['rev-parse','--show-toplevel']);
        const names = run(['diff','--cached','--name-only','--diff-filter=ACMRT','-z']);
        if (root.status !== 0 || names.status !== 0) return blocked();
        const options = {projectDir:root.stdout.trim(), home:deps.home, extraPaths:deps.extraPaths};
        if (names.stdout.split('\0').filter(Boolean).some(file => sensitivePathMatch(path.resolve(options.projectDir,file), options))) return blocked();
        const scan = spawnSync('gitleaks', ['git','--pre-commit','--staged','--redact','--no-color'],
            {cwd:options.projectDir, encoding:'utf8', timeout:30000, maxBuffer:1024 * 1024});
        if (scan.error && 'code' in scan.error && scan.error.code === 'ENOENT') {
            console.error('[prism safety] gitleaks unavailable; staged value scan was not run.');
        } else if (scan.status !== 0) return blocked();
    }
    return undefined;
}

export function handleToolCall(tool:string, input:unknown, deps:ToolCallDeps):ToolCallResult {
    try {
        const args = input as {path?:string; command?:string; glob?:string; pattern?:string};
        const options = {projectDir:deps.cwd, home:deps.home, extraPaths:deps.extraPaths};
        if (tool === 'bash') {
            if (typeof args.command !== 'string') return blocked();
            if (sensitiveOperandCheck(args.command, options)) return blocked();
            return inspectCommit(args.command, deps);
        }
        if (['read','edit','write','ls','grep','find'].includes(tool)) {
            if (args.path !== undefined && typeof args.path !== 'string') return blocked();
            if (args.path && sensitivePathMatch(path.resolve(deps.cwd, args.path.replace(/^~/, deps.home).replace(/^@/, '')), options)) return blocked();
            if (['grep','find'].includes(tool) && sensitivePatternCheck(args.glob ?? args.pattern, args.path ?? deps.cwd, options)) return blocked();
        }
    } catch { return blocked(); }
    return undefined;
}
