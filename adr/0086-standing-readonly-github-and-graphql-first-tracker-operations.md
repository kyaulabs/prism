# 0086. Standing read-only GitHub access and GraphQL-first tracker operations

Date: 2026-08-25

## Status

Accepted

Extends ADR-0085. Supersedes the tracker transport assumptions retained from
ADR-0020 and ADR-0052 where they prefer `gh issue` convenience mutations or the
REST issue-field-values endpoint. It does not broaden tracker mutation scope,
publication authority, credential access, or non-GitHub network consent.

## Context

Prism's tracker workflows still ask whether read-only `gh` access may inspect
repository and issue metadata even though those reads are necessary to perform
the workflow the user already selected. The global external-API instruction is
broad enough to trigger this redundant question.

Routine issue mutations also use several transports. Issue creation begins with
`gh issue create`, field values use a REST endpoint, labels and relationships
use `gh issue edit`, and GraphQL is used only for selected operations or as a
retry. In practice the convenience and REST paths can fail while an immediate
GraphQL retry succeeds. The REST issue-field-values endpoint additionally
expects a single-select option name in cases where discovery returned both a
numeric database ID and a name, producing HTTP 422 when the ID is sent.

The GitHub GraphQL schema exposes bounded mutations for issue creation, update,
type assignment, field values, labels, comments, closes, assignments,
sub-issues, and blocking edges. GraphQL inputs also support atomic issue
creation with type, fields, labels, and parent metadata. A single canonical
transport reduces partial state and removes version-dependent CLI behavior.

Tracker titles, bodies, comments, labels, and API output remain untrusted data.
Embedding them in shell heredocs exposes Markdown backticks and substitution
syntax to the safety parser and violates the safety-compatible instruction
contract. The transport must preserve inert payload handling without weakening
the safety extension.

## Decision

We establish standing read authorization for GitHub repository and tracker
metadata accessed through the `gh` CLI by an active Prism workflow. Agents do
not ask before `gh repo`, `gh issue`, `gh label`, or read-only `gh api` calls
needed to inspect the active repository or tracker state.

This authorization is limited to metadata reads. It does not authorize code or
review egress, mutation, credential access, arbitrary external APIs,
pull-request publication, releases, projects, repository administration, Git
network operations, push, or merge.

GraphQL becomes the first and canonical transport for workflow-authorized issue
mutations:

- `createIssue` creates an issue with its confirmed type, field values, labels,
  assignees, and parent metadata in one mutation where supported;
- `updateIssue` applies existing-issue metadata and field updates;
- `updateIssueIssueType` or the equivalent typed `updateIssue` input sets the
  issue type;
- `setIssueFieldValue` is used when a dedicated field mutation is required;
- `addLabelsToLabelable`, `addComment`, `closeIssue`,
  `addAssigneesToAssignable`, `addSubIssue`, and `addBlockedBy` own their
  respective operations.

The REST issue-field-values endpoint and `gh issue edit/comment/close`
convenience mutations are not canonical retries or first attempts in Prism
tracker workflows. Label-definition creation and editing may continue through
`gh label create/edit` because those operations manage repository label
objects rather than applying issue metadata.

All repository, issue, type, field, option, label, and actor node identities are
discovered dynamically. No repository-specific identifiers are embedded in
harness resources. GraphQL inputs use node IDs or string names according to the
schema field type; single-select option names are never replaced with numeric
database IDs in string-valued inputs.

Payloads containing tracker content are serialized as inert JSON under the
project-local `.pi/tmp/` area using Pi file tools. The agent invokes GraphQL
with a literal project-local input path in a separate simple command. It does
not place tracker content, heredocs, command substitution, or shell-generated
JSON in agent-visible Bash source.

ADR-0085 remains authoritative for mutation authorization. Wayfinder invocation
or continuation is itself the complete authorization for its routine map
lifecycle. A ticketing preview confirmation authorizes its displayed batch.
Neither workflow asks again to claim, display exact mutations, close, comment,
correct, or advance within the active scope.

## Consequences

**Positive:**

- Read-only tracker inspection proceeds without redundant permission prompts.
- Issue metadata is created or updated through one stable transport on the
  first attempt.
- Atomic create inputs reduce partial issue state and recovery halts.
- Field-value type requirements are explicit and the known HTTP 422 path is
  removed from canonical workflows.
- Tracker payloads remain inert and compatible with the safety instruction
  contract.

**Negative:**

- Prism depends on the reviewed GitHub GraphQL schema names and input shapes;
  schema evolution requires fixture and contract maintenance.
- JSON input preparation is more verbose than convenience CLI flags.
- Standing read authorization is broader than invocation-by-invocation network
  prompts, so its GitHub-metadata-only scope must remain explicit.

**Neutral:**

- GitHub remains an external delegated tracker boundary.
- Authentication failures, ambiguous concurrent state, and operations outside
  ADR-0085 still halt.
- Humans remain solely responsible for branch publication and pull-request
  merge.

## Alternatives Considered

### Keep convenience commands and retry with GraphQL

Rejected. The first failure still interrupts workflows, may leave partial state,
and trains agents to discover the correct transport only after user-directed
retry.

### Fix only the REST single-select value spelling

Rejected. It addresses one HTTP 422 response but retains mixed transports,
version-dependent CLI behavior, and partial issue creation.

### Grant standing global GitHub mutation consent

Rejected. ADR-0085 deliberately bounds mutations to a selected workflow or
confirmed batch. Only metadata reads receive standing authorization.

### Add a tracker custom tool or second extension

Rejected by ADR-0055 and ADR-0056. Skills plus the existing `gh` boundary are
sufficient when payloads and commands are shaped safely.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
