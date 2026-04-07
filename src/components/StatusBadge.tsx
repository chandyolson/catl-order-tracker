const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  estimate: { label: "Estimate", bg: "bg-gray-100", text: "text-gray-700" },
  purchase_order: { label: "PO", bg: "bg-blue-100", text: "text-blue-700" },
  order_pending: { label: "Pending", bg: "bg-purple-100", text: "text-purple-700" },
  building: { label: "Building", bg: "bg-amber-100", text: "text-amber-800" },
  ready: { label: "Ready", bg: "bg-emerald-100", text: "text-emerald-700" },
  delivered: { label: "Delivered", bg: "bg-green-100", text: "text-green-700" },
  closed: { label: "Closed", bg: "bg-gray-200", text: "text-gray-500" },
  in_transit: { label: "In Transit", bg: "bg-sky-100", text: "text-sky-700" },
  at_catl: { label: "CATL HQ", bg: "bg-teal-100", text: "text-teal-700" },
  ordered: { label: "Ordered", bg: "bg-indigo-100", text: "text-indigo-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
