alter table qb_tokens
  add column if not exists discount_account_id   text,
  add column if not exists discount_account_name text;
