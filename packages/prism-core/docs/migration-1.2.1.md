# Prism 1.2.1 resource migration

Prism 1.2.1 includes breaking resource-surface changes from 1.2.0 despite the
owner-selected patch version; it is not a Pi version upgrade. The host baseline remains Pi 1.5.0. Core, PHP/web and C++ versions move
together; registry publication remains a manual owner action.

| Package | Skills before → after | Prompts before → after |
| --- | --- | --- |
| Core | 38 → 18 | 17 → 13 |
| PHP/web | 14 → 13 | 3 → 3 |
| C++ | 5 → 4 | 1 → 1 |

This reduces source resources from 78 to 52. It is not a measured token, latency
or success-rate improvement: Pi advertises skill metadata and loads bodies on
demand.

## Name changes

| Old skills | Retained entry point |
| --- | --- |
| `brainstorming`, `grilling`, `to-spec` | `brainstorming` |
| `architect`, `systems-design` | `architect` |
| `writing-plans`, `executing-plans`, `wayfinder` | `writing-plans` |
| `code-review`, `receiving-code-review`, `spec-review`, `standards-review` | `code-review` |
| `tracker-operator`, `ticketing`, `from-issue` | `tracker-operator` |
| `docs-writer`, `domain-context` | `docs-writer` |
| `research-background` | `research` |

`explore` and `consult` are removed; inspect code or discuss the request directly.
`teaching` moves into `/teach`. `credential-protection` and
`verification-before-completion` policy live in Core; `/check` is the explicit
verification entry point. `finishing-a-development-branch` mechanics live in
`/pr`, `/release` and Git guidance. Conflict-specific guidance is an optional
reference beside `conventional-commits`; semantic duplication guidance is in the
architecture reference.

## Removed commands and onboarding

`/setup`, `/doctor`, `/setup-labels` and `/setup-rulesets` are removed without
aliases or replacement onboarding. So are `setup`, `setup-php-web` and
`setup-cpp` skills. Install ordinary Pi packages and use project-native commands
as needed. Existing files and tools in consumer projects are not deleted.

`/research --background` remains a manual brief for a separate human-started Pi
session. It does not dispatch an agent. No separate research consent record is
required by Prism; ordinary tool permissions still apply.

## Consumer steps

1. Update package versions together using native Pi package management. Update
   custom prompts and explicit skill/resource filters using the table above;
   removed exact paths will not redirect automatically. An omitted filter loads
   manifest resources; an empty array disables that resource type.
2. Run the installed Core's `scripts/install-global.sh` to refresh the owned
   `AGENTS.md` block. Native discovery alone does not deploy global context.
   The installer preserves consumer text/settings, reconciles Core sources and
   removes only owned legacy append-system material.
3. Reload/restart Pi, inspect discovery diagnostics and check that desired skills,
   prompts and both Core extensions load. Relative references resolve from each
   discovered skill directory, not the consumer working directory.

Core now owns Git authority, mandatory development TDD and its narrow explicit
isolated-experiment exception, review timing and verification evidence. Installing
Core grants no push, PR, merge, publication or unrelated-branch-deletion permission.
Authorized commits require GPG signing, detailed bodies and accurate attribution.
Review runs once per PR/completed milestone before delivery unless waived; each
created PR requires actual current-head Test Plan execution after creation.
Cleanup is limited to task branches confirmed merged without additional work.
Project identities, permissions and required independent reviews remain local.

Safety and bounded web-access behavior are retained. Guards remain backstops, not
proof that arbitrary programs cannot expose secrets. Historical ADRs and prior
migration notes describe their original releases, not additional current gates.
