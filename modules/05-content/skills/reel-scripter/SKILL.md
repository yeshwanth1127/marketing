---
name: reel-scripter
description: >
  Turn an idea or hook into a full 30-45 second reel script — hook, value beats,
  payoff, and CTA, with on-screen text. Use when the user says "reel script",
  "video script", "script this", "write a reel", "short-form script", or "turn
  this idea into a video".
user-invokable: true
argument-hint: "[idea or hook to script]"
license: MIT
metadata:
  author: Ootto
  version: "1.1.0"
  category: content
---

# Reel Scripter

Turn one idea (or hook) into a tight, postable ~12–45s reel script whose opening line can survive `hookscore.py`.

## When to use
You have a hook or topic and need the whole script — what to say, in what order, with the on-screen text and a CTA that earns the follow.

## What you'll need
The idea or hook, the platform (Reels / TikTok / Shorts), the audience, and the goal (follows / saves / DMs / link clicks). Optional: your brand voice. Never invent prices or proof.

## Hook line (0–3s) — write to pass scoring

The spoken opening must hit all five properties (do not invent a score — write a better line):

1. **LENGTH** — 5–12 words, one breath.
2. **SPECIFICITY** — a number (`3pm`, `three`, `five`) and/or a proper name (city, brand, festival).
3. **STAKES** — at least one of: don't / never / stop / without / before / still / only / can't / wrong / mistake / secret / wish / already / instead.
4. **FRONTLOAD** — that payload in the first 1–4 words.
5. **ADDRESS** — `you`/`your` or an imperative opener (`Don't`, `Stop`, `Never`, `Save`).

If the incoming hook is soft (no stakes, no concrete marker), rewrite the opening before scripting the body. Soft → reject: "Stuck in traffic comparing schools". Score-ready: "Don't pick a Bengaluru school from traffic".

## Direction — the script must go somewhere

Structure every reel as **HOOK → SETUP → PAYOFF → CTA**.

- If the hook promises “one question”, **state the full question** in narration and on-screen before the CTA.
- If it promises “three things”, **name all three**.
- If it says “don't…”, **show the better move**.
- Mute-pass: a stranger reading only the on-screen lines must still get the tip.
- Forbidden: logo + “Save this” ending with no middle payoff. That is not a finished script.

## Instructions
Collect the inputs, then produce:

```
You are my short-form video scriptwriter. Write a [12-25 / 30 / 45]-second [Reels/TikTok/Shorts] script.

Idea / hook: [idea or hook — rewrite if soft]
Audience: [who it's for]
Goal: [follows / saves / DMs / clicks]
Voice: [your tone — e.g. punchy, warm, expert-next-door]
City / brand facts allowed: [only verified]

Structure:
1. HOOK (0-3s) — score-ready stop-scroll line (see five checks above).
2. CONTEXT (3-8s) — name the problem or stakes in a lived moment.
3. VALUE (8-30s) — 3 fast, concrete beats. Show, don't lecture.
4. PAYOFF + CTA (last 5s) — the takeaway + one specific action (no invented price).

Output:
- timed spoken script with [0–3s] / [3–12s] beats
- on_screen_text: 3–5 short lines (no emoji, no [placeholders])
- caption + cta
- claude_prompt + elevenlabs_prompt when EXORA asks for a production pack
```

Keep spoken lines tight. Prefer brand city and real names. Relatable > brochure.

**Tip:** Read the hook out loud. If it has no tension word and no concrete marker, rewrite it before filming.

---

Built by **[Ootto](https://www.ootto.ai)** — adapted for EXORA Marketing OS.
