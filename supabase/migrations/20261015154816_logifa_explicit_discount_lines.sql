-- Allow explicit discount lines in preparations only; issued documents remain immutable.
begin;
CREATE OR REPLACE FUNCTION logifa_private.api_save_document(p_kind text, p_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare issuer public.issuer_profiles; owner_id text; doc_id uuid; c public.clients; r jsonb; n integer:=0;
  ht numeric:=0; vat numeric:=0; line_ht numeric; lifecycle_value text; q public.quotes;
begin
  perform logifa_private.assert_admin();
  if p_kind is null or p_kind not in ('quote','invoice') then raise exception 'LOGIFA_DOCUMENT_KIND'; end if;
  select legacy_profile_id into owner_id from logifa_private.admin_binding where singleton;
  select * into strict issuer from public.issuer_profiles where id=(p_data->>'issuer_profile_id')::uuid;
  select * into strict c from public.clients where id=(p_data->>'client_id')::uuid;
  if (p_data->>'project_id') is not null and not exists(select 1 from public.projects x join public.issuer_profiles ip on ip.id=x.issuer_profile_id
    where x.id=(p_data->>'project_id')::uuid and x.client_id=c.id and ip.legal_entity_id=issuer.legal_entity_id)
    then raise exception 'LOGIFA_PROJECT_CLIENT_MISMATCH'; end if;
  if p_kind='invoice' and (p_data->>'document_kind' is null or p_data->>'document_kind' not in ('classic','deposit','final','credit')) then raise exception 'LOGIFA_INVOICE_KIND'; end if;
  if p_kind='invoice' and p_data->>'quote_id' is not null then
    select * into strict q from public.quotes where id=(p_data->>'quote_id')::uuid;
    if q.client_id is distinct from c.id or q.legal_entity_id is distinct from issuer.legal_entity_id
      or (p_data->>'project_id' is not null and q.project_id is distinct from (p_data->>'project_id')::uuid) then raise exception 'LOGIFA_QUOTE_MISMATCH'; end if;
  end if;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')>1000 then raise exception 'LOGIFA_LINES_REQUIRED'; end if;
  -- V1: do not even create an automatic credit draft against a deducted deposit
  -- after final issuance. A final credit is not a substitute for tax regularization.
  if p_kind='invoice' and p_data->>'document_kind'='credit' then
    if exists(select 1 from public.deposit_deductions x join public.invoices f on f.id=x.final_invoice_id
      where x.deposit_invoice_id=(p_data->>'correction_of')::uuid and f.lifecycle in ('issued','historical'))
      then raise exception 'LOGIFA_DEDUCTED_DEPOSIT_CREDIT_REQUIRES_REVIEW'; end if;
    if exists(select 1 from public.invoices where id=(p_data->>'correction_of')::uuid and document_kind='final')
      and nullif(btrim(p_data->>'credit_reason'),'') is null then raise exception 'LOGIFA_CREDIT_REASON_REQUIRED'; end if;
  end if;
  doc_id:=coalesce(p_id,gen_random_uuid());
  if p_id is not null then
    execute format('select lifecycle from public.%I where id=$1 and logifa_managed for update',case p_kind when 'quote' then 'quotes' else 'invoices' end) into lifecycle_value using p_id;
    if lifecycle_value is distinct from 'draft' then raise exception 'LOGIFA_DRAFT_REQUIRED'; end if;
    if p_kind='invoice' and exists(select 1 from public.deposit_deductions where final_invoice_id=doc_id) then raise exception 'LOGIFA_DEDUCTIONS_ALREADY_LINKED'; end if;
  else
    if p_kind='quote' then insert into public.quotes(id,user_id,quote_number,logifa_managed,lifecycle) values(doc_id,owner_id,null,true,'draft');
    else insert into public.invoices(id,user_id,invoice_number,logifa_managed,lifecycle) values(doc_id,owner_id,null,true,'draft'); end if;
  end if;
  execute format('update public.%I set issuer_profile_id=$1,legal_entity_id=$2,client_id=$3,project_id=$4,issuer_snapshot=$5,client_snapshot=$6 where id=$7',
    case p_kind when 'quote' then 'quotes' else 'invoices' end)
    using issuer.id,issuer.legal_entity_id,c.id,(p_data->>'project_id')::uuid,to_jsonb(issuer),to_jsonb(c),doc_id;
  if p_kind='invoice' then update public.invoices set document_kind=p_data->>'document_kind',quote_id=(p_data->>'quote_id')::uuid,
    correction_of=(p_data->>'correction_of')::uuid,credit_reason=nullif(btrim(p_data->>'credit_reason'),'') where id=doc_id; end if;
  execute format('delete from public.%I where %I=$1',case p_kind when 'quote' then 'quote_items' else 'invoice_items' end,
    case p_kind when 'quote' then 'quote_id' else 'invoice_id' end) using doc_id;
  for r in select value from jsonb_array_elements(p_data->'lines') loop
    if r->>'type' is null or r->>'type' not in ('title','normal') or nullif(btrim(r->>'name'),'') is null then raise exception 'LOGIFA_LINE_INVALID'; end if;
    if r->>'type'='normal' then
      if (r->>'quantity' ~ '^[0-9]+(\.[0-9]{1,2})?$') is not true or (r->>'price' ~ '^-?[0-9]+(\.[0-9]{1,2})?$') is not true
        or (r->>'tva' ~ '^[0-9]+(\.[0-9]{1,2})?$') is not true or r->>'unit' is null then raise exception 'LOGIFA_LINE_INVALID'; end if;
      if (r->>'quantity')::numeric<=0 or round((r->>'quantity')::numeric,2)<>(r->>'quantity')::numeric
        or abs((r->>'price')::numeric)>9999999999.99 or round((r->>'price')::numeric,2)<>(r->>'price')::numeric
        or (r->>'tva')::numeric not between 0 and 100 or round((r->>'tva')::numeric,2)<>(r->>'tva')::numeric
        or r->>'unit' not in ('m²','ml','unité','forfait','m³') then raise exception 'LOGIFA_LINE_INVALID'; end if;
      line_ht:=round((r->>'quantity')::numeric*(r->>'price')::numeric,2);
      ht:=ht+line_ht; vat:=vat+round(line_ht*(r->>'tva')::numeric/100,2);
    else line_ht:=0; end if;
    execute format('insert into public.%I(%I,position,item_type,description,quantity,unit,unit_price,vat_rate,total_net) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      case p_kind when 'quote' then 'quote_items' else 'invoice_items' end,case p_kind when 'quote' then 'quote_id' else 'invoice_id' end)
      using doc_id,n,case when r->>'type'='title' then 'title' else 'item' end,r->>'name',
        case when r->>'type'='title' then 0 else (r->>'quantity')::numeric end,r->>'unit',
        case when r->>'type'='title' then 0 else (r->>'price')::numeric end,
        case when r->>'type'='title' then 0 else (r->>'tva')::numeric end,line_ht;
    n:=n+1;
  end loop;
  -- Discounts must reduce an established taxable base of the same VAT category.
  if exists(
    select 1 from jsonb_array_elements(p_data->'lines') as discount_row(value)
    where discount_row.value->>'type'='normal' group by (discount_row.value->>'tva')::numeric
    having sum(round((discount_row.value->>'quantity')::numeric*(discount_row.value->>'price')::numeric,2))<0
      or sum(round(round((discount_row.value->>'quantity')::numeric*(discount_row.value->>'price')::numeric,2)*(discount_row.value->>'tva')::numeric/100,2))<0
  ) then raise exception 'LOGIFA_DISCOUNT_EXCEEDS_RATE_BASE'; end if;
  execute format('update public.%I set total_net=$1,total_vat=$2,total_gross=$3 where id=$4',case p_kind when 'quote' then 'quotes' else 'invoices' end) using ht,vat,ht+vat,doc_id;
  if p_kind='invoice' and jsonb_typeof(p_data->'fiscal')='object' then
    update public.invoices set operation_date=nullif(p_data->'fiscal'->>'operationDate','')::date,
      due_date=nullif(p_data->'fiscal'->>'dueDate','')::date,purchase_order=nullif(p_data->'fiscal'->>'purchaseOrder',''),operation_category=nullif(p_data->'fiscal'->>'operationCategory','') where id=doc_id;
  end if;
  return jsonb_build_object('id',doc_id,'lifecycle','draft');
end $function$

;
commit;
