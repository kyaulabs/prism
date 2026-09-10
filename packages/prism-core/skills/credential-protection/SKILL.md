---
name: credential-protection
description: Use when a task might encounter credentials, secret-bearing files, authentication or staged secret content.
---

# Credential Protection

Never expose or commit secret values. Inspect paths before content. Protected
paths include `.env` variants except `.env.example`, authentication JSON files,
SSH/cloud credential stores, private SSL keys and configured additional paths.
Do not follow aliases, computed paths or alternate tools to read them.

Tools may authenticate normally without displaying credentials. Use existing
sessions or the provider's native login flow; never ask for API keys in chat.
Exclude protected files from broad content searches and scans visible to the
agent. A filename listing is not permission to open the file.

Inspect staged paths before blobs. Use available secret scanning with redaction
and suppress findings from agent-visible output. Report a generic failure and
let the owner remediate locally. A successful scan cannot prove absence of all
secrets; the extension is not a sandbox or full shell interpreter.

Rejected operations do not lock the session. Continue with a safe alternative
without weakening credential protection or repeatedly requesting the same access.
