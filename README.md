# EXORA Marketing OS

Internal, India-focused marketing workspace. Next.js / React / Tailwind, PostgreSQL, in-house EXORA orchestration and approval engine, Claude integration, private local files and background creative rendering.

## Open locally

http://localhost:3100

- Email: `admin@exora.local`
- Initial local password: `ExoraLocal!2026`

Change the password in Settings. This is a loopback-only development installation, not a publicly deployed service.

## Start

```sh
cd /Users/ysw/EXORA/marketing
npm run local
```

This starts the isolated database on 127.0.0.1:55439, applies migrations, seeds only an empty database, starts the worker and runs the app on 127.0.0.1:3100. Data persists under `.local/`. Do not delete that directory to restart the application.

For separate processes: `npm run dev` and `npm run worker`. The worker must run for creative exports and scheduled jobs. Build validation: `npm run build`. Tests: `npm test`.

## Claude

Claude uses the locally installed Claude Code CLI and its account login, matching the EXORA MAKE-MONEY project. Open Settings and choose **Connect Claude**, or run `claude auth login` in a terminal. The app checks `claude auth status` and never needs an Anthropic API key. Generation runs in plan-only mode with tools disabled. Local templates remain available while Claude is disconnected.

## Workflow

1. Onboard a client, upload guides/logos, extract and edit the brand kit.
2. Create and refine strategy; record client sign-off through review.
3. Build a calendar, budget and UTM plan.
4. Generate and select hooks.
5. Create copy, scripts, captions, calls to action and run heuristic checks.
6. Render images, carousels and motion reels; download the actual files.
7. Approve, reject or request changes with a recorded reason. Approved assets are immutable; revise into a new version.
8. Prepare a schedule or ad action and approve it separately. External delivery remains blocked until connectors are implemented.
9. Import metrics with evidence labels, compute totals, create reports and save evidence-backed learnings for future generation.

Parallel tracks: SEO/local SEO, AI search, paid media, influencers and team management. Settings contains per-client module switches, local users/roles, password changes, workspace export, connector readiness, jobs and audit history.

## Repository

- `web/`: Next.js screens and API routes
- `core/`: database, auth, approvals, connectors, runtime, jobs and memory
- `modules/`: the nine module contracts, copied skills, tool allowlists, IO and screen exports
- `tracks/`: five specialist tracks using the same contract
- `workers/`: renderer and audio processing boundaries
- `exora/`: methodology, brand profiles (EXORA + test brands), bundled OFL font library, compliance and seasonal data

Design review: `node scripts/design-gallery.mjs` renders every layout for every test brand into `.local/design-gallery/`.
- `vendor/`: original upstream repositories, untouched with their licences
- `docs/`: inventory, verification, architecture decisions and delivery status

External account connectors are intentionally deferred by the user. No Qlix package or service is used.
