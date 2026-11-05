# EXORA Conversational Assistant — Session Build Handoff

Date: 2 November 2026  
Project: `/Users/ysw/EXORA/marketing`  
Local URL: `http://127.0.0.1:3100/assistant`

## What was built

This session added a conversational operating surface on top of the existing EXORA Marketing OS. The existing records, permissions, reviews, generation jobs, scripts, audit history, files, and client hierarchy remain the source of truth. The assistant calls those existing capabilities rather than introducing a second workflow.

The first version exposed a dashboard, nine-step navigation, counters, campaign filters, work and activity tabs, and a side panel. After review, that shell was removed. The final interface is intentionally one chat screen.

The visible interface now contains only:

- EXORA identity
- company, brand, or product selector
- `＋ New client` at the bottom of that selector
- Claude connection status
- the conversation
- file attachment and message input
- inline progress, errors, results, previews, confirmations, and approvals

Uploads support PNG, JPEG, WebP, PDF, PowerPoint (`.ppt` and `.pptx`), TXT, CSV, MP4, MP3, and WAV files up to 20 MB. PowerPoint brand decks can be used as source material; `.pptx` text, theme fonts, and theme colours are extracted for the brand-kit workflow.

The nine marketing stages still run underneath the conversation:

1. Onboard
2. Strategy
3. Plan
4. Hooks
5. Content
6. Create
7. Review
8. Publish
9. Learn

Users do not need to navigate these stages manually. The agent selects the appropriate existing tool, asks only for missing information, shows the exact input before consequential work, and returns the user to the conversation.

## Main implementation

### New assistant route

- `web/app/assistant/page.tsx`
  - Adds the server-rendered `/assistant` route.
  - Reads the existing agent tool catalogue on the server.
  - Passes only serializable tool metadata to the client interface.

- `web/app/assistant/assistant.css`
  - Provides the assistant-specific layout and responsive styling.
  - The final rules collapse the experience into one full-height conversation surface.

- `web/components/Assistant.tsx`
  - Implements the chat interface, client switching, new-client entry, uploads, guided questions, streaming responses, live activity, record previews, human review, and tool execution.

### Existing workspace entry point

- `web/components/Workspace.tsx`
  - Adds a link to the guided assistant from the existing workspace.

## Conversation flow

1. The user chooses a company, brand, or product in the top selector.
2. The user describes the desired outcome in normal language.
3. The existing agent router selects an allowed tool for the user’s role and current client level.
4. If required facts are missing, the assistant asks for them. Structured choices open in a focused guided dialog.
5. Before a confirm-risk action is saved, the assistant displays the exact values and waits for confirmation.
6. Claude generation and declared scripts use the existing job and tool APIs.
7. Actual job status, elapsed time, tool events, errors, and results appear inline in the conversation.
8. Saved records and output cards can be opened without leaving the assistant.
9. Reviewers can inspect an exact snapshot and record approve, request-changes, or reject decisions.

## Client creation

The company/brand/product selector includes `＋ New client`. Selecting it opens the existing `create_company` guided workflow. It collects the fields defined by the current agent catalogue and uses the existing confirmation and client-creation backend logic.

The option is hidden for reviewer-only accounts because they cannot create clients.

## Data collection

The guided workflow is generated from the existing tool catalogue, including both closed choices and open fields. Required fields cannot be skipped. Optional fields can be explicitly left unspecified, and those decisions are passed back to the existing intake engine.

Draft generation preserves the important inputs used by the current system, including objective, audience, offer, channels, timing, success measure, source content, call to action, language, format, budget, specialist skill, references, and campaign context when available.

Product brief editing preserves structured selling points, variants, and claim evidence.

## Visibility while work runs

The assistant uses the engine’s real state rather than invented progress percentages. It shows:

- streaming route, question, confirmation, result, talk, and error events
- queued and running background jobs
- actual job status and elapsed time
- completed outputs and failure messages
- saved audit events
- skill and script receipts when attached to a result

Internal Claude reasoning is not exposed by the current engine and is therefore not shown.

## Existing functionality reused

The assistant calls the existing APIs and rules for:

- authentication and roles
- client, brand, and product hierarchy
- agent turns and persistent conversation state
- tool allowlists and intake schemas
- uploads and client-scoped files
- Claude CLI generation
- specialist scripts and receipts
- background jobs and runs
- record versioning and locked versions
- human approval
- scheduling review items
- metrics, reports, and learnings
- audit history

No Qlix integration was added. Claude authentication continues to use the CLI-based method already adopted by the project.

## Verification performed

- Production build completed successfully with TypeScript checks.
- `/assistant` rendered successfully on localhost.
- Client selection and guided draft opening were checked in the browser.
- A declared specialist script was run through the assistant and its result appeared in the inline activity/audit flow.
- The new-client selector path compiles and uses the existing `create_company` tool.

The production build still emits two pre-existing Turbopack warnings about dynamic filesystem access in `core/tools/runner.mjs`. They do not prevent the build.

The full test run reported 108 passing and 7 failing tests. The failures were in existing agent conversation expectations/concurrency and audio conversion. No backend behavior was changed as part of the final chat-only UI correction.

## Running locally

From the project folder:

```bash
npm run local
```

Then open:

```text
http://127.0.0.1:3100/assistant
```

The initial development login remains documented in `README.md`. Change it from Settings for any continuing local use.

## Current product boundary

The assistant is the primary operating interface. The older full workspace remains available for detailed administration and legacy views, but it is not required for the normal conversational workflow. External connectors remain deferred as requested.

## Update — staged Strategy (2 November 2026, evening)

Strategy no longer runs Growth Plan, Positioning Audit and Offer Design in one Claude call. One strategy job now runs four stages in order, each its own Claude run:

1. Positioning audit (`positioning-audit`, plus `competitor-positioning` when competitors are given)
2. Offer design (`offers`), reading stage 1
3. Funnel & channels (`funnel-architect`), reading stages 1–2
4. Growth plan (`growth-plan`), last, reading all three; its Part 1–7 pre-conditions are mapped onto the earlier stages instead of refusing

The final Strategy record keeps `foundations` (stage outputs), `inputs_ledger` (each answer marked user_provided / not_provided / no_proof) and `pipeline` (per-stage skills, receipts, duration). Unanswered inputs are reported as assumptions or gaps, never filled in as facts. A failed stage stops the job with "Stage N (…) failed".

Inputs are asked in the same stage order in both the chat (one question at a time, "skip" for optional, "keep" for a saved audience or offer, then a confirmation listing what is missing) and the guided dialog (stage heading above each question). The guided dialog now submits through the chat turn, so the run appears in the conversation.

While a draft job runs, a small live window (bottom-right) shows the stages, the current skill and the visible actions it takes: instructions and references read, scripts run, results written, and errors. It is built from the Claude CLI event stream and saved to the new `jobs.progress` column. Hidden reasoning is not shown.

Files: `core/agent/strategy-fields.mjs`, `core/runtime/strategy.mjs`, `core/runtime/progress.mjs`, `core/db/006-job-progress.sql` (new); `core/runtime/index.mjs`, `core/runtime/agent.mjs`, `core/agent/execute.mjs`, `core/agent/turn.mjs`, `core/agent/jobs.mjs`, `core/api.mjs`, `web/app/assistant/page.tsx`, `web/components/Assistant.tsx`, `web/app/assistant/assistant.css`, `tests/agent.test.mjs` (changed). Originals are backed up in `.local/backup-strategy-pipeline-20261102/`.

**Resume.** Each finished stage's result is saved on the job (`jobs.progress.results`). When a strategy stops, the live window shows "Resume from <stage>". This calls the `resume-strategy` action, which queues a new job with the same inputs, reuses the finished stages (marked "reused") and runs from the failed one. Growth Plan is never reused.

Restart `npm run local` (applies migration 006 and reloads the worker), then run `npm test` and `npm run build`.
