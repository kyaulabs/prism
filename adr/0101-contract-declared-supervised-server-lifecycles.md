# 0101. Contract-declared supervised server lifecycles

Date: 2026-09-01

## Status

Accepted

Extends ADR-0058, ADR-0063, ADR-0070, ADR-0073, and ADR-0100.

## Context

Some test suites require a local TCP server. The PHP/web browser suite currently fixes that server to port `8080` in skills, prompts, generated checks, generated CI, and Prism's own CI. A valid run fails when another process owns the port. Reusing an existing listener is also unsafe because Prism cannot prove that the process serves the current fixture or belongs to the active test run.

Port selection, process ownership, readiness, signal forwarding, client execution, and cleanup are language-agnostic mechanics. Leaving them in adapter-generated shell duplicates lifecycle logic and makes future adapters solve the same contention and cleanup problem independently. Moving PHP, Pest, HTTP, fixture paths, or a preferred port into Core would violate ADR-0058's package boundary.

ADR-0063 requires commands to remain scope-owned, declared, argument-array based, bounded, and fail closed. ADR-0070 puts fixed multi-step mechanics behind narrow `prism-tool` operations. ADR-0100 requires local and generated CI to share the adapter-owned quality implementation. A reusable supervisor must preserve those decisions without becoming an arbitrary process runner or detached daemon manager.

The design also needs a stable failure contract. Existing `prism-tool run` maps child failures to launcher-owned exit categories rather than exposing arbitrary child statuses as top-level Prism meanings. A supervised operation must preserve whether the client succeeded while retaining those stable launcher semantics.

```text
Developer or CI
      |
      | prism-tool server run PACKAGE:PROFILE --tool TOOL -- ARGS
      v
Prism Core supervisor
      |-- validates the active adapter's contract-declared profile
      |-- selects and supervises one loopback server process group
      `-- resolves and runs one profile-permitted toolchain client
```

## Decision

We add a Core-owned, foreground-scoped server lifecycle operation and an optional closed server-profile section to adapter toolchain contracts.

### Contract-declared server profiles

An adapter may declare a bounded `serverProfiles` collection in its versioned `toolchain.json`. Core contracts contain no stack profile, and Core supplies no default host, port, protocol, or server command.

Each profile declares:

- a stable profile ID, namespaced at invocation by the adapter package identity;
- a validated loopback host and preferred port;
- one foreground server executable and argument-array template;
- a bounded startup timeout;
- allowed client tool IDs from the same validated adapter contract;
- bounded client environment templates; and
- an optional semantic health executable and argument-array template.

Server and health command descriptors are part of the installed package's validated toolchain contract. They accept only bare executable names, bounded argument arrays, and a closed set of host and port substitutions. They are available only to the supervisor and do not create a general command-dispatch surface. Project files, CLI arguments, environment values, health output, and remote content cannot supply or alter executable names or command templates.

The active adapter remains responsible for the runtime named by its profile, including stack compatibility and readiness. Core verifies that each declared executable resolves before use but does not learn product-specific version output. Moving a runtime across package scope or weakening its existing readiness remains subject to ADR-0063.

Adapters without `serverProfiles` remain valid. Unknown profile keys, schemas, substitutions, duplicate IDs, non-loopback hosts, invalid ports, undeclared client tools, and unsafe command values fail before process creation.

### Narrow launcher operation

Core exposes:

```text
prism-tool server run PACKAGE:PROFILE --tool TOOL_ID -- ARGUMENTS
```

The requested package must be the active adapter. The profile must permit the requested client tool, and the tool must be a command component in the same validated adapter contract. Core resolves the client through the existing adapter handler and applies its argument policy, executable resolution, argv prefix, environment, timeout, and readiness rules. The operation accepts no caller-supplied server command, health command, host, preferred port, or environment template.

The supervisor is synchronous and owns the complete lifecycle. It never returns a detached server or persists selected-port state.

### Nearest-port selection and contention

Every profile declares its own preferred port `P`. Core generates valid candidates in this order:

```text
P, P+1, P-1, P+2, P-2, ...
```

Values outside `1–65535` are skipped. Core has no `8080` convention.

For each candidate, Core first probes the profile's loopback address. An occupied socket is skipped and never reused. Core then starts the server in a new owned process group with the candidate substituted into validated argv and waits for both the process and TCP endpoint.

A probe cannot eliminate the race between observing a free socket and the server binding it. If the server exits before readiness, Core probes again. A newly occupied socket is classified as contention and advances to the next candidate. An unowned socket with no listener is classified as a real startup failure and stops immediately rather than scanning the whole range for a broken command. Exhausting all valid candidates fails before client execution.

### Readiness, client execution, and cleanup

TCP readiness is mandatory and protocol-neutral. After TCP readiness, Core runs the optional contract-declared health command with the selected host and port available through fixed Prism environment names and validated substitutions. Health failure is a server or fixture failure, not contention, and does not advance to another port.

After readiness, Core expands the profile's bounded client environment templates and runs the permitted client tool. The client's success or failure is authoritative for operation success. The public CLI retains stable Prism exit categories: a non-zero client result returns the launcher tool-failure status rather than redefining usage, readiness, or transaction statuses. Tests and structured diagnostics may retain the bounded numeric child status as inert evidence.

Core forwards supported termination signals to the owned server process group, waits for bounded shutdown, and escalates only against that group. Cleanup runs after startup failure, timeout, health failure, client success, client failure, or interruption. Pre-existing listeners and unrelated processes are never signalled.

Diagnostics identify only the profile reference, lifecycle phase, preferred and selected ports when known, stable failure category, and bounded inert status evidence. Subprocess output remains untrusted, bounded, and sanitized under existing launcher policy.

### Package ownership and parity

Core owns profile schema validation, candidate generation, loopback probing, asynchronous process supervision, TCP readiness, environment expansion, client resolution orchestration, stable diagnostics, and cleanup.

The adapter owns every stack-specific profile value and the quality entry point that invokes it. The PHP/web adapter declares a browser-fixture profile with preferred port `8080`, PHP fixture-server argv, Pest as its permitted client, smoke-fixture health argv, and a `PEST_BROWSER_BASE_URL` template.

PHP/web local checks, generated CI, TDD guidance, and Prism's own CI use the same supervised operation. Generated CI removes its separate fixed-port start, environment, and stop steps. Exact Prism-owned automation may update through ADR-0100's reconciliation transaction; customized or unowned automation remains preserved as a conflict.

This decision adds no dependency, Pi extension, network listener beyond loopback, project-defined command surface, background service, or runtime credential access.

## Consequences

**Positive:**

- Concurrent or stale local listeners no longer make a valid suite fail solely because its preferred port is occupied.
- Existing listeners are neither reused nor terminated.
- Future adapters reuse one Core lifecycle without moving stack behavior into Core.
- Server, health, and client commands remain package-declared and shell-free.
- Local and CI quality paths share one lifecycle and selected-endpoint contract.

**Negative:**

- The adapter toolchain schema and `prism-tool` CLI gain durable cross-package interfaces.
- Core gains asynchronous process, socket, signal, process-group, timeout, and cleanup logic alongside its existing synchronous runner.
- Full valid-port exhaustion is inherently expensive, though real startup errors stop immediately and ordinary contention resolves near the preferred port.
- Adapter authors must keep profile commands in the foreground and provide deterministic health behavior.

**Neutral:**

- Preferred ports remain package policy; Core does not reserve or standardize `8080`.
- Client failures continue to use stable Prism launcher exit categories.
- Existing adapters without profiles and test suites without local servers are unchanged.
- Profile runtime compatibility remains adapter-owned under the existing stack and toolchain contracts.

## Alternatives Considered

### Keep retry loops in adapter scripts

Rejected because local prompts, generated scripts, CI, and future adapters would duplicate candidate ordering, race handling, readiness, and cleanup.

### Let projects pass arbitrary server commands

Rejected because it would turn a narrow trusted launcher into a general process runner and let project or external content cross the command trust boundary.

### Register imperative handler callbacks

Rejected because callbacks returning live child processes would expose Node process internals as the cross-package interface, weaken schema validation, and make profiles harder to inspect and test than contract data.

### Reuse a matching server on the preferred port

Rejected because matching one health response does not prove fixture freshness, configuration, process ownership, or cleanup safety.

### Ask the operating system for any ephemeral port

Rejected because it does not satisfy nearest-to-preferred behavior and makes selected endpoints less predictable when a package has a conventional test port.

### Return the raw client exit status

Rejected because arbitrary child statuses could collide with stable Prism usage, readiness, tool, and transaction meanings. The child result remains authoritative for success while the launcher retains its public exit contract.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
