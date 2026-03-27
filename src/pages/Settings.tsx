import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Check for QB callback
  useEffect(() => {
    if (searchParams.get("qb_connected") === "true") {
      toast.success("QuickBooks connected successfully");
      searchParams.delete("qb_connected");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const qbStatusQuery = useQuery({
    queryKey: ["qb-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qb_tokens")
        .select("id, realm_id, refresh_token_expires_at, access_token_expires_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { connected: false };
      const expired = new Date(data.refresh_token_expires_at) < new Date();
      return { connected: !expired, realm_id: data.realm_id, expires: data.refresh_token_expires_at };
    },
  });

  const qb = qbStatusQuery.data;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://dubzwbfqlwhkpmpuejsy.supabase.co";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-[17px] font-bold mb-6" style={{ color: "#0E2646" }}>
        Settings
      </h1>

      {/* QuickBooks Section */}
      <div className="bg-white border rounded-xl p-5" style={{ borderColor: "#D4D4D0" }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#E8F5E8" }}>
            <span className="text-lg font-bold" style={{ color: "#2CA01C" }}>QB</span>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: "#0E2646" }}>QuickBooks Online</h2>
            <p className="text-[12px]" style={{ color: "#717182" }}>Sync estimates and invoices</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: qb?.connected ? "#27AE60" : "#D4183D" }}
          />
          <span className="text-[13px] font-medium" style={{ color: qb?.connected ? "#27AE60" : "#D4183D" }}>
            {qbStatusQuery.isLoading ? "Checking..." : qb?.connected ? "Connected" : "Not Connected"}
          </span>
          {qb?.connected && qb.realm_id && (
            <span className="text-[11px]" style={{ color: "#717182" }}>
              · Realm {qb.realm_id}
            </span>
          )}
        </div>

        {!qb?.connected && !qbStatusQuery.isLoading && (
          <a
            href={`${supabaseUrl}/functions/v1/qb-auth-start`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform"
            style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
          >
            Connect QuickBooks
            <ExternalLink size={14} />
          </a>
        )}

        {qb?.connected && (
          <p className="text-[12px]" style={{ color: "#717182" }}>
            Token expires {new Date(qb.expires!).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
