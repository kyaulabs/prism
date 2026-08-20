// $KYAULabs: fatal-commit-latch.ts kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

export class FatalCommitLatch {
    private readonly sessions = new Set<string>();
    private readonly pending = new Map<string, string>();

    isLatched(sid: string): boolean {
        return this.sessions.has(sid);
    }

    trip(sid: string): boolean {
        if (this.sessions.has(sid)) return false;
        this.sessions.add(sid);
        return true;
    }

    track(toolCallId: string, sid: string): void {
        this.pending.set(toolCallId, sid);
    }

    complete(toolCallId: string): string | undefined {
        const sid = this.pending.get(toolCallId);
        this.pending.delete(toolCallId);
        return sid;
    }

    clearAll(): void {
        this.sessions.clear();
        this.pending.clear();
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
