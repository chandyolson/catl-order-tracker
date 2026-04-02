# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-02 (major feature session — custom line items, browse drive, task assignment, list view)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **GitHub token**: stored in Claude memory (scrub from remote after push)
- **Git config**: user.email `chandy@catlresources.com`, user.name `Chandy Olson`
- **Last commit**: `825e246` on `main` branch

## User Preferences
- NO horizontal or vertical scrollbars. Sections expand to fit content.
- Bullet points in the chat assistant, not paragraphs
- Show wireframes before building major layout changes
- Use rancher language in the AI assistant
- ChuteSide design system colors everywhere — no off-brand blues or greens
- **DESIGN RULE: Every create needs a delete.** If you can add something, you must be able to remove it.

## What Equipment Tim Sells
- **Moly Manufacturing**: Silencer squeeze chutes (Ranch, HD, CP, MAXX, Tilt, Wide Body variants)
- **Daniels**: Alleys, loading chutes, panels
- **Rawhide**: Portable processors
- **MJE/Conquistador**: Wheel corrals, calf tables
- **LEM/Rupp**: Calf tables
- **Linn**: Gates, panels, tubs

## Current State of the App

### Pages
- **Dashboard**: Pipeline, stat cards, action items, leads, chat assistant (440px, word-wrap fix), voice memos
- **Orders**: List with search, filter by status/mfg/inventory. **Condensed list view toggle + ETA filters** (this week, this month, overdue, no ETA)
- **Order Detail**: Overview tab (customer, tasks w/delete, timeline, doc chain w/**Browse Drive** + manual linking), Financials, Compare, Estimates
- **Edit Order**: Two-column layout, navy receipt card, options configurator, **custom line items section**
- **New Order**: Freight input on estimates, custom line items
- **Estimate Detail**: **Send Estimate button** (works for standalone estimates)
- **Tasks**: Filters by status/priority/source/**assignee**. Task assignment (Tim/Caleb/Chandy/Jen), @name chips
- **Voice Memos**: Edit summary inline, archive/restore, delete, reprocess, link to customer/order

### Document Chain (6 slots per order)
1. CATL Estimate → from QuickBooks
2. CATL Purchase Order → from QuickBooks
3. Mfg Sales Order → from Moly email / Drive folder
4. Mfg Invoice → from Moly email / Drive folder
5. QB Bill → from QuickBooks
6. Customer Invoice → from QuickBooks

NOTE: `signed_moly_so` removed from UI — never existed in DB.

### Document Chain Status
- 27/192 slots filled, 73 order_documents
- **Browse Drive (NEW)**: `list-drive-files` v1 — Browse button on each empty slot, lists ALL files in Drive folder
- **Compare Documents (v4)**: Total-only comparison fallback when line items unavailable
- 32 orders have slots, 22 have Drive folders linked

### Custom Line Items (NEW)
- Ad-hoc priced items: spool valves, bottle holders, miscellaneous
- NewOrder + EditOrder: name (free text), retail price, cost price per item
- Saved to `selected_options` with `is_custom: true, option_id: null`
- Flows through receipt card → email → QuickBooks

### Chat Assistant (v8)
- BLOCKED: Anthropic API $0 balance. Needs credits at console.anthropic.com
- Real error messages, API key pre-check, catalog loaded only on spec questions
- Uses claude-sonnet-4-20250514

### Task Assignment (NEW)
- Team: Tim, Caleb, Chandy, Jen
- @name chips, assign via dropdown, "Assigned" filter, assign on create

### Edge Functions (45+)
- `chat-assistant` v8, `qb-check-sync` v8, `qb-push-estimate` v56 (freight + custom items)
- `send-estimate` v72 (standalone + freight), `list-drive-files` v1 (NEW)
- `compare-documents` v4 (total-only fallback), `drive-scan-documents` v4
- `link-document-to-slot` v1, `gmail-scan` v2, `gmail-download-attachment` v2
- `drive-watch-memos` v4, `reprocess-stuck-memos` v1

### Database
- `orders` — 32 orders
- `order_document_slots` — 192 total, 27 filled
- `tasks` — has `assigned_to` column
- `voice_memos` — has `archived` boolean column
- `paperwork` — document_type constraint includes `manual_task`
- `estimates` — 1 standalone (2026EST-001)
- `customers` — 2,307 records
- `qb_tokens` — valid till July 2026

## Known Issues

### Critical
1. **ANTHROPIC API $0 BALANCE** — Chat assistant blocked. Add credits.
2. **Status not saving** — All orders show `order_pending`. Needs browser console debug.

### Medium
3. 28 PO slots need PDF download (QB rate limited)
4. 10 Daniels/Rawhide orders have no Drive folders
5. 61 options missing IDs (Daniels/Rawhide catalog)
6. Compare tab UI needs update for total-only results

### Missing Deletes
7. Timeline entries, doc chain unlink, order documents, orders

## Next Priorities
1. **ADD ANTHROPIC API CREDITS** — console.anthropic.com
2. **Import existing chute flow** — quick-add order without configurator, then Browse Drive to attach docs
3. **Compare tab UI** — display total-only comparison results
4. **PO PDF downloads** — retry 28 rate-limited orders
5. **Non-Moly Drive folders** — link 10 Daniels/Rawhide orders
6. **Gmail auto-capture** — auto-trigger on Moly invoice/SO detection
7. **Missing deletes** — timeline, doc chain unlink, order documents, orders

## Session Log — 2026-04-02 (Evening)
### Commits (9):
1. `97af8a3` — Freight input on NewOrder
2. `78f660c` — Chat bubble word-wrap fix
3. `e04693c` — Send Estimate button on EstimateDetail
4. `b12d959` — Voice memos: edit/archive/restore
5. `45de91e` — Browse Drive button on doc chain
6. `462ce95` — Custom line items (NewOrder + EditOrder)
7. `48bba9c` — Browse Drive fix (phantom slot removal)
8. `658befe` — Task assignment
9. `825e246` — Condensed list view + ETA filters

### Edge Functions Deployed:
- `send-estimate` v72, `qb-push-estimate` v56, `chat-assistant` v8
- `list-drive-files` v1 (NEW), `compare-documents` v4

### DB Migrations:
- `voice_memos.archived` boolean DEFAULT false
- `paperwork_document_type_check` includes `manual_task`

## Reference
- Moly SO emails: from `orders@molymfg.com`
- Moly Invoice emails: from `donotreply@molymfg.com`
- Google OAuth: gmail.readonly, drive, userinfo.email, userinfo.profile
- Drive: MOLY 2026 → `1XbMvfvbnR0PgOUeXqY0JCuHwqBwgOxrX`, Daniels 2026 → `1vXPiyREiR1Bwvuy8SJKRndJUSVyHY592`
- Order folders: `Contract {number} – {name}` inside manufacturer/year folder
