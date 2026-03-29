import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };

async function refreshQBTokens(supabase: any) {
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
  try {
    const { estimate_id } = await req.json();
    if (!estimate_id) return new Response(JSON.stringify({ error: "estimate_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: estimate, error: estErr } = await supabase.from("estimates").select("*, orders(*, customers(*), base_models:base_model_id(*))").eq("id", estimate_id).single();
    if (estErr || !estimate) throw new Error("Estimate not found");

    const order = estimate.orders;
    const customer = order?.customers;
    const baseModel = order?.base_models;
    const tokenData = await refreshQBTokens(supabase);
    const { access_token, realm_id } = tokenData;
    const baseUrl = Deno.env.get("QB_BASE_URL") || "https://quickbooks.api.intuit.com";

    // --- Build INDIVIDUAL line items at RETAIL prices ---
    const qbLines: any[] = [];
    let lineNum = 1;
    const selectedOptions = order?.selected_options || [];

    // Base model line
    if (baseModel) {
      const line: any = { Id: String(lineNum++), DetailType: "SalesItemLineDetail", Amount: baseModel.retail_price || 0, Description: baseModel.name || "Base Model", SalesItemLineDetail: { UnitPrice: baseModel.retail_price || 0, Qty: 1 } };
      if (baseModel.qb_item_id || baseModel.qb_item_name) line.SalesItemLineDetail.ItemRef = { ...(baseModel.qb_item_id ? { value: baseModel.qb_item_id } : {}), name: baseModel.qb_item_name || "Services" };
      qbLines.push(line);
    }

    // Option lines
    if (Array.isArray(selectedOptions) && selectedOptions.length > 0) {
      const optionIds = selectedOptions.map((o: any) => o.option_id).filter(Boolean);
      let optionMap: Record<string, any> = {};
      if (optionIds.length > 0) {
        const { data: optRows } = await supabase.from("model_options").select("id, qb_item_name, qb_item_id, qb_item_name_by_model").in("id", optionIds);
        if (optRows) for (const row of optRows) optionMap[row.id] = row;
      }
      for (const opt of selectedOptions) {
        const qty = opt.quantity || 1;
        const retailEach = opt.retail_price_each || 0;
        const amount = retailEach * qty;
        let itemName: string | null = null;
        const mapping = opt.option_id ? optionMap[opt.option_id] : null;
        if (mapping) {
          if (mapping.qb_item_name_by_model && order.base_model_id && mapping.qb_item_name_by_model[order.base_model_id]) itemName = mapping.qb_item_name_by_model[order.base_model_id];
          else if (mapping.qb_item_name) itemName = mapping.qb_item_name;
        }
        let desc = opt.display_name || opt.name || "Option";
        if (opt.pivot_type) desc += ` (${opt.side || ""}, ${opt.pivot_type === "side_to_side" ? "side to side" : "front to back"})`;
        else if (opt.left_qty !== undefined || opt.right_qty !== undefined) {
          const sides: string[] = [];
          if (opt.left_qty > 0) sides.push(`L:${opt.left_qty}`);
          if (opt.right_qty > 0) sides.push(`R:${opt.right_qty}`);
          if (sides.length > 0) desc += ` (${sides.join(", ")})`;
        }
        if (amount === 0) desc += " — Included";
        const line: any = { Id: String(lineNum++), DetailType: "SalesItemLineDetail", Amount: amount, Description: desc, SalesItemLineDetail: { UnitPrice: retailEach, Qty: qty } };
        const itemId = mapping?.qb_item_id || null;
        if (itemName || itemId) line.SalesItemLineDetail.ItemRef = { ...(itemId ? { value: itemId } : {}), name: itemName || "Services" };
        qbLines.push(line);
      }
    }

    // Discount
    if (order?.discount_amount && order.discount_amount > 0) {
      const dv = order.discount_type === "%" ? Math.round((order.subtotal || 0) * order.discount_amount) / 100 : order.discount_amount;
      if (dv > 0) qbLines.push({ Id: String(lineNum++), DetailType: "DiscountLineDetail", Amount: dv, DiscountLineDetail: { PercentBased: order.discount_type === "%", ...(order.discount_type === "%" ? { DiscountPercent: order.discount_amount } : {}) } });
    }

    // Fallback
    if (qbLines.length === 0) {
      const price = order?.customer_price ?? estimate.total_price ?? 0;
      qbLines.push({ Id: "1", DetailType: "SalesItemLineDetail", Amount: price, Description: estimate.build_shorthand || "Equipment", SalesItemLineDetail: { UnitPrice: price, Qty: 1 } });
    }

    const orderLabel = order?.contract_name || order?.moly_contract_number || "";
    const qbEstimate: any = { Line: qbLines, TxnDate: new Date().toISOString().split("T")[0], PrivateNote: `${orderLabel}${order?.build_shorthand ? " - " + order.build_shorthand : ""}${order?.tax_state && order?.tax_amount > 0 ? ` | Tax: ${order.tax_state} $${order.tax_amount}` : ""}`.substring(0, 4000) };
    if (estimate.estimate_number) qbEstimate.DocNumber = estimate.estimate_number;
    if (customer?.qb_customer_id) qbEstimate.CustomerRef = { value: customer.qb_customer_id };
    else if (customer?.name) qbEstimate.CustomerRef = { name: customer.name };

    if (estimate.qb_estimate_id) {
      const existingResp = await fetch(`${baseUrl}/v3/company/${realm_id}/estimate/${estimate.qb_estimate_id}`, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
      if (existingResp.ok) { const existing = await existingResp.json(); qbEstimate.Id = estimate.qb_estimate_id; qbEstimate.SyncToken = existing.Estimate.SyncToken; }
      else throw new Error(`Failed to fetch existing QB estimate: ${existingResp.status} - ${await existingResp.text()}`);
    }

    const qbResp = await fetch(`${baseUrl}/v3/company/${realm_id}/estimate`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(qbEstimate) });
    if (!qbResp.ok) throw new Error(`QuickBooks API error: ${qbResp.status} - ${await qbResp.text()}`);

    const qbData = await qbResp.json();
    const qbEstimateId = qbData.Estimate.Id;
    const qbDocNumber = qbData.Estimate.DocNumber;

    await supabase.from("estimates").update({ qb_estimate_id: qbEstimateId, qb_doc_number: qbDocNumber, ...(!estimate.estimate_number ? { estimate_number: qbDocNumber } : {}) }).eq("id", estimate_id);
    await supabase.from("orders").update({ qb_estimate_id: qbEstimateId }).eq("id", order.id);
    await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "estimate_sent", title: "Estimate pushed to QuickBooks", description: `QB Estimate #${qbDocNumber} (ID: ${qbEstimateId}) — ${qbLines.length} line items`, created_by: "system" });

    return new Response(JSON.stringify({ success: true, qb_estimate_id: qbEstimateId, qb_doc_number: qbDocNumber, line_count: qbLines.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
