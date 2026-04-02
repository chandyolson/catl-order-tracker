# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-02 (doc chain batch run + QB fix + assistant v6)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **GitHub token**: stored in Claude memory (scrub from remote after push)
- **Git config**: user.email `chandy@catlresources.com`, user.name `Chandy Olson`
- **Last commit**: See git log

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
- **Dashboard**: Pipeline (segmented by mfg), stat cards, action items (with delete), leads, chat assistant (440px wide), voice memos (with delete + refresh)
- **Orders**: List with search, filter by status
- **Order Detail**: Header (contract + mfg/model + options), Overview tab (customer, order details + tasks w/delete, timeline + doc chain w/manual linking), Financials tab (locked), Compare tab, Estimates tab
- **Edit Order**: Two-column layout (equipment left, contract/admin right), navy receipt card, options configurator
- **Estimates, Customers, Settings, Production, Tasks (with delete), Documents** pages
- **Voice Memos**: Full page with reprocess, link to customer/order, and delete

### Document Chain (6 slots per order) — BATCH TESTED 2026-04-02
1. CATL Estimate → from QuickBooks
2. CATL Purchase Order → from QuickBooks
3. Mfg Sales Order → from Moly email / Drive folder
4. Mfg Invoice → from Moly email / Drive folder
5. QB Bill → from QuickBooks
6. Customer Invoice → from QuickBooks

### Document Chain Status (UPDATED 2026-04-02 — BATCH RUN COMPLETE)
- **Started session**: 3 slots filled, 9 documents total
- **After batch run**: 27 slots filled, 73 documents total
- **Moly Sales Order**: 22/32 filled (all Moly orders with Drive folders)
- **CATL Purchase Order**: 4/32 filled (3 from Drive files, 1 from QB PDF). 28 remaining need QB PDF download (rate limited during batch, will fill on retry).
- **Moly Invoice**: 1/32 filled (only 44270 has been invoiced so far — expected)
- **Estimates, Bills, Customer Invoices**: 0/32 — expected for current workflow stage
- **All 32 qb_po_id values VERIFIED as valid QuickBooks PurchaseOrder IDs** (diagnostic confirmed every one matches)
- **QB Sync (v8)**: REWRITTEN this session. Fixed v7 bug where PO lookups were failing despite valid IDs. v8 uses clean direct `purchaseorder/{id}?minorversion=75` call. Downloads PDF → Drive → fills slot. Self-heals stale doc numbers.
- **Drive Scan (v4)**: Unchanged, worked perfectly on batch run. Scanned all 22 Moly Drive folders.
- **32 orders have slots created, 22 have Drive folders linked**
- **10 Daniels/Rawhide orders have NO Drive folders** — need folders linked

### Chat Assistant (v6) — REWRITTEN 2026-04-02
Major upgrade from v5. Key changes:
- **Gathers ALL data on every message** — orders, tasks, estimates, voice memos, gmail_inbox, document slots, timeline. Builds full intelligence snapshot.
- **Never asks Tim where files are** — it already has the data. System prompt explicitly says "You have everything. Don't pretend you don't."
- **Auto-deduplicates tasks** on every message — normalizes titles, keeps most specific, deletes rest
- **Proactive gap detection** — snapshot includes missing PO PDFs, missing sales orders, no Drive folder, overdue tasks, stale estimates, unprocessed emails
- **Can take real actions**: CREATE_TASK, COMPLETE_TASK, LOG_NOTE, ADD_TIMELINE, UPDATE_STATUS, TRIGGER_DRIVE_SCAN, TRIGGER_QB_SYNC, TRIGGER_GMAIL_DOWNLOAD
- **Triggers gmail-scan in background** on every message
- **Rancher tone, bullets only, under 300 words**
- **Task cleanup**: 15 open tasks with duplicates → 8 clean unique tasks

### Voice Memos — FIXED 2026-04-02
- All 6 voice memos complete with AI summaries and tasks created
- drive-watch-memos v4 auto-retries stuck memos
- Delete from Dashboard + VoiceMemos page

### Edge Functions (43 deployed)
Key ones:
- `chat-assistant` **v6** — REWRITTEN: Active ops brain with full data snapshot, auto-dedup, action execution
- `qb-check-sync` **v8** — REWRITTEN: Fixed PO lookup bug, clean QB API calls, PDF download + Drive upload + slot fill
- `qb-po-diagnose` **v1** — NEW: Diagnostic tool that tests multiple QB lookup strategies per order. Used to confirm all 32 PO IDs are valid.
- `drive-scan-documents` v4 — Match Drive files to slots + returns unmatched_files for manual linking
- `link-document-to-slot` v1 — Manually wire Drive file to any slot
- `gmail-scan` v2 — Scan Gmail with format=full
- `gmail-download-attachment` v2 — Gmail attachment → Drive → doc chain
- `reprocess-stuck-memos` v1 — Re-run Claude extraction on stuck voice memos
- `drive-watch-memos` v4 — Polls Drive for new voice memos, auto-retries stuck ones
- `process-voice-memo` v4 — Direct upload → Deepgram → Claude → routing
- `process-call-recording` v4 — BCR audio → Deepgram → Claude → routing
- `qb-push-estimate`, `qb-push-po`, `qb-convert-po-to-bill`, `qb-convert-estimate-to-invoice`
- `qb-download-pdf` — Full pipeline: QB PDF → Drive upload → fill slot
- `compare-documents` v3, `accept-sales-order` v3
- `process-inbound-email` v9, `send-estimate` v70, `manage-document` v3

### Database Tables (key ones)
- `orders` — 32 orders, all `order_pending` status
- `order_document_slots` — 6 per order (192 total), 27 filled
- `order_documents` — 73 records (63 drive, 7 email, 2 quickbooks, 1 google_drive)
- `order_timeline` — events per order
- `estimates` — QB-linked estimates
- `tasks` — 8 open (cleaned from 15 duplicates), 17 complete
- `paperwork` — document checklist items per order
- `customers` — 2,307 records
- `model_options` — 72 options
- `base_models` (27), `manufacturers` (6), `quick_builds`
- `voice_memos` — compound memo_type format. 6 complete.
- `call_log`, `gmail_inbox`, `manufacturer_item_mappings`, `comparison_results`
- `qb_tokens` — OAuth valid (refresh token good till July 2026)
- `google_tokens` — OAuth tokens

## Known Issues

### Critical
1. **Status not saving** — All 32 orders show `order_pending`. Needs Tim to reproduce and check browser console.

### Medium
2. **28 PO slots need PDF download** — QB rate limited during batch run. Will fill on next individual qb-check-sync calls.
3. **10 Daniels/Rawhide orders have no Drive folders** — need folders created in Drive and linked to orders
4. **61 options still missing IDs** — Daniels/Rawhide items need catalog entries
5. **Compare tab** — Needs testing with real filled slots (now possible for Moly orders)

### Missing Deletes (design rule)
6. Timeline entries, doc chain unlink, order documents, orders — all need delete

### UI
7. **Edit order page** — v4 wireframe needs testing

## Next Priorities (in order)

### Priority 1: PO PDF Downloads
- Retry qb-check-sync on the 28 orders that got rate limited (stagger calls)
- Or let the assistant trigger them individually as Tim works

### Priority 2: Non-Moly Drive Folders
- 10 Daniels/Rawhide orders need Drive folders linked
- Daniels folders exist in `DANIELS/2026/` — need to match and link
- Rawhide folder: `1V8WzsJapJuwzg3GEmIhqqn2gt9uHN7c7`

### Priority 3: Document Chain Verification
- Test Compare tab with real filled slots
- Test gmail-download-attachment on next incoming Moly email
- Add unlink ability (remove file from slot)

### Priority 4: Gmail Auto-Capture Pipeline
- Auto-trigger gmail-download-attachment when Moly invoice/SO detected
- Auto-compare and flag mismatches

### Priority 5: Missing Deletes
- Timeline, doc chain unlink, order documents, orders

### Priority 6: Remaining Features
- Team assignment, call button, Drive folder refresh, screen recording pipeline

## Moly Email Patterns
- **Sales Orders**: from `orders@molymfg.com`, attachment `CATL/CATL0414021626.pdf`
- **Invoices**: from `donotreply@molymfg.com`, attachment `000002480_SO_0044270IN_20260401_000.PDF`

## Google OAuth Scopes
`gmail.readonly`, `drive`, `userinfo.email`, `userinfo.profile`

## Drive Folder Structure
- MOLY: 2025 → `1GW2IZELTNmBNup9qdoKZqdBnDc6Z-Mn6`, 2026 → `1XbMvfvbnR0PgOUeXqY0JCuHwqBwgOxrX`
- Daniels: 2025 → `1MevH9MCkq15jxRcIsKlztb6bUCI_H8si`, 2026 → `1vXPiyREiR1Bwvuy8SJKRndJUSVyHY592`
- Rawhide: `1V8WzsJapJuwzg3GEmIhqqn2gt9uHN7c7`, MJE: `1oX4G4SMtRgYivBIVDv_AlvNyQEJ9MsXZ`
- Order folders: `Contract {number} – {name}` inside manufacturer/year folder

## DB Constraint Changes (2026-04-02)
- `order_documents_source_check`: Added 'gmail_attachment', 'google_drive'
- `voice_memos_memo_type_check`: Accepts compound format `{category}:{type}`
