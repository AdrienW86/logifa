-- CLI generation unavailable: its cache targets read-only /home/agent/.supabase.
-- Manual entry confirms the next continuous number; it never rewinds/skips a series.
begin;
create table logifa_private.manual_invoice_number_entries (
  invoice_id uuid primary key references public.invoices(id) on delete restrict,
  number text not null,
  reason text not null,
  actor text not null,
  entered_at timestamptz not null default now()
);
alter table logifa_private.manual_invoice_number_entries enable row level security;
revoke all on logifa_private.manual_invoice_number_entries from public,anon,authenticated;

create function logifa_private.api_issue_invoice_manual(p_id uuid,p_date date,p_number text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.invoices; counter public.document_sequences; expected text; result jsonb;
begin
  perform logifa_private.assert_admin();
  if p_date is null or not isfinite(p_date) or p_number is null or p_number !~ '^D-[0-9]{7,8}-[0-9]{4}$'
    then raise exception 'LOGIFA_MANUAL_NUMBER_INVALID'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 10 and 500
    then raise exception 'LOGIFA_MANUAL_NUMBER_REASON'; end if;
  -- Same lock order as normal issuance: document, then sequence.
  select * into strict d from public.invoices where id=p_id and logifa_managed for update;
  if d.lifecycle='issued' then
    if d.invoice_number is distinct from p_number or d.issue_date is distinct from p_date
      then raise exception 'LOGIFA_MANUAL_NUMBER_ALREADY_ISSUED'; end if;
    return jsonb_build_object('id',d.id,'number',d.invoice_number);
  end if;
  if d.lifecycle<>'draft' or d.origin<>'native' then raise exception 'LOGIFA_NATIVE_DRAFT_REQUIRED'; end if;
  select * into strict counter from public.document_sequences
    where legal_entity_id=d.legal_entity_id and document_type='invoice' for update;
  if counter.next_value not between 1 and 9999 then raise exception 'LOGIFA_INVOICE_NUMBER_LIMIT'; end if;
  expected:='D-'||extract(year from p_date)::int::text||extract(month from p_date)::int::text||
    lpad(extract(day from p_date)::int::text,2,'0')||'-'||lpad(counter.next_value::text,4,'0');
  if p_number<>expected then raise exception 'LOGIFA_MANUAL_NUMBER_SEQUENCE_MISMATCH'; end if;
  if exists(select 1 from public.invoices where legal_entity_id=d.legal_entity_id
    and id<>d.id and btrim(invoice_number)=p_number)
    then raise exception 'LOGIFA_MANUAL_NUMBER_DUPLICATE'; end if;
  -- Reuse every fiscal, chronology, reconciliation and immutability guard.
  result:=logifa_private.api_issue_document('invoice',p_id,p_date);
  if result->>'number' is distinct from p_number then raise exception 'LOGIFA_MANUAL_NUMBER_SEQUENCE_MISMATCH'; end if;
  insert into logifa_private.manual_invoice_number_entries(invoice_id,number,reason,actor)
    values(d.id,p_number,btrim(p_reason),coalesce(auth.jwt()->>'sub',''));
  return result;
end $$;
revoke all on function logifa_private.api_issue_invoice_manual(uuid,date,text,text) from public,anon;
grant execute on function logifa_private.api_issue_invoice_manual(uuid,date,text,text) to authenticated,service_role;
create function public.logifa_issue_invoice_manual(p_id uuid,p_date date,p_number text,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
  select logifa_private.api_issue_invoice_manual($1,$2,$3,$4)
$$;
revoke all on function public.logifa_issue_invoice_manual(uuid,date,text,text) from public,anon;
grant execute on function public.logifa_issue_invoice_manual(uuid,date,text,text) to authenticated,service_role;
commit;
