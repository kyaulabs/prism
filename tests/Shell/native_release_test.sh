#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
# Execute the actual workflow steps, not a separate publisher implementation.
node - "$ROOT/.github/workflows/release.yml" "$fixture" <<'NODE'
const fs=require('node:fs'),yaml=require('js-yaml');
const workflow=yaml.load(fs.readFileSync(process.argv[2],'utf8'));
if(!workflow.on.pull_request?.types.includes('closed') || !workflow.on.workflow_dispatch) throw Error('Missing release-on-merge/recovery triggers');
const steps=workflow.jobs.publish.steps.filter(step=>step.run);
fs.writeFileSync(process.argv[3]+'/validate.sh',steps[0].run);
fs.writeFileSync(process.argv[3]+'/publish.sh',steps[1].run);
NODE
cd "$fixture"
git init -q
git -c core.hooksPath=/dev/null -c commit.gpgsign=false -c user.name=Fixture -c user.email=fixture@example.invalid commit --allow-empty -qm fixture
export MERGE_SHA
MERGE_SHA=$(git rev-parse HEAD)
git update-ref refs/remotes/origin/main "$MERGE_SHA"
mkdir -p packages/{prism-core,prism-php-web} bin state
for name in prism-core prism-php-web; do
  printf '{"name":"@kyaulabs/%s","version":"1.0.1"}\n' "$name" > "packages/$name/package.json"
done
printf '# Changelog\n\n## [1.0.1](url)\n\nRelease notes.\n\n## [1.0.0](url)\n\nOld notes.\n' > CHANGELOG.md
export EVENT_NAME=pull_request HEAD_REF=release/1.0.1 VERSION_INPUT=''
export RUNNER_TEMP="$fixture" GITHUB_ENV="$fixture/environment" GITHUB_REPOSITORY=fixture/prism
bash validate.sh
set -a
# shellcheck source=/dev/null
source "$GITHUB_ENV"
set +a
grep -q '^Release notes\.$' "$NOTES_DIR/body.md"
! grep -q 'Old notes' "$NOTES_DIR/body.md"
cat > bin/gh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ ${DENIED:-no} == yes ]]; then echo 'gh: Forbidden (HTTP 403)' >&2; exit 1; fi
if [[ "$1" == release ]]; then
  touch state/release
  printf '%s\n' "$*" >> mutations
elif [[ "$2" == --method ]]; then
  tag="${6#ref=refs/tags/}"
  touch "state/$tag"
  printf '%s\n' "$*" >> mutations
elif [[ "$2" == */git/ref/tags/* ]]; then
  tag="${2##*/}"
  if [[ ! -f "state/$tag" ]]; then echo 'gh: Not Found (HTTP 404)' >&2; exit 1; fi
elif [[ "$2" == */commits/refs/tags/* ]]; then
  if [[ ${CONFLICT:-no} == yes ]]; then printf '%040d\n' 0; else echo "$MERGE_SHA"; fi
elif [[ "$2" == */releases/tags/* ]]; then
  if [[ ! -f state/release ]]; then echo 'gh: Not Found (HTTP 404)' >&2; exit 1; fi
else exit 2
fi
SH
chmod +x bin/gh
export PATH="$fixture/bin:$PATH"
bash publish.sh
[[ $(wc -l < mutations) == 4 ]]
bash publish.sh
[[ $(wc -l < mutations) == 4 ]]
if CONFLICT=yes bash publish.sh; then echo 'Wrong-target tag accepted' >&2; exit 1; fi
if DENIED=yes bash publish.sh; then echo 'HTTP 403 treated as absence' >&2; exit 1; fi
[[ $(wc -l < mutations) == 4 ]]
for bad in 'release/01.0.1' 'release/1.0.1-01' 'release/$(touch injected)'; do
  if HEAD_REF="$bad" bash validate.sh; then echo 'Invalid version accepted' >&2; exit 1; fi
done
[[ ! -e injected ]]
if MERGE_SHA=0000000000000000000000000000000000000000 bash validate.sh; then echo 'Wrong merge accepted' >&2; exit 1; fi
EVENT_NAME=workflow_dispatch VERSION_INPUT=1.0.1 bash validate.sh
printf '{"name":"@kyaulabs/prism-core","version":"0.0.0"}\n' > packages/prism-core/package.json
if bash validate.sh; then echo 'Mismatched package accepted' >&2; exit 1; fi
echo 'PASS native release: merged/recovery inputs, notes, three tags, idempotency, conflicts, API failure, injection and package mismatch'
