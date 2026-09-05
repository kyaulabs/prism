# Project manifest

`.prism/project.json` records the project composition that Prism must verify before it can activate or execute canonical hooks. Core owns the file and publishes it through a project-provider transaction. Setup must not create or replace it as an isolated write.

## Supported schemas

Schema one remains the bootstrap format for Blank and Template projects. A valid schema-one manifest stays authoritative and is not rewritten merely because its repository is now established. When its recorded Core version is older, automation may migrate the version while preserving the schema and source evidence.

Schema two is the established-project format. Its source is exact:

```json
{"mode":"ESTABLISHED","evidence":null}
```

Both schemas contain the project name and summary, an ordered capability selection, optional capability metadata, a nullable adapter identity, and Core compatibility evidence. The Core version must match at verification time. Unknown keys, malformed values, unsupported versions, and invalid source evidence fail closed.

## Established composition

An established repository chooses one composition from validated project-local evidence:

- `CORE_ONLY` requires `adapter: null` and no active adapter registration.
- `ADAPTER` requires one active adapter whose package, version, and bootstrap protocol match the manifest. An established adapter ID equals its package name.

Invalid, ambiguous, escaping, symlinked, mismatched, or incomplete adapter evidence is not equivalent to absence. Prism returns `NO-GO` instead of silently selecting Core-only operation.

Established metadata enters through a project-contained regular file beneath `.pi/`. The file must have mode `0600`, valid UTF-8, a bounded closed schema, and no symlink traversal. Automation normalizes the metadata, retains it in the digest-bound plan, and publishes `.prism/project.json` in the same journaled transaction as the applicable Core and adapter automation outputs. Release management, when selected, uses the same repository coordinate in both the manifest capability metadata and automation control.

## Hook boundary

Canonical hook reconciliation is a separate approved mutation. Before writing hooks, Core verifies the current manifest, exact adapter composition, and every applicable automation provider. Hook event dispatch repeats these checks.

A verified Core-only manifest records the adapter as null and follows the hook path with no adapter load or execution. If adapter evidence appears later, hook reconciliation and hook events fail until an approved automation transaction records the coherent adapter identity.

See ADR-0105 for the architecture boundary and `/setup` for the ordered established-repository workflow.
