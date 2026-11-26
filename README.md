# EXORA Marketing OS

An internal, India-focused marketing workspace. A marketer picks a company, brand or product, describes the outcome in a chat, and the assistant runs the work through a controlled pipeline: strategy, planning, content, creative rendering, human approval, publishing and reporting.

Built with Next.js, React, Tailwind, PostgreSQL, a background worker, and the Claude Code CLI.

New here? Read **[How it works](docs/how-it-works.md)** for a plain-language tour of the product.

## Contents

- [Quick start](#quick-start)
- [Using the app](#using-the-app)
- [Configuration](#configuration)
- [Commands](#commands)
- [Project layout](#project-layout)
- [Deployment](#deployment)
- [Safety and current limits](#safety-and-current-limits)
- [Troubleshooting](#troubleshooting)
- [Further documentation](#further-documentation)

## Quick start

### Prerequisites

| Requirement | Needed for |
| --- | --- |
| Node.js 22.9 or newer | App, worker, scripts and tests |
| PostgreSQL 16 client and server binaries | Local database |
| Bash | `npm run local`, backups and setup scripts |
| FFmpeg | Audio and video processing |
| Playwright Chromium | Image, carousel and video rendering |
| Claude Code CLI, logged in | AI generation (local templates work without it) |
| Python 3.10 to 3.12 (optional) | Specialist skill scripts and brand extraction |

### macOS

```sh
brew install node postgresql@16 ffmpeg
npm install
npx playwright install chromium
npm run local
```

### Linux or Windows (WSL)

The local scripts use Bash and default to the Homebrew PostgreSQL path, so set `PG_BIN`. On Windows, run these commands inside a WSL terminal, and install Node, PostgreSQL and FFmpeg inside WSL.

```sh
sudo apt install postgresql-16 ffmpeg   # Node 22.9+ must be installed separately
npm install
npx playwright install --with-deps chromium
PG_BIN=/usr/lib/postgresql/16/bin npm run local
```

The local launcher above is for macOS and WSL. For a Windows VS Code terminal, use PowerShell and provide a `.env.local` with a `DATABASE_URL` that matches a PostgreSQL server reachable from Windows. The checked-in `.env.example` uses the local development port and does not contain a database password. Do not run migrations or seed data until that URL is configured.

If you use the Codex provider, install the Codex CLI for the same Windows user that runs EXORA (`npm install --global @openai/codex`), then restart VS Code so its terminal reloads PATH and sign in with `codex login`. The Codex smoke script requires that CLI; Claude generation uses the separate Claude Code CLI.

If port 3100 is already occupied, keep the existing server or start another instance with a different port in PowerShell:

```powershell
$env:PORT = "3101"
npm run dev
```

### Sign in

Open <http://127.0.0.1:3100/assistant> and sign in:

- Email: `admin@exora.local`
- Initial local password: `ExoraLocal!2026`

Change the password in Settings. These defaults are for a local installation only.

`npm run local` starts PostgreSQL on `127.0.0.1:55439`, applies migrations, seeds an empty database, starts the worker, and runs the app on port 3100. Press Ctrl-C to stop the app and worker. PostgreSQL keeps running in the background.

> **Keep `.local/`.** It holds the database, uploads, renders and logs. You do not need to delete it to restart the app.

### Connect Claude

Open Settings and choose **Connect Claude**, or run:

```sh
claude auth login
claude auth status
```

Generation uses the Claude Code account login. No Anthropic API key is needed.

### Optional setup

```sh
npm run vendor:sync    # Fetch pinned upstream skill repositories into vendor/
npm run setup:python   # Create the Python environment for skill scripts
```

Run `vendor:sync` first, because part of the Python setup installs from `vendor/`.

## Using the app

The chat at `/assistant` is the main interface. The full workspace at `/` remains available for detailed administration, review and settings.

Work moves through nine stages:

| # | Stage | What happens |
| --- | --- | --- |
| 1 | Onboard | Add the client, upload guides and logos, and confirm the brand kit |
| 2 | Strategy | Run positioning, offer, funnel and growth-plan stages, then record sign-off |
| 3 | Plan | Build the calendar, budget and UTM plan |
| 4 | Hooks | Generate, score and select hooks |
| 5 | Content | Write copy, scripts, captions and calls to action, then run checks |
| 6 | Create | Render images, carousels and motion reels |
| 7 | Review | Approve, reject or request changes with a recorded reason |
| 8 | Publish | Prepare a scheduled post or ad action and approve it separately |
| 9 | Learn | Import metrics, build reports and save evidence-backed learnings |

Specialist tracks cover SEO, AI search (GEO), paid ads, influencers and team management.

Roles are **admin**, **marketer** and **reviewer**, with access granted per client. Approved assets are immutable, so changes create a new version.

## Campaign posts for apparel and other products

For clothing, footwear, jewellery and similar clients (the client's industry says so), image and carousel posts use the **studio campaign** layout instead of text cards: a real product is the hero, with one short uppercase headline, one support line and four tiny corner labels on a soft studio backdrop with grain and a contact shadow. Bordered cards, numbered circles, checklists on the image, buttons, arrows, emoji, neon accents and filler words like "Elevate" or "Unlock" are checked for and rejected.

**It needs real product photos.** Upload them under Files, and put a word like `product`, `look`, `lookbook`, `hoodie`, `shirt` or `outfit` in the file name (for example `product-polo.jpg`). Brand guides, banners, diagrams and earlier renders are never used as product photos.

- A normal photo is placed full bleed. A PNG with a transparent background is placed on the studio backdrop with a soft shadow.
- With no product photo the post becomes a typographic poster, and the asset says "upload a photo of the garment and make it again". Nothing is faked with icons or illustration.
- Background removal is not built in. Shoot on a plain backdrop, or supply a PNG that is already cut out.
- Pick a different layout when you make a visual, or set `product_image_file_ids` on an asset, to override the defaults.

`node scripts/design-gallery.mjs --layouts campaign` renders the layout for every test brand.

## Editing a generated video

Every video is backed by a **VideoDesign** document (colours, fonts, layout, motion and timed beats). The MP4 is rendered from it, so you can change a video without making it again. Open a video and choose **Edit**:

- Change the background, text colours, fonts, animation, logo and locale tag, caption bar and per-beat timing. The preview updates instantly in the browser.
- Click a word to make it italic, bold or a brand colour. Or type a change such as "make the word polo italic in red".
- **Design ideas** suggests alternative looks built from the brand kit. Colours and fonts stay on-brand unless you unlock off-brand.
- **Save** keeps a version. Undo, redo and revert to the original are always available. **Apply and render** makes the new MP4.

Visual edits never call a model or remake the narration. Only the beats you changed are re-rendered, so an edit takes about 10 seconds and a new 45-second video about 40 seconds. A failed render keeps everything it finished, and **Retry from the last good step** continues from there.

To bring back the old Claude-written film for every video, set `EXORA_VIDEO_COMPOSER=claude-film`. It is much slower and uses many more tokens. `node scripts/backfill-video-designs.mjs` creates designs for videos made before this feature. It runs safely more than once and never changes an existing MP4.

## Configuration

For local development, copy the template to `.env.local`:

```sh
cp .env.example .env.local
```

> Local scripts and the app read **`.env.local`**, not `.env`. The root `.env` is used by Docker Compose. Never commit either file.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `EXORA_INITIAL_PASSWORD` | Admin password used when seeding an empty database |
| `EXORA_ROUTER_PROVIDER` | Set to `claude` to route assistant turns through the Claude login |
| `EXORA_ROUTER_MODEL`, `EXORA_TALK_MODEL` | Claude models for routing and conversation |
| `OPENROUTER_API_KEY` | Optional OpenRouter routing and chat |
| `OPENROUTER_MODEL`, `OPENROUTER_TALK_MODEL` | OpenRouter model choices |
| `TYPESAFE_API_KEY`, `TYPESAFE_MODEL` | Optional fallback when no OpenRouter key is set |
| `EXORA_PUBLIC_ORIGIN`, `EXORA_ALLOWED_ORIGINS` | Public URL and allowed request origins |
| `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION` | Meta Marketing API app |
| `META_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN` | Meta OAuth and webhook settings |
| `EXORA_TOKEN_KEY` | 64 hex characters that encrypt stored client tokens (`openssl rand -hex 32`) |
| `PG_BIN` | PostgreSQL binary folder used by the local scripts |
| `EXORA_PYTHON`, `FFMPEG_BIN`, `CHROME_BIN`, `EXORA_CLAUDE_BIN` | Override tool locations |
| `EXORA_STRATEGY_DEPTH` | `full` restores long-form strategy text. The default is compact and about three times faster |
| `EXORA_STRATEGY_MODEL`, `EXORA_STRATEGY_EFFORT` | Claude model and effort (`low` to `max`) for strategy stages |
| `EXORA_DRAFT_MODEL`, `EXORA_DRAFT_EFFORT` | Claude model and effort for all other drafts |
| `EXORA_VIDEO_COMPOSER` | `claude-film` uses the old Claude-written film for every video. Unset, videos render locally from their design |
| `EXORA_EDIT_MODEL`, `EXORA_VOICE_RELAY_MODEL` | Small models for typed video edits and for relaying ElevenLabs calls (default `haiku`) |
| `WORKER_MEM_LIMIT`, `EXORA_RENDER_CHROMES` | Worker memory limit (default 2048m) and a cap on parallel render browsers. More memory means faster renders |
| `EXORA_CREATIVE_CLAW`, `CREATIVE_CLAW_TOKEN` | Allow generated footage layers through Creative Claw (MCP). Typographic videos never use it |
| `EXORA_REVISE_ATTEMPTS`, `EXORA_REVISE_MODEL` | How many times a caption that fails its lint is sent back to Claude to fix (1 to 3, default 2), and the model for that edit |

Do not set `EXORA_INITIAL_PASSWORD` in `.env.local` if you run the tests, because the test suite signs in with the default password.

## Commands

| Command | Description |
| --- | --- |
| `npm run local` | Start the database, migrations, seed, worker and app |
| `npm run dev` | Start only the Next.js dev server |
| `npm run worker` | Start only the worker, required for exports and scheduled jobs |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm test` | Run integration tests against `exora_marketing_test` |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Seed an empty database |
| `npm run backup` | Back up the database and files to `.local/backups/` and print the restore command |
| `npm run agent:smoke` | Smoke-test the assistant |
| `npm run design:smoke` | Smoke-test design generation |
| `npm run video:smoke` | Smoke-test video rendering |
| `npm run quality:smoke` | Check the caption quality path end to end: scorer packages installed, quality gate complete, hashtag cap enforced, lint findings structured. In Docker: `docker compose exec web node scripts/quality-smoke.mjs` (adds a "Quality smoke test" client) |
| `npm run setup:python` | Create the Python skill environment |
| `npm run vendor:sync` | Restore `vendor/` at the commits pinned in [docs/vendor-inventory.json](docs/vendor-inventory.json) |
| `node scripts/design-gallery.mjs` | Render every layout for every test brand into `.local/design-gallery/` |

## Project layout

```text
web/       Next.js screens and API routes
core/      Database, auth, agent, approvals, connectors, design, runtime and tools
modules/   Nine workflow modules with skills, tool allowlists and IO contracts
tracks/    SEO, GEO, ads, influencer and team-management tracks
workers/   Renderer and audio processing
exora/     Methodology, brand profiles, fonts, compliance rules and festival data
scripts/   Local setup, migrations, worker, backups and smoke tests
tests/     Integration tests and fixtures
deploy/    Nginx configuration
docs/      Architecture, deployment, status and vendor records
vendor/    Pinned upstream repositories, not tracked in git
.local/    Local database, uploads, renders and logs, not tracked in git
```

Database migrations are numbered SQL files in [core/db/](core/db/).

## Deployment

Production runs with Docker Compose: PostgreSQL, the web app and the worker. The web app binds to `127.0.0.1:8108` behind a shared nginx gateway.

This repository is not ready to deploy on Vercel. The app stores uploads, generated media and job files under `.local/`, and its separate worker shares those files with the web process. Vercel Functions do not provide persistent shared local storage or a continuously running worker by default. The request handler also launches locally installed provider CLIs and rendering tools, which are not available in a standard Vercel function. A Vercel deployment needs durable object storage, a separately hosted worker with the required rendering/provider runtimes, and a production PostgreSQL URL before it can safely handle uploads and jobs. Use the Docker Compose deployment below for production in the current architecture.

```sh
cp .env.production.example .env   # Fill in every secret
mkdir -p data/local
docker compose up -d --build
docker compose exec web claude auth login
curl -sS http://127.0.0.1:8108/api/health
```

Follow [docs/deploy-server.md](docs/deploy-server.md) for DNS, TLS and Meta setup, then complete [docs/server-verification-checklist.md](docs/server-verification-checklist.md).

Set a strong `EXORA_INITIAL_PASSWORD` before the first start. Keep the `marketing_pg` and `claude_home` Docker volumes when recreating containers, because they hold the database and Claude login.

## Safety and current limits

- **Meta actions can spend real money.** An approved launch creates an `ACTIVE` campaign and ad set on the connected ad account. Check the budget, audience and account before approving.
- **WhatsApp sends are real.** An approved send goes to the recipient through the connected WhatsApp Business number.
- **Other external platforms are not connected.** Their publish actions are blocked and are never reported as sent.
- **Compliance checks are heuristic.** They do not replace legal or regulatory review. 2027 lunar festival dates are provisional.
- **SunKidz is illustrative pilot data**, not verified client research.
- **Some tests were failing at the last recorded run.** On 2 November 2026, 108 tests passed and 7 failed, in agent conversation and audio conversion. Run `npm test` for the current state.

See [docs/delivery-status.md](docs/delivery-status.md) for the wider feature status. Parts of it predate the Meta connector.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `pg_isready: No such file or directory` | Set `PG_BIN` to your PostgreSQL `bin` folder |
| Exports or scheduled jobs stay queued | Make sure the worker is running and read `.local/worker.log` |
| Claude shows as disconnected | Run `claude auth status`, log in, then refresh Settings |
| Environment changes have no effect | Put local values in `.env.local` and restart |
| Renders fail | Run `npx playwright install chromium` and confirm FFmpeg is installed |
| Skill scripts fail | Run `npm run vendor:sync`, then `npm run setup:python` |
| Database will not start | Read `.local/postgres.log` |

## Further documentation

- [Local runbook](docs/runbook.md)
- [Server deployment](docs/deploy-server.md)
- [Server verification checklist](docs/server-verification-checklist.md)
- [Architecture decisions](docs/architecture-decisions.md)
- [AI agent design](docs/ai-agent.md)
- [Products and brands](docs/products-and-brands.md)
- [Delivery status](docs/delivery-status.md)
- [Vendor verification](docs/vendor-verification.md)
- [Latest build handoff](SESSION_BUILD_HANDOFF.md)
