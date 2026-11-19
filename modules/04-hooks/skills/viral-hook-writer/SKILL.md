---
name: viral-hook-writer
description: >
  Write scroll-stopping hooks for a short-form video (the first 1-3 seconds).
  Use when the user says "hook", "reel hook", "opening line", "scroll stopper",
  "first three seconds", "TikTok hook", or "how do I start this video".
  Also used by EXORA month production for three day-script options per slot.
user-invokable: true
argument-hint: "[reel topic / what the video is about]"
license: MIT
metadata:
  author: Ootto
  version: "1.2.0"
  category: content
---

# Viral Hook Writer

Generate scroll-stopping opening lines that survive `hookscore.py` (LENGTH, SPECIFICITY, STAKES, FRONTLOAD, ADDRESS) — without inventing or padding the score. Soft brochure lines are rejected; rewrite until each option is concrete and tense.

## When to use
You have a reel/post topic but the opening is weak. The hook is ~80% of whether anyone watches.

## What you'll need
Topic, audience, desired reaction, brand/city/name facts you may use. Never invent prices or proof.

## Hard target: every `text` must pass all five checks

`hookscore.py` averages the five scores and heavily penalises the weakest one. Aim for every option ≥70 overall with no dimension under ~55.

1. **LENGTH** — 5–12 spoken words (~under 2 seconds). One sentence. Cut greetings and preambles.
2. **SPECIFICITY** — include a concrete marker: a digit/time (`3pm`, `5`, `18:30`) OR a spoken number (`three`, `five`) OR a proper name (`Bengaluru`, brand name, festival). Vague “parents nowadays” fails.
3. **STAKES** — at least one tension word from this set (use them literally): `don't`, `never`, `wrong`, `before`, `without`, `mistake`, `still`, `only`, `can't`, `won't`, `stop`, `secret`, `wish`, `should`, `already`, `instead`. A polite observation with none of these scores ~20 on STAKES and tanks the overall.
4. **FRONTLOAD** — put the number, name, or stakes word in the first 1–4 words. Do not bury the payload.
5. **ADDRESS** — speak to one viewer (`you` / `your`) OR open with an imperative: `Stop`, `Don't`, `Save`, `Ask` is weaker than `Don't`/`Stop` — prefer `Don't` / `Stop` / `Never` / `Save`.

Avoid weak openers: `so`, `hey`, `today`, `have you`, `this is`, `let's`, `honestly`, `it's`, `stuck in` without a stakes word.

### Good vs reject (rewrite reject before returning)

| Reject (soft / WEAK) | Rewrite (score-ready) |
| --- | --- |
| Stuck in traffic comparing kindergartens | Don't pick a Bengaluru kindergarten from traffic |
| Every brochure looks perfect | Three things your brochure still won't show |
| Ajji speaks Kannada. You answer in English | Don't let English erase your child's Kannada at home |
| Who's with my child all day? | Stop guessing at 3pm — ask who's with your child |
| Weekend to-do card for parents | Never leave a weekend visit without this one question |

## Instructions
Collect the topic and audience, then produce **exactly 3** options (or 10 when asked for a batch). For each option include:
- `text` — spoken hook (5–12 words, score-ready — must include SPECIFICITY + STAKES + ADDRESS/FRONTLOAD)
- `formula` — which angle
- `rationale` / `explanation` — why it fits today
- `script` — full timed production script when EXORA asks for day scripts (open with the same `text`)
- `caption`, `cta`, `on_screen_text`
- `claude_prompt`, `elevenlabs_prompt` when day-scripts are requested

Use a spread of angles (not three rewrites of one):
- Mistake / "Don't…" / "Never leave without…"
- Number + stakes ("Three things… still won't…")
- Imperative + lived clock time ("Stop guessing at 3pm…")
- Curiosity gap with a proper name
- Result-first with city/brand name in the first four words

Rules: spoken language, no fluff, no hashtags, no emoji in the hook, no `[placeholder]` tokens. Prefer brand city and real names from context. Do not invent scores — write lines that earn them.

After drafting, mentally check each line against the five dimensions. If SPECIFICITY or STAKES would fail, rewrite before returning. Do not ship a soft brochure line as an option.

When EXORA asks for day scripts, pair every hook with a **complete arc** (see day-script-writer): the script and on_screen_text must deliver the promised question / list / better move before the CTA. A scroll-stopping open that never pays off is still a failed piece.

**Tip:** Always generate options and pick. The hook you love is rarely the one that wins.

---

Built by **[Ootto](https://www.ootto.ai)** — adapted for EXORA Marketing OS.
