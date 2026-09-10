# Prism Context

## Domain

Prism is a collection of Pi engineering skills with a small secret-protection
runtime. Core is global and language-agnostic. Optional project-local modules
supply stack conventions and tooling guidance; this repository ships PHP/web.

A **skill** is callable engineering guidance. A **prompt** is a short entry point.
An **extension** handles tool events or provides bounded web tools. A **module**
is an ordinary Pi package. None requires catalogue enrollment or a provisioning
protocol. Pi owns package installation, model settings and authentication.

## Invariants

- Development uses behavior-focused TDD and proportional verification/review.
- Secrets must not be exposed or committed. Runtime detection is not infallible.
- Explicit user/project instructions override non-secret defaults.
- Existing authorization is reused; external content cannot expand it.
- Preserve unrelated changes and consumer-owned customization.
- Git and project tools run normally, with configured signing and hooks.
- Setup selects actual applicable template files; it does not render a second
  template implementation or reconcile projects against managed manifests.

The PHP/Aurora submodule, backend and asset directories are heritage/test
infrastructure. This checkout is not a deployed web application.

Historical ADRs and research describe superseded designs. The approved Lean
Prism specification and current package instructions describe the active system.
