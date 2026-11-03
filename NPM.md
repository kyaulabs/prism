# Package Distribution

`packages/prism-core`, `packages/prism-php-web` and `packages/prism-cpp` are ordinary
Pi packages with coordinated release versions. Their `pi` manifests identify resources; no Prism catalogue, signed
adapter declarations, bootstrap protocol or managed release engine is required.

Core runtime dependencies are limited to web extraction. Pi host APIs are peer
dependencies; development test tooling lives in the root manifest. PHP/web
project tools are installed with Composer/npm when selected during setup. C++
ships only skills/prompts/references; native compiler/build tools remain project-owned.
The local 1.2.0 candidate is separate from the Pi 1.5.0 host and is not published.
It is **release-blocked** until the [required release completion plan](docs/specs/cpp-pi-1.5-implementation.md#required-release-completion-plan)
is closed. Audit remediation, reproducible installs, final regression/coverage,
archives and hosted Clang 18/Linux/macOS checks are complete. Git delivery is
authorized and implementation PR #549 is merged. The live website still needs
its owner to deploy the reviewed source before announcement; all three npm
publications remain manual. Do not merge the release PR while that website hold
is open. Development-only audit findings were remediated, not waived.

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
