# Package Distribution

`packages/prism-core`, `packages/prism-php-web` and `packages/prism-cpp` are ordinary
Pi packages with coordinated release versions. Their `pi` manifests identify resources; no Prism catalogue, signed
adapter declarations, bootstrap protocol or managed release engine is required.

Core runtime dependencies are limited to web extraction. Pi host APIs are peer
dependencies; development test tooling lives in the root manifest. PHP/web
project tools use native Composer/npm commands within task scope. C++
ships only skills/prompts/references; native compiler/build tools remain project-owned.
The coordinated 1.2.2 release is separate from the Pi 1.5.0 host; GitHub release
publication does not imply npm publication. It corrects guidance and packaged
references while retaining the breaking resource-surface change introduced in
1.2.1: Core 18 skills/13 prompts, PHP/web 13/3 and C++ 4/1. See
[1.2.1 migration](docs/migration-1.2.1.md). Preserve coordinated versions and host-peer
boundaries. Registry publication remains manual; verify current release conditions
rather than reusing historical release evidence.

Before an authorized publication, run the project tests and inspect `npm pack
--dry-run` for each selected package. Update versions for the actual compatibility
change and provide migration notes. Use normal `npm publish` with existing
authentication; never display registry credentials. npm publication is manual.
Merging a `release/X.Y.Z` PR into `main` automatically creates the repository and
package tags (Core, PHP/web and C++) and GitHub release from `CHANGELOG.md`.
The release fixture verifies four tags plus one release and rejects a mismatched,
misnamed or private C++ manifest before mutation. Workflow dispatch can recover
an interrupted publication at an exact merge SHA. Automatic back-merge PRs keep
`develop` synchronized. These are repository-owned workflows, not Prism engines.

The 1.0.0 refactor is a clean breaking change. See `docs/migration-1.0.md`.
