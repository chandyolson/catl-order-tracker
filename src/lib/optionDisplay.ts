export function formatSides(left: number, right: number): string {
  const parts: string[] = [];
  if (left > 0) parts.push(left > 1 ? `Left ×${left}` : "Left");
  if (right > 0) parts.push(right > 1 ? `Right ×${right}` : "Right");
  return parts.join(", ");
}

export function formatOptionPillLabel(displayName: string, left: number, right: number): string {
  let label = displayName;
  const sides = formatSides(left, right);
  if (sides) label += ` · ${sides}`;
  return label;
}

// Format pill label from saved JSONB option (uses display_name as source of truth)
export function formatSavedOptionPill(opt: any): string {
  const name = opt.display_name || opt.name || opt.short_code || "Option";
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
