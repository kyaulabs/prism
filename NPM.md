# Publishing Prism packages to npm

This document covers publication and updates for the two Prism pi packages. npm
publication is human-run. Release CI never receives npm credentials and never
runs `npm publish`.

## Packages and ownership

| Package | Source | Install scope | Contents |
| --- | --- | --- | --- |
| `@kyaulabs/prism-core` | `packages/prism-core` | Global | Core skills, prompts, safety extension, scripts, packaged configuration, toolchain contract, and global instructions |
| `@kyaulabs/prism-php-web` | `packages/prism-php-web` | Project-local | PHP/web skills, prompts, bootstrap provider, scripts, configuration, and adapter contract |

The repository root package is private and cannot be published. Each package's
`files` array defines its archive. Prism publishes source directly; there is no
package build or `dist/` directory.

Both packages currently declare:

- `AGPL-3.0-only`;
- Node.js `>=22.19.0`;
- public scoped-package access;
- package-specific README and NOTICE files.

Core alone declares pi as a peer dependency because its TypeScript safety
extension imports pi's runtime API. The PHP/web adapter has no extension and
needs no pi peer dependency.

## Publication-readiness checks

Run these checks before the first publication and before every later release:

```bash
npm ci --ignore-scripts
npm audit --audit-level=low
node --test tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js
bash packages/prism-core/scripts/validate-harness.sh
```

Inspect both archives:

```bash
cd packages/prism-core
npm pack --dry-run
```

```bash
cd packages/prism-php-web
npm pack --dry-run
```

Confirm that each archive contains only its declared package files plus npm's
auto-included metadata. It must not contain repository tests, unowned files,
consumer dependencies, or checkout state.

For first publication, also build a local tarball and install it into a clean pi
environment. Confirm that Core loads the safety extension, prompts, skills,
config, and launcher from the archive. Confirm that the adapter loads
project-locally and declares the same bootstrap protocol as Core expects.

## Human account preparation

The publisher needs:

1. an npm account with publish rights in the `@kyaulabs` organization;
2. two-factor authentication enabled for account changes and package writes;
3. a current local npm login;
4. successful `npm whoami` and organization-membership checks.

Keep npm credentials in npm's credential store. Do not add credentials to the
repository, workflow files, shell history, issue text, or agent context.

## Release and publication

Prism versions configured packages in lockstep with the repository release.
`/release` writes the confirmed version into every configured package manifest,
prepares the changelog and signed release commit, and prints the later human
publication commands.

After the release pull request merges, release CI creates the GitHub Release
first. It then reconciles package tags such as `prism-core@X.Y.Z` and
`prism-php-web@X.Y.Z` at the release merge commit and opens the back-merge pull
request.

Only after the GitHub Release and package tags exist should a human run one human-run publication command per configured package. Run every command printed
by `/release`, including packages whose only change is the lockstep version:

```bash
cd packages/prism-core
npm publish --access public
```

```bash
cd packages/prism-php-web
npm publish --access public
```

Scoped packages require public access on first publication. The manifests also
set `publishConfig.access` to `public`. npm may request a current one-time code
when two-factor authentication protects writes.

Repository release tags use `vX.Y.Z`. Package tags use
`prism-core@X.Y.Z` and `prism-php-web@X.Y.Z`. Do not create, move, or replace
these tags manually.

## Consumer installation and updates

Install Core globally:

```bash
pi install npm:@kyaulabs/prism-core
```

Install the adapter inside a PHP project:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

Update commands:

| Command | Effect |
| --- | --- |
| `pi update --extensions` | Update all unpinned packages |
| `pi update npm:@kyaulabs/prism-core` | Update Core |
| `pi update npm:@kyaulabs/prism-php-web` | Update the adapter |
| `pi update --all` | Update pi and all unpinned packages |

A versioned install is pinned and skipped by normal updates:

```bash
pi install npm:@kyaulabs/prism-core@0.3.1
```

Reinstall at a new version to move a pin. Global package state lives in
`~/.pi/agent/settings.json`; project-local package state lives in
`.pi/settings.json`. Use `pi list` to inspect installed packages.

## Deprecation and recovery

Use deprecation to retire a broken version or package:

```bash
npm deprecate @kyaulabs/prism-core@0.3.1 "use a later fixed release"
```

Unpublish is a narrow mistake-recovery option with npm time and dependency
limits. Do not use it as the normal release or rollback mechanism. Once a
version may have consumers, publish a corrected version and deprecate the bad
one.

If publication succeeds for one package and fails for another:

1. do not move repository or package tags;
2. correct the account, OTP, archive, or registry problem;
3. confirm the unpublished package version and archive again;
4. publish the remaining package at the same lockstep version;
5. record any user-facing recovery note in the release.

If an archive is wrong but not yet published, fix the source and restart the
release process. Do not modify a release artifact after its signed release
commit.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| npm reports private scoped-package payment requirements | Confirm `publishConfig.access: public` and publish with `--access public` |
| Core cannot import pi in a consumer install | Confirm Core's pi peer dependency and test the packed archive |
| npm requests a one-time code | Complete the account's write-authentication challenge |
| `npm pack` includes tests or checkout files | Correct the package `files` array before release |
| `pi update` does not move a package | Inspect whether the package is version-pinned and reinstall it at the intended version |
| One lockstep package is missing | Publish the missing configured package at the existing release version without moving tags |

## First-publication checklist

- [ ] Confirm npm organization membership and write-capable two-factor authentication.
- [ ] Run locked dependency, audit, contract, package, and harness checks.
- [ ] Inspect `npm pack --dry-run` for both packages.
- [ ] Test Core and the adapter from local tarballs in clean pi environments.
- [ ] Run `/release` and merge the release pull request.
- [ ] Confirm the GitHub Release first and verify both package tags.
- [ ] Run every human publication command printed by `/release`.
- [ ] Install both packages by npm name and run readiness in a clean consumer project.

Both packages remain under [AGPL-3.0-only](LICENSE). Redistributors must
preserve the license, corresponding source obligations, copyright, and NOTICE
attribution.
