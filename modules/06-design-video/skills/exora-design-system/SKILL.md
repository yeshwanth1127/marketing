---
name: exora-design-system
description: EXORA's layout grammar and building blocks for static posts, carousels, ad creatives and reel frames. Load before composing any visual; always apply the client's brand.json on top.
---

# EXORA design system (v0.1 — starter, to be finalised by EXORA's designer)

You compose each visual as one self-contained HTML file. The renderer screenshots it at the exact
canvas size. There is NO internet: no web fonts, no remote images, no CDNs. Use system fonts
(the brand font if it is a system font, otherwise Arial/Helvetica/Georgia) and only files in this folder.

## Inputs in this folder
- `brand.json` — the client's colours, font, voice, logo file (if any), banned words. Brand wins over EXORA defaults.
- `copy.json` — the approved-to-draft copy for this asset (hook, on-screen lines, caption, CTA) and the format.
- `skills/exora-design-system/blocks/*.html` — reference blocks. Copy and adapt; do not link.

## Canvas sizes
| format | size | safe area |
|---|---|---|
| square | 1080×1080 | 64px margin |
| portrait | 1080×1350 | 64px margin |
| reel | 1080×1920 | top 260px and bottom 380px kept free of text (Instagram UI) |
| landscape | 1200×628 | 48px margin |

## Grammar
1. One idea per frame. The hook or the single claim is the largest text on the canvas.
2. Hierarchy: hook block → supporting line → proof strip (only if the copy contains verified proof) → CTA bar.
3. Maximum two type sizes per frame plus the CTA. Minimum body text 30px at 1080 wide; hook 72–120px.
4. One accent colour (brand colour 2). Text on colour must reach WCAG contrast 4.5:1 (3:1 for text ≥ 48px).
5. Carousels: frame 1 = hook block only; middle frames = one point each with a frame counter; last frame = CTA bar + brand.
6. Never invent proof, prices, numbers, reviews or logos. If `brand.json` has no logo file, use the brand name in text.
7. Keep Indian context in imagery cues and language as given in `copy.json`; do not translate unless asked.

## Blocks
- `blocks/hook.html` — full-bleed hook with eyebrow and supporting line.
- `blocks/offer-card.html` — card with the offer, one supporting line, CTA.
- `blocks/proof-strip.html` — 2–3 verified proof points (only from copy.json evidence).
- `blocks/cta-bar.html` — closing bar with CTA and brand.
- `blocks/carousel-frame.html` — numbered middle frame.

## Required workflow
1. Read brand.json, copy.json and the blocks.
2. Write each frame as `slides/slide-N.html` (N from 1). For a single image write only `slides/slide-1.html`.
3. Run `node tools/preview.mjs` — it renders every slide to `previews/slide-N.png` and prints a JSON report
   (text overflow, contrast failures, off-canvas text, safe-area violations, small text).
4. Open each PNG with the Read tool and look at it. Fix every reported issue and anything that looks
   unbalanced, crowded or off-brand. Re-run the preview. Stop after at most 3 rounds.
5. Write `design.json`: {"frames": N, "notes": "what you designed and why", "issues_remaining": [...]}.
