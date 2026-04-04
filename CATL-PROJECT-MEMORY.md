# CATL Resources Livestock Equipment Manager — Project Memory
> Last updated: 2026-04-04 (full session — freight, doc chain, status, driver share)

## Project Basics
- **App**: Tracks livestock equipment from quote → order → build → delivery → freight
- **Stack**: React (Lovable) → GitHub `chandyolson/catl-order-tracker` → Supabase "CRLE" (`dubzwbfqlwhkpmpuejsy`)
- **Design System**: ChuteSide — cream #F5F5F0, navy #0E2646, teal #55BAAA, gold #F3D12A
- **Skill file**: `/mnt/skills/user/catl-equipment-ops/SKILL.md` — READ THIS FIRST every session
- **GitHub token**: stored in Claude memory (scrub from remote after push)
- **Git config**: user.email `chandy@catlresources.com`, user.name `Chandy Olson`
- **Last commit**: `2c8e9be` on `main` branch

## Nav (6 items)
Dashboard, Equipment, Leads, Freight, Customers, Settings

## What Was Built/Fixed This Session

### Status Change — FIXED
- Instant status dropdown on Order Detail (tap the status badge → pick new status → saves immediately)
- No more need to go to Edit page to change status
- Adds timeline entry on each status change
- 7 statuses: Estimate → Purchase Order → Order Pending → Building → Ready → Delivered → Closed

### Document Chain — MAJOR FIXES
- **Browse button on EVERY slot** — filled or empty, no conditions. Tim can always re-link any file.
- **Removed +Link unmatched file picker** — Browse covers it, less confusing
- **Duplicate slots cleaned up** across all orders (some had 10x duplicates)
- **Unique constraint** `(order_id, slot_type)` — no more duplicates ever
- **Old slot types renamed**: `moly_sales_order` → `mfg_sales_order`, `moly_invoice` → `mfg_invoice`
- **Missing slots backfilled** — every order now has all 9 standard slots
- **`link-document-to-slot` v5** — auto-creates slot if missing instead of failing
- **`drive-scan-documents` v7** — QB prefix matching first (QB Estimate/PO/Invoice/Bill), better signed/contract/web order patterns
- **`qb-find-estimates` v3** — searches all 4 QB doc types (Estimate, Invoice, PO, Bill) by DocNumber directly
- **`qb-push-po` v56** — returns 200 with success:false on errors (so error message reaches frontend)

### Doc Chain Slot Types (9 total)
1. catl_estimate — CATL Estimate
2. approved_estimate — Approved Estimate
3. catl_purchase_order — CATL Purchase Order
4. mfg_web_order — Mfg Web Order
5. mfg_sales_order — Mfg Sales Order
6. signed_sales_order — Signed Sales Order
7. mfg_invoice — Mfg Invoice
8. qb_bill — QB Bill
9. catl_customer_invoice — Customer Invoice

### Freight System
- Full freight page with start/end locations, pickup/delivery stops, printable run sheet
- Carriers with phone, email, vehicle description
- Only ready-status orders in delivery picker

### Driver Share Page — UPDATED
- Now shows Start → Pickups → Deliveries → End (matching Freight page)
- Route summary, loading order callout, tap-to-call, Google Maps links

### Other Features
- **Duplicate Order** (Order Detail ⋮ → Duplicate Specs) — copies equipment specs only
- **Ready for Pickup** pill on Equipment page (was "Overdue")
- **Orange Sheet** — per-order receiving checklist
- **Page Consolidation** — Equipment, Leads, Dashboard merged pages

## What's Next (Priority Order)
1. **Test everything on Tim's phone** — status change, Browse, Freight, doc chain
2. **CATL Assistant rethink** — what should it focus on?
3. **QB Bill matching debug** — `SELECT * FROM Bill WHERE DocNumber = '44268'` returns nothing even though bill exists. Need to inspect actual QB data.
4. **Document chain batch testing** across multiple orders
5. **Mass select/bulk edit** on Equipment list
6. **Orange Sheet** expansion based on Tim feedback
7. **Route map** integration on freight runs

## Known Issues
1. **QB Bill search not finding bills** by DocNumber — may be a QB API formatting issue
2. **Google Drive intermittently blocked** from some edge functions
3. 61 options missing IDs (Daniels/Rawhide catalog)
4. Missing deletes: timeline entries, doc chain unlink, orders

## Edge Functions Deployed This Session
- `drive-scan-documents` v7 — better pattern matching
- `link-document-to-slot` v5 — auto-creates missing slots
- `qb-find-estimates` v3 — searches all 4 QB doc types by DocNumber
- `qb-push-po` v56 — returns 200 on errors

## DB Changes This Session
- Duplicate slots removed across all orders
- Unique constraint: `idx_unique_order_slot ON order_document_slots (order_id, slot_type)`
- Old slot types renamed (moly_* → mfg_*)
- Missing slots backfilled — all orders have all 9 types
