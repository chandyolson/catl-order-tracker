import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };

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
    if (!order_id) return new Response(JSON.stringify({ success: false, error: "order_id required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order, error: ordErr } = await supabase.from("orders").select("*, customers(*), base_models:base_model_id(*)").eq("id", order_id).single();
    if (ordErr || !order) throw new Error(`Order not found: ${ordErr?.message}`);
    steps.push(`order: ${order.contract_name || order.moly_contract_number || order.order_number || order.id}`);

    if (!order.qb_estimate_id) throw new Error("Estimate has not been pushed to QuickBooks yet. Push the estimate first.");
    if (order.qb_invoice_id) return new Response(JSON.stringify({ success: true, already_exists: true, qb_invoice_id: order.qb_invoice_id, qb_invoice_doc_number: order.qb_invoice_doc_number, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const customer = order.customers;
    if (!customer?.qb_customer_id) throw new Error(`Customer "${customer?.name || "unknown"}" has no QuickBooks customer ID. Sync customers in Settings before creating invoices.`);
    steps.push(`customer: ${customer.name}`);

    // Fetch current or approved estimate
    const { data: estimates } = await supabase.from("estimates").select("*").eq("order_id", order_id).or("is_current.eq.true,is_approved.eq.true").order("version_number", { ascending: false }).limit(1);
    const estimate = estimates?.[0] || null;
    steps.push(estimate ? `estimate: v${estimate.version_number} (${estimate.estimate_number || estimate.qb_doc_number || estimate.id})` : "no current estimate found — using order fields");

    const tokenData = await getQBToken(supabase);
    const { access_token, realm_id } = tokenData;
    const baseUrl = Deno.env.get("QB_BASE_URL") || "https://quickbooks.api.intuit.com";

    // Build line items at RETAIL prices (mirrors qb-push-estimate)
    const qbLines: any[] = [];
    let lineNum = 1;
    const selectedOptions = order.selected_options || [];
    const baseModel = order.base_models;

    if (baseModel) {
      qbLines.push({ Id: String(lineNum++), DetailType: "SalesItemLineDetail", Amount: baseModel.retail_price || 0, Description: baseModel.name || "Base Model", SalesItemLineDetail: { UnitPrice: baseModel.retail_price || 0, Qty: 1, ItemRef: { ...(baseModel.qb_item_id ? { value: baseModel.qb_item_id } : {}), name: baseModel.qb_item_name || "Services" } } });
      steps.push(`base: ${baseModel.name} @ $${baseModel.retail_price}`);
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
        qbLines.push({ Id: String(lineNum++), DetailType: "SalesItemLineDetail", Amount: amount, Description: desc, SalesItemLineDetail: { UnitPrice: retailEach, Qty: qty, ItemRef: { ...(mapping?.qb_item_id ? { value: mapping.qb_item_id } : {}), name: itemName || "Services" } } });
      }
      steps.push(`options: ${selectedOptions.length} line items`);
    }

    // Discount
    if (order.discount_amount && order.discount_amount > 0) {
      const dv = order.discount_type === "%" ? Math.round((order.subtotal || 0) * order.discount_amount) / 100 : order.discount_amount;
      if (dv > 0) {
        let discountAccountRef: { value: string; name: string };
        if (tokenData.discount_account_id) {
          discountAccountRef = { value: tokenData.discount_account_id, name: tokenData.discount_account_name || "Discounts given" };
        } else {
          const dAcctResp = await fetch(`${baseUrl}/v3/company/${realm_id}/query?query=SELECT%20*%20FROM%20Account%20WHERE%20AccountType%20%3D%20'Income'%20AND%20AccountSubType%20%3D%20'DiscountsRefundsGiven'%20MAXRESULTS%201&minorversion=73`, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
          if (!dAcctResp.ok) throw new Error(`Failed to fetch discount account: ${dAcctResp.status} - ${await dAcctResp.text()}`);
          const dAcctData = await dAcctResp.json();
          const dAcct = dAcctData?.QueryResponse?.Account?.[0];
          if (!dAcct) throw new Error("No discount account found in QuickBooks. Please create a 'Discounts given' income account.");
          discountAccountRef = { value: dAcct.Id, name: dAcct.Name };
          await supabase.from("qb_tokens").update({ discount_account_id: dAcct.Id, discount_account_name: dAcct.Name }).eq("id", tokenData.id);
        }
        qbLines.push({ Id: String(lineNum++), DetailType: "DiscountLineDetail", Amount: dv, DiscountLineDetail: { DiscountAccountRef: discountAccountRef, PercentBased: order.discount_type === "%", ...(order.discount_type === "%" ? { DiscountPercent: order.discount_amount } : {}) } });
        steps.push(`discount: $${dv}`);
      }
    }

    // Fallback
    if (qbLines.length === 0) {
      const price = order.customer_price ?? estimate?.total_price ?? 0;
      qbLines.push({ Id: "1", DetailType: "SalesItemLineDetail", Amount: price, Description: order.build_shorthand || "Equipment", SalesItemLineDetail: { UnitPrice: price, Qty: 1, ItemRef: { name: "Services" } } });
      steps.push("fallback: lump sum");
    }

    const orderLabel = order.contract_name || order.moly_contract_number || order.order_number || "";
    const qbInvoice: any = {
      CustomerRef: { value: customer.qb_customer_id, name: customer.name },
      LinkedTxn: [{ TxnId: order.qb_estimate_id, TxnType: "Estimate" }],
      Line: qbLines,
      TxnDate: new Date().toISOString().split("T")[0],
      PrivateNote: `${orderLabel}${order.build_shorthand ? " - " + order.build_shorthand : ""}${order.tax_state && order.tax_amount > 0 ? ` | Tax: ${order.tax_state} $${order.tax_amount}` : ""}`.substring(0, 4000),
    };

    steps.push(`creating Invoice: ${qbLines.length} lines linked to Estimate ${order.qb_estimate_id}`);
    const invResp = await fetch(`${baseUrl}/v3/company/${realm_id}/invoice?minorversion=73`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(qbInvoice) });
    const invBody = await invResp.text();
    if (!invResp.ok) throw new Error(`QB ${invResp.status}: ${invBody}`);

    const invData = JSON.parse(invBody);
    const invoiceId = invData.Invoice.Id;
    const invoiceDoc = invData.Invoice.DocNumber;
    steps.push(`Invoice created: #${invoiceDoc}`);

    await supabase.from("orders").update({ qb_invoice_id: invoiceId, qb_invoice_doc_number: invoiceDoc }).eq("id", order_id);
    await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "invoice_created", title: "Customer invoice created in QuickBooks", description: `QB Invoice #${invoiceDoc} linked to Estimate #${order.qb_estimate_doc_number || order.qb_estimate_id}`, created_by: "system" });

    return new Response(JSON.stringify({ success: true, qb_invoice_id: invoiceId, qb_invoice_doc_number: invoiceDoc, line_count: qbLines.length, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message, steps }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
