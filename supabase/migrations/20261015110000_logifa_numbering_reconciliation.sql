-- Manual reconciliation of an external invoice series.
-- No invoice is emitted; only a verified future counter is prepared and audited.
create table if not exists logifa_private.invoice_numbering_reconciliations (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public.legal_entities(id) on delete restrict,
  previous_next_value bigint not null,
  new_next_value bigint not null,
  previous_last_issue_date date,
  external_last_number text not null,
  external_last_date date not null,
  evidence text not null,
  reviewed_at timestamptz not null default now()
);
revoke all on logifa_private.invoice_numbering_reconciliations from public,anon,authenticated;

create or replace function logifa_private.api_invoice_numbering(
  p_action text,p_issuer uuid,p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
 profile public.issuer_profiles;
 legal public.legal_entities;
 counter public.document_sequences;
 hold logifa_private.invoice_numbering_hold;
 last_ref text;
 last_date date;
 justification text;
 number_suffix integer;
 old_counter bigint;
 old_date date;
begin
 perform logifa_private.assert_admin();
 select * into profile from public.issuer_profiles
  where id=p_issuer and active=true;
 if profile.id is null or profile.legal_entity_id is null
   then raise exception 'LOGIFA_SCOPE_NOT_FOUND'; end if;
 select * into legal from public.legal_entities where id=profile.legal_entity_id;
 if legal.id is null then raise exception 'LOGIFA_ENTITY_REQUIRED'; end if;

 if p_action='status' then
  select * into counter from public.document_sequences
    where legal_entity_id=legal.id and document_type='invoice';
  select * into hold from logifa_private.invoice_numbering_hold
    where legal_entity_id=legal.id and released_at is null;
  return jsonb_build_object(
    'issuer_id',p_issuer,'company_name',profile.commercial_name,
    'has_sequence',counter.id is not null,
    'prefix',counter.prefix,'next_value',counter.next_value,
    'last_issue_date',counter.last_issue_date,
    'on_hold',hold.legal_entity_id is not null,
    'hold_reason',hold.reason,'legal_reviewed',legal.reviewed,
    'registered_invoices',(select count(*) from public.invoices i
      where i.legal_entity_id=legal.id and i.lifecycle in ('issued','historical'))
  );
 end if;

 if p_action<>'reconcile' or p_data->>'confirmation'<>'JE CONFIRME LA SERIE'
   then raise exception 'LOGIFA_NUMBERING_CONFIRMATION_REQUIRED'; end if;
 if jsonb_typeof(p_data)<>'object' or p_data->>'last_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or p_data->>'last_number' !~ '^D-[0-9]{7,8}-[0-9]{4}$'
   then raise exception 'LOGIFA_NUMBERING_REFERENCE_REQUIRED'; end if;
 last_ref:=p_data->>'last_number';
 last_date:=(p_data->>'last_date')::date;
 justification:=btrim(coalesce(p_data->>'evidence',''));
 if length(justification)<30 or length(justification)>2000
   then raise exception 'LOGIFA_NUMBERING_EVIDENCE_REQUIRED'; end if;
 if last_date>current_date then raise exception 'LOGIFA_NUMBERING_FUTURE_DATE'; end if;
 if last_ref<>'D-'||extract(year from last_date)::int::text||
   extract(month from last_date)::int::text||
   lpad(extract(day from last_date)::int::text,2,'0')||'-'||right(last_ref,4)
   then raise exception 'LOGIFA_NUMBERING_DATE_MISMATCH'; end if;
 number_suffix:=right(last_ref,4)::integer;
 if number_suffix<1 or number_suffix>=9999 then raise exception 'LOGIFA_NUMBERING_LIMIT'; end if;

 select * into counter from public.document_sequences
  where legal_entity_id=legal.id and document_type='invoice' for update;
 select * into hold from logifa_private.invoice_numbering_hold
  where legal_entity_id=legal.id and released_at is null for update;
 if counter.id is null or counter.prefix<>'D' or hold.legal_entity_id is null
   then raise exception 'LOGIFA_NUMBERING_HOLD_REQUIRED'; end if;
 if exists(select 1 from public.invoices where legal_entity_id=legal.id and lifecycle in ('issued','historical'))
   then raise exception 'LOGIFA_NUMBERING_INVOICES_EXIST'; end if;
 if last_date<coalesce(counter.last_issue_date,'0001-01-01'::date)
   or number_suffix+1<counter.next_value then
    raise exception 'LOGIFA_NUMBERING_CHRONOLOGY'; end if;

 old_counter:=counter.next_value;
 old_date:=counter.last_issue_date;
 update public.document_sequences set next_value=number_suffix+1,last_issue_date=last_date
  where id=counter.id;
 insert into logifa_private.invoice_numbering_reconciliations(
  legal_entity_id,previous_next_value,new_next_value,previous_last_issue_date,
  external_last_number,external_last_date,evidence
 ) values(legal.id,old_counter,number_suffix+1,old_date,last_ref,last_date,justification);
 update logifa_private.invoice_numbering_hold set released_at=now()
  where legal_entity_id=legal.id and released_at is null;
 return jsonb_build_object(
  'released',true,'previous_next_value',old_counter,
  'new_next_value',number_suffix+1,
  'last_external_number',last_ref,'last_external_date',last_date
 );
end $$;

create or replace function public.logifa_invoice_numbering(
  p_action text,p_issuer uuid,p_data jsonb default '{}'::jsonb
) returns jsonb language sql set search_path to ''
as $$ select logifa_private.api_invoice_numbering($1,$2,$3) $$;
revoke all on function logifa_private.api_invoice_numbering(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.logifa_invoice_numbering(text,uuid,jsonb) from public,anon;
grant execute on function logifa_private.api_invoice_numbering(text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.logifa_invoice_numbering(text,uuid,jsonb) to authenticated,service_role;