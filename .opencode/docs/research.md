# Research

Loaded by the `/research` command. Defines source trust and citation format
for codebase-adjacent research done via `@scout`, `websearch`, and `webfetch`.

## Prerequisites

- `@scout` is a built-in experimental subagent — requires
  `OPENCODE_EXPERIMENTAL_SCOUT=true` (auto-sourced via
  `.opencode/experimental.default.env` per `ADR-0024`). If `@scout` is not
  available, verify the flag is set in the environment.
- `/research --background` requires `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`
  (gated on `ADR-0024` Phase-0 spike). See
  `.opencode/skills/research-background/SKILL.md` for the full contract.

## Source trust hierarchy

Prefer higher-trust sources. Cite the highest-trust source you found; do not
pad with lower-trust duplicates.

1. **Official specs & standards** — RFCs, W3C, WHATWG, PHP RFCs, MariaDB docs.
2. **Official upstream docs** — the framework/library/tool's own docs.
3. **Upstream source** — the actual repo (use `@scout` to clone & inspect).
4. **Release notes / changelogs** — authoritative for behavior changes.
5. **Mature secondary references** — well-known books, long-established
   reference sites (MDN, php.net manual).
6. **Blog posts & Stack Overflow** — useful leads only. Verify against a
   higher-trust source before relying on them.
7. **LLM-generated content from other tools** — not a source. Never cite.

## When to use which tool

- **`@scout`** — cloning an upstream dependency to inspect its real source. Use
  when the docs are ambiguous or out of date, or to confirm exact behavior.
- **`websearch`** — finding candidate sources and the official site.
- **`webfetch`** — pulling a specific known URL (an RFC, a doc page).

Do not use `websearch`/`webfetch` to access paid APIs or services requiring
auth. Respect the project's "no external APIs without permission" boundary.

## Citation format

For every non-trivial claim in the research summary, attach a citation:

```
<claim> [1]
```

And at the end:

```
[1] <Source title> — <URL> (accessed YYYY-MM-DD)
```

If a claim cannot be cited to a source at trust level 5 or above, label it
explicitly: `<claim> [unverified]` and say what would be needed to confirm it.

## Output shape

A research run produces:

1. **Summary** — 3–6 bullets answering the original question.
2. **Findings** — one subsection per sub-question, with citations.
3. **Confidence** — High / Medium / Low, with a one-line rationale.
4. **Open questions** — what still needs resolving.
5. **Sources** — numbered citation list.

## Rules

- Do not present a single blog post as settled fact.
- If upstream source contradicts the docs, trust the source and note the doc
  gap.
- Quote sparingly. Paraphrase and cite.
- If research reveals a security or correctness issue in the project, stop and
  flag it rather than burying it in the summary.
- `websearch`, `webfetch`, and `@scout` are opencode builtin names that may
  change between opencode versions. If a tool call fails with "tool not found,"
  verify the current names against `opencode --help` or the opencode docs for
  your version before assuming the tool does not exist.
