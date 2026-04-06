import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, ArrowLeft, Share2, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtCurrency = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const TEAM = ["Tim", "Caleb", "Chandy", "Jen"];

export default function OrangeSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newItemText, setNewItemText] = useState("");
  const [newItemAssign, setNewItemAssign] = useState("Tim");
  const [showAddForm, setShowAddForm] = useState(false);
  const [sheetNotes, setSheetNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  // ── Order data ──
  const { data: order, isLoading } = useQuery({
    queryKey: ["orange_sheet_order", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, phone, address_line1, address_city, address_state, address_zip), manufacturers(name)")
        .eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  // ── Checklist items ──
  const { data: checklistItems = [] } = useQuery({
    queryKey: ["orange_sheet_items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orange_sheet_items")
        .select("*").eq("order_id", id!)
        .order("sort_order").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  // ── Standard items (for quick-add pills) ──
  const { data: standardItems = [] } = useQuery({
    queryKey: ["orange_sheet_standards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orange_sheet_standards")
        .select("*").eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  // Init notes from order
  useEffect(() => {
    if (order && !notesDirty) setSheetNotes(order.orange_sheet_notes || "");
  }, [order]);

  // ── Mutations ──
  const toggleCheck = useMutation({
    mutationFn: async ({ itemId, checked }: { itemId: string; checked: boolean }) => {
      const { error } = await supabase.from("orange_sheet_items")
        .update({ is_checked: checked, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orange_sheet_items", id] }),
  });

  const addItem = useMutation({
    mutationFn: async ({ text, assignedTo, isStandard }: { text: string; assignedTo: string; isStandard: boolean }) => {
      const maxSort = checklistItems.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
      const { error } = await supabase.from("orange_sheet_items").insert({
        order_id: id!, item_text: text, assigned_to: assignedTo,
        is_standard: isStandard, sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orange_sheet_items", id] });
      setNewItemText(""); setShowAddForm(false);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("orange_sheet_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orange_sheet_items", id] }),
  });

  const saveNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("orders")
        .update({ orange_sheet_notes: notes }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Notes saved"); setNotesDirty(false); },
  });

  if (isLoading || !order) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#717182", fontSize: 14 }}>Loading...</p>
    </div>
  );

  // ── Parse options ──
  const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];
  const regularOptions = options.filter((o: any) => !o.is_custom);
  const customItems = options.filter((o: any) => o.is_custom);
  const powerOptions = regularOptions.filter((o: any) => o.option_group === "power" || (o.short_code && ["GP", "EP", "EP-PRV", "CC", "GP-CC", "BP", "NP-OC", "NP-CC"].includes(o.short_code)));
  const carrierOptions = regularOptions.filter((o: any) => o.option_group === "carrier" || (o.short_code && ["HYT-EXT", "HY-EXT", "HY", "YC", "HYT", "CA", "SHL", "CSF"].includes(o.short_code)));
  const otherOptions = regularOptions.filter((o: any) => !powerOptions.includes(o) && !carrierOptions.includes(o));
  const customerAddress = [order.customers?.address_city, order.customers?.address_state].filter(Boolean).join(", ");

  // Which standard items are already in the checklist
  const addedStandardTexts = new Set(checklistItems.filter(i => i.is_standard).map(i => i.item_text));

  function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `Orange Sheet — ${order.contract_name || order.moly_contract_number}`, url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F5F5F0", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Screen-only top bar */}
      <div className="print:hidden" style={{ backgroundColor: "#0E2646", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => navigate(-1)} style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(245,245,240,0.7)", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={handleShare} style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(245,245,240,0.7)", fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
            <Share2 size={14} /> Share
          </button>
          <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 4, color: "#F3D12A", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 16px 80px" }}>

        {/* ── Orange header ── */}
        <div style={{ backgroundColor: "#E8760C", borderRadius: "12px 12px 0 0", padding: "16px 20px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: "0 0 0 80px" }} />
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 4px" }}>CATL Resources — Orange Sheet</p>
          <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 600, margin: "0 0 2px" }}>{order.contract_name || order.moly_contract_number || "Order"}</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, margin: 0 }}>Contract #{order.moly_contract_number || "—"}</p>
        </div>

        <div style={{ backgroundColor: "#fff", border: "1px solid #D4D4D0", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "16px" }}>

          {/* ── Customer & delivery ── */}
          <Section label="Customer & delivery">
            <Field label="Customer" value={order.customers?.name || "Inventory — no customer"} />
            {order.customers?.phone && <Field label="Phone" value={order.customers.phone} />}
            {customerAddress && <Field label="Location" value={customerAddress} />}
            {order.delivered_date && <Field label="Delivery" value={format(new Date(order.delivered_date + "T00:00:00"), "MMM d, yyyy")} />}
            {order.est_completion_date && !order.delivered_date && <Field label="ETA" value={format(new Date(order.est_completion_date + "T00:00:00"), "MMM d, yyyy")} />}
          </Section>

          {/* ── Equipment ── */}
          <Section label="Equipment">
            <Field label="Model" value={order.base_model || "—"} />
            {order.build_shorthand && <Field label="Build" value={order.build_shorthand} />}
            {otherOptions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                {otherOptions.map((o: any, i: number) => {
                  let label = o.display_name || o.name || o.short_code;
                  if (o.left_qty > 0 || o.right_qty > 0) {
                    const sides: string[] = [];
                    if (o.left_qty > 0) sides.push(o.left_qty > 1 ? `L×${o.left_qty}` : "L");
                    if (o.right_qty > 0) sides.push(o.right_qty > 1 ? `R×${o.right_qty}` : "R");
                    if (sides.length) label += ` ${sides.join(", ")}`;
                  }
                  return <Pill key={i} text={label} />;
                })}
              </div>
            )}
          </Section>

          {/* ── POWER SUPPLY — red callout ── */}
          <Callout color="power" label="⚡ Power supply">
            {powerOptions.length === 0 ? (
              <p style={{ fontSize: 13, color: "#717182", margin: 0 }}>No power unit selected</p>
            ) : powerOptions.map((o: any, i: number) => (
              <Field key={i} label="Type" value={o.display_name || o.name} />
            ))}
          </Callout>

          {/* ── CARRIER — navy callout ── */}
          <Callout color="carrier" label="🚛 Carrier">
            {carrierOptions.length === 0 ? (
              <p style={{ fontSize: 13, color: "#717182", margin: 0 }}>No carrier selected</p>
            ) : carrierOptions.map((o: any, i: number) => (
              <Field key={i} label="Type" value={o.display_name || o.name} />
            ))}
          </Callout>

          {/* ── Modifications / custom items ── */}
          {customItems.length > 0 && (
            <Section label="Modifications & custom items">
              {customItems.map((item: any, i: number) => (
                <Field key={i} label={item.display_name || item.name} value={item.retail_price_each ? fmtCurrency(item.retail_price_each) : "—"} />
              ))}
            </Section>
          )}

          {/* ── Setup checklist (interactive) ── */}
          <Section label="Setup checklist">
            {checklistItems.length === 0 && (
              <p style={{ fontSize: 13, color: "#B4B2A9", margin: "0 0 8px" }}>No checklist items yet — add from standard items below or create custom ones.</p>
            )}
            {checklistItems.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: "0.5px solid #F0F0EC" }}>
                <button
                  onClick={() => toggleCheck.mutate({ itemId: item.id, checked: !item.is_checked })}
                  style={{
                    width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: item.is_checked ? "none" : "1.5px solid #D4D4D0",
                    backgroundColor: item.is_checked ? "#55BAAA" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  }}
                >
                  {item.is_checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <span style={{ fontSize: 13, color: item.is_checked ? "#B4B2A9" : "#1A1A1A", flex: 1, textDecoration: item.is_checked ? "line-through" : "none", lineHeight: 1.3 }}>
                  {item.item_text}
                </span>
                {item.assigned_to && (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 10, background: "rgba(14,38,70,0.08)", color: "#0E2646", flexShrink: 0 }}>{item.assigned_to}</span>
                )}
                <button className="print:hidden" onClick={() => deleteItem.mutate(item.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, opacity: 0.4 }}>
                  <Trash2 size={12} color="#D4183D" />
                </button>
              </div>
            ))}

            {/* Add custom item form */}
            <div className="print:hidden" style={{ marginTop: 8 }}>
              {showAddForm ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={newItemText} onChange={e => setNewItemText(e.target.value)}
                    placeholder="Setup item..." autoFocus
                    onKeyDown={e => { if (e.key === "Enter" && newItemText.trim()) addItem.mutate({ text: newItemText.trim(), assignedTo: newItemAssign, isStandard: false }); }}
                    style={{ flex: 1, minWidth: 140, border: "1px solid #D4D4D0", borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none" }}
                  />
                  <select value={newItemAssign} onChange={e => setNewItemAssign(e.target.value)}
                    style={{ border: "1px solid #D4D4D0", borderRadius: 8, padding: "6px 8px", fontSize: 12, outline: "none" }}>
                    {TEAM.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => { if (newItemText.trim()) addItem.mutate({ text: newItemText.trim(), assignedTo: newItemAssign, isStandard: false }); }}
                    disabled={!newItemText.trim()}
                    style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 20, border: "none", background: "#55BAAA", color: "#0E2646", cursor: "pointer", opacity: newItemText.trim() ? 1 : 0.4 }}>
                    Add
                  </button>
                  <button onClick={() => setShowAddForm(false)} style={{ fontSize: 18, background: "none", border: "none", color: "#717182", cursor: "pointer", padding: "0 4px" }}>×</button>
                </div>
              ) : (
                <button onClick={() => setShowAddForm(true)}
                  style={{ fontSize: 12, fontWeight: 500, color: "#E8760C", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}>
                  <Plus size={14} /> Add custom item
                </button>
              )}
            </div>

            {/* Standard items quick-add pills */}
            <div className="print:hidden" style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px dashed #D4D4D0" }}>
              <p style={{ fontSize: 10, fontWeight: 500, color: "#717182", margin: "0 0 6px" }}>Quick-add standard items</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {standardItems.map((std) => {
                  const alreadyAdded = addedStandardTexts.has(std.item_text);
                  return (
                    <button key={std.id}
                      onClick={() => { if (!alreadyAdded) addItem.mutate({ text: std.item_text, assignedTo: std.default_assigned_to || "Tim", isStandard: true }); }}
                      disabled={alreadyAdded}
                      style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 16,
                        border: alreadyAdded ? "0.5px solid #D4D4D0" : "0.5px solid #D4D4D0",
                        background: alreadyAdded ? "rgba(85,186,170,0.06)" : "#F5F5F0",
                        color: alreadyAdded ? "#B4B2A9" : "#717182",
                        cursor: alreadyAdded ? "default" : "pointer",
                        textDecoration: alreadyAdded ? "line-through" : "none",
                        opacity: alreadyAdded ? 0.5 : 1,
                      }}
                    >
                      {std.item_text}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* ── Special instructions ── */}
          <Section label="Special instructions">
            <textarea
              value={sheetNotes}
              onChange={e => { setSheetNotes(e.target.value); setNotesDirty(true); }}
              onBlur={() => { if (notesDirty) saveNotes.mutate(sheetNotes); }}
              placeholder="Any special instructions for setup or delivery..."
              rows={3}
              className="print:border-none"
              style={{
                width: "100%", border: "0.5px solid #D4D4D0", borderRadius: 8, padding: "10px 12px",
                fontSize: 13, color: "#1A1A1A", background: "#FAFAF7", resize: "none", fontFamily: "inherit", outline: "none",
              }}
            />
            {notesDirty && (
              <button className="print:hidden" onClick={() => saveNotes.mutate(sheetNotes)}
                style={{ fontSize: 11, fontWeight: 500, color: "#55BAAA", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>
                Save notes
              </button>
            )}
          </Section>

          {/* ── Pricing summary ── */}
          <Section label="Pricing">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <PriceBox label="Our cost" value={order.our_cost || 0} color="#55BAAA" />
              <PriceBox label="Customer price" value={order.customer_price || order.subtotal || 0} color="#F3D12A" />
            </div>
            {order.freight_estimate && order.freight_estimate > 0 && (
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#717182" }}>Freight (est.)</span>
                <span style={{ color: "#1A1A1A", fontWeight: 500 }}>{fmtCurrency(order.freight_estimate)}</span>
              </div>
            )}
          </Section>

          {/* Footer */}
          <div style={{ textAlign: "center", padding: "14px 0 0", borderTop: "2px solid #E8760C" }}>
            <p style={{ fontSize: 11, color: "#B4B2A9", margin: 0 }}>
              CATL Resources · Orange Sheet · Generated {format(new Date(), "MMM d, yyyy h:mm a")}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:border-none { border: none !important; background: transparent !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#E8760C", margin: "0 0 6px" }}>{label}</p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: "#717182" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#1A1A1A", textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: "rgba(232,118,12,0.08)", color: "#8B4A07", border: "0.5px solid rgba(232,118,12,0.2)" }}>
      {text}
    </span>
  );
}

function Callout({ color, label, children }: { color: "power" | "carrier"; label: string; children: React.ReactNode }) {
  const styles = color === "power"
    ? { bg: "rgba(226,75,74,0.05)", border: "1.5px solid rgba(226,75,74,0.2)", labelColor: "#A32D2D" }
    : { bg: "rgba(14,38,70,0.03)", border: "1.5px solid rgba(14,38,70,0.12)", labelColor: "#0E2646" };
  return (
    <div style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 14, background: styles.bg, border: styles.border }}>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: styles.labelColor, margin: "0 0 6px" }}>{label}</p>
      {children}
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
