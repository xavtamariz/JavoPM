-- Remove extension fields from CRM prospect and contact records.

alter table public.crm_prospects
  drop column if exists extension;

alter table public.crm_prospect_contacts
  drop column if exists extension;
