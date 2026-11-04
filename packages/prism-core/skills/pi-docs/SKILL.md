---
name: pi-docs
description: Use for Pi questions or configuration/integration changes. Prefer host-provided installed documentation and version-matched source.
derived-from: obra/superpowers-developing-for-claude-code (MIT, © Jesse Vincent)
---

# Pi documentation

Prefer the native host's supplied documentation paths and topic guidance. Read
the relevant installed docs and closest examples completely before implementing
host changes, following related cross-references and SDK declarations for exact
signatures. Do not duplicate the native documentation catalogue here.

If paths/router are absent (including custom-system-prompt sessions), verify the
active Pi version and locate its package with public SDK path helpers or the
executable target. Use [resolution detail](references/resolution.md) only when
needed. If installed documentation is unavailable or mismatched, use official
source at the matching version, never guessed APIs or an automatic upgrade.

Resolve bundled references relative to this skill directory:

- [Pi 1.5 compatibility](../../docs/pi-1.5.md)
- [Safety boundary](../../extensions/safety/README.md)
- [Bounded web tools](../../extensions/web-access/README.md)

Pi owns models, authentication, sessions and available host capabilities. Report
version mismatches and minimal reproductions rather than emulating missing host
behavior. Examples explain APIs, not permission to add orchestration.
