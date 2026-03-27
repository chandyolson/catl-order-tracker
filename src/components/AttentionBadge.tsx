const attentionConfig: Record<string, { bg: string; border: string; text: string }> = {
  overdue: { bg: "bg-red-50", border: "border-l-catl-red", text: "text-catl-red" },
  missing_paperwork: { bg: "bg-orange-50", border: "border-l-catl-orange", text: "text-catl-orange" },
  eta_slip: { bg: "bg-amber-50", border: "border-l-catl-gold", text: "text-amber-700" },
  pending_approval: { bg: "bg-blue-50", border: "border-l-blue-500", text: "text-blue-700" },
  ready_to_invoice: { bg: "bg-teal-50", border: "border-l-catl-teal", text: "text-catl-teal" },
};

export default function AttentionBadge({ type }: { type: string }) {
  const config = attentionConfig[type] || attentionConfig.pending_approval;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${config.text}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

export { attentionConfig };
