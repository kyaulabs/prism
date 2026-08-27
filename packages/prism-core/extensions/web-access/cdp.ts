// $KYAULabs: cdp.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import type {Readable, Writable} from 'node:stream';
import {WebAccessError} from './errors.ts';

const MAX_MESSAGE_BYTES = 1024 * 1024;

interface PendingCommand {
    resolve(value: unknown): void;
    reject(error: Error): void;
}

export interface CdpEvent {
    method: string;
    params?: Record<string, unknown>;
    sessionId?: string;
}

export class CdpPipe {
    private readonly input: Writable;
    private readonly pending = new Map<number, PendingCommand>();
    private readonly handlers = new Map<string, Set<(event: CdpEvent) => void | Promise<void>>>();
    private buffer = Buffer.alloc(0);
    private closed = false;
    private nextId = 1;

    constructor(input: Writable, output: Readable) {
        this.input = input;
        output.on('data', (chunk: Buffer | string) => this.receive(chunk));
        output.once('error', () => this.close());
        output.once('end', () => this.close());
    }

    on(method: string, handler: (event: CdpEvent) => void | Promise<void>): () => void {
        const handlers = this.handlers.get(method) ?? new Set();
        handlers.add(handler);
        this.handlers.set(method, handlers);
        return () => handlers.delete(handler);
    }

    send(
        method: string,
        params: Record<string, unknown> = {},
        sessionId?: string,
    ): Promise<unknown> {
        if (this.closed) {
            return Promise.reject(new WebAccessError(
                'WEB_ACCESS_BROWSER_PROTOCOL',
                'browser protocol failed',
                true,
            ));
        }
        const id = this.nextId;
        this.nextId += 1;
        const message = JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})});
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject});
            try {
                this.input.write(`${message}\u0000`);
            } catch {
                this.pending.delete(id);
                reject(new WebAccessError(
                    'WEB_ACCESS_BROWSER_PROTOCOL',
                    'browser protocol failed',
                    true,
                ));
            }
        });
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        const error = new WebAccessError(
            'WEB_ACCESS_BROWSER_PROTOCOL',
            'browser protocol failed',
            true,
        );
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.handlers.clear();
    }

    private receive(chunk: Buffer | string): void {
        if (this.closed) return;
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        this.buffer = Buffer.concat([this.buffer, data]);
        if (this.buffer.length > MAX_MESSAGE_BYTES && this.buffer.indexOf(0) < 0) {
            this.close();
            return;
        }
        let boundary = this.buffer.indexOf(0);
        while (boundary >= 0) {
            const raw = this.buffer.subarray(0, boundary);
            this.buffer = this.buffer.subarray(boundary + 1);
            if (raw.length > 0) this.dispatch(raw);
            boundary = this.buffer.indexOf(0);
        }
    }

    private dispatch(raw: Buffer): void {
        let message: Record<string, unknown>;
        try {
            if (raw.length > MAX_MESSAGE_BYTES) throw new Error();
            message = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        } catch {
            this.close();
            return;
        }
        if (typeof message.id === 'number') {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error !== undefined) {
                pending.reject(new WebAccessError(
                    'WEB_ACCESS_BROWSER_PROTOCOL',
                    'browser protocol failed',
                    true,
                ));
            } else pending.resolve(message.result);
            return;
        }
        if (typeof message.method !== 'string') return;
        const event: CdpEvent = {
            method: message.method,
            ...(message.params && typeof message.params === 'object'
                ? {params: message.params as Record<string, unknown>}
                : {}),
            ...(typeof message.sessionId === 'string' ? {sessionId: message.sessionId} : {}),
        };
        for (const handler of this.handlers.get(message.method) ?? []) {
            Promise.resolve(handler(event)).catch(() => this.close());
        }
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
