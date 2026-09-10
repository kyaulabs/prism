# Migrating to Prism 1.0

This is a clean breaking release, not a compatibility layer. Preparing this
branch does not publish packages, change your global installation or migrate
consumer repositories automatically.

## Packages and context

Install/update Core and selected modules through ordinary Pi package sources.
Run the selected Core's `scripts/install-global.sh` to refresh marked context
blocks without replacing surrounding user text. Reload/restart Pi for extension
changes. Keep Pi model/authentication settings in Pi, not Prism setup.

## Removed interfaces

`prism-tool`, `prism-review`, catalogue enrollment, adapter signatures,
provisioning handlers, managed hook dispatchers, quality receipts, review chains,
consent records and workflow journals are no longer used. Replace commands in
project scripts and CI with actual local Composer/npm executables and ordinary
Git/GitHub operations. `/setup`, `/check`, `/pr` and `/release` are skills/prompts,
not executable contracts. Review takes place in the current session.

Inspect old launcher files before removing them. Remove only confirmed
Prism-owned launchers; preserve custom wrappers and shared binaries. Existing
`.pi/prism-tool`, `.pi/prism-review` and global consent records may contain local
history. They are inert and may be retained or deliberately removed by their
owner; do not automatically delete them or read credential files during cleanup.

Replace managed hook dispatchers with selected project-owned hooks. Compare
actual `kyaulabs/template` files with existing hooks before adapting them.
Preserve custom checks; use staged/redacted scanning and quoted arguments.
No new hook should rewrite or restage unrelated/partially staged files.

## Defaults and verification

PHP/web changed-file coverage defaults to 90%; pass `--min=N` only for an
explicit project override. No aggregate threshold is imposed by the module.
TDD remains mandatory. Planning and durable documents scale with the task.
Project/user instructions override non-secret defaults and count as standing
authority, so repeated confirmation is unnecessary.

Search/fetch no longer consult standing consent. Optional browser/SearXNG
configuration remains in `prism-web-access.json`; see the web-access README.
Secret protection is a best-effort backstop, not a sandbox. Avoid computed
credential access and broad searches that could expose secrets; never assume a
successful scan proves absence of secrets.

## Catalogue retirement

No package or workflow depends on `kyaulabs/prism-adapters`. Dedicated external
automation must be retired before deleting that repository. Inventory credential
names and integration ownership without reading values. Revoke only dedicated
credentials; preserve shared organization apps, keys and infrastructure.
