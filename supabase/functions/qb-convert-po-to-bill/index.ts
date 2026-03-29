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

    if (!order.qb_po_id) throw new Error("No QB Purchase Order found on this order. Push a PO to QuickBooks first.");
    if (order.qb_bill_id) return new Response(JSON.stringify({ success: true, already_exists: true, qb_bill_id: order.qb_bill_id, qb_bill_doc_number: order.qb_bill_doc_number, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const mfg = order.manufacturers;
    if (!mfg) throw new Error("No manufacturer linked to order");
    if (!mfg.qb_vendor_id) throw new Error(`Manufacturer "${mfg.name}" has no QuickBooks vendor ID. Link the vendor in Settings before converting to a Bill.`);
    steps.push(`mfg: ${mfg.name}`);

    const tokenData = await getQBToken(supabase);
    const { access_token, realm_id } = tokenData;
    const baseUrl = Deno.env.get("QB_BASE_URL") || "https://quickbooks.api.intuit.com";

    // Resolve APAccountRef — fetch from QB once and cache on qb_tokens row
    let apAccountRef: { value: string; name: string };
    if (tokenData.ap_account_id) {
      apAccountRef = { value: tokenData.ap_account_id, name: tokenData.ap_account_name || "Accounts Payable (A/P)" };
      steps.push(`AP account (cached): ${apAccountRef.name}`);
    } else {
      const apResp = await fetch(`${baseUrl}/v3/company/${realm_id}/query?query=SELECT%20*%20FROM%20Account%20WHERE%20AccountSubType%20%3D%20'AccountsPayable'%20MAXRESULTS%201&minorversion=75`, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
      if (!apResp.ok) throw new Error(`Failed to fetch AP account: ${apResp.status} - ${await apResp.text()}`);
      const apData = await apResp.json();
      const apAccount = apData?.QueryResponse?.Account?.[0];
      if (!apAccount) throw new Error("No Accounts Payable account found in QuickBooks. Please ensure an AP account exists.");
      apAccountRef = { value: apAccount.Id, name: apAccount.Name };
      await supabase.from("qb_tokens").update({ ap_account_id: apAccount.Id, ap_account_name: apAccount.Name }).eq("id", tokenData.id);
      steps.push(`AP account (fetched + cached): ${apAccountRef.name}`);
    }

    // Build line items at COST — same strategy as qb-push-po
    const qbLines: any[] = [];
    let lineNum = 1;
    const selectedOptions = order.selected_options || [];
    const baseModel = order.base_models;

    if (baseModel) {
      qbLines.push({ Amount: baseModel.cost_price || 0, DetailType: "ItemBasedExpenseLineDetail", Description: baseModel.name || "", ItemBasedExpenseLineDetail: { ItemRef: { ...(baseModel.qb_item_id ? { value: baseModel.qb_item_id } : {}), name: baseModel.qb_item_name || FALLBACK_ITEM }, UnitPrice: baseModel.cost_price || 0, Qty: 1 } });
      steps.push(`base: ${baseModel.name} @ $${baseModel.cost_price}`);
    }

    if (Array.isArray(selectedOptions) && selectedOptions.length > 0) {
      const optionIds = selectedOptions.map((o: any) => o.option_id).filter(Boolean);
      let optionMap: Record<string, any> = {};
      if (optionIds.length > 0) {
        const { data: optRows } = await supabase.from("model_options").select("id, qb_item_name, qb_item_id, qb_item_name_by_model").in("id", optionIds);
        if (optRows) for (const row of optRows) optionMap[row.id] = row;
      }
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
        qbLines.push({ Amount: amount, DetailType: "ItemBasedExpenseLineDetail", Description: desc, ItemBasedExpenseLineDetail: { ItemRef: { ...(mapping?.qb_item_id ? { value: mapping.qb_item_id } : {}), name: itemName }, UnitPrice: costEach, Qty: qty } });
      }
      steps.push(`options: ${selectedOptions.length} line items`);
    }

    if (order.freight_estimate && order.freight_estimate > 0) {
      qbLines.push({ Amount: order.freight_estimate, DetailType: "ItemBasedExpenseLineDetail", Description: "Freight", ItemBasedExpenseLineDetail: { ItemRef: { name: "Shipping Charges" }, UnitPrice: order.freight_estimate, Qty: 1 } });
      steps.push(`freight: $${order.freight_estimate}`);
    }

    if (qbLines.length === 0) {
      qbLines.push({ Amount: order.our_cost || 0, DetailType: "ItemBasedExpenseLineDetail", Description: order.build_shorthand || "Equipment", ItemBasedExpenseLineDetail: { ItemRef: { name: FALLBACK_ITEM }, UnitPrice: order.our_cost || 0, Qty: 1 } });
      steps.push("fallback: lump sum");
    }

    const orderLabel = order.contract_name || order.moly_contract_number || order.order_number || "";
    const qbBill: any = {
      VendorRef: { value: mfg.qb_vendor_id, name: mfg.name },
      APAccountRef: apAccountRef,
      LinkedTxn: [{ TxnId: order.qb_po_id, TxnType: "PurchaseOrder" }],
      Line: qbLines,
      TxnDate: new Date().toISOString().split("T")[0],
      PrivateNote: `${orderLabel}${order.build_shorthand ? " - " + order.build_shorthand : ""}${order.moly_contract_number ? " | Contract: " + order.moly_contract_number : ""}`.substring(0, 4000),
    };
    steps.push(`Bill payload: ${qbLines.length} lines, linked to PO ${order.qb_po_id}`);

    const qbResp = await fetch(`${baseUrl}/v3/company/${realm_id}/bill?minorversion=75`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(qbBill) });
    const qbBody = await qbResp.text();
    if (!qbResp.ok) throw new Error(`QB ${qbResp.status}: ${qbBody}`);

    const qbData = JSON.parse(qbBody);
    const billId = qbData.Bill.Id;
    const billDoc = qbData.Bill.DocNumber;
    steps.push(`Bill created: #${billDoc} (ID: ${billId})`);

    await supabase.from("orders").update({ qb_bill_id: billId, qb_bill_doc_number: billDoc }).eq("id", order_id);
    await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "bill_created", title: "Bill created in QuickBooks", description: `QB Bill #${billDoc} (ID: ${billId}) linked to PO #${order.qb_po_doc_number}`, created_by: "system" });

    return new Response(JSON.stringify({ success: true, qb_bill_id: billId, qb_bill_doc_number: billDoc, line_count: qbLines.length, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message, steps }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
