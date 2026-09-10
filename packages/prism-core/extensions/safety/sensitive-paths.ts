import {createRequire} from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const policy = require('../../scripts/sensitive-path-policy.js');

export interface SensitivePathOptions {projectDir:string; home:string; extraPaths?:string[]}
export interface SensitiveMatch {className:string}
export const sensitivePathMatch = policy.sensitivePathMatch as (file:string, options:SensitivePathOptions) => SensitiveMatch | null;
export const loadAdditionalSensitivePaths = policy.loadAdditionalSensitivePaths as (value?:string) => string[];

function resolve(value:string, options:SensitivePathOptions):string {
    return path.resolve(options.projectDir, value.replace(/^~/, options.home)
        .replace(/\$\{?HOME\}?/g, options.home).replace(/\$\{?PWD\}?/g, options.projectDir));
}

export function sensitivePatternCheck(pattern:unknown, base:string, options:SensitivePathOptions):SensitiveMatch | null {
    if (pattern === undefined) return null;
    if (typeof pattern !== 'string') return {className:'malformed'};
    return sensitiveOperandCheck(pattern, {...options, projectDir:resolve(base, options)});
}

// A backstop for explicit references, not a shell interpreter or security sandbox.
// Computed paths and arbitrary programs cannot be proven safe through text analysis.
export function sensitiveOperandCheck(command:string, options:SensitivePathOptions):SensitiveMatch | null {
    const text = command.replace(/\\\n/g, '').replace(/\\(.)/g, '$1').replace(/["']/g, '');
    if (/(?:^|[\s/])\.(?:ssh|aws)(?:\/|\b)|\/etc\/ssl\/private\//.test(text)) return {className:'credential-directory'};
    for (const token of text.split(/[\s;&|()<>`=]+/).filter(Boolean)) {
        const value = token.replace(/^@+/, '').replace(/\\([ .])/g, '$1');
        if (/^\.env[?*\[]/.test(path.basename(value))) return {className:'env'};
        const match = sensitivePathMatch(resolve(value, options), options);
        if (match) return match;
    }
    return null;
}
