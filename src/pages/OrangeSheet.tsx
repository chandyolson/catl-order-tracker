import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatSavedOptionPill } from "@/lib/optionDisplay";

const fmtCurrency = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function OrangeSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: order, isLoading } = useQuery({
    queryKey: ["orange_sheet_order", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, phone, address_line1, address_city, address_state, address_zip), manufacturers(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["orange_sheet_tasks", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("order_id", id!)
        .eq("status", "open")
        .order("priority", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading || !order) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#717182", fontSize: 14 }}>Loading...</p>
    </div>
  );

  const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];
  const regularOptions = options.filter((o: any) => !o.is_custom && !o.is_base_model);
  const customItems = options.filter((o: any) => o.is_custom);
  const customerAddress = [order.customers?.address_line1, order.customers?.address_city, order.customers?.address_state, order.customers?.address_zip].filter(Boolean).join(", ");

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Screen-only top bar */}
      <div className="print:hidden" style={{ backgroundColor: "#0E2646", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => navigate(-1)} style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(245,245,240,0.7)", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 4, color: "#F3D12A", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
          <Printer size={16} /> Print
        </button>
      </div>

      {/* Orange Sheet content */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 16px 80px" }}>

        {/* Header — orange accent */}
        <div style={{ backgroundColor: "#F59E0B", borderRadius: 12, padding: "16px 20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: "0 0 0 80px" }} />
          <p style={{ color: "rgba(0,0,0,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 4px" }}>CATL Resources — Orange Sheet</p>
          <h1 style={{ color: "#1A1A1A", fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>
            {order.contract_name || order.moly_contract_number || "Order"}
          </h1>
          <p style={{ color: "rgba(0,0,0,0.6)", fontSize: 14, margin: 0 }}>
            Contract #{order.moly_contract_number || "—"}
          </p>
        </div>

        {/* Customer & Contract info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <InfoCard label="Customer" value={order.customers?.name || "Inventory — no customer"} />
          <InfoCard label="Phone" value={order.customers?.phone || "—"} />
          <InfoCard label="Manufacturer" value={order.manufacturers?.name || "—"} />
          <InfoCard label="Status" value={(order.status || "").replace(/_/g, " ")} />
          {customerAddress && <InfoCard label="Address" value={customerAddress} span={2} />}
          {order.delivery_instructions && <InfoCard label="Delivery instructions" value={order.delivery_instructions} span={2} />}
        </div>

        {/* Equipment specs */}
        <SectionHeader title="Equipment specs" />
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid #D4D4D0", padding: "14px 16px", marginBottom: 16 }}>
          {/* Base model */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid #F0F0EC" }}>
            <div>
              <p style={{ fontSize: 10, color: "#717182", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Base model</p>
              <p style={{ fontSize: 16, color: "#0E2646", fontWeight: 600, margin: "2px 0 0" }}>{order.base_model || "—"}</p>
            </div>
            {order.build_shorthand && (
              <p style={{ fontSize: 11, color: "#717182", maxWidth: "50%", textAlign: "right" }}>{order.build_shorthand}</p>
            )}
          </div>

          {/* Options list */}
          {regularOptions.length > 0 && (
            <div style={{ paddingTop: 10 }}>
              <p style={{ fontSize: 10, color: "#717182", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                Options ({regularOptions.length})
              </p>
              {regularOptions.map((opt: any, i: number) => {
                let desc = opt.display_name || opt.name || opt.short_code || "Option";
                if (opt.pivot_type) {
                  desc += ` (${opt.side || ""}, ${opt.pivot_type === "side_to_side" ? "S↔S" : "F↔B"})`;
                } else if (opt.left_qty !== undefined || opt.right_qty !== undefined) {
                  const sides: string[] = [];
                  if (opt.left_qty > 0) sides.push(`L:${opt.left_qty}`);
                  if (opt.right_qty > 0) sides.push(`R:${opt.right_qty}`);
                  if (sides.length > 0) desc += ` (${sides.join(", ")})`;
                }
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < regularOptions.length - 1 ? "0.5px solid #F0F0EC" : "none" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid #D4D4D0", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1 }}>{desc}</span>
                    {opt.option_group && (
                      <span style={{ fontSize: 10, color: "#717182", backgroundColor: "#F5F5F0", padding: "2px 6px", borderRadius: 4 }}>{opt.option_group}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom line items / modifications */}
        {customItems.length > 0 && (
          <>
            <SectionHeader title="Custom items / modifications" />
            <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid #D4D4D0", padding: "14px 16px", marginBottom: 16 }}>
              {customItems.map((item: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < customItems.length - 1 ? "0.5px solid #F0F0EC" : "none" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid #F59E0B", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1 }}>{item.display_name || item.name || "Custom item"}</span>
                  {(item.cost_price_each || item.retail_price_each) && (
                    <span style={{ fontSize: 12, color: "#717182" }}>
                      {fmtCurrency(item.cost_price_each || item.retail_price_each || 0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Setup tasks */}
        <SectionHeader title="Setup tasks" />
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid #D4D4D0", padding: "14px 16px", marginBottom: 16 }}>
          {tasks.length === 0 && (
            <p style={{ fontSize: 13, color: "#B4B2A9", margin: 0 }}>No open tasks for this order</p>
          )}
          {tasks.map((task: any, i: number) => (
            <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: i < tasks.length - 1 ? "0.5px solid #F0F0EC" : "none" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid #D4D4D0", flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: "#1A1A1A", margin: 0, fontWeight: task.priority === "urgent" ? 600 : 400 }}>
                  {task.title}
                </p>
                {task.description && (
                  <p style={{ fontSize: 11, color: "#717182", margin: "2px 0 0" }}>{task.description}</p>
                )}
              </div>
              {task.priority === "urgent" && (
                <span style={{ fontSize: 10, color: "#E24B4A", backgroundColor: "#FCEBEB", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>Urgent</span>
              )}
              {task.priority === "high" && (
                <span style={{ fontSize: 10, color: "#854F0B", backgroundColor: "#FAEEDA", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>High</span>
              )}
              {task.assigned_to && (
                <span style={{ fontSize: 10, color: "#0C447C", backgroundColor: "#E6F1FB", padding: "2px 6px", borderRadius: 4 }}>{task.assigned_to}</span>
              )}
            </div>
          ))}

          {/* Blank lines for writing in additional tasks */}
          <div style={{ marginTop: tasks.length > 0 ? 12 : 0 }}>
            <p style={{ fontSize: 10, color: "#B4B2A9", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Additional notes</p>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 28, borderBottom: "1px solid #E8E8E4", marginBottom: 2 }} />
            ))}
          </div>
        </div>

        {/* Pricing summary */}
        <SectionHeader title="Pricing" />
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid #D4D4D0", padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <PriceBox label="Our cost" value={order.cost_price || order.subtotal_cost || 0} color="#55BAAA" />
            <PriceBox label="Customer price" value={order.customer_price || order.subtotal || 0} color="#F3D12A" />
          </div>
          {order.freight_estimate && order.freight_estimate > 0 && (
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "#717182" }}>Freight (est.)</span>
              <span style={{ color: "#1A1A1A", fontWeight: 500 }}>{fmtCurrency(order.freight_estimate)}</span>
            </div>
          )}
        </div>

        {/* Footer stamp */}
        <div style={{ textAlign: "center", padding: "16px 0", borderTop: "2px solid #F59E0B" }}>
          <p style={{ fontSize: 11, color: "#B4B2A9", margin: 0 }}>
            CATL Resources · Orange Sheet · Generated {format(new Date(), "MMM d, yyyy h:mm a")}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: "#717182", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px", paddingLeft: 4 }}>
      {title}
    </p>
  );
}

function InfoCard({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 10, border: "1px solid #D4D4D0", padding: "10px 14px", gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <p style={{ fontSize: 10, color: "#717182", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 14, color: "#0E2646", fontWeight: 500, margin: "2px 0 0" }}>{value}</p>
    </div>
  );
}

function PriceBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ backgroundColor: color + "15", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <p style={{ fontSize: 10, color: "#717182", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 600, color, margin: "4px 0 0" }}>{fmtCurrency(value)}</p>
    </div>
  );
}
