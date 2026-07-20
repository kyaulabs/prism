---
description: Research a question using upstream sources, official docs, and the web. Produces a cited summary with a confidence rating. Pass --background for async dispatch (experimental, gated).
subtask: true
---

Research the user's question and produce a cited summary. Load
`.opencode/docs/research.md` for source-trust heuristics and the citation
format before writing the summary.

Prerequisites:
- `@scout` requires `OPENCODE_EXPERIMENTAL_SCOUT=true` (auto-sourced via
  `.opencode/setup.json` experimental section — see `ADR-0024`).
- `--background` requires `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`
  (gated on ADR-0024 Phase-0 spike — currently experimental).

## The question

$ARGUMENTS

## 1. Check for --background flag

If `$ARGUMENTS` starts with or contains the token `--background`:

- Strip `--background` from the research question (the real question is
  everything in `$ARGUMENTS` except `--background`).
- Check if `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` is set to `true` in
  the environment.
- **If the env var is NOT set:** output a note that background subagents are
  experimental and gated — tell the user to enable the flag in
  `.opencode/setup.json` (experimental section) and restart opencode. Load
  `.opencode/skills/research-background/SKILL.md` for the full contract.
- **If the env var IS set:** load `.opencode/skills/research-background/SKILL.md`
  and follow the background-dispatch instructions for your opencode version.
  Proceed with the research as a background-capable subagent.

If `--background` is NOT present, proceed with the normal research flow below.

## 2. Clarify scope

Restate the question in one sentence. If it is ambiguous, ask the user a
single focused clarifying question — do not guess.

## 3. Gather sources

- Use `@scout` to clone and inspect an upstream dependency when the question
  is about library/framework behavior and the docs are ambiguous or stale.
  (Note: `@scout` is a built-in experimental subagent — if it is not
  available, verify `OPENCODE_EXPERIMENTAL_SCOUT=true` in the environment.)
- Use `websearch` to locate the official source for each sub-question.
- Use `webfetch` to pull the specific authoritative page (RFC, doc, spec).
- Prefer sources at trust level 1–5 in `research.md`. Tag anything below.

## 4. Produce the summary

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
