# Secret Protection

This extension rejects explicit credential-path access through file tools and
recognizable shell references. It checks lexical and symlink-resolved paths,
including dangling aliases, and supports additive newline-separated absolute or
`~/` paths in `PRISM_SENSITIVE_PATHS`. Invalid additions are reported without
turning off the default protection.

For recognized literal Git commit commands, inspect staged paths before content
and run available Gitleaks scanning without displaying findings. The repository
pre-commit hook supplies the same staged-path-first protection. Missing Gitleaks
is reported; path protection remains active. Failed/rejected operations do not
lock or abort a session. There are no deletion safe zones or general shell gates.

## Limits

This is a backstop, not an operating-system sandbox or full shell interpreter.
Computed paths, aliases, custom programs, nested shells and changes staged during
a command cannot all be proven safe by command inspection. A scan cannot prove
that all secrets were detected. Agent/user instructions must still prohibit
credential exposure and secret commits, including through broad searches or
indirect tools. Authentication may consume credentials normally without exposing
their values. Do not treat a successful tool call as authorization.

Reload/restart Pi after extension changes. Tests use synthetic fixtures and
exercise rejection, ordinary command freedom and recovery through extension events.
