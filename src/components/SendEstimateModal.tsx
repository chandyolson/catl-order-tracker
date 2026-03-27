import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, Loader2, XCircle, Send } from "lucide-react";
import { toast } from "sonner";

interface SendEstimateModalProps {
  open: boolean;
  onClose: () => void;
  estimate: any;
  order: any;
  customer: any;
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

type Step = "idle" | "pushing_qb" | "sending_email" | "done" | "error";

export default function SendEstimateModal({ open, onClose, estimate, order, customer }: SendEstimateModalProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(customer?.email || "");
  const [pushQB, setPushQB] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [qbResult, setQbResult] = useState<{ success: boolean; qb_doc_number?: string; error?: string } | null>(null);
  const [emailResult, setEmailResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [askEmailAnyway, setAskEmailAnyway] = useState(false);

  const reset = () => {
    setStep("idle");
    setQbResult(null);
    setEmailResult(null);
    setErrorMsg("");
    setAskEmailAnyway(false);
    setEmail(customer?.email || "");
    setPushQB(true);
    setSendEmail(true);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["order", order.id] });
    queryClient.invalidateQueries({ queryKey: ["order_timeline", order.id] });
    queryClient.invalidateQueries({ queryKey: ["estimates", order.id] });
  };

  const doSend = async (forceEmailOnly = false) => {
    setErrorMsg("");
    setAskEmailAnyway(false);

    // Step 1: Push to QB
    if (pushQB && !forceEmailOnly) {
      setStep("pushing_qb");
      try {
        const { data, error } = await supabase.functions.invoke("qb-push-estimate", {
          body: { estimate_id: estimate.id },
        });
        if (error) throw new Error(error.message);
        if (data && !data.success) throw new Error(data.error || "QB push failed");
        setQbResult({ success: true, qb_doc_number: data?.qb_doc_number });
      } catch (err: any) {
        setQbResult({ success: false, error: err.message });
        if (sendEmail) {
          // QB failed but email hasn't been sent — ask user
          setAskEmailAnyway(true);
          setStep("error");
          setErrorMsg(`QuickBooks push failed: ${err.message}`);
          return;
        } else {
          setStep("error");
          setErrorMsg(`QuickBooks push failed: ${err.message}`);
          return;
        }
      }
    }

    // Step 2: Send email
    if (sendEmail || forceEmailOnly) {
      setStep("sending_email");
      try {
        const { data, error } = await supabase.functions.invoke("send-estimate", {
          body: {
            estimate_id: estimate.id,
            recipient_email: email,
            recipient_name: customer?.name || "",
          },
        });
        if (error) throw new Error(error.message);
        if (data && !data.success) throw new Error(data.error || "Email failed");
        setEmailResult({ success: true });
      } catch (err: any) {
        setEmailResult({ success: false, error: err.message });
        const qbOk = qbResult?.success || (!pushQB && !forceEmailOnly);
        setStep("error");
        setErrorMsg(
          qbOk
            ? `Estimate synced to QuickBooks but email failed: ${err.message}`
            : `Email failed: ${err.message}`
        );
        invalidateAll();
        return;
      }
    }

    setStep("done");
    invalidateAll();

    // Auto-close after 3s
    setTimeout(() => {
      handleClose();
    }, 3000);
  };

  const canSend = (pushQB || sendEmail) && (!sendEmail || email.trim().length > 0);
  const customerName = customer?.name || "Customer";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="p-0 gap-0 max-w-md rounded-xl overflow-hidden border-0" style={{ backgroundColor: "#FFFFFF" }}>
        {/* Navy header */}
        <div className="px-5 py-4" style={{ backgroundColor: "#0E2646" }}>
          <div className="flex items-center gap-2">
            <Send size={16} style={{ color: "#F3D12A" }} />
            <h2 className="text-[15px] font-semibold" style={{ color: "#F0F0F0" }}>
              Send Estimate
            </h2>
          </div>
          <p className="text-[12px] mt-1" style={{ color: "rgba(240,240,240,0.45)" }}>
            {order.order_number} · {estimate.build_shorthand}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {step === "idle" && (
            <>
              {/* Order summary */}
              <div className="rounded-lg p-3" style={{ backgroundColor: "#F5F5F0" }}>
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] font-medium" style={{ color: "#0E2646" }}>
                    {estimate.build_shorthand}
                  </span>
                  <span className="text-[15px] font-semibold" style={{ color: "#0E2646" }}>
                    {fmtCurrency(estimate.total_price)}
                  </span>
                </div>
              </div>

              {/* To field */}
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#717182" }}>
                  To
                </label>
                <div className="mt-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@email.com"
                    className="w-full border rounded-lg px-3 py-2.5 text-[14px] outline-none"
                    style={{
                      borderColor: "#D4D4D0",
                      backgroundColor: "#FFFFFF",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#F3D12A";
                      e.target.style.boxShadow = "0 0 0 2px rgba(243,209,42,0.25)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#D4D4D0";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: "#717182" }}>
                  {customerName}
                </p>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={pushQB}
                    onCheckedChange={(c) => setPushQB(!!c)}
                    className="h-5 w-5"
                  />
                  <span className="text-[13px] font-medium" style={{ color: "#1A1A1A" }}>
                    Push to QuickBooks
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={sendEmail}
                    onCheckedChange={(c) => setSendEmail(!!c)}
                    className="h-5 w-5"
                  />
                  <span className="text-[13px] font-medium" style={{ color: "#1A1A1A" }}>
                    Email to customer
                  </span>
                </label>
              </div>

              {sendEmail && !email.trim() && (
                <p className="text-[11px] font-medium" style={{ color: "#D4183D" }}>
                  Add customer email to send estimate
                </p>
              )}
            </>
          )}

          {/* Progress states */}
          {(step === "pushing_qb" || step === "sending_email" || step === "done") && (
            <div className="space-y-3 py-2">
              {pushQB && (
                <div className="flex items-center gap-3">
                  {step === "pushing_qb" && !qbResult ? (
                    <Loader2 size={20} className="animate-spin" style={{ color: "#55BAAA" }} />
                  ) : qbResult?.success ? (
                    <CheckCircle size={20} style={{ color: "#27AE60" }} />
                  ) : qbResult ? (
                    <XCircle size={20} style={{ color: "#D4183D" }} />
                  ) : (
                    <CheckCircle size={20} style={{ color: "#27AE60" }} />
                  )}
                  <span className="text-[13px]" style={{ color: "#1A1A1A" }}>
                    {step === "pushing_qb" && !qbResult
                      ? "Pushing to QuickBooks..."
                      : qbResult?.success
                      ? `Synced to QuickBooks${qbResult.qb_doc_number ? ` (#${qbResult.qb_doc_number})` : ""}`
                      : "QuickBooks push failed"}
                  </span>
                </div>
              )}
              {sendEmail && (
                <div className="flex items-center gap-3">
                  {step === "sending_email" && !emailResult ? (
                    <Loader2 size={20} className="animate-spin" style={{ color: "#55BAAA" }} />
                  ) : emailResult?.success ? (
                    <CheckCircle size={20} style={{ color: "#27AE60" }} />
                  ) : emailResult ? (
                    <XCircle size={20} style={{ color: "#D4183D" }} />
                  ) : (
                    <div className="w-5 h-5 rounded-full" style={{ border: "2px solid #D4D4D0" }} />
                  )}
                  <span className="text-[13px]" style={{ color: "#1A1A1A" }}>
                    {step === "sending_email" && !emailResult
                      ? "Sending email..."
                      : emailResult?.success
                      ? `Email sent to ${email}`
                      : emailResult
                      ? "Email failed"
                      : "Waiting..."}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Success banner */}
          {step === "done" && (
            <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(85,186,170,0.1)", border: "1px solid rgba(85,186,170,0.3)" }}>
              <p className="text-[13px] font-medium" style={{ color: "#0F6E56" }}>
                Estimate sent to {customerName}
                {qbResult?.success ? " and synced to QuickBooks" : ""}
                {qbResult?.qb_doc_number ? ` (QB #${qbResult.qb_doc_number})` : ""}
              </p>
            </div>
          )}

          {/* Error banner */}
          {step === "error" && (
            <div>
              <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(212,24,61,0.06)", border: "1px solid rgba(212,24,61,0.2)" }}>
                <p className="text-[13px] font-medium" style={{ color: "#D4183D" }}>
                  {errorMsg}
                </p>
              </div>
              {askEmailAnyway && (
                <button
                  onClick={() => doSend(true)}
                  className="mt-3 w-full py-2.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: "#55BAAA", color: "#FFFFFF" }}
                >
                  Send email anyway
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex gap-2 justify-end" style={{ backgroundColor: "#F5F5F0" }}>
          {step === "idle" && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2.5 rounded-full text-[13px] font-medium"
                style={{ color: "#717182" }}
              >
                Cancel
              </button>
              <button
                onClick={() => doSend()}
                disabled={!canSend}
                className="px-6 py-2.5 rounded-full text-[13px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-40"
                style={{ backgroundColor: "#F3D12A", color: "#0E2646" }}
              >
                Send
              </button>
            </>
          )}
          {(step === "done" || step === "error") && (
            <button
              onClick={handleClose}
              className="px-4 py-2.5 rounded-full text-[13px] font-medium"
              style={{ color: "#717182" }}
            >
              Close
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
