import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d + "T00:00:00"), "MMM d"); } catch { return d; }
}

interface ChangeOrdersTabProps {
  orderId: string;
  changes: any[];
  order: any;
  queryClient: any;
}

export default function ChangeOrdersTab({ orderId, changes, order, queryClient }: ChangeOrdersTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [via, setVia] = useState("Phone");
  const [description, setDescription] = useState("");
  const [priceImpact, setPriceImpact] = useState("");

  const maxNum = changes.length > 0 ? Math.max(...changes.map((c) => c.change_number)) : 0;
  const currentPrice = order.customer_price || 0;
  const impactNum = parseFloat(priceImpact) || 0;
  const newTotal = currentPrice + impactNum;

  const createChangeMutation = useMutation({
    mutationFn: async () => {
      const nextNum = maxNum + 1;
      const { error } = await supabase.from("change_orders").insert({
        order_id: orderId,
        change_number: nextNum,
        requested_by: requestedBy || "internal",
        requested_via: via,
        description,
        price_impact: impactNum,
        new_total: newTotal,
      });
      if (error) throw error;
      await supabase.from("orders").update({ customer_price: newTotal }).eq("id", orderId);
      await supabase.from("order_timeline").insert({
        order_id: orderId,
        event_type: "change_order",
        title: `Change order #${nextNum}`,
        description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["change_orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", orderId] });
      setShowForm(false);
      setRequestedBy("");
      setDescription("");
      setPriceImpact("");
      toast.success("Change order logged");
    },
  });

  return (
    <div>
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 mb-4 active:scale-[0.97] transition-transform"
          style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
        >
          <Plus size={14} /> Log change order
        </button>
      ) : (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 space-y-2">
          <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by" className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none" />
          <select value={via} onChange={(e) => setVia(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none">
            <option>Phone</option><option>Email</option><option>In Person</option><option>Other</option>
          </select>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What changed?" rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-card text-sm outline-none resize-none" />
          <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden">
            <span className="pl-3 text-muted-foreground text-sm">$</span>
            <input value={priceImpact} onChange={(e) => setPriceImpact(e.target.value.replace(/[^0-9.\-]/g, ""))} placeholder="+0 or -0" className="flex-1 px-2 py-2 bg-transparent text-sm outline-none" />
          </div>
          <div className="text-xs text-muted-foreground">New total: {fmtCurrency(newTotal)}</div>
          <div className="flex gap-2">
            <button onClick={() => createChangeMutation.mutate()} disabled={createChangeMutation.isPending || !description} className="px-4 py-2 rounded-full text-sm font-bold active:scale-[0.97] disabled:opacity-50" style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}>Save</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-muted-foreground px-3">Cancel</button>
          </div>
        </div>
      )}

      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change orders yet.</p>
      ) : (
        <div className="space-y-3">
          {changes.map((co) => (
            <ChangeOrderCard key={co.id} co={co} orderId={orderId} queryClient={queryClient} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeOrderCard({ co, orderId, queryClient }: { co: any; orderId: string; queryClient: any }) {
  const allApplied = co.all_applied;

  const toggleField = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: boolean }) => {
      const { error } = await supabase.from("change_orders").update({ [field]: value }).eq("id", co.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["change_orders", orderId] });
    },
  });

  const cascadeItems = [
    { field: "applied_internal", label: "Internal configurator" },
    { field: "applied_customer_estimate", label: "Customer estimate" },
    { field: "applied_qb_estimate", label: "QuickBooks estimate" },
    { field: "applied_mfg_order", label: "Manufacturer order" },
    { field: "applied_qb_po", label: "QuickBooks PO" },
  ];

  if (allApplied) {
    return (
      <div className="border rounded-xl p-3.5 bg-card" style={{ borderColor: "#27AE60" }}>
        <div className="flex items-center gap-2">
          <CheckCircle size={16} color="#27AE60" />
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#27AE60", backgroundColor: "rgba(39,174,96,0.1)" }}>All Applied</span>
          <span className="text-[13px] font-semibold text-foreground flex-1">CO #{co.change_number}</span>
          <span className="text-xs text-muted-foreground">{fmtDate(co.created_at?.split("T")[0])}</span>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1">{co.description}</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-3.5 bg-card" style={{ borderColor: "#E8863A" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#D4183D", backgroundColor: "rgba(212,24,61,0.1)" }}>Not fully applied</span>
      </div>
      <div className="text-[13px] font-semibold text-foreground">CO #{co.change_number} — {fmtDate(co.created_at?.split("T")[0])}</div>
      <div className="text-xs text-muted-foreground mb-1">By: {co.requested_by}{co.requested_via ? ` (${co.requested_via})` : ""}</div>
      <div className="flex gap-1.5 flex-wrap mt-1 mb-1">
        {co.source && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{
              background: co.source === "customer" ? "#E1F5EE" : co.source === "moly" ? "#FAEEDA" : "hsl(var(--muted))",
              color: co.source === "customer" ? "#085041" : co.source === "moly" ? "#633806" : "hsl(var(--muted-foreground))",
            }}>
            {co.source === "customer" ? "Customer" : co.source === "moly" ? "MOLY" : "Internal"}
          </span>
        )}
        {co.requires_approval && !co.approved && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#FAEEDA", color: "#633806" }}>
            Awaiting approval
          </span>
        )}
        {co.approved && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#E1F5EE", color: "#085041" }}>
            Approved
          </span>
        )}
      </div>
      <p className="text-[13px] text-foreground mb-1">{co.description}</p>
      {Array.isArray(co.changes_summary) && co.changes_summary.length > 0 && (
        <div className="mt-2 space-y-0.5 text-[12px]">
          {co.changes_summary.map((change: any, i: number) => (
            <div key={i} style={{ color: change.type === "added" ? "#27AE60" : change.type === "removed" ? "#D4183D" : "#B8860B" }}>
              {change.type === "added" ? "+" : change.type === "removed" ? "−" : "~"}{" "}
              {change.option || change.field}{change.detail ? ` (${change.detail})` : ""}
              {change.from && change.to ? `: ${change.from} → ${change.to}` : ""}
              {change.price ? ` — $${Math.abs(change.price).toLocaleString()}` : ""}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-4 text-sm mb-3">
        <span className="font-medium" style={{ color: (co.price_impact || 0) >= 0 ? "#27AE60" : "#D4183D" }}>
          {(co.price_impact || 0) >= 0 ? "+" : "−"}${Math.abs(co.price_impact || 0).toLocaleString()}
        </span>
        <span className="font-medium text-foreground">Total: {fmtCurrency(co.new_total)}</span>
      </div>
      <div className="space-y-1.5">
        {cascadeItems.map((item) => (
          <label key={item.field} className="flex items-center gap-2.5 cursor-pointer py-1">
            <Checkbox
              checked={!!co[item.field]}
              onCheckedChange={(checked) => toggleField.mutate({ field: item.field, value: !!checked })}
              className="h-5 w-5"
            />
            <span className="text-sm text-foreground">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
