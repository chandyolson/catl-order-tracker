# Order Page Redesign Spec
> Approved wireframe v3 — 2026-04-05

## Layout (top to bottom)

### 1. Navy header
- Back button + "New order" or "Edit: 44508 — Hager"
- **Edit Order only**: Two-track pipeline pills (equipment_status + customer_status)

### 2. Contract # (top field)
- Text input for Moly contract number
- Auto-generated for estimates

### 3. Customer toggle
- Toggle switch at the top — OFF by default for new orders
- When ON: expands to show customer search/select with autocomplete
- Shows selected customer name, city/state, phone
- On Edit Order: this is how you assign a customer to an inventory order
- When OFF: section collapses, customer_id = null (inventory order)

### 4. Equipment configuration
- **Manufacturer** dropdown — all 7 manufacturers
- **Base model** dropdown — filtered by selected manufacturer
- **Length** toggle (Moly only): Standard / Extended (+$1,586)
  - Standard = no price change
  - Extended = adds Extended Chute option ($1,268.80 cost / $1,586 retail)
  - Extended unlocks walk-through door qty > 1 per side
- **Controls side** toggle: Left / Right (required on every chute)
  - Default position of the standard controls — no extra cost
  - This is the BASE controls placement. Upgrades (Dual, Side-to-Side Pivot, Front-to-Back Pivot) are separate paid options in the Controls group
  - Must be noted on every order — Moly SO will show "Controls Side Left Controls" or similar
  - Stored on the order so the comparison engine can verify it matches the Moly SO
  - When Dual Controls is selected, controls side toggle hides (both sides)
- **Quick build pills** — auto-toggle options for pre-configured combos

### 5. Recommended options (checkmark toggles)
All with tappable checkmarks. R/L options SIDE BY SIDE (not stacked).

| Row | Left | Right |
|-----|------|-------|
| 1 | Hyd lower squeeze (HL) | Dual controls (DC) |
| 2 | Walk-thru door R (WD) | Walk-thru door L (WD) |
| 3 | Neck access R (NA) | Neck access L (NA) |
| 4 | Neckbar R (NB) | Neckbar L (NB) |
| 5 | Neck extenders (HNB) | Rear hookup (RH) |
| 6 | Chest bar (CB-STD) | |

Option IDs:
- HL: 8ae10596-a7f2-4c78-9412-e6f1c43c876c
- DC: 781cc905-05f0-4537-b2e0-a550275d646e
- WD: 99ca3ab9-eee2-484b-a8fa-8e24217e9f6b
- NA: 77e99584-7462-40aa-b8c8-dc071963d0bd
- NB: 61764474-4f25-43a9-8885-271d3ef4973e
- HNB: 89cc9ae7-32ef-46ac-92f0-4e132c62e696
- RH: 639108fc-8857-4428-90bf-c55c7f9493e4
- CB-STD: b2a248c9-3d4f-417e-bf8c-16bc53c6627e
- CB-HD: 0e4aeab2-8f11-471e-b6a4-fbbdadf1f78d
- XP: 54277864-a9e6-4edc-a9fb-9362c16cc1a6
- EXT: 67f39bf6-3f61-4529-802c-9f5d4feb4079

### 6. All options by group
Full catalog, expanded (not collapsed behind accordions). Tappable pills.
Groups: Power, Squeeze, Controls, Head/Neck, Doors/Exits, Side/Pan, Scales, Carrier, Misc, CATL Mods

- Selected options get teal border + green fill
- Side options show "R" and "L" variants
- Options with quantity show "x2" badge when qty > 1
- Walk-through doors: max_per_side = 4 on extended, max_per_side = 1 on standard
- Toggling in recommended section syncs with full options list

### 7. Fully itemized pricing table
- No blue box, no summary/itemized tabs
- Live-updating table: Item | Our cost | Retail
- Base model as first line
- Every selected option as a line item
- Subtotal, tax (based on customer state), total, margin
- Margin shown as $ amount and %

### 8. Sticky bottom buttons
- **Save** — saves order, stays on same screen, shows toast "Saved"
- **Enter on Moly portal** — opens https://ordering.molymfg.com/login.php in new tab
  - Only shows when manufacturer = Moly Manufacturing
  - After clicking, marks that step in the document chain as done

## Behaviors
- Build shorthand: computed automatically, NOT displayed
- Save stays on the same page (no redirect)
- Prices must match the Moly paperwork exactly
- Quick builds auto-toggle the recommended options + any others defined in the quick_build
- Customer section only visible when toggle is ON
- Moly portal button only visible for Moly manufacturer

## Two-track status (Edit Order only)
- equipment_status: ordered → building → ready → in_transit → at_catl → delivered
- customer_status: estimate → sold → awaiting_delivery → delivered → paid → closed
- customer_status is null when no customer assigned
- Both shown as tappable pipeline pills in the header

## DB columns used
- manufacturers.ordering_portal_url — Moly portal URL
- model_options.requires_extended — gate for extended-only options
- model_options.max_per_side — limit per side (walk-thru door = 4 on extended)
- model_options.selection_type — simple, side, pick_one
- orders.equipment_status, orders.customer_status — two-track model
- orders.controls_side — 'left' or 'right' (null when Dual Controls selected). Required field for every chute.
- orders.tax_rate, orders.tax_amount, orders.total_with_tax — tax fields
- orders.our_cost, orders.customer_price — pricing
