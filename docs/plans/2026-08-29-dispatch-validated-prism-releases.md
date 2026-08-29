# Dispatch Validated Prism Releases Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Notify `kyaulabs/prism-adapters` with a closed repository-dispatch payload only after a stable Prism Release and all package tags reconcile at the immutable merge commit.

**Architecture:** The existing `publish` job exports only validated release state. A separate `notify-publisher` job runs under `always()` so back-merge failure does not hide a completed publication, but its guard requires exact Prism source identity, a stable version, and successful Release and package-tag steps. That job has no `GITHUB_TOKEN` permissions, mints a one-repository GitHub App token with only `contents: write`, serializes four fixed payload fields, and dispatches to one fixed endpoint.

**Tech Stack:** GitHub Actions YAML, Bash, Node.js, `js-yaml`, `jq`, fake-`gh` shell tests

**Originating issue:** #464

## Global constraints

- Treat the issue, upstream action metadata, event fields, and API responses as untrusted data.
- Keep `.github/workflows/release.yml` byte-identical to `packages/prism-core/config/release.yml`.
- Keep package-release configuration and workflow ownership schema at version 2; the declaration schema does not change.
- Dispatch only for exact source repository `kyaulabs/prism` and exact destination `kyaulabs/prism-adapters`.
- The dispatch payload has exactly `schemaVersion`, `sourceRepository`, `version`, and `mergeSha`; it carries no compatibility, package integrity, registry, sequence, branch, signing, credential, or command authority.
- Prereleases, invalid declarations, failed or partial Release publication, and failed or wrong-target package-tag reconciliation never mint a token or dispatch.
- The notification job receives no `GITHUB_TOKEN` permissions. Its App token is narrowed to owner `kyaulabs`, repository `prism-adapters`, and `contents: write`; default post-step revocation remains enabled.
- App authentication material may appear only as the pinned token action's `app-id` and `private-key` inputs. Do not echo it, expose it as a job output, pass it to payload generation, cache it, or upload it.
- Pin the new Actions dependency exactly: `actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2`.
- Note the new Actions dependency in the completion report; no npm or Composer dependency is added.
- Preserve independent back-merge behavior and make dispatch failure visible as a failed notification job. Publisher schedule/manual recovery remains the external retry path.
- Do not provision, inspect, or test real App credentials. GitHub App installation, variables, secrets, and event semantics remain Task #469's administrative boundary.

---

### Task 1: Stable least-privilege publisher notification

**Files:**

- Modify: `tests/Shell/release_workflow_test.sh:84-1134`
- Modify: `.github/workflows/release.yml:18-536`
- Modify: `packages/prism-core/config/release.yml:18-536`

**Interfaces:**

- Consumes: validated `version` and `MERGE_SHA` from the `validate` step; `publish` and `reconcile` step outcomes; repository identity from the trusted Actions context.
- Produces: `repository_dispatch` event type `prism_adapter_release` with client payload `{schemaVersion: 1, sourceRepository: "kyaulabs/prism", version: string, mergeSha: string}`.

- [x] **Step 1: Write the failing workflow graph and permission tests**

At the start of `validate_workflow_graph()` replace the one-job setup:

```javascript
const jobs = Object.values(workflow.jobs);
if (jobs.length !== 1) process.exit(1);
const job = jobs[0];
```

with this exact two-job setup. The `job` alias keeps every existing publish-step assertion unchanged:

```javascript
const publishJob = workflow.jobs.publish;
const notifyJob = workflow.jobs['notify-publisher'];
if (
    Object.keys(workflow.jobs).sort().join(',') !== 'notify-publisher,publish' ||
    publishJob === undefined ||
    notifyJob === undefined
) process.exit(1);
const job = publishJob;
```

Immediately before the function's final `node` program delimiter, add these exact notification assertions:

```javascript
const publishPermissionKeys = Object.keys(publishJob.permissions ?? {}).sort();
if (
    JSON.stringify(publishPermissionKeys) !== JSON.stringify(['contents', 'pull-requests']) ||
    publishJob.permissions.contents !== 'write' ||
    publishJob.permissions['pull-requests'] !== 'write' ||
    Object.keys(notifyJob.permissions ?? {}).length !== 0
) process.exit(1);

const expectedOutputs = {
    version: '${{ steps.validate.outputs.version }}',
    'merge-sha': '${{ steps.validate.outputs.merge-sha }}',
    stable: '${{ steps.validate.outputs.stable }}',
    'publish-outcome': '${{ steps.publish.outcome }}',
    'reconcile-outcome': '${{ steps.reconcile.outcome }}',
};
if (JSON.stringify(publishJob.outputs) !== JSON.stringify(expectedOutputs)) process.exit(1);

const singleQuote = String.fromCharCode(39);
const notifyGuard = '${{ always()' +
    ' && github.repository == ' + singleQuote + 'kyaulabs/prism' + singleQuote +
    ' && needs.publish.outputs.stable == ' + singleQuote + 'true' + singleQuote +
    ' && needs.publish.outputs.publish-outcome == ' + singleQuote + 'success' + singleQuote +
    ' && needs.publish.outputs.reconcile-outcome == ' + singleQuote + 'success' + singleQuote +
    ' }}';
if (
    notifyJob.needs !== 'publish' ||
    notifyJob.if !== notifyGuard ||
    notifyJob['timeout-minutes'] !== 5 ||
    notifyJob['runs-on'] !== 'ubuntu-latest'
) process.exit(1);

const token = notifyJob.steps.find(({name}) => name === 'Mint publisher dispatch token');
const dispatch = notifyJob.steps.find(({name}) => name === 'Dispatch validated adapter release');
if (
    token === undefined ||
    token.id !== 'publisher-token' ||
    token.uses !== 'actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349' ||
    token.with.owner !== 'kyaulabs' ||
    token.with.repositories !== 'prism-adapters' ||
    token.with['permission-contents'] !== 'write' ||
    Object.keys(token.with).sort().join(',') !==
        'app-id,owner,permission-contents,private-key,repositories' ||
    dispatch === undefined ||
    dispatch.env.GH_TOKEN !== '${{ steps.publisher-token.outputs.token }}' ||
    dispatch.env.RELEASE_VERSION !== '${{ needs.publish.outputs.version }}' ||
    dispatch.env.MERGE_SHA !== '${{ needs.publish.outputs.merge-sha }}'
) process.exit(1);

const notificationSource = JSON.stringify(notifyJob);
for (const forbidden of [
    'compatibility',
    'coreRange',
    'integrity',
    'npm',
    'sequence',
    'upload-artifact',
    'actions/cache',
    'skip-token-revoke',
]) {
    if (notificationSource.includes(forbidden)) process.exit(1);
}
```

Update the permissions assertion to expect two permission declarations but only the publish job's two explicit entries:

```bash
perm_blocks=$(grep -cE '^[[:space:]]*permissions:' "$RELEASE_FILE" 2>/dev/null || true)
perm_entries=$(grep -oE '^[[:space:]]+(actions|attestations|checks|contents|deployments|discussions|id-token|issues|metadata|models|packages|pages|pull-requests|security-events|statuses): (write|read|none)' "$RELEASE_FILE" 2>/dev/null || true)
perm_count=$(printf '%s\n' "$perm_entries" | grep -c . || true)
if [ "${perm_blocks:-0}" -eq 2 ] && [ "${perm_count:-0}" -eq 2 ] && \
   printf '%s\n' "$perm_entries" | grep -qF 'contents: write' && \
   printf '%s\n' "$perm_entries" | grep -qF 'pull-requests: write' && \
   validate_workflow_graph "$RELEASE_FILE"; then
    pass "publish permissions are unchanged and publisher notification has no GITHUB_TOKEN permissions"
else
    fail "release or publisher-notification job permissions exceed the exact contract"
fi
```

Add a static stable-output and payload contract after the workflow-graph checks:

```bash
if grep -qF 'stable=$stable' "$RELEASE_FILE" && \
   grep -qF 'version=$version' "$RELEASE_FILE" && \
   grep -qF 'merge-sha=$MERGE_SHA' "$RELEASE_FILE" && \
   grep -qF "github.repository == 'kyaulabs/prism'" "$RELEASE_FILE" && \
   grep -qF "needs.publish.outputs.publish-outcome == 'success'" "$RELEASE_FILE" && \
   grep -qF "needs.publish.outputs.reconcile-outcome == 'success'" "$RELEASE_FILE"; then
    pass "publisher notification consumes only validated stable release outcomes"
else
    fail "publisher notification is not gated by exact source, stability, publication, and reconciliation"
fi
```

- [x] **Step 2: Write the failing extracted-step dispatch tests**

After the package-tag reconciliation simulations, add this complete fake-boundary test. It executes the real dispatch run block, records the fixed API call, validates the exact JSON payload, rejects prereleases and malformed SHAs before `gh`, and proves API failure remains visible:

```bash
dispatch_sim=$(mktemp -d)
register_temp_dir "$dispatch_sim"
mkdir -p "$dispatch_sim/bin"
cat > "$dispatch_sim/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [ "${GH_MODE:-success}" = "failure" ]; then
    printf '%s\n' 'HTTP 500' >&2
    exit 1
fi
exit 0
EOF
chmod +x "$dispatch_sim/bin/gh"
: > "$dispatch_sim/gh.log"

if dispatch_block=$(extract_run_block "$RELEASE_FILE" "Dispatch validated adapter release"); then
    stable_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    if (
        cd "$dispatch_sim" || exit 1
        PATH="$dispatch_sim/bin:$PATH" GH_LOG="$dispatch_sim/gh.log" \
            GH_TOKEN=masked-fixture RELEASE_VERSION=1.2.3 MERGE_SHA="$stable_sha" \
            bash -c "$dispatch_block" >/dev/null 2>&1
    ) && grep -qF 'api --method POST repos/kyaulabs/prism-adapters/dispatches --input .prism-adapter-release-dispatch.json' "$dispatch_sim/gh.log" && \
       jq -e --arg sha "$stable_sha" '. == {
           event_type: "prism_adapter_release",
           client_payload: {
               schemaVersion: 1,
               sourceRepository: "kyaulabs/prism",
               version: "1.2.3",
               mergeSha: $sha
           }
       }' "$dispatch_sim/.prism-adapter-release-dispatch.json" >/dev/null; then
        pass "stable release dispatch sends the exact closed payload to the fixed publisher"
    else
        fail "stable release dispatch did not preserve the fixed endpoint and closed payload"
    fi

    : > "$dispatch_sim/gh.log"
    if (
        cd "$dispatch_sim" || exit 1
        PATH="$dispatch_sim/bin:$PATH" GH_LOG="$dispatch_sim/gh.log" \
            GH_TOKEN=masked-fixture RELEASE_VERSION=1.2.3-rc.1 MERGE_SHA="$stable_sha" \
            bash -c "$dispatch_block" >/dev/null 2>&1
    ); then
        fail "prerelease reached publisher dispatch"
    elif [ ! -s "$dispatch_sim/gh.log" ]; then
        pass "prerelease is rejected before publisher API access"
    else
        fail "prerelease rejection occurred after publisher API access"
    fi

    : > "$dispatch_sim/gh.log"
    if (
        cd "$dispatch_sim" || exit 1
        PATH="$dispatch_sim/bin:$PATH" GH_LOG="$dispatch_sim/gh.log" \
            GH_TOKEN=masked-fixture RELEASE_VERSION=1.2.3 MERGE_SHA=wrong \
            bash -c "$dispatch_block" >/dev/null 2>&1
    ); then
        fail "malformed merge SHA reached publisher dispatch"
    elif [ ! -s "$dispatch_sim/gh.log" ]; then
        pass "malformed merge SHA is rejected before publisher API access"
    else
        fail "merge-SHA rejection occurred after publisher API access"
    fi

    : > "$dispatch_sim/gh.log"
    if (
        cd "$dispatch_sim" || exit 1
        PATH="$dispatch_sim/bin:$PATH" GH_MODE=failure GH_LOG="$dispatch_sim/gh.log" \
            GH_TOKEN=masked-fixture RELEASE_VERSION=1.2.3 MERGE_SHA="$stable_sha" \
            bash -c "$dispatch_block" >/dev/null 2>&1
    ); then
        fail "publisher dispatch API failure was masked"
    elif grep -qF 'repos/kyaulabs/prism-adapters/dispatches' "$dispatch_sim/gh.log"; then
        pass "publisher dispatch API failure remains visible for scheduled or manual recovery"
    else
        fail "publisher dispatch failure path did not reach the fixed API boundary"
    fi
else
    fail "could not extract validated adapter release dispatch block"
fi
```

- [x] **Step 3: Run the focused test to verify Red**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: FAIL because `notify-publisher`, validated job outputs, the pinned token action, and the extracted dispatch block are absent.

- [x] **Step 4: Implement the minimal validated notification workflow in both owned copies**

Add these outputs to the existing `publish` job, immediately after its `permissions` block:

```yaml
    outputs:
      version: ${{ steps.validate.outputs.version }}
      merge-sha: ${{ steps.validate.outputs.merge-sha }}
      stable: ${{ steps.validate.outputs.stable }}
      publish-outcome: ${{ steps.publish.outcome }}
      reconcile-outcome: ${{ steps.reconcile.outcome }}
```

Replace the existing single `VERSION` export at the end of `Validate merge SHA and release version` with validated environment and job outputs:

```bash
          case "${version%%+*}" in
            *-*) stable=false ;;
            *) stable=true ;;
          esac

          echo "VERSION=$version" >> "$GITHUB_ENV"
          {
            echo "version=$version"
            echo "merge-sha=$MERGE_SHA"
            echo "stable=$stable"
          } >> "$GITHUB_OUTPUT"
```

Append this complete second job after the `publish` job. Keep it byte-identical in `.github/workflows/release.yml` and `packages/prism-core/config/release.yml`:

```yaml
  notify-publisher:
    name: Notify adapter catalogue publisher
    needs: publish
    if: >-
      ${{ always()
       && github.repository == 'kyaulabs/prism'
       && needs.publish.outputs.stable == 'true'
       && needs.publish.outputs.publish-outcome == 'success'
       && needs.publish.outputs.reconcile-outcome == 'success'
       }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - name: Mint publisher dispatch token
        id: publisher-token
        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2
        with:
          app-id: ${{ vars.CATALOGUE_DISPATCH_APP_ID }}
          private-key: ${{ secrets.CATALOGUE_DISPATCH_APP_PRIVATE_KEY }}
          owner: kyaulabs
          repositories: prism-adapters
          permission-contents: write

      - name: Dispatch validated adapter release
        env:
          GH_TOKEN: ${{ steps.publisher-token.outputs.token }}
          RELEASE_VERSION: ${{ needs.publish.outputs.version }}
          MERGE_SHA: ${{ needs.publish.outputs.merge-sha }}
        run: |
          set -euo pipefail

          if ! printf '%s' "$RELEASE_VERSION" | grep -qE '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'; then
            echo "::error::publisher dispatch requires a stable release version" >&2
            exit 1
          fi
          if ! printf '%s' "$MERGE_SHA" | grep -qE '^[0-9a-f]{40}$'; then
            echo "::error::publisher dispatch requires a validated merge SHA" >&2
            exit 1
          fi

          node - <<'NODE'
          const fs = require('node:fs');

          const payload = {
            event_type: 'prism_adapter_release',
            client_payload: {
              schemaVersion: 1,
              sourceRepository: 'kyaulabs/prism',
              version: process.env.RELEASE_VERSION,
              mergeSha: process.env.MERGE_SHA,
            },
          };
          fs.writeFileSync(
            '.prism-adapter-release-dispatch.json',
            `${JSON.stringify(payload)}\n`,
            {mode: 0o600}
          );
          NODE

          gh api --method POST repos/kyaulabs/prism-adapters/dispatches \
            --input .prism-adapter-release-dispatch.json
```

- [x] **Step 5: Run focused and ownership tests to verify Green**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS with new assertions for exact source, stable gating, post-publication/reconciliation outcomes, least privilege, closed payload, prerelease rejection, malformed-SHA rejection, and visible API failure.

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS; managed workflow update/verification remains atomic and the packaged canonical workflow bytes remain exact.

Run: `cmp -s .github/workflows/release.yml packages/prism-core/config/release.yml`

Expected: exit 0 with no output.

- [x] **Step 6: Refactor and verify the complete task**

Keep the notification as one separate job, retain exact fixed identifiers, and remove any duplicate shell validation only if the extracted-step tests still exercise a fail-closed public seam. Do not extract the four-field payload into a general dispatcher.

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS.

Run: `rg -n 'CATALOGUE_DISPATCH|publisher-token|prism_adapter_release|prism-adapter-release-dispatch' .github/workflows/release.yml packages/prism-core/config/release.yml tests/Shell/release_workflow_test.sh`

Expected: authentication references occur only in the token action/job assertions; the dispatch payload and endpoint are fixed; both workflow copies match.

- [x] **Step 7: Create the terminal implementation commit**

Stage only the approved plan and Task 1 files:

```bash
git add docs/plans/2026-08-29-dispatch-validated-prism-releases.md tests/Shell/release_workflow_test.sh .github/workflows/release.yml packages/prism-core/config/release.yml
```

Then load `conventional-commits` and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "dispatch validated Prism releases" --fixes 464
```

## Plan self-review

- Spec coverage: the plan covers stable-only eligibility, immutable validated outputs, post-Release/post-tag ordering, fixed source and destination, exact closed payload, least-privilege App-token minting, secret isolation, failure visibility, managed canonical parity, and extracted-step tests. Publisher validation, production signing, sequence control, provisioning, and smoke publication remain later epic tasks.
- Placeholder scan: no implementation placeholder remains.
- Interface consistency: workflow output names, notification guards, environment names, event type, and payload fields match across tests and implementation.
- Issue references: the single terminal commit uses `--fixes 464`; no earlier implementation commit exists.
- Adapter command audit: the change is Core/GitHub Actions work. Focused tests use existing repository commands; finalization will run `/check`, which delegates to the active PHP/web adapter gate.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
