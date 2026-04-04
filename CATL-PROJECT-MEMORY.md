# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-04 (freight build + page consolidation)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery → freight
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **GitHub token**: stored in Claude memory (scrub from remote after push)
- **Git config**: user.email `chandy@catlresources.com`, user.name `Chandy Olson`
- **Last commit**: `003a724` on `main` branch

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

### Nav (6 items)
Dashboard, Equipment, Leads, **Freight (NEW)**, Customers, Settings

### Pages
- **Dashboard**: Pipeline (segmented by mfg, links to `/equipment?status=`), stat cards, Tasks section (inline quick-add w/ assign + priority + due date), Voice Memos section, Chat assistant (440px)
- **Equipment** (`/equipment`): Merged Orders+Inventory+Production. Tabs: All/Assigned/InStock/OnOrder/Delivered. Views: Card/List/Board. ETA popover. Search + mfg filter + sort.
- **Leads** (`/leads`): Replaces Estimates. Temperature auto-calc: Hot (≤7d)/Warm (≤21d)/Cold (>21d)/Won. Pipeline + List toggle.
- **Freight** (`/freight`, NEW): Freight runs, stops, carriers. Full detail below.
- **Order Detail**: Overview tab (customer, tasks w/delete, timeline, doc chain w/Browse Drive + manual linking), Financials, Compare, Estimates
- **Edit Order**: Sectioned layout (Customer & Contract → Order Details → Pricing → Equipment → Custom Items → Receipt). Tabbed receipt card (Summary/Itemized). Cost prominent in teal.
- **New Order**: Same section layout as EditOrder. Unified page (inventory = no customer).
- **Estimate Detail**: Send Estimate button (standalone estimates)
- **Customers, Settings, CustomerDetail, ConvertEstimate, EquipmentMatch**

### Freight System (NEW — 2026-04-04)
**How it works:** Moly/Daniels/MJE finishes equipment → Tim arranges a truck → loads in specific order (last loaded = first delivered) → drops off along the route → some come back to CATL yard for later customer delivery.

**Database tables:**
- `carriers` — external truckers + CATL vehicles (multiple). Fields: name, type (external_trucker/catl_vehicle), phone, vehicle_description, is_active
- `freight_runs` — one per truck trip. Fields: name, pickup_location (lorraine_ks/ainsworth_ne/el_dorado_ks/custom), carrier_id, driver_name, status (planning→scheduled→loading→in_transit→completed→cancelled), pickup_date, actual_cost, share_token
- `freight_run_stops` — each delivery drop. Fields: order_id, stop_order, delivery address/city/state/zip/phone (auto-filled from customer, fully editable/overridable), delivery_instructions, unloading_equipment (forklift/tractor_forks/skid_steer/loader/telehandler/crane/none/other), status (pending→delivered), delivered_at

**Pickup points:**
- Lorraine, KS — Moly/Silencer chutes
- Ainsworth, NE — Daniels alleys/panels
- El Dorado, KS — MJE products
- Custom — any other location

**UI features:**
- Runs list with active/completed/all filter
- Run detail: navy header, pickup point card, ordered stops, expandable delivery info
- Add stop: shows ready orders, auto-fills customer address, override anything
- Carriers modal: manage truckers + CATL vehicles
- Share button (copies link — driver share page still needs building)
- Edit everything inline (run details, stop delivery info)
- Mark stops as delivered with timestamp

**Key design decisions:**
- Delivery address auto-fills from customer but is fully overridable (sometimes equipment goes to a different location with unloading equipment)
- Multiple CATL vehicles tracked separately with descriptions
- Driver name recorded per run
- Loading order = reverse of stop order

### Document Chain (9 slots per order)
1. CATL Estimate → from QuickBooks
2. Approved Estimate → from QuickBooks
3. CATL Purchase Order → from QuickBooks
4. Mfg Web Order → manual upload
5. Mfg Sales Order → from Drive / Gmail
6. Signed Sales Order → manual upload
7. Mfg Invoice → from Drive / Gmail
8. QB Bill → from QuickBooks
9. Customer Invoice → from QuickBooks

**Status:** 73 mappings in manufacturer_item_mappings. Compare engine working with qty_split and combo item detection. 13 estimates and 8 invoices filled from QB.

### Chat Assistant (v8)
- Anthropic API credits added
- Needs serious rethink (flagged as priority)

### Edge Functions (45+)
Key ones: chat-assistant v8, qb-check-sync v8, qb-push-estimate v56, send-estimate v72, list-drive-files v1, compare-documents v4, drive-scan-documents v4, link-document-to-slot v4, extract-document-text v1, qb-find-estimates v1, batch-qb-sync v3, gmail-scan v2, gmail-download-attachment v2, drive-watch-memos v4, reprocess-stuck-memos v1

### Database
- `orders` — 33 orders
- `order_document_slots` — 9 per order
- `carriers` — NEW: truckers + CATL vehicles
- `freight_runs` — NEW: truck trips
- `freight_run_stops` — NEW: delivery stops
- `tasks` — has assigned_to, priority columns
- `voice_memos` — has archived, assigned_to, notes columns
- `customers` — 2,310 records (88% have addresses, 30% have phone)
- `manufacturer_item_mappings` — 73 mappings for compare engine

## Known Issues

### Critical
1. **Status not saving** — All orders show `order_pending`. Needs Tim to reproduce.
2. **Google Drive intermittently blocked** from some edge functions.

### Medium
3. Some PO slots still need PDF download (QB rate limited)
4. 10 Daniels/Rawhide orders have no Drive folders
5. 61 options missing IDs (Daniels/Rawhide catalog)
6. Compare tab needs end-to-end browser testing

### Missing Deletes
7. Timeline entries, doc chain unlink, orders

### Freight (to build next)
8. Driver share page (public URL with run sheet)
9. Route map integration
10. Drag-to-reorder stops

## Next Priorities
1. **Test Freight on Tim's phone** — create a run, add carriers, add stops
2. **Driver share page** — public URL with mobile-friendly run sheet
3. **Orange Sheet** — per-order receiving/setup checklist (chute specs, contract #, customer, modifications, setup tasks). Printable work order for crew.
4. **CATL Assistant rethink** — what should it focus on?
5. **Document chain batch testing** — verify across multiple orders
6. **Mass select/bulk edit** on Equipment list view
7. **Missing deletes** — timeline, doc chain unlink, orders

## Session Log — 2026-04-04

### Session 1 (Page Consolidation — commits b13c7f5 through 96c4245):
- Equipment page: merged Orders+Inventory+Production (tabs, card/list/board views)
- Leads page: replaced Estimates (temperature auto-calc, pipeline+list toggle)
- Dashboard: absorbs Tasks (inline create) + Voice Memos
- Nav reduced to 5: Dashboard, Equipment, Leads, Customers, Settings
- 8 dead pages removed, all old URLs redirect

### Session 2 (Freight Build — commit 003a724):
- New tables: carriers, freight_runs, freight_run_stops
- Freight.tsx: runs list, run detail, add stops, carrier management
- Nav updated to 6: added Freight (Truck icon) between Leads and Customers
- DB seeded: 2 CATL vehicle placeholders

## Reference
- Moly SO emails: from `orders@molymfg.com`
- Moly Invoice emails: from `donotreply@molymfg.com`
- Google OAuth: gmail.readonly, drive, userinfo.email, userinfo.profile
- Drive: MOLY 2026 → `1XbMvfvbnR0PgOUeXqY0JCuHwqBwgOxrX`, Daniels 2026 → `1vXPiyREiR1Bwvuy8SJKRndJUSVyHY592`
- Rawhide → `1V8WzsJapJuwzg3GEmIhqqn2gt9uHN7c7`, MJE → `1oX4G4SMtRgYivBIVDv_AlvNyQEJ9MsXZ`
- Order folders: `Contract {number} – {name}` inside manufacturer/year folder
- Pickup points: Lorraine KS (Moly), Ainsworth NE (Daniels), El Dorado KS (MJE)
