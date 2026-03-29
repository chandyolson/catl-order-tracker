alter table public.orders
  add column if not exists qb_bill_doc_number    text,
  add column if not exists qb_invoice_doc_number text,
  add column if not exists qb_estimate_doc_number text;
