// $KYAULabs: network.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {promises as dns} from 'node:dns';
import net from 'node:net';
import {WebAccessError} from './errors.ts';

export interface PinnedTarget {
    url: URL;
    address: string;
    family: 4 | 6;
}

export interface LookupAddress {
    address: string;
    family: 4 | 6;
}

export interface LookupOptions {
    all: true;
    verbatim: true;
    signal?: AbortSignal;
}

export interface NetworkDependencies {
    lookup?: (hostname: string, options: LookupOptions) => Promise<LookupAddress[]>;
    signal?: AbortSignal;
}

const IPV4_BLOCKS: ReadonlyArray<readonly [string, number]> = Object.freeze([
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
]);

const IPV6_BLOCKS: ReadonlyArray<readonly [string, number]> = Object.freeze([
    ['::', 128],
    ['::1', 128],
    ['::ffff:0:0', 96],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
    ['fc00::', 7],
    ['fe80::', 10],
    ['fec0::', 10],
    ['ff00::', 8],
]);

function buildBlockList(blocks: ReadonlyArray<readonly [string, number]>, type: 'ipv4' | 'ipv6') {
    const list = new net.BlockList();
    for (const [address, prefix] of blocks) list.addSubnet(address, prefix, type);
    return list;
}

const IPV4_BLOCK_LIST = buildBlockList(IPV4_BLOCKS, 'ipv4');
const IPV6_BLOCK_LIST = buildBlockList(IPV6_BLOCKS, 'ipv6');

function bareHostname(hostname: string): string {
    return hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;
}

function addressFamily(address: string): 4 | 6 | 0 {
    const family = net.isIP(address);
    return family === 4 || family === 6 ? family : 0;
}

function isBlockedAddress(address: string, family: 4 | 6): boolean {
    return family === 4
        ? IPV4_BLOCK_LIST.check(address, 'ipv4')
        : IPV6_BLOCK_LIST.check(address, 'ipv6');
}

function isLoopbackAddress(address: string, family: 4 | 6): boolean {
    if (family === 4) return address.split('.')[0] === '127';
    return address.toLowerCase() === '::1';
}

function parseHttpUrl(input: string): URL {
    if (typeof input !== 'string' || input.length === 0 || input.length > 8192) {
        throw new WebAccessError('WEB_ACCESS_INVALID_URL', 'invalid web URL');
    }
    let url: URL;
    try { url = new URL(input); } catch {
        throw new WebAccessError('WEB_ACCESS_INVALID_URL', 'invalid web URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' ||
        url.password !== '' || url.hash !== '' || url.hostname === '') {
        throw new WebAccessError('WEB_ACCESS_INVALID_URL', 'invalid web URL');
    }
    return url;
}

export function parsePublicUrl(input: string): URL {
    const url = parseHttpUrl(input);
    const hostname = bareHostname(url.hostname);
    const family = addressFamily(hostname);
    if (family !== 0 && isBlockedAddress(hostname, family)) {
        throw new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'web target is not public');
    }
    return url;
}

async function defaultLookup(hostname: string, options: LookupOptions): Promise<LookupAddress[]> {
    return await dns.lookup(hostname, options as never) as unknown as LookupAddress[];
}

async function lookupAll(hostname: string, deps: NetworkDependencies): Promise<LookupAddress[]> {
    if (deps.signal?.aborted) {
        throw new WebAccessError('WEB_ACCESS_CANCELLED', 'web request cancelled');
    }
    try {
        return await (deps.lookup ?? defaultLookup)(hostname, {
            all: true,
            verbatim: true,
            signal: deps.signal,
        });
    } catch (error) {
        if (error instanceof WebAccessError) throw error;
        if (deps.signal?.aborted) {
            throw new WebAccessError('WEB_ACCESS_CANCELLED', 'web request cancelled');
        }
        throw new WebAccessError('WEB_ACCESS_DNS_FAILED', 'web target resolution failed', true);
    }
}

function validateAnswers(answers: LookupAddress[]): LookupAddress[] {
    if (!Array.isArray(answers) || answers.length === 0) {
        throw new WebAccessError('WEB_ACCESS_DNS_FAILED', 'web target resolution failed', true);
    }
    for (const answer of answers) {
        if ((answer.family !== 4 && answer.family !== 6) ||
            addressFamily(answer.address) !== answer.family) {
            throw new WebAccessError('WEB_ACCESS_DNS_FAILED', 'web target resolution failed', true);
        }
    }
    return answers;
}

export async function resolvePublicTarget(
    input: URL,
    deps: NetworkDependencies = {},
): Promise<PinnedTarget> {
    const url = parsePublicUrl(input.href);
    const hostname = bareHostname(url.hostname);
    const literalFamily = addressFamily(hostname);
    if (literalFamily !== 0) return {url, address: hostname, family: literalFamily};
    const answers = validateAnswers(await lookupAll(hostname, deps));
    if (answers.some(({address, family}) => isBlockedAddress(address, family))) {
        throw new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'web target is not public');
    }
    return {url, address: answers[0].address, family: answers[0].family};
}

export async function validateLoopbackUrl(
    input: string,
    deps: NetworkDependencies = {},
): Promise<PinnedTarget> {
    const url = parseHttpUrl(input);
    const hostname = bareHostname(url.hostname);
    const literalFamily = addressFamily(hostname);
    if (literalFamily !== 0) {
        if (!isLoopbackAddress(hostname, literalFamily)) {
            throw new WebAccessError('WEB_ACCESS_LOOPBACK_REQUIRED', 'loopback web target required');
        }
        return {url, address: hostname, family: literalFamily};
    }
    if (hostname.toLowerCase() !== 'localhost') {
        throw new WebAccessError('WEB_ACCESS_LOOPBACK_REQUIRED', 'loopback web target required');
    }
    const answers = validateAnswers(await lookupAll(hostname, deps));
    if (answers.some(({address, family}) => !isLoopbackAddress(address, family))) {
        throw new WebAccessError('WEB_ACCESS_LOOPBACK_REQUIRED', 'loopback web target required');
    }
    return {url, address: answers[0].address, family: answers[0].family};
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
