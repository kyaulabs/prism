# CI Download Checksum Verification Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the `@tdd`
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Close the supply-chain gap from issue #182 by verifying a pinned
SHA-256 checksum before extracting every `curl`-downloaded tool in
`.github/workflows/ci.yml`, downloading to `mktemp` paths instead of fixed
`/tmp/<name>`, eliminating every `curl | tar`/`curl | python` pipe, and
removing the unsigned `get-pip.py` fallback.

**Architecture:** The `check` job already runs on the ephemeral
`ubuntu-latest` runner (issue #179 / ADR-0035) and installs two curl-fetched
binaries — shellcheck 0.11.0 and gitleaks 8.30.1 — plus a pip-installed
semgrep. Each curl download is rewritten to: (1) create a `mktemp -d` staging
directory, (2) `curl -fsSL -o` the archive into it (no pipe), (3) verify a
pinned SHA-256 via `sha256sum -c --strict -` before any extraction, (4) extract
into the staging dir, (5) move the binary into `$HOME/.local/bin`. The
`get-pip.py` fallback (unreachable on `ubuntu-latest`, which ships
`python3-venv`) is removed; the semgrep venv moves off its fixed
`/tmp/semgrep-venv` path onto a `mktemp` path. A new hash-agnostic shell
regression test in `tests/Shell/` locks the structural properties
(pinned-hash env vars present, `sha256sum -c` invoked, no pipe-into-interpreter,
`mktemp` used, no fixed `/tmp` destination, no `get-pip.py`).

**Tech Stack:** GitHub Actions workflow YAML, bash (`set -euo pipefail`,
`mktemp`, `sha256sum`, `tar`, `trap`), shell regression tests under
`tests/Shell/` using the shared `tests/Shell/lib/test_helpers.sh` helpers.

## Global constraints

- **Parity preserved (ADR-0025):** shellcheck stays pinned at `0.11.0`,
  gitleaks at `8.30.1`, semgrep at `1.168.0`. Only the *install procedure*
  changes — the versions developers run locally are unchanged, so the
  CI/local gate-parity contract holds.
- **Runner (ADR-0035):** `ubuntu-latest` only. `python3-venv` is preinstalled,
  so the venv path always succeeds and the `get-pip.py` fallback is dead code
  whose removal is safe and fail-closed (if venv ever fails, `set -euo
  pipefail` aborts the step loudly).
- **No new ADR.** This is contained hardening of one workflow file; nothing
  is hard-to-reverse and no cross-cutting decision is introduced. The
  interpretive load (ADR-0025 parity preserved, ADR-0035 context) is already
  captured by those ADRs and locked by existing `ci_local_parity_test.sh` /
  `ci_runner_isolation_adr_test.sh`.
- **Trust anchor.** SHA-256 values live inline in the workflow YAML as
  `*_SHA256:` env vars (co-located with the `*_VERSION:` pins) — committed to
  this repo, diff-reviewable in the PR. They are **not** fetched from an
  upstream sidecar (a compromised release ships a matching compromised
  checksum; only an in-repo pin closes the MITM/CDN-hijack vector).
- **File conventions (AGENTS.md / conventions.md):** new shell test file
  carries the RCS-style header + vim modeline (see `rcs-header` skill);
  4-space indentation for the YAML; the test file uses the exact
  `tests/Shell/ci_*_test.sh` skeleton.

## Decision reconciliation (issue #182 ACs vs. triage decisions)

| AC | Issue text | Resolution under decision (A) |
| --- | --- | --- |
| AC1 | "All **three** download steps verify a SHA-256 checksum" | **Two**, not three: shellcheck + gitleaks. The third (get-pip.py) is removed by AC4/decision (A). semgrep installs via `pip` (TLS + PyPI hash verification), so it needs no separate gate — the AC's "three" referred to the curl-based downloads. |
| AC2 | "No CI step pipes curl output directly into tar, sh, or python" | Asserted by Test 4 (hash-agnostic). |
| AC3 | "Downloads use mktemp paths, not fixed /tmp/<name>" | Asserted by Test 5; also relocates `/tmp/semgrep-venv` onto `mktemp`. |
| AC4 | "The get-pip.py fallback is removed or hash-pinned" | **Removed** (decision (A)). `get-pip.py` is a versionless rolling script with no stable checksum; the fallback is unreachable on `ubuntu-latest`. |

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `.github/workflows/ci.yml` | The CI workflow. Three `run:` blocks change: the shellcheck install (`Install shellcheck 0.11.0`), the gitleaks install (`Install gitleaks 8.30.1`), and the semgrep install (`Install Semgrep`, whose `get-pip.py` `else` branch is deleted and whose venv path is relocated). | Modify |
| `tests/Shell/ci_download_integrity_test.sh` | New shell regression test. Six hash-agnostic assertions locking AC1–AC4 structurally. Mirrors `ci_no_sudo_test.sh` / `ci_runner_hosted_test.sh` skeleton. | Create |

No other files change. No PHP, no SCSS, no JS, no docs other than this plan.

---

## Task 1: Write the failing regression test (Red)

**Files:**
- Create: `tests/Shell/ci_download_integrity_test.sh`

**Interfaces:**
- Consumes: `tests/Shell/lib/test_helpers.sh` (`setup_result_file`, `pass`,
  `fail`, `print_summary`) and `.github/workflows/ci.yml` (the file under
  test).
- Produces: a test discovered by the existing `Shell regression tests` CI step
  (which globs `tests/Shell/*_test.sh`) and by `/check`'s shell-test phase.

- [ ] **Step 1: Create the test file with full content**

  Apply the `rcs-header` skill for the header line + vim modeline. The body
  mirrors `tests/Shell/ci_no_sudo_test.sh` exactly (shebang → RCS header →
  blank lines → purpose comment → `set -euo pipefail` → `REPO_ROOT` → source
  helpers → `setup_result_file` → numbered tests → `print_summary` →
  `exit $?` → vim modeline).

  ```bash
  #!/usr/bin/env bash
  # $KYAULabs: ci_download_integrity_test.sh <user>@<host> <YYYY/MM/DD> -0700 Exp $


  # ci_download_integrity_test.sh — Verify the CI workflow verifies a pinned
  # SHA-256 checksum before extracting every curl-downloaded tool, downloads
  # to mktemp paths (not fixed /tmp/<name>), never pipes curl into
  # tar/sh/python, and no longer ships the unsigned get-pip.py fallback.
  #
  # Issue #182: shellcheck, gitleaks, and the get-pip.py fallback were
  # installed from curl downloads with version pinning but no integrity
  # verification, and extracted to predictable /tmp paths (TOCTOU). The fix
  # (decision (A) in triage) removes get-pip.py entirely and adds inline
  # SHA-256 verification + mktemp download paths to the two remaining curl
  # downloads. semgrep continues to install via pip (TLS + PyPI hash
  # verification), so it is out of the checksum-gate scope. See ADR-0035
  # (runner isolation) for the broader CI supply-chain context.

  set -euo pipefail

  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

  setup_result_file

  CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

  if [ ! -f "$CI_FILE" ]; then
      fail "ci.yml not found at ${CI_FILE}"
      print_summary "ci_download_integrity_test.sh"
      exit $?
  fi

  # noncomment — emit ci.yml lines (with line numbers) that are not YAML
  # comments. Tolerates grep exit 1 under set -e via `|| true`.
  noncomment() {
      grep -nE -v '^[0-9]+:[[:space:]]*#' "$CI_FILE" || true
  }

  # ── Test 1: shellcheck install pins a 64-hex SHA-256 (AC1) ────────────
  echo ""
  echo "── Test 1: shellcheck install pins a 64-hex SHA-256 ──"

  if grep -qE 'SC_SHA256:[[:space:]]*"[0-9a-f]{64}"' "$CI_FILE"; then
      pass "shellcheck SC_SHA256 pinned (64 hex)"
  else
      fail "shellcheck install missing SC_SHA256:<64-hex> env var"
  fi

  # ── Test 2: gitleaks install pins a 64-hex SHA-256 (AC1) ──────────────
  echo ""
  echo "── Test 2: gitleaks install pins a 64-hex SHA-256 ──"

  if grep -qE 'GL_SHA256:[[:space:]]*"[0-9a-f]{64}"' "$CI_FILE"; then
      pass "gitleaks GL_SHA256 pinned (64 hex)"
  else
      fail "gitleaks install missing GL_SHA256:<64-hex> env var"
  fi

  # ── Test 3: sha256sum -c invoked at least twice (AC1) ─────────────────
  echo ""
  echo "── Test 3: sha256sum -c invoked for each pinned download ──"

  sha_checks=$(grep -cE 'sha256sum -c --strict' "$CI_FILE" 2>/dev/null || true)
  if [ "${sha_checks:-0}" -ge 2 ]; then
      pass "sha256sum -c --strict invoked ${sha_checks} time(s) (>= 2)"
  else
      fail "expected >= 2 'sha256sum -c --strict', found ${sha_checks:-0}"
  fi

  # ── Test 4: no curl piped into tar/sh/bash/python (AC2) ───────────────
  echo ""
  echo "── Test 4: no curl piped into tar/sh/bash/python ──"

  pipes=$(noncomment | grep -E '\|[[:space:]]*(tar|sh|bash|python[0-9.]*)\b' || true)
  if [ -n "$pipes" ]; then
      fail "ci.yml pipes curl into a tar/sh/python interpreter:"
      echo "$pipes" >&2
  else
      pass "no curl|tar / curl|sh / curl|python pipe"
  fi

  # ── Test 5: downloads use mktemp, not fixed /tmp/<name> (AC3) ─────────
  echo ""
  echo "── Test 5: downloads use mktemp paths ──"

  if grep -qE '\bmktemp\b' "$CI_FILE"; then
      pass "mktemp used for download destinations"
  else
      fail "no mktemp usage in ci.yml"
  fi

  fixed_tmp=$(noncomment \
      | grep -E '(-C[[:space:]]+/tmp([[:space:]]|$)|-o[[:space:]]+/tmp/|/tmp/semgrep-venv|/tmp/get-pip)' \
      || true)
  if [ -n "$fixed_tmp" ]; then
      fail "ci.yml uses a fixed /tmp download/extract destination:"
      echo "$fixed_tmp" >&2
  else
      pass "no fixed /tmp download/extract destination"
  fi

  # ── Test 6: unsigned get-pip.py fallback removed (AC4) ───────────────
  echo ""
  echo "── Test 6: get-pip.py / bootstrap.pypa.io fallback removed ──"

  getpip=$(noncomment | grep -E '(bootstrap\.pypa\.io|get-pip\.py)' || true)
  if [ -n "$getpip" ]; then
      fail "ci.yml still references the unsigned get-pip.py bootstrap:"
      echo "$getpip" >&2
  else
      pass "get-pip.py / bootstrap.pypa.io fallback removed"
  fi

  # ── Summary ────────────────────────────────────────────────────────────

  print_summary "ci_download_integrity_test.sh"
  exit $?
  ```

  *(Trailing vim modeline `# vim: ft=sh sts=4 sw=4 ts=4 et :` and the standard
  blank-line padding before it, per `rcs-header` skill.)*

- [ ] **Step 2: Run the test to verify it FAILS for the right reason (Red)**

  Run: `bash tests/Shell/ci_download_integrity_test.sh`
  Expected: **FAIL** — Tests 1–6 all fail on the current `ci.yml` (no
  `SC_SHA256`/`GL_SHA256` env vars, zero `sha256sum -c`, two `curl | tar`
  pipes, no `mktemp`, fixed `/tmp/semgrep-venv` + `-C /tmp`, and the
  `bootstrap.pypa.io`/`get-pip.py` fallback present). This confirms the test
  exercises the gap.

- [ ] **Step 3: Confirm shellcheck cleanliness of the new test file**

  Run: `shellcheck tests/Shell/ci_download_integrity_test.sh`
  Expected: clean (no warnings at `--severity=warning`). The file is picked up
  by the `Shellcheck` CI step and the pre-commit hook, so it must be clean now.

  *Do not commit yet — a Red test committed alone breaks the suite. It goes
  Green alongside the implementation in Task 3, then commits as one atomic
  unit.*

---

## Task 2: Derive the two pinned SHA-256 checksums (fact-gathering)

> Requires network access and `sha256sum` — run in **build mode** (the `@tdd`
> agent's bash surface, or locally). This task establishes the literal values
> Task 3 depends on. It is deterministic and reproducible; record both
> 64-hex values for use in Task 3.

**Files:** none modified (read-only derivation).

- [ ] **Step 1: Compute the shellcheck 0.11.0 checksum**

  ```bash
  curl -fsSL -o /tmp/sc.tar.xz \
    'https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.xz'
  sha256sum /tmp/sc.tar.xz
  ```

  Record the 64-hex output as `SC_SHA256`. (shellcheck does not publish a
  checksums sidecar for this release, so the locally-computed hash is the
  authoritative pin.)

- [ ] **Step 2: Compute the gitleaks 8.30.1 checksum AND cross-check upstream**

  ```bash
  curl -fsSL -o /tmp/gl.tar.gz \
    'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz'
  sha256sum /tmp/gl.tar.gz
  # Cross-check against gitleaks' published checksums.txt:
  curl -fsSL 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/checksums.txt' \
    | grep 'gitleaks_8.30.1_linux_x64.tar.gz'
  ```

  Record the 64-hex output as `GL_SHA256`. **Assert the two values match** —
  the locally-computed hash and the line from `checksums.txt` must be
  identical. If they differ, STOP and investigate (possible MITM or a stale
  CDN edge) before proceeding.

- [ ] **Step 3: Sanity-check both values are 64 lowercase hex chars**

  Both recorded values must match the regex `^[0-9a-f]{64}$`. This is what
  Task 1's Tests 1 & 2 assert structurally.

---

## Task 3: Rewrite the three install steps in ci.yml (Green)

**Files:**
- Modify: `.github/workflows/ci.yml` — three `run:` blocks.

**Interfaces:**
- Consumes: the two SHA-256 values derived in Task 2 (`SC_SHA256`,
  `GL_SHA256`).
- Produces: a `check` job whose curl downloads are integrity-verified and
  TOCTOU-resistant; the `get-pip.py` fallback is gone.

- [ ] **Step 1: Replace the shellcheck install step**

  Replace the `Install shellcheck 0.11.0` step (the block beginning at the
  `# Pin shellcheck to a specific version…` comment through the
  `shellcheck --version` line — currently the only `SC_VERSION` step) with:

  ```yaml
      # Pin shellcheck to a specific version for local/CI parity. The runner
      # image's bundled shellcheck lags upstream stable and its exit-code
      # behavior differs from 0.11.0 (which decoupled info/style from the exit
      # code), causing info-level findings (SC2295, SC2015) to fail CI while
      # passing locally. Keep this version in sync with what developers run.
      # Issue #182: verify the pinned SHA-256 before extraction (no curl|tar
      # pipe) and download to a mktemp path to defeat /tmp TOCTOU pre-planting.
      - name: Install shellcheck 0.11.0
        env:
          SC_VERSION: "0.11.0"
          SC_SHA256: "<SC_SHA256 from Task 2>"
        run: |
          set -euo pipefail
          tmpdir="$(mktemp -d)"
          trap 'rm -rf "$tmpdir"' EXIT
          archive="shellcheck-v${SC_VERSION}.linux.x86_64.tar.xz"
          curl -fsSL -o "$tmpdir/${archive}" \
            "https://github.com/koalaman/shellcheck/releases/download/v${SC_VERSION}/${archive}"
          echo "${SC_SHA256}  ${tmpdir}/${archive}" | sha256sum -c --strict -
          tar -xJ -C "$tmpdir" -f "$tmpdir/${archive}"
          mkdir -p "$HOME/.local/bin"
          mv "$tmpdir/shellcheck-v${SC_VERSION}/shellcheck" "$HOME/.local/bin/"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
          export PATH="$HOME/.local/bin:$PATH"
          shellcheck --version
  ```

- [ ] **Step 2: Replace the gitleaks install step**

  Replace the `Install gitleaks 8.30.1` step (the block beginning at the
  `# Pin gitleaks to a specific version…` comment through `gitleaks version`)
  with:

  ```yaml
      # Pin gitleaks to a specific version for local/CI parity (same rationale
      # as the shellcheck pin above). Binary install avoids the Docker
      # dependency that gitleaks-action@v3 required — Docker just for a secrets
      # scan is absurd overhead on the runner.
      # Issue #182: verify the pinned SHA-256 before extraction (no curl|tar
      # pipe) and download to a mktemp path to defeat /tmp TOCTOU pre-planting.
      - name: Install gitleaks 8.30.1
        env:
          GL_VERSION: "8.30.1"
          GL_SHA256: "<GL_SHA256 from Task 2>"
        run: |
          set -euo pipefail
          tmpdir="$(mktemp -d)"
          trap 'rm -rf "$tmpdir"' EXIT
          archive="gitleaks_${GL_VERSION}_linux_x64.tar.gz"
          curl -fsSL -o "$tmpdir/${archive}" \
            "https://github.com/gitleaks/gitleaks/releases/download/v${GL_VERSION}/${archive}"
          echo "${GL_SHA256}  ${tmpdir}/${archive}" | sha256sum -c --strict -
          tar -xz -C "$tmpdir" -f "$tmpdir/${archive}"
          mkdir -p "$HOME/.local/bin"
          mv "$tmpdir/gitleaks" "$HOME/.local/bin/"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
          export PATH="$HOME/.local/bin:$PATH"
          gitleaks version
  ```

- [ ] **Step 3: Replace the semgrep install step (remove get-pip fallback, relocate venv)**

  Replace the entire `Install Semgrep` step (the `if python3 -m venv … else …
  fi` block) with a venv-only install on a `mktemp` path:

  ```yaml
      - name: Install Semgrep
        env:
          SEMGREP_VERSION: "1.168.0"
        run: |
          set -euo pipefail
          # Install semgrep into an isolated venv under a mktemp path to avoid
          # PEP 668 externally-managed-environment errors on the runner image
          # and to defeat /tmp TOCTOU pre-planting (Issue #182). pip verifies
          # package hashes from PyPI over TLS, so no separate checksum gate is
          # needed here — only the curl-based downloads above require it.
          venv="$(mktemp -d)/semgrep-venv"
          python3 -m venv "$venv"
          "$venv/bin/pip" install --quiet "semgrep==${SEMGREP_VERSION}"
          echo "$venv/bin" >> "$GITHUB_PATH"
          export PATH="$venv/bin:$PATH"
          semgrep --version
  ```

  *This deletes the entire `else` branch that referenced `bootstrap.pypa.io`
  and `get-pip.py` (AC4) and removes the fixed `/tmp/semgrep-venv` literal
  (AC3).*

- [ ] **Step 4: Run the regression test to verify it PASSES (Green)**

  Run: `bash tests/Shell/ci_download_integrity_test.sh`
  Expected: **PASS** — all six tests green.

- [ ] **Step 5: Run the full Shell suite to confirm no regressions**

  Run:
  ```bash
  for t in tests/Shell/*_test.sh; do echo "== $t =="; bash "$t" || exit 1; done
  ```
  Expected: all green. Pay particular attention to `ci_local_parity_test.sh`
  (ADR-0025), `ci_runner_isolation_adr_test.sh` (ADR-0035), `ci_no_sudo_test.sh`,
  `ci_runner_hosted_test.sh`, `ci_persist_credentials_test.sh`,
  `ci_no_composer_scripts_test.sh`, `semgrep_ci_test.sh`, `gitleaks_test.sh`,
  `ci_npm_test.sh`.

- [ ] **Step 6: Lint the changed workflow + test**

  Run: `shellcheck tests/Shell/ci_download_integrity_test.sh`
  Run (if `actionlint` is installed): `actionlint .github/workflows/ci.yml`
  Expected: clean.

- [ ] **Step 7: Refactor pass**

  Re-read the three rewritten blocks. Confirm: no leftover `/tmp` literals,
  every `trap` uses single-quoted deferred expansion (`trap 'rm -rf "$tmpdir"'
  EXIT`) so shellcheck is clean, and the `mkdir -p "$HOME/.local/bin"` guard is
  present in both binary steps (the venv step does not need it). No changes
  expected — this is a verification read.

---

## Task 4: Verify, gate, commit

**Files:** none new — verification + commit of Task 1 + Task 3 together.

- [ ] **Step 1: verification-before-completion**

  Re-run the new test once more in isolation:
  `bash tests/Shell/ci_download_integrity_test.sh` → green.
  Confirm no debug instrumentation, no leftover `/tmp/sc.tar.xz` or
  `/tmp/gl.tar.gz` artifacts committed (they were only in the build-mode
  derivation, outside the repo).

- [ ] **Step 2: `/check` gate**

  Run `/check` (php-cs-fixer + stylelint + eslint + pest --coverage 80%).
  Expected: green. No PHP/SCSS/JS changed, so the coverage gate is a no-op for
  this diff; linters should be clean. The shell-test phase of `/check` now
  includes the new `ci_download_integrity_test.sh`.

- [ ] **Step 3: `@code-review` (4-axis, incl. semgrep secret scan)**

  Run `@code-review` on the staged diff before push. Confirm no secrets
  introduced (the SHA-256 literals are not secrets) and the structural change
  matches this plan.

- [ ] **Step 4: Commit (test + ci.yml together, atomic Green)**

  Resolve identity + build the commit message via the `conventional-commits`
  skill. Stage the test file, the workflow, and this plan:

  ```bash
  git add tests/Shell/ci_download_integrity_test.sh \
          .github/workflows/ci.yml \
          docs/plans/2026-07-21-ci-download-checksum-verification.md
  git commit -S -m $'fix(ci): verify checksums before extracting pinned tools\n\nThe shellcheck, gitleaks, and get-pip.py installs in ci.yml downloaded\npinned assets with no integrity verification and extracted them to\npredictable /tmp paths (TOCTOU). Add inline SHA-256 verification via\nsha256sum -c --strict, download to mktemp staging dirs, eliminate the\ncurl|tar / curl|python pipes, and remove the unsigned get-pip.py\nfallback (unreachable on ubuntu-latest). Adds a hash-agnostic shell\nregression test locking AC1-AC4 structurally.\n\nFixes: #182\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
  ```

  > *Use the canonical `$'...\n...'` ANSI-C quoting form — see the
  > `conventional-commits` skill. The `commit-msg` hook rejects literal `\n`
  > sequences (ADR-0025). `Fixes: #NN` is sentence-case with a colon; other
  > verbs (`Closes`, `Resolve`, `Fix`) are rejected by commitlint.*

  > *If the plan file is to be committed separately (mirroring #179's
  > `docs(plan):` convention), split into two commits: first
  > `docs(plan): add CI download checksum verification plan` (this file alone),
  > then the `fix(ci):` commit above without the plan in the stage. Either is
  > acceptable; pick one and keep the `fix(ci):` commit focused on code+test.*

---

## Verification (acceptance criteria → evidence)

- **AC1** (checksum verification before execution): Tests 1, 2, 3 green —
  `SC_SHA256` + `GL_SHA256` 64-hex pins present, `sha256sum -c --strict`
  invoked twice.
- **AC2** (no curl|tar/sh/python pipe): Test 4 green — no non-comment line
  matches `\|\s*(tar|sh|bash|python[0-9.]*)`.
- **AC3** (mktemp paths, no fixed /tmp): Test 5 green — `mktemp` present, no
  `-C /tmp`, `-o /tmp/`, `/tmp/semgrep-venv`, or `/tmp/get-pip`.
- **AC4** (get-pip removed or pinned): Test 6 green — no `bootstrap.pypa.io`
  or `get-pip.py` reference; removed per decision (A).
- **Parity (ADR-0025):** tool versions unchanged (shellcheck 0.11.0,
  gitleaks 8.30.1, semgrep 1.168.0) — `ci_local_parity_test.sh` still green.
- **Runner (ADR-0035):** no `sudo` introduced — `ci_no_sudo_test.sh` still
  green; `runs-on: ubuntu-latest` unchanged — `ci_runner_hosted_test.sh`
  still green.
- **End-to-end:** the next CI run on the branch exercises the real downloads
  with the real pinned hashes; a mismatch would fail the `Install shellcheck`
  / `Install gitleaks` steps (fail-closed). Observe one green `check` run.

## Commit sequence (proposed)

1. *(optional)* `docs(plan): add CI download checksum verification plan`
2. `fix(ci): verify checksums before extracting pinned tools` (+ test, this
   plan if not committed separately, `Fixes: #182`, footers)

## Execution mode

Inline batch with checkpoints (`executing-plans` skill). Task 1 (Red) → Task 2
(derive facts, build-mode) → Task 3 (Green) → Task 4 (verify + gate + commit).
The Red test is never committed alone; it ships atomic with its Green
implementation.

## Out of scope

- Migrating tool installs to third-party setup actions (e.g.
  `install-shellcheck-action`) — rejected to preserve version pinning and
  avoid expanding the trusted-action surface (same decision as ADR-0035).
- Pre-provisioning shellcheck/gitleaks in a custom runner image — no custom
  runner image exists (`ubuntu-latest` is used).
- Hash-pinning `get-pip.py` — rejected by decision (A); removed instead.
- Changes to the `check-macos` job — it installs no curl-downloaded binaries
  (composer/npm/brew only), so it is unaffected.
- A new ADR — contained hardening, nothing hard-to-reverse (see Global
  constraints).

## Self-review (writing-plans skill §Self-review)

1. **Spec/AC coverage:** AC1 → Tests 1–3; AC2 → Test 4; AC3 → Test 5;
   AC4 → Test 6. All four ACs mapped. ✓
2. **Placeholder scan:** the only `<...>` tokens are `<SC_SHA256 from Task 2>`
   and `<GL_SHA256 from Task 2>` — these are **derived facts** established by
   the deterministic, documented commands in Task 2 (Steps 1–3), not
   unspecified design gaps. The RCS header `<user>@<host> <YYYY/MM/DD>` and
   the `Signed-off-by:` footer are stamped by tooling (`rcs-header` skill /
   `resolve-identity.sh`) at creation/commit time per repo convention. No
   other placeholders. ✓
3. **Type consistency:** `SC_SHA256` / `GL_SHA256` env-var names match between
   Task 1's assertions (`SC_SHA256:`/`GL_SHA256:`) and Task 3's `env:` blocks.
   `tmpdir`/`archive`/`venv` local names are consistent within each step. ✓
