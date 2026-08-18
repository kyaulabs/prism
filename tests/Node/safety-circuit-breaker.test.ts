// $KYAULabs: safety-circuit-breaker.test.ts kyau@aura.kyaulabs 2026/08/17 -0700 Exp $





import { test } from "node:test";
import assert from "node:assert/strict";
import { DenialCircuitBreaker, DEFAULT_THRESHOLD, WINDOW_SIZE } from "../../packages/prism-core/extensions/safety/denial-circuit-breaker.ts";

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

test("a success does not erase denials within the window", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    const obs = b.observe("s1", false);
    assert.deepEqual(obs, { count: 2, tripped: false, transitioned: false });
    assert.equal(b.isTripped("s1"), false);
    const third = b.observe("s1", true);
    assert.equal(third.count, 3);
    assert.equal(third.tripped, true);
    assert.equal(third.transitioned, true);
});

test("interleaved successes cannot prevent the trip", () => {
    const b = new DenialCircuitBreaker();
    assert.equal(b.observe("s1", true).count, 1);
    assert.equal(b.observe("s1", false).count, 1);
    assert.equal(b.observe("s1", true).count, 2);
    assert.equal(b.observe("s1", false).count, 2);
    const fifth = b.observe("s1", true);
    assert.equal(fifth.count, 3);
    assert.equal(fifth.tripped, true);
    assert.equal(fifth.transitioned, true);
});

test("successes age the window out", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    assert.equal(b.isTripped("s1"), true);
    for (let i = 0; i < WINDOW_SIZE; i++) b.observe("s1", false);
    assert.equal(b.count("s1"), 0);
    assert.equal(b.isTripped("s1"), false);
});

test("transitioned does not re-fire while tripped after window aging", () => {
    const b = new DenialCircuitBreaker();
    b.observe("s1", true);
    b.observe("s1", true);
    b.observe("s1", true);
    assert.equal(b.isTripped("s1"), true);
    for (let i = 0; i < 7; i++) b.observe("s1", false); // window [T,T,T,Fx7]
    const obs = b.observe("s1", true); // evicts oldest denial; count stays 3
    assert.equal(obs.count, 3);
    assert.equal(obs.tripped, true);
    assert.equal(obs.transitioned, false);
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

test("invalid threshold or windowSize is rejected", () => {
    assert.throws(() => new DenialCircuitBreaker({ threshold: 0 }), /threshold and windowSize must be >= 1/);
    assert.throws(() => new DenialCircuitBreaker({ windowSize: 0 }), /threshold and windowSize must be >= 1/);
});

test("threshold above windowSize is rejected", () => {
    assert.throws(
        () => new DenialCircuitBreaker({ threshold: 11, windowSize: 10 }),
        /threshold must not exceed windowSize/,
    );
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
