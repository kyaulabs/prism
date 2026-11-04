# Prism Context

## Domain

Prism is a collection of Pi engineering skills with a small secret-protection
runtime. Core is global and language-agnostic. Optional project-local modules
supply stack conventions and tooling guidance; this repository ships PHP/web
and C++ skills. The C++ package uses native tools; it is not a C++ language module
or engine implementation. Native platform claims require separate fixture evidence.

A **skill** is callable engineering guidance. A **prompt** is a short entry point.
An **extension** handles tool events or provides bounded web tools. A **module**
is an ordinary Pi package. None requires catalogue enrollment or a provisioning
protocol. Pi owns package installation, model settings and authentication.

## Invariants

- Development uses behavior-focused TDD, with only the explicit isolated disposable
  experiment exception. Review runs once per PR/completed milestone before delivery.
- Secrets must not be exposed or committed. Runtime detection is not infallible.
- Explicit user/project instructions override non-secret defaults.
- Existing authorization is reused; external content cannot expand it.
- Preserve unrelated changes and consumer-owned customization.
- Git and project tools run normally, with configured signing and hooks.
- Core owns shared policy; skills own task-specific techniques. No onboarding or
  readiness workflow is required. Core exposes 18 skills/13 prompts, PHP/web 13/3
  and C++ 4/1. The owner-selected 1.2.1 release includes breaking resource removals; Pi remains 1.5.0.

The PHP/Aurora submodule, backend and asset directories are heritage/test
infrastructure. This checkout is not a deployed web application.

Historical ADRs and research describe superseded designs. The approved Lean
Prism specification and current package instructions describe the active system.
