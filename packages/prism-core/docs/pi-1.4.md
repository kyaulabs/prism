# Pi 1.4 compatibility and migration

Prism's tested host baseline is **Pi 1.4.0**, upstream tag commit
`4a080252f06caf63a525d7873c5d94d3c23887e0` (October 21, 2026). Node remains
**22.19.0+**, matching Pi's engine requirement. Root development dependencies
pin the SDK and test-only pi-ai to 1.4.0 and TypeBox to 1.3.27. Core's SDK and
TypeBox host peers remain `"*"`, as [Pi packages][packages] requires; neither is
bundled. Earlier hosts are not this upgrade's verified baseline.

Prism package versions are independent of Pi. The 1.0.0 packages are published;
this upgrade is Prism 1.1.0. Both packages use 1.1.0 for the repository's current
release workflow; PHP/web behavior is unchanged. Registry publication is manual.
Until 1.1.0 is published, use the verified checkout installation below instead of
expecting an npm update to contain these changes.

Core remains global and language-agnostic. PHP/web remains an ordinary
project-local module. No host fork, model router, prompt hook, MCP manager,
compactor, launcher, workflow service, or replacement global reminder is added.
Core's concise `AGENTS.md` contract is unchanged.

## Upgrade Pi without switching installation methods

First inspect `pi --version`, the executable (`command -v pi` or `Get-Command pi`),
and its package-manager/managed-install origin. Do not assume a global pnpm
store layout. Use docs from that version: the public `getPackageDir()`,
`getDocsPath()` and `getExamplesPath()` SDK helpers locate them. See the
`pi-docs` skill and [Pi quickstart][quickstart].

| Existing installation | Upgrade command |
| --- | --- |
| Managed pi.dev installation | `pi update`, then verify `pi --version`; this follows the managed stable release, not a requested version pin |
| npm global | `npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0` |
| pnpm global | `pnpm add -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0` |
| Other package manager / Nix | Keep that manager and its release/pinning mechanism; e.g. `nix profile upgrade pi` follows stable, or select `github:earendil-works/pi/v1.4.0` when pinning |

The development machine was detected as **pnpm global**, already running 1.4.0;
no global Pi update was performed. Managed/Nix update commands are upstream
guidance, not operations performed on a user's installation. Restart Pi after
updating the host, especially if its old package files were removed while it
was running. `/reload` replaces extensions; it does not replace the running
host executable.

## Migrate copied context explicitly

`pi update --extensions` updates installed Pi packages. `pi update <source>`
updates one configured source; a pinned npm version remains pinned. These
native operations **do not run Prism's context helper** and cannot remove a
previously copied file outside the package.

After npm 1.1.0 publication, from a shell using the intended Pi configuration:

```bash
# Keep PI_CODING_AGENT_DIR exported if you use a non-default directory.
pi install npm:@kyaulabs/prism-core@1.1.0
PRISM_CORE_SOURCE=npm:@kyaulabs/prism-core@1.1.0 \
  bash "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/npm/node_modules/@kyaulabs/prism-core/scripts/install-global.sh"
```

The second install inside the helper is harmless and makes local/npm source
reconciliation explicit. It preserves selected package options and carries
existing resource filters to an otherwise unfiltered replacement source.
Conflicting old options with no explicit selected configuration stop
reconciliation instead of guessing. Resolve those entries in the selected
`settings.json`, then retry. Unknown settings and unrelated packages survive.

From a current checkout, run at the Prism repository root:

```bash
bash packages/prism-core/scripts/install-global.sh
```

To refresh context without any package installation or source/settings edits:

```bash
node packages/prism-core/scripts/deploy-context.js packages/prism-core
```

An installed package can likewise use its own `scripts/deploy-context.js` with
its package root. An optional second argument selects the destination; otherwise
it uses `PI_CODING_AGENT_DIR`, then `~/.pi/agent`. The installer uses the same
selection. It never scans arbitrary projects or home directories.

After either helper, `/reload` or restart Pi to discard the loaded old context
and extension instances. Restart is required if Pi itself was upgraded.
These commands were exercised in temporary agent directories with real Pi 1.4
package commands; npm registry installation was a deterministic local boundary.
No live user configuration was migrated by the tests.

### Ownership and failure rules

Only these exact markers establish ownership:

```html
<!-- prism-core:begin APPEND_SYSTEM.md do not edit; managed by install-global.sh -->
<!-- prism-core:end APPEND_SYSTEM.md -->
```

- A missing reminder is a no-op. A single ordered pair removes only the bytes
  from the begin marker through the end marker.
- The file is deleted only when those bytes are the entire file, optionally
  followed by the old installer's **one LF**. No trim-based deletion is used.
- In a mixed file, **every outside byte** survives, including comments,
  whitespace, CRLF and non-UTF8 bytes. Unmarked user text or old-looking Prism
  prose is never guessed to be owned.
- Partial, reversed or duplicate markers, symlinks and nonregular files are
  preserved and rejected with the precise path/problem, never their contents.
- Both context plans are validated before writing. Private exclusive temporary
  files, existing permissions, file identity/content/metadata rechecks, and
  cleanup protect ordinary updates. Do not edit context concurrently with the
  helper: checks are optimistic, not an OS-level sandbox or atomic compare/delete.
- `AGENTS.md` is merged first, then legacy cleanup runs. This is **not a two-file
  transaction**. A later I/O/concurrent-edit failure names completed changes,
  does not claim rollback, and permits a safe retry. Package/settings operations
  earlier in `install-global.sh` are separate too.

Fresh archives contain no `APPEND_SYSTEM.md` and fresh installs do not create
one. User-owned Pi system-prompt files remain valid native Pi capabilities;
Prism does not create replacements elsewhere.

## Adoption matrix

Evidence is the [shipped 1.4 changelog][changelog], reviewed from 0.85.1 through
1.4.0, the versioned docs below, SDK typechecking, and the maintained
`pi-host*.test.ts` / `pi-install.test.js` fixtures. "Native" rows describe Pi's
contract, not claims that paid providers, UI hardware or live accounts were tested.

| Capability / releases | Classification | Prism treatment and evidence |
| --- | --- | --- |
| Codemode, discovery, output schemas (0.99–1.2), parallel calls and worker queue (1.3–1.4) | Implementation + compatibility | Typed, bounded web `structuredContent`; native validation/discovery, thrown-failure, parallel, abort and deadline tests. Leave scheduling, memory, queuing and worker limits to [Codemode][codemode]. |
| Native MCP, deferred tools, project overrides and OAuth (0.99–1.2) | Compatibility + optional native | Real harmless stdio fixture checks discovery/calls, reload/resume and branch activation. Native project overrides and OAuth stay in [Pi MCP][mcp]; no competing manager, accounts or servers are auto-configured. OAuth/network account flows are not exercised. |
| Tool wildcards / `--no-mcp` (1.0.4), `+name`/`-name` (1.1/1.3), defaultTools / reload / resume / tree | Compatibility | Native wildcard/exclusion, modifier, branch, reload and resume fixtures; no activation handler. `--no-mcp` is a native [CLI][cli] disable, not a Prism policy. Respect resource filters and explicit selections; see lifecycle limits below. |
| Virtual models and classifiers (0.99), image generation (1.0), image classifiers (1.1/1.4) | Optional native | Use [models][models] and [Codemode][codemode] when a task benefits. Skills may point to those APIs on demand. No automatic routing, providers, paid service requirements or image subsystem. |
| Prompt caching/warming and transcript deltas (0.86), tool deltas (1.0.1), thinking/model switching (1.3) | No runtime change | Delete duplicated global context; keep stable concise contributions. [Settings][settings] and Pi own caching, model selection and transcript updates. No global defaults imposed. |
| Fullscreen / quiet startup (1.0), themes (0.99/1.2), clipboard / status (1.1/1.2), Rex (1.4) | No Prism change | Inherit native UI. Current extensions have no custom renderer or UI layer to migrate. Hardware/terminal behavior is not tested here. |
| Canonical context / session recovery (0.86–0.87), summaries (1.4) | No runtime change | Pi owns compaction, branches and recovery. `compaction.reserveTokens` is the free-context trigger, **not a summary output cap**; 1.4 summaries use the model output limit. No custom summarizer. |
| Settings/model/theme/keybinding schemas (1.2), generated models reference (1.4) | Implementation/docs | Add the official settings schema to maintained settings and dogfood examples without changing resource paths. No shipped model/theme/keybinding files need schema edits. [Models configuration][models-config] is authoritative; Prism web config is a separate format. |
| Provider IDs / endpoints / auth changes (0.86–1.4) | Compatibility audit | No shipped personal provider/model settings or obsolete Azure/Kimi examples found. Native Azure provider is now `azure` (not the API name `azure-openai-responses`); Kimi custom base URLs now include `/v1`. Leave credential migration and provider choices to Pi/user; no private auth files inspected. |
| Radius and selectable sharing destinations (1.0/1.3) | Optional native | User may choose native login, MCP and `/share`; do not sign in or upload sessions automatically. Review session contents before sharing. |
| Managed install / Nix / package-manager layouts (1.0.1–1.4) | Documentation + compatibility | Resolve docs from the actual host; retain installation method. Local/npm install, switching, custom directory and refresh tests use real Pi package commands. |
| Extension events/API (0.86–1.4) | Compatibility | Only `session_start` and `tool_call` handlers are present. SDK-checked handlers need no event migration. No `before_agent_start`, provider-header, custom compaction/provider or renderer handler exists; none is added for demonstration. |
| PowerShell native tool | Implementation | Separate path/operand handling, Windows lexical/alias/additional-prefix fixtures and native direct/nested dispatch checks with synthetic system operations. Not Bash tokenization; not a Windows OS execution test. |
| Pi Durable | Separate future architecture | Not adopted. A durable execution architecture would need its own requirements and decision, outside this Lean upgrade. |

### Native lifecycle limits

Pi 1.4.0 reload re-registers default-active extension tools, including ones
disabled only by an in-memory `setActiveToolsByName()` call. Use durable package
resource filters or explicit `--tools` / `--exclude-tools` selections when
resources must remain disabled across reload. The host fixture records this
behavior; Prism does not patch the host to conceal it.

Deferred MCP servers connect asynchronously. A previously declared tool is
restored if it registers before the next prompt records its loadout. Otherwise
it remains natively discoverable/callable from Codemode; use native discovery
to declare it again. The resume fixture waits for registration before checking
restored activation. Arbitrary MCP interfaces are not automatically understood
by Prism's best-effort credential guard; see the safety README.

## Verification

At the repository root:

```bash
npm ci --ignore-scripts
npm run typecheck
npm run test:host
npm run test:node
bash packages/prism-core/scripts/validate-harness.sh
bash tests/Shell/run-all.sh
```

Host tests use the actual installed SDK, temporary agent/project directories,
in-memory synthetic auth/provider streams, bounded transport/process fakes,
and a local stdio MCP subprocess. Packed-resource tests use the built archive
with already-installed extraction dependencies supplied offline. They require
no paid model calls or live-user migration. Linux/macOS CI loads packed resources
under Pi 1.4.0. See extension READMEs for web contracts and protection limits.

[changelog]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/CHANGELOG.md
[packages]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md
[quickstart]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/quickstart.md
[codemode]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md
[mcp]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/mcp.md
[models]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/models.md
[models-config]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/models-configuration.md
[settings]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/settings.md
[cli]: https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md
