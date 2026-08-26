# Distill pattern reference

Use this catalog for rewriting supplied prose or auditing a substantial draft. Hard rules remove empty or unsupported writing. Strong defaults improve clarity but yield to accuracy, exact syntax, required formats, and Prism's domain language.

## Content

1. **Puffery, hard rule.** Cut phrases such as "pivotal moment", "testament to", "evolving landscape", "setting the stage for", and "indelible mark". State what happened.
2. **Name-dropping, strong default.** Do not list publications, companies, or authorities as decoration. Name a source only when its specific statement matters.
3. **Superficial participial phrases, strong default.** Delete or expand trailing phrases such as "highlighting", "ensuring", "reflecting", "showcasing", and "fostering" when they add no mechanism or evidence.
4. **Promotional language, hard rule.** Replace "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", and similar sales copy with neutral facts.
5. **Vague attribution, hard rule.** Replace "experts believe" or "reports suggest" with a named source. Delete the claim when no source exists.
6. **Formulaic challenges, hard rule.** Replace "despite challenges, it continues to thrive" with the specific problem, response, and result.

## Language

7. **Stock model vocabulary, strong default.** Prefer plain words over "additionally", "crucial", "delve", "interplay", "intricate", "pivotal", "showcase", "tapestry", "testament", "underscore", and abstract "landscape".
8. **Fancy forms of "is", strong default.** Prefer "is" and "has" over "serves as", "stands as", "boasts", or "features" when the longer phrase adds nothing.
9. **Formulaic contrast, strong default.** Replace "not just X, but Y" with the actual point.
10. **Forced groups of three, strong default.** Use the natural number of examples or properties.
11. **Synonym cycling, strong default.** Pick one accurate term and repeat it instead of rotating through near-synonyms.
12. **False ranges, strong default.** Use "from X to Y" only when X and Y define a meaningful scale. Otherwise list the topics directly.

## Style

13. **Em dashes, strong default.** Avoid em dashes in authored prose. Split the sentence or use a comma. Do not replace them mechanically inside quotations or required text.
14. **Colon overuse, strong default.** Keep colons before lists and examples. Rewrite sentence-level colon pivots that act as a substitute for clear syntax.
15. **Boldface overuse, strong default.** Bold only where emphasis helps navigation. Do not bold every proper noun, acronym, or first phrase.
16. **Inline-header lists, strong default.** Remove bold labels that merely repeat the sentence. A short lead-in is valid when the following text adds new information.
17. **Title case headings, strong default.** Use sentence case unless a project format requires otherwise.
18. **Decorative emojis, strong default.** Remove emojis used only as heading or bullet decoration. Preserve required wayfinding symbols and user-authored text.
19. **Curly quotes, strong default.** Use straight quotes in technical prose unless typography or quoted source text requires curly quotes.

## Communication artifacts

20. **Chatbot phrases, hard rule.** Cut "I hope this helps", "Let me know if", "Of course", "Certainly", and theatrical discovery claims. Respond directly.
21. **Cutoff disclaimers, hard rule.** Do not hide missing evidence behind "specific details are limited". Find the evidence, state the exact limitation, or remove the claim.
22. **Sycophancy, hard rule.** Cut "great question", "you are absolutely right", and similar praise. Address the substance.

## Filler

23. **Filler phrases, hard rule.** Replace "in order to" with "to", "due to the fact that" with "because", and remove "it is important to note that".
24. **Excessive hedging, hard rule.** Reduce stacked uncertainty to the narrowest accurate qualifier, such as "may".
25. **Generic conclusions, hard rule.** Replace "the future looks bright" with a specific next action, commitment, risk, or fact.

## Jargon

26. **Abstract metaphor nouns, strong default.** Prefer concrete terms over metaphorical "substrate", "wedge", "vector", "locus", "nexus", "bedrock", "scaffolding", "gold-plating", "ratchet", "endgame", "north star", and "flywheel". Keep Prism glossary terms such as "harness", "scaffold", or "primitive" when used with their defined technical meaning.

## Plain speech

27. **Name the mechanism, hard rule.** Replace statements about how a system feels with what it does. Prefer an exact method, failure mode, instruction, or number. Cut sentences that could appear unchanged in another project's documentation.
28. **Dense sentences, strong default.** Split a sentence when the reader must backtrack to parse it. Keep one main idea per sentence when practical.
29. **Active voice, strong default.** Name the actor when it matters. Keep passive voice when the actor is unknown, irrelevant, or intentionally omitted.
30. **Adverbs, strong default.** Cut an adverb that props up a weak verb. Use a stronger verb or a measured result.
31. **Plain words, strong default.** Prefer "use", "help", "many", and "if" over "utilize", "facilitate", "numerous", and "in the event that".

## Prism exceptions

- Preserve exact syntax, code, commands, identifiers, paths, flags, logs, citations, quotations, machine-readable formats, templates, commit syntax, and user-provided text marked for preservation.
- Preserve canonical terms from `CONTEXT.md`, accepted ADRs, public APIs, and external standards.
- Follow an explicit user-requested tone or format unless it requires fabrication or loss of technical accuracy.
- Do not add opinions, anecdotes, emotion, or casual phrasing that the evidence or source voice does not support.
- When a pattern match is ambiguous, keep the precise wording and improve only the surrounding prose.
