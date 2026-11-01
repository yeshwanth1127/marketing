# Local delivery status

## Implemented and locally testable

- Next.js / React / Tailwind workspace with nine workflow screens, five tracks, library and settings.
- PostgreSQL Client plus twelve shared versioned record kinds, schema migrations and isolated test database.
- Local authentication, admin / marketer / reviewer roles, per-client membership, password change, offboarding and revocation.
- Four-part contracts for all fourteen modules; server-side primary skills copied from the twelve pinned source repositories with licences and source attribution.
- EXORA-owned runtime, skill selection, untrusted-content checks, tool allowlists (no external tools enabled), Claude API adapter and labelled no-key templates.
- Client onboarding, uploads, brand colour/font extraction candidates, editable brand voice and profile.
- Strategy documents, client sign-off review, campaign budgets, calendar slots, UTM scheme, regional seasonal planning dates.
- Scored hook options with selection, copy/script/caption/CTA editing, editorial claim/disclosure checks.
- EXORA design engine: brand-neutral method with 10 layout types in 4 placements, full per-client brand profiles (colour roles, type incl. Indic scripts, shape, pattern, density, motion), bundled OFL font library, brand editor with live preview, and a 160-render multi-brand review gallery (`node scripts/design-gallery.mjs`).
- Actual PNG images, carousel slides and HyperFrames MP4 exports; media download library; original recording denoise, loudness normalization and trimming through FFmpeg.
- Review queue with reasons, immutable approved assets, revision lineage, separate approval of scheduled posts and ad actions.
- Durable scheduled jobs that recheck approvals; unconfigured external actions become blocked and never claim publication.
- CSV/manual metric input, real/estimated/inferred labels, computed verified totals, reports, evidence-backed Learning reuse.
- SEO, AI search, paid-media and influencer planning documents; task board; draft INR/GST retainer invoices.
- Module switches, account status, audit trail, job visibility, Markdown document download and JSON workspace export.

## Requires configuration or client input

- An authenticated Claude Code CLI session is required to exercise actual Claude generation, translations and specialist skill outputs. Run `claude auth login` or use the Settings connection button. Local templates contain English starter text and explicitly flag translation needs.
- Verified brand/offer data, approved photos, client methodology walkthrough and actual reporting evidence. SunKidz is seeded as an illustrative pilot, not verified client research.
- Review of extracted colours/fonts, current compliance rules, regional dates and rights. The seeded heuristic checks are not comprehensive regulatory validation. 2027 lunar dates are marked provisional.

## Deferred or incomplete compared with the full plan

- All external platform connectors, OAuth, publishing, messaging, ad writes, automatic metric ingestion and live SEO/GEO/reel research (explicitly deferred by the user).
- Hosted Supabase and Clerk are replaced by local PostgreSQL/files and local auth for localhost; see architecture decisions.
- Advanced timeline editing, automated talking-head silence/cut decisions, face-tracked 45-effect VFX, earshot listening/sync evaluation, Openverse discovery/rights ingestion, generative graphics via Gemini and Apify ingestion are not wired into the local UI. Their applicable upstream skills remain vendored.
- Automated nightly connector ingestion and recurring weekly report scheduling await connector implementation. Reports can be generated manually now.
- Narrow standing approvals, production-grade queue reconciliation UI, public hosting hardening, comprehensive legal-rule coverage and formal multi-language quality grading are not complete.
- Multi-source attribution charts, drag-and-drop calendar editing and client-facing report styling are future refinements; verified daily trend charts, tabular totals and editable calendars are implemented.

## Verification

Production build and TypeScript compilation passed. All 48 integration tests passed (incl. design engine, brand-profile validation and multi-brand renders). The integration suite covers authentication, isolation, roles, module contracts, generation, approval/version invariants, scheduling authorization, compliance flags, metrics, memory and revocation. HTTP smoke tests cover all seventeen routes plus real queue → carousel → private download → review submission. Local media smoke tests produced image, carousel and a verified twelve-second HyperFrames MP4.

Browser sign-in and dashboard were visually inspected. Subsequent browser interaction became unavailable because local browser use was disabled in Work settings; later checks used HTTP, database integration tests and direct output-file inspection.
