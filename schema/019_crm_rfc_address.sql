-- Add tax/address fields to CRM prospects.

alter table public.crm_prospects
  add column if not exists rfc text not null default '',
  add column if not exists address text not null default '';
