# Secret protection

The safety extension checks tool calls for protected credential paths. A rejected
request blocks that call only. There is no denial counter, commit-exclusivity
requirement, agent abort, fatal latch or recursive-deletion safe-zone policy.

## Current implementation

- `index.ts` registers the tool-call handler and loads additive
  `PRISM_SENSITIVE_PATHS` entries at session start.
- `tool-call-handler.ts` protects read, edit, write, ls, grep and find paths and
  checks Bash operands. Diagnostics never include credential contents or raw
  command payloads. Malformed or uninspectable calls fail individually.
- `sensitive-paths.ts` and the shared sensitive-path policy retain existing path
  normalization, symlink handling, credential patterns and shell operand checks.
- Staged-secret scanning remains in project Git hooks. This extension does not
  yet independently inspect every possible commit invocation or arbitrary program.

## Breaking refactor in progress

The old shell operand parser still rejects some dynamic shell constructs and
contains setup-specific exceptions. Replacing that machinery with a narrower
secret guard remains in `docs/specs/lean-prism.md`. Do not describe the current
parser as unrestricted shell execution or as a complete sandbox.

A tool-call guard cannot prove what arbitrary trusted programs will do internally.
Keep secret-handling instructions and staged-secret scanning as complementary
protections. Normal tool authentication must not expose credential values.

## Verification

From the source checkout:

```bash
node --test tests/Node/safety-recovery.test.ts tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-sensitive-paths.test.ts
```

The tests invoke the extension and handler with inert commands; they do not
execute credential reads or destructive shell commands. Recovery tests verify
that rejected requests and failed commits cannot disable unrelated tools.

Reload or restart Pi after changing an extension; an already loaded instance is
not replaced merely by editing its source on disk.
