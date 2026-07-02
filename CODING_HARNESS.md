# Coding Harness

## Harness Structure

```text
<project>/
├── AGENTS.md                          ← Thin: stack, boundaries, pointers only (~60 lines)
├── opencode.json                      ← Wires instructions + agent definitions + permissions
├── .semgrepignore                     ← Excludes vendor, node_modules, aurora, generated assets
│
├── .github/
│   └── hooks/
│       ├── pre-commit                 ← ENFORCES: lint (PHP/SCSS/JS) + gitleaks
│       └── commit-msg                 ← ENFORCES: commitlint conventional commits
│
├── .opencode/
│   ├── agents/
│   │   ├── tdd.md                     ← TDD: red → green → refactor cycle
│   │   ├── test-audit.md              ← Audit existing test suite quality
│   │   ├── code-review.md             ← ocr review (diff) + ocr scan (full-file)
│   │   ├── resolve-merge-conflicts.md ← Resolve git merge/rebase conflicts
│   │   ├── semgrep.md                 ← SAST: diff audit + full scan (PHP/JS/secrets)
│   │   ├── debug.md                   ← Bug investigation: logs, tests, root cause
│   │   └── docs-writer.md             ← Generate PHPDoc, RCS headers, documentation
│   ├── commands/
│   │   ├── build-assets.md            ← /build-assets: rebuild SCSS + JS minified assets
│   │   └── security.md                ← /security: SAST scan + dependency CVE audit
│   ├── docs/                          ← Additional information for custom agents
│   │   ├── build-pipeline.md          ← SCSS/JS build steps
│   │   ├── conventions.md             ← File naming, commenting, structure
│   │   ├── mocking.md                 ← Mocking guidelines (system boundaries only)
│   │   ├── refactoring.md             ← Refactor-candidate checklist
│   │   └── tests.md                   ← Good vs bad test examples
│   └── skills/
│       ├── audit-deps/                ← On-demand: composer audit + npm audit
│       ├── aurora-page/               ← On-demand: Aurora page template
│       ├── conventional-commits/      ← On-demand: Conventional commit messages
│       ├── pest-browser/              ← On-demand: browser test setup
│       ├── rcs-header/                ← On-demand: RCS format rules
│       └── scss-mobile-first/         ← On-demand: responsive CSS rules
│
└── docs/                              ← (empty — convention docs live in .opencode/docs/)
```

## Built-in OpenCode Features

OpenCode ships with features that require no custom configuration. These are always
available alongside the custom agents and skills above.

### Primary Agents (Tab to switch)

| Agent | Purpose |
|---|---|
| **Build** | Default mode — full tool access for development |
| **Plan** | Restricted mode — analysis and planning, no file changes |

Press **Tab** to switch between Build and Plan during a session. Use Plan to discuss
approach, explore architecture, and iterate on designs without making changes. When
ready to implement, Tab back to Build.

Plan mode is also restricted from invoking code-modifying subagents (`@tdd`,
`@resolve-merge-conflicts`, `@debug`) — it can only invoke read-only/audit agents
(`@test-audit`, `@code-review`, `@semgrep`, `@explore`, `@scout`, `@docs-writer`).

### Built-in Subagents

| Agent | Purpose |
|---|---|
| **Explore** | Read-only codebase exploration — file patterns, keyword search |
| **Scout** | External docs + dependency research (clones upstream repos) |
| **General** | Multi-step research, full tool access |

Invoke via `@mention`: `@explore find the auth implementation`.

### Custom Slash Commands

| Command | Purpose |
|---|---|
| `/build-assets` | Rebuild minified CSS and JavaScript from SCSS/JS sources |
| `/security` | Run `@semgrep` SAST scan + `audit-deps` CVE check in one pass |

### Built-in Slash Commands

| Command | Purpose |
|---|---|
| `/init` | Analyze project and generate AGENTS.md |
| `/undo` | Revert the last change made by the agent |
| `/redo` | Redo a previously undone change |
| `/share` | Create a shareable link to the current conversation |
| `/help` | Show available commands and help |
