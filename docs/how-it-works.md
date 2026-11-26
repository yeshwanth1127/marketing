# How EXORA Marketing OS works

A plain-language tour for anyone using or running the product. No coding knowledge needed for the first four sections.

## 1. What it is, in one minute

EXORA Marketing OS is an internal workspace for running marketing for Indian clients. You pick a client, tell the assistant what you want in normal language ("plan a Diwali campaign for the gift box"), and it does the work step by step: strategy, plan, ideas, writing, designs and videos, review, publishing and reporting.

Three ideas run through everything:

1. **One chat does everything.** You talk to an assistant. It uses the same tools and records as the rest of the app, so nothing happens that you can't see in the app.
2. **Nothing goes out without a human saying yes.** Content must be approved by a person before it can be posted or used in ads.
3. **It never invents facts.** If the assistant doesn't know a price, a claim or a number, it asks you. Missing answers are reported as gaps, not guessed.

## 2. The cast: who and what you deal with

| Thing | What it is |
| --- | --- |
| **Company, brand, product** | The people you do marketing for. A company can have brands and products. Each one is its own workspace. |
| **Assistant** | The chat at `/assistant`. It understands your request and runs the right tool. |
| **Claude** | The AI that writes strategy, copy and scripts. It runs through the Claude Code login, so no API key is needed. |
| **Design engine** | Turns brand colours, fonts and layouts into real images, carousels and videos. |
| **Worker** | A background process that renders files and runs scheduled jobs. If it is off, exports and schedules sit waiting. |
| **Database** | PostgreSQL. It stores every record, approval and log. |

### Companies, brands and products

```
Rang Textiles        company
└── Rang Bridal      brand
    ├── Bandhej saree  product
    └── Lehenga        product
```

- A product inherits its brand's look, banned words, legal lines and proof, and the company's strategy as background.
- Siblings never see each other's work. One product can't peek at another.
- Totals (spend, results) add up the tree automatically. Numbers are entered once, at one level, so nothing is counted twice.
- You can give someone access to a single product only.

## 3. The nine stages

Every piece of work moves through these stages. The assistant picks the right one for you, so you don't have to click through them.

| # | Stage | What you get |
| --- | --- | --- |
| 1 | **Onboard** | A client record and a brand kit: colours, fonts, voice, words to avoid. You can upload a brand deck or logo and it reads the colours, fonts and text from it. |
| 2 | **Strategy** | A written strategy built in four steps: positioning, offer, funnel and channels, then growth plan. The client signs it off before work continues. |
| 3 | **Plan** | A content calendar, a budget in rupees and a tracking-link (UTM) scheme. It includes regional festival dates. |
| 4 | **Hooks** | Opening lines for posts, scored so you can pick the strongest. |
| 5 | **Content** | Copy, scripts, captions and calls to action, plus automatic checks for risky claims and missing disclosures. |
| 6 | **Create** | Real image files, carousel slides and short videos in the brand's style, ready to download. For apparel and other products, posts are studio campaign layouts built around the client's real product photos (see the README). |
| 7 | **Review** | A person approves, rejects or asks for changes, and has to give a reason. |
| 8 | **Publish** | A scheduled post or ad action, approved separately before it is sent. |
| 9 | **Learn** | You import results, the app totals them and builds reports, and the lessons feed back into future work. |

There are also five side tracks: SEO, AI search visibility, paid ads, influencers and team management.

## 4. A walk-through of one request

You type: *"Make a Diwali Instagram post for the gift box."*

1. **Understand.** The assistant works out what you want and which tool fits. It only uses tools your role is allowed to use.
2. **Ask.** If something is missing (offer, audience, language, budget), it asks. Skip optional questions by saying "skip".
3. **Confirm.** Before it saves anything important, it shows the exact values and waits for you to confirm.
4. **Work.** A background job starts. You see the real status, elapsed time and the steps it takes. You don't see invented progress bars.
5. **Check.** The result goes through automatic checks: claims without proof, missing disclosures, banned words.
6. **Create.** The design engine renders the post with the brand's colours, fonts and layout.
7. **Review.** A reviewer opens the exact version, then approves or sends it back with a reason.
8. **Lock.** Once approved, that version can't be edited. Changes create a new version.
9. **Schedule.** Posting is a separate approval. Just before it runs, the system re-checks that the approved version is still the one being sent.

## 5. Safety rules built into the product

- **Approved means locked.** You revise by making a new version, which keeps a clear history.
- **Two approvals for going live.** The content, then the publish action, each get their own approval.
- **Roles.** `admin` sees everything. `marketer` creates and edits. `reviewer` approves and rejects. Access is granted per client.
- **No guessing.** Unanswered inputs appear as assumptions or gaps. Claims need proof with a source and date.
- **Everything is logged.** Changes, approvals, jobs and tool runs go into an audit trail.
- **Untrusted content is treated as data.** Text from uploaded files can't give the assistant instructions.
- **Daily limit.** Each user gets 200 assistant turns a day by default. It resets at midnight India time.
- **Heuristic checks are not legal advice.** Compliance checks catch common problems but don't replace legal review.

### Things that have real-world effect

- **Meta ads:** an approved launch creates a live (`ACTIVE`) campaign on the connected ad account and can spend money. Check the budget and account first.
- **WhatsApp:** an approved send goes to a real recipient.
- **Other platforms:** not connected. Those actions are blocked and are never reported as sent.

## 6. How it's built (for developers and operators)

```
Browser ──► Next.js app (web/)  ──►  API + business rules (core/)  ──►  PostgreSQL
                │                          │
                │                          ├─► Claude Code CLI  (writes strategy, copy)
                │                          └─► Job queue (database table)
                │                                      │
                └──────────────────────────────►  Worker (scripts/worker.mjs)
                                                       ├─ Chromium: images
                                                       ├─ HyperFrames: videos
                                                       └─ FFmpeg: audio
```

- **`web/`** has the screens and API routes. `/assistant` is the chat and `/` is the full workspace.
- **`core/`** holds the rules: login and roles, approvals, the agent that picks tools, the Claude adapter, the design engine, the Meta connector and the job queue.
- **`modules/`** has one folder per stage. Each lists what it reads, what it writes, whether approval is required, and the AI skill instructions it uses.
- **Jobs** move through `queued → running → completed / failed / blocked`. Several workers can run at once without collisions. An external action is never retried automatically after an unclear failure, so nothing is sent twice.
- **Claude** works in a throwaway folder holding only the chosen skills and the client's data. It can run only the scripts belonging to those skills, and web tools are off.
- **The assistant router** can use Claude itself (`EXORA_ROUTER_PROVIDER=claude`) or OpenRouter, if a key is configured.
- **Skills** are written instructions plus helper scripts copied from twelve pinned upstream projects. They are listed in [vendor-inventory.json](vendor-inventory.json).

## 7. Running it

| You want to | Do this |
| --- | --- |
| Use the app (Docker) | Open <http://localhost:8108/assistant> |
| Start or stop (Docker) | `docker compose up -d` and `docker compose stop` |
| Connect Claude (Docker) | `docker compose exec web claude auth login`, then paste the code in that terminal |
| Run without Docker | `npm run local`, then open <http://127.0.0.1:3100/assistant> |

Start the Docker stack only with `docker compose`. Running the `exora-marketing` image alone crashes with `ECONNREFUSED 127.0.0.1:55439`, because it has no database. See the main [README](../README.md) for full setup.

## 8. Glossary

| Term | Meaning |
| --- | --- |
| **Brand kit** | A client's colours, fonts, logo, voice and words to avoid. |
| **Hook** | The opening line that makes someone stop scrolling. |
| **UTM** | Tags added to links so results can be traced to a campaign. |
| **Job** | A task that runs in the background, such as a render or a strategy draft. |
| **Worker** | The program that runs jobs. |
| **Receipt** | A record that a skill or script ran, and what it produced. |
| **Approved version** | A locked copy of a record that can't be edited. |
| **Evidence label** | Whether a number is real, estimated or inferred. |

## 9. Current limits

- Compliance rules and 2027 lunar festival dates are starter data and should be reviewed.
- SunKidz and the test brands are sample data, not real client research.
- The strategy method is a starter template that should be tuned with a real client.
- Automatic metric collection and weekly report scheduling aren't built yet. Reports are generated by hand.
- At the last recorded run (2 November 2026), 7 tests were failing. Run `npm test` for the current state.
