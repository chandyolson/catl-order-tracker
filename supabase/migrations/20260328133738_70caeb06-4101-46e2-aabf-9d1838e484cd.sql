
-- Add columns to estimates for versioning with full config snapshots
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS selected_options jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS our_cost numeric;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS discount_type text DEFAULT '$';
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

-- Add columns to change_orders for detailed change tracking
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS previous_config jsonb;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS new_config jsonb;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS changes_summary jsonb DEFAULT '[]'::jsonb;
