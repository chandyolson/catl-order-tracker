import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Edit2, Check, X, Phone, Mail, MapPin, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const ordersQuery = useQuery({
    queryKey: ["customer_orders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const estimatesQuery = useQuery({
    queryKey: ["customer_estimates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*, base_models:base_model_id(name, short_name), manufacturers:manufacturer_id(name, short_name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const customer = customerQuery.data;
  const orders = ordersQuery.data || [];

  const stats = useMemo(() => {
    if (!orders.length) return { total: 0, revenue: 0, avg: 0, first: null, last: null };
    const revenue = orders.reduce((sum: number, o: any) => sum + (o.customer_price || 0), 0);
    const dates = orders.map((o: any) => o.created_at).filter(Boolean).sort();
    return {
      total: orders.length,
      revenue,
      avg: Math.round(revenue / orders.length),
      first: dates[0]?.split("T")[0] || null,
      last: dates[dates.length - 1]?.split("T")[0] || null,
    };
  }, [orders]);

  // Edit form state
  const [form, setForm] = useState<any>({});
  const [notes, setNotes] = useState("");

  const startEdit = () => {
    if (!customer) return;
    setForm({
      name: customer.name || "",
      company: customer.company || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address_line1: customer.address_line1 || "",
      address_city: customer.address_city || "",
      address_state: customer.address_state || "",
      address_zip: customer.address_zip || "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").update(form).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      setEditing(false);
      toast.success("Customer updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").update({ notes }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      setEditingNotes(false);
      toast.success("Notes saved");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer deleted");
      navigate("/customers");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  function handleDelete() {
    if (!confirm(`Delete ${customer?.name}? This cannot be undone. Any linked orders will be unaffected.`)) return;
    deleteMutation.mutate();
  }

  if (customerQuery.isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>;
  if (!customer) return <div className="flex items-center justify-center h-64 text-muted-foreground">Customer not found</div>;

  const address = [customer.address_line1, customer.address_city, customer.address_state, customer.address_zip].filter(Boolean).join(", ");

  return (
    <div className="max-w-3xl mx-auto pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "#0E2646" }}>
        <div className="p-4">
          <div className="flex items-start gap-2">
            <button onClick={() => navigate("/customers")} className="p-1 shrink-0 mt-0.5" style={{ color: "#55BAAA" }}>
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-[16px] font-bold outline-none" placeholder="Name" />
                  <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="Company" />
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="Email" />
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="Phone" />
                  <input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} className="w-full bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="Address" />
                  <div className="flex gap-2">
                    <input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} className="flex-1 bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="City" />
                    <input value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value })} className="w-20 bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="State" />
                    <input value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} className="w-24 bg-white/10 text-white/80 rounded-lg px-3 py-1.5 text-[13px] outline-none" placeholder="ZIP" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="px-4 py-1.5 rounded-full text-[13px] font-semibold" style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>Save</button>
                    <button onClick={() => setEditing(false)} className="text-[13px]" style={{ color: "rgba(240,240,240,0.5)" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-[20px] font-bold" style={{ color: "#F0F0F0" }}>{customer.name}</h1>
                  {customer.company && customer.company !== customer.name && (
                    <p className="text-[14px]" style={{ color: "rgba(240,240,240,0.6)" }}>{customer.company}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {address && (
                      <span className="flex items-center gap-1 text-[12px]" style={{ color: "rgba(240,240,240,0.45)" }}>
                        <MapPin size={12} /> {address}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium active:scale-[0.95] transition-transform" style={{ border: "1.5px solid #55BAAA", color: "#55BAAA" }}>
                        <Phone size={14} /> {customer.phone}
                      </a>
                    )}
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium active:scale-[0.95] transition-transform" style={{ border: "1.5px solid #55BAAA", color: "#55BAAA" }}>
                        <Mail size={14} /> {customer.email}
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
            {!editing && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={startEdit} className="p-2 rounded-lg" style={{ color: "rgba(240,240,240,0.5)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#F0F0F0"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(240,240,240,0.5)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <Edit2 size={16} />
                </button>
                <button onClick={handleDelete} className="p-2 rounded-lg" style={{ color: "rgba(212,24,61,0.6)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#D4183D"; e.currentTarget.style.backgroundColor = "rgba(212,24,61,0.12)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(212,24,61,0.6)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Orders", value: stats.total },
          { label: "Revenue", value: fmtCurrency(stats.revenue) },
          { label: "Avg Order", value: fmtCurrency(stats.avg) },
          { label: "First Order", value: fmtDate(stats.first) },
          { label: "Last Order", value: fmtDate(stats.last) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-[16px] font-semibold text-foreground mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-5">
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#F5F5F0" }}>
          <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Notes</h3>
          {!editingNotes && (
            <button onClick={() => { setNotes(customer.notes || ""); setEditingNotes(true); }} className="p-1" style={{ color: "#717182" }}>
              <Edit2 size={12} />
            </button>
          )}
        </div>
        <div className="p-4">
          {editingNotes ? (
            <div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none resize-none" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => saveNotesMutation.mutate()} disabled={saveNotesMutation.isPending} className="p-1" style={{ color: "#27AE60" }}><Check size={16} /></button>
                <button onClick={() => setEditingNotes(false)} className="p-1" style={{ color: "#717182" }}><X size={16} /></button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground whitespace-pre-wrap">{customer.notes || "No notes"}</p>
          )}
        </div>
      </div>

      {/* Orders */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
          <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Orders ({orders.length})</h3>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((order: any) => (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold" style={{ color: "#55BAAA" }}>{order.order_number}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-[12px] text-muted-foreground truncate mt-0.5">{order.build_shorthand}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(order.estimate_date || order.created_at?.split("T")[0])}
                  </p>
                </div>
                <span className="text-[15px] font-semibold text-foreground shrink-0">{fmtCurrency(order.customer_price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estimates */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
          <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>
            Estimates ({(estimatesQuery.data || []).length})
          </h3>
        </div>
        {(estimatesQuery.data || []).length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No estimates yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {(estimatesQuery.data || []).map((est: any) => {
              const bm = est.base_models as any;
              const mfg = est.manufacturers as any;
              const isConverted = est.converted_to_order || !!est.order_id;
              return (
                <div
                  key={est.id}
                  onClick={() => navigate(`/estimates/${est.id}`)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {est.estimate_number && (
                        <span className="text-[12px] font-bold" style={{ color: "#F3D12A" }}>{est.estimate_number}</span>
                      )}
                      <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
                        {bm?.name || est.build_shorthand || "Estimate"}
                      </span>
                      {isConverted ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,38,70,0.1)", color: "#0E2646" }}>Ordered</span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#B8930A" }}>Open</span>
                      )}
                      {est.qb_sync_status === "synced" && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,174,96,0.1)", color: "#27AE60" }}>QB ✓</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      v{est.version_number}{est.label ? ` — ${est.label}` : ""} · {mfg?.short_name || ""} · {fmtDate(est.estimate_date || est.created_at?.split("T")[0])}
                    </p>
                  </div>
                  <span className="text-[15px] font-semibold text-foreground shrink-0">{fmtCurrency(est.total_price)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
