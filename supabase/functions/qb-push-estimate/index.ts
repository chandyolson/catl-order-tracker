import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshQBTokens(supabase: any) {
  const { data: tokenRow } = await supabase
    .from("qb_tokens")
    .select("*")
    .limit(1)
    .single();
  if (!tokenRow) throw new Error("QuickBooks not connected");

  // Check if access token is expired
  if (new Date(tokenRow.access_token_expires_at) > new Date()) {
    return tokenRow;
  }

  // Refresh the token
  const clientId = Deno.env.get("QB_CLIENT_ID");
  const clientSecret = Deno.env.get("QB_CLIENT_SECRET");
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const tokens = await resp.json();
  const now = new Date();
  const accessExpires = new Date(now.getTime() + tokens.expires_in * 1000);
  const refreshExpires = new Date(now.getTime() + (tokens.x_refresh_token_expires_in || 8726400) * 1000);

  await supabase.from("qb_tokens").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: accessExpires.toISOString(),
    refresh_token_expires_at: refreshExpires.toISOString(),
    updated_at: now.toISOString(),
  }).eq("id", tokenRow.id);

  return { ...tokenRow, access_token: tokens.access_token, realm_id: tokenRow.realm_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { estimate_id } = await req.json();
    if (!estimate_id) {
      return new Response(JSON.stringify({ error: "estimate_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get estimate + order + customer
    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("*, orders(*, customers(*))")
      .eq("id", estimate_id)
      .single();
    if (estErr || !estimate) throw new Error("Estimate not found");

    const order = estimate.orders;
    const customer = order?.customers;

    // Get QB tokens
    const tokenData = await refreshQBTokens(supabase);
    const { access_token, realm_id } = tokenData;

    const baseUrl = Deno.env.get("QB_BASE_URL") || "https://quickbooks.api.intuit.com";

    // Build QB estimate payload
    const lineItems: any[] = [];
    const price = order.customer_price ?? estimate.total_price;

    // Add base model line
    lineItems.push({
      DetailType: "SalesItemLineDetail",
      Amount: price,
      Description: estimate.build_shorthand,
      SalesItemLineDetail: {
        UnitPrice: price,
        Qty: 1,
      },
    });

    const qbEstimate: any = {
      TotalAmt: price,
      Line: lineItems,
      TxnDate: new Date().toISOString().split("T")[0],
      PrivateNote: `${order.contract_name || order.moly_contract_number || "Order"} - ${estimate.build_shorthand}`,
    };

    // Send our estimate number as QB DocNumber so QB uses our numbering
    if (estimate.estimate_number) {
      qbEstimate.DocNumber = estimate.estimate_number;
    }

    // Link customer if QB customer ID exists
    if (customer?.qb_customer_id) {
      qbEstimate.CustomerRef = { value: customer.qb_customer_id };
    } else if (customer?.name) {
      qbEstimate.CustomerRef = { name: customer.name };
    }

    // If already pushed, update instead of create
    let method = "POST";
    let url = `${baseUrl}/v3/company/${realm_id}/estimate`;

    if (estimate.qb_estimate_id) {
      // Fetch existing to get SyncToken
      const existingResp = await fetch(
        `${baseUrl}/v3/company/${realm_id}/estimate/${estimate.qb_estimate_id}`,
        { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } }
      );
      if (existingResp.ok) {
        const existing = await existingResp.json();
        qbEstimate.Id = estimate.qb_estimate_id;
        qbEstimate.SyncToken = existing.Estimate.SyncToken;
      } else {
        const errText = await existingResp.text();
        throw new Error(`Failed to fetch existing QB estimate for update: ${existingResp.status} - ${errText}`);
      }
    }

    const qbResp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(qbEstimate),
    });

    if (!qbResp.ok) {
      const errBody = await qbResp.text();
      throw new Error(`QuickBooks API error: ${qbResp.status} - ${errBody}`);
    }

    const qbData = await qbResp.json();
    const qbEstimateId = qbData.Estimate.Id;
    const qbDocNumber = qbData.Estimate.DocNumber;

    // Update estimate with QB IDs
    await supabase.from("estimates").update({
      qb_estimate_id: qbEstimateId,
      qb_doc_number: qbDocNumber,
    }).eq("id", estimate_id);

    // Update order
    await supabase.from("orders").update({
      qb_estimate_id: qbEstimateId,
    }).eq("id", order.id);

    // Log to timeline
    await supabase.from("order_timeline").insert({
      order_id: order.id,
      event_type: "estimate_sent",
      title: "Estimate pushed to QuickBooks",
      description: `QB Estimate #${qbDocNumber} (ID: ${qbEstimateId})`,
      created_by: "system",
    });

    return new Response(
      JSON.stringify({
        success: true,
        qb_estimate_id: qbEstimateId,
        qb_doc_number: qbDocNumber,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
