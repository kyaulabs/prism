# Package Distribution

`packages/prism-core` and `packages/prism-php-web` are independent ordinary Pi
packages. Their `pi` manifests identify resources; no Prism catalogue, signed
adapter declarations, bootstrap protocol or managed release engine is required.

Core runtime dependencies are limited to web extraction. Pi host APIs are peer
dependencies; development test tooling lives in the root manifest. PHP/web
project tools are installed with Composer/npm when selected during setup.

Before an authorized publication, run the project tests and inspect `npm pack
--dry-run` for each selected package. Update versions for the actual compatibility
change and provide migration notes. Use normal `npm publish` with existing
authentication; never display registry credentials. npm publication is manual.
Merging a `release/X.Y.Z` PR into `main` automatically creates the repository and
package tags and GitHub release from `CHANGELOG.md`. Workflow dispatch can recover
an interrupted publication at an exact merge SHA. Automatic back-merge PRs keep
`develop` synchronized. These are repository-owned workflows, not Prism engines.

The 1.0.0 refactor is a clean breaking change. See `docs/migration-1.0.md`.
