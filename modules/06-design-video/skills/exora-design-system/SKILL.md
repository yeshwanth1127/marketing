---
name: exora-design-system
description: EXORA's brand-neutral design method for static posts, carousels, ad creatives and reel frames. Ten layout types driven entirely by the client's brand profile (brand.json). Load before composing any visual.
---

# EXORA design system (v1)

One engine, many brands. This method holds **no colours, fonts or logos of its own**. Every visual value comes
from `brand.json` (the client's brand profile). If two clients get the same brief, their outputs must look like
two different brands — same structure, different identity.

There is NO internet. Use only files in this folder: fonts are in `fonts/`, the logo (if any) is `logo.*`.

## Inputs
- `brand.json` — the full brand profile: colour roles (`paper`, `ink`, `accent`, `accent_ink`, `surface`, `muted`),
  type (`display`, `body`, `label`, Indic `scripts`), `shape`, `motif`, `density`, allowed `tones`, `rules.do/dont`.
- `copy.json` — the approved copy, format and frame count. Never add claims, numbers, reviews or proof.
- `fonts/catalog.json` + `fonts/<id>/*.woff` — only the fonts this brand uses.

## The method
1. **Pick the layout type** that matches the copy's job (table below). One idea per frame.
2. **Start from the engine**: write the slots as JSON (see `node skills/exora-design-system/engine/cli.mjs list`
   for each layout's slots), then run
   `node skills/exora-design-system/engine/cli.mjs <layout> slots.json`. It writes `slides/slide-N.html` in the
   brand's colours, fonts, shape and motif, sized to the format, with text fitted to its box.
3. **Refine by hand** only where the copy needs it (line breaks, which word gets `*emphasis*`, tone of a frame).
   Keep the engine's CSS variables (`var(--paper)`, `var(--f-display)`, `.tone-ink` …) — never hard-code a hex
   value or font name. Keep the `<script>` at the end of each slide (it fits text and marks the page ready).
4. **Preview and look**: `node tools/preview.mjs`, open every `previews/*.png` with Read, fix what the report
   flags and anything that looks crowded, unbalanced or off-brand. Max 3 rounds.
5. Write `design.json`: `{"layout": "...", "frames": N, "notes": "...", "issues_remaining": []}`.

## Layout types
| id | use it for | default tone |
|---|---|---|
| `hook` | one scroll-stopping statement; carousel cover; reel cover | ink |
| `offer` | price / package / discount, as a coupon ticket; terms always visible | paper |
| `myth-fact` | correct a category belief with a verified fact | paper |
| `faq` | one real customer question and a calm answer; series | paper |
| `festival` | greetings (Deepavali, Ugadi, Pongal, Onam, Rajyotsava, Eid, Christmas…) with a bilingual line | ink |
| `list` | tips/steps/reasons: cover → one point per frame → outro (single frame in landscape) | paper |
| `before-after` | transformation, old way → new way (approved photos optional) | paper |
| `behind-scenes` | a field note: time, place, someone's own words | paper |
| `proof` | testimonial; a stat only if it is in `copy.json` evidence | ink |
| `event` | workshops, open days, launches: the date is the hero | paper |

## Grammar (applies to every layout)
1. **Hierarchy**: one hero element per frame (headline, price, date, numeral or quote). Everything else is
   visibly secondary. Max two type sizes plus labels and CTA.
2. **Rails**: brand mark top-left, label/index top-right; CTA bottom-left, handle bottom-right. They make a feed
   feel like one publication.
3. **Emphasis**: wrap one phrase per frame in `*asterisks*`. It renders in the brand's accent (italic when the
   display font has an italic). Never more than one.
4. **Tones**: a frame sits on `paper`, `ink` or `accent` — only those in `brand.tones`. Vary tone across a
   carousel (cover ink → items paper → outro accent) for rhythm.
5. **Motif**: the brand's device (`kolam`, `arcs`, `grid`, `stripes`, `rule`, `none`) is decoration only, never
   behind small text. Festival posts use the rangoli rosette drawn in the brand's shape.
6. **Readability**: text ≥ 28px at 1080 wide (≥ 31px landscape); WCAG 4.5:1 (3:1 for ≥ 48px). The engine picks
   readable emphasis colours per tone — keep them.
7. **Placements**: 4:5 portrait is the default. Reels keep the top 260px and bottom 380px free of text.
   Landscape (1.91:1) drops secondary lines rather than shrinking everything.
8. **Indian context**: ₹ before the number, Indian digit grouping (1,499 / 18,500 / 1,25,000), native-script lines
   set in the brand's script font and checked by a native speaker. Never translate unless the copy says so.
9. **Honesty**: never invent proof, prices, ratings, logos or people. If `brand.json` has no logo, the wordmark is
   set in the display font.

## Brand profile essentials
`brand.json` is produced by `core/design/brand-profile.mjs` (normalize), which guarantees ink/paper contrast,
readable text on accent and a muted colour that passes on paper. Respect `rules.dont` literally.
