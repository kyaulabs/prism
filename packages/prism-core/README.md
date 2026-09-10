# Prism Core

Language-agnostic engineering skills for Pi, plus secret protection and bounded
public web search/fetch. Core loads globally; stack modules load per project.
Use native Pi packages and project tooling. There is no workflow launcher,
reviewer executable, adapter catalogue or receipt protocol.

Install this directory with `pi install /absolute/path/to/prism-core`, then run
`scripts/install-global.sh` from the package to merge Core context into the Pi
agent directory. Existing user text and settings are preserved. Reload/restart
Pi after updating extensions. Pi supplies its host API as a peer dependency.

`/setup` selects actual applicable template files and optional modules. `/doctor`
is scoped diagnostics. Development defaults to TDD, proportional planning,
verification, same-session review and ordinary Git commits. Project/user
instructions override non-secret defaults, without repeated approvals.

See `AGENTS.md`, the callable `skills/` and `prompts/`, and the extension READMEs.
Secret protection is not a sandbox and cannot prove arbitrary programs safe.
