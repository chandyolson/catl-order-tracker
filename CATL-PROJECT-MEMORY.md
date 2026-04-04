# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-04 (freight build + driver share + orange sheet)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery → freight
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **GitHub token**: stored in Claude memory (scrub from remote after push)
- **Git config**: user.email `chandy@catlresources.com`, user.name `Chandy Olson`
- **Last commit**: `4bf7757` on `main` branch

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
Dashboard, Equipment, Leads, Freight, Customers, Settings

### Pages (17 files)
- **Dashboard**: Pipeline (segmented by mfg, links to `/equipment?status=`), stat cards, Tasks section (inline quick-add w/ assign + priority + due date), Voice Memos section, Chat assistant (440px)
- **Equipment** (`/equipment`): Merged Orders+Inventory+Production. Tabs: All/Assigned/InStock/OnOrder/Delivered. Views: Card/List/Board. ETA popover.
- **Leads** (`/leads`): Replaces Estimates. Temperature auto-calc: Hot/Warm/Cold/Won. Pipeline + List toggle.
- **Freight** (`/freight`): Freight runs, stops, carriers. See Freight System below.
- **DriverShare** (`/freight/share/:token`): PUBLIC page, no auth/nav. Mobile-friendly run sheet for truckers.
- **OrangeSheet** (`/orders/:id/orange-sheet`): Per-order receiving/setup checklist. Printable.
- **Order Detail**: Overview tab (customer, tasks, timeline, doc chain w/Browse Drive), Financials, Compare, Estimates. Dropdown has "Orange Sheet" option.
- **Edit Order**: Sectioned layout, tabbed receipt card, cost prominent in teal.
- **New Order**: Same section layout as EditOrder. Unified page.
- **Estimate Detail**: Send Estimate button (standalone estimates)
- **Customers, Settings, CustomerDetail, ConvertEstimate, EquipmentMatch, NotFound**

### Routing Structure
- Public routes (no Layout): `/freight/share/:token`
- App routes (with Layout/nav): everything else
- App.tsx uses `AppRoutes` wrapper component for Layout separation

### Freight System (2026-04-04)
**How it works:** Moly/Daniels/MJE finishes equipment → Tim arranges a truck → loads in specific order (last loaded = first delivered) → drops off along the route → some come back to CATL yard.

**Database tables:**
- `carriers` — external truckers + CATL vehicles (multiple). Fields: name, type (external_trucker/catl_vehicle), phone, vehicle_description, is_active
- `freight_runs` — one per truck trip. Fields: name, pickup_location (lorraine_ks/ainsworth_ne/el_dorado_ks/custom), carrier_id, driver_name, status (planning→scheduled→loading→in_transit→completed→cancelled), pickup_date, actual_cost, share_token
- `freight_run_stops` — each delivery drop. Fields: order_id, stop_order, delivery address/city/state/zip/phone (auto-filled from customer, fully editable/overridable), delivery_instructions, unloading_equipment, status (pending→delivered), delivered_at

**Pickup points:** Lorraine KS (Moly), Ainsworth NE (Daniels), El Dorado KS (MJE), Custom

**Driver Share page features:**
- Public URL via share_token, no login needed
- Tap-to-call phone numbers, addresses link to Google Maps
- Loading order callout (reverse of delivery order)
- CATL branding, fixed footer

### Orange Sheet (2026-04-04)
Per-order receiving/setup checklist accessible from Order Detail dropdown menu (⋮ → Orange Sheet).
- Orange accent header with contract # and customer
- Equipment specs: base model + all options with checkboxes
- Custom items / modifications section
- Open tasks from tasks table (gun holders, extra hose, specific instructions)
- Blank lines for handwritten notes
- Pricing summary (cost + customer price)
- Print button with print-friendly CSS

### Document Chain (9 slots per order)
1. CATL Estimate, 2. Approved Estimate, 3. CATL Purchase Order, 4. Mfg Web Order, 5. Mfg Sales Order, 6. Signed Sales Order, 7. Mfg Invoice, 8. QB Bill, 9. Customer Invoice

**Status:** 73 mappings in manufacturer_item_mappings. Compare engine working. 13 estimates and 8 invoices filled from QB.

### Chat Assistant (v8)
- Anthropic API credits added
- Needs serious rethink (flagged as priority)

### Edge Functions (45+)
Key ones: chat-assistant v8, qb-check-sync v8, qb-push-estimate v56, send-estimate v72, list-drive-files v1, compare-documents v4, drive-scan-documents v4, link-document-to-slot v4, extract-document-text v1, qb-find-estimates v1, batch-qb-sync v3, gmail-scan v2, gmail-download-attachment v2, drive-watch-memos v4, reprocess-stuck-memos v1

### Database
- `orders` — 33 orders
- `order_document_slots` — 9 per order
- `carriers` — truckers + CATL vehicles
- `freight_runs` — truck trips
- `freight_run_stops` — delivery stops
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
8. Route map integration
9. Drag-to-reorder stops

## Next Priorities
1. **Test everything on Tim's phone** — Freight, Driver Share, Orange Sheet, Equipment, Leads
2. **CATL Assistant rethink** — what should it focus on?
3. **Document chain batch testing** — verify across multiple orders
4. **Mass select/bulk edit** on Equipment list view
5. **Route map** on freight runs
6. **Missing deletes** — timeline, doc chain unlink, orders

## Session Log — 2026-04-04

### Session 1 (Page Consolidation — commits b13c7f5 through 96c4245):
- Equipment page: merged Orders+Inventory+Production
- Leads page: replaced Estimates
- Dashboard: absorbs Tasks + Voice Memos
- 8 dead pages removed, all old URLs redirect

### Session 2 (Freight Build — commits 003a724, 82327b9, 4bf7757):
- New tables: carriers, freight_runs, freight_run_stops (migration applied)
- Freight.tsx: runs list, run detail, add stops, carrier management
- DriverShare.tsx: public run sheet for drivers (no auth)
- OrangeSheet.tsx: per-order receiving checklist (printable)
- App.tsx restructured: public routes outside Layout
- OrderDetail.tsx: Orange Sheet added to dropdown menu
- Nav: 6 items (Dashboard, Equipment, Leads, Freight, Customers, Settings)

## Reference
- Moly SO emails: from `orders@molymfg.com`
- Moly Invoice emails: from `donotreply@molymfg.com`
- Google OAuth: gmail.readonly, drive, userinfo.email, userinfo.profile
- Drive: MOLY 2026 → `1XbMvfvbnR0PgOUeXqY0JCuHwqBwgOxrX`, Daniels 2026 → `1vXPiyREiR1Bwvuy8SJKRndJUSVyHY592`
- Rawhide → `1V8WzsJapJuwzg3GEmIhqqn2gt9uHN7c7`, MJE → `1oX4G4SMtRgYivBIVDv_AlvNyQEJ9MsXZ`
- Order folders: `Contract {number} – {name}` inside manufacturer/year folder
- Pickup points: Lorraine KS (Moly), Ainsworth NE (Daniels), El Dorado KS (MJE)
