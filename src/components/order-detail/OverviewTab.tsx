import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSavedOptionPill } from "@/lib/optionDisplay";
import { toast } from "sonner";
import { Edit2, Check, X, Phone, Mail, ArrowRightCircle, ExternalLink, FileText, Users, Search, Trash2, RefreshCw } from "lucide-react";
import { format } from "date-fns";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

interface OverviewTabProps {
  order: any;
  customer: any;
  manufacturer: any;
  baseModel: { name: string; short_name: string } | null | undefined;
  paperwork: any[];
  margin?: { amount: number; percent: number } | null;
  marginColor?: string;
}

export default function OverviewTab({ order, customer, manufacturer, baseModel, paperwork, margin, marginColor = "#717182" }: OverviewTabProps) {
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(order.notes || "");
  const [creatingPO, setCreatingPO] = useState(false);
  const [portalOrdered, setPortalOrdered] = useState(false);
  const [contractName, setContractName] = useState(order.contract_name || "");
  const [editingContractName, setEditingContractName] = useState(false);
  const [molyContractNum, setMolyContractNum] = useState(order.moly_contract_number || "");
  const [editingMolyNum, setEditingMolyNum] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [debouncedCustSearch, setDebouncedCustSearch] = useState("");
  const [editingDriveUrl, setEditingDriveUrl] = useState(false);
  const [driveUrl, setDriveUrl] = useState(order.google_drive_folder_url || "");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustSearch(custSearch), 300);
    return () => clearTimeout(t);
  }, [custSearch]);

  const custSearchQuery = useQuery({
    queryKey: ["customer-search-overview", debouncedCustSearch],
    queryFn: async () => {
      if (!debouncedCustSearch || debouncedCustSearch.length < 2) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name, company, address_city, address_state")
        .or(`name.ilike.%${debouncedCustSearch}%,company.ilike.%${debouncedCustSearch}%`)
        .limit(6);
      return data || [];
    },
    enabled: debouncedCustSearch.length >= 2,
  });

  const assignCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const { error } = await supabase.from("orders").update({ customer_id: customerId }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      setShowCustomerSearch(false);
      setCustSearch("");
      toast.success("Customer assigned");
    },
  });

  const isPortalDone = portalOrdered || paperwork.some(
    (p) => p.document_type === "vendor_po_submitted" && p.status === "complete"
  );
  const isQBPODone = !!order.qb_po_id;

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({ notes }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      setEditingNotes(false);
      toast.success("Notes saved");
    },
  });

  const saveContractNameMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({ contract_name: contractName || null } as any).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      setEditingContractName(false);
      toast.success("Contract name saved");
    },
  });

  const saveMolyNumMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({ moly_contract_number: molyContractNum || null }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      setEditingMolyNum(false);
      toast.success("MOLY contract # saved");
    },
  });

  // Document chain: 6 slots with Drive links
  const slotsQuery = useQuery({
    queryKey: ["order_document_slots", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_document_slots")
        .select("*, order_documents:document_id(id, file_url, file_name, title)")
        .eq("order_id", order.id)
        .order("slot_type");
      if (error) throw error;
      return data || [];
    },
  });

  // Save Google Drive folder URL
  const saveDriveUrlMutation = useMutation({
    mutationFn: async () => {
      // Extract folder ID from URL if it's a full URL
      let folderId = driveUrl;
      const folderMatch = driveUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) folderId = folderMatch[1];

      const { error } = await supabase.from("orders").update({
        google_drive_folder_url: driveUrl || null,
        google_drive_folder_id: folderId || null,
      }).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      setEditingDriveUrl(false);
      toast.success("Drive folder linked");
    },
    onError: (err: any) => toast.error(err.message || "Failed to save Drive URL"),
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      // Update order status
      const { error: orderErr } = await supabase.from("orders").update({
        status: "purchase_order",
        ordered_date: today,
        approved_date: today,
      }).eq("id", order.id);
      if (orderErr) throw orderErr;

      // Approve current estimate
      const { error: estErr } = await supabase.from("estimates").update({
        is_approved: true,
        approved_date: today,
      }).eq("order_id", order.id).eq("is_current", true);
      if (estErr) throw estErr;

      // Timeline entry
      const { error: tlErr } = await supabase.from("order_timeline").insert({
        order_id: order.id,
        event_type: "status_change",
        title: "Estimate approved and converted to order",
        description: `Status changed from estimate to ordered. Ordered date set to ${today}.`,
      });
      if (tlErr) throw tlErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
      queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] });
      toast.success("Estimate converted to order");
      if (manufacturer?.ordering_portal_url) {
        window.open(manufacturer.ordering_portal_url, "_blank");
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to convert");
    },
  });

  async function handlePlaceOrderOnPortal() {
    if (manufacturer?.ordering_portal_url) {
      window.open(manufacturer.ordering_portal_url, "_blank");
    }
    try {
      await supabase.from("paperwork").update({
        status: "complete",
        completed_date: new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      }).eq("order_id", order.id).eq("document_type", "vendor_po_submitted");

      await supabase.from("order_timeline").insert({
        order_id: order.id,
        event_type: "note",
        title: "Order placed on manufacturer portal",
        description: `Submitted on ${manufacturer?.short_name || manufacturer?.name || "manufacturer"} ordering portal`,
        created_by: "system",
      });

      setPortalOrdered(true);
      queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] });
      queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
      toast.success("Portal opened — marked as ordered");
    } catch (err) {
      toast.error("Portal opened but failed to update paperwork");
    }
  }

  async function handleCreateQBPO() {
    setCreatingPO(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("qb-push-po", {
        body: { order_id: order.id },
      });
      if (fnError) throw new Error(fnError.message);
      if (!data) throw new Error("No response from QB PO function");
      if (data.success) {
        if (data.already_exists) {
          toast.info(`QB PO already exists: #${data.qb_po_doc_number}`);
        } else {
          let msg = `QB Purchase Order #${data.qb_po_doc_number} created`;
          if (data.unmapped_items?.length > 0) {
            msg += ` (${data.unmapped_items.length} items need review in QB)`;
          }
          toast.success(msg);
        }
        queryClient.invalidateQueries({ queryKey: ["order", order.id] });
        queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
        queryClient.invalidateQueries({ queryKey: ["paperwork", order.id] });
      } else {
        toast.error(data.error || "Failed to create QB PO");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create QB PO");
    } finally {
      setCreatingPO(false);
    }
  }

  const isEstimate = order.source_type === "estimate" && order.status === "estimate";

  const customerDocs = paperwork.filter((d) => d.side === "customer");
  const vendorDocs = paperwork.filter((d) => d.side === "vendor");
  const customerComplete = customerDocs.filter((d) => d.status === "complete").length;
  const vendorComplete = vendorDocs.filter((d) => d.status === "complete").length;

  const options = Array.isArray(order.selected_options) ? (order.selected_options as any[]) : [];


  return (
    <div className="space-y-5">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ─── LEFT: Order Details ─────────────────────── */}
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
              <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Order Details</h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Source type badge */}
              <div>
                <span
                  className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={
                    order.source_type === "estimate"
                      ? { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                      : { backgroundColor: "rgba(243,209,42,0.2)", color: "#8B7A0A" }
                  }
                >
                  {order.source_type === "estimate" ? "Estimate" : "Direct Order"}
                </span>
              </div>

              {/* Convert to Order button */}
              {isEstimate && (
                <button
                  onClick={() => convertToOrderMutation.mutate()}
                  disabled={convertToOrderMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold active:scale-[0.97] transition-transform disabled:opacity-50"
                  style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
                >
                  <ArrowRightCircle size={16} />
                  {convertToOrderMutation.isPending ? "Converting…" : "Convert to Order"}
                </button>
              )}

              {/* Next Steps Banner */}
              {(order.status === "purchase_order" || order.status === "order_pending") && (
                <div
                  className="rounded-xl p-4 mb-2"
                  style={{
                    background:
                      order.status === "order_pending"
                        ? "rgba(85,186,170,0.06)"
                        : "linear-gradient(135deg, rgba(243,209,42,0.06), rgba(14,38,70,0.04))",
                    border:
                      order.status === "order_pending"
                        ? "1px solid rgba(85,186,170,0.2)"
                        : "1px solid rgba(243,209,42,0.25)",
                  }}
                >
                  <p
                    className="text-[14px] font-medium mb-1"
                    style={{ color: order.status === "order_pending" ? "#0F6E56" : "#0E2646" }}
                  >
                    {order.status === "order_pending" ? "Waiting on manufacturer" : "Next steps"}
                  </p>
                  <p className="text-[12px] text-muted-foreground mb-3">
                    {order.status === "order_pending"
                      ? `Order submitted to ${manufacturer?.short_name || "manufacturer"}. Waiting for their SO confirmation number.`
                      : isPortalDone && !isQBPODone
                      ? "Order placed on portal. Now create the Purchase Order in QuickBooks."
                      : "Place this order on the manufacturer portal, then create the Purchase Order in QuickBooks."}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {/* Portal button */}
                    {manufacturer?.ordering_portal_url && (
                      <button
                        onClick={isPortalDone ? undefined : handlePlaceOrderOnPortal}
                        disabled={isPortalDone}
                        className="flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform disabled:cursor-default"
                        style={{
                          backgroundColor: isPortalDone ? "#27AE60" : "#F3D12A",
                          color: isPortalDone ? "#FFFFFF" : "#0E2646",
                        }}
                      >
                        {isPortalDone ? (
                          <>
                            <Check size={14} />
                            Ordered on {manufacturer.short_name || manufacturer.name} portal
                          </>
                        ) : (
                          <>
                            <ExternalLink size={14} />
                            Place order from manufacturer
                          </>
                        )}
                      </button>
                    )}

                    {/* QB PO button */}
                    <button
                      onClick={isQBPODone ? undefined : handleCreateQBPO}
                      disabled={creatingPO || isQBPODone}
                      className="flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-4 py-2 active:scale-[0.97] transition-transform disabled:cursor-default disabled:opacity-100"
                      style={{
                        backgroundColor: isQBPODone ? "#27AE60" : "#F3D12A",
                        color: isQBPODone ? "#FFFFFF" : "#0E2646",
                      }}
                    >
                      {isQBPODone ? (
                        <>
                          <Check size={14} />
                          QB PO #{order.qb_po_doc_number}
                        </>
                      ) : (
                        <>
                          <FileText size={14} />
                          {creatingPO ? "Creating..." : "Create QB Purchase Order"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {baseModel && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Base Model</span>
                  <p className="text-[14px] font-medium text-foreground">{baseModel.name}</p>
                </div>
              )}

              {/* Order # + Contract Name + MOLY Contract # */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Order #</span>
                  <p className="text-[13px] font-medium text-foreground mt-0.5">{order.order_number}</p>
                </div>
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Contract Name</span>
                  {editingContractName ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        value={contractName}
                        onChange={(e) => setContractName(e.target.value)}
                        placeholder="e.g. Smith Ranch Chute"
                        className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-[13px] outline-none min-w-0 text-[16px]"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveContractNameMutation.mutate(); if (e.key === "Escape") { setContractName(order.contract_name || ""); setEditingContractName(false); } }}
                      />
                      <button onClick={() => saveContractNameMutation.mutate()} className="shrink-0 p-1 rounded hover:bg-muted/50">
                        <Check size={14} style={{ color: "#27AE60" }} />
                      </button>
                      <button onClick={() => { setContractName(order.contract_name || ""); setEditingContractName(false); }} className="shrink-0 p-1 rounded hover:bg-muted/50">
                        <X size={14} style={{ color: "#717182" }} />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="text-[13px] font-medium cursor-pointer hover:text-[#55BAAA] transition-colors mt-0.5"
                      style={{ color: order.contract_name ? undefined : "#B4B2A9" }}
                      onClick={() => setEditingContractName(true)}
                    >
                      {order.contract_name || "Click to name"}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>MOLY Contract #</span>
                  {editingMolyNum ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        value={molyContractNum}
                        onChange={(e) => setMolyContractNum(e.target.value)}
                        placeholder="e.g. 45821"
                        className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-[13px] outline-none min-w-0 text-[16px]"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveMolyNumMutation.mutate(); if (e.key === "Escape") { setMolyContractNum(order.moly_contract_number || ""); setEditingMolyNum(false); } }}
                      />
                      <button onClick={() => saveMolyNumMutation.mutate()} className="shrink-0 p-1 rounded hover:bg-muted/50">
                        <Check size={14} style={{ color: "#27AE60" }} />
                      </button>
                      <button onClick={() => { setMolyContractNum(order.moly_contract_number || ""); setEditingMolyNum(false); }} className="shrink-0 p-1 rounded hover:bg-muted/50">
                        <X size={14} style={{ color: "#717182" }} />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="text-[13px] font-medium cursor-pointer hover:text-[#55BAAA] transition-colors mt-0.5"
                      style={{ color: order.moly_contract_number ? undefined : "#B4B2A9" }}
                      onClick={() => setEditingMolyNum(true)}
                    >
                      {order.moly_contract_number || "Pending"}
                    </p>
                  )}
                </div>
              </div>

              {/* Selected options as pills */}
              {options.length > 0 && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Options</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {options.map((opt: any, i: number) => {
                      const label = formatSavedOptionPill(opt);
                      if (!label) return null;
                      const isAddon = !opt.is_included;
                      return (
                        <span
                          key={i}
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={
                            isAddon
                              ? { backgroundColor: "rgba(243,209,42,0.15)", color: "#8B7A0A" }
                              : { backgroundColor: "rgba(85,186,170,0.15)", color: "#55BAAA" }
                          }
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reference numbers */}
              <div className="grid grid-cols-2 gap-3">
                {order.catl_number && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>CATL #</span>
                    <p className="text-[13px] font-medium text-foreground">{order.catl_number}</p>
                  </div>
                )}
                {order.serial_number && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Serial #</span>
                    <p className="text-[13px] font-medium text-foreground">{order.serial_number}</p>
                  </div>
                )}
                {order.mfg_so_number && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Mfg SO #</span>
                    <p className="text-[13px] font-medium text-foreground">{order.mfg_so_number}</p>
                  </div>
                )}
                {order.mfg_po_number && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>PO #</span>
                    <p className="text-[13px] font-medium text-foreground">{order.mfg_po_number}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Notes</span>
                  {!editingNotes && (
                    <button onClick={() => { setNotes(order.notes || ""); setEditingNotes(true); }} className="p-1" style={{ color: "#717182" }}>
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="mt-1">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-card outline-none resize-none"
                    />
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => saveNotesMutation.mutate()} disabled={saveNotesMutation.isPending} className="p-1" style={{ color: "#27AE60" }}>
                        <Check size={16} />
                      </button>
                      <button onClick={() => setEditingNotes(false)} className="p-1" style={{ color: "#717182" }}>
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground mt-0.5 whitespace-pre-wrap">
                    {order.notes || "No notes"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── CUSTOMER (inside left column) ────────────── */}
          {!customer && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5" style={{ backgroundColor: "#F5F5F0" }}>
                <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Customer</h3>
              </div>
              <div className="p-4">
                {!showCustomerSearch ? (
                  <button
                    onClick={() => setShowCustomerSearch(true)}
                    className="flex items-center gap-2 text-[13px] font-medium active:scale-[0.97] transition-transform"
                    style={{ color: "#55BAAA" }}
                  >
                    <Users size={14} /> Assign a customer
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={custSearch}
                        onChange={(e) => setCustSearch(e.target.value)}
                        placeholder="Search customers..."
                        className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-[14px] outline-none text-[16px]"
                        autoFocus
                      />
                    </div>
                    {custSearchQuery.data && custSearchQuery.data.length > 0 && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        {custSearchQuery.data.map((c: any) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                            onClick={() => assignCustomerMutation.mutate(c.id)}
                          >
                            <div>
                              <p className="text-[13px] font-medium text-foreground">{c.name}</p>
                              {(c.address_city || c.company) && (
                                <p className="text-[11px] text-muted-foreground">
                                  {[c.company, c.address_city, c.address_state].filter(Boolean).join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {custSearch.length >= 2 && custSearchQuery.data?.length === 0 && (
                      <p className="text-[12px] text-muted-foreground">No customers found</p>
                    )}
                    <button
                      onClick={() => { setShowCustomerSearch(false); setCustSearch(""); }}
                      className="text-[12px] text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── QUICK ACTIONS ───────────────────────────── */}
          {customer && (
            <div className="flex gap-2 flex-wrap">
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
                  style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
                >
                  <Phone size={14} /> Call Customer
                </a>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
                  style={{ border: "1px solid #55BAAA", color: "#55BAAA" }}
                >
                  <Mail size={14} /> Email Customer
                </a>
              )}
            </div>
          )}
        </div>

        {/* ─── RIGHT: Document Chain + Paperwork ─────────── */}
        <div className="space-y-5">
          {/* ─── DOCUMENT CHAIN ──────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Document Chain</div>
              <div className="flex items-center gap-2">
                {(order.qb_estimate_id || order.qb_po_id || order.qb_bill_id || order.qb_invoice_id) && (
                  <button
                    onClick={async () => {
                      try {
                        const { data, error } = await supabase.functions.invoke("qb-check-sync", { body: { order_id: order.id } });
                        if (error) throw error;
                        if (data?.success) {
                          toast[data.has_issues ? "error" : "success"](data.summary);
                          slotsQuery.refetch();
                        } else { toast.error(data?.error || "Sync check failed"); }
                      } catch (err: any) { toast.error(err.message || "Sync check failed"); }
                    }}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full hover:opacity-80"
                    style={{ border: "1px solid #717182", color: "#717182" }}
                  >
                    Check QB Sync
                  </button>
                )}
                {order.google_drive_folder_url && (
                  <a
                    href={order.google_drive_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium hover:underline"
                    style={{ color: "#55BAAA" }}
                  >
                    <ExternalLink size={11} /> Drive Folder
                  </a>
                )}
              </div>
            </div>
            {(() => {
              const slotConfig: Record<string, { label: string; color: string }> = {
                catl_estimate: { label: "CATL Estimate", color: "#F3D12A" },
                catl_purchase_order: { label: "Purchase Order", color: "#0E2646" },
                moly_sales_order: { label: "Mfg Sales Order", color: "#3B82F6" },
                signed_moly_so: { label: "Signed SO ✓", color: "#27AE60" },
                moly_invoice: { label: "Mfg Invoice", color: "#8B5CF6" },
                qb_bill: { label: "QB Bill", color: "#EF4444" },
                catl_customer_invoice: { label: "Customer Invoice", color: "#27AE60" },
              };
              const slotOrder = ["catl_estimate", "catl_purchase_order", "moly_sales_order", "signed_moly_so", "moly_invoice", "qb_bill", "catl_customer_invoice"];
              const slots = slotsQuery.data || [];
              const molySlot = slots.find((s: any) => s.slot_type === "moly_sales_order");
              const signedSlot = slots.find((s: any) => s.slot_type === "signed_moly_so");
              const molyFilled = molySlot?.is_filled;
              const signedFilled = signedSlot?.is_filled;

              return (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {slotOrder.map((slotType) => {
                      const slot = slots.find((s: any) => s.slot_type === slotType);
                      const isFilled = slot?.is_filled;
                      const doc = slot?.order_documents as any;
                      const driveUrl = doc?.file_url;
                      const cfg = slotConfig[slotType] || { label: slotType, color: "#717182" };
                      const isDriveLink = driveUrl && (driveUrl.includes("drive.google.com") || driveUrl.includes("docs.google.com"));

                      const qbSyncMap: Record<string, string | undefined> = {
                        catl_estimate: undefined,
                        catl_purchase_order: order.qb_po_sync_status,
                        qb_bill: order.qb_bill_sync_status,
                        catl_customer_invoice: order.qb_invoice_sync_status,
                      };
                      const syncStatus = qbSyncMap[slotType];
                      const isOutOfSync = syncStatus === "out_of_sync";
                      const isVoided = syncStatus === "voided";

                      const qbVoidMap: Record<string, string | undefined> = {
                        catl_purchase_order: "purchaseorder",
                        qb_bill: "bill",
                        catl_customer_invoice: "invoice",
                      };
                      const voidDocType = qbVoidMap[slotType];
                      const canVoid = isFilled && voidDocType && !isVoided;

                      return (
                        <div
                          key={slotType}
                          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2"
                          style={{
                            backgroundColor: isVoided ? "rgba(212,24,61,0.04)" : isOutOfSync ? "rgba(243,161,42,0.06)" : isFilled ? "rgba(39,174,96,0.06)" : "rgba(113,113,130,0.06)",
                            border: isOutOfSync ? "1px solid rgba(243,161,42,0.3)" : isVoided ? "1px solid rgba(212,24,61,0.2)" : "none",
                          }}
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: isVoided ? "#D4183D" : isOutOfSync ? "#F3A12A" : isFilled ? "#27AE60" : "#D1D5DB" }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold truncate" style={{ color: cfg.color }}>
                              {cfg.label}
                              {isOutOfSync && <span className="text-[8px] ml-1" style={{ color: "#B8930A" }}>⚡ out of sync</span>}
                              {isVoided && <span className="text-[8px] ml-1" style={{ color: "#D4183D" }}>✕ voided</span>}
                            </p>
                            {isFilled && slot.qb_doc_number && (
                              <p className="text-[10px] text-muted-foreground">#{slot.qb_doc_number}</p>
                            )}
                            {slotType === "signed_moly_so" && isFilled && slot.comparison_notes && (
                              <p className="text-[9px] text-muted-foreground">{slot.comparison_notes}</p>
                            )}
                          </div>
                          {isFilled && isDriveLink && (
                            <a
                              href={driveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-[10px] font-medium shrink-0 hover:underline"
                              style={{ color: "#55BAAA" }}
                            >
                              <ExternalLink size={10} /> View
                            </a>
                          )}
                          {canVoid && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Remove QB ${cfg.label}? This will delete it from QuickBooks.`)) return;
                                try {
                                  const { data, error } = await supabase.functions.invoke("qb-void-document", {
                                    body: { order_id: order.id, doc_type: voidDocType, action: "void_in_qb" },
                                  });
                                  if (error) throw error;
                                  if (data?.success) { toast.success(`${cfg.label} removed from QuickBooks`); slotsQuery.refetch(); }
                                  else { toast.error(data?.error || "Void failed"); }
                                } catch (err: any) { toast.error(err.message || "Void failed"); }
                              }}
                              className="p-1 rounded hover:bg-red-50 shrink-0"
                              title={`Remove ${cfg.label} from QuickBooks`}
                            >
                              <Trash2 size={10} style={{ color: "#D4183D" }} />
                            </button>
                          )}
                          {!isFilled && !isVoided && (
                            <span className="text-[10px] text-muted-foreground shrink-0">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Comparison warning */}
                  {molySlot?.comparison_status === "mismatch" && (
                    <div className="mt-2 rounded-lg p-2.5" style={{ backgroundColor: "rgba(212,24,61,0.06)", border: "1px solid rgba(212,24,61,0.15)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "#D4183D" }}>⚠ Spec mismatch found — {molySlot.comparison_notes}</p>
                    </div>
                  )}
                  {molySlot?.comparison_status === "match" && !signedFilled && (
                    <div className="mt-2 rounded-lg p-2.5" style={{ backgroundColor: "rgba(39,174,96,0.06)", border: "1px solid rgba(39,174,96,0.15)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "#27AE60" }}>✓ Specs match — ready to accept</p>
                    </div>
                  )}
                  {/* Action buttons */}
                  {molyFilled && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke("compare-documents", { body: { order_id: order.id } });
                            if (error) throw error;
                            if (data?.success) {
                              toast.success(data.summary.has_issues
                                ? `Comparison done: ${data.summary.mismatches} mismatch(es), ${data.summary.moly_only} Moly-only, ${data.summary.catl_only} PO-only`
                                : `All ${data.summary.matches} specs match!`);
                              slotsQuery.refetch();
                            } else { toast.error(data?.error || "Comparison failed"); }
                          } catch (err: any) { toast.error(err.message || "Compare failed"); }
                        }}
                        className="flex-1 text-[12px] font-semibold py-2 rounded-full active:scale-[0.97] transition-transform"
                        style={{ border: "2px solid #3B82F6", color: "#3B82F6" }}
                      >
                        Compare SO vs PO
                      </button>
                      {!signedFilled && (
                        <button
                          onClick={async () => {
                            try {
                              const { data, error } = await supabase.functions.invoke("accept-sales-order", { body: { order_id: order.id, signer_name: "Tim Olson" } });
                              if (error) throw error;
                              if (data?.success) { toast.success("Sales Order accepted!"); slotsQuery.refetch(); }
                              else { toast.error(data?.error || "Accept failed"); }
                            } catch (err: any) { toast.error(err.message || "Accept failed"); }
                          }}
                          className="flex-1 text-[12px] font-semibold py-2 rounded-full active:scale-[0.97] transition-transform"
                          style={{ backgroundColor: "#27AE60", color: "#FFFFFF" }}
                        >
                          Accept & Sign SO
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* ─── DRIVE FOLDER LINK ───────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: "#F5F5F0" }}>
              <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#0E2646" }}>Google Drive</h3>
              {order.google_drive_folder_url ? (
                <a
                  href={order.google_drive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: "rgba(85,186,170,0.1)", color: "#55BAAA" }}
                >
                  <ExternalLink size={11} />
                  Open Folder
                </a>
              ) : (
                <button
                  onClick={() => setEditingDriveUrl(true)}
                  className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: "rgba(243,209,42,0.15)", color: "#854F0B" }}
                >
                  + Link Drive Folder
                </button>
              )}
            </div>
            {editingDriveUrl && (
              <div className="p-4 space-y-2">
                <input
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="Paste Google Drive folder URL..."
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none text-[16px] focus:border-[#F3D12A] focus:ring-2 focus:ring-[rgba(243,209,42,0.25)]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveDriveUrlMutation.mutate()}
                    disabled={!driveUrl.trim() || saveDriveUrlMutation.isPending}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: "#55BAAA" }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingDriveUrl(false); setDriveUrl(order.google_drive_folder_url || ""); }}
                    className="px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── PAPERWORK STATUS ────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Customer Side</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">
                {customerComplete}/{customerDocs.length} <span className="text-[13px] font-normal text-muted-foreground">complete</span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${customerDocs.length > 0 ? (customerComplete / customerDocs.length) * 100 : 0}%`, backgroundColor: "#27AE60" }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>Vendor Side</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">
                {vendorComplete}/{vendorDocs.length} <span className="text-[13px] font-normal text-muted-foreground">complete</span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${vendorDocs.length > 0 ? (vendorComplete / vendorDocs.length) * 100 : 0}%`, backgroundColor: "#27AE60" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
