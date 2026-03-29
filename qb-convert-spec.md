# QB Edge Function Spec: Convert PO→Bill and Convert Estimate→Invoice

> Hand this document to Claude Code. It has everything needed to build both functions.

## Project Context

- **Supabase project:** CRLE (`dubzwbfqlwhkpmpuejsy`)
- **GitHub repo:** `chandyolson/catl-order-tracker`
- **Edge functions directory:** `supabase/functions/`
- **Runtime:** Deno (Supabase Edge Functions)
- **All existing QB functions use raw `fetch()` calls** — no SDK needed

## Existing Patterns to Follow

All QB edge functions follow the same structure:
1. Import `createClient` from `https://esm.sh/@supabase/supabase-js@2.49.4`
2. Define `corsHeaders` for CORS
3. Define a `getQBToken()` function that reads `qb_tokens` table, checks expiry, refreshes if needed
4. `Deno.serve(async (req) => { ... })` handler
5. Return HTTP 200 on errors with `{ success: false, error: "message" }` (NOT 500 — frontend can't read 500 error bodies)
6. On success, update the `orders` table with the QB document IDs
7. Insert a timeline event into `order_timeline`

**Reference functions already in the repo:**
- `supabase/functions/qb-push-estimate/index.ts` — creates QB Estimate at retail prices
- `supabase/functions/qb-push-po/index.ts` — creates QB Purchase Order at cost prices

## QB API Basics

- **Base URL:** `https://quickbooks.api.intuit.com/v3/company/{realm_id}`
- **Auth:** `Authorization: Bearer {access_token}`
- **Content-Type:** `application/json`
- **Accept:** `application/json`
- **Minor version:** Add `?minorversion=73` to all requests

## Token Refresh Pattern (copy from existing functions)

```typescript
async function getQBToken(supabase: any) {
  const { data: tokenRow } = await supabase.from("qb_tokens").select("*").limit(1).single();
  if (!tokenRow) throw new Error("QuickBooks not connected");
  if (new Date(tokenRow.access_token_expires_at) > new Date()) return tokenRow;
  const clientId = Deno.env.get("QB_CLIENT_ID");
  const clientSecret = Deno.env.get("QB_CLIENT_SECRET");
  const resp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenRow.refresh_token })
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);
  const tokens = await resp.json();
  const now = new Date();
  await supabase.from("qb_tokens").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
    refresh_token_expires_at: new Date(now.getTime() + (tokens.x_refresh_token_expires_in || 8726400) * 1000).toISOString(),
    updated_at: now.toISOString()
  }).eq("id", tokenRow.id);
  return { ...tokenRow, access_token: tokens.access_token };
}
```

---

## FUNCTION 1: `qb-convert-po-to-bill`

### What it does
Creates a QB Bill linked to an existing QB Purchase Order. This is how we record Moly's invoice in QB.

### Input
```json
{ "order_id": "uuid" }
```

### Steps
1. Fetch order from `orders` table (with `manufacturers(*)` and `base_models:base_model_id(*)`)
2. Verify `qb_po_id` exists on the order (the PO must have been pushed first)
3. Verify `qb_bill_id` does NOT exist (don't double-create)
4. Get QB token
5. First, READ the existing PO from QB to get its current SyncToken and line items:
   ```
   GET /v3/company/{realm_id}/purchaseorder/{qb_po_id}?minorversion=73
   ```
6. Create a Bill linked to the PO:
   ```
   POST /v3/company/{realm_id}/bill?minorversion=73
   ```

### QB Bill JSON Payload

The Bill must have `LinkedTxn` referencing the PO, and lines using `ItemBasedExpenseLineDetail`:

```json
{
  "VendorRef": { "value": "{manufacturer.qb_vendor_id}" },
  "LinkedTxn": [
    {
      "TxnId": "{qb_po_id}",
      "TxnType": "PurchaseOrder"
    }
  ],
  "Line": [
    {
      "Amount": 200.00,
      "DetailType": "ItemBasedExpenseLineDetail",
      "ItemBasedExpenseLineDetail": {
        "ItemRef": { "value": "{qb_item_id}", "name": "{qb_item_name}" },
        "UnitPrice": 200.00,
        "Qty": 1
      }
    }
  ],
  "TxnDate": "2026-03-29"
}
```

**IMPORTANT about linking to PO:**
- The `LinkedTxn` goes at the TOP LEVEL of the Bill (not inside lines)
- Each line that corresponds to a PO line should have a NEW Id (or omit Id entirely — QB assigns one)
- The VendorRef MUST match the PO's vendor
- When the Bill total matches the PO total, QB automatically marks the PO as "Closed"

### Line items strategy
Copy the same line items from our order's `selected_options` that we used for the PO, using COST prices:
- Base model at `cost_price` with `ItemRef: { value: qb_item_id, name: qb_item_name }`
- Each option at `cost_price_each` with its `ItemRef`
- Freight as a separate line if present

### After success
```sql
UPDATE orders SET 
  qb_bill_id = '{Bill.Id from response}',
  qb_bill_doc_number = '{Bill.DocNumber from response}'
WHERE id = '{order_id}';
```

Insert timeline event:
```sql
INSERT INTO order_timeline (order_id, event_type, title, description, created_by)
VALUES ('{order_id}', 'bill_created', 'Bill created in QuickBooks', 
        'QB Bill #{DocNumber} linked to PO #{qb_po_doc_number}', 'system');
```

### Database columns on `orders` table
- `qb_po_id` (text) — already exists, must be set before calling this function
- `qb_po_doc_number` (text) — already exists
- `qb_bill_id` (text) — already exists, this function sets it
- `qb_bill_doc_number` (text) — just added, this function sets it
- `manufacturer_id` (uuid) — FK to manufacturers table
- `manufacturers.qb_vendor_id` (text) — the QB vendor ID for the manufacturer

---

## FUNCTION 2: `qb-convert-estimate-to-invoice`

### What it does
Creates a QB Invoice linked to an existing QB Estimate. This happens when the chute ships from the manufacturer — now the customer owes money.

### Input
```json
{ "order_id": "uuid" }
```

### Steps
1. Fetch order from `orders` table (with `customers(*)`, `base_models:base_model_id(*)`)
2. Fetch the ACCEPTED estimate from `estimates` table: `WHERE order_id = {order_id} AND is_current = true` (or `is_approved = true`)
3. Verify `qb_estimate_id` exists on the order (the estimate must have been pushed first)
4. Verify `qb_invoice_id` does NOT exist (don't double-create)
5. Get QB token
6. Create an Invoice linked to the Estimate:
   ```
   POST /v3/company/{realm_id}/invoice?minorversion=73
   ```

### QB Invoice JSON Payload

```json
{
  "CustomerRef": { "value": "{customer.qb_customer_id}" },
  "LinkedTxn": [
    {
      "TxnId": "{qb_estimate_id}",
      "TxnType": "Estimate"
    }
  ],
  "Line": [
    {
      "Amount": 100.00,
      "DetailType": "SalesItemLineDetail",
      "SalesItemLineDetail": {
        "ItemRef": { "value": "{qb_item_id}", "name": "{qb_item_name}" },
        "UnitPrice": 100.00,
        "Qty": 1
      }
    },
    {
      "Amount": 100.00,
      "DetailType": "SubTotalLineDetail",
      "SubTotalLineDetail": {}
    }
  ],
  "TxnDate": "2026-03-29",
  "DocNumber": "{estimate_number or contract reference}"
}
```

**IMPORTANT about linking to Estimate:**
- The `LinkedTxn` with `TxnType: "Estimate"` goes at the TOP LEVEL of the Invoice
- Only ONE estimate can be linked per invoice
- QB automatically marks the Estimate as "Closed" when fully invoiced
- Line items use `SalesItemLineDetail` (same as estimates — these are RETAIL/sales prices)

### Line items strategy
Use the SAME line items from our existing `qb-push-estimate` function — retail prices with ItemRef. Build them from the order's `selected_options`:
- Base model at `retail_price` with `ItemRef: { value: qb_item_id, name: qb_item_name }`
- Each option at `retail_price_each` with its `ItemRef`
- Freight as a separate line if present
- Discount line if applicable
- Tax if applicable (order has `tax_state` and `tax_amount` fields)

### After success
```sql
UPDATE orders SET 
  qb_invoice_id = '{Invoice.Id from response}',
  qb_invoice_doc_number = '{Invoice.DocNumber from response}'
WHERE id = '{order_id}';
```

Insert timeline event:
```sql
INSERT INTO order_timeline (order_id, event_type, title, description, created_by)
VALUES ('{order_id}', 'invoice_created', 'Customer invoice created in QuickBooks', 
        'QB Invoice #{DocNumber} linked to Estimate #{qb_estimate_doc_number}', 'system');
```

### Database columns on `orders` table
- `qb_estimate_id` (text) — already exists, must be set before calling this function
- `qb_estimate_doc_number` (text) — just added
- `qb_invoice_id` (text) — already exists, this function sets it
- `qb_invoice_doc_number` (text) — just added, this function sets it
- `customer_id` (uuid) — FK to customers table
- `customers.qb_customer_id` (text) — the QB customer ID

---

## Key Tables Reference

### `orders` — relevant columns
```
id (uuid PK)
customer_id (uuid FK → customers)
manufacturer_id (uuid FK → manufacturers)
base_model_id (uuid FK → base_models)
selected_options (jsonb) — frozen array of options with cost_price_each, retail_price_each
customer_price (numeric) — frozen retail total
our_cost (numeric) — frozen cost total
freight_estimate (numeric)
discount_amount (numeric)
discount_type (text) — "$" or "%"
subtotal (numeric)
tax_state (text) — "SD" or "ND"
tax_amount (numeric)
contract_name (text)
moly_contract_number (text)
order_number (text)
build_shorthand (text)
qb_estimate_id (text)
qb_estimate_doc_number (text)
qb_po_id (text)
qb_po_doc_number (text)
qb_bill_id (text)
qb_bill_doc_number (text)
qb_invoice_id (text)
qb_invoice_doc_number (text)
```

### `estimates` — relevant columns
```
id (uuid PK)
order_id (uuid FK → orders)
estimate_number (text) — our generated number like "2026EST-001"
qb_estimate_id (text)
qb_doc_number (text)
is_current (boolean)
is_approved (boolean)
total_price (numeric)
line_items (jsonb) — frozen snapshot of all line items
```

### `manufacturers` — relevant columns
```
id (uuid PK)
name (text)
qb_vendor_id (text) — QB's internal vendor ID
```

### `customers` — relevant columns
```
id (uuid PK)
name (text)
qb_customer_id (text) — QB's internal customer ID
```

### `base_models` — relevant columns
```
id (uuid PK)
name (text)
qb_item_id (text)
qb_item_name (text)
cost_price (numeric)
retail_price (numeric)
```

### `model_options` — relevant columns
```
id (uuid PK)
name (text)
qb_item_id (text)
qb_item_name (text)
qb_item_name_by_model (jsonb) — per-model QB name overrides
cost_price (numeric)
retail_price (numeric)
```

### `order_timeline` — for logging
```
id (uuid PK, default gen_random_uuid())
order_id (uuid FK → orders)
event_type (text)
title (text)
description (text)
created_by (text) — use "system"
created_at (timestamptz, default now())
```

---

## Deployment

Deploy each function using Supabase CLI:
```bash
supabase functions deploy qb-convert-po-to-bill --project-ref dubzwbfqlwhkpmpuejsy
supabase functions deploy qb-convert-estimate-to-invoice --project-ref dubzwbfqlwhkpmpuejsy
```

Also commit source to git at:
- `supabase/functions/qb-convert-po-to-bill/index.ts`
- `supabase/functions/qb-convert-estimate-to-invoice/index.ts`

**CRITICAL: Set `verify_jwt: false`** — these functions are called from the frontend via `supabase.functions.invoke()`.

---

## Frontend Buttons (for later — NOT part of this task)

These functions will be called from the Order Detail page with four buttons:
1. "Push Estimate to QB" → `qb-push-estimate` (already exists)
2. "Push PO to QB" → `qb-push-po` (already exists)
3. "Convert PO to Bill" → `qb-convert-po-to-bill` (NEW — build this)
4. "Convert Estimate to Invoice" → `qb-convert-estimate-to-invoice` (NEW — build this)

The buttons should be contextual:
- "Push Estimate" shows when `qb_estimate_id` is null
- "Push PO" shows when order has status >= purchase_order and `qb_po_id` is null
- "Convert to Bill" shows when `qb_po_id` exists but `qb_bill_id` is null
- "Convert to Invoice" shows when `qb_estimate_id` exists but `qb_invoice_id` is null
