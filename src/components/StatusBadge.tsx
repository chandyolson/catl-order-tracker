const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  estimate: { label: "Estimate", bg: "bg-gray-100", text: "text-gray-700" },
  approved: { label: "Approved", bg: "bg-blue-100", text: "text-blue-700" },
  ordered: { label: "Ordered", bg: "bg-indigo-100", text: "text-indigo-700" },
  so_received: { label: "SO Received", bg: "bg-purple-100", text: "text-purple-700" },
  in_production: { label: "In Production", bg: "bg-amber-100", text: "text-amber-800" },
  completed: { label: "Completed", bg: "bg-emerald-100", text: "text-emerald-700" },
  freight_arranged: { label: "Freight Arranged", bg: "bg-cyan-100", text: "text-cyan-700" },
  delivered: { label: "Delivered", bg: "bg-green-100", text: "text-green-700" },
  invoiced: { label: "Invoiced", bg: "bg-orange-100", text: "text-orange-700" },
  paid: { label: "Paid", bg: "bg-teal-100", text: "text-teal-700" },
  closed: { label: "Closed", bg: "bg-gray-200", text: "text-gray-500" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
