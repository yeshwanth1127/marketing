# EXORA Marketing OS — Platform Build Plan

1 Nov 2026 · @yeshwanth · updated 1 Nov 2026 (evening): design engine + brand profiles built

## Overview

EXORA Marketing OS is an internal web platform where EXORA's marketers run a client's entire digital marketing in 9 steps — onboarding to results — with Claude doing the work behind each step and a human approving anything that goes public or spends money.

- **Users:** EXORA marketers (operators), reviewers (approvers), admins. Not sold to clients.
- **Market:** Indian businesses. Indian languages, INR budgets, Indian festivals, WhatsApp, local SEO, ASCI and DPDP rules are built in, not added later.
- **Scope:** strategy, campaign planning, hooks, content, design, video, social, publishing, SEO, GEO, ads (Meta + Google), analytics, team and client management.

## Build principles

1. **Reuse before building.** About 120 open-source skills from 12 repos do most of the work. EXORA writes code only for the 7 gaps listed in this doc.
2. **Modular.** Every step and track is one folder with one contract. Removing a folder removes that capability and nothing else.
3. **Skills run on the server.** Marketers never see or copy skill files; they only use the web app.
4. **One skill per job.** Where two repos overlap, this doc names the primary; the other is not loaded.
5. **Nothing goes out without approval.** Posts, DMs, ad launches and budget changes all pass the approval gate.
6. **The system learns.** Every campaign's results are stored and fed into the next plan.
7. **One design engine, many brands.** EXORA's design system is a brand-neutral method; each client's look comes from its own brand profile (see Design system and brand profiles).

## Architecture

Four layers. Marketers only touch the top one; every click goes down through the runtime, and anything that publishes, sends or spends stops at the approval gate.

A click on a step screen calls the runtime, which loads that module's skills and runs them on Claude; results are saved to the database, and actions on ad or social platforms go out through connectors only after approval.

## Tech stack and repo structure

One monorepo. The stack below is the planned default; swap a layer only with a written reason in this doc.

| Layer | Plan | Why |
|---|---|---|
| Web app | Next.js (App Router), React, Tailwind | MarketingOS AI's scaffold can be reused for auth, layout and approval screens |
| Auth + roles | Clerk (or Supabase Auth) | Roles: admin, marketer, reviewer |
| Database + files | Supabase: Postgres + Storage | One place for records and assets |
| Brain | Claude API with custom skills; Claude Agent SDK as fallback | Skills stay server-side |
| Job queue | Postgres-backed queue | Long jobs: renders, audits, nightly analytics |
| Render worker | Node 22 + FFmpeg + headless Chromium + HyperFrames CLI | Statics and reels |
| Audio worker | Python + earshot | Sound placement and checks |
| Skill scripts | Pinned Python env (`npm run setup:python`) + Node | 82 skills depend on their own scripts |

```
exora-marketing-os/
  web/                      Next.js app: one screen per step and track
  core/
    db/                     schema + migrations (001-initial, 002-tool-runs)
    auth/                   roles and permissions
    approvals/              approval gate + audit log (in-house)
    connectors/             Meta, Google Ads, GA4, GSC, Instagram, WhatsApp, YouTube (deferred)
    runtime/                loads a module's skills, calls Claude (CLI agent mode), writes outputs
    tools/                  Mode A script runner, receipts, DMP adapter, vendored DMP scripts
    design/                 Claude design composer, preview tool, design checks
    jobs/                   queue + schedules
    memory/                 performance memory
  modules/
    01-onboard/  02-strategy/  03-plan/  04-hooks/  05-content/
    06-design-video/  07-approve/  08-publish/  09-results/
  tracks/
    seo/  geo/  ads/  influencers/  managing/
  workers/
    renderer/               Chromium (PNG) + HyperFrames (MP4)
    audio/                  FFmpeg cleanup now; earshot + Openverse planned
  exora/                    EXORA's own skills, methodology, design system, brand profiles, festival data, compliance
  vendor/                   original forked repos, untouched, with LICENSE files (not in git)
  docs/                     this plan, delivery status, architecture decisions, vendor inventory
```

**Rule for vendor/:** never edit vendored files. To change a skill, copy it into the module folder and edit the copy; note the source path in the copy's header.

### Current build (as of 1 Nov 2026, commit `a1850be`) — accepted deviations from the table above

| Plan | Built | Status |
|---|---|---|
| Qlix approvals and jobs | In-house approval engine + Postgres job queue (row locks, SKIP LOCKED). No Qlix dependency. | Accepted (user decision, 1 Nov) |
| Supabase + Clerk | Local Postgres (127.0.0.1:55439), local files under `.local/`, local password login (127.0.0.1:3100 only) | Accepted for localhost; hosted adapters needed before team-wide use |
| Claude API | Claude Code CLI using the logged-in account on the host Mac, in **agent mode**: a throwaway folder per run, Read/Write/Edit/Glob/Grep, Bash allowlist limited to the run's skill scripts, web tools off | Accepted for testing; switch to API key before team-wide use (shared account limits) |
| Sandbox in a container | Throwaway folder + command allowlist, no container | Gap: an allowed script that makes network calls is not blocked. Container is a follow-up |
| Connectors | Deferred; jobs that need them go to `blocked`, never claim success | Accepted until Meta/Google access is granted |

The repo is under git from commit `d9cf583` (baseline). `vendor/` is not tracked in git; its pinned commits are in `docs/vendor-inventory.json` and `npm run vendor:sync` re-creates it.

## Data model

Modules talk only through these records — never by calling each other. Every record belongs to one client workspace and carries created_by, created_at, status and version.

| Record | Key fields | Written by | Read by |
|---|---|---|---|
| Client | name, industry, city, city tier, languages, region config (INR, IST, holidays, compliance), connected accounts | Step 1 | All |
| Brand kit (brand profile) | see Brand profile fields below; plus voice.md, banned words, disclaimers, personas, approved photos, verified evidence | Step 1 (extractor + marketer edits) | Steps 2–6, tracks |
| Strategy | positioning, audiences, competitors, offers, channels, KPIs, client sign-off | Step 2 | Steps 3–5, tracks |
| Campaign | objective, budget (INR), channel split, calendar slots, UTM scheme, festival hooks | Step 3 | Steps 4–9 |
| Idea | slot, reference reels, hooks with scores, chosen hook | Step 4 | Step 5 |
| Asset | type (copy, image, carousel, video, audio), files, language, layout type, check results, licence info, approval state | Steps 5–6 | Steps 7–8 |
| Approval | asset or action, approver, decision, reason, timestamp, reversible yes/no | Step 7 | Steps 8, 9, audit |
| Post | asset, platform, scheduled time, live URL, platform IDs | Step 8 | Step 9 |
| Ad | platform, campaign/ad set/ad IDs, budget, status, creative assets | Step 8 + ads track | Step 9 |
| Metric | source, entity, date, metric name, value, label (real / estimated / inferred) | Nightly jobs | Step 9 |
| Report | period, findings, decisions (keep / test / change / stop) | Step 9 | Steps 2–4 |
| Learning | industry, objective, pattern (hook type, format, layout type, time), result, evidence links | Step 9 | Steps 2–4 (performance memory) |
| Task | owner, module, due date, state | Managing track | All |

Plus the `tool_runs` table (receipts, see Skill execution).

**Asset approval states** (from MarketingOS AI): idea → draft → awaiting_review → changes_requested → approved → scheduled → published → archived, plus rejected. An approved asset is immutable; changes create a new version.

## Module contract

Every step and track folder has exactly these four parts. The runtime refuses to load a module missing any of them.

```
modules/05-content/
  skills/          SKILL.md folders (copied from vendor/ or written by EXORA)
  tools.yaml       connectors and scripts this module may call — nothing else
  io.yaml          records it reads and writes
  screen/          its web UI (one route in web/)
```

Example io.yaml:

```yaml
reads:  [Client, BrandKit, Strategy, Campaign, Idea]
writes: [Asset]
approval_required: false   # true for any module that publishes, sends or spends
```

### How a button click runs

1. Marketer clicks an action (e.g. "Write script") on a module screen.
2. `core/runtime` loads that module's skills, the records named in `reads`, and the client's brand profile and voice file.
3. Claude runs with only the tools in `tools.yaml`.
4. Output is validated, saved as the record named in `writes`, and shown on screen.
5. If `approval_required` is true, the output goes to the approval queue instead of executing.

**Per-client switches:** each module and track can be turned on or off per client in Settings. A disabled module's screen is hidden and its skills are never loaded.

## Skill execution — how skills and their tools must run

A skill is not "used" unless its own instructions and its own tools produced the output. Loading SKILL.md text as prompt guidance alone does not count.

Facts from the current build: 144 SKILL.md folders are copied into modules and tracks. 64 skills depend on scripts (e.g. ig-reel → hookscore.py, check → eval-runner.py, verify-claims → claim-verifier.py). DMP's 108 shared scripts are vendored unmodified in `core/tools/vendor-scripts/digital-marketing-pro/scripts/`, and they read client data from a `~/.claude-marketing/brands/<client>/` layout that `core/tools/dmp.mjs` builds per run.

### Rules

1. Copy whole skill folders, including sibling scripts and data (hooks.json, rubric.json…). DMP skills get DMP's scripts/ folder mounted at the path the skill expects.
2. Every skill has a tool manifest in its module's `tools.yaml`: scripts, inputs, outputs, packages needed, and run mode.
3. Two run modes:
   - **Mode A — direct tool run:** deterministic scripts (scoring, checks, calculators) are called by our code with the inputs; same input, same answer. (`core/tools/runner.mjs`)
   - **Mode B — agent run:** Claude follows the skill in a sandbox and may call only that skill's listed scripts. (`core/runtime/agent.mjs`)
4. **DMP adapter:** before a run, write the client's records into DMP's expected layout (profile via DMP's own setup.py, guidelines, active brand) and set `CLAUDE_PLUGIN_ROOT` / `CLAUDE_MARKETING_HOME`; after the run, read results back into the database.
5. **Sandbox:** one temporary folder per run containing only that skill's files and the client data; file access only inside it; command allowlist = the skill's scripts; no internet until connectors exist; run inside a container (container not yet built).
6. **Receipts:** `tool_runs` records run, skill (with SHA-256 match against vendor-inventory.json), script, input hash, output hash, exit code, time. Every saved record links to its receipts and the UI shows them ("Made with: ig-reel · hookscore.py ✓").
7. **Action-to-skill map:** each UI action names its skill chain (e.g. "Score hooks" = viral-hook-writer → ig-reel/hookscore.py → ab-hook-tester), not a fixed default set.
8. **Coverage page** in Settings: per skill — last run, run count, self-test status. Unused skills are visible.
9. **Golden tests:** for each wired skill, a fixed input whose expected output comes from running the original vendor script directly; the app's result must match.
10. **Release rule:** a release is blocked if any core-loop output (Steps 2–6, 9) has no receipt.

### Status of these rules in the code (1 Nov 2026)

| Rule | Status |
|---|---|
| 1 Whole folders | Done for copied skills; DMP scripts vendored |
| 2 Tool manifests | Partial — 32 tools declared (batches 0–1) across 64 script-based skills; plan below |
| 3 Mode A / Mode B | Both built |
| 4 DMP adapter | Built (`core/tools/dmp.mjs`) |
| 5 Sandbox | Folder + allowlist built; container not built |
| 6 Receipts | Built; shown in record view |
| 7 Action-to-skill map | Partial — hooks, copy, design, reels, calculators |
| 8 Coverage page | Built (Settings, from receipts) |
| 9 Golden tests | Built; `tests/tools.test.mjs` runs every declared tool and compares with direct vendor runs; 73/73 tests pass |
| 10 Release rule | Not enforced yet |

### Skill script wiring plan — goal: every skill and script live (agreed 1 Nov 2026)

Counted on 1 Nov 2026: **64 vendored skills ship scripts** (the earlier "82" was an over-count). "Live" means: declared in the module's
`tools.yaml` (inputs, outputs, run mode), runnable from the app (Skill tools button or automatic on outputs), receipted, and
covered by `tests/tools.test.mjs`, which runs every declared tool through the app and — for stateless tools — compares the
output with the original vendor script run directly. Claude (agent mode) may already run any script of the skills it loads;
those runs are receipted too.

Stateful DMP scripts keep their files per client in `.local/dmp/<client>` (`state: persistent`), so guidelines, team,
quality history and reports persist between runs.

| Batch | Scripts | Status |
|---|---|---|
| 0 · Core loop | hookscore, beats, caption, detect, eval-runner, claim-verifier, budget-optimizer, creative-fatigue-predictor, sample-size-calculator, significance-tester (11) | **Live** |
| 1 · Offline, high value | language-router (detect, supported, score, route), guidelines-manager, dm-status, mine_hooks, swipe, keyword_cluster (Hooks + SEO), brand-voice-scorer, content-scorer, ai-tell-scan, humanize, quality-tracker (log + history), report-generator, ad-budget-pacer, clv-calculator, revenue-forecaster, team-manager | **Live** (21 tools; brand voice, content score, AI-tell scan and quality history run automatically on every copy draft) |
| 2 · Video and sound | motion-doctrine seam-gate/seam-stamp; real-sound analyze/arrange/audit/licences/mux; media-use audio; effects fx.py; watch-video watch.py (needs internet) | Next |
| 3 · Remaining offline DMP | setup (brand check/summary), pdf-generator (growth-plan, yearly-planner), authorship (content-engine), campaign/execution/recommendation trackers and engagement-state as read views over our records, goldfish-review | After batch 2 |
| 4 · Need internet or connectors | competitor-scraper, serp-snapshot, tech-seo-auditor, backlink_gap, seo_drift, local-seo-checker, geo-tracker, gsc-ai-performance, macro-signal-tracker, connector_executor/resolver (publish, schedule, launch), embed-c2pa + resolve_model (ad images) | With connectors (network allowlist per tool) |
| Not used | DMP approval-manager (our approval engine is the gate) | Replaced by design |

## Source repos and licences

All 12 are MIT or Apache 2.0, so internal use and modification are allowed. Keep each repo's LICENSE file in vendor/. Skill counts were checked in the repo files on 1 Nov 2026. Code names are used in the step tables below.

| Code | Repo | Licence | Skills | What we use it for |
|---|---|---|---|---|
| DMP | indranilbanerjee/digital-marketing-pro | MIT | 164 | Strategy, planning, SEO/GEO, ads, analytics, India region and language config |
| OT | ootto-ai/claude-content-skills | MIT | 54 | Social content engine: research, hooks, scripts, calendar, analytics |
| IG | Jakeschincariol/instagram-agent-skill | MIT | 13 | Instagram: profile, hooks, captions, carousels, stories, replies, DMs |
| OW | ootto-ai/ootto-watch | MIT | 1 | watch-video: Claude watches a video (frames + transcript) |
| CH | coreyhaines31/marketingskills | MIT | 53 | Offers, marketing psychology, copywriting, CRO, pricing, AI SEO |
| CF | charlie947/social-media-skills | MIT | 17 | Voice builder, YouTube thumbnails, graphics (needs Apify + Gemini keys) |
| KJ | kostja94/marketing-skills | MIT | 172 | Website pages, technical/local SEO, schema, Meta/Google/YouTube ads guides |
| HF | heygen-com/hyperframes | Apache 2.0 | 27 | Video engine: HTML to MP4, motion rules, captions, media, styles |
| EA | Leonxlnx/earshot | MIT | 2 | real-sound soundtracks, earshot listening and checks |
| YT | hassancs91/claude-youtube-editor | MIT | 9 | Talking-head cleanup, audio cleanup, SFX suggestions, thumbnails |
| VFX | Vibha-Ramprakash/claude-video-effects | MIT | 1 | 45 effects on talking-head video, face tracking |
| AA | msitarzewski/agency-agents | MIT | role prompts | Paid-media and design role prompts for agents |

Reference only (patterns, not code): suhasbhairav/ai-agents-for-marketing — approval states, brand-profile schema, "compute numbers in code, AI explains" analytics.

Also used: Openverse API for openly licensed music and sound (no key needed; licence checked per file) — not wired yet.

## The 9 steps

Each step is one module folder and one screen. Skill names below are confirmed against each repo's files. "EXORA" = built by us (see EXORA-built components).

### Step 1 — Onboard (`modules/01-onboard`)

Screen: client form, file upload (logo, brand guide, past posts), brand profile editor, "Connect" buttons for Instagram, Meta Ads, Google Ads, GA4, Search Console, WhatsApp.

| Skill | Source | Job |
|---|---|---|
| client-onboarding | DMP | Intake checklist for a new client |
| brand-setup | DMP | Client profile: voice, audience, competitors, goals |
| import-guidelines | DMP | Loads an existing brand guide or SOP |
| region-config | DMP | Sets INR, IST, Indian holidays, compliance regime |
| language-config | DMP | Content languages (English, Hindi, Hinglish, Kannada, etc.) |
| audience-personas | OT | Personas from real comments, reviews, interviews |
| ig-profile | IG | Scores the Instagram profile out of 100; rewrites weak parts |
| voice-builder | CF | Builds voice.md from past content (backup to IG voice template) |
| Brand-profile extractor | EXORA | Fills the full brand profile (colours with roles, fonts, logo rules, shape, image style, density) from uploaded files and past posts |

Writes: Client, Brand kit (brand profile).

### Step 2 — Strategy (`modules/02-strategy`)

Screen: "Generate strategy" → editable strategy doc → "Send for client sign-off".

| Skill | Source | Job |
|---|---|---|
| competitor-analysis | DMP | 2–5 competitors: positioning, content, SEO, ads, pricing |
| competitor-teardown | OT | A rival account's best posts → hooks, patterns, cadence |
| competitor-positioning | OT | Point of difference vs competitor messaging |
| positioning-audit | OT | How the brand comes across on social; what the message should be |
| market-weather | DMP | Market conditions for the category |
| audience-intelligence | DMP | Audience research |
| funnel-architect | DMP | Funnel stages |
| growth-plan | DMP | Growth plan document |
| offers | CH | Offer design: value, bonuses, guarantee, urgency |
| marketing-psychology | CH | Behavioural principles applied to the offer and message |
| pricing | CH | Pricing and packaging |
| EXORA methodology | EXORA | Wraps the above into EXORA's strategy format |

Writes: Strategy.

### Step 3 — Plan (`modules/03-plan`)

Screen: month calendar with post slots, ad campaigns, budget split in INR.

| Skill | Source | Job |
|---|---|---|
| campaign-plan | DMP | Objectives, channel mix, budget, timeline, KPIs |
| campaign-brief | OT | Decision-ready brief before any content or spend |
| media-plan | DMP | Paid channel split, weekly flighting, reach and frequency |
| budget-optimizer | DMP | Channel budget split (script wired, Mode A) |
| yearly-planner | DMP | 12-month calendar |
| content-pillar-builder | OT | Content pillars |
| content-calendar | OT | 2-week reel calendar (primary; DMP and IG planners not loaded) |
| series-planner | OT | Recurring content series |
| best-time-scheduler | OT | Posting times and frequency from audience activity |
| utm-campaign-plan | OT | Link-tagging scheme for every campaign |
| Indian festival data | EXORA | Festivals, sales, wedding season, IPL for region-config |

Writes: Campaign.

### Step 4 — Ideas and hooks (`modules/04-hooks`)

Screen: per calendar slot — reference reels, 3 scored hooks, "Pick hook".

| Skill | Source | Job |
|---|---|---|
| content-research | OT | Finds a niche's outlier posts and why they worked |
| trend-spotter | OT | Current trends in the niche |
| ig-viral | IG | Ranks reels against each account's normal views; names the formula |
| reel-analyzer | OT | Breaks down a reel frame by frame: hook, beats, pacing, visuals |
| watch-video | OW | Downloads a reference video; gives Claude frames + transcript |
| hook-mining | OT | Hook patterns from top content |
| viral-hook-writer | OT | Writes hooks for the first 1–3 seconds |
| ig-reel | IG | Scores hooks against 26 formulas (hookscore.py, wired) |
| ab-hook-tester | OT | Plans hook A/B tests |
| hashtag-keyword-research | OT | Hashtag and keyword sets for Explore and search |
| keyword-research | DMP | Search keywords for blog and SEO content |

Writes: Idea.

### Step 5 — Content (`modules/05-content`)

Screen: script, on-screen text, caption, CTA side by side; language tabs; check results with receipts.

| Skill | Source | Job |
|---|---|---|
| reel-scripter | OT | Reel script (primary) |
| on-screen-text-writer | OT | Text overlays |
| caption-and-hashtags | OT | Caption + hashtags |
| ig-caption | IG | Checks the first 125 characters shown before "more" (caption.py, wired) |
| cta-writer | OT | Call to action |
| carousel-builder | OT | Carousel copy |
| story-sequencer / ig-story | OT / IG | Story sequences with stickers |
| content-repurposer / ig-repurpose | OT / IG | One long asset into a week of posts |
| copywriting, copy-editing | CH | Landing page and ad copy, edits |
| content-engine | DMP | Blogs, ads, emails, landing pages |
| email-sequence | DMP | Email series |
| video-script | DMP | Long-form/YouTube scripts |
| translate-content, localize-campaign, multilingual-score | DMP | Indian-language versions with quality score |
| ig-human | IG | Removes AI tone (detect.py, wired) |
| check, verify-claims | DMP | Final gate: claims, brand voice, compliance (eval-runner.py, claim-verifier.py, wired) |
| Indian ad rules | EXORA | ASCI and DPDP rules added to check |

Writes: Asset (copy).

### Step 6 — Design and video (`modules/06-design-video`)

Screen: creative studio — choose layout type, preview, regenerate, per-placement sizes (1:1, 4:5, 9:16, 1.91:1); "Claude designs" or "fixed template (fallback)".

| Skill | Source | Job |
|---|---|---|
| exora-design-system | EXORA | Brand-neutral design method: layout types, grammar, checks (see below) |
| viral-carousel, ig-carousel | OT / IG | Carousel structure and 1080×1350 files |
| cover-thumbnail-brief | OT | Reel covers |
| ad-creative | DMP | Ad concepts per placement |
| youtube-thumbnail, graphic-designer | CF | Thumbnails and graphics |
| motion-doctrine | HF | Motion rules — load first for any video (fixes the "AI feel") |
| hyperframes, hyperframes-cli | HF | Write video as HTML; render MP4 |
| captions-overlay | HF | Caption styles |
| media-use | HF | Music, SFX, images, voiceover, transcripts for a video |
| slideshow, hyperframes-registry | HF | Ready-made video styles and blocks |
| clean-cut, clean-audio | YT | Raw talking-head → clean master cut and audio |
| effects skill | VFX | 45 effects on talking-head clips |
| b-roll-shot-list | OT | B-roll list for shoots |
| real-sound, earshot | EA | Real-recording soundtracks; checks sound sync |
| suggest-sfx | YT | Sound-effect cue suggestions |

Writes: Asset (image, carousel, video, audio).

#### How Step 6 must produce output

- Step 6 writes image, carousel, video and audio assets (not only copy).
- **Statics:** Claude, using exora-design-system with ad-creative, viral-carousel and cover-thumbnail-brief, picks a layout type, composes the layout and copy as HTML with the client's brand profile applied as variables; Chromium renders each placement size; a check script tests contrast, overflow, safe areas, small text, margins, banned words and remote files; Claude reviews the render and fixes, up to 3 rounds. The 3 fixed templates are fallback only and labelled as such.
- **Reels:** Claude loads motion-doctrine first, then hyperframes, captions-overlay, media-use and exora-design-system, and writes a new HyperFrames composition per brief. In the sandbox it runs `hyperframes lint`, `check`, `snapshot`; motion-doctrine's seam-gate.mjs / seam-stamp.mjs still to be added; renders; reviews keyframes; fixes.
- **Sound:** real-sound scripts (analyze.py, arrange.py, audit.py) build the soundtrack; earshot checks sync; Openverse supplies music with the licence stored on the asset.
- **Talking-head:** clean-cut, clean-audio, suggest-sfx (YT) and effects (VFX, fx.py) with a speech-to-text tool.
- **Done when:** two clients get visibly different outputs for the same brief and layout type; every layout type has been rendered and reviewed with at least 3 contrasting test brands; every video receipt shows motion checks and an earshot sync check passed; every audio file has a stored licence.

#### Step 6 status (1 Nov 2026)

| Part | Status |
|---|---|
| Claude-composed statics with preview → look → fix loop (`core/design/compose.mjs`, `preview-tool.mjs`, `checks.mjs`) | Built (commit `ca0df60`); receipted; design errors block review |
| Claude-composed reels via HyperFrames CLI; final gate `hyperframes check --json`; MP4 duration verified | Built (commit `a1850be`) |
| exora-design-system skill | **Built (v1).** Brand-neutral method (SKILL.md) + design engine (`skills/exora-design-system/engine/`): 10 layout types × 4 placements, fit-to-box text, motif library (kolam, arcs, grid, stripes, rules, rangoli rosette). Old 5 blocks removed |
| Full brand profile | **Built.** `core/design/brand-profile.mjs`: colour roles with guaranteed contrast, display/body/label type + Indic script fonts, shape, motif, density, allowed tones, motion pace, do/don't. Legacy kits convert automatically. Stored as `BrandKit.profile`; validated on save |
| Font library | **Built.** `exora/fonts/`: 24 SIL OFL families (Latin + Devanagari, Kannada, Tamil), subset WOFF, bundled so renders work offline. Rebuild with `scripts/build-fonts.py` |
| Brand editor + live preview | **Built.** Onboard → Brand kit → *Design profile*: edit roles, fonts, shape, pattern, density, motion, rules; live preview of any layout/placement (`/api/brand-preview`) |
| Brand-profile extractor | **Partial.** Uploaded files now fill colour roles and match fonts to the library; logo is used on renders. Shape/image style/density still set by hand |
| Claude statics / reels | Claude gets `brand.json` (full profile), only the brand's fonts and the logo; starts from the engine CLI, refines, previews, fixes. Reels get `brand.css` with the brand's fonts and colour variables |
| Fixed-layout fallback | Rebuilt on the engine (layout picker in the render form); old `artwork()` template removed |
| Multi-brand render review | **Done.** `scripts/design-gallery.mjs`: 4 profiles (Kaveri Dental, Ruh Atelier, SunKidz, EXORA) × 10 layouts × 4 placements = 160 renders, zero design-check issues, reviewed by eye |
| seam-gate / seam-stamp | Not wired |
| real-sound, earshot, Openverse | Not wired |
| Talking-head (clean-cut, VFX, speech-to-text) | Not wired; FFmpeg denoise/normalise/trim only |

### Design system and brand profiles

**One engine, many brand profiles.** Each brand does not get its own design engine.

- **EXORA design system = our method, not our look.** It holds no EXORA colours or logo. It is how we design: layout types that work for Indian SMB marketing, plus hierarchy, readability, contrast, reel-safety and motion rules. Brand-neutral, shared by every client. Lives in `modules/06-design-video/skills/exora-design-system/` (skill + blocks + checks).
- **Each brand gets its own brand profile.** Stored per client (Brand kit record), filled by the brand-profile extractor from uploaded logos, guides and past posts, and editable in the app. It plugs into the method as variables, so the same layout looks completely different for a dental clinic and a fashion label.
- **EXORA's own identity is just one more brand profile** (`exora/brand-profiles/exora.json`), used when marketing EXORA itself and never as a default for clients. The old `exora/design-system/tokens.json` has been removed.
- Test brands (fictional) live in `exora/brand-profiles/test/`; sample copy for review renders in `exora/design-system/samples.json`.

**Layout types (10, built):** `hook`, `offer` (coupon ticket, ₹ price hero), `myth-fact`, `faq`, `festival` (rangoli rosette in the brand's shape + bilingual line), `list` (cover → one point per frame → outro), `before-after`, `behind-scenes` (field note), `proof` (stat only from evidence), `event` (date hero). Each layout type has: purpose, slots, frame rules per format (1:1, 4:5, 9:16, 1.91:1), and a carousel variant where relevant.

**Brand profile fields:**

| Field | Contents |
|---|---|
| Colours with roles | background, surface, text, muted text, accent, accent-text; contrast pairs pre-checked |
| Type | display and body font (local files only — no internet at render), type scale, weight, case, letter-spacing, Indic script fallback per language |
| Logo | files (light/dark), clear space, minimum size, allowed placements, never-do list |
| Shape style | corner radius, borders, dividers, shadows (rounded vs sharp) |
| Image style | photo vs illustration, treatment, approved photos |
| Density | airy ↔ dense; margins and spacing scale |
| Do's and don'ts | brand-specific visual rules, banned words, disclaimers |
| Motion | pace (calm ↔ punchy), transition preference — read by reels on top of motion-doctrine |

**Quality bar:** outputs must look designed, not templated — no generic "AI slop" layouts. Every layout type is judged on real renders (Claude reads the PNGs), not on code alone.

### Step 7 — Approve (`modules/07-approve`)

No skills. In-house approval queue: reviewer sees the asset or action, what will happen, whether it can be undone; approves, rejects or requests changes. Approved = locked.

Writes: Approval.

### Step 8 — Publish (`modules/08-publish`)

Screen: schedule, publish status, engagement inbox (comments, DMs, reviews).

| Skill | Source | Job |
|---|---|---|
| schedule-social | DMP | Schedules posts at best times, approval-gated |
| publish-blog | DMP | Publishes articles to the client's CMS |
| launch-ad-campaign | DMP | Launches ads, approval-gated (see ads track) |
| ig-reply | IG | Drafts replies to comments, sorted by priority |
| ig-dm, ig-comment | IG | DMs; comments on other accounts |
| comment-responder | OT | Reply + DM lead flow — switched to approve-before-send |
| community-engagement-plan | OT | Engagement plan |
| review-response | DMP | Replies to Google reviews |
| Publisher service | EXORA | Instagram, Facebook, YouTube, WhatsApp posting |

Writes: Post, Ad. (External delivery blocked until connectors exist.)

### Step 9 — Results (`modules/09-results`)

Screen: dashboards, alerts, weekly/monthly client reports.

| Skill | Source | Job |
|---|---|---|
| performance-report | DMP | Trends, anomalies, recommendations |
| anomaly-scan | DMP | Spots spikes and drops with likely causes |
| attribution-report | DMP | Which channels drove results |
| creative-health | DMP | Creative fatigue (creative-fatigue-predictor.py, wired) |
| social-analytics-report | OT | Decision: keep, test, change, stop |
| analytics-readout | OT | Plain-language readout |
| ig-audit | IG | What past posts worked and what to stop |
| launch-retrospective | OT | Post-campaign review of what to repeat |
| client-report | DMP | White-labelled client report |
| continuous-improvement-loop | DMP | Learnings back into strategy |
| Performance memory | EXORA | Stores learnings by client and industry |

Writes: Metric, Report, Learning.

## Tracks

Tracks run alongside the 9 steps for the whole engagement. Same module contract, folder under `tracks/`.

### SEO and local SEO (`tracks/seo`)

| Skill | Source | Job |
|---|---|---|
| seo-plan | DMP | Scores 4 pillars; weakest leads the roadmap |
| tech-seo-audit, technical-seo | DMP | Technical baseline and fixes |
| keyword-cluster | DMP | Pillar and spoke page plan |
| local-seo, local-seo-audit | DMP | Google Business Profile, NAP, map pack, location pages, reviews |
| local, schema, landing-page, google-search-console | KJ | Local pages, structured data, landing pages, GSC setup |
| backlink-gap | DMP | Link prospects vs competitors |
| rank-monitor, seo-drift, content-decay-scan | DMP | Monthly movement and decay |
| programmatic-seo | DMP | Pages at scale (e.g. one per service per area) |
| reputation-management | DMP | Google review programme |

India playbook (EXORA, inside this track): a page per service, FAQ pages, sitemap in Search Console, Google Business Profile, plus Justdial and IndiaMART listings where relevant.

### GEO / AI search (`tracks/geo`)

| Skill | Source | Job |
|---|---|---|
| aeo-audit | DMP | Visibility across 6 AI platforms incl. Google AI Mode |
| geo-monitor | DMP | Tracks AI visibility over time |
| entity-audit | DMP | Brand entity consistency |
| gsc-ai-performance | DMP | Search Console AI performance report |
| ai-seo | CH | Optimising content for AI answers |
| geo | KJ | GEO tactics |

### Ads (`tracks/ads`)

| Skill | Source | Job |
|---|---|---|
| paid-advertising | DMP | Paid campaign structure |
| paid-social-brief | OT | Ready-to-run ad brief: tests and measurement |
| retargeting-strategy | DMP | Retargeting audiences |
| creative-testing-framework, ab-test-plan | DMP | Test roadmap with computed sample sizes (calculators wired) |
| budget-tracker | DMP | Spend pacing |
| meta-ads, google-ads, youtube-ads | KJ | Platform playbooks |
| PPC Strategist, Paid Social Strategist, Creative Strategist, Tracking Specialist, Paid Media Auditor | AA | Role prompts for the ads agent |
| launch-ad-campaign | DMP | Creates and launches, approval-gated (Step 8) |

India defaults: INR budgets, city-tier targeting, click-to-WhatsApp ads as a standard objective.

### Influencers (`tracks/influencers`)

| Skill | Source | Job |
|---|---|---|
| influencer-partnerships | OT | Whether a creator fits; collab brief |
| creator-outreach | OT | First contact message |
| ugc-creator-brief | OT | UGC creator brief |
| influencer-brief | DMP | Influencer brief with disclosure clauses |

All influencer content must carry ASCI disclosure labels.

### Managing (`tracks/managing`)

| Skill | Source | Job |
|---|---|---|
| team-assign | DMP | Assigns tasks by role and workload |
| status | DMP | One-page snapshot per client |
| exec-summary | DMP | Summary for leadership |
| client-proposal | DMP | Proposals for new clients |
| sop-library | DMP | EXORA's SOPs |

Built in code (no skill): task board, roles, deadlines, retainers in INR with GST on invoices.

## EXORA-built components

No repo covers these seven. Everything else is reused. They live in `exora/` (skills, data, templates) or `core/` (services).

| # | Component | What it does | Type | Done when |
|---|---|---|---|---|
| 1 | EXORA methodology | EXORA's fixed strategy format and order of work; wraps DMP/OT/CH skills | Skill + template | Strategy for a pilot client is approved by the marketer with only minor edits |
| 2 | Brand-profile extractor | Fills the full brand profile (colour roles, fonts, logo rules, shape, image style, density, tone) from uploaded files and past posts | Skill + script | Brand profile for 3 real clients needs no manual correction of colours or fonts |
| 3 | Indian festival and sale data | National and regional festivals, sale seasons, wedding season, IPL, by state and year | Data file read by region-config | Covers the next 12 months for Karnataka, Maharashtra, Tamil Nadu, Delhi NCR at minimum |
| 4 | Indian ad rules in check | ASCI advertising code, influencer disclosure, sector rules, DPDP consent for uploaded customer lists | Rules file added to DMP check | Flags a seeded set of non-compliant test ads |
| 5 | Publisher service | Posts to Instagram, Facebook, YouTube; sends WhatsApp broadcasts; only after approval | Code in core/connectors | A scheduled post goes live on a test account at the set time |
| 6 | Performance memory | Stores every Learning by industry, objective and pattern; Steps 2–4 read it before planning | Code in core/memory + skill | Step 3 cites at least one past Learning when one exists |
| 7 | EXORA design system (brand-neutral method) | ~10 layout types, grammar, checks and motion rules; every visual property comes from the client's brand profile | Skill + blocks + check script | Step 6 "done when"; each layout reviewed on renders with 3 contrasting test brands |

The design system's content (layout types, patterns) is owned by EXORA's design team; Claude drafts it and EXORA reviews it.

## Connectors and platform access

All connectors live in `core/connectors`; modules reach them only through `tools.yaml`. Client tokens are stored encrypted server-side and never passed through third-party MCP servers. Apply for API access in week 1 — approvals take days to weeks and are outside our control.

| Platform | Route | Read / write | Status |
|---|---|---|---|
| Meta Ads | Meta's official MCP server (mcp.facebook.com/ads, open beta since 29 Apr 2026, Business OAuth) | Read + write: reporting, campaigns, catalog, pixel diagnostics | Verify it can be called from our backend; fallback = own Meta app + App Review + Business Verification |
| Google Ads | Google's google-ads-mcp for reads; our own Google Ads API code for writes | MCP is read-only (only search and list_accessible_customers in its code) | Confirmed. Needs developer token from an EXORA manager account; Basic access required for live accounts |
| Instagram + Facebook posting | Instagram/Facebook Graph API (content publishing) | Write | To verify: App Review scope for publishing on client accounts |
| Instagram comments and DMs | Instagram messaging APIs | Read + write | To verify: App Review scope |
| WhatsApp | WhatsApp Business Platform (Cloud API) | Write broadcasts, read replies | To verify: setup per client number |
| YouTube | YouTube Data API | Upload, read stats | Standard Google OAuth |
| GA4 | Google Analytics Data API | Read | Standard Google OAuth |
| Search Console | Search Console API | Read | Standard Google OAuth |
| Client website | DMP publish-blog CMS connectors | Write | Per client CMS |
| Openverse | Public API, no key | Read | Confirmed |
| Apify, Gemini (for CF skills) | API keys | Read / generate | Optional; only if CF skills are enabled |

All connectors are deferred in the current build (user decision).

## Approvals, security and India compliance

**Always needs approval** (approval gate, logged with approver and reason):

- Publishing or scheduling any post, story or blog
- Sending any comment reply, DM, WhatsApp message or email
- Creating, launching, pausing or changing the budget of any ad
- Uploading a customer list to an ad platform
- Client strategy sign-off

**Standing approvals:** an admin may pre-approve narrow repeat actions (e.g. "pause any Meta ad with CPA over ₹500"), capped per day and expiring after 30 days, following DMP's autopilot pattern. (Not built.)

### Security

- Skills, prompts and client data stay on EXORA's servers; marketers access only the web app.
- Each module may call only the tools in its tools.yaml; no general web-request or SQL tool is exposed to agents.
- Client platform tokens encrypted at rest; scoped per client workspace.
- Prompt-injection checks before agent runs: content from comments, DMs, web pages and files is treated as data, never as instructions (copy.json / workspace.json marked untrusted in every design run).
- Offboarding: removing a user revokes web app access immediately.

### India compliance (enforced in check before approval)

- ASCI advertising code: no misleading claims; sector rules for health, finance, education, real estate.
- ASCI influencer guidelines: disclosure label on all paid or gifted creator content.
- DPDP Act: consent recorded before any customer list is uploaded for targeting; personal data minimised and deletable on request.
- Music and sound: licence stored on every audio asset; Openverse licences checked per file.
- GST on client invoices (Managing track).

**Compliance rule pack** (`exora/compliance/`, one file per area; each rule has source URL, reviewed date, severity, test example). Current state: one seed file `rules.json` with 3 heuristic rules.

| Area | Covers |
|---|---|
| ASCI Code | Truthful claims, misleading comparisons, decency, harmful situations |
| ASCI influencer guidelines | Disclosure on paid, gifted or affiliated creator content |
| ASCI sector guidelines | Health and wellness, education, real estate, financial products, food |
| CCPA guidelines | Misleading ads and endorsements; dark patterns (false urgency, hidden costs) |
| Drugs & Magic Remedies Act | Prohibited cure claims for listed diseases |
| DPDP Act | Recorded consent before uploading customer lists for targeting |

**Three-layer check before submission:** (1) rule scan in code, with sector triggers from the client's industry; (2) DMP check (eval-runner.py, ai-tell-scan.py) and verify-claims (claim-verifier.py) against client evidence; (3) a Claude reviewer skill that reads the rule pack and cites the rule for each finding. Error = blocks submission; warning = reviewer must acknowledge with a reason; info = shown.

**Done when:** a 50+ ad test set (good and bad, across sectors) scores ≥ 90% correct flags; every flag cites a rule; the pack has a named legal reviewer and review date. Rules must be sourced from official texts and legally reviewed before go-live.

## Build phases

About 16 weeks to the full platform. Week counts are estimates for a 3–4 developer team; ad writes depend on Meta and Google review times.

| Phase | Definition of done |
|---|---|
| 0 · Foundation | Login with roles works; all 13 records migrated; vendor/ holds all 12 repos with licences; Google developer token and Meta access applied for; Meta MCP backend test done |
| 1 · Core loop | For the pilot client, a marketer goes from onboarding to approved copy (Steps 1–5, 7) without leaving the web app; every action is in the audit log |
| 2 · Create + publish | Approved carousel and reel rendered in the client's brand; a post scheduled and published on a test account; comment replies go through approval |
| 3 · Results + tracks | Nightly metrics, weekly client report, at least one Learning saved and reused in the next plan; SEO and GEO audits run; one Meta campaign launched through the approval gate |

### Phase status and next phase (1 Nov 2026, commit `a1850be`)

Phases 0–3 screens, records, approvals and media exports exist. Phase 1.5 — make skills real — is in progress; 73/73 tests pass (incl. design engine and every declared skill tool).

| Work | Estimate | Done when | Status |
|---|---|---|---|
| Fix 1: skill execution (folders, manifests, DMP adapter, sandbox, receipts, core-loop skills, coverage page, golden tests) | 2–3 weeks | All 82 script-based skills pass self-tests; app hook scores equal hookscore.py; every Step 4–5 output has a receipt | **Mostly built.** Done: runner, receipts, DMP adapter, agent mode, coverage page, golden tests, hookscore parity, Step 4–5 receipts. Left: manifests + self-tests for the remaining ~71 scripts, container sandbox, release rule |
| Fix 2: Claude-made design and video | 3–4 weeks | Step 6 "done when" above | **Statics done; video partly.** Done: Claude composes statics and reels with preview/check/fix loops; brand-neutral design engine with 10 layouts; full brand profiles, font library, brand editor with live preview; 160-render multi-brand review. Next: Claude-run end-to-end check on the Mac with a real login; extractor for shape/density; seam-gate, sound (real-sound, earshot, Openverse), talking-head |
| Fix 3: compliance rule pack + three-layer check | 1–2 weeks + legal review | Compliance "done when" above | Not started (3 seed rules) |
| End-to-end check | 1 week | A real client runs Steps 1–9 with Claude connected; every output has receipts | Not started |

Build order inside each phase follows the module contract: database records first, then the module's skills and tools.yaml, then its screen.

## Open decisions

- [ ] EXORA methodology: written from a walkthrough of one real client job by the digital marketer, using DMP's flow as the skeleton (Phase 1).
- [ ] WhatsApp: its own track, or inside Step 8 publishing (currently inside Step 8).
- [ ] Meta route: official MCP from our backend, or own Meta app with App Review (decide after the week-1 test).
- [x] ~~Qlix agent runner vs Claude Agent SDK for v1~~ — decided 1 Nov: no Qlix; in-house approvals/jobs; Claude Code CLI agent mode for now.
- [ ] Which Indian languages ship in v1 (proposed: English, Hindi, Hinglish, Kannada).
- [ ] Whether CF skills (need Apify + Gemini keys) are enabled.
- [ ] Pilot client (proposed: SunKidz; seeded as illustrative, not verified research).
- [ ] Sandbox: Docker on the Mac now vs a small cloud server.
- [ ] Speech-to-text for talking-head editing: local Whisper vs hosted.
- [ ] Named legal reviewer for the compliance rule pack.
- [ ] Claude account: keep the Claude Code login for testing; move to an API key before team-wide use.
- [ ] Sign-off of the 10 layout types by EXORA's design lead (built; review renders with `node scripts/design-gallery.mjs`).
- [ ] Client-supplied (non-library) fonts: upload + licence check flow. The bundled OFL library covers Latin, Devanagari, Kannada and Tamil today; Telugu, Malayalam, Bengali, Gujarati still to add.
- [x] ~~Three test brands for the design review~~ — Kaveri Dental Studio, Ruh Atelier, SunKidz (+ EXORA).

## Sources

All repos were cloned and their skill files read on 1 Nov 2026.

- digital-marketing-pro · claude-content-skills (Ootto) · ootto-watch · instagram-agent-skill · marketingskills · social-media-skills · kostja94 marketing-skills · hyperframes · earshot · claude-youtube-editor · claude-video-effects · agency-agents · ai-agents-for-marketing (MarketingOS AI) · google-ads-mcp · Google Ads API developer token · Meta Marketing API access · Meta Ads MCP and CLI overview (mcp.directory)
