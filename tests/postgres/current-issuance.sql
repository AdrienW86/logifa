-- Read-only snapshot of deployed issuance function, 2026-10-15.
-- Test dependency only. Not a production migration; no real counters or rows.
create table logifa_private.invoice_numbering_hold(
  legal_entity_id uuid primary key references public.legal_entities(id),
  reason text, released_at timestamptz
);
CREATE OR REPLACE FUNCTION logifa_private.api_issue_document(p_kind text, p_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; entity public.legal_entities; sequence public.document_sequences; number_value text; deposits numeric; credit_total numeric;
begin
  perform logifa_private.assert_admin();
  if p_kind is null or p_kind not in ('quote','invoice') or p_date is null or not isfinite(p_date) then raise exception 'LOGIFA_ISSUE_INPUT'; end if;
  execute format('select * from public.%I where id=$1 and logifa_managed for update',case p_kind when 'quote' then 'quotes' else 'invoices' end) into strict d using p_id;
  if d.lifecycle='issued' then
    return jsonb_build_object('id',d.id,'number',to_jsonb(d)->>case p_kind when 'quote' then 'quote_number' else 'invoice_number' end);
  end if;
  if d.lifecycle<>'draft' or d.origin<>'native' then raise exception 'LOGIFA_NATIVE_DRAFT_REQUIRED'; end if;
  select * into strict entity from public.legal_entities where id=d.legal_entity_id;
  if not entity.reviewed or entity.vat_regime='unknown' or nullif(entity.legal_name,'') is null then raise exception 'LOGIFA_ENTITY_REVIEW_REQUIRED'; end if;
  if not exists(select 1 from public.issuer_profiles where id=d.issuer_profile_id and legal_entity_id=entity.id) then raise exception 'LOGIFA_ISSUER_MAPPING'; end if;
  if entity.vat_regime in ('exempt','reverse_charge') and d.total_vat<>0 then raise exception 'LOGIFA_VAT_REGIME'; end if;
  if d.total_gross<=0 then raise exception 'LOGIFA_POSITIVE_DOCUMENT_REQUIRED'; end if;
  if p_kind='invoice' then
    if d.document_kind='final' and d.quote_id is null and d.project_id is null then raise exception 'LOGIFA_FINAL_CONTEXT_REQUIRED'; end if;
    if d.document_kind='deposit' and d.quote_id is not null and
      d.total_gross+coalesce((select sum(i.total_gross) from public.invoices i
        where i.id<>d.id and i.quote_id=d.quote_id
          and i.document_kind='deposit' and i.lifecycle in ('issued','historical')),0)
      >(select q.total_gross from public.quotes q where q.id=d.quote_id)
    then raise exception 'LOGIFA_DEPOSIT_EXCEEDS_CONTRACT'; end if;
    if d.document_kind='deposit' and exists(select 1 from public.invoices f where f.document_kind='final' and f.lifecycle in ('issued','historical')
      and ((d.quote_id is not null and f.quote_id=d.quote_id) or (d.quote_id is null and d.project_id is not null and f.project_id=d.project_id)))
      then raise exception 'LOGIFA_FINAL_ALREADY_ISSUED'; end if;
    if d.quote_id is not null and d.document_kind in ('deposit','final') and not exists(select 1 from public.quotes where id=d.quote_id and status='accepted') then raise exception 'LOGIFA_ACCEPTED_QUOTE_REQUIRED'; end if;
    if d.document_kind='credit' then
      if exists(select 1 from public.invoices where id=d.correction_of and document_kind='final')
        and nullif(btrim(d.credit_reason),'') is null then raise exception 'LOGIFA_CREDIT_REASON_REQUIRED'; end if;
      if not exists(select 1 from public.invoices x where x.id=d.correction_of and x.document_kind<>'credit'
        and x.lifecycle in ('issued','historical') and x.legal_entity_id=d.legal_entity_id and x.client_id=d.client_id
        and (d.quote_id is null or d.quote_id=x.quote_id) and (d.project_id is null or d.project_id=x.project_id)) then raise exception 'LOGIFA_CREDIT_SOURCE_REQUIRED'; end if;
      if exists(select 1 from public.deposit_deductions x join public.invoices f on f.id=x.final_invoice_id
        where x.deposit_invoice_id=d.correction_of and f.lifecycle in ('issued','historical')) then raise exception 'LOGIFA_DEDUCTED_DEPOSIT_CREDIT_REQUIRES_REVIEW'; end if;
      if exists(select 1 from public.invoices c where c.document_kind='credit' and c.lifecycle='historical'
        and logifa_private.credit_source(c.id)=d.correction_of and not exists(select 1 from public.invoice_items where invoice_id=c.id))
        then raise exception 'LOGIFA_HISTORICAL_TAX_REVIEW_REQUIRED'; end if;
      select coalesce(sum(total_gross),0) into credit_total from public.invoices where logifa_private.credit_source(id)=d.correction_of and lifecycle in ('issued','historical') and document_kind='credit';
      if credit_total+d.total_gross>(select x.total_gross-coalesce((select sum(net_minor+vat_minor)/100.0 from logifa_private.deduction_tax(x.id)),0)
        from public.invoices x where x.id=d.correction_of) then raise exception 'LOGIFA_CREDIT_EXCEEDS_SOURCE'; end if;
      if exists(select 1 from (
        select vat_rate,sum(total_net) as net,sum(round(total_net*vat_rate/100,2)) as vat from public.invoice_items where invoice_id=d.id group by vat_rate
        ) wanted left join (
        select vat_rate,sum(net) as net,sum(vat) as vat from (
          select vat_rate,total_net as net,round(total_net*vat_rate/100,2) as vat from public.invoice_items where invoice_id=d.correction_of
          union all select vat_rate,-net_minor/100.0,-vat_minor/100.0 from logifa_private.deduction_tax(d.correction_of)
          union all select vat_rate,-total_net,-round(total_net*vat_rate/100,2) from public.invoice_items where invoice_id in
            (select id from public.invoices where logifa_private.credit_source(id)=d.correction_of and lifecycle in ('issued','historical') and document_kind='credit')
        ) source_lines group by vat_rate
        ) available using(vat_rate) where wanted.net>coalesce(available.net,0) or wanted.vat>coalesce(available.vat,0)) then raise exception 'LOGIFA_CREDIT_TAX_BREAKDOWN'; end if;
    elsif d.correction_of is not null then raise exception 'LOGIFA_UNEXPECTED_CREDIT_SOURCE'; end if;
    -- Refuse incomplete financial/tax validation before freezing fiscal amounts.
    if exists(select 1 from public.deposit_deductions z join public.invoices c on logifa_private.credit_source(c.id)=z.deposit_invoice_id
      where z.final_invoice_id=d.id and c.document_kind='credit' and c.lifecycle in ('issued','historical')
      and (round(c.total_gross*100)<>(select coalesce(sum(amount_minor),0) from public.credit_applications where credit_invoice_id=c.id)
        or not exists(select 1 from public.invoice_items where invoice_id=c.id))) then raise exception 'LOGIFA_DEPOSIT_CREDIT_REVIEW_REQUIRED'; end if;
    select coalesce(sum(net_minor+vat_minor)/100.0,0) into deposits from logifa_private.deduction_tax(d.id);
    if deposits>d.total_gross then raise exception 'LOGIFA_DEPOSIT_EXCEEDS_FINAL'; end if;
    if exists(select 1 from (
      select vat_rate,sum(net_minor)/100.0 as net,sum(vat_minor)/100.0 as vat from logifa_private.deduction_tax(d.id) group by vat_rate
      ) s left join (
      select vat_rate,sum(total_net) as net,sum(round(total_net*vat_rate/100,2)) as vat from public.invoice_items where invoice_id=d.id group by vat_rate
      ) f using(vat_rate) where s.net>coalesce(f.net,0) or s.vat>coalesce(f.vat,0)) then raise exception 'LOGIFA_DEPOSIT_TAX_BREAKDOWN'; end if;
    if d.document_kind='final' then
      if exists(
        select 1 from public.invoices dep
        where dep.document_kind='deposit'
          and dep.lifecycle in ('issued','historical')
          and dep.legal_entity_id=d.legal_entity_id
          and dep.client_id=d.client_id
          and (
            (d.quote_id is not null and dep.quote_id=d.quote_id)
            or (d.quote_id is null and d.project_id is not null
                and dep.quote_id is null and dep.project_id=d.project_id)
          )
          and not exists(
            select 1 from public.deposit_deductions linked
            where linked.final_invoice_id=d.id and linked.deposit_invoice_id=dep.id
          )
      ) then raise exception 'LOGIFA_FINAL_UNLINKED_DEPOSITS'; end if;
      if exists(select 1 from public.invoices x where x.id<>d.id and x.document_kind='final' and x.lifecycle in ('issued','historical')
        and ((d.quote_id is not null and x.quote_id=d.quote_id) or (d.quote_id is null and d.project_id is not null and x.project_id=d.project_id)))
        then raise exception 'LOGIFA_FINAL_ALREADY_ISSUED'; end if;
      update public.deposit_deductions z set tax_snapshot=(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from logifa_private.net_deposit_tax(z.deposit_invoice_id) t)
        where z.final_invoice_id=d.id and z.tax_snapshot is null;
    end if;
  end if;
  if p_kind='invoice' and exists(
  select 1 from logifa_private.invoice_numbering_hold h
  where h.legal_entity_id=d.legal_entity_id and h.released_at is null
) then raise exception 'LOGIFA_NUMBERING_RECONCILIATION_REQUIRED'; end if;
  select * into strict sequence from public.document_sequences where legal_entity_id=d.legal_entity_id and document_type=p_kind for update;
  if sequence.last_issue_date is not null and p_date<sequence.last_issue_date then raise exception 'LOGIFA_NUMBER_CHRONOLOGY'; end if;
  execute format('select max(issue_date) from public.%I where legal_entity_id=$1 and lifecycle in (''issued'',''historical'')',case p_kind when 'quote' then 'quotes' else 'invoices' end)
    into sequence.last_issue_date using d.legal_entity_id;
  if sequence.last_issue_date is not null and p_date<sequence.last_issue_date then raise exception 'LOGIFA_NUMBER_CHRONOLOGY'; end if;
  if p_kind='invoice' then
      if sequence.next_value>9999 then raise exception 'LOGIFA_INVOICE_NUMBER_LIMIT'; end if;
      number_value:='D-'||extract(year from p_date)::int::text||extract(month from p_date)::int::text||lpad(extract(day from p_date)::int::text,2,'0')||'-'||lpad(sequence.next_value::text,4,'0');
    else
      number_value:=sequence.prefix||'-'||lpad(sequence.next_value::text,12,'0');
    end if;
  -- Counter and issuance commit together. A failure rolls both back: no gap.
  update public.document_sequences set next_value=next_value+1,last_issue_date=p_date where id=sequence.id;
  execute format('update public.%I set %I=$1,issue_date=$2,lifecycle=''issued'',status=''sent'',issuer_snapshot=$3 where id=$4',
    case p_kind when 'quote' then 'quotes' else 'invoices' end,case p_kind when 'quote' then 'quote_number' else 'invoice_number' end)
    using number_value,p_date,jsonb_build_object('profile',d.issuer_snapshot,'legal_entity',to_jsonb(entity)),d.id;
  update public.document_workflow set state='issued',updated_at=now() where (quote_id=d.id or invoice_id=d.id) and state='draft';
  return jsonb_build_object('id',d.id,'number',number_value);
end $function$

