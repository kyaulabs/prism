# Prism Core

Language-agnostic engineering skills for Pi, plus secret protection and bounded
public web search/fetch. Core loads globally; stack modules load per project.
Use native Pi packages and project tooling. There is no workflow launcher,
reviewer executable, adapter catalogue or receipt protocol.

Install this directory with `pi install /absolute/path/to/prism-core`, then run
`scripts/install-global.sh` from the package to merge Core context into the Pi
agent directory. It deploys only `AGENTS.md` and safely removes the marked
Prism-owned legacy `APPEND_SYSTEM.md` block. Existing user text and settings are
preserved. Native Pi package updates alone do not run that context migration.
Reload/restart Pi after updating extensions.

The tested host baseline is **Pi 1.4.0**, with Node **22.19.0+**. Pi supplies
its SDK and TypeBox as `"*"` host peers; Core does not bundle a Pi runtime.
Prism versions are separate from Pi versions. See [migration commands and the
compatibility/adoption matrix](docs/pi-1.4.md).

`/setup` selects actual applicable template files and optional modules. `/doctor`
is scoped diagnostics. Development defaults to TDD, proportional planning,
verification, same-session review and ordinary Git commits. Project/user
instructions override non-secret defaults, without repeated approvals.

See `AGENTS.md`, the callable `skills/` and `prompts/`, and the extension READMEs.
Secret protection is not a sandbox and cannot prove arbitrary programs safe.
