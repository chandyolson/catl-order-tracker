import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };

function fmtCurrency(n: number) { return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { estimate_id, recipient_email, recipient_name } = await req.json();
    if (!estimate_id || !recipient_email) return new Response(JSON.stringify({ error: "estimate_id and recipient_email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: estimate, error: estErr } = await supabase.from("estimates").select("*, orders(*, customers(*))").eq("id", estimate_id).single();
    if (estErr || !estimate) throw new Error("Estimate not found");

    const order = estimate.orders;
    const selectedOptions = Array.isArray(order.selected_options) ? order.selected_options : [];

    // Build option lines HTML
    const optionLines = selectedOptions.map((opt: any) => {
      let desc = opt.display_name || opt.name || opt.short_code || "Option";
      if (opt.pivot_type) desc += ` (${opt.side || ""}, ${opt.pivot_type === "side_to_side" ? "side to side" : "front to back"})`;
      else if (opt.left_qty !== undefined || opt.right_qty !== undefined) {
        const sides: string[] = [];
        if (opt.left_qty > 0) sides.push(`L:${opt.left_qty}`);
        if (opt.right_qty > 0) sides.push(`R:${opt.right_qty}`);
        if (sides.length > 0) desc += ` (${sides.join(", ")})`;
      }
      const price = opt.total_retail || opt.retail_price_each || 0;
      const priceDisplay = price === 0 ? "Included" : fmtCurrency(price);
      return `<tr><td style="padding:6px 0;color:#1A1A1A;font-size:14px">${desc}</td><td style="padding:6px 0;text-align:right;color:#717182;font-size:14px">${priceDisplay}</td></tr>`;
    }).join("");

    const orderLabel = order.contract_name || order.moly_contract_number || estimate.estimate_number || "";
    const subject = `Equipment Estimate${orderLabel ? " — " + orderLabel : ""}`;

    // Calculate base model price (subtotal minus option totals)
    const optionTotal = selectedOptions.reduce((sum: number, o: any) => sum + (o.total_retail || 0), 0);
    const baseModelPrice = (order.subtotal || 0) - optionTotal;

    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F5F5F0;font-family:Inter,system-ui,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background-color:#0E2646;border-radius:12px;padding:24px;margin-bottom:24px">
<h1 style="color:#F3D12A;font-size:18px;font-weight:800;letter-spacing:0.05em;margin:0">CATL RESOURCES</h1>
<p style="color:rgba(240,240,240,0.5);font-size:12px;margin:4px 0 0">Livestock Equipment Estimate</p>
</div>
<div style="background-color:#FFFFFF;border:1px solid #D4D4D0;border-radius:12px;padding:24px;margin-bottom:24px">
<p style="color:#717182;font-size:13px;margin:0 0 4px">Estimate for</p>
<h2 style="color:#1A1A1A;font-size:18px;font-weight:600;margin:0 0 16px">${recipient_name || "Customer"}</h2>
<div style="background-color:#F5F5F0;border-radius:8px;padding:16px;margin-bottom:20px">
<p style="color:#717182;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px">Build</p>
<p style="color:#0E2646;font-size:16px;font-weight:600;margin:0">${estimate.build_shorthand || "Custom Build"}</p>
${estimate.estimate_number ? `<p style="color:#717182;font-size:12px;margin:4px 0 0">${estimate.estimate_number}</p>` : ""}
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:4px">
<tr><td style="padding:6px 0;color:#717182;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #D4D4D0">Item</td><td style="padding:6px 0;text-align:right;color:#717182;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #D4D4D0">Price</td></tr>
${order.base_model ? `<tr><td style="padding:8px 0;color:#0E2646;font-size:14px;font-weight:600">${order.base_model}</td><td style="padding:8px 0;text-align:right;color:#0E2646;font-size:14px;font-weight:600">${fmtCurrency(baseModelPrice)}</td></tr>` : ""}
${optionLines}
</table>
<div style="border-top:2px solid #0E2646;padding-top:16px;margin-top:16px">
<table style="width:100%">
${order.subtotal ? `<tr><td style="color:#717182;font-size:14px;padding:4px 0">Subtotal</td><td style="text-align:right;color:#1A1A1A;font-size:14px;padding:4px 0">${fmtCurrency(order.subtotal)}</td></tr>` : ""}
${order.discount_amount && order.discount_amount > 0 ? `<tr><td style="color:#717182;font-size:14px;padding:4px 0">Discount</td><td style="text-align:right;color:#55BAAA;font-size:14px;padding:4px 0">−${order.discount_type === "%" ? order.discount_amount + "%" : fmtCurrency(order.discount_amount)}</td></tr>` : ""}
${order.tax_amount && order.tax_amount > 0 ? `<tr><td style="color:#717182;font-size:14px;padding:4px 0">Tax (${order.tax_state || ""})</td><td style="text-align:right;color:#1A1A1A;font-size:14px;padding:4px 0">${fmtCurrency(order.tax_amount)}</td></tr>` : ""}
<tr><td style="color:#0E2646;font-size:18px;font-weight:700;padding:8px 0">Total</td><td style="text-align:right;color:#0E2646;font-size:18px;font-weight:700;padding:8px 0">${fmtCurrency(order.total_with_tax || order.customer_price || estimate.total_price || 0)}</td></tr>
</table>
</div>
</div>
<div style="text-align:center">
<p style="color:#717182;font-size:12px;margin:0 0 8px">Questions? Reply to this email or call Tim at (605) 661-5577</p>
<p style="color:#B4B2A9;font-size:11px;margin:0">CATL Resources · Livestock Equipment</p>
</div>
</div>
</body></html>`;

    // MUST use verified domain — tim@catlresources.com (NOT estimates@catl.equipment)
    const emailResp = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Tim Olson <tim@catlresources.com>", to: [recipient_email], subject, html: htmlBody }) });
    if (!emailResp.ok) throw new Error(`Email send failed: ${await emailResp.text()}`);

    const emailData = await emailResp.json();
    const messageId = emailData.id;

    await supabase.from("estimates").update({ status: "sent", emailed_at: new Date().toISOString(), emailed_to: recipient_email }).eq("id", estimate_id);
    await supabase.from("email_log").insert({ order_id: order.id, estimate_id, recipient_email, recipient_name: recipient_name || null, subject, status: "sent", resend_message_id: messageId });
    await supabase.from("order_timeline").insert({ order_id: order.id, event_type: "estimate_sent", title: "Estimate emailed to customer", description: `Sent to ${recipient_email}`, created_by: "system" });

    return new Response(JSON.stringify({ success: true, message_id: messageId, sent_to: recipient_email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const body = await req.clone().json().catch(() => ({}));
      if (body.estimate_id) await supabase.from("email_log").insert({ estimate_id: body.estimate_id, recipient_email: body.recipient_email || "unknown", subject: "Estimate (failed)", status: "failed", error_message: err.message });
    } catch (_) {}
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
