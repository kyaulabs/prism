// $KYAULabs: native-session-continuity.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

test('the packaged session-handoff command is removed', () => {
    assert.equal(fs.existsSync(path.join(root, 'packages/prism-core/prompts/handoff.md')), false);
});

const active = [
    'packages/prism-core/AGENTS.md', 'README.md', 'CODING_HARNESS.md',
    'packages/prism-core/docs/context-management.md',
    'packages/prism-core/skills/executing-plans/SKILL.md',
    'packages/prism-core/skills/from-issue/SKILL.md',
    'packages/prism-core/skills/wayfinder/SKILL.md',
];

test('active workflows contain no session-handoff capability', () => {
    for (const file of active) {
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        assert.doesNotMatch(text, /\/handoff\b|docs\/handoffs\//, file);
        assert.doesNotMatch(text, /(?:write|create|use|run) (?:a |the )?handoff/i, file);
    }
});

test('context guidance uses native compaction and preserves safety recovery', () => {
    const text = fs.readFileSync(path.join(root, active[3]), 'utf8');
    assert.match(text, /native compaction/i);
    assert.doesNotMatch(text, /(?:30|40|50|60)%/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
