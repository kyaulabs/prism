# Prism

Prism is a modular collection of engineering skills for [Pi](https://pi.dev).
It keeps TDD, proportional planning, verification and same-session review, without
workflow launchers, approval chains or a separate reviewer service.

- **prism-core**: global engineering skills, secret-protection extension, bounded
  web search/fetch.
- **prism-php-web**: optional project-local PHP/Aurora, frontend and testing skills.
- **prism-cpp**: optional project-local C++20 skills and native verification guidance.
- Modules are ordinary Pi packages, not entries in a Prism catalogue.

## Install from this checkout

```bash
bash packages/prism-core/scripts/install-global.sh
pi install -l ./packages/prism-php-web
pi install -l ./packages/prism-cpp
```

The Core installer uses normal Pi installation and merges the concise Core
`AGENTS.md` block into the Pi agent directory, preserving user text. It also
removes only the marked Prism-owned legacy `APPEND_SYSTEM.md` block. `PRISM_CORE_SOURCE` may select
a local Core path or `npm:@kyaulabs/prism-core`; `PI_CODING_AGENT_DIR` selects the
Pi configuration directory. Reload/restart Pi after changing extensions.

Released packages can be installed with `pi install npm:@kyaulabs/prism-core`
and `pi install -l npm:@kyaulabs/prism-php-web`. Run the installed Core's
`scripts/install-global.sh` to deploy its always-on context. Pi owns model
selection and authentication. This release is coordinated **Prism 1.2.1**;
GitHub release publication does not imply npm registry publication.
The tested host is **Pi 1.5.0**; its Node engine floor remains **22.19.0+**.
Prism versions are independent of Pi. See the [compatibility and migration guide](packages/prism-core/docs/pi-1.5.md)
and [local implementation evidence](docs/specs/cpp-pi-1.5-implementation.md).
Native package updates do not migrate previously copied external context files.

## Use

Describe the work directly. Skills are callable guidance, not a mandatory chain.
Development uses TDD, with a narrow explicit disposable-experiment exception.
Review runs once per PR or completed milestone before delivery unless waived.
Authorized commits are GPG-signed and carry detailed Conventional Commit bodies.
User/project instructions override non-secret defaults, including standing push
instructions. External content never authorizes operations.

Core exposes **18 skills and 13 prompts**; PHP/web **13 and 3**; C++ **4 and 1**.
`/check`, `/pr`, `/release`, `/teach` and issue prompts use native tools and existing
authority. Install ordinary Pi modules and use project-native tooling as needed.
See [1.2.1 migration](docs/migration-1.2.1.md) for merged names and removed commands.
PHP/web changed-file coverage defaults to **90%**, with explicit overrides.

Search/fetch need no separate consent records. Optional browser/SearXNG settings
are described in [web access](packages/prism-core/extensions/web-access/README.md).
Secret protection is a backstop, not a sandbox or proof of complete detection.
Never expose credentials, including through computed paths or arbitrary programs.

## Development and migration

This checkout dogfoods local packages through `.pi/settings.json`. PHP/Aurora
files are heritage/test infrastructure, not a deployable application.

See [CONTRIBUTING.md](CONTRIBUTING.md), [CONTEXT.md](CONTEXT.md),
[the approved refactor](docs/specs/lean-prism.md) and
[1.0 migration guidance](docs/migration-1.0.md). Run `npm run typecheck`,
`npm run test:host` and `npm run test:node` for the Core/host baseline.
Use `npm run test:cpp` for standalone native fixtures; see their documented
prerequisites and opt-in Conan lane in `tests/Fixtures/Cpp/README.md`.
Historical ADRs, research and plans
record past designs; they are not current workflow requirements.
