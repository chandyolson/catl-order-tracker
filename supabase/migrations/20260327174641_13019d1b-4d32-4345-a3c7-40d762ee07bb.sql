ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type text DEFAULT '$';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;