// $KYAULabs: safety-classify.test.ts kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "../../packages/prism-core/extensions/safety/pre-tool-use.ts";

const OPTS = { projectDir: "/repo", safeRelDirs: ["node_modules", "vendor"] };

test("empty command passes open", () => {
    assert.equal(classifyCommand("", OPTS), null);
});

test("rm -rf inside a safe zone passes", () => {
    assert.equal(classifyCommand("rm -rf node_modules", OPTS), null);
    assert.equal(classifyCommand("rm -rf /tmp/xyz", OPTS), null);
    assert.equal(classifyCommand("cd /repo && rm -rf vendor/pkg", OPTS), null);
});

test("rm -rf outside safe zones blocks", () => {
    assert.equal(classifyCommand("rm -rf /", OPTS)?.severity, "block");
    assert.equal(classifyCommand("rm -rf .", OPTS)?.severity, "block");
    assert.equal(classifyCommand("rm -rf x", OPTS)?.severity, "block");
    assert.equal(classifyCommand("sudo rm -rf /etc", OPTS)?.severity, "block");
});

test("rm -rf with no operands at head passes; via xargs blocks", () => {
    assert.equal(classifyCommand("rm -rf", OPTS), null);
    assert.equal(classifyCommand("xargs rm -rf", OPTS)?.severity, "block");
});

test("rm without -r is not blocked", () => {
    assert.equal(classifyCommand("rm -f node_modules", OPTS), null);
});

test("rm -rf of a safe-zone path containing = stays allowed", () => {
    assert.equal(classifyCommand("rm -rf node_modules/foo=bar", OPTS), null);
});

test("find -delete and find -exec rm block; other find -exec passes", () => {
    assert.equal(classifyCommand("find . -delete", OPTS)?.severity, "block");
    assert.equal(classifyCommand("find . -exec rm {} ;", OPTS)?.severity, "block");
    assert.equal(classifyCommand("find . -exec echo {} ;", OPTS), null);
});

test("destructive SQL DROP warns", () => {
    assert.equal(classifyCommand("DROP TABLE users", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("DROP DATABASE db", OPTS)?.severity, "warn");
});

test("git reset --hard warns", () => {
    assert.equal(classifyCommand("git reset --hard", OPTS)?.severity, "warn");
});

test("git push --delete warns", () => {
    assert.equal(classifyCommand("git push origin --delete feature/x", OPTS)?.severity, "warn");
});

test("git push --force variants block; --force-with-lease passes", () => {
    assert.equal(classifyCommand("git push -f", OPTS)?.severity, "block");
    assert.equal(classifyCommand("git push --force", OPTS)?.severity, "block");
    assert.equal(classifyCommand("git push -uf origin main", OPTS)?.severity, "block");
    assert.equal(classifyCommand("git push --force-with-lease", OPTS), null);
});

test("git push -n is dry-run, not no-verify", () => {
    assert.equal(classifyCommand("git push -n", OPTS), null);
});

test("git commit --no-verify and -n block", () => {
    assert.equal(classifyCommand("git commit --no-verify -m x", OPTS)?.severity, "block");
    assert.equal(classifyCommand("git commit -n -m x", OPTS)?.severity, "block");
});

test("git log -n 5 is max-count, not no-verify", () => {
    assert.equal(classifyCommand("git log -n 5", OPTS), null);
});

test("git global options are consumed before the subcommand", () => {
    assert.equal(classifyCommand("git -c core.hooksPath=/tmp/x commit -m y", OPTS), null);
});

test("wrapper unwrap: clean inner passes, destructive inner blocks", () => {
    assert.equal(classifyCommand('bash -c "rm -rf /tmp/x"', OPTS), null);
    assert.equal(classifyCommand('bash -c "rm -rf /"', OPTS)?.severity, "block");
    assert.equal(classifyCommand("env FOO=1 rm -rf node_modules", OPTS), null);
    assert.equal(classifyCommand("command rm -rf node_modules", OPTS), null);
});

test("recursive eval payloads fail closed at every wrapper depth", () => {
    assert.equal(classifyCommand("eval echo hi", OPTS)?.severity, "block");
    assert.equal(classifyCommand("eval eval echo hi", OPTS)?.severity, "block");
    assert.equal(classifyCommand("eval eval eval echo hi", OPTS)?.severity, "block");
});

test("non-string command fails closed", () => {
    const f = classifyCommand(undefined as unknown as string, OPTS);
    assert.equal(f?.severity, "block");
    assert.match(f?.reason ?? "", /internal error/);
});

test("fail-closed: substitution/ANSI-C/here-string constructs block", () => {
    assert.equal(classifyCommand("echo $(rm -rf /home/u/x)", OPTS)?.severity, "block");
    assert.equal(classifyCommand("echo `rm -rf /home/u/x`", OPTS)?.severity, "block");
    assert.equal(classifyCommand("cat <(rm -rf /home/u/x)", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash -c $'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("eval $'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash <<< 'rm -rf /home/u/x'", OPTS)?.severity, "block");
});

test("fail-closed: benign substitution reports the shared redacted diagnostic", () => {
    const finding = classifyCommand("echo $(date)", OPTS);
    assert.equal(finding?.severity, "block");
    assert.match(finding?.reason ?? "", /PRISM-SHELL-001/);
    assert.match(finding?.reason ?? "", /category=command-substitution/);
    assert.doesNotMatch(finding?.reason ?? "", /date/);
});

test("wrapper-anywhere: sudo/timeout/xargs/find-wrapped payloads reclassify", () => {
    assert.equal(classifyCommand('sudo bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('sudo -u root bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('timeout 10 bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('xargs bash -c "rm -rf /home/u/x"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('find . -exec bash -c "rm -rf /home/u/x" \\;', OPTS)?.severity, "block");
});

test("wrapper-anywhere: safe-zone payloads stay allowed", () => {
    assert.equal(classifyCommand('sudo bash -c "rm -rf /tmp/x"', OPTS), null);
    assert.equal(classifyCommand('timeout 10 bash -c "rm -rf node_modules"', OPTS), null);
});

test("wrapper-anywhere: quoted wrapper-shaped literals pass", () => {
    assert.equal(classifyCommand('echo \'bash -c "rm -rf /tmp/x"\'', OPTS), null);
});

test("git reset --hard warns across globals, flags, and whitespace", () => {
    assert.equal(classifyCommand("git   reset   --hard HEAD~1", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("git -c core.hooksPath=/tmp/x reset --hard", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("git reset -q --hard", OPTS)?.severity, "warn");
});

test("git push --delete warns; short -d form now warns too", () => {
    assert.equal(classifyCommand("git push -d origin main", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("git push -u origin --delete feature/x", OPTS)?.severity, "warn");
});

test("wrapper-anywhere: segment tokens still analyzed after a clean wrapper payload", () => {
    assert.equal(classifyCommand("rm -rf /home/u/x bash -c 'echo ok'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("sudo rm -rf /etc bash -c 'echo ok'", OPTS)?.severity, "block");
    // Trailing tokens after rm -rf are rm operands: `bash` resolves to a
    // project-relative path outside safe zones, so this fails closed.
    assert.equal(classifyCommand("rm -rf /tmp/x bash -c 'echo ok'", OPTS)?.severity, "block");
});

test("git rules apply when git is not the first token of the segment", () => {
    assert.equal(classifyCommand("cd /repo && git reset --hard", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("echo ok; git push origin --delete x", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("xargs git push -f", OPTS)?.severity, "block");
    assert.equal(classifyCommand("echo ok; git commit --no-verify -m x", OPTS)?.severity, "block");
});

test("wrapper-anywhere: short-flag bundles containing -c are unwrapped", () => {
    assert.equal(classifyCommand("bash -lc 'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("sh -cl 'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash -lc 'echo hi'", OPTS), null);
});

test("git rules do not fire when git is a plain argument", () => {
    assert.equal(classifyCommand("echo git push -f", OPTS), null);
    assert.equal(classifyCommand("man git reset --hard", OPTS), null);
    assert.equal(classifyCommand('git commit -m "git push -f"', OPTS), null);
});

test("git rules fire for wrappers with options or arguments", () => {
    assert.equal(classifyCommand("sudo -u root git push -f", OPTS)?.severity, "block");
    assert.equal(classifyCommand("timeout 10 git push -f", OPTS)?.severity, "block");
    assert.equal(classifyCommand("xargs -n1 git push -f", OPTS)?.severity, "block");
    assert.equal(classifyCommand("env FOO=1 git reset --hard", OPTS)?.severity, "warn");
    assert.equal(classifyCommand("echo sudo git push -f", OPTS), null);
    assert.equal(classifyCommand("echo 10 git push -f", OPTS), null);
});

test("wrapper payloads that are bare variable references fail closed", () => {
    assert.equal(classifyCommand('bash -c "$cmd"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('sudo bash -c "$cmd"', OPTS)?.severity, "block");
    assert.equal(classifyCommand('cmd="rm -rf /home/u/x"; bash -c "$cmd"', OPTS)?.severity, "block");
    assert.equal(classifyCommand("echo $cmd", OPTS), null);
});

test("git rules fire through chained wrappers", () => {
    assert.equal(classifyCommand("sudo -u root env FOO=1 git push -f", OPTS)?.severity, "block");
});

test("wrapper-anywhere: options between wrapper and -c are skipped", () => {
    assert.equal(classifyCommand("bash -e -c 'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash -v -c 'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash script.sh -c x", OPTS), null);
});

test("variable-reference payloads fail closed across quoting and segments", () => {
    assert.equal(classifyCommand('bash -c "\\"$cmd\\""', OPTS)?.severity, "block");
    assert.equal(classifyCommand("echo hi; $cmd", OPTS)?.severity, "block");
    assert.equal(classifyCommand("echo $cmd", OPTS), null);
});

test("quote-aware segmentation: quoted separators do not split", () => {
    assert.equal(classifyCommand("bash -c 'echo hi; $cmd'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash -c 'echo hi; echo ok'", OPTS), null);
    assert.equal(classifyCommand('echo "x;y"', OPTS), null);
});

test("head-wrapper trailing operands still judged", () => {
    assert.equal(classifyCommand("bash -c 'echo ok' ~/.ssh/id_rsa", OPTS), null);
});

test("non-numeric bare words after wrappers are not wrapper arguments", () => {
    assert.equal(classifyCommand("sudo echo git push -f", OPTS), null);
    assert.equal(classifyCommand("timeout 10 git push -f", OPTS)?.severity, "block");
});

test("segment blocks beat earlier-segment warns", () => {
    assert.equal(classifyCommand("git reset --hard; rm -rf /home/u/x", OPTS)?.severity, "block");
    assert.equal(classifyCommand("git reset --hard; bash -c 'rm -rf /home/u/x'", OPTS)?.severity, "block");
});

test("wrapper-anywhere: value-taking long options are skipped", () => {
    assert.equal(classifyCommand("bash --rcfile /dev/null -c 'rm -rf /home/u/x'", OPTS)?.severity, "block");
    assert.equal(classifyCommand("bash --noprofile -c 'echo hi'", OPTS), null);
});

test("comment-aware segmentation: comment text does not split", () => {
    assert.equal(classifyCommand("echo ok # ; rm -rf /home/u/x", OPTS), null);
    assert.equal(classifyCommand("rm -rf /home/u/x # note", OPTS)?.severity, "block");
});

test("absolute git paths are recognized", () => {
    assert.equal(classifyCommand("/usr/bin/git reset --hard", OPTS)?.severity, "warn");
});

test("time-suffixed wrapper arguments are recognized", () => {
    assert.equal(classifyCommand("timeout 10s git push -f", OPTS)?.severity, "block");
});

test("assignment-prefixed bare words are not wrapper arguments", () => {
    assert.equal(classifyCommand("FOO=1 echo git push -f", OPTS), null);
});

test("pass 2: git blocks beat git warns across segments", () => {
    assert.equal(classifyCommand("git reset --hard; git push -f", OPTS)?.severity, "block");
});

test("redirection operators do not split segments", () => {
    assert.equal(classifyCommand("echo hi 2>&1", OPTS), null);
    assert.equal(classifyCommand("echo hi >&2", OPTS), null);
    // rm with a trailing redirection fails closed: the parser treats the
    // redirection tokens as unresolvable operands (conservative).
    assert.equal(classifyCommand("rm -rf /tmp/x 2>&1", OPTS)?.severity, "block");
});

test("variable in command position blocks; path-prefix variables pass", () => {
    assert.equal(classifyCommand("$cmd -rf /home/u/x", OPTS)?.severity, "block");
    assert.equal(classifyCommand("$HOME/bin/foo", OPTS), null);
});

test("absolute wrapper paths are unwrapped", () => {
    assert.equal(classifyCommand("/bin/bash -c 'rm -rf /home/u/x'", OPTS)?.severity, "block");
});

test("find -exec git invocations are recognized", () => {
    assert.equal(classifyCommand("find . -exec git push -f \\;", OPTS)?.severity, "block");
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
