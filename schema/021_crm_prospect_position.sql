-- Add primary contact position to CRM prospects.

alter table public.crm_prospects
  add column if not exists position text not null default '';
