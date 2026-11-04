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

The tested host baseline is **Pi 1.5.0**; the Node engine floor remains **22.19.0+**. Pi supplies
its SDK and TypeBox as `"*"` host peers; Core does not bundle a Pi runtime.
Prism versions are separate from Pi versions. See [migration commands and the
compatibility/adoption matrix](docs/pi-1.5.md). Executed environments and limits
are recorded there; the engine range is not proof of minimum-version testing.

Core exposes **18 skills and 13 prompts** in the coordinated Prism 2.0.0 candidate.
Development requires TDD except for expressly requested isolated disposable
experiments. Core owns verification, once-per-PR/milestone review and Git authority;
installing it grants no remote delivery permission. Authorized commits require
GPG signing and detailed bodies. Use native project tools, not onboarding workflows.
See [resource migration](docs/migration-2.0.md) for names and filter changes.

See `AGENTS.md`, the callable `skills/` and `prompts/`, and the extension READMEs.
Secret protection is not a sandbox and cannot prove arbitrary programs safe.
