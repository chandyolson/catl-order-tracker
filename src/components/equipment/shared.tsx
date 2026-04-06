import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────── */

export type FullOption = {
  id: string;
  name: string;
  display_name: string | null;
  short_code: string;
  option_group: string | null;
  retail_price: number;
  cost_price: number;
  selection_type: string | null;
  allows_quantity: boolean | null;
  max_per_side: number | null;
  requires_extended: boolean | null;
  requires_options: string[] | null;
  conflicts_with: string[] | null;
  model_restriction: string[] | null;
  is_upgrade_of: string | null;
  is_included: boolean | null;
  sort_order: number | null;
};

export type OptionSelection = {
  optionId: string;
  left: number;
  right: number;
  selected: boolean;
  quantity: number;
};

export type SelectedOptionItem = {
  option: FullOption;
  quantity: number;
  left: number;
  right: number;
  pivotType?: string;
  pivotSide?: string;
};

export type CustomLineItem = {
  name: string;
  retail: string;
  cost: string;
};

/** Everything the parent page needs to build the DB payload */
export type ConfiguratorState = {
  manufacturerId: string;
  baseModelId: string;
  quickBuildId: string;
  buildShorthand: string;
  selections: Map<string, OptionSelection>;
  pickOneSelections: Map<string, string>;
  selectedOptionsList: SelectedOptionItem[];
  customLineItems: CustomLineItem[];
  discountType: "$" | "%";
  discountAmount: string;
  freightEstimate: string;
  taxState: string;
  taxRate: number;
  // Computed pricing
  calcRetail: number;
  calcCost: number;
  discountValue: number;
  customerPrice: number;
  ourCost: number;
  taxAmount: number;
  totalWithTax: number;
  margin: { amount: number; percent: number } | null;
  // Controls state
  dualChecked: boolean;
  pivotChecked: boolean;
  pivotType: string;
  pivotSide: string;
  controlsSide: "left" | "right" | "";
};

/** Initial values the parent passes in (for edit mode) */
export type ConfiguratorInitialValues = {
  manufacturerId?: string;
  baseModelId?: string;
  quickBuildId?: string;
  buildShorthand?: string;
  selectedOptions?: any[]; // JSONB from DB
  customLineItems?: CustomLineItem[];
  discountType?: "$" | "%";
  discountAmount?: string;
  freightEstimate?: string;
  taxState?: string;
  taxRate?: number;
  controlsSide?: "left" | "right" | "";
};

/* ─── Utilities ──────────────────────────────────────────── */

export function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/* ─── Small Components ───────────────────────────────────── */

export function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden focus-within:ring-2 focus-within:ring-catl-gold/25 focus-within:border-catl-gold" style={{ maxWidth: 140 }}>
      <span className="pl-3 text-muted-foreground text-sm font-medium">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="flex-1 px-2 py-2.5 bg-transparent outline-none text-foreground min-w-0 text-[16px]"
      />
    </div>
  );
}

export function SidePill({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
        active
          ? "border-catl-teal/30 text-catl-teal"
          : disabled
          ? "border-border text-muted-foreground/40 line-through cursor-not-allowed"
          : "border-border text-muted-foreground hover:border-catl-teal/30"
      )}
      style={active ? { background: "rgba(85,186,170,0.12)" } : undefined}
    >
      {label}
    </button>
  );
}

export function QtyStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex items-center justify-center border rounded-md transition-colors"
        style={{ width: 28, height: 28, borderColor: "#D4D4D0", color: value <= min ? "#D4D4D0" : "#1A1A1A" }}
      >
        <Minus size={14} />
      </button>
      <span className="text-center text-sm font-semibold" style={{ width: 28, color: "#1A1A1A" }}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex items-center justify-center border rounded-md transition-colors"
        style={{ width: 28, height: 28, borderColor: "#D4D4D0", color: value >= max ? "#D4D4D0" : "#1A1A1A" }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
