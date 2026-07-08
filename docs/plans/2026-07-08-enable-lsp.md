<!-- $KYAULabs: 2026-07-08-enable-lsp.md kyau@nova 2026/07/08 -0700 Exp $ -->

# LSP Enablement & Configuration Implementation Plan

> **For agentic workers:** This plan is primarily configuration and documentation — not testable code. Tasks use a Make→Verify cycle instead of Red→Green→Refactor. Use `@docs-writer` for documentation tasks and direct execution for config changes. Each task ends with a verification step and a signed commit.

**Goal:** Enable opencode's LSP integration with all applicable language servers for this PHP/JS/SCSS/Shell/YAML project, configure agent permissions for the experimental LSP tool, and document everything.

**Architecture:** Enable LSP via the top-level `lsp` key in `opencode.json`. Use opencode's built-in LSP servers for PHP (intelephense), JS/TS (typescript), JS linting (eslint), shell (bash), and YAML (yaml-ls). Add a custom LSP server entry for stylelint using the official `@stylelint/language-server`. Explicitly disable the deno LSP to prevent extension conflicts with typescript LSP. Enable the experimental LSP tool for `build` and `explore` agents via the `OPENCODE_EXPERIMENTAL_LSP_TOOL` env var + per-agent permission grants.

**Tech Stack:** opencode LSP subsystem, `typescript` (new devDependency), `@stylelint/language-server` (new devDependency), existing `eslint ^10`, existing `stylelint ^17`.

## Global constraints

- **Platform:** Windows (win32) — env vars set via `setx` or System Properties
- **Indentation:** PHP 4-space, SCSS 2-space, JS tabs, TS 4-space (per `conventions.md`)
- **RCS headers:** Every new source file gets an RCS-style header + vim modeline (per `rcs-header` skill)
- **Lockfiles:** `package-lock.json` must be regenerated and committed after dependency changes
- **No `.env` commits:** The `OPENCODE_EXPERIMENTAL_LSP_TOOL` env var is documented in AGENTS.md and `.opencode/docs/lsp.md`, NOT in `.env.example` (which is for the PHP application only)
- **Signed commits:** All commits use `git commit -S` with Plan-by/Acked-by/Signed-off-by footers
- **Conventional Commits:** `feat(lsp):` scope for config changes, `docs(lsp):` for documentation

## LSP Server Selection Summary

| Server | Type | Extensions | Status | Rationale |
|---|---|---|---|---|
| `php intelephense` | Built-in | `.php` | **Enable** | Core language; auto-installs |
| `typescript` | Built-in | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | **Enable** | Install `typescript` devDep; provides IntelliSense |
| `eslint` | Built-in | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue` | **Enable** | `eslint ^10` already installed |
| `bash` | Built-in | `.sh`, `.bash`, `.zsh`, `.ksh` | **Enable** | Project has shell scripts + `.shellcheckrc` |
| `yaml-ls` | Built-in | `.yaml`, `.yml` | **Enable** | CI workflows, semgrep config, GitHub config |
| `stylelint` | **Custom** | `.css`, `.scss` | **Enable** | Official `@stylelint/language-server`; resolves project's stylelint 17 |
| `deno` | Built-in | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` | **Disable** | Conflicts with typescript LSP on same extensions; project is not a deno project |

---

### Task 1: Install npm dependencies

**Files:**
- Modify: `package.json` (add devDependencies)
- Modify: `package-lock.json` (regenerate)

**Interfaces:**
- Produces: `typescript` in `node_modules` (required by typescript LSP built-in), `@stylelint/language-server` in `node_modules` (required by custom stylelint LSP config in Task 3)

- [ ] **Step 1: Install typescript and @stylelint/language-server as devDependencies**

```bash
npm install --save-dev typescript @stylelint/language-server
```

- [ ] **Step 2: Verify both packages are in package.json devDependencies**

```bash
node -e "const p=require('./package.json'); console.log('typescript:', p.devDependencies.typescript); console.log('@stylelint/language-server:', p.devDependencies['@stylelint/language-server'])"
```

Expected: Both print version strings.

- [ ] **Step 3: Verify package-lock.json was updated**

```bash
git diff --stat package-lock.json
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -S -m "chore(deps): add typescript and @stylelint/language-server for LSP

typescript enables the built-in typescript LSP server for .ts/.js files.
@stylelint/language-server provides SCSS/CSS diagnostics via a custom
LSP server entry in opencode.json.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Create minimal tsconfig.json

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "allowJs": true,
        "checkJs": false,
        "strict": false,
        "noEmit": true,
        "skipLibCheck": true,
        "lib": ["ES2022", "DOM"]
    },
    "include": [
        "cdn/js/**/*.js",
        ".github/scripts/**/*.js",
        ".opencode/plugins/**/*.ts",
        "eslint.config.mjs",
        "commitlint.config.js"
    ],
    "exclude": [
        "node_modules",
        "vendor",
        "aurora",
        "cdn/javascript"
    ]
}
```

- [ ] **Step 2: Verify tsconfig.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); console.log('valid')"
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -S -m "feat(lsp): add minimal tsconfig.json for typescript LSP server

Provides module resolution context and include/exclude scope for the
typescript LSP server. checkJs is disabled (eslint LSP handles JS linting);
strict is disabled (project is not TypeScript-first). noEmit prevents
accidental compilation output.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Configure LSP servers and agent permissions in opencode.json

**Files:**
- Modify: `opencode.json` (add `lsp` key, update `build` and `explore` agents)

- [ ] **Step 1: Add the `lsp` key to opencode.json**

Add this top-level key (after `permission` or `instructions`, before `agent`):

```json
"lsp": {
    "deno": {
        "disabled": true
    },
    "stylelint": {
        "command": ["npx", "@stylelint/language-server", "--stdio"],
        "extensions": [".css", ".scss"]
    }
},
```

- [ ] **Step 2: Add `lsp: allow` to the `build` agent's permission block**

```json
"permission": {
    "bash": {
        "*": "allow",
        "git add*": "ask",
        "git stage*": "deny",
        "git commit*": "ask",
        "git push*": "deny"
    },
    "lsp": "allow"
},
```

- [ ] **Step 3: Add a permission block to the `explore` agent**

```json
"explore": {
    "model": "deepseek/deepseek-v4-pro",
    "variant": "max",
    "permission": {
        "lsp": "allow"
    }
}
```

- [ ] **Step 4: Verify the `plan` agent still has `lsp: deny` (do NOT change)**

- [ ] **Step 5: Validate opencode.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('opencode.json','utf8')); console.log('valid')"
```

- [ ] **Step 6: Verify the lsp key and agent permissions are present**

```bash
node -e "const c=require('./opencode.json'); console.log('lsp:', JSON.stringify(c.lsp)); console.log('build.lsp:', c.agent.build.permission.lsp); console.log('explore.lsp:', c.agent.explore?.permission?.lsp); console.log('plan.lsp:', c.agent.plan.permission.lsp)"
```

Expected: build.lsp=allow, explore.lsp=allow, plan.lsp=deny

- [ ] **Step 7: Commit**

```bash
git add opencode.json
git commit -S -m "feat(lsp): enable LSP servers and configure agent permissions

Enable LSP via top-level lsp key with per-server overrides:
- Built-in servers auto-enable: php intelephense, typescript, eslint, bash,
  yaml-ls
- Custom stylelint server via @stylelint/language-server for .css/.scss
- Explicitly disable deno LSP (conflicts with typescript LSP on same
  extensions; project is not a deno project)

Agent permissions:
- build: lsp allow (agents can use go-to-definition, find-references)
- explore: lsp allow (exploration agent benefits from LSP queries)
- plan: lsp deny (unchanged — Plan mode is read-only)

Requires OPENCODE_EXPERIMENTAL_LSP_TOOL=true env var for the lsp tool
to be available to agents. See .opencode/docs/lsp.md for setup.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: Create .opencode/docs/lsp.md reference document

**Files:**
- Create: `.opencode/docs/lsp.md`

Delegate to `@docs-writer`. The document should cover: enabled/disabled servers table, configuration syntax, experimental LSP tool setup (env var + agent permissions), auto-download behavior, troubleshooting, and optional Intelephense license setup. Apply RCS header + vim modeline per rcs-header skill.

**Note:** Include documentation of the `OPENCODE_DISABLE_LSP_DOWNLOAD` environment variable in lsp.md. This variable suppresses automatic LSP server downloads in air-gapped or restricted-network environments.

- [ ] **Step 1: Create the file** (delegate to @docs-writer)
- [ ] **Step 2: Verify RCS header and vim modeline**
- [ ] **Step 3: Commit**

```bash
git add .opencode/docs/lsp.md
git commit -S -m "docs(lsp): add comprehensive LSP configuration reference

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 5: Update AGENTS.md with LSP section

**Files:**
- Modify: `AGENTS.md`

Add a new "## LSP (Language Server Protocol)" section after "Aurora Framework" or after "Linting & Enforcement". Cover: enabled servers, disabled deno LSP, OPENCODE_EXPERIMENTAL_LSP_TOOL env var requirement with Windows/Linux setup commands, cross-reference to .opencode/docs/lsp.md.

- [ ] **Step 1: Add the LSP section**
- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -S -m "docs(lsp): document LSP integration in AGENTS.md

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 6: Update /doctor command with LSP prerequisite checks

**Files:**
- Modify: `.opencode/commands/doctor.md`

Add a new "## 6. LSP servers" section after "## 5. git hooks". Check: PHP (intelephense auto-install), TypeScript (devDependency), ESLint (devDependency), Bash (auto-install), YAML (auto-install), Stylelint (@stylelint/language-server devDependency), Deno (must be disabled in config). Update the Output example table and Rules section. LSP checks are soft-fail.

- [ ] **Step 1: Add LSP section to /doctor**
- [ ] **Step 2: Update Output example table**
- [ ] **Step 3: Update Rules section**
- [ ] **Step 4: Commit**

```bash
git add .opencode/commands/doctor.md
git commit -S -m "docs(lsp): add LSP server prerequisite checks to /doctor

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 7: Final verification

- [ ] **Step 1: Verify all files are committed** (`git status` — clean tree)
- [ ] **Step 2: Verify opencode.json is valid and complete** (run the node validation script)
- [ ] **Step 3: Verify dependencies are installed** (`npx tsc --version`, verify @stylelint/language-server)
- [ ] **Step 4: Verify documentation files exist** (lsp.md, tsconfig.json, ADR)
- [ ] **Step 5: Remind user to set env var and restart opencode**

---

## Post-Implementation Notes

### User actions after execution:

1. **Set the environment variable** (one-time, persistent):
   ```powershell
   [Environment]::SetEnvironmentVariable("OPENCODE_EXPERIMENTAL_LSP_TOOL", "true", "User")
   ```

2. **Restart opencode** — config is loaded once at startup.

3. **First file open triggers auto-install** — intelephense, bash-language-server, yaml-language-server auto-download on first use.

### What this plan does NOT do:

- Does NOT enable the `formatter` config (separate from LSP)
- Does NOT add phpstan or psalm (not installed, not built-in LSP servers)
- Does NOT add prettier (not installed, not used in the project)
- Does NOT modify session-bootstrap.ts plugin (shell.env hook only affects bash child processes, not the opencode process)
- Does NOT include an ADR — considered and skipped per architect review: LSP enablement is easily reversible configuration, not an architectural commitment

### Execution mode: Inline with checkpoints

Tasks execute sequentially. After each task, the user reviews the result before proceeding to the next task. Halt and re-plan if a task fails verification.

---

// vim: ft=markdown sts=4 sw=4 ts=4 et :
