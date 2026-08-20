-- Training providers only had a single free-text contact_info catch-all -- no
-- structured contact number, email or website, so the provider list could show a
-- name but nothing else, and email/website could never be validated, made clickable,
-- or displayed in a consistent order.
--
-- Add three dedicated columns. contact_info is left in place (still nullable, unused
-- by new records) so no historical data is lost.
--
-- Idempotent: safe to re-run.

alter table if exists public.training_providers
  add column if not exists contact text null,
  add column if not exists email text null,
  add column if not exists website text null;

comment on column public.training_providers.contact is 'Primary contact number for this training provider.';
comment on column public.training_providers.email is 'Contact email for this training provider.';
comment on column public.training_providers.website is 'Website URL for this training provider (normalized to include a scheme, e.g. https://).';
