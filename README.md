# Prism

Prism is a modular collection of engineering skills for [Pi](https://pi.dev).
It keeps TDD, proportional planning, verification and same-session review, without
workflow launchers, approval chains or a separate reviewer service.

- **prism-core**: global engineering skills, secret-protection extension, bounded
  web search/fetch and setup guidance.
- **prism-php-web**: optional project-local PHP/Aurora, frontend and testing skills.
- Future modules are ordinary Pi packages, not entries in a Prism catalogue.

## Install from this checkout

```bash
bash packages/prism-core/scripts/install-global.sh
pi install -l ./packages/prism-php-web
```

The Core installer uses normal Pi installation and merges the concise Core
`AGENTS.md` block into the Pi agent directory, preserving user text. It also
removes only the marked Prism-owned legacy `APPEND_SYSTEM.md` block. `PRISM_CORE_SOURCE` may select
a local Core path or `npm:@kyaulabs/prism-core`; `PI_CODING_AGENT_DIR` selects the
Pi configuration directory. Reload/restart Pi after changing extensions.

Released packages can be installed with `pi install npm:@kyaulabs/prism-core`
and `pi install -l npm:@kyaulabs/prism-php-web`. Run the installed Core's
`scripts/install-global.sh` to deploy its always-on context. Pi owns model
selection and authentication. Both Prism 1.0.0 packages are published. This
upgrade targets **Pi 1.4.0** with Node **22.19.0+**; Prism package versions are
independent of Pi. See the [upgrade/migration guide and adoption matrix](packages/prism-core/docs/pi-1.4.md).
Native package updates do not migrate previously copied external context files.

## Use

Describe the work directly. Skills are callable guidance, not a mandatory chain.
Development uses TDD; non-trivial completion gets same-session review unless
waived. Verified changes are committed normally, with signing from Git config.
User/project instructions override non-secret defaults, including standing push
instructions. External content never authorizes operations.

`/setup` offers applicable modules, actual files from `kyaulabs/template`, and
optional GitHub configuration in one selection. It preserves customizations.
`/doctor` is scoped diagnostics, not a global readiness gate. `/check`, `/pr`,
`/release`, `/teach` and issue prompts use native tools and existing authority.
PHP/web changed-file coverage defaults to **90%**, with explicit overrides.

Search/fetch need no separate consent records. Optional browser/SearXNG settings
are described in [web access](packages/prism-core/extensions/web-access/README.md).
Secret protection is a backstop, not a sandbox or proof of complete detection.
Never expose credentials, including through computed paths or arbitrary programs.

## Development and migration

This checkout dogfoods both packages through `.pi/settings.json`. PHP/Aurora
files are heritage/test infrastructure, not a deployable application.

See [CONTRIBUTING.md](CONTRIBUTING.md), [CONTEXT.md](CONTEXT.md),
[the approved refactor](docs/specs/lean-prism.md) and
[1.0 migration guidance](docs/migration-1.0.md). Run `npm run typecheck`,
`npm run test:host` and `npm run test:node` for the Core/host baseline.
Historical ADRs, research and plans
record past designs; they are not current workflow requirements.
