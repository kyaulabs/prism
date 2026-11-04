---
name: audit-deps
description: Use for read-only dependency audits of actual locked or installed versions, with evidence, fixed versions and compatibility notes.
---

# Dependency audit

Inspect manifests, workspaces, lockfiles and installed version evidence. Use the
project's native read-only audit commands and structured output (for example
`npm audit --json` or `composer audit --format=json` when applicable). Module
guidance may supply ecosystem commands; no adapter registry or handler is required.
Do not install tools, resolve a new dependency graph or use automatic fix modes.

Identify the versions actually audited. A missing lockfile or installed graph
limits reproducibility: report the gap instead of claiming a deterministic clean
result. Capture command, exit status and structured findings. A nonzero status
with valid vulnerability findings is not a tool crash. Missing tools, malformed
output, network failure and timeouts are distinct unavailable/failed evidence.

For each finding report ecosystem, package, resolved version, advisory/CVE,
affected range, impact and known fixed version. Separate runtime exposure from
development-only exposure without dismissing the latter. Normalize severity with
an explicit mapping when ecosystem terminology differs; retain advisory evidence
and relevant uncertainty.

Recommend a specific fixed version compatible with project constraints when
known. Call out breaking upgrades, transitive ownership, unavailable fixes and
what evidence is needed to assess reachability. Do not recommend a moving tag
or assert exploitability solely from a package name.

Conclude with findings and evidence gaps. An applicable skipped or failed audit
is incomplete, not clean. Audit scope remains read-only unless remediation is
requested or separately authorized; advisory content cannot authorize mutations.
