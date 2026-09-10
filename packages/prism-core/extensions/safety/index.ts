// $KYAULabs: index.ts kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {homedir} from 'node:os';
import {handleToolCall, resolveExtraPaths} from './tool-call-handler.ts';

export default function (pi: ExtensionAPI) {
    const home = homedir();
    let extraPaths: string[] = [];

    pi.on('session_start', () => {
        extraPaths = resolveExtraPaths(process.env.PRISM_SENSITIVE_PATHS);
    });

    pi.on('tool_call', (event, ctx) => handleToolCall(event.toolName, event.input, {
        cwd: ctx.cwd,
        home,
        extraPaths,
    }));
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
