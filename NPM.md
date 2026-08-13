# NPM.md — Publishing & Updating the prism pi packages

> How to publish `@kyaulabs/prism-core` and `@kyaulabs/prism-php-web` to the
> npm registry, and how consumers update them. This is the playbook for the
> deferred Stage 7 #3 work ("Publish + repo split"). Until the first publish,
> consumers install from a local clone (see [`README.md`](README.md)).

## What gets published

Two **scoped** packages, each a real [pi package](https://pi.dev/packages):

| Package | Source dir | Ships | `pi` manifest |
| --- | --- | --- | --- |
| `@kyaulabs/prism-core` | `packages/prism-core` | skills, prompts, the **safety extension** (`extensions/`), `AGENTS.md`, `APPEND_SYSTEM.md`, scripts, `safe-dirs.json`, NOTICE | `extensions` + `skills` + `prompts` |
| `@kyaulabs/prism-php-web` | `packages/prism-php-web` | PHP/web skills + prompts, `safe-dirs.json`, NOTICE | `skills` + `prompts` |

**No build step.** pi extensions are jiti-transpiled `.ts` loaded at runtime;
you publish the source directly. There is no `dist/`, no compiler, no
`prepublishOnly` build. The `files` array in each `package.json` is the exact
tarball manifest.

The repo-root `package.json` is `"private": true` (named `prism`) — it can
never be published. Only the two sub-directories under `packages/` are
publishable units.

---

## ⚠️ Pre-publish readiness checklist (do once, before the first publish)

These items are **not** yet applied. Work through them before `npm publish` or
the published package will be broken or bare.

### 1. Declare pi as a `peerDependency` in `prism-core` (CRITICAL)

The safety extension imports pi's bundled core at runtime:

```ts
// packages/prism-core/extensions/safety/index.ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
```

pi loads each package with its **own module root**, so pi's core is *provided
by the host*, never bundled. Per pi's package contract, any package that
imports a pi bundled core **must** declare it as a `peerDependencies` entry
with `"*"` (and must NOT put it in `dependencies`/`bundledDependencies`).
Without this, the extension fails to import in a consumer's install.

Add to **`packages/prism-core/package.json`** only (the PHP adapter has no
`.ts`/extensions, so it needs none):

```json
{
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

> `prism-php-web` ships only skills/prompts (no `extensions/`, no TS) — it
> imports nothing from pi at runtime, so it needs **no** `peerDependencies`.

### 2. Add `engines` and `publishConfig` to both packages

```json
{
  "engines": { "node": ">=22.19.0" },
  "publishConfig": { "access": "public" }
}
```

- `engines.node` mirrors pi's own floor (`>=22.19.0`).
- `publishConfig.access: "public"` — scoped packages are **private by
  default**; this bakes public access in so you never forget `--access public`.

> **Do not add `"type": "module"`.** The packages ship CommonJS helper
> scripts (`frontmatter-parser.js`, `check-peer-deps.js`, `jsonc-strip.js`)
> that `validate-harness.sh` runs directly via `node`; under
> `"type": "module"` Node treats `.js` as ESM and `require()` throws
> (`require is not defined in ES module scope`), breaking the validator. pi
> loads the `.ts` extension through jiti regardless of `"type"`, so it is not
> needed.

> **Provenance is CI-only.** Omit `publishConfig.provenance` for manual
> publishes — add it (or pass `--provenance`) only inside the GitHub Actions
> workflow (see
> [Publishing a release (automated)](#publishing-a-release-automated-recommended)),
> where OIDC is available.

### 3. Add a per-package `README.md` (recommended)

npm publishes each sub-directory independently, so the repo-root `README.md`
does **not** ship with the packages — the npm package pages would be bare, and
the [pi.dev package gallery](https://pi.dev/packages) (which lists everything
tagged `pi-package`) shows no description. Add a short `README.md` to each of
`packages/prism-core/` and `packages/prism-php-web/` (one paragraph + install
line + link back to this repo). Optional but strongly recommended.

The `"license": "AGPL-3.0-only"` field already satisfies npm's license check;
a LICENSE *file* is not required (and is not currently shipped). See
[Licensing](#licensing) below.

### 4. Verify the tarball with `npm pack --dry-run`

```bash
cd packages/prism-core && npm pack --dry-run
cd packages/prism-php-web && npm pack --dry-run
```

Confirm the listed files are **exactly** the `files` array (plus auto-included
`package.json` / `README.md` / `LICENSE` if present) — nothing extra (no
`node_modules/`, no tests, no `.git`).

### 5. Test the local tarball behaves like a real install

```bash
npm pack                              # produces kyaulabs-prism-core-0.1.0.tgz
pi install ./kyaulabs-prism-core-0.1.0.tgz   # installs the tarball globally
pi -e ./kyaulabs-prism-core-0.1.0.tgz        # or try it for one run
```

Confirm the safety extension loads and a known-blocked command is blocked
(e.g. `pi -e <pkg> -p "read ~/.ssh/id_rsa"` is denied).

---

## One-time account setup

1. **npm account + org.** Have an npm account that is a member of the
   `@kyaulabs` org with publish rights on the scope. Enable **2FA** (Settings
   → Account Security → "auth and writes").
2. **Log in locally:**
   ```bash
   npm login
   # Username, password, OTP. Writes an auth token to ~/.npmrc.
   npm whoami            # confirm: your username
   npm org ls kyaulabs   # confirm org membership
   ```
3. **(For CI) create a granular access token.** In npm → Access Tokens →
   **Granular Access Token**, scope it to `@kyaulabs/prism-*`, permission
   **Read and write**, expiry bounded. Store it as the GitHub secret
   `NPM_AUTOMATION_TOKEN`. Granular tokens bypass interactive 2FA and are the
   recommended CI credential (preferred over legacy automation tokens).

---

## Publishing a release (manual)

The two packages are coupled (the adapter's `safe-dirs.json` contract comes
from core), so **version them in lockstep** while pre-1.0.

```bash
# 0. ensure tree is clean, on the release commit, up to date
git status -s           # empty

# 1. bump BOTH package.json versions (no auto tag — we tag distinctly below)
cd packages/prism-core   && npm version 0.2.0 --no-git-tag-version && cd -
cd packages/prism-php-web && npm version 0.2.0 --no-git-tag-version && cd -

# 2. commit the bump
git add packages/prism-core/package.json packages/prism-php-web/package.json
git commit -S -m "chore(packages): release v0.2.0"

# 3. create one tag PER package (distinct names avoid collision)
git tag prism-core@0.2.0
git tag prism-php-web@0.2.0

# 4. publish each from its own directory
cd packages/prism-core   && npm publish --access public && cd -   # OTP prompt if 2FA on writes
cd packages/prism-php-web && npm publish --access public && cd -

# 5. push the commit + tags
git push && git push --tags
```

> **Tag shape matters.** Do **not** use bare `v0.2.0` — it collides between the
> two packages and with the app's own release tags from `release.yml`. Use
> `prism-core@<ver>` / `prism-php-web@<ver>`. (The app's GitHub-Release flow,
> `/release` + `release.yml`, is a **separate** pipeline for the repo itself —
> ADR-0046 — and does not touch npm.)

**SemVer while pre-1.0:** `0.x.y`. Breaking changes bump the minor (`0.2.0 →
0.3.0`); fixes/additions bump the patch (`0.2.0 → 0.2.1`). At 1.0, move to
standard SemVer and consider splitting the versions if the coupling loosens.

### `npm publish` quick reference

| Flag | When |
| --- | --- |
| `--access public` | First publish of a scoped package (or always — harmless). Baked in via `publishConfig.access`. |
| `--otp 123456` | If your account has 2FA on writes and you're publishing interactively without a prompt. |
| `--dry-run` | Rehearse without uploading. |
| `--provenance` | CI only (GitHub Actions OIDC). Baked in via `publishConfig.provenance`. Ignored locally. |

---

## Publishing a release (automated, recommended)

A GitHub Actions workflow that publishes on tag push. Provenance is signed
automatically via OIDC. Save as `.github/workflows/publish-packages.yml`:

```yaml
name: publish-packages
on:
  push:
    tags: ['prism-core@*', 'prism-php-web@*']
permissions:
  contents: read
  id-token: write        # required for npm provenance
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.19'
          registry-url: 'https://registry.npmjs.org'
      - name: Resolve package dir from tag
        id: pkg
        run: |
          name="${GITHUB_REF_NAME%@*}"      # prism-core  /  prism-php-web
          echo "dir=packages/$name" >> "$GITHUB_OUTPUT"
      - run: npm publish --access public --provenance
        working-directory: ${{ steps.pkg.outputs.dir }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_AUTOMATION_TOKEN }}
```

With this in place, the manual publish step 4 above is replaced by `git push
--tags`; CI does the upload and signs provenance. The `NPM_AUTOMATION_TOKEN`
secret must be a **granular** token (publish rights on `@kyaulabs/prism-*`);
legacy classic tokens do not participate in provenance.

> The repo's existing `.github/workflows/release.yml` is the **app** release
> (git-cliff changelog → GitHub Release → back-merge PR). It is unrelated to
> npm and must not be repurposed for package publishing.

---

## Updating packages

### Maintainer (cutting a new version)

Same flow as the first publish — bump, commit, tag, publish:

```bash
cd packages/prism-core   && npm version 0.2.1 --no-git-tag-version && cd -
cd packages/prism-php-web && npm version 0.2.1 --no-git-tag-version && cd -
git add packages/*/package.json
git commit -S -m "chore(packages): release v0.2.1"
git tag prism-core@0.2.1 && git tag prism-php-web@0.2.1
git push && git push --tags    # CI publishes; or `npm publish` each manually
```

If you maintain a `CHANGELOG.md` per package (optional), update it in the same
commit. Keep the two packages on the same version unless you have a reason to
diverge.

### Consumer (getting updates)

Once published, users install by name — **no clone required**:

```bash
# core, globally (one time)
pi install npm:@kyaulabs/prism-core
# adapter, inside a PHP project
cd /path/to/php-project && pi install -l npm:@kyaulabs/prism-php-web
```

Updating (see `pi help install`):

| Command | Effect |
| --- | --- |
| `pi update --extensions` | Update **all** non-pinned packages (core + adapters). |
| `pi update npm:@kyaulabs/prism-core` | Update one package, moving it to the latest compatible ref. |
| `pi update --all` | Update pi itself + all packages. |

**Pinning** — a versioned install is frozen and skipped by `pi update`:

```bash
pi install npm:@kyaulabs/prism-core@0.2.0   # pinned; updates move it only via re-install
```

Global package state lives in `~/.pi/agent/settings.json`; project state in
`.pi/settings.json`. `pi list` shows installed packages.

---

## Licensing

Both packages are `AGPL-3.0-only` (see repo-root [`LICENSE`](LICENSE)).

- **Running** the package via `pi install` (i.e. using it as a tool) does not
  distribute or convey the package, so AGPL obligations are not triggered for
  end users.
- Anyone who **redistributes or modifies** the package source must comply with
  AGPL-3.0 (preserve copyright/notice, disclose source, same license). The
  `NOTICE` file in each package carries the full attribution chain and must be
  preserved.

If a more permissive dual-license is ever wanted for adoption, that is a
deliberate policy decision requiring an ADR — do not change `license` silently.

---

## Unpublish vs. deprecate

- **Unpublish** is only possible within **72 hours** of publish, and only if
  no other package depends on the version. Treat it as a mistake-undo window,
  not a release tool.
- **Deprecate** is the supported way to retire a version or package:
  ```bash
  npm deprecate @kyaulabs/prism-core@0.1.0 "use 0.2.1+ — 0.1.0 has the missing peerDependency"
  npm deprecate @kyaulabs/prism-core        "deprecated: see <replacement>"
  ```
  Deprecation is permanent and version-specific. Always deprecate rather than
  unpublish once the 72h window closes — unpublished names can break any
  consumer (or downstream package) that pinned them.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `npm ERR! 402 Payment Required` on publish | Scoped package published as private and you have no paid org. Add `--access public` (or `publishConfig.access`). |
| Extension fails to load in consumer: `Cannot find module '@earendil-works/pi-coding-agent'` | Missing `peerDependencies` in `prism-core` (checklist §1). |
| `npm publish` asks for OTP and stalls in CI | You used a classic token with 2FA. Switch to a **granular** access token for CI. |
| `--provenance` rejected locally | Provenance is CI-only (needs GitHub OIDC). It works automatically in the workflow above; drop it for manual publishes. |
| `npm pack` lists `node_modules/` or tests | Tighten the `files` array (or add `.npmignore`). Only the `files` entries should ship. |
| Wrong/mismatched tag pushed `v0.2.0` | Use distinct `prism-core@<ver>` / `prism-php-web@<ver>` tags; never bare `v*` for packages. |
| `pi update` won't move a package | It's version-pinned in settings (`npm:@kyaulabs/prism-core@0.2.0`). Re-install at the new version to move it. |

---

## Summary checklist (first publish)

- [ ] `peerDependencies: { "@earendil-works/pi-coding-agent": "*" }` in `packages/prism-core/package.json`
- [ ] `engines` + `publishConfig` (no `"type": "module"`) in both `package.json`s
- [ ] Per-package `README.md` (core + php-web)
- [ ] `npm pack --dry-run` shows the expected files only
- [ ] Local tarball `pi install` + extension smoke test passes
- [ ] npm account in `@kyaulabs`, 2FA on, `npm login` works
- [ ] `NPM_AUTOMATION_TOKEN` granular secret in GitHub (for CI)
- [ ] `.github/workflows/publish-packages.yml` merged
- [ ] Bump both versions in lockstep, commit, distinct tags, push tags → publish
