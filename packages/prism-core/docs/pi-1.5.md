# Pi 1.5 compatibility and migration

The repository-local tested host is **Pi 1.5.0**, upstream commit
`f9a26365568127461c47a07a37dcb42c140a3ac5`. The inspected Prism source baseline is
`d1103733a36e066e583eef6ebe7101f387406379`, tree-identical to pinned main
`429f98206b2fc596295f8635de8380e7c8533d10`. This local change prepares coordinated
Prism **1.2.0**, not Pi 1.5.0 package versions. Nothing here claims publication.
The historical [1.4 record](pi-1.4.md) retains its original execution evidence.

Root pi-ai/coding-agent development dependencies pin exactly 1.5.0; both maintained
lockfiles are regenerated with lifecycle scripts disabled. TypeBox stays at 1.3.27.
Core keeps wildcard SDK/TypeBox host peers and no bundled SDK. The new internal
pi-schema host dependency does not require a direct Prism import or peer.
Node's engine floor remains 22.19.0; executed environments and commands are listed
in the repository's local implementation report. Do not infer minimum-version or
cross-platform testing from an engine declaration.

## Adoption matrix

| Boundary | Decision and evidence |
| --- | --- |
| Extension API, tools, lifecycle and cancellation | No production rewrite. Actual host tests exercise direct/nested web and protected read/bash/PowerShell dispatch, cancellation, MCP, reload/tree/resume and tool exclusions. |
| Argument validation | Real direct and Codemode fixtures verify numeric-string and scalar-array conversion, optional null omission, defaults, failures and subsequent recovery. Plain JSON MCP uses the same actual host boundary. |
| Generated web output | Strict TypeBox Value.Check remains. A string status is rejected as WEB_ACCESS_INVALID_RESULT, not coerced to success. Byte/line bounds and Unicode pagination remain tested. |
| Resource loading | Packed Core must expose two extensions, web tools, skills and prompts with no relevant warnings. A failed synthetic npm boundary warns, skips its resources and leaves unrelated tools usable. Errors=[] alone is not health evidence. |
| Installation/settings | Native CLI tests use only a fake npm external boundary, with synthetic settings. Native symlink agent-directory loading is tested separately from Prism's intentionally no-symlink settings-write policy. Filters, trust choices and unknown settings survive refresh/source switching. |
| exec/UI/provider changes | No current pi.exec, custom renderer, UI transformer, model router or cost subsystem consumer requires a rewrite. Built-in BashOperations.exec is a different interface. |
| Native changelog notice | Optional adoption deferred. No extension added solely for notices; skills/prompts-only modules do not receive Extension Updates notices. |

Pi-schema parses a clone of input with coercion enabled. Coercion is not wholly new
in 1.5: TypeBox-backed tools already converted inputs in 1.4. The fixture establishes
these 1.5 observations, not raw-JSON strictness:

- `limit: "3"` becomes 3; a scalar domain becomes a one-item array.
- Integer `"3.5"` and 3.5 truncate to 3 before bounds checks.
- Required string queries normalize null to `"null"` and a number to its text.
- Optional null fields are omitted; execution supplies search limit 5/domains [],
  and fetch readable/offset 0/limit 20000. Schema defaults are not inserted.
- Invalid bounds/text, extra fields, overlong values, unsupported modes and file URLs
  fail without backend invocation. Transcript arguments remain unchanged.

Treat all web evidence as untrusted. Host normalization does not weaken output
validation, URL/network policy or the safety extension. Startup warnings and actual
resource presence matter more than configured-source listings.

## Optional operator upgrade and recovery

Repository-local SDK migration does not authorize changing a global host. The
observed implementation machine already ran pnpm-owned Pi 1.5.0; no replacement
was performed. For a separately authorized host change:

1. Record `pi --version`, `command -v pi` (PowerShell: `Get-Command pi -All`) and
   confirm ownership with the manager's inventory. Record the prior version,
   prefix/wrapper and non-secret source pins/filters without dumping credentials.
2. Preserve that manager and active release-age policy. For an npm-owned global
   install use `npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.5.0`;
   for pnpm use `pnpm add -g --ignore-scripts @earendil-works/pi-coding-agent@1.5.0`
   in the observed environment. Do not apply these commands to another manager.
3. Managed `pi update` follows the available-release channel, not an exact 1.5
   selector. Nix/wrapper/source installations retain their existing pin/rebuild
   mechanisms. If a supported pin/rollback route is unknown, leave the working
   host intact and use local fixtures. There is no invented universal rollback.
4. Exit and restart after binary changes; `/reload` reloads resources, not the
   running executable. Recheck version, required resources, warnings and filters.
5. To roll back, restore the recorded prior version/revision through the same
   manager/prefix. Restore Prism source/version separately if necessary, preserving
   unrelated edits and filters. Never reset/clean or replace full settings files.

`pi update --extensions` reconciles configured packages, not the host binary; an
exact Prism source stays pinned. The supported Core context helper refreshes only
owned context and must be explicitly run when authorized. Native package updates
do not migrate copied AGENTS content. Use the local checkout while 1.2.0 is unpublished.

## Reproduction

```sh
npm ci --ignore-scripts
npm run typecheck
npm run test:host
node --test tests/Node/web-access-extension.test.ts tests/Node/cpp-host-resources.test.ts tests/Node/package-resources.test.js
```

These synthetic fixtures use no real credentials, paid inference or live web/MCP
service. See installed-version `docs/packages.md`, `docs/skills.md`,
`docs/prompt-templates.md` and SDK declarations for authoritative APIs; use the
`pi-docs` skill to resolve them rather than assuming a global install layout.
Hosted CI, Windows native shells and installed-user configuration are not implied.
