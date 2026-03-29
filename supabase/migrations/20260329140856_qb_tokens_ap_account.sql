alter table qb_tokens
  add column if not exists ap_account_id   text,
  add column if not exists ap_account_name text;
