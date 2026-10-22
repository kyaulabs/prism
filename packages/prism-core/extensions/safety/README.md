# Secret Protection

This extension rejects explicit credential-path access through file tools and
recognizable shell references. It checks lexical and symlink-resolved paths,
including dangling aliases, and supports additive newline-separated absolute or
`~/` paths in `PRISM_SENSITIVE_PATHS`. Windows drive/UNC paths, `~\` and
backslash-terminated directory additions are accepted too. Directory prefixes
match path boundaries, not similarly named sibling directories. Invalid
additions are reported without turning off default protection.

For recognized literal Git commit commands, inspect staged paths before content
and run available Gitleaks scanning without displaying findings. The repository
pre-commit hook supplies the same staged-path-first protection. Missing Gitleaks
is reported; path protection remains active. Failed/rejected operations do not
lock or abort a session. There are no deletion safe zones or general shell gates.

## PowerShell and native nested calls

The `powershell` branch has its own operand scanner: backslashes remain path
separators, backtick escapes are recognized, and quoted whitespace stays in an
operand. Supported path forms include Windows drive/UNC paths, `/` or `\`
separators, `~`, `$HOME`/`${HOME}`, `$env:USERPROFILE`, `$env:HOME`,
`$env:HOMEDRIVE$env:HOMEPATH`, `$env:APPDATA`, `$env:LOCALAPPDATA`, `$PWD`, and
braced equivalents. `FileSystem::` paths are recognized. Windows comparisons
are case-insensitive. Native filesystem symlink inspection still applies;
Windows fixtures on POSIX exercise lexical rules, not a Windows filesystem.

Pi dispatches `tool_call` for both model-issued and nested calls. Codemode's
nested event carries the real tool name/input and `parentToolCallId`; no
JavaScript source parsing or replacement dispatcher is needed. The guard checks
only tool interfaces it understands. An arbitrary MCP/custom tool is **not**
automatically understood or protected because its event is visible.

## Limits

This is a backstop, not an operating-system sandbox or full shell interpreter.
Computed paths, aliases, custom programs, nested shells and changes staged during
a command cannot all be proven safe by command inspection. A scan cannot prove
that all secrets were detected. Agent/user instructions must still prohibit
credential exposure and secret commits, including through broad searches or
indirect tools. Authentication may consume credentials normally without exposing
their values. Do not treat a successful tool call as authorization.

Reload/restart Pi after extension changes. Tests use synthetic fixtures and
exercise rejection before system operations, ordinary command freedom and
recovery through real Pi 1.4 direct/Codemode dispatch. Native Windows shell
execution is not covered by the POSIX fixtures.
