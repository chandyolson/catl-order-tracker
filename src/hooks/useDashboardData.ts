import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useActiveOrdersCount() {
  return useQuery({
    queryKey: ["active-orders-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("closed")');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useEstimateVsOrderCounts() {
  return useQuery({
    queryKey: ["estimate-vs-order-counts"],
    queryFn: async () => {
      const { count: estCount, error: e1 } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("source_type", "estimate")
        .in("status", ["estimate"]);
      if (e1) throw e1;

      const { count: ordCount, error: e2 } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("closed")')
        .not("source_type", "eq", "estimate");
      if (e2) throw e2;

      return { estimates: estCount ?? 0, orders: ordCount ?? 0 };
    },
  });
}

export function useAttentionItems() {
  return useQuery({
    queryKey: ["attention-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attention_items")
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDueThisMonth() {
  return useQuery({
    queryKey: ["due-this-month"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("est_completion_date", start)
        .lte("est_completion_date", end)
        .not("status", "in", '("closed")');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useReadyToInvoice() {
  return useQuery({
    queryKey: ["ready-to-invoice"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "delivered");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useRecentOrders() {
  return useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, address_city, address_state)")
        .order("created_at", { ascending: false })
        .range(0, 9);
      if (error) throw error;
      return data ?? [];
    },
  });
}
