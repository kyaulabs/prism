// $KYAULabs: safety-circuit-breaker.test.ts kyau@aura.kyaulabs 2026/08/16 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker } from "../../packages/prism-core/extensions/safety/denial-circuit-breaker.ts";

test("trips at the default threshold of 3", () => {
    const b = new DenialCircuitBreaker();
    assert.equal(b.observe("s1", true).count, 1);
    assert.equal(b.isTripped("s1"), false);
    assert.equal(b.observe("s1", true).count, 2);
    assert.equal(b.isTripped("s1"), false);
    const third = b.observe("s1", true);
    assert.equal(third.count, 3);
    assert.equal(third.tripped, true);
    assert.equal(third.transitioned, true);
    assert.equal(b.isTripped("s1"), true);
});

test("denials keep counting past the threshold but stay tripped", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    const fourth = b.observe("s1", true);
    assert.equal(fourth.count, 4);
    assert.equal(fourth.tripped, true);
    assert.equal(fourth.transitioned, false);
});

test("a success resets the streak", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    const obs = b.observe("s1", false);
    assert.deepEqual(obs, { count: 0, tripped: false, transitioned: false });
    assert.equal(b.isTripped("s1"), false);
});

test("sessions are isolated", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    assert.equal(b.isTripped("s1"), true);
    assert.equal(b.isTripped("s2"), false);
    assert.equal(b.count("s2"), 0);
});

test("custom threshold", () => {
    const b = new DenialCircuitBreaker({ threshold: 2 });
    assert.equal(b.observe("s1", true).tripped, false);
    const second = b.observe("s1", true);
    assert.equal(second.tripped, true);
    assert.equal(second.transitioned, true);
});

test("reset and clearAll return to never-seen state", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    b.reset("s1");
    assert.equal(b.count("s1"), 0);
    assert.equal(b.isTripped("s1"), false);
    b.observe("s2", true);
    b.clearAll();
    assert.equal(b.count("s2"), 0);
});


// vim: ft=typescript sts=4 sw=4 ts=4 et :
