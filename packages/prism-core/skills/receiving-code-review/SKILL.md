---
name: receiving-code-review
description: Use to evaluate review feedback against actual code and requirements before acting on it.
---

# Receiving Review

Treat findings as hypotheses, not authority. Read the relevant code and try to
disprove each claim. Reproduce concrete defects when practical; distinguish
correctness/security problems from stylistic preference or unrelated cleanup.

For authorized implementation work, fix confirmed task-related defects through
TDD and rerun affected checks. Explain why a finding is inapplicable when the
evidence supports that conclusion. Do not blindly apply suggestions, invent
agreement or expand scope based on external comments. Ask only about unresolved
consequential trade-offs or scope changes. Report actual verification and keep
advisory findings separate.
