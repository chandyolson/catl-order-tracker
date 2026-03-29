// DO NOT EDIT IN LOVABLE — deployed via GitHub Actions
// Version: 55 (2026-03-29) — DocNumber ALWAYS sent on create AND update
// Key fixes: DocNumber ALWAYS sent, HTTP 200 on errors, ItemRef.value always present

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Content-Type": "application/json" };

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
    if (!estimate_id) return new Response(JSON.stringify({ success: false, error: "estimate_id required" }), { status: 200, headers: corsHeaders });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: estimate, error: estErr } = await supabase.from("estimates").select("*, orders(*, customers(*), base_models:base_model_id(*))").eq("id", estimate_id).single();
    if (estErr || !estimate) return new Response(JSON.stringify({ success: false, error: "Estimate not found" }), { status: 200, headers: corsHeaders });
    const order = estimate.orders; const customer = order?.customers; const baseModel = order?.base_models;
    const tokenData = await refreshQBTokens(supabase);
    const { access_token, realm_id } = tokenData;
    const baseUrl = "https://quickbooks.api.intuit.com";
    const qbLines: any[] = []; let lineNum = 1;
    const selectedOptions = order?.selected_options || [];
    if (baseModel) { qbLines.push({ Id: String(lineNum++), DetailType: "SalesItemLineDetail", Amount: baseModel.retail_price || 0, Description: baseModel.name || "Base Model", SalesItemLineDetail: { UnitPrice: baseModel.retail_price || 0, Qty: 1, ItemRef: { value: baseModel.qb_item_id || "1", name: baseModel.qb_item_name || "Services" } } }); }
    if (Array.isArray(selectedOptions) && selectedOptions.length > 0) {
      const optionIds = selectedOptions.map((o: any) => o.option_id).filter(Boolean);
      let optionMap: Record<string, any> = {};
      if (optionIds.length > 0) { const { data: optRows } = await supabase.from("model_options").select("id, qb_item_name, qb_item_id, qb_item_name_by_model").in("id", optionIds); if (optRows) for (const row of optRows) optionMap[row.id] = row; }
      for (const opt of selectedOptions) {
        const qty = opt.quantity || 1; const retailEach = opt.retail_price_each || 0; const amount = retailEach * qty;
        let itemName: string | null = null; let itemId: string | null = null;
        const mapping = opt.option_id ? optionMap[opt.option_id] : null;
        if (mapping) { itemId = mapping.qb_item_id || null; if (mapping.qb_item_name_by_model && order.base_model_id && mapping.qb_item_name_by_model[order.base_model_id]) itemName = mapping.qb_item_name_by_model[order.base_model_id]; else if (mapping.qb_item_name) itemName = mapping.qb_item_name; }
        let desc = opt.display_name || opt.name || "Option";
        if (opt.pivot_type) desc += ` (${opt.side || ""}, ${opt.pivot_type === "side_to_side" ? "side to side" : "front to back"})`;
        else if (opt.left_qty !== undefined || opt.right_qty !== undefined) { const sides: string[] = []; if (opt.left_qty > 0) sides.push(`L:${opt.left_qty}`); if (opt.right_qty > 0) sides.push(`R:${opt.right_qty}`); if (sides.length > 0) desc += ` (${sides.join(", ")})`; }
        if (amount === 0) desc += " \u2014 Included";
        qbLines.push({ Id: String(lineNum++), DetailType: "SalesItemLineDetail", Amount: amount, Description: desc, SalesItemLineDetail: { UnitPrice: retailEach, Qty: qty, ItemRef: { value: itemId || "1", name: itemName || "Services" } } });
      }
    }
    if (order?.discount_amount && order.discount_amount > 0) {
      const dv = order.discount_type === "%" ? Math.round((order.subtotal || 0) * order.discount_amount) / 100 : order.discount_amount;
      if (dv > 0) {
        let discountAccountRef: { value: string; name: string };
        if (tokenData.discount_account_id) { discountAccountRef = { value: tokenData.discount_account_id, name: tokenData.discount_account_name || "Discounts given" }; }
        else {
          const dAcctResp = await fetch(`${baseUrl}/v3/company/${realm_id}/query?query=SELECT%20*%20FROM%20Account%20WHERE%20AccountType%20%3D%20'Income'%20AND%20AccountSubType%20%3D%20'DiscountsRefundsGiven'%20MAXRESULTS%201&minorversion=73`, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
          if (!dAcctResp.ok) return new Response(JSON.stringify({ success: false, error: `Discount account fetch failed` }), { status: 200, headers: corsHeaders });
          const dAcctData = await dAcctResp.json(); const dAcct = dAcctData?.QueryResponse?.Account?.[0];
          if (!dAcct) return new Response(JSON.stringify({ success: false, error: "No discount account in QB." }), { status: 200, headers: corsHeaders });
          discountAccountRef = { value: dAcct.Id, name: dAcct.Name };
          await supabase.from("qb_tokens").update({ discount_account_id: dAcct.Id, discount_account_name: dAcct.Name }).eq("id", tokenData.id);
        }
        qbLines.push({ Id: String(lineNum++), DetailType: "DiscountLineDetail", Amount: dv, DiscountLineDetail: { DiscountAccountRef: discountAccountRef, PercentBased: order.discount_type === "%", ...(order.discount_type === "%" ? { DiscountPercent: order.discount_amount } : {}) } });
      }
    }
    if (qbLines.length === 0) { const price = order?.customer_price ?? estimate.total_price ?? 0; qbLines.push({ Id: "1", DetailType: "SalesItemLineDetail", Amount: price, Description: estimate.build_shorthand || "Equipment", SalesItemLineDetail: { UnitPrice: price, Qty: 1, ItemRef: { value: "1", name: "Services" } } }); }
    if (!customer?.qb_customer_id) return new Response(JSON.stringify({ success: false, error: `Customer "${customer?.name || "unknown"}" has no QB customer ID. Sync customers first.` }), { status: 200, headers: corsHeaders });
    const orderLabel = order?.contract_name || order?.moly_contract_number || "";
    const qbEstimate: any = { Line: qbLines, TxnDate: new Date().toISOString().split("T")[0], CustomerRef: { value: customer.qb_customer_id, name: customer.name }, PrivateNote: `${orderLabel}${order?.build_shorthand ? " - " + order.build_shorthand : ""}`.substring(0, 4000) };
    // *** ALWAYS send DocNumber — on create AND update ***
    if (estimate.estimate_number) { qbEstimate.DocNumber = estimate.estimate_number; }
    if (estimate.qb_estimate_id) {
      const existingResp = await fetch(`${baseUrl}/v3/company/${realm_id}/estimate/${estimate.qb_estimate_id}?minorversion=73`, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
      if (existingResp.ok) { const existing = await existingResp.json(); qbEstimate.Id = estimate.qb_estimate_id; qbEstimate.SyncToken = existing.Estimate.SyncToken; qbEstimate.sparse = true; }
      else { return new Response(JSON.stringify({ success: false, error: `Failed to fetch existing QB estimate` }), { status: 200, headers: corsHeaders }); }
    }
    console.log(`Pushing to QB: ${qbLines.length} lines, DocNumber=${qbEstimate.DocNumber || 'none'}, Customer=${customer.name}`);
    const qbResp = await fetch(`${baseUrl}/v3/company/${realm_id}/estimate?minorversion=73`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(qbEstimate) });
    const qbRespText = await qbResp.text();
    if (!qbResp.ok) { console.error(`QB API error: ${qbResp.status} ${qbRespText}`); return new Response(JSON.stringify({ success: false, error: `QB API ${qbResp.status}: ${qbRespText}` }), { status: 200, headers: corsHeaders }); }
    const qbData = JSON.parse(qbRespText); const qbEstimateId = qbData.Estimate.Id; const qbDocNumber = qbData.Estimate.DocNumber;
    await supabase.from("estimates").update({ qb_estimate_id: qbEstimateId, qb_doc_number: qbDocNumber, ...(!estimate.estimate_number ? { estimate_number: qbDocNumber } : {}) }).eq("id", estimate_id);
    await supabase.from("orders").update({ qb_estimate_id: qbEstimateId, qb_estimate_doc_number: qbDocNumber }).eq("id", order.id);
    await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "estimate_sent", title: "Estimate pushed to QuickBooks", description: `QB Estimate #${qbDocNumber} (ID: ${qbEstimateId}) \u2014 ${qbLines.length} line items at retail`, created_by: "system" });
    return new Response(JSON.stringify({ success: true, qb_estimate_id: qbEstimateId, qb_doc_number: qbDocNumber, line_count: qbLines.length }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("qb-push-estimate error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), { status: 200, headers: corsHeaders });
  }
});
