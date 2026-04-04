# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-04 (freight + driver share + orange sheet + duplicate order + ready pill)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery → freight
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **GitHub token**: stored in Claude memory (scrub from remote after push)
- **Git config**: user.email `chandy@catlresources.com`, user.name `Chandy Olson`
- **Last commit**: `601e578` on `main` branch

## User Preferences
- NO horizontal or vertical scrollbars. Sections expand to fit content.
- Bullet points in the chat assistant, not paragraphs
- Show wireframes before building major layout changes
- Use rancher language in the AI assistant
- ChuteSide design system colors everywhere — no off-brand blues or greens
- **DESIGN RULE: Every create needs a delete.**

## Nav (6 items)
Dashboard, Equipment, Leads, Freight, Customers, Settings

## Key Features Built This Session (2026-04-04)

### Freight System
- `carriers` table: external truckers + CATL vehicles (multiple), with phone, email, vehicle description
- `freight_runs` table: start/end locations, pickup_date, carrier, driver, status pipeline, total_miles, actual_cost, share_token
- `freight_run_stops` table: stop_type (pickup/delivery), order_id, delivery details (auto-fill from customer, fully overridable), unloading equipment, status
- Known locations: CATL Wall SD, Moly Lorraine KS, Daniels Ainsworth NE, MJE El Dorado KS, Custom
- Run detail: Start → Pickups → Deliveries → End with miles
- Add stop modal: toggle between manufacturer pickup and customer delivery
- Only orders with "ready" status show in delivery picker
- Printable run sheet with route summary, loading order callout
- Share button copies public URL for driver

### Driver Share Page (/freight/share/:token)
- Public, no auth — mobile-friendly run sheet
- Tap-to-call, addresses link to Google Maps, loading order callout

### Orange Sheet (/orders/:id/orange-sheet)
- Per-order receiving/setup checklist from Order Detail dropdown
- Equipment specs with checkboxes, custom items, open tasks, pricing, print button

### Duplicate Order (Order Detail ⋮ → Duplicate Specs)
- Copies manufacturer, base model, options, custom items, pricing, build shorthand
- Does NOT copy contract #, customer, QB links, dates, status
- Creates new order with "(copy)" name, opens in Edit mode

### Equipment Page
- "Overdue" pill renamed to "Ready for Pickup" (teal)
- Filter changed from past-due ETA to status=ready

### Page Consolidation (earlier this session)
- Equipment: merged Orders+Inventory+Production
- Leads: replaced Estimates with temperature pipeline
- Dashboard: absorbs Tasks + Voice Memos
- 8 dead pages removed, old URLs redirect

## What's Next (Priority Order)
1. **Update DriverShare page** for pickup/delivery stop model
2. **Test everything on Tim's phone** — Freight, Equipment, Leads, Orange Sheet, Duplicate
3. **CATL Assistant rethink** — what should it focus on?
4. **Document chain batch testing**
5. **Mass select/bulk edit** on Equipment list
6. **Route map** on freight runs (future)
7. **Orange Sheet** improvements based on Tim feedback
8. **Drag-to-reorder** freight stops (future)

## Known Issues
1. **Status not saving** — may be fixed now, needs Tim to verify
2. **Google Drive intermittently blocked** from some edge functions
3. Some PO slots still need PDF download (QB rate limited)
4. 10 Daniels/Rawhide orders have no Drive folders
5. 61 options missing IDs (Daniels/Rawhide catalog)
6. Missing deletes: timeline entries, doc chain unlink, orders

## Session Commits — 2026-04-04
1. `b13c7f5` through `96c4245` — Page consolidation (Equipment, Leads, Dashboard)
2. `003a724` — Freight page + database tables
3. `82327b9` — Project memory update
4. `4bf7757` — Driver Share page + Orange Sheet
5. `0a9d9d5` — Project memory update
6. `2226c87` — Freight: carrier email, ready-only filter, stop counts
7. `9f88640` — Freight overhaul: start/end locations, pickup/delivery stops, printable sheet
8. `601e578` — Duplicate Order specs + Ready for Pickup pill

## Reference
- Moly SO emails: from `orders@molymfg.com`
- Moly Invoice emails: from `donotreply@molymfg.com`
- Google OAuth: gmail.readonly, drive, userinfo.email, userinfo.profile
- Drive: MOLY 2026 → `1XbMvfvbnR0PgOUeXqY0JCuHwqBwgOxrX`
- Pickup points: Lorraine KS (Moly), Ainsworth NE (Daniels), El Dorado KS (MJE)
- Order folders: `Contract {number} – {name}` inside manufacturer/year folder
