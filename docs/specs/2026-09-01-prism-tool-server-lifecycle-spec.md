# Prism Tool Server Lifecycle Specification

**Date:** 2026-09-01

**Status:** Approved design

**Scope:** Prism Core and the PHP/web stack adapter

## Purpose

Test suites sometimes require a local server. A fixed port makes otherwise valid local and concurrent runs fail when another process already owns that port. Prism must supervise these servers through `prism-tool`, select the available valid port numerically closest to the port requested by the active package, pass the selected endpoint to the test tool, and clean up only the process it owns.

The capability must remain language- and protocol-neutral so future stack adapters can use it for web servers, database fixtures, emulators, or other TCP-listening test dependencies.

## Requirements

1. Prism Core owns one foreground-scoped server lifecycle operation under `prism-tool`.
2. Every server profile declares its own preferred port. Core has no default preferred port.
3. The PHP/web browser-fixture profile requests port `8080`; this is an adapter choice, not a Core convention.
4. If the preferred port is occupied, Core searches by absolute numeric distance and resolves equal-distance candidates upward first. For preferred port `P`, the order is `P`, `P+1`, `P-1`, `P+2`, `P-2`, continuing outward.
5. Candidates outside `1–65535` are skipped.
6. An occupied server is never reused, even when it serves the expected fixture.
7. Port selection handles a process winning the port between availability probing and server startup.
8. Core requires TCP readiness and supports one optional adapter-supplied semantic health command.
9. The selected endpoint is available to the client through validated environment templates.
10. The client command is an allowed toolchain command resolved by `prism-tool`, not arbitrary shell or project-supplied argv.
11. The server lifetime is bounded to the client invocation. The operation never leaves a detached server.
12. Cleanup stops only the server process started by the active lifecycle.
13. Existing adapters that expose no server profiles remain compatible.
14. Local checks, generated CI, TDD guidance, and canonical test documentation use the same supervised PHP/web lifecycle.

## Architecture

### Context

```text
Developer or CI
      |
      | prism-tool server run <profile> --tool <tool> -- <args>
      v
Prism Core server supervisor
      |                         |
      | trusted profile        | validated client tool
      v                         v
Active stack adapter       Toolchain contract
      |
      | server process + optional health process
      v
Loopback test dependency
```

### Core server supervisor

Core exposes this interface:

```text
prism-tool server run <package-name>:<profile-id> --tool <tool-id> -- <tool arguments>
```

For the PHP/web browser suite, the canonical coverage command is:

```text
prism-tool server run @kyaulabs/prism-php-web:browser-fixture \
  --tool pest -- --coverage
```

The supervisor hides candidate generation, contention handling, process ownership, readiness, environment expansion, signal forwarding, client execution, and cleanup behind this single operation.

The operation is synchronous. It returns the client tool's exit status after cleanup. Startup, profile, readiness, and cleanup failures use distinct non-client failure categories.

### Trusted server profiles

The trusted adapter handler contract gains an optional server-profile provider. A profile has a closed, schema-versioned shape containing:

- package identity and profile ID;
- validated loopback host;
- preferred port;
- a foreground server executable and argument-array templates;
- allowed client tool IDs;
- environment templates for the client;
- startup timeout;
- optional semantic health-command argv.

Profile references are namespaced by package identity. Duplicate references, unsupported schemas, unknown keys, invalid ports, non-loopback hosts, unsafe templates, unknown client tools, and duplicate allowed tools fail before process creation.

Templates support only documented host and port substitutions. They are expanded as argument-array or environment values and are never evaluated by a shell.

The profile provider is optional. Adapter discovery and existing operations behave as before when the method is absent.

### Port selection and startup

Core generates candidates from the profile's preferred port in nearest-first, higher-on-tie order.

For each candidate:

1. Probe the loopback socket. If another process accepts a connection, skip the candidate without reusing that process.
2. Launch the profile's server process with the candidate substituted into its validated argv.
3. Wait for the owned process and TCP endpoint within the profile timeout.
4. If the process exits before readiness, probe the candidate again.
   - If another process now owns the socket, classify the result as a bind race and continue with the next candidate.
   - If the socket is not owned, classify the result as a real server-startup failure and stop rather than scanning the remaining port range.
5. Once the owned process remains alive and TCP is ready, accept the candidate.

This guarded probe cannot eliminate the operating system race between probing and binding, but it detects the externally observable race without treating every server configuration failure as contention.

If every valid candidate is occupied, the operation fails with port-exhaustion diagnostics and does not run the client.

### Readiness and client environment

TCP readiness is mandatory and protocol-neutral. After TCP readiness, Core runs the optional trusted health argv with `PRISM_SERVER_HOST` and `PRISM_SERVER_PORT` in its environment.

A health failure indicates a broken server or fixture, not port contention. Core stops the owned process and fails without trying another port.

After readiness succeeds, Core expands the profile's validated client environment templates. The PHP/web profile sets:

```text
PEST_BROWSER_BASE_URL=http://127.0.0.1:<selected-port>
```

Core resolves the requested client through the existing toolchain contract and verifies that the profile permits that tool ID. The client receives its ordinary arguments after `--`.

### Process ownership and cleanup

Core starts the server in an owned process group and supervises it for the duration of the client command. Profiles must keep the server in the foreground. Core forwards supported termination signals, waits for bounded shutdown, and escalates only against the owned process group when necessary.

Cleanup runs after client success, client failure, startup failure, timeout, health failure, or termination. Pre-existing listeners and unrelated processes are never signalled.

Diagnostics identify the profile reference, preferred and selected ports when known, lifecycle phase, and a stable failure category. Bounded output follows existing Prism redaction and untrusted-subprocess rules; raw command data is not used as executable input.

## PHP/Web Adapter Integration

The PHP/web adapter registers `@kyaulabs/prism-php-web:browser-fixture` with:

- loopback host `127.0.0.1`;
- preferred port `8080`;
- PHP built-in fixture-server argv rooted at `tests/Browser/fixtures`;
- allowed client tool `pest`;
- TCP readiness;
- a semantic command that verifies the smoke fixture;
- a `PEST_BROWSER_BASE_URL` environment template.

The adapter's generated `.github/scripts/check-php.sh` invokes the supervisor for the full Pest coverage suite. Generated CI invokes the same script and removes separate fixed-port start and stop steps.

The `/check-php` prompt, `tdd-php` skill, PHP/web test reference, canonical-command assertions, and Prism's own CI use the supervised command. Focused unit tests that do not require a server may continue to invoke Pest directly. Browser-focused tests and full suites that can include browser tests use the server profile.

Existing exact Prism-owned automation is eligible for the current setup reconciliation transaction. Customized, malformed, or unowned automation is preserved and reported as a conflict under the existing automation desired-state rules.

## Data and Control Flow

```text
CLI request
  -> discover trusted profile provider
  -> validate and resolve namespaced profile
  -> validate permitted toolchain client
  -> generate nearest-port candidates
  -> guarded probe and server launch
  -> TCP readiness
  -> optional semantic health command
  -> expand client environment
  -> run client tool
  -> stop owned server
  -> return client status or lifecycle failure
```

No profile or process state persists after the operation.

## Error Contract

The implementation distinguishes at least these externally reportable categories:

- invalid invocation;
- profile unavailable;
- profile invalid;
- client tool unavailable or forbidden;
- port exhausted;
- server startup failed;
- server startup timed out;
- health check failed;
- client failed;
- cleanup failed;
- interrupted.

A client failure preserves the client's exit status unless cleanup itself fails in a way that prevents Prism from proving process termination. Lifecycle failures use stable launcher-owned statuses and concise remediation text.

## Testing Strategy

### Core behavior seams

Core tests cover:

- candidate order around several arbitrary preferred ports;
- lower and upper valid-port boundaries;
- higher-port tie-breaking;
- occupied preferred and adjacent ports;
- refusal to reuse an occupied expected fixture;
- contention between probe and launch;
- distinction between contention and a real startup error;
- complete candidate exhaustion through a controlled port-selection seam;
- mandatory TCP readiness;
- optional health success, failure, and timeout;
- environment expansion with the selected host and port;
- profile namespace and exact-schema validation;
- rejection of non-loopback hosts and unsafe templates;
- permitted and forbidden client tools;
- client exit-status preservation;
- cleanup after success, failure, timeout, and termination;
- compatibility with an adapter that exposes no profile provider.

Candidate-order and exhaustion tests use deterministic seams rather than the host's incidental port state. Process tests mock only operating-system boundaries. A bounded integration test uses real loopback sockets and child processes to prove startup, selected-port propagation, and cleanup.

### PHP/web behavior seams

Adapter tests cover:

- registration of the browser-fixture profile with preferred port `8080`;
- proof that Core itself supplies no `8080` default;
- PHP server argv and smoke health behavior;
- selected-port propagation into `PEST_BROWSER_BASE_URL`;
- successful browser execution while `8080` is occupied;
- preservation of the process occupying `8080`;
- termination of only the supervisor-owned fixture server;
- generated local and CI use of `prism-tool server run`;
- absence of the old fixed-port start, environment, and stop workflow steps;
- updated canonical command guidance and contract tests.

## Security and Boundary Constraints

- Core remains language-agnostic and knows no PHP, Pest, browser, HTTP, or port `8080` convention.
- Concrete server and health commands come only from installed trusted Prism package handlers.
- Project files cannot turn the operation into an arbitrary process runner.
- Client execution is limited to profile-permitted commands already declared by a validated toolchain contract.
- Server and health commands use argv arrays without shell evaluation.
- Hosts are limited to validated loopback addresses.
- Environment expansion uses a closed token set and validated scalar values.
- Subprocess output remains untrusted and bounded.
- Profile servers remain in the foreground; the operation never leaves a detached process, publishes a listener beyond loopback, or signals an unowned process group.

## Domain Language Impact

Implementation introduces **server profile** as the canonical term for a trusted package declaration that describes one supervised local test dependency. Add it to `CONTEXT.md` when the architecture decision is accepted.

## Architecture Decision

This change adds a reusable Core lifecycle primitive and extends the trusted adapter provider boundary. It is cross-cutting and hard to reverse after other adapters depend on it. The post-spec `architect` review must decide the required ADR scope before implementation planning.

## Non-Goals

- General-purpose daemon management.
- Detached development servers.
- Public or non-loopback listeners.
- Arbitrary project-defined server commands.
- HTTP-specific readiness in Core.
- Replacing test-framework process management that does not require a listening server.
- Reserving one global preferred port across packages.
- Persisting selected ports between invocations.

## Acceptance Criteria

1. A profile requesting an unoccupied port runs its allowed client against that port and cleans up its server.
2. A profile requesting an occupied port selects the numerically nearest available valid port, preferring the higher candidate on ties.
3. An occupied server is not reused or terminated.
4. A bind race retries the next candidate; a non-contention startup failure stops immediately.
5. TCP and optional semantic readiness complete before client execution.
6. The selected endpoint reaches the client through validated profile environment templates.
7. Only profile-permitted toolchain clients can run.
8. Success, failure, timeout, and interruption leave no supervisor-owned server process running.
9. The PHP/web browser suite passes when port `8080` is occupied and preserves the occupying process.
10. Generated local and CI checks share the same supervised invocation.
11. Core contains no stack-specific command, protocol, or preferred-port policy.
12. Existing adapters without server profiles continue to operate unchanged.
