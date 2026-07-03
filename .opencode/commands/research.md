---
description: Research a question using upstream sources, official docs, and the web. Produces a cited summary with a confidence rating.
subtask: true
---

Research the user's question and produce a cited summary. Load
`.opencode/docs/research.md` for source-trust heuristics and the citation
format before writing the summary.

## 1. Clarify scope

Restate the question in one sentence. If it is ambiguous, ask the user a
single focused clarifying question — do not guess.

## 2. Gather sources

- Use `@scout` to clone and inspect an upstream dependency when the question
  is about library/framework behavior and the docs are ambiguous or stale.
- Use `websearch` to locate the official source for each sub-question.
- Use `webfetch` to pull the specific authoritative page (RFC, doc, spec).
- Prefer sources at trust level 1–5 in `research.md`. Tag anything below.

## 3. Produce the summary

Follow the output shape in `research.md`:

1. **Summary** — 3–6 bullets.
2. **Findings** — per sub-question, with `[N]` citations.
3. **Confidence** — High / Medium / Low + one-line rationale.
4. **Open questions** — what remains unresolved.
5. **Sources** — numbered list: `title — URL (accessed YYYY-MM-DD)`.

## Rules

- Every non-trivial claim gets a citation. Uncitable claims are tagged
  `[unverified]` with a note on what would confirm them.
- Do not access paid APIs or services requiring auth.
- Do not present a single blog post as settled fact.
- If the research surfaces a security or correctness issue in this project,
  stop and flag it before continuing.
