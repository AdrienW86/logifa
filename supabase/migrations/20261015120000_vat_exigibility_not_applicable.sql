-- Allow an explicit non-applicable VAT exigibility only for exempt/franchise issuers.
-- No user/company row is changed and no legal profile is automatically reviewed.
alter table public.legal_entities
 drop constraint legal_entities_vat_exigibility_check;
alter table public.legal_entities
 add constraint legal_entities_vat_exigibility_check
 check (vat_exigibility = any(array['unknown','cash','debits','delivery','not_applicable']::text[]));
alter table public.legal_entities
 add constraint legal_entities_vat_not_applicable_requires_exempt
 check (vat_exigibility is distinct from 'not_applicable' or vat_regime='exempt');