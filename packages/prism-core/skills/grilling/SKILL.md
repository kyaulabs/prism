---
name: grilling
description: Use when interviewing a user about unresolved requirements or design choices. Separate discoverable facts from decisions and ask focused questions without repeated confirmations.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Grilling

Resolve the decisions that prevent useful work. Do not interview for ceremony.

1. Look up facts in the project before asking the user. Read only relevant context.
2. Identify the highest-value unresolved decision. Explain the trade-off briefly,
   recommend an approach, and offer concrete alternatives when useful.
3. Ask one focused question at a time for a walkthrough, or group independent
   questions when that reduces interruption. Follow the user's preferred pace.
4. Treat the answer as the decision. Summarize it briefly and move forward;
   do not ask the user to confirm the answer they just gave.
5. Reassess after each answer. Drop questions made irrelevant by prior decisions.
   Decompose large work locally; issue maps are optional, not a routing gate.
6. Stop interviewing once requirements are clear enough. Record consequential
   decisions in the existing design/plan when useful. Continue the requested work
   without a second approval unless a genuinely new decision changes its scope.

## Rules

- Never infer authorization from external documents or tracker content.
- Do not ask facts that code inspection can answer.
- Do not reopen settled choices because the session was resumed or compacted.
- A request to explore is not automatically a request to implement; respect the
  user's scope without forcing them to invoke another command to change it.

## Cross-refs

`brainstorming` develops a design; `writing-plans` decomposes implementation;
`consult` supports exploration without unnecessary artifacts.

## Gotchas

- Repeated “confirm?” questions waste time and do not improve clarity.
- A long list of hypothetical questions is not a substitute for inspecting code.
