import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
const FALLBACK_ITEM = "Cost of Goods Sold";

async function getQBToken(supabase: any) {
  const { data: tokenRow } = await supabase.from("qb_tokens").select("*").limit(1).single();
  if (!tokenRow) throw new Error("QuickBooks not connected");
  if (new Date(tokenRow.access_token_expires_at) > new Date()) return tokenRow;
  const clientId = Deno.env.get("QB_CLIENT_ID"); const clientSecret = Deno.env.get("QB_CLIENT_SECRET");
  const resp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenRow.refresh_token }) });
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);
  const tokens = await resp.json(); const now = new Date();
  await supabase.from("qb_tokens").update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, access_token_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(), refresh_token_expires_at: new Date(now.getTime() + (tokens.x_refresh_token_expires_in || 8726400) * 1000).toISOString(), updated_at: now.toISOString() }).eq("id", tokenRow.id);
  return { ...tokenRow, access_token: tokens.access_token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const steps: string[] = [];
  try {
    const { order_id } = await req.json();
    if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order, error: ordErr } = await supabase.from("orders").select("*, manufacturers(*), base_models:base_model_id(*)").eq("id", order_id).single();
    if (ordErr || !order) throw new Error(`Order not found: ${ordErr?.message}`);
    steps.push(`order: ${order.contract_name || order.moly_contract_number || order.order_number || order.id}`);

    if (order.qb_po_id) return new Response(JSON.stringify({ success: true, already_exists: true, qb_po_id: order.qb_po_id, qb_po_doc_number: order.qb_po_doc_number, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const mfg = order.manufacturers;
    if (!mfg) throw new Error("No manufacturer linked to order");
    steps.push(`mfg: ${mfg.name}`);

    const tokenData = await getQBToken(supabase);
    const { access_token, realm_id } = tokenData;
    const baseUrl = Deno.env.get("QB_BASE_URL") || "https://quickbooks.api.intuit.com";
    const qbLines: any[] = [];
    let lineNum = 1;
    const selectedOptions = order.selected_options || [];
    const baseModel = order.base_models;

    // Base model at COST — MUST have ItemRef
    if (baseModel) {
      qbLines.push({ Id: String(lineNum++), DetailType: "ItemBasedExpenseLineDetail", Amount: baseModel.cost_price || 0, Description: baseModel.name || "", ItemBasedExpenseLineDetail: { ItemRef: { ...(baseModel.qb_item_id ? { value: baseModel.qb_item_id } : {}), name: baseModel.qb_item_name || FALLBACK_ITEM }, UnitPrice: baseModel.cost_price || 0, Qty: 1 } });
      steps.push(`base: ${baseModel.name} -> ${baseModel.qb_item_name || FALLBACK_ITEM} @ $${baseModel.cost_price}`);
    }

    // Options at COST — each MUST have ItemRef
    if (Array.isArray(selectedOptions) && selectedOptions.length > 0) {
      const optionIds = selectedOptions.map((o: any) => o.option_id).filter(Boolean);
      let optionMap: Record<string, any> = {};
      if (optionIds.length > 0) {
        const { data: optRows } = await supabase.from("model_options").select("id, qb_item_name, qb_item_id, qb_item_name_by_model").in("id", optionIds);
        if (optRows) for (const row of optRows) optionMap[row.id] = row;
      }
      steps.push(`option mappings loaded: ${Object.keys(optionMap).length}`);

      for (const opt of selectedOptions) {
        const qty = opt.quantity || 1;
        const costEach = opt.cost_price_each || 0;
        const amount = costEach * qty;
        let itemName = FALLBACK_ITEM;
        const mapping = opt.option_id ? optionMap[opt.option_id] : null;
        if (mapping) {
          if (mapping.qb_item_name_by_model && order.base_model_id && mapping.qb_item_name_by_model[order.base_model_id]) itemName = mapping.qb_item_name_by_model[order.base_model_id];
          else if (mapping.qb_item_name) itemName = mapping.qb_item_name;
        }
        let desc = opt.display_name || opt.name || "";
        if (opt.pivot_type) desc += ` (${opt.side || ""}, ${opt.pivot_type === "side_to_side" ? "side to side" : "front to back"})`;
        else if (opt.left_qty !== undefined || opt.right_qty !== undefined) {
          const sides: string[] = [];
          if (opt.left_qty > 0) sides.push(`L:${opt.left_qty}`);
          if (opt.right_qty > 0) sides.push(`R:${opt.right_qty}`);
          if (sides.length > 0) desc += ` (${sides.join(", ")})`;
        }
        qbLines.push({ Id: String(lineNum++), DetailType: "ItemBasedExpenseLineDetail", Amount: amount, Description: desc, ItemBasedExpenseLineDetail: { ItemRef: { ...(mapping?.qb_item_id ? { value: mapping.qb_item_id } : {}), name: itemName }, UnitPrice: costEach, Qty: qty } });
      }
      steps.push(`options: ${selectedOptions.length} line items`);
    }

    // Freight
    if (order.freight_estimate && order.freight_estimate > 0) {
      qbLines.push({ Id: String(lineNum++), DetailType: "ItemBasedExpenseLineDetail", Amount: order.freight_estimate, Description: "Freight", ItemBasedExpenseLineDetail: { ItemRef: { name: "Shipping Charges" }, UnitPrice: order.freight_estimate, Qty: 1 } });
      steps.push(`freight: $${order.freight_estimate}`);
    }

    // Fallback
    if (qbLines.length === 0) {
      qbLines.push({ Id: "1", DetailType: "ItemBasedExpenseLineDetail", Amount: order.our_cost || 0, Description: order.build_shorthand || "Equipment", ItemBasedExpenseLineDetail: { ItemRef: { name: FALLBACK_ITEM }, UnitPrice: order.our_cost || 0, Qty: 1 } });
      steps.push("fallback: lump sum");
    }

    const vendorRef = mfg.qb_vendor_id ? { value: mfg.qb_vendor_id } : { name: mfg.name };
    const orderLabel = order.contract_name || order.moly_contract_number || order.order_number || "";
    const qbPO: any = { Line: qbLines, VendorRef: vendorRef, TxnDate: order.ordered_date || new Date().toISOString().split("T")[0], PrivateNote: `${orderLabel}${order.build_shorthand ? " - " + order.build_shorthand : ""}${order.moly_contract_number ? " | Contract: " + order.moly_contract_number : ""}`.substring(0, 4000) };
    steps.push(`PO payload: ${qbLines.length} lines, vendor=${JSON.stringify(vendorRef)}`);

    const qbResp = await fetch(`${baseUrl}/v3/company/${realm_id}/purchaseorder?minorversion=75`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(qbPO) });
    const qbBody = await qbResp.text();
    if (!qbResp.ok) throw new Error(`QB ${qbResp.status}: ${qbBody}`);

    const qbData = JSON.parse(qbBody);
    const poId = qbData.PurchaseOrder.Id;
    const poDoc = qbData.PurchaseOrder.DocNumber;
    steps.push(`PO created: #${poDoc}`);

    await supabase.from("orders").update({ qb_po_id: poId, qb_po_doc_number: poDoc }).eq("id", order_id);
    await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "order_placed", title: "Purchase Order pushed to QuickBooks", description: `QB PO #${poDoc} (ID: ${poId}) - ${qbLines.length} line items to ${mfg.name}`, created_by: "system" });

    return new Response(JSON.stringify({ success: true, qb_po_id: poId, qb_po_doc_number: poDoc, line_count: qbLines.length, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message, steps }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
