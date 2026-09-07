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

## Public managed-file permissions

Creation defaults remain `0644` for public data and `0755` for executable hook
wrappers. Runtime readers require owner read within the `0644` bit ceiling for
data, and owner read/execute within `0755` for wrappers. Thus Git recreation
under umasks `0022`, `0027`, and `0077` needs no recurring chmod. Owner-read-only
data (`0400`) and owner-read/execute wrappers (`0500`) also remain valid.
Group/other writes, special bits, missing required owner bits, wrong ownership,
symlinks, containment violations, identity changes, and content drift fail.
Verification never rewrites a current file just to restore creation defaults.

Private approval records remain exact `0600`; prepared candidates retain exact
canonical modes. Core automation and adapter candidate plans use schema version
two with separate canonical modes and exact observed file identities. Regenerate
obsolete private plans; do not hand-edit their version or observations. Changing
a file's permissions or replacing it with identical bytes invalidates its
previously approved observation even when the new mode is otherwise safe.

## Read-only health

```bash
prism-tool automation health --json
```

The command returns `CURRENT`, `NOT_CONFIGURED`, or `CONFLICT` with bounded
manifest, adapter, automation, and hook checks. Exit `0` means `GO`; exit `5`
means conflict. Missing public files, content drift, and invalid permissions
have distinct diagnostics. Permission diagnostics include the public path,
observed mode, required bits, and allowed ceiling.

Manifest absence is `NOT_CONFIGURED` only without an effective managed hook
claim. Inactive hook files do not establish configuration. Malformed, unreadable,
symlinked, or unverifiable state is a conflict, not absence. Unconfigured source
checkouts need no fabricated manifest; their managed checks are `SKIPPED`.
Health creates no plan, repairs nothing, and writes no review evidence. `/check`,
post-review readiness, and both PR preflight routes use this same verifier.

## Hook boundary

Canonical hook reconciliation is a separate approved mutation. Before writing hooks, Core verifies the current manifest, exact adapter composition, and every applicable automation provider. Hook event dispatch repeats these checks.

A verified Core-only manifest records the adapter as null and follows the hook path with no adapter load or execution. If adapter evidence appears later, hook reconciliation and hook events fail until an approved automation transaction records the coherent adapter identity.

See ADR-0105 for the architecture boundary and `/setup` for the ordered established-repository workflow.
