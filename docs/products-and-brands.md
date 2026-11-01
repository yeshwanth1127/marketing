# Products and brands

Decided 1 Nov 2026. A company can have brands and products. Each brand and product is a client with a parent, so the existing client isolation keeps siblings apart, and the platform follows the parent link to share brand, strategy and proof down and add results up.

## Decisions

| # | Decision |
| --- | --- |
| D1 | Shapes allowed: company → product, or company → brand → product. No deeper, no loops. |
| D2 | One post or ad = one product, or company-wide. A bundle (e.g. a Diwali gift box) is its own product. |
| D3 | Variants (sizes, flavours, packs) are a list inside the product brief. |
| D4 | People can be limited to a product: add them to that product only. |
| D5 | A product-only person sees the company brand inside their product but cannot open, change or approve company or sibling work. |
| D6 | Clients with no products look and work exactly as before. |

## Structure

```
Rang Textiles        company  (no parent)
└── Rang Bridal      brand    (parent = Rang Textiles)
    ├── Bandhej saree  product (parent = Rang Bridal)
    └── Lehenga        product (parent = Rang Bridal)
```

- `clients.parent_id` and `clients.node_type` ('brand' | 'product'; empty = company). Depth and loop rules enforced in the database.
- City, languages, region, industry and tier are copied from the parent when a product is made and can be edited.
- Settings (steps on/off, creator content) pass down live; a product stores only what it changes.
- Product brief (in the product's data): description, category, sector, audience, price or offer, selling points, variants, where sold, proof for claims with source and date.
- An admin can move an existing client under a company (audited, depth rule applies).

## Every step runs per product

| Step | Per product | From the brand and company |
| --- | --- | --- |
| Client & brand | Product brief, own uploads, own look if wanted | Brand kit by default |
| Strategy | Own strategy, client sign-off | Brand and company strategy as context |
| Calendar & budget | Own plans and money | Campaigns marked company-wide (hold no money) |
| Ideas, writing, design & video | Own work | Brand look, banned words, proof, lessons |
| Review, posting, ads, results | Own | Added up at brand and company |
| Search, AI answers, creators | Per product or at company level | — |
| Team | Tasks per product | Invoices at company level only |

## What passes down, what never moves

- Down: the brand kit (the nearest level that has one is used whole), plus banned words, legal lines and proof added from every level above. Strategy, lessons, company-wide campaigns, and the logo and files the brand kit points to.
- Name on creatives: the nearest brand or company name, never the product name.
- Up: counts, spend, results, calendar and review items, calculated in the database, nothing copied.
- Sideways: nothing. A product never sees a sibling's work, files, proof, scores or lessons.

## How it is built

Three shared functions in `core/clients/tree.mjs`, used by every caller:

- `resolveClient(node)`: effective settings, display name, chain. Never writes inherited values back.
- `brandFor(node)`: merged brand kit and the file ids it may use.
- `contextRecords(node, kinds)`: the node's own records first, then inherited Strategy, Learning, BrandKit and company-wide Campaigns from above.

Callers switched to them: generate and its checks, save-record checks, worker designer and tool jobs, DMP adapter (history filed by client id, not name), design catalog, brand preview, render and logo lookup, file access, approvals, settings and client edit, seasonal context.

## Access, delete, export, numbers

- Access: member of the node or anything above it. Adding a product needs access to its parent.
- Delete: deleting a company or brand deletes everything under it, deepest first, in one transaction, after listing every product. Deleting a product deletes only it.
- Export: the whole tree — clients, items, file list, history and merged brand.
- No double counting: each rupee and number is entered at one level; an import row repeated anywhere in the company (same source, metric, date, campaign) is rejected.
- Company and brand views: totals for everything below; clicking an item opens its product; one review queue across everything the reviewer can see.

## Build order

1. Database, `tree.mjs`, access, add / move / delete, leak tests.
2. Switch every caller to the shared functions.
3. Screens: tree picker, add brand and product with brief, inherited-brand panel, product labels.
4. Company views, totals, review queue, duplicate-number check, tree export.

## Tests

| Test | Proves |
| --- | --- |
| Claude's input for the saree | Nothing from the lehenga |
| Saree-only user opens lehenga or company | Refused |
| Claim proven only for the lehenga, checked on the saree | Unverified |
| Saree render | Company logo used; company banned words flagged |
| Company totals | Equal the sum of the parts; duplicate import rejected |
| Delete company | Every product, its files and history removed |
| Existing suite | Unchanged |
