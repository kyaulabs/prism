---
name: prototype
description: Use when you need to answer a technical viability question with throwaway code before committing to an implementation plan. Builds a disposable prototype — logic (PHP CLI), UI (HTML+CSS+JS variants), or integration (DB/API boundary test) — to learn fast and then delete.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question
decides the shape. This is not production code — it exists to de-risk a
design decision before `writing-plans` commits to a detailed TDD plan.

## When to use

After `brainstorming` has produced a design but before `writing-plans` writes
the task breakdown. Use when you're uncertain about:

- Whether a state model or logic flow feels right.
- What a UI should look like or how it should behave.
- Whether a library, API, or DB query pattern actually works at the boundary.

If you can write the plan with confidence, skip prototyping — go straight to
`writing-plans`.

## Pick a branch

Identify which question is being answered — from the user's prompt, the
surrounding code, or by asking:

- **"Does this logic / state model feel right?"** → [Logic branch](#logic-branch)
- **"What should this look like?"** → [UI branch](#ui-branch)
- **"Does this work at the boundary?"** → [Integration branch](#integration-branch)

The three branches produce very different artifacts — getting this wrong
wastes the whole prototype. If the question is genuinely ambiguous and the
user isn't reachable, default to whichever branch better matches the
surrounding code (a backend module → logic; a page or component → UI; a
service or data layer → integration) and state the assumption at the top.

## Rules that apply to all branches

1. **Throwaway from day one, and clearly marked as such.** Locate the
   prototype code close to where it will actually be used (next to the
   module or page it's prototyping for) so context is obvious — but name it
   so a casual reader can see it's a prototype, not production. Use a
   `prototype_` prefix or a `prototypes/` directory.
2. **One command to run.** The user must be able to start it without
   thinking: `php prototype_logic.php`, `php -S localhost:8080
   prototype_ui.php`, etc.
3. **No persistence by default.** State lives in memory. Persistence is the
   thing the prototype is *checking*, not something it should depend on. If
   the question explicitly involves a database, hit a scratch DB or a local
   file with a clear "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the
   prototype *runnable*, no abstractions, no RCS headers, no vim modelines.
   The point is to learn something fast and then delete it.
5. **Surface the state.** After every action, print or render the full
   relevant state so the user can see what changed.
6. **Delete or absorb when done.** When the prototype has answered its
   question, either delete it or fold the validated decision into the real
   code — don't leave it rotting in the repo.

## Logic branch

Build a tiny interactive PHP CLI script that pushes the state machine or
logic through cases that are hard to reason about on paper.

```php
<?php
// prototype_<concern>.php — THROWAWAY: answers "<question>"
// Run: php prototype_<concern>.php

$state = 'idle';
$actions = ['start', 'pause', 'resume', 'complete', 'cancel'];

function transition(string $state, string $action): string {
    // ... the logic under test ...
    return $newState;
}

foreach ($actions as $action) {
    $new = transition($state, $action);
    echo "{$state} + {$action} → {$new}\n";
    $state = $new;
}
```

- Print every transition so the user can see the flow.
- Include edge cases that are hard to reason about: empty input, concurrent
  actions, invalid transitions.
- If the logic involves a class or function from the real codebase, require
  it directly — don't copy-paste.

## UI branch

Generate several radically different UI variations on a single PHP page,
switchable via a `?variant=N` URL search param and a floating bottom bar.

```php
<?php
// prototype_<page>.php — THROWAWAY: answers "what should <page> look like?"
// Run: php -S localhost:8080 prototype_<page>.php

$variant = $_GET['variant'] ?? '1';
$variants = ['1' => 'Minimal', '2' => 'Card-based', '3' => 'Dense table'];
?>
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Variant-specific styles inline — this is throwaway */
        body { font-family: sans-serif; margin: 2rem; }
        <?php if ($variant === '1'): ?>
            .item { padding: 0.5rem; border-bottom: 1px solid #ccc; }
        <?php elseif ($variant === '2'): ?>
            .item { display: inline-block; width: 200px; margin: 1rem;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 1rem; }
        <?php else: ?>
            .item { display: table-row; }
            .item span { display: table-cell; padding: 0.25rem 1rem; }
        <?php endif; ?>
    </style>
</head>
<body>
    <h1>Variant <?= htmlspecialchars($variant) ?>: <?= $variants[$variant] ?></h1>
    <!-- render sample content in the variant's style -->

    <div style="position:fixed;bottom:0;left:0;right:0;background:#333;padding:0.5rem;text-align:center">
        <?php foreach ($variants as $n => $name): ?>
            <a href="?variant=<?= $n ?>" style="color:white;margin:0 1rem"><?= $name ?></a>
        <?php endforeach; ?>
    </div>
</body>
</html>
```

- Serve with `php -S localhost:8080 prototype_<page>.php`.
- Make variants **radically different** — not minor tweaks. The point is to
  see which direction feels right.
- Use inline styles — this is throwaway, don't create SCSS files.
- Don't wire up real data — use hardcoded sample data that represents the
  shape.

## Integration branch

Build a one-file throwaway that exercises a real DB query, API call, or
external service interaction to verify behavior at the boundary. This is
unique to this stack — PHP + MariaDB + Aurora's SQL handler.

```php
<?php
// prototype_<boundary>.php — THROWAWAY: answers "does <pattern> work?"
// Run: php prototype_<boundary>.php

require_once(__DIR__ . '/../aurora/aurora.inc.php');

// Test a specific query pattern or API interaction
$db = new KYAULabs\Aurora\SQL();

// The pattern under test:
$result = $db->execute(
    "SELECT u.id, u.email, COUNT(o.id) AS order_count
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE u.created_at >= ?
     GROUP BY u.id
     ORDER BY order_count DESC
     LIMIT 10",
    [date('Y-m-d', strtotime('-30 days'))]
);

foreach ($result as $row) {
    echo "{$row['id']}\t{$row['email']}\t{$row['order_count']} orders\n";
}
```

- Use the real Aurora SQL handler or real PDO — the point is to verify the
  actual boundary behaves as expected.
- If testing an external API, use `curl` or `file_get_contents` directly —
  don't build a client class.
- Print the raw result so the user can see exactly what comes back.
- If the prototype touches a real database, use a scratch table with a
  `prototype_` prefix and clean it up when done.

## When done

The *answer* is the only thing worth keeping from a prototype. Capture it
somewhere durable (commit message, ADR, `CONTEXT.md` note, or a `NOTES.md`
next to the prototype) along with the question it was answering:

```markdown
# Prototype notes: <question>

**Question:** <what we were trying to answer>
**Answer:** <what we learned>
**Decision:** <what we'll do as a result>
**Prototype file:** <path> (delete after capturing the answer)
```

If the user is around, that capture is a quick conversation; if not, leave
the placeholder so they can fill in the verdict before deleting the
prototype.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Prototype code accidentally committed to production* — always use a
  `prototype_` prefix or `prototypes/` directory, and delete after capturing
  the answer.
- *Prototype UI variant styles leak into the real SCSS* — use inline styles
  only; never create `.scss` files for throwaway prototypes.

## Cross-refs

- `brainstorming` skill — the step before this one (produces the design).
- `writing-plans` skill — the step after (produces the TDD plan, informed by
  the prototype's answer).
- `@architect` agent — for non-trivial prototypes that touch system
  boundaries, suggest an architect review of the approach.
