---
description: Diagnose selected Prism/project tooling locally without global readiness gates, installation or live inference.
argument-hint: "[component or problem]"
---

# Doctor

Diagnose $ARGUMENTS, or give a short local health report when no scope is supplied.
Do not install, mutate configuration, authenticate or make live review/web requests.

1. Inspect Pi resource availability with `pi list` and the current session's
   discovered skills/tools. Source paths need not exist in a consumer project.
2. Check only relevant executable availability and actual capabilities. Version
   output is diagnostic metadata, not a universal compatibility gate. Missing
   tools unrelated to the requested operation are not failures for that operation.
3. For Git problems, inspect repository state, identity presence and the effective
   hooks path. Any intentional hook manager/path can be valid. Never run a mutating
   hook as a read-only diagnostic or require a Prism commit launcher.
4. For module problems, inspect native manifests, configuration and local tool
   availability. A project without a module can still use ordinary tooling.
5. For web problems, inspect optional browser/configuration state without a live
   search. Consent records and installed reviewer readiness are not prerequisites.
6. Report each relevant component as usable, missing, misconfigured, unavailable
   or not checked. Explain what operation is affected and a concrete next step.

Never read credentials or dump environment variables. Normal authentication
status may be checked without exposing values; direct the user to the tool's login
UI if needed. Diagnostics do not claim tests passed or block unrelated work.
