import path from 'node:path';
import {resolveSensitivePath, sensitivePathMatch, type SensitiveMatch, type SensitivePathOptions} from './sensitive-paths.ts';

// A small operand scanner, not a PowerShell interpreter. Backslash is a path
// separator, backtick escapes, and quoted whitespace stays within its operand.
export function powershellOperands(command: string): string[] {
    const output: string[] = [];
    let token = '';
    let quote = '';
    for (let index = 0; index < command.length; index++) {
        const character = command[index];
        if (character === '`' && quote !== "'") {
            const next = command[++index];
            if (next && next !== '\n' && next !== '\r') token += next;
        } else if (quote && character === quote) {
            if (quote === "'" && command[index + 1] === "'") { token += "'"; index++; }
            else quote = '';
        } else if (!quote && (character === '"' || character === "'")) {
            quote = character;
        } else if (!quote && /[\s;|&()<>,=]/.test(character)) {
            if (token) output.push(token);
            token = '';
        } else token += character;
    }
    if (token) output.push(token);
    return output;
}

export function sensitivePowerShellCheck(command: string, options: SensitivePathOptions): SensitiveMatch | null {
    const windows = /^[a-z]:[\\/]|^\\\\/i.test(options.home);
    const homeDrive = windows ? options.home.slice(0, 2) : '';
    const homePath = windows ? options.home.slice(2) : options.home;
    // Only path-valued environment aliases, never arbitrary environment values.
    const aliases: Record<string, string> = {
        home: options.home, userprofile: options.home, homedrive: homeDrive, homepath: homePath,
        appdata: process.platform === 'win32' ? process.env.APPDATA ?? path.win32.join(options.home, 'AppData/Roaming') : path.win32.join(options.home, 'AppData/Roaming'),
        localappdata: process.platform === 'win32' ? process.env.LOCALAPPDATA ?? path.win32.join(options.home, 'AppData/Local') : path.win32.join(options.home, 'AppData/Local'),
    };
    for (let operand of powershellOperands(command)) {
        operand = operand.replace(/^@+/, '').replace(/^(?:Microsoft\.PowerShell\.Core\\)?FileSystem::/i, '')
            .replace(/^-(?:literalpath|path):/i, '')
            .replace(/\$\{(?:env:)?(home|userprofile|homedrive|homepath|appdata|localappdata|pwd)\}|\$(?:env:)?(home|userprofile|homedrive|homepath|appdata|localappdata|pwd)\b/gi,
                (_match, braced: string | undefined, plain: string | undefined) => {
                    const key = (braced ?? plain ?? '').toLowerCase();
                    return key === 'pwd' ? options.projectDir : aliases[key];
                });
        if (/(?:^|[\\/])\.(?:ssh|aws)(?:[\\/]|$)/i.test(operand)) return {className: 'credential-directory'};
        const basename = operand.split(/[\\/]/).at(-1) ?? '';
        if (/^\.env[?*\[]/i.test(basename)) return {className: 'env'};
        const match = sensitivePathMatch(resolveSensitivePath(operand, options), options);
        if (match) return match;
    }
    return null;
}
