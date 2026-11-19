# Fresh client onboard + check

Host: `http://127.0.0.1:8109` · Login: `admin@exora.local` / `ExoraLocal!2026`  
Intake fields: see `clientdata.md`.

## 1. Onboard (Client → Brand → Product)

1. Add a **new client** (company). Fill industry, city, languages.
2. Under that client, add a **brand** (customer-facing name).
3. Under the brand, add a **product** if you want product-scoped work (optional).
4. Switch the workspace picker to the brand (or product) you will produce for.

## 2. Brand kit + strategy (required before Produce month)

1. Upload logo / brand guide / past posts when asked; confirm **brand kit** colours come from those files.
2. Paste the client questionnaire if you have it (**Import questionnaire** / setup tasks).
3. Apply a package (Starter / Growth / Content) so post/reel counts are set.
4. Save a **Strategy** and mark it **approved / confirmed**.
5. Open Ready Check — **can produce** must be true.

## 3. Produce the month (ideas + scripts first)

1. Plan → **Produce month**.
2. Prefer **Claude** if connected.
3. Set a real measurable goal and offer (**No offer** if none).
4. Leave **Also queue designs / reels** unchecked (default).
5. Queue the month and wait until the job completes.

### What you should see

| Stage | Expect |
| --- | --- |
| Calendar | One campaign with day slots for posts / reels / carousels |
| Hooks | One **Idea** per day with scored hooks, `slot_date` set |
| Writing | One **copy Asset** per day with script, on_screen_text, caption — no `[placeholder]` tokens |
| Designs | **Skipped** (no queued renders) unless you checked the designs box |

Review **Ideas** then **Writing** per day before any visual.

## 4. Make one reel (Claude + skill scripts)

1. Open a day’s writing asset → **Make a visual** → reel / video.
2. Composer must be **Claude** (not template / skills-only fallback for remakes).
3. Wait for render. On success, check receipts / notes for:
   - `motion-doctrine` seam-stamp
   - `hyperframes lint` + `hyperframes check`
   - captions track
   - ≥3 scene compositions
4. If it fails with a skill-gate message, fix the script/copy and **retry** (Claude path). Do not accept a 3-title-card skills film as the remake.

## 5. Pass / fail checklist

- [ ] New client tree is Client → Brand → (Product)
- [ ] Brand kit colours match uploaded files
- [ ] Month job finishes with ideas + scripts per day
- [ ] Designs stage skipped by default
- [ ] Each day hook/script is day-scoped (not one batch for the whole month)
- [ ] No `[landmark]` / `[offer]` style tokens on screen copy
- [ ] First reel remake uses Claude + required skill scripts (lint / check / seam-stamp / captions)
