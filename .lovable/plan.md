

# Implementation Plan: App Shell + Dashboard + New Order Form

The codebase is still at the default placeholder state — nothing from the approved dashboard plan has been built yet. Both **Prompt 1** (app shell + dashboard) and **Prompt 2** (new order form) need to be implemented together.

## What Gets Built

### 1. Design System & Global Styles
- Tailwind config with CATL colors, Inter font
- CSS variables, input sizing (16px min), tap targets (44px)

### 2. App Shell (Layout + Navigation)
- Responsive layout: 220px sidebar (desktop), hamburger + drawer (mobile)
- Gradient header/sidebar (#153566 → #081020)
- 6 nav items with lucide icons, teal active states
- Gold "New Order" button (desktop header) / FAB (mobile)

### 3. Dashboard (/)
- KPI row (4 gradient cards querying orders + attention_items)
- Attention banner + attention items list from `attention_items` view
- Recent orders list (10 latest, navy cards, status badges)
- All cards tappable → /orders/{id}

### 4. New Order Form (/orders/new) — **NEW from Prompt 2**
- Header with back arrow + "New Order" title
- White card with horizontal label-input form layout (label 85px left, input flex-1 right)
- **Sections:**
  - Customer & Manufacturer: searchable customer combobox with "+ Add New Customer" inline form, manufacturer dropdown defaulting to "MOLY Manufacturing"
  - Build Details: base model, build shorthand (teal when filled), build description textarea
  - Pricing: customer price, our cost (currency inputs with $ prefix), auto-calculated margin with color coding (green ≥15%, gold 10-15%, red <10%), freight estimate
  - Status & Dates: status dropdown (default "estimate"), estimate date (default today), est. completion date
  - Inventory: collapsible section, toggle switch for "From Inventory" revealing location + serial number fields
  - Notes: optional textarea
- Gold pill "Create Order" button, full width on mobile
- **Save logic:** RPC `generate_order_number()` → insert order → insert estimate (v1) → toast → navigate to /orders/{id}
- **Validation:** customer, manufacturer, build shorthand, customer price > 0, our cost > 0 required; red error text below fields

### 5. Placeholder Pages + Routing
- Stub pages for /orders, /paperwork, /production, /customers, /inventory
- Route for /orders/new, /orders/:id
- App.tsx updated with Layout wrapper and all routes

## Files to Create/Modify

| File | Action |
|------|--------|
| `tailwind.config.ts` | Add CATL colors, Inter font |
| `src/index.css` | Inter import, CSS vars, input/tap sizing |
| `src/components/Layout.tsx` | Sidebar, header, drawer, FAB |
| `src/components/StatusBadge.tsx` | 11 status color mappings |
| `src/components/AttentionBadge.tsx` | 5 attention type badges |
| `src/hooks/useDashboardData.ts` | React Query hooks for KPIs, attention, recent orders |
| `src/pages/Index.tsx` | Full dashboard |
| `src/pages/NewOrder.tsx` | New order form with all sections |
| `src/pages/Orders.tsx` | Placeholder |
| `src/pages/Paperwork.tsx` | Placeholder |
| `src/pages/Production.tsx` | Placeholder |
| `src/pages/Customers.tsx` | Placeholder |
| `src/pages/Inventory.tsx` | Placeholder |
| `src/App.tsx` | All routes, Layout wrapper |
| `src/App.css` | Delete |

