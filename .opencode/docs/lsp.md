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

| Agent | LSP Tool Permission | Rationale |
|---|---|---|
| `build` | `allow` | Primary build agent benefits from go-to-definition and find-references during implementation |
| `explore` | `allow` | Exploration agent uses LSP queries for codebase navigation |
| `plan` | `deny` | Plan mode is read-only; no LSP queries needed |

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

Ensure the `deno` server is explicitly disabled in `opencode.json` as shown in the Configuration section. Since `deno` is globally installed, opencode may auto-start it without this override.

## Intelephense License (Optional)

PHP Intelephense offers premium features (deeper analysis, additional diagnostics) through a license key. To enable:

1. Obtain a license key from https://intelephense.com/
2. Place ONLY the key in a text file at `%USERPROFILE%/intelephense/license.txt` (Windows) or `$HOME/intelephense/license.txt` (Linux/macOS)
3. Restart opencode.

The free tier works without a license key — premium features are optional.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
