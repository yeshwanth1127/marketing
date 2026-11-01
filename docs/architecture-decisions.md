# Local implementation decisions

The source build plan is the product specification. The user explicitly deferred external connectors and explicitly replaced Qlix with in-house EXORA logic on 1 November 2026.

- **No Qlix dependency.** EXORA owns orchestration, approvals, audit and the Postgres job queue. All approval and execution checks run in server code. Claude is a content generation adapter only and never decides authorization.
- **Local PostgreSQL + private filesystem** replaces hosted Supabase for a self-contained localhost product. Client and twelve shared versioned record types have Postgres persistence. Typed views expose each record kind. Supabase can use the same PostgreSQL schema later; storage/auth require adapters.
- **Local password authentication** replaces hosted Clerk/Supabase Auth for localhost. Passwords are bcrypt-hashed; only session token hashes are persisted. HttpOnly, SameSite cookies; server role and client membership checks; immediate session revocation on offboarding. Bind application and database only to 127.0.0.1. This installation is not configured for public hosting.
- **EXORA jobs** uses row locks and SKIP LOCKED with an explicit queue table, rather than pg-boss. Jobs are claimable across workers. Connector jobs remain blocked; they never report success without external delivery.
- **Claude API adapter** loads selected primary skills and record context from module contracts. It exposes zero model tools while connectors are deferred. No unrestricted SQL, shell, network or third-party MCP credentials are available to the model. Local template mode is labelled and is not AI generation or live research.
- **Creative export** supports real PNG and MP4 output from brand-aware HTML. The installed HyperFrames CLI renders deterministic GSAP timelines to MP4. PNGs use Chromium. Audio cleanup uses FFmpeg. Each asset records its render engine.
- **Human review required:** methodology, extracted brand candidates, language quality, festival dates and compliance rules remain reviewable. Heuristics are not legal certification, voice recognition or evidence verification.
