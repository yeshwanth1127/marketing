---
name: day-script-writer
description: >
  Write three complete day-script options for one calendar slot (Post / Reel / Carousel).
  Each option must open, deliver its promise, and land a CTA — never a hook that never pays off.
  Use for EXORA month production and when the user asks for day scripts, full reel scripts, or
  "three options for this date".
user-invokable: true
argument-hint: "[date + format + topic]"
license: MIT
metadata:
  author: EXORA
  version: "1.0.0"
  category: content
---

# Day Script Writer — complete arcs only

Produce **exactly 3** unique day-script options for ONE date and format. A pretty hook that never delivers is a failed script.

## Non-negotiable: promise → deliver → ask

Every option must have a clear direction:

1. **HOOK (0–3s)** — stop the scroll. 5–12 words. Hits hookscore properties (SPECIFICITY, STAKES, FRONTLOAD, ADDRESS).
2. **SETUP (next beat)** — name the lived moment (commute, 3pm meeting, dinner, visit).
3. **PAYOFF (must exist)** — deliver whatever the hook promised:
   - promised "one question" → **state the full question on-screen and in narration**
   - promised "three things" → **name all three concretely**
   - promised "don't do X" → **show the better move**
   - If mute viewers only read `on_screen_text`, they must still get the full payoff.
4. **CTA (last beat)** — one specific next step (WhatsApp / visit / save). No invented price.

**Reject:** hooks like "Save this one question" that never show the question. **Reject:** logo + CTA endings with no substance in the middle. **Reject:** three soft brochure observations with no stakes and no destination.

## Hook scoring (earn it — do not invent scores)

- LENGTH 5–12 words
- SPECIFICITY: number (`3pm`, `three`) and/or proper name (city, brand, festival)
- STAKES: don't / never / stop / still / without / before / only / can't / mistake / wrong
- FRONTLOAD payload in first 1–4 words
- ADDRESS: you/your or Don't / Stop / Never / Save

## Output shape (each of 3 hooks[])

- `text` — spoken hook only
- `formula` — angle label
- `rationale` / `explanation` — why this angle for THIS day
- `script` — timed beats that **include the full payoff** (Reel ~12–25s; Post/Carousel as spoken + on-screen plan)
- `on_screen_text` — 3–5 short lines that mute-pass: reading them alone must complete the promise
- `caption`, `cta`
- `claude_prompt` — visual brief that lists each on-screen line and the payoff beat (not just the hook)
- `elevenlabs_prompt` — narration direction + full spoken script

Angles must differ (mistake / number-list / lived clock-time). No `[placeholder]` tokens. No invented prices or proof.

## Mute-pass test (mandatory)

List `on_screen_text` in order. If a stranger cannot answer "what was the actual tip / question / list?" from those lines alone, rewrite before returning.
