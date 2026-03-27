import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

type SortKey = "name" | "company" | "location" | "orders" | "revenue";
type SortDir = "asc" | "desc";

export default function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const PAGE_SIZE = 50;

  const customersQuery = useQuery({
    queryKey: ["customers_with_stats"],
    queryFn: async () => {
      const { data: customers, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (error) throw error;

      const { data: orders, error: oErr } = await supabase
        .from("orders")
        .select("customer_id, customer_price");
      if (oErr) throw oErr;

      const statsMap: Record<string, { count: number; revenue: number }> = {};
      (orders || []).forEach((o: any) => {
        if (!o.customer_id) return;
        if (!statsMap[o.customer_id]) statsMap[o.customer_id] = { count: 0, revenue: 0 };
        statsMap[o.customer_id].count++;
        statsMap[o.customer_id].revenue += o.customer_price || 0;
      });

      return (customers || []).map((c: any) => ({
        ...c,
        order_count: statsMap[c.id]?.count || 0,
        total_revenue: statsMap[c.id]?.revenue || 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    let items = customersQuery.data || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((c: any) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.address_city || "").toLowerCase().includes(q) ||
        (c.address_state || "").toLowerCase().includes(q)
      );
    }
    items = [...items].sort((a: any, b: any) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "name": av = a.name?.toLowerCase() || ""; bv = b.name?.toLowerCase() || ""; break;
        case "company": av = a.company?.toLowerCase() || ""; bv = b.company?.toLowerCase() || ""; break;
        case "location": av = `${a.address_state || ""} ${a.address_city || ""}`.toLowerCase(); bv = `${b.address_state || ""} ${b.address_city || ""}`.toLowerCase(); break;
        case "orders": av = a.order_count; bv = b.order_count; break;
        case "revenue": av = a.total_revenue; bv = b.total_revenue; break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [customersQuery.data, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("qb-sync-customers");
      if (error) throw new Error(error.message);
      toast.success(data?.message || `Synced ${data?.created || 0} new, updated ${data?.updated || 0} customers`);
      customersQuery.refetch();
    } catch (err: any) {
      toast.error("Sync failed: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[20px] font-bold text-foreground">Customers</h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
          style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync from QuickBooks"}
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 border border-border rounded-lg bg-card px-3 py-2 mb-4">
        <Search size={16} className="text-muted-foreground shrink-0" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search by name, company, email, city, state…" className="flex-1 bg-transparent text-sm outline-none" />
      </div>

      {customersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1.2fr_1fr_1fr_100px_80px_100px] gap-2 px-3 py-2.5" style={{ backgroundColor: "#0E2646" }}>
              {[
                { key: "name" as SortKey, label: "Name" },
                { key: "company" as SortKey, label: "Company" },
                { key: "location" as SortKey, label: "Location" },
                { key: "orders" as SortKey, label: "Orders" },
                { key: "revenue" as SortKey, label: "Revenue" },
              ].map((h) => (
                <button key={h.key} onClick={() => toggleSort(h.key)} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: "rgba(240,240,240,0.6)" }}>
                  {h.label} <SortIcon col={h.key} />
                </button>
              ))}
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(240,240,240,0.6)" }}>Contact</div>
            </div>

            {/* Rows */}
            {pageItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No customers found.</p>
            )}
            {pageItems.map((c: any, idx: number) => (
              <div
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                className={cn(
                  "grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_100px_80px_100px] gap-1 sm:gap-2 px-3 py-3 border-b border-border last:border-0 items-center cursor-pointer hover:bg-muted/50 transition-colors",
                  idx % 2 === 1 ? "bg-[#FAFAF7]" : "bg-card"
                )}
              >
                <span className="text-[13px] font-semibold" style={{ color: "#55BAAA" }}>{c.name}</span>
                <span className="text-[13px] text-muted-foreground truncate">{c.company && c.company !== c.name ? c.company : ""}</span>
                <span className="text-[12px] text-muted-foreground truncate">
                  {[c.address_city, c.address_state].filter(Boolean).join(", ") || "—"}
                </span>
                <span className="text-[13px] text-foreground">{c.order_count}</span>
                <span className="text-[13px] font-medium text-foreground">{fmtCurrency(c.total_revenue)}</span>
                <div className="text-[12px] text-muted-foreground truncate">
                  {c.email || c.phone || "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-30">Prev</button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-30">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
