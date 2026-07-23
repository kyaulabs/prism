<!-- $KYAULabs: lsp.md kyau@nova 2026/07/08 -0700 Exp $ -->

# LSP Configuration

## Overview

This project has opencode's LSP integration enabled, providing real-time diagnostics, IntelliSense, and code intelligence.

## Enabled LSP Servers

| Server | Type | Extensions | Source | Notes |
|---|---|---|---|---|
| PHP Intelephense | Built-in | `.php` | Auto-installs | Premium features require license key at `%USERPROFILE%/intelephense/license.txt` (Windows) or `$HOME/intelephense/license.txt` (Linux/macOS) |
| TypeScript | Built-in | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | `typescript` devDependency | Reads `tsconfig.json` for module resolution; `checkJs: false` (eslint LSP handles JS linting) |
| ESLint | Built-in | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue` | `eslint` devDependency | Reads `eslint.config.mjs` flat config |
| Bash | Built-in | `.sh`, `.bash`, `.zsh`, `.ksh` | Auto-installs `bash-language-server` | Complements `.shellcheckrc` |
| YAML | Built-in | `.yaml`, `.yml` | Auto-installs Red Hat `yaml-language-server` | Covers `.github/workflows/ci.yml`, `.semgrep/kyaulabs.yml`, etc. |
| Stylelint | Custom | `.css`, `.scss` | `@stylelint/language-server` devDependency | Official server; resolves project's stylelint ^17 at runtime |

## Disabled LSP Servers

| Server | Reason |
|---|---|
| Deno | Conflicts with TypeScript LSP on same extensions (`.ts`, `.js`, `.mjs`). Project is not a deno project (no `deno.json`, uses npm/node_modules). Deno is globally installed on the dev machine, so opencode would auto-start it without the explicit `disabled: true` override. |

## Configuration

```json
{
    "lsp": {
        "deno": { "disabled": true },
        "stylelint": {
            "command": ["npx", "@stylelint/language-server", "--stdio"],
            "extensions": [".css", ".scss"]
        }
    }
}
```

Setting `lsp` to an object (rather than `true`) keeps all built-in servers enabled by default while allowing per-server overrides and custom servers.

## Experimental LSP Tool (Agent Code Intelligence)

The `lsp` tool (separate from LSP servers) lets agents perform code intelligence operations: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`.

### Enabling the LSP Tool

The LSP tool is experimental and requires an environment variable.

**Windows (PowerShell — persistent, user-level):**
```powershell
[Environment]::SetEnvironmentVariable("OPENCODE_EXPERIMENTAL_LSP_TOOL", "true", "User")
```

**Windows (Command Prompt — persistent, user-level):**
```cmd
setx OPENCODE_EXPERIMENTAL_LSP_TOOL true
```

**Linux/macOS (add to `~/.bashrc` or `~/.zshrc`):**
```bash
export OPENCODE_EXPERIMENTAL_LSP_TOOL=true
```

After setting the env var, restart opencode. Alternatively, `OPENCODE_EXPERIMENTAL=true` enables all experimental features (including the LSP tool).

### Agent Permissions

The top-level `permission.lsp` is set to `"deny"` in `opencode.jsonc` — agents
must explicitly opt in to LSP access. The guiding principle: LSP `allow`
belongs on agents that **write PHP or navigate code semantically**
(Intelephense premium fills the gap left by the absence of `psalm`/`phpstan`
in `composer.json`). LSP `deny` belongs on agents that are **read-only and
delegating** (`plan`, `@architect`), agents that **shell out to a dedicated
analyzer CLI** (`@code-review`→`ocr`, `@semgrep`→`semgrep`,
`@test-audit`→`pest`), agents that **already run every CLI tool themselves**
(`@resolve-merge-conflicts`), and **text-only utilities** (`compaction`,
`title`, `summary`, `judge`).

| Agent | LSP | Defined in | Rationale |
|---|---|---|---|
| `build` | `allow` | `opencode.jsonc` | Primary implementer; Intelephense provides the only PHP static analysis (no psalm/phpstan) |
| `design` | `allow` | `opencode.jsonc` | Write-capable primary agent (ADR-0030); gathers live-code context during spec authorship and prototype exploration |
| `explore` | `allow` | `opencode.jsonc` | Codebase navigation is its core job |
| `general` | `allow` | `opencode.jsonc` | Catch-all with full tool access; occasional code work justifies it |
| `chat` | `allow` | `opencode.jsonc` | Read-only conversational tab; LSP aids code explanation and Q&A on the UTILITY tier |
| `@tdd` | `allow` | `.opencode/agents/tdd.md` | Workhorse implementer; Red→Green `pest` loop is the deterministic truth source that overrides stale LSP diagnostics |
| `@debug` | `allow` | `.opencode/agents/debug.md` | `incomingCalls`/`outgoingCalls`/`findReferences` answer "who calls this buggy function" that `grep` can't |
| `@docs-writer` | `allow` | `.opencode/agents/docs-writer.md` | Intelephense hover gives accurate param/return types for PHPDoc generation |
| `plan` | `deny` | `opencode.jsonc` | Read-only by design; delegates LSP queries to `@explore` |
| `@architect` | `deny` (inherited) | — | Focused on `CONTEXT.md` + ADRs; live-code spelunking is `@explore`'s job |
| `@code-review` | `deny` (inherited) | — | Delegates all analysis to the `ocr` CLI tool |
| `@semgrep` | `deny` (inherited) | — | Delegates all analysis to the `semgrep` CLI |
| `@test-audit` | `deny` (inherited) | — | `pest --coverage` is its source of truth |
| `@resolve-merge-conflicts` | `deny` (inherited) | — | Mid-merge working tree is worst-case out-of-sync for LSP; all CLI tools already wired |
| `compaction` | `deny` (inherited) | — | Text-only utility on flash model |
| `title` | `deny` (inherited) | — | Text-only utility on flash model |
| `summary` | `deny` (inherited) | — | Text-only utility on flash model |
| `judge` | `deny` (inherited) | — | Read-only evaluation judge; no code involvement |

## Auto-Download Behavior

Opencode auto-downloads and installs LSP servers that are marked "auto-installs" (intelephense, bash-language-server, yaml-language-server) on first use when a matching file extension is opened.

To disable auto-downloads (not recommended for this project, but useful for air-gapped or restricted-network environments):

```bash
export OPENCODE_DISABLE_LSP_DOWNLOAD=true
```

## Troubleshooting

### LSP server not starting

1. Check that the prerequisite is met (e.g., `typescript` in `node_modules`, `eslint` in `package.json` devDependencies).
2. Run `/doctor` — it now includes LSP server prerequisite checks.
3. Check that the file extension matches a configured server.
4. Restart opencode after config changes (config is loaded once at startup).

### Stylelint LSP not providing diagnostics

1. Verify `@stylelint/language-server` is installed: `npx @stylelint/language-server --version`
2. Verify `.stylelintrc.json` exists at project root.
3. The server resolves stylelint from the project directory — ensure `stylelint ^17` is in devDependencies.

### TypeScript LSP showing noisy diagnostics

The `tsconfig.json` has `checkJs: false` and `strict: false` to minimize noise. If you're getting too many diagnostics, verify these settings haven't been changed.

### Deno LSP starting despite being disabled

Ensure the `deno` server is explicitly disabled in `opencode.jsonc` as shown in the Configuration section. Since `deno` is globally installed, opencode may auto-start it without this override.

## Intelephense License (Optional)

PHP Intelephense offers premium features (deeper analysis, additional diagnostics) through a license key. To enable:

1. Obtain a license key from https://intelephense.com/
2. Place ONLY the key in a text file at `%USERPROFILE%/intelephense/license.txt` (Windows) or `$HOME/intelephense/license.txt` (Linux/macOS)
3. Restart opencode.

The free tier works without a license key — premium features are optional.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
