# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-04 (massive session — freight, doc chain, status, driver share, batch ops)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery → freight
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **Last commit**: `122f446` on `main` branch

## Nav (6 items)
Dashboard, Equipment, Leads, Freight, Customers, Settings

## Session Summary — 2026-04-04

### Page Consolidation
- Equipment: merged Orders+Inventory+Production (tabs, 3 views)
- Leads: replaced Estimates (temperature pipeline)
- Dashboard: absorbs Tasks (inline create) + Voice Memos
- 8 dead pages removed, old URLs redirect

### Freight System — COMPLETE
- carriers table (external truckers + CATL vehicles, phone/email/vehicle)
- freight_runs table (start/end locations, status pipeline, miles, cost, share_token)
- freight_run_stops table (pickup/delivery types, auto-fill from customer, fully overridable)
- Known locations: CATL Wall SD, Moly Lorraine KS, Daniels Ainsworth NE, MJE El Dorado KS
- **"Deliver to CATL" quick button** — one tap creates delivery stop to yard
- **CATL as pickup location** — for outbound runs from yard to customer
- Printable run sheet with loading order callout
- Share button copies public URL for driver

### Driver Share Page — UPDATED
- Now shows Start → Pickups → Deliveries → End matching Freight page
- Route summary, loading order, tap-to-call, Google Maps links

### Status Change — FIXED
- Tappable StatusDropdown on Order Detail header
- Saves instantly to DB, logs timeline entry
- 7 statuses: Estimate → Purchase Order → Order Pending → Building → Ready → Delivered → Closed

### Document Chain — MAJOR FIXES
- Browse button on EVERY slot (filled or empty)
- link-document-to-slot v5: auto-creates slot if missing
- drive-scan-documents v7: QB prefix matching, signed/contract patterns
- qb-find-estimates v3: searches all 4 QB doc types by DocNumber
- qb-push-po v56: returns 200 on errors (shows actual error message)
- Duplicate slots cleaned, unique constraint added
- Old moly_* types renamed to mfg_*
- All orders backfilled to 9 standard slots
- Batch scan + QB search run across all orders

### Other Features
- Duplicate Order (⋮ → Duplicate Specs)
- Ready for Pickup pill (was "Overdue")
- Orange Sheet (per-order receiving checklist)

### Doc Chain Auto-Link Results
- 22 orders with customers: 18 estimates, 20 POs, 10 invoices auto-linked from QB
- 0 bills matched (QB DocNumber search issue — needs debug)
- 56% of doc chain slots filled automatically across Drive-linked orders

## Doc Chain Slot Types (9 total)
catl_estimate, approved_estimate, catl_purchase_order, mfg_web_order,
mfg_sales_order, signed_sales_order, mfg_invoice, qb_bill, catl_customer_invoice

## What's Next
1. **QB Bill matching** — DocNumber search returns nothing. Try different QB query approach.
2. **CATL Assistant rethink** — what should it focus on?
3. **Mass select/bulk edit** on Equipment list
4. **Orange Sheet expansion** based on Tim feedback
5. **Route map** on freight runs

## Known Issues
1. QB Bill search not finding bills by DocNumber
2. Google Drive intermittently blocked from some edge functions
3. 61 options missing IDs (Daniels/Rawhide catalog)
4. Duplicate order record for 44277 (from Duplicate Specs — needs cleanup)

## Edge Functions Updated This Session
- drive-scan-documents v7, link-document-to-slot v5, qb-find-estimates v3, qb-push-po v56

## DB Changes This Session
- Unique constraint: idx_unique_order_slot (order_id, slot_type)
- All slots backfilled to 9 types per order
- Old moly_* slot types renamed to mfg_*
- freight tables: carriers, freight_runs, freight_run_stops
