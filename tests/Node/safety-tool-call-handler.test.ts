// $KYAULabs: safety-tool-call-handler.test.ts kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleToolCall, type ToolCallDeps} from '../../packages/prism-core/extensions/safety/tool-call-handler.ts';

const deps: ToolCallDeps = {cwd: '/repo', home: '/home/tester', extraPaths: []};

for (const tool of ['read', 'ls', 'find', 'grep']) {
    test(`${tool} blocks credential paths without revealing them`, () => {
        const result = handleToolCall(tool, {path: '~/.ssh/id_rsa'}, deps);
        assert.equal(result?.block, true);
        assert.match(result?.reason ?? '', /sensitive-path policy/);
        assert.doesNotMatch(result?.reason ?? '', /id_rsa|tester/);
        assert.equal(handleToolCall(tool, {path: '/repo/README.md'}, deps), undefined);
    });
}

for (const [tool, input] of [
    ['grep', {path: '/repo', glob: '.env'}],
    ['find', {path: '/repo', pattern: '**/.ssh/id_rsa'}],
    ['read', {path: '@/repo/.env.production'}],
] as const) {
    test(`${tool} protects credential patterns and prefixed paths`, () => {
        assert.equal(handleToolCall(tool, input, deps)?.block, true);
    });
}

for (const [tool, input] of [
    ['read', {path: 42}], ['grep', {glob: 42}], ['bash', {command: 42}],
] as const) {
    test(`${tool} rejects malformed input without affecting later operations`, () => {
        const result = handleToolCall(tool, input, deps);
        assert.equal(result?.block, true);
        assert.match(result?.reason ?? '', /malformed/);
        assert.equal(handleToolCall('read', {path: '/repo/README.md'}, deps), undefined);
    });
}

test('shell credential detection retains redacted diagnostics', () => {
    assert.equal(handleToolCall('bash', {command: 'cat ~/.ssh/id_rsa'}, deps)?.block, true);
    const result = handleToolCall('bash', {command: 'echo $(printf PRIVATE-CANARY)'}, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? '', /PRISM-SHELL-001/);
    assert.doesNotMatch(result?.reason ?? '', /PRIVATE-CANARY/);
});

test('ordinary file tools and commands pass without workflow state', () => {
    for (const [tool, input] of [
        ['read', {path: '/repo/.env.example'}],
        ['edit', {path: '/repo/a.ts', edits: []}],
        ['write', {path: '/repo/b.ts', content: 'example'}],
        ['bash', {command: 'git reset --hard'}],
        ['bash', {command: 'git push origin feature'}],
        ['bash', {command: 'rm -rf /repo/build'}],
    ] as const) assert.equal(handleToolCall(tool, input, deps), undefined);
});

test('internal failures block only the current call and do not expose thrown details', () => {
    const input = {get command() { throw new Error('PRIVATE-CANARY'); }};
    const result = handleToolCall('bash', input, deps);
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? '', /PRISM-SHELL-012/);
    assert.doesNotMatch(result?.reason ?? '', /PRIVATE-CANARY/);
    assert.equal(handleToolCall('read', {path: '/repo/README.md'}, deps), undefined);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
