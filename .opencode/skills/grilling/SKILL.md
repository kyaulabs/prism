---
name: grilling
description: Use when interviewing a user to clarify a task, gather requirements, or narrow choices — any scenario where you need human input. Provides a five-behavior protocol for asking one question at a time, separating codebase facts from human decisions, reassessing after each answer, recommending when presenting options, and gating on confirmation before proceeding.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Grilling: One-Question-at-a-Time Interview Protocol

A reusable interview primitive for agents that need human input. Consumer
skills (brainstorming, @consult (planned), @from-issue) invoke this skill when they need
to ask the user questions — it governs *how* to ask, not *what* to ask about.

## When to use

Load this skill when:
- You need to clarify an ambiguous task before acting.
- You are gathering requirements or constraints from the user.
- You are presenting options and need a decision.
- You are gate-keeping: the user must approve before you proceed.
- A consumer skill (brainstorming, @consult (planned), @from-issue) instructs you to
  interview the user.

Do NOT load this skill for tasks that are already unambiguous — execute
directly.

## The five core behaviors

### 1. One-at-a-time

Ask exactly one question per message. Never bundle multiple questions together.

- If a topic needs more exploration, break it into multiple rounds — one
  question each.
- Prefer multiple-choice when possible (easier to answer); open-ended is fine
  when the range of answers can't be pre-listed.
- Wait for the user's answer before asking the next question.

### 2. Facts vs decisions

Separate what you can discover yourself from what only the user can decide.

**Facts** — look up autonomously, do NOT ask the user:
- Codebase structure, file contents, existing patterns (glob, grep, read)
- Project conventions (AGENTS.md, conventions.md, adr/)
- Domain terms (CONTEXT.md)
- Dependency versions, configuration values
- Anything discoverable in the repo or from your training data

**Decisions** — ask the user. Only the user can answer:
- Preferences (which approach, which trade-off)
- Priorities (what matters most, what can wait)
- Value judgments (acceptable risk, quality threshold)
- Business rules (domain logic the codebase can't tell you)
- Anything not recorded in the repo and not in your training data

**Red flag:** If you're about to ask "What does X do in the codebase?" — stop.
Look it up yourself. If you're about to assume the user wants approach A over
B — stop. Ask.

### 3. Reassess loop

After each answer, pause and reassess before asking the next question.

- What did I learn from that answer?
- What do I still not know?
- What's the highest-value next question?
- Can I answer the next question myself (facts vs decisions check)?
- Do I have enough to proceed, or does the scope need decomposition first?

If the previous answer reveals the task is larger than expected, decompose
before asking more detailed questions — don't refine details of something that
needs to be broken apart first.

### 4. Recommended answer

When presenting options, always lead with a recommendation and your reasoning.

- Propose 2–3 approaches with trade-offs, not an unbounded list.
- Lead with your recommended option: "I recommend X because ..."
- Explain why: what trade-off you're making, what alternative you're
  rejecting, and what context makes this the right call.
- Keep the alternatives brief — the recommendation is what the user needs to
  evaluate.

**Anti-pattern:** "Here are three options, they're all valid, pick one." The
user is asking *you* because they want an expert recommendation. Give one.

### 5. Confirmation gate

After each decision point, confirm the user's answer before building on it.

- After presenting a design section: "Does this look right so far?"
- After a key decision: "So we're going with X — confirm?"
- Before proceeding to implementation: "Here's the full design. Ready to
  proceed?"
- Never assume agreement — wait for explicit confirmation.
- If the user pushes back, revisit. Don't defend the rejected option — adapt.

## Process

1. **Assess scope** — is this a single question or does it need decomposition?
2. **Facts check** — answer everything you can from the codebase/docs first.
3. **One question** — ask the single highest-value remaining question.
4. **Reassess** — what changed, what's left, what's the next question?
5. **Recommend** — when presenting options, lead with your choice.
6. **Gate** — confirm understanding before moving past a decision point.
7. **Repeat** from step 3 until you have enough to proceed.

## Rules

- **No fact-asking.** Never ask the user for information you can discover by
  reading the codebase, docs, or configuration.
- **No multi-question messages.** One question per message. If you have three
  questions, that's three rounds.
- **No unguided choice.** Always recommend when presenting options. "It
  depends" is not a recommendation.
- **No assumption of consent.** Gate on explicit approval. Silence is not
  consent.
- **No scope-creep questions.** If the answer reveals the task needs
  decomposition, decompose — don't ask more detailed questions about a broken
  scope.

## Integration with consumer skills

Consumer skills invoke grilling when they need human input. They provide the
domain context (what to ask about); grilling provides the interview discipline
(how to ask). Do not duplicate grilling's five behaviors in consumer skills —
reference this skill by name: "Load the `grilling` skill for interview
mechanics."

Each consumer skill should document:
- What triggers an interview (when to invoke grilling)
- What domain decisions the user must make (the WHAT)
- Any domain-specific rules that override grilling defaults

## Cross-refs

- `brainstorming` skill — consumer that invokes grilling for design interviews
- `writing-skills` skill — conventions for authoring SKILL.md files
- `AGENTS.md` — stack, boundaries, pipeline (always loaded)

## Gotchas

Known failure modes. Add entries when this skill causes a preventable mistake.

- *Asking facts from the user* — "How does this module work?" is a codebase
  lookup, not a user question. Check the facts-vs-decisions rule.
- *Bundling questions* — "What approach should we take and what's the deadline
  and who owns this?" is three questions. Ask one at a time.
- *Skipping the reassess loop* — the user's answer may make your next planned
  question irrelevant. Reassess before asking.
- *Presenting options without a recommendation* — the user asked you because
  they want expert judgment. Always lead with a recommended option.
- *Proceeding without confirmation* — the user said "sounds good" but didn't
  explicitly approve. Gate anyway.
