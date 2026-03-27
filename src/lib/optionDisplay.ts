// Display name mapping for model options
const NAME_MAP: Record<string, string> = {
  "Hydraulic Neck Extender Bars": "Neck Extenders",
  "XP Squeeze WB": "XP Squeeze",
  "Hydraulic Lower Squeeze": "Hyd Lower",
  'Walk-Through Door (26")': "Walk-Through Door",
  "Rubber-Belted Louvers": "Louvers",
  "Additional Neck Access": "Neck Access",
  "Additional Neck Access (per sidegate)": "Neck Access",
  "Rear Frame Hook-Up": "Rear Hook-Up",
  "12 HP Gas Pump + Electric Start": "12HP Gas Pump",
  "5 HP Electric Pump 60Hz": "5HP Electric",
  "7.5 HP Closed Center Electric": "7.5HP Closed Center",
  "Hydraulic Head Restraint": "Head Restraint",
  "De-Horner Head Restraint": "De-Horner",
  "Easy Access Lower Leg Door": "Lower Leg Door",
  "Vertical Split Droppan": "Vertical Drop Pan",
  "Weigh-Tronix Overhead Scales": "Overhead Scales",
  "TruTest Platform Scales w/ S3": "TruTest Platform",
  "Hydraulic Side Exit": "Hyd Side Exit",
  "Quick-Action Slam Shut Side Exit": "Slam Shut Exit",
};

export function getOptionDisplayName(name: string): string {
  return NAME_MAP[name] || name;
}

export function formatSides(left: number, right: number): string {
  const parts: string[] = [];
  if (left > 0) parts.push(left > 1 ? `Left ×${left}` : "Left");
  if (right > 0) parts.push(right > 1 ? `Right ×${right}` : "Right");
  return parts.join(", ");
}

export function formatOptionPillLabel(name: string, left: number, right: number): string {
  let label = getOptionDisplayName(name);
  const sides = formatSides(left, right);
  if (sides) label += ` · ${sides}`;
  return label;
}

// Format pill label from saved JSONB option (handles pivot_type, side, left_qty, right_qty, quantity fields)
export function formatSavedOptionPill(opt: any): string {
  const name = getOptionDisplayName(opt.name || opt.short_code || "Option");
  // Standard controls (included) — don't show
  if (opt.name?.toLowerCase().includes("standard") && opt.is_included) return "";
  // Pivot controls
  if (opt.pivot_type) {
    const typeLabel = opt.pivot_type === "side_to_side" ? "Side-to-Side" : opt.pivot_type === "front_to_back" ? "Front-to-Back" : "";
    const parts = [name];
    if (typeLabel) parts.push(typeLabel);
    if (opt.side) parts.push(opt.side);
    return parts.join(" · ");
  }
  // New format: left_qty / right_qty
  if (opt.left_qty > 0 || opt.right_qty > 0) {
    const sides = formatSides(opt.left_qty || 0, opt.right_qty || 0);
    return sides ? `${name} · ${sides}` : name;
  }
  // Legacy format: left / right
  if (opt.left > 0 || opt.right > 0) {
    const sides = formatSides(opt.left || 0, opt.right || 0);
    return sides ? `${name} · ${sides}` : name;
  }
  // If sides string is stored
  if (opt.sides) {
    return `${name} · ${opt.sides}`;
  }
  // Non-side quantity (e.g. Neckbar ×2)
  if (opt.quantity && opt.quantity > 1) {
    return `${name} ×${opt.quantity}`;
  }
  return name;
}
