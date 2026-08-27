// $KYAULabs: config.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {createRequire} from 'node:module';
import type {BrowserCapability} from './browser.ts';
import {WebAccessError} from './errors.ts';

const require = createRequire(import.meta.url);

export interface WebAccessConfig {
    searxngUrl: string | null;
    browser: 'auto' | 'disabled';
}

interface ConfigInspection {
    state: string;
    path?: string;
    config?: unknown;
}

export interface ConfigDependencies {
    inspectWebAccessConfig?: () => ConfigInspection;
}

export interface BrowserResolverDependencies {
    resolveWebAccessBrowser?: () => BrowserCapability;
}

function launcherInspect(): ConfigInspection {
    const launcher = require('../../scripts/prism-tool/web-access-config.js') as {
        inspectWebAccessConfig(): ConfigInspection;
    };
    return launcher.inspectWebAccessConfig();
}

function launcherResolveBrowser(): BrowserCapability {
    const launcher = require('../../scripts/prism-tool/web-access-browser.js') as {
        resolveWebAccessBrowser(): BrowserCapability;
    };
    return launcher.resolveWebAccessBrowser();
}

export function loadWebAccessConfig(deps: ConfigDependencies = {}): WebAccessConfig {
    let inspected: ConfigInspection;
    try { inspected = (deps.inspectWebAccessConfig ?? launcherInspect)(); } catch {
        throw new WebAccessError('WEB_ACCESS_CONFIG_UNSAFE', 'web-access configuration is unsafe');
    }
    if (inspected.state === 'UNSAFE') {
        throw new WebAccessError('WEB_ACCESS_CONFIG_UNSAFE', 'web-access configuration is unsafe');
    }
    const config = inspected.config;
    if (config === null || Array.isArray(config) || typeof config !== 'object') {
        throw new WebAccessError('WEB_ACCESS_CONFIG_UNSAFE', 'web-access configuration is unsafe');
    }
    const value = config as {searxngUrl?: unknown; browser?: unknown};
    if (JSON.stringify(Object.keys(value).sort()) !==
            JSON.stringify(['browser', 'searxngUrl']) ||
        !(value.searxngUrl === null || typeof value.searxngUrl === 'string') ||
        !['auto', 'disabled'].includes(value.browser as string)) {
        throw new WebAccessError('WEB_ACCESS_CONFIG_UNSAFE', 'web-access configuration is unsafe');
    }
    return {
        searxngUrl: value.searxngUrl,
        browser: value.browser as 'auto' | 'disabled',
    };
}

export function resolveBrowserCapability(
    deps: BrowserResolverDependencies = {},
): BrowserCapability {
    try {
        const capability = (deps.resolveWebAccessBrowser ?? launcherResolveBrowser)();
        if (capability.status === 'UNAVAILABLE') return capability;
        if (capability.status === 'AVAILABLE' && typeof capability.family === 'string' &&
            typeof capability.executable === 'string') return capability;
    } catch { return {status: 'UNAVAILABLE'}; }
    return {status: 'UNAVAILABLE'};
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
