begin;
-- SECURITY DEFINER is limited to private transactional commands. Their purpose
-- is to deny direct ledger DML, not to bypass authorization. Every API command
-- checks both Clerk issuer and subject. No key or user ID is hard-coded.
create function logifa_private.is_admin() returns boolean language sql stable
security definer set search_path='' as $$
  select exists(select 1 from logifa_private.admin_binding b where b.enabled
    and b.clerk_subject=auth.jwt()->>'sub' and b.clerk_issuer=auth.jwt()->>'iss'
    and auth.jwt()->>'role'='authenticated');
$$;
create function logifa_private.assert_admin() returns void language plpgsql
set search_path='' as $$ begin
  if not logifa_private.is_admin() then raise exception 'LOGIFA_ADMIN_REQUIRED' using errcode='42501'; end if;
  -- Single administrator: serialize mutations to prevent concurrent allocation,
  -- refund, deduction and numbering races with one predictable lock order.
  perform 1 from logifa_private.admin_binding where singleton for update;
end $$;

create function logifa_private.credit_source(p_credit uuid) returns uuid language sql set search_path='' as $$
  select case when c.origin='historical' then v.invoice_id else c.correction_of end
    from public.invoices c left join public.historical_credit_validations v on v.credit_invoice_id=c.id where c.id=p_credit;
$$;
create function logifa_private.net_deposit_tax(p_deposit uuid)
returns table(vat_rate numeric,net_minor bigint,vat_minor bigint) language sql set search_path='' as $$
  select x.vat_rate,sum(x.net_minor)::bigint,sum(x.vat_minor)::bigint from (
    select vat_rate,round(total_net*100) as net_minor,round(total_net*vat_rate) as vat_minor from public.invoice_items where invoice_id=p_deposit
    union all
    select l.vat_rate,-round(l.total_net*100),-round(l.total_net*l.vat_rate) from public.invoice_items l join public.invoices c on c.id=l.invoice_id
      where c.document_kind='credit' and c.lifecycle in ('issued','historical') and logifa_private.credit_source(c.id)=p_deposit
  ) x group by x.vat_rate;
$$;
create function logifa_private.deduction_tax(p_final uuid)
returns table(vat_rate numeric,net_minor bigint,vat_minor bigint) language sql set search_path='' as $$
  select t.vat_rate,t.net_minor,t.vat_minor from public.deposit_deductions d
    cross join lateral logifa_private.net_deposit_tax(d.deposit_invoice_id) t where d.final_invoice_id=p_final and d.tax_snapshot is null
  union all
  select t.vat_rate,t.net_minor,t.vat_minor from public.deposit_deductions d
    cross join lateral jsonb_to_recordset(d.tax_snapshot) as t(vat_rate numeric,net_minor bigint,vat_minor bigint)
    where d.final_invoice_id=p_final and d.tax_snapshot is not null;
$$;
create function logifa_private.balance(p_invoice uuid) returns jsonb language plpgsql
set search_path='' as $$ declare i public.invoices; gross bigint; deductions bigint; credits bigint; paid bigint;
  chain_remaining bigint:=0; chain_paid bigint:=0; chain_due bigint:=0; due bigint; acquittable boolean; chain_valid boolean;
begin
  select * into strict i from public.invoices where id=p_invoice;
  gross:=round(i.total_gross*100)::bigint;
  select coalesce(sum(net_minor+vat_minor),0)::bigint into deductions from logifa_private.deduction_tax(i.id);
  select coalesce(sum(amount_minor),0)::bigint into credits from public.credit_applications where invoice_id=i.id;
  select coalesce(sum(a.amount_minor-coalesce((select sum(r.amount_minor) from public.allocation_reversals r where r.allocation_id=a.id),0)),0)::bigint
    into paid from public.payment_allocations a where a.invoice_id=i.id;
  due:=gross-deductions-credits;
  -- Each source allocation is counted once; reversals remove refunded cash.
  select coalesce(sum(greatest(0,(b->>'due_minor')::bigint-(b->>'paid_minor')::bigint)),0)::bigint,
    coalesce(sum((b->>'paid_minor')::bigint),0)::bigint,coalesce(sum((b->>'due_minor')::bigint),0)::bigint,
    coalesce(bool_and((b->>'is_acquittable')::boolean or ((b->>'due_minor')::bigint=0 and (b->>'paid_minor')::bigint=0)),true)
    into chain_remaining,chain_paid,chain_due,chain_valid from public.deposit_deductions d
    cross join lateral logifa_private.balance(d.deposit_invoice_id) b where d.final_invoice_id=i.id;
  acquittable:=i.document_kind<>'credit' and i.lifecycle in ('issued','historical')
    and due>=0 and due+chain_due>0 and paid+chain_paid>0 and paid>=due and chain_remaining=0 and chain_valid
    and not exists(select 1 from public.invoices c where c.document_kind='credit' and c.lifecycle in ('issued','historical')
      and logifa_private.credit_source(c.id)=i.id and round(c.total_gross*100)<>(select coalesce(sum(amount_minor),0) from public.credit_applications where credit_invoice_id=c.id));
  return jsonb_build_object('gross_minor',gross,'deductions_minor',deductions,'credits_minor',credits,
    'chain_remaining_minor',greatest(0,due-paid)+chain_remaining,'chain_paid_minor',paid+chain_paid,
    'is_acquittable',acquittable,'settlement_basis',case when acquittable then 'cash' when due=0 and credits>0 then 'accounting_correction' else 'outstanding' end,
    'origin',i.origin,'original_status',i.original_status,'historical_review_required',i.origin='historical',
    'due_minor',gross-deductions-credits,'paid_minor',paid,'remaining_minor',greatest(0,gross-deductions-credits-paid),
    'overpaid_minor',greatest(0,paid-(gross-deductions-credits)),
    'status',case when i.lifecycle='draft' then 'draft' when gross-deductions-credits=0 and credits>0 and paid=0 then 'credited'
      when acquittable then 'paid' when paid+chain_paid=0 then 'unpaid' else 'partially_paid' end);
end $$;
create function logifa_private.payment_available(p_payment uuid) returns bigint language sql set search_path='' as $$
  select p.amount_minor-coalesce((select sum(a.amount_minor-coalesce((select sum(r.amount_minor) from public.allocation_reversals r where r.allocation_id=a.id),0))
    from public.payment_allocations a where a.payment_id=p.id),0)-coalesce((select sum(r.amount_minor) from public.payments r where r.refund_of=p.id),0)
  from public.payments p where p.id=p_payment and p.direction='incoming';
$$;

create function logifa_private.immutable_row() returns trigger language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception 'LOGIFA_NO_DELETE'; end if;
  if tg_table_name='deposit_deductions' then
    if old.tax_snapshot is null and new.tax_snapshot is not null
      and to_jsonb(old)-'tax_snapshot'=to_jsonb(new)-'tax_snapshot'
      and exists(select 1 from public.invoices where id=new.final_invoice_id and lifecycle='draft') then return new; end if;
  end if;
  if tg_table_name='payments' and
    to_jsonb(old)-array['reconciliation_status','tax_review_status','qualification']=to_jsonb(new)-array['reconciliation_status','tax_review_status','qualification'] then return new; end if;
  raise exception 'LOGIFA_IMMUTABLE_RECORD';
end $$;
create function logifa_private.freeze_document() returns trigger language plpgsql set search_path='' as $$ begin
  if old.logifa_managed and old.lifecycle in ('issued','historical') then
    if tg_table_name='quotes' and old.status='sent' and new.status='accepted'
      and to_jsonb(old)-'status'=to_jsonb(new)-'status' then return new; end if;
    raise exception 'LOGIFA_ISSUED_DOCUMENT_IMMUTABLE';
  end if;
  return new;
end $$;
create function logifa_private.freeze_items() returns trigger language plpgsql set search_path='' as $$ declare parent_id uuid; frozen boolean;
begin
  if tg_table_name='invoice_items' then
    parent_id:=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
    select logifa_managed and lifecycle in ('issued','historical') into frozen from public.invoices where id=parent_id;
    if tg_op='UPDATE' and old.invoice_id<>new.invoice_id then raise exception 'LOGIFA_NO_REPARENT'; end if;
  else
    parent_id:=case when tg_op='DELETE' then old.quote_id else new.quote_id end;
    select logifa_managed and lifecycle in ('issued','historical') into frozen from public.quotes where id=parent_id;
    if tg_op='UPDATE' and old.quote_id<>new.quote_id then raise exception 'LOGIFA_NO_REPARENT'; end if;
  end if;
  if frozen then raise exception 'LOGIFA_ISSUED_LINES_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create function logifa_private.audit_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
  insert into public.document_events(actor_subject,event_type,table_name,record_id,data)
    values(coalesce(auth.jwt()->>'sub','database-maintenance'),lower(tg_op),tg_table_name,new.id,
      jsonb_build_object('after',to_jsonb(new),'before',case when tg_op='UPDATE' then to_jsonb(old) else null end));
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['payments','payment_allocations','allocation_reversals','deposit_deductions','credit_applications','historical_credit_validations','document_files','document_events'] loop
    execute format('create trigger logifa_immutable before update or delete on public.%I for each row execute function logifa_private.immutable_row()',t);
  end loop;
  foreach t in array array['quotes','invoices'] loop
    execute format('create trigger logifa_freeze before update on public.%I for each row execute function logifa_private.freeze_document()',t);
  end loop;
  foreach t in array array['quote_items','invoice_items'] loop
    execute format('create trigger logifa_freeze_lines before insert or update or delete on public.%I for each row execute function logifa_private.freeze_items()',t);
  end loop;
  foreach t in array array['legal_entities','issuer_profiles','document_sequences','quotes','invoices','payments','payment_allocations','allocation_reversals','deposit_deductions','credit_applications','historical_credit_validations','document_files','signature_tracking'] loop
    execute format('create trigger logifa_audit after insert or update on public.%I for each row execute function logifa_private.audit_event()',t);
  end loop;
end $$;

create function logifa_private.check_relationships() returns trigger language plpgsql security definer set search_path='' as $$
declare entity_id uuid; owner_id text; payload jsonb; client uuid; project uuid; quote uuid;
begin
  -- Serialize direct administrator mapping writes with transactional RPCs.
  perform 1 from logifa_private.admin_binding where singleton for update;
  select legacy_profile_id into owner_id from logifa_private.admin_binding where singleton;
  payload:=to_jsonb(new);
  if tg_table_name='issuer_profiles' then
    if tg_op='UPDATE' and old.legal_entity_id is distinct from new.legal_entity_id and (
      exists(select 1 from public.quotes where issuer_profile_id=new.id) or exists(select 1 from public.invoices where issuer_profile_id=new.id)
      or exists(select 1 from public.payments where issuer_profile_id=new.id) or exists(select 1 from public.projects where issuer_profile_id=new.id))
      then raise exception 'LOGIFA_REFERENCED_ISSUER_MAPPING'; end if;
    return new;
  end if;
  if tg_table_name='clients' then
    if new.user_id is distinct from owner_id then raise exception 'LOGIFA_CLIENT_OWNER'; end if;
    return new;
  end if;
  if tg_table_name='projects' and tg_op='UPDATE' then
    if (old.client_id is distinct from new.client_id or old.issuer_profile_id is distinct from new.issuer_profile_id or old.user_id is distinct from new.user_id)
      and (exists(select 1 from public.quotes where project_id=new.id) or exists(select 1 from public.invoices where project_id=new.id)
        or exists(select 1 from public.payments where project_id=new.id)) then raise exception 'LOGIFA_REFERENCED_PROJECT'; end if;
  end if;
  if tg_table_name in ('quotes','invoices') and (payload->>'logifa_managed')::boolean is not true then return new; end if;
  if payload->>'user_id' is not null and payload->>'user_id' is distinct from owner_id then raise exception 'LOGIFA_DOCUMENT_OWNER'; end if;
  client:=(payload->>'client_id')::uuid; project:=(payload->>'project_id')::uuid; quote:=(payload->>'quote_id')::uuid;
  if client is not null and not exists(select 1 from public.clients where id=client and user_id=owner_id) then raise exception 'LOGIFA_CLIENT_OWNER'; end if;
  if payload->>'issuer_profile_id' is null then return new; end if;
  select legal_entity_id into strict entity_id from public.issuer_profiles where id=(payload->>'issuer_profile_id')::uuid;
  if tg_table_name<>'projects' and entity_id is distinct from (payload->>'legal_entity_id')::uuid then raise exception 'LOGIFA_ISSUER_MAPPING'; end if;
  if project is not null and not exists(select 1 from public.projects p join public.issuer_profiles ip on ip.id=p.issuer_profile_id
    where p.id=project and p.client_id=client and ip.legal_entity_id=entity_id and p.user_id=owner_id) then raise exception 'LOGIFA_PROJECT_CONTEXT'; end if;
  if quote is not null and not exists(select 1 from public.quotes q where q.id=quote and q.client_id=client and q.legal_entity_id=entity_id
    and (project is null or q.project_id=project)) then raise exception 'LOGIFA_QUOTE_MISMATCH'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['clients','projects','issuer_profiles','quotes','invoices','payments'] loop
    execute format('create trigger logifa_relationships before insert or update on public.%I for each row execute function logifa_private.check_relationships()',t);
  end loop;
end $$;

create function logifa_private.api_validate_historical_credit(p_credit uuid,p_invoice uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare c public.invoices; i public.invoices; v public.historical_credit_validations; used numeric;
begin
  perform logifa_private.assert_admin();
  select * into strict c from public.invoices where id=p_credit;
  select * into strict i from public.invoices where id=p_invoice;
  if c.origin is distinct from 'historical' or c.document_kind is distinct from 'credit' or c.lifecycle is distinct from 'historical'
    or i.document_kind='credit' or i.lifecycle not in ('issued','historical') or c.legal_entity_id is null or c.client_id is null
    or c.legal_entity_id is distinct from i.legal_entity_id or c.client_id is distinct from i.client_id
    or (c.quote_id is not null and c.quote_id is distinct from i.quote_id) or (c.project_id is not null and c.project_id is distinct from i.project_id)
    or (c.correction_of is not null and c.correction_of is distinct from i.id) or nullif(btrim(p_reason),'') is null then raise exception 'LOGIFA_CREDIT_VALIDATION_REQUIRED'; end if;
  select * into v from public.historical_credit_validations where credit_invoice_id=c.id;
  if found then
    if v.invoice_id is distinct from i.id or v.reason is distinct from p_reason then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',v.id);
  end if;
  if exists(select 1 from public.deposit_deductions d join public.invoices f on f.id=d.final_invoice_id where d.deposit_invoice_id=i.id
    and f.lifecycle in ('issued','historical')) then raise exception 'LOGIFA_DEDUCTED_DEPOSIT_CREDIT_REQUIRES_REVIEW'; end if;
  select coalesce(sum(total_gross),0) into used from public.invoices where document_kind='credit' and lifecycle in ('issued','historical') and logifa_private.credit_source(id)=i.id;
  if c.total_gross<=0 or used+c.total_gross>i.total_gross-coalesce((select sum(net_minor+vat_minor)/100.0 from logifa_private.deduction_tax(i.id)),0) then raise exception 'LOGIFA_CREDIT_EXCEEDS_SOURCE'; end if;
  if c.total_net>(i.total_net-coalesce((select sum(net_minor)/100.0 from logifa_private.deduction_tax(i.id)),0)
      -coalesce((select sum(total_net) from public.invoices where document_kind='credit' and lifecycle in ('issued','historical') and logifa_private.credit_source(id)=i.id),0))
    or c.total_vat>(i.total_vat-coalesce((select sum(vat_minor)/100.0 from logifa_private.deduction_tax(i.id)),0)
      -coalesce((select sum(total_vat) from public.invoices where document_kind='credit' and lifecycle in ('issued','historical') and logifa_private.credit_source(id)=i.id),0))
      then raise exception 'LOGIFA_CREDIT_TAX_BREAKDOWN'; end if;
  insert into public.historical_credit_validations(credit_invoice_id,invoice_id,reason,actor_subject) values(c.id,i.id,p_reason,auth.jwt()->>'sub') returning * into v;
  return jsonb_build_object('id',v.id);
end $$;

create function logifa_private.api_context() returns jsonb language plpgsql security definer set search_path='' as $$ declare owner_id text; begin
  perform logifa_private.assert_admin();
  select legacy_profile_id into owner_id from logifa_private.admin_binding where singleton;
  return jsonb_build_object('legacy_profile_id',owner_id);
end $$;

create function logifa_private.api_save_document(p_kind text,p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
      if (r->>'quantity' ~ '^[0-9]+(\.[0-9]{1,2})?$') is not true or (r->>'price' ~ '^[0-9]+(\.[0-9]{1,2})?$') is not true
        or (r->>'tva' ~ '^[0-9]+(\.[0-9]{1,2})?$') is not true or r->>'unit' is null then raise exception 'LOGIFA_LINE_INVALID'; end if;
      if (r->>'quantity')::numeric<=0 or round((r->>'quantity')::numeric,2)<>(r->>'quantity')::numeric
        or (r->>'price')::numeric<0 or round((r->>'price')::numeric,2)<>(r->>'price')::numeric
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
  execute format('update public.%I set total_net=$1,total_vat=$2,total_gross=$3 where id=$4',case p_kind when 'quote' then 'quotes' else 'invoices' end) using ht,vat,ht+vat,doc_id;
  if p_kind='invoice' and jsonb_typeof(p_data->'fiscal')='object' then
    update public.invoices set operation_date=nullif(p_data->'fiscal'->>'operationDate','')::date,
      due_date=nullif(p_data->'fiscal'->>'dueDate','')::date,purchase_order=nullif(p_data->'fiscal'->>'purchaseOrder',''),operation_category=nullif(p_data->'fiscal'->>'operationCategory','') where id=doc_id;
  end if;
  return jsonb_build_object('id',doc_id,'lifecycle','draft');
end $$;

create function logifa_private.api_issue_document(p_kind text,p_id uuid,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
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
    if d.document_kind in ('deposit','final') and d.quote_id is null and d.project_id is null then raise exception 'LOGIFA_DEPOSIT_CONTEXT_REQUIRED'; end if;
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
      if exists(select 1 from public.invoices x where x.id<>d.id and x.document_kind='final' and x.lifecycle in ('issued','historical')
        and ((d.quote_id is not null and x.quote_id=d.quote_id) or (d.quote_id is null and d.project_id is not null and x.project_id=d.project_id)))
        then raise exception 'LOGIFA_FINAL_ALREADY_ISSUED'; end if;
      update public.deposit_deductions z set tax_snapshot=(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from logifa_private.net_deposit_tax(z.deposit_invoice_id) t)
        where z.final_invoice_id=d.id and z.tax_snapshot is null;
    end if;
  end if;
  select * into strict sequence from public.document_sequences where legal_entity_id=d.legal_entity_id and document_type=p_kind for update;
  if sequence.last_issue_date is not null and p_date<sequence.last_issue_date then raise exception 'LOGIFA_NUMBER_CHRONOLOGY'; end if;
  execute format('select max(issue_date) from public.%I where legal_entity_id=$1 and lifecycle in (''issued'',''historical'')',case p_kind when 'quote' then 'quotes' else 'invoices' end)
    into sequence.last_issue_date using d.legal_entity_id;
  if sequence.last_issue_date is not null and p_date<sequence.last_issue_date then raise exception 'LOGIFA_NUMBER_CHRONOLOGY'; end if;
  number_value:=sequence.prefix||'-'||lpad(sequence.next_value::text,12,'0');
  -- Counter and issuance commit together. A failure rolls both back: no gap.
  update public.document_sequences set next_value=next_value+1,last_issue_date=p_date where id=sequence.id;
  execute format('update public.%I set %I=$1,issue_date=$2,lifecycle=''issued'',status=''sent'',issuer_snapshot=$3 where id=$4',
    case p_kind when 'quote' then 'quotes' else 'invoices' end,case p_kind when 'quote' then 'quote_number' else 'invoice_number' end)
    using number_value,p_date,jsonb_build_object('profile',d.issuer_snapshot,'legal_entity',to_jsonb(entity)),d.id;
  update public.document_workflow set state='issued',updated_at=now() where (quote_id=d.id or invoice_id=d.id) and state='draft';
  return jsonb_build_object('id',d.id,'number',number_value);
end $$;

create function logifa_private.api_record_payment(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare issuer public.issuer_profiles; existing public.payments; result_id uuid; q public.quotes; amount bigint; duplicate_warning boolean;
begin
  perform logifa_private.assert_admin();
  amount:=(p_data->>'amount_minor')::bigint;
  select * into strict issuer from public.issuer_profiles where id=(p_data->>'issuer_profile_id')::uuid;
  if issuer.legal_entity_id is null then raise exception 'LOGIFA_PAYMENT_BENEFICIARY_REQUIRED'; end if;
  if p_data->>'quote_id' is not null then
    select * into strict q from public.quotes where id=(p_data->>'quote_id')::uuid;
    if q.client_id is distinct from (p_data->>'client_id')::uuid or q.legal_entity_id is distinct from issuer.legal_entity_id then raise exception 'LOGIFA_QUOTE_MISMATCH'; end if;
  end if;
  if p_data->>'project_id' is not null and not exists(select 1 from public.projects x join public.issuer_profiles ip on ip.id=x.issuer_profile_id where x.id=(p_data->>'project_id')::uuid
    and x.client_id=(p_data->>'client_id')::uuid and ip.legal_entity_id=issuer.legal_entity_id) then raise exception 'LOGIFA_PROJECT_MISMATCH'; end if;
  select * into existing from public.payments where idempotency_key=(p_data->>'idempotency_key')::uuid;
  if found then
    if existing.direction is distinct from 'incoming' or existing.amount_minor is distinct from amount or existing.issuer_profile_id is distinct from issuer.id
      or existing.client_id is distinct from (p_data->>'client_id')::uuid or existing.received_on is distinct from (p_data->>'received_on')::date
      or existing.method is distinct from p_data->>'method' or existing.qualification is distinct from p_data->>'qualification'
      or existing.quote_id is distinct from (p_data->>'quote_id')::uuid or existing.project_id is distinct from (p_data->>'project_id')::uuid
      or existing.bank_reference is distinct from p_data->>'bank_reference' or existing.notes is distinct from p_data->>'notes'
      then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',existing.id,'tax_review_required',existing.tax_review_status='pending');
  end if;
  select exists(select 1 from public.payments where direction='incoming' and issuer_profile_id=issuer.id
    and client_id=(p_data->>'client_id')::uuid and amount_minor=amount and received_on=(p_data->>'received_on')::date
    and method=p_data->>'method' and bank_reference is not distinct from p_data->>'bank_reference') into duplicate_warning;
  insert into public.payments(legal_entity_id,issuer_profile_id,client_id,quote_id,project_id,amount_minor,received_on,method,qualification,bank_reference,notes,idempotency_key)
    values(issuer.legal_entity_id,issuer.id,(p_data->>'client_id')::uuid,(p_data->>'quote_id')::uuid,(p_data->>'project_id')::uuid,
      amount,(p_data->>'received_on')::date,p_data->>'method',p_data->>'qualification',p_data->>'bank_reference',p_data->>'notes',(p_data->>'idempotency_key')::uuid)
    returning id into result_id;
  -- No invoice is required. Unknown VAT never blocks faithful recording of cash.
  return jsonb_build_object('id',result_id,'tax_review_required',true,'possible_duplicate',duplicate_warning);
end $$;

create function logifa_private.api_allocate_payment(p_payment uuid,p_invoice uuid,p_amount bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare p public.payments; i public.invoices; a public.payment_allocations; b jsonb;
begin
  perform logifa_private.assert_admin();
  select * into a from public.payment_allocations where idempotency_key=p_key;
  if found then
    if a.payment_id is distinct from p_payment or a.invoice_id is distinct from p_invoice or a.amount_minor is distinct from p_amount then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',a.id);
  end if;
  select * into strict p from public.payments where id=p_payment;
  select * into strict i from public.invoices where id=p_invoice;
  if p.direction<>'incoming' or i.lifecycle not in ('issued','historical') or i.document_kind='credit'
    or i.legal_entity_id is distinct from p.legal_entity_id or i.client_id is distinct from p.client_id
    or (p.quote_id is not null and p.quote_id is distinct from i.quote_id)
    or (p.project_id is not null and p.project_id is distinct from i.project_id) then raise exception 'LOGIFA_ALLOCATION_CONTEXT'; end if;
  b:=logifa_private.balance(i.id);
  if p_amount is null or p_amount<=0 or p_amount>logifa_private.payment_available(p.id)
    or p_amount>(b->>'remaining_minor')::bigint then raise exception 'LOGIFA_ALLOCATION_EXCEEDS_AVAILABLE'; end if;
  insert into public.payment_allocations(payment_id,invoice_id,amount_minor,idempotency_key) values(p.id,i.id,p_amount,p_key) returning * into a;
  return jsonb_build_object('id',a.id);
end $$;

create function logifa_private.api_link_deposit(p_final uuid,p_deposit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.invoices; d public.invoices; result_id uuid;
begin
  perform logifa_private.assert_admin();
  select * into strict f from public.invoices where id=p_final;
  select * into strict d from public.invoices where id=p_deposit;
  if f.document_kind<>'final' or f.lifecycle<>'draft' or d.document_kind<>'deposit' or d.lifecycle not in ('issued','historical')
    or f.legal_entity_id is distinct from d.legal_entity_id or f.client_id is distinct from d.client_id
    or (f.quote_id is not null and d.quote_id is not null and f.quote_id is distinct from d.quote_id)
    or (f.project_id is not null and d.project_id is not null and f.project_id is distinct from d.project_id)
    or (((f.quote_id is not null and f.quote_id=d.quote_id) or (f.project_id is not null and f.project_id=d.project_id)) is not true)
    then raise exception 'LOGIFA_DEDUCTION_CONTEXT'; end if;
  if d.origin='historical' and not exists(select 1 from public.invoice_items where invoice_id=d.id and total_net>0) then raise exception 'LOGIFA_HISTORICAL_TAX_REVIEW_REQUIRED'; end if;
  select id into result_id from public.deposit_deductions where final_invoice_id=f.id and deposit_invoice_id=d.id;
  if found then return jsonb_build_object('id',result_id); end if;
  insert into public.deposit_deductions(final_invoice_id,deposit_invoice_id) values(f.id,d.id) returning id into result_id;
  return jsonb_build_object('id',result_id);
end $$;

create function logifa_private.api_apply_credit(p_credit uuid,p_invoice uuid,p_amount bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare c public.invoices; i public.invoices; a public.credit_applications; b jsonb; used bigint;
begin
  perform logifa_private.assert_admin();
  select * into a from public.credit_applications where idempotency_key=p_key;
  if found then
    if a.credit_invoice_id is distinct from p_credit or a.invoice_id is distinct from p_invoice or a.amount_minor is distinct from p_amount then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',a.id);
  end if;
  select * into strict c from public.invoices where id=p_credit;
  select * into strict i from public.invoices where id=p_invoice;
  if c.document_kind<>'credit' or c.lifecycle not in ('issued','historical') or i.document_kind='credit'
    or i.lifecycle not in ('issued','historical') or logifa_private.credit_source(c.id) is distinct from i.id
    or c.legal_entity_id is null or c.client_id is null
    or c.legal_entity_id is distinct from i.legal_entity_id or c.client_id is distinct from i.client_id
    or (c.quote_id is not null and c.quote_id is distinct from i.quote_id) or (c.project_id is not null and c.project_id is distinct from i.project_id) then raise exception 'LOGIFA_CREDIT_CONTEXT'; end if;
  select coalesce(sum(amount_minor),0) into used from public.credit_applications where credit_invoice_id=c.id;
  b:=logifa_private.balance(i.id);
  if p_amount is null or p_amount<=0 or used+p_amount>round(c.total_gross*100)::bigint or p_amount>(b->>'due_minor')::bigint then raise exception 'LOGIFA_CREDIT_EXCEEDS_AVAILABLE'; end if;
  insert into public.credit_applications(credit_invoice_id,invoice_id,amount_minor,idempotency_key) values(c.id,i.id,p_amount,p_key) returning * into a;
  return jsonb_build_object('id',a.id);
end $$;

create function logifa_private.api_refund_payment(p_payment uuid,p_amount bigint,p_date date,p_method text,p_key uuid,p_allocation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$ declare p public.payments; r public.payments; a public.payment_allocations; available bigint; reversed bigint; needed bigint;
begin
  perform logifa_private.assert_admin();
  select * into r from public.payments where idempotency_key=p_key;
  if found then
    if r.direction is distinct from 'refund' or r.refund_of is distinct from p_payment or r.amount_minor is distinct from p_amount or r.received_on is distinct from p_date or r.method is distinct from p_method
      or (select allocation_id from public.allocation_reversals where refund_payment_id=r.id) is distinct from p_allocation then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',r.id);
  end if;
  select * into strict p from public.payments where id=p_payment and direction='incoming';
  available:=logifa_private.payment_available(p.id); needed:=greatest(0,p_amount-available);
  if p_amount is null or p_amount<=0 or p_date is null or not isfinite(p_date) or p_date<p.received_on or nullif(btrim(p_method),'') is null then raise exception 'LOGIFA_REFUND_INPUT'; end if;
  if needed>0 then
    select * into strict a from public.payment_allocations where id=p_allocation and payment_id=p.id;
    select coalesce(sum(amount_minor),0) into reversed from public.allocation_reversals where allocation_id=a.id;
    if needed>a.amount_minor-reversed then raise exception 'LOGIFA_REFUND_EXCEEDS_ALLOCATION'; end if;
  elsif p_allocation is not null then raise exception 'LOGIFA_REFUND_UNUSED_NO_ALLOCATION'; end if;
  insert into public.payments(legal_entity_id,issuer_profile_id,client_id,amount_minor,received_on,method,qualification,direction,refund_of,idempotency_key)
    values(p.legal_entity_id,p.issuer_profile_id,p.client_id,p_amount,p_date,p_method,'unqualified','refund',p.id,p_key) returning * into r;
  if needed>0 then insert into public.allocation_reversals(allocation_id,refund_payment_id,amount_minor) values(a.id,r.id,needed); end if;
  if logifa_private.payment_available(p.id)<0 then raise exception 'LOGIFA_REFUND_EXCEEDS_PAYMENT'; end if;
  return jsonb_build_object('id',r.id);
end $$;

create function logifa_private.api_invoice_balance(p_invoice uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform logifa_private.assert_admin(); return logifa_private.balance(p_invoice);
end $$;
create function logifa_private.api_payment_status(p_payment uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare p public.payments; allocated bigint; billed bigint; begin
  perform logifa_private.assert_admin(); select * into strict p from public.payments where id=p_payment;
  select coalesce(sum(a.amount_minor-coalesce((select sum(amount_minor) from public.allocation_reversals where allocation_id=a.id),0)),0),
    coalesce(sum(case when i.document_kind='deposit' then a.amount_minor-coalesce((select sum(amount_minor) from public.allocation_reversals where allocation_id=a.id),0) else 0 end),0)
    into allocated,billed from public.payment_allocations a join public.invoices i on i.id=a.invoice_id where a.payment_id=p.id;
  return jsonb_build_object('id',p.id,'unallocated_minor',logifa_private.payment_available(p.id),'allocated_minor',allocated,
    'deposit_invoiced_minor',billed,'tax_review_status',p.tax_review_status,'qualification',p.qualification,'direction',p.direction,
    'billing_status',case when allocated=0 then 'unbilled' when logifa_private.payment_available(p.id)>0 then 'partially_billed' else 'billed' end);
end $$;

create function logifa_private.api_import_document(p_kind text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare issuer public.issuer_profiles; owner_id text; existing record; doc_id uuid; ht numeric; vat numeric; extra_cols text; extra_values text;
begin
  perform logifa_private.assert_admin();
  if p_kind is null or p_kind not in ('invoice','quote') or nullif(btrim(p_data->>'number'),'') is null or p_data->>'original_status' is null then raise exception 'LOGIFA_HISTORY_INPUT'; end if;
  select * into strict issuer from public.issuer_profiles where id=(p_data->>'issuer_profile_id')::uuid;
  select legacy_profile_id into owner_id from logifa_private.admin_binding where singleton;
  execute format('select id,historical_metadata from public.%I where import_key=$1',case p_kind when 'quote' then 'quotes' else 'invoices' end)
    into existing using (p_data->>'import_key')::uuid;
  if existing.id is not null then
    if existing.historical_metadata<>p_data then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',existing.id);
  end if;
  if p_data->>'total_net' !~ '^[0-9]+(\.[0-9]{1,2})?$' or p_data->>'total_vat' !~ '^[0-9]+(\.[0-9]{1,2})?$'
    or p_data->>'total_gross' !~ '^[0-9]+(\.[0-9]{1,2})?$' or not isfinite((p_data->>'issue_date')::date) then raise exception 'LOGIFA_HISTORY_TOTALS'; end if;
  ht:=(p_data->>'total_net')::numeric; vat:=(p_data->>'total_vat')::numeric;
  if ht is null or vat is null or ht<0 or vat<0 or round(ht,2)<>ht or round(vat,2)<>vat or ht+vat is distinct from (p_data->>'total_gross')::numeric then raise exception 'LOGIFA_HISTORY_TOTALS'; end if;
  extra_cols:=case when p_kind='invoice' then ',document_kind,quote_id,correction_of' else '' end;
  extra_values:=case when p_kind='invoice' then ',coalesce($15->>''document_kind'',''classic''),($15->>''quote_id'')::uuid,($15->>''correction_of'')::uuid' else '' end;
  doc_id:=gen_random_uuid();
  execute format('insert into public.%I(id,user_id,%I,issue_date,status,logifa_managed,issuer_profile_id,legal_entity_id,origin,lifecycle,
    issuer_snapshot,client_snapshot,historical_metadata,original_status,import_key,total_net,total_vat,total_gross,client_id,project_id%s)
    values($1,$2,$3,$4,''sent'',true,$5,$6,''historical'',''historical'',$7,$8,$9,$10,$11,$12,$13,$14,($15->>''client_id'')::uuid,($15->>''project_id'')::uuid%s)',
    case p_kind when 'quote' then 'quotes' else 'invoices' end,case p_kind when 'quote' then 'quote_number' else 'invoice_number' end,extra_cols,extra_values)
    using doc_id,owner_id,p_data->>'number',(p_data->>'issue_date')::date,issuer.id,issuer.legal_entity_id,
      coalesce(p_data->'issuer_snapshot',to_jsonb(issuer)),coalesce(p_data->'client_snapshot','{}'::jsonb),p_data,
      p_data->>'original_status',(p_data->>'import_key')::uuid,ht,vat,ht+vat,p_data;
  -- The input records the explicitly chosen kind and source links; no inference.
  return jsonb_build_object('id',doc_id,'original_number',p_data->>'number');
end $$;

create function logifa_private.api_register_file(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result_id uuid; entity_id uuid; doc_id uuid; column_name text; b jsonb; existing public.document_files;
begin
  perform logifa_private.assert_admin();
  if num_nonnulls(p_data->>'invoice_id',p_data->>'quote_id',p_data->>'project_id',p_data->>'payment_id')<>1 then raise exception 'LOGIFA_FILE_PARENT'; end if;
  if p_data->>'invoice_id' is not null then
    doc_id:=(p_data->>'invoice_id')::uuid; column_name:='invoice';
    select legal_entity_id into strict entity_id from public.invoices where id=doc_id and lifecycle in ('issued','historical');
    if p_data->>'role'='paid_version' then
      b:=logifa_private.balance(doc_id);
      if (b->>'is_acquittable')::boolean is not true then raise exception 'LOGIFA_NOT_FULLY_PAID'; end if;
      if not exists(select 1 from public.document_files where invoice_id=doc_id and role='original') then raise exception 'LOGIFA_ORIGINAL_REQUIRED'; end if;
    end if;
  elsif p_data->>'quote_id' is not null then
    doc_id:=(p_data->>'quote_id')::uuid; column_name:='quote';
    select legal_entity_id into strict entity_id from public.quotes where id=doc_id and lifecycle in ('issued','historical');
  elsif p_data->>'payment_id' is not null then
    doc_id:=(p_data->>'payment_id')::uuid; column_name:='payment';
    select legal_entity_id into strict entity_id from public.payments where id=doc_id;
  else
    doc_id:=(p_data->>'project_id')::uuid; column_name:='project';
    select p.legal_entity_id into strict entity_id from public.projects x join public.issuer_profiles p on p.id=x.issuer_profile_id where x.id=doc_id;
  end if;
  if entity_id is null or p_data->>'storage_path' !~ ('^'||entity_id::text||'/'||column_name||'/'||doc_id::text||'/[a-f0-9-]{36}\.pdf$') then raise exception 'LOGIFA_STORAGE_PATH'; end if;
  if not exists(select 1 from storage.objects where bucket_id='logifa-documents' and name=p_data->>'storage_path') then raise exception 'LOGIFA_STORAGE_OBJECT_REQUIRED'; end if;
  select * into existing from public.document_files where storage_path=p_data->>'storage_path';
  if found then
    if existing.sha256 is distinct from p_data->>'sha256' or existing.byte_size is distinct from (p_data->>'byte_size')::bigint
      or existing.role is distinct from p_data->>'role' or existing.original_filename is distinct from p_data->>'original_filename'
      or existing.metadata is distinct from coalesce(p_data->'metadata','{}'::jsonb) then raise exception 'LOGIFA_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',existing.id);
  end if;
  insert into public.document_files(quote_id,invoice_id,project_id,payment_id,role,storage_path,sha256,byte_size,original_filename,metadata)
    values((p_data->>'quote_id')::uuid,(p_data->>'invoice_id')::uuid,(p_data->>'project_id')::uuid,(p_data->>'payment_id')::uuid,
      p_data->>'role',p_data->>'storage_path',p_data->>'sha256',(p_data->>'byte_size')::bigint,p_data->>'original_filename',
      coalesce(p_data->'metadata','{}'::jsonb)) returning id into result_id;
  return jsonb_build_object('id',result_id);
end $$;

create function logifa_private.api_record_signature(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ declare result_id uuid; evidence uuid;
begin
  perform logifa_private.assert_admin();
  if p_data->>'status'='signed' and not exists(select 1 from public.document_files where id=(p_data->>'signed_file_id')::uuid
    and quote_id=(p_data->>'quote_id')::uuid and role='signed') then raise exception 'LOGIFA_SIGNATURE_FILE'; end if;
  for evidence in select value::text::uuid from jsonb_array_elements_text(coalesce(p_data->'evidence_file_ids','[]')) loop
    if not exists(select 1 from public.document_files where id=evidence and quote_id=(p_data->>'quote_id')::uuid and role='proof') then raise exception 'LOGIFA_SIGNATURE_EVIDENCE'; end if;
  end loop;
  insert into public.signature_tracking(quote_id,provider,external_reference,status,sent_at,signed_at,signer_identity,signed_file_id,evidence_file_ids)
    values((p_data->>'quote_id')::uuid,p_data->>'provider',p_data->>'external_reference',p_data->>'status',
      (p_data->>'sent_at')::timestamptz,(p_data->>'signed_at')::timestamptz,p_data->'signer_identity',(p_data->>'signed_file_id')::uuid,
      array(select value::uuid from jsonb_array_elements_text(coalesce(p_data->'evidence_file_ids','[]')))) returning id into result_id;
  return jsonb_build_object('id',result_id);
end $$;
create function logifa_private.api_accept_quote(p_quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform logifa_private.assert_admin();
  update public.quotes set status='accepted' where id=p_quote and lifecycle in ('issued','historical') and status='sent';
  if not found and not exists(select 1 from public.quotes where id=p_quote and status='accepted') then raise exception 'LOGIFA_ISSUED_QUOTE_REQUIRED'; end if;
  return jsonb_build_object('id',p_quote,'status','accepted');
end $$;
create function logifa_private.api_review_payment(p_payment uuid,p_reconciliation text,p_tax text) returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform logifa_private.assert_admin();
  update public.payments set reconciliation_status=p_reconciliation,tax_review_status=p_tax where id=p_payment;
  if not found then raise exception 'LOGIFA_PAYMENT_REQUIRED'; end if;
  return jsonb_build_object('id',p_payment);
end $$;
create function logifa_private.api_qualify_payment(p_payment uuid,p_qualification text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$ begin
  perform logifa_private.assert_admin();
  if nullif(btrim(p_reason),'') is null then raise exception 'LOGIFA_QUALIFICATION_REASON'; end if;
  update public.payments set qualification=p_qualification where id=p_payment and direction='incoming';
  if not found then raise exception 'LOGIFA_PAYMENT_REQUIRED'; end if;
  insert into public.document_events(actor_subject,event_type,table_name,record_id,data)
    values(auth.jwt()->>'sub','qualification_reviewed','payments',p_payment,jsonb_build_object('reason',p_reason,'qualification',p_qualification));
  return jsonb_build_object('id',p_payment);
end $$;
create function logifa_private.api_invoice_tax_breakdown(p_invoice uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
  perform logifa_private.assert_admin();
  if not exists(select 1 from public.invoices where id=p_invoice) then raise exception 'LOGIFA_INVOICE_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
    select vat_rate,sum(net_minor)::bigint as net_minor,sum(vat_minor)::bigint as vat_minor,
      (sum(net_minor)+sum(vat_minor))::bigint as gross_minor
    from (
      select vat_rate,round(total_net*100) as net_minor,round(total_net*vat_rate)::numeric as vat_minor
        from public.invoice_items where invoice_id=p_invoice
      union all
      select vat_rate,-net_minor,-vat_minor from logifa_private.deduction_tax(p_invoice)
    ) lines group by vat_rate order by vat_rate
  ) r;
  return jsonb_build_object('invoice_id',p_invoice,'tax_breakdown',result,
    'accounting_sign',case when (select document_kind from public.invoices where id=p_invoice)='credit' then -1 else 1 end);
end $$;
create function logifa_private.scope_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb:=to_jsonb(new); ip uuid; c uuid; ref uuid; linked uuid;
begin
  perform 1 from logifa_private.admin_binding where singleton for update;
  if tg_table_name='clients' then
    if tg_op='UPDATE' and old.issuer_profile_id is distinct from new.issuer_profile_id and (
      exists(select 1 from public.quotes where client_id=old.id) or exists(select 1 from public.invoices where client_id=old.id)
      or exists(select 1 from public.payments where client_id=old.id) or exists(select 1 from public.projects where client_id=old.id))
      then raise exception 'LOGIFA_CLIENT_REASSIGNMENT_REQUIRES_REVIEW'; end if;
    return new;
  end if;
  if tg_table_name in ('quotes','invoices') then
    if not new.logifa_managed then return new; end if;
  end if;
  ip:=(d->>'issuer_profile_id')::uuid; c:=(d->>'client_id')::uuid;
  if c is null and d->>'origin'='historical' then return new; end if;
  if ip is null and c is null then return new; end if; -- initial empty draft row inside checked RPC
  if ip is null or c is null or not exists(select 1 from public.clients where id=c and issuer_profile_id=ip)
    then raise exception 'LOGIFA_CLIENT_ISSUER_MISMATCH'; end if;
  if tg_table_name in ('quotes','invoices','projects') then
    if not exists(select 1 from public.issuer_profiles where id=ip and active) then raise exception 'LOGIFA_ISSUER_INACTIVE'; end if;
    if tg_op='INSERT' or d->>'lifecycle'='draft' then
      if exists(select 1 from public.clients where id=c and archived_at is not null) then raise exception 'LOGIFA_CLIENT_ARCHIVED'; end if;
    end if;
  elsif tg_table_name='payments' and tg_op='INSERT' and d->>'direction'='incoming' then
    if not exists(select 1 from public.issuer_profiles where id=ip and active) then raise exception 'LOGIFA_ISSUER_INACTIVE'; end if;
  end if;
  if d->>'project_id' is not null and not exists(select 1 from public.projects where id=(d->>'project_id')::uuid and issuer_profile_id=ip and client_id=c)
    then raise exception 'LOGIFA_PROJECT_ISSUER_MISMATCH'; end if;
  if tg_table_name in ('invoices','payments') and d->>'quote_id' is not null and not exists(
    select 1 from public.quotes where id=(d->>'quote_id')::uuid and issuer_profile_id=ip and client_id=c)
    then raise exception 'LOGIFA_QUOTE_ISSUER_MISMATCH'; end if;
  if tg_table_name='invoices' and d->>'correction_of' is not null and not exists(
    select 1 from public.invoices where id=(d->>'correction_of')::uuid and issuer_profile_id=ip and client_id=c)
    then raise exception 'LOGIFA_CREDIT_ISSUER_MISMATCH'; end if;
  if tg_table_name='invoices' and d->>'quote_id' is not null and exists(select 1 from public.document_workflow
    where quote_id=(d->>'quote_id')::uuid and state in ('declined','expired','cancelled')) then raise exception 'LOGIFA_QUOTE_UNAVAILABLE'; end if;
  return new;
end $$;
revoke execute on function logifa_private.scope_guard() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['clients','projects','quotes','invoices','payments'] loop
    execute format('create trigger logifa_scope before insert or update on public.%I for each row execute function logifa_private.scope_guard()',t);
  end loop;
end $$;

create function logifa_private.api_workspace(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id text; id_value uuid; issuer uuid; entity uuid; c uuid; kind text; doc uuid; result jsonb; state_value text;
  prefix_value text; doc_row jsonb; revision_value bigint;
begin
  perform logifa_private.assert_admin();
  select legacy_profile_id into owner_id from logifa_private.admin_binding where singleton;
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'LOGIFA_INPUT'; end if;
  issuer:=(p_data->>'issuer_id')::uuid;
  if p_action='health' then
    return jsonb_build_object('schema_version',4,'legacy_profile_id',owner_id);
  elsif p_action='import-profile' then
    if (p_data->>'source_key' ~ '^local/company/position-[0-9]{4}$') is not true or
      (p_data->>'source_fingerprint' ~ '^[a-f0-9]{64}$') is not true then raise exception 'LOGIFA_IMPORT_SOURCE_REQUIRED'; end if;
    select id,source_fingerprint into id_value,prefix_value from public.issuer_profiles where source_key=p_data->>'source_key';
    if id_value is not null then
      if prefix_value is distinct from p_data->>'source_fingerprint' then raise exception 'LOGIFA_COMPANY_IMPORT_REVIEW_REQUIRED'; end if;
      return jsonb_build_object('id',id_value,'preserved',true);
    end if;
    insert into public.issuer_profiles(source_key,source_fingerprint,source_local_id,commercial_name,source_siret,address,city_zip,phone,email,logo_path,color,metadata)
      values(p_data->>'source_key',p_data->>'source_fingerprint',(p_data->>'source_local_id')::integer,p_data->>'commercial_name',p_data->>'source_siret',p_data->>'address',p_data->>'city_zip',p_data->>'phone',p_data->>'email',p_data->>'logo_path',p_data->>'color',coalesce(p_data->'metadata','{}')) returning id into id_value;
    return jsonb_build_object('id',id_value,'preserved',false);
  elsif p_action='legal' then
    id_value:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
    if nullif(btrim(p_data->>'legal_name'),'') is null then raise exception 'LOGIFA_LEGAL_NAME_REQUIRED'; end if;
    if coalesce((p_data->>'reviewed')::boolean,false) and (p_data->>'vat_regime'='unknown' or p_data->>'vat_exigibility'='unknown' or nullif(p_data->>'siret','') is null)
      then raise exception 'LOGIFA_FISCAL_REVIEW_REQUIRED'; end if;
    insert into public.legal_entities(id,legal_name,siret,siren,legal_status,address,contacts,vat_regime,vat_exigibility,default_vat_rate,vat_number,iban,bic,bank_name,insurance,legal_mentions,reviewed)
    values(id_value,p_data->>'legal_name',p_data->>'siret',p_data->>'siren',p_data->>'legal_status',coalesce(p_data->'address','{}'),coalesce(p_data->'contacts','{}'),
      coalesce(p_data->>'vat_regime','unknown'),coalesce(p_data->>'vat_exigibility','unknown'),nullif(p_data->>'default_vat_rate','')::numeric,
      p_data->>'vat_number',p_data->>'iban',p_data->>'bic',p_data->>'bank_name',coalesce(p_data->'insurance','[]'),coalesce(p_data->'legal_mentions','{}'),coalesce((p_data->>'reviewed')::boolean,false))
    on conflict(id) do update set legal_name=excluded.legal_name,siret=excluded.siret,siren=excluded.siren,legal_status=excluded.legal_status,
      address=excluded.address,contacts=excluded.contacts,vat_regime=excluded.vat_regime,vat_exigibility=excluded.vat_exigibility,
      default_vat_rate=excluded.default_vat_rate,vat_number=excluded.vat_number,iban=excluded.iban,bic=excluded.bic,bank_name=excluded.bank_name,
      insurance=excluded.insurance,legal_mentions=excluded.legal_mentions,reviewed=excluded.reviewed;
    foreach kind in array array['quote','invoice'] loop
      prefix_value:=p_data->>(kind||'_prefix');
      if prefix_value is not null then
        if exists(select 1 from public.document_sequences where legal_entity_id=id_value and document_type=kind and next_value>1 and prefix<>prefix_value)
          then raise exception 'LOGIFA_SEQUENCE_PREFIX_IMMUTABLE'; end if;
        insert into public.document_sequences(legal_entity_id,document_type,prefix) values(id_value,kind,prefix_value)
          on conflict(legal_entity_id,document_type) do update set prefix=excluded.prefix;
      end if;
    end loop;
    return jsonb_build_object('id',id_value);
  elsif p_action='issuer' then
    if nullif(btrim(p_data->>'commercial_name'),'') is null then raise exception 'LOGIFA_NAME_REQUIRED'; end if;
    id_value:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
    insert into public.issuer_profiles(id,legal_entity_id,commercial_name,address,city_zip,phone,email,website,source_siret,logo_path,color)
      values(id_value,(p_data->>'legal_entity_id')::uuid,p_data->>'commercial_name',p_data->>'address',p_data->>'city_zip',p_data->>'phone',p_data->>'email',p_data->>'website',p_data->>'source_siret',p_data->>'logo_path',p_data->>'color')
    on conflict(id) do update set legal_entity_id=excluded.legal_entity_id,commercial_name=excluded.commercial_name,address=excluded.address,
      city_zip=excluded.city_zip,phone=excluded.phone,email=excluded.email,website=excluded.website,source_siret=excluded.source_siret,logo_path=excluded.logo_path,color=excluded.color;
    return jsonb_build_object('id',id_value);
  elsif p_action='deactivate-issuer' then
    if p_data->>'confirmation' is distinct from 'DESACTIVER' then raise exception 'LOGIFA_CONFIRMATION_REQUIRED'; end if;
    update public.issuer_profiles set active=false where id=issuer;
    return jsonb_build_object('id',issuer,'active',false);
  elsif p_action='client' then
    if p_data->>'client_kind' is null or p_data->>'client_kind' not in ('individual','professional') then raise exception 'LOGIFA_CLIENT_KIND_REQUIRED'; end if;
    if not exists(select 1 from public.issuer_profiles where id=issuer and active) then raise exception 'LOGIFA_ISSUER_REQUIRED'; end if;
    id_value:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from public.clients where id=id_value and issuer_profile_id is distinct from issuer) then raise exception 'LOGIFA_CLIENT_ISSUER_MISMATCH'; end if;
    if nullif(btrim(p_data->>'company_name'),'') is null then raise exception 'LOGIFA_CLIENT_NAME_REQUIRED'; end if;
    insert into public.clients(id,user_id,issuer_profile_id,company_name,client_kind,contact_email,phone,siret,vat_number,billing_address,work_address,addresses,editor_fields)
      values(id_value,owner_id,issuer,p_data->>'company_name',coalesce(p_data->>'client_kind','professional'),p_data->>'contact_email',p_data->>'phone',p_data->>'siret',p_data->>'vat_number',
        coalesce(p_data->>'billing_address',''),coalesce(p_data->>'work_address',''),coalesce(p_data->'addresses','[]'),coalesce(p_data->'editor_fields','{}'))
    on conflict(id) do update set company_name=excluded.company_name,client_kind=excluded.client_kind,contact_email=excluded.contact_email,phone=excluded.phone,
      siret=excluded.siret,vat_number=excluded.vat_number,billing_address=excluded.billing_address,work_address=excluded.work_address,addresses=excluded.addresses,editor_fields=excluded.editor_fields;
    return jsonb_build_object('id',id_value);
  elsif p_action='archive-client' then
    update public.clients set archived_at=now() where id=(p_data->>'id')::uuid and issuer_profile_id=issuer;
    if not found then raise exception 'LOGIFA_CLIENT_ISSUER_MISMATCH'; end if;
    return jsonb_build_object('id',p_data->>'id');
  elsif p_action='project' then
    c:=(p_data->>'client_id')::uuid;
    if not exists(select 1 from public.clients where id=c and issuer_profile_id=issuer) then raise exception 'LOGIFA_CLIENT_ISSUER_MISMATCH'; end if;
    id_value:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from public.projects where id=id_value and issuer_profile_id is distinct from issuer) then raise exception 'LOGIFA_PROJECT_ISSUER_MISMATCH'; end if;
    insert into public.projects(id,user_id,issuer_profile_id,client_id,name,project_code)
      values(id_value,owner_id,issuer,c,p_data->>'name',p_data->>'project_code')
      on conflict(id) do update set name=excluded.name;
    return jsonb_build_object('id',id_value);
  elsif p_action='save' then
    kind:=p_data->>'kind';
    result:=logifa_private.api_save_document(kind,(p_data->>'id')::uuid,p_data->'document');
    doc:=(result->>'id')::uuid;
    if kind='invoice' then
      update public.invoices set operation_date=nullif(p_data->'payload'->'fiscal'->>'operationDate','')::date,
        due_date=nullif(p_data->'payload'->'fiscal'->>'dueDate','')::date,purchase_order=nullif(p_data->'payload'->'fiscal'->>'purchaseOrder',''),operation_category=nullif(p_data->'payload'->'fiscal'->>'operationCategory','') where id=doc;
    end if;
    if jsonb_typeof(p_data->'payload'->'client')='object' then
      execute format('update public.%I set client_snapshot=client_snapshot||jsonb_build_object(''editor_fields'',$1) where id=$2',
        case kind when 'quote' then 'quotes' else 'invoices' end) using p_data->'payload'->'client',doc;
    end if;
    -- Keep the administrator's explicit document fields in the immutable client snapshot,
    -- without silently rewriting the client's master record.
    if jsonb_typeof(p_data->'payload'->'client')='object' then
      execute format('update public.%I set client_snapshot=client_snapshot||jsonb_build_object(''editor_fields'',$1) where id=$2',
        case kind when 'quote' then 'quotes' else 'invoices' end) using p_data->'payload'->'client',doc;
    end if;
    select revision into revision_value from public.editor_drafts where quote_id=doc or invoice_id=doc;
    if revision_value is not null and (p_data->>'revision')::bigint is distinct from revision_value then raise exception 'LOGIFA_DRAFT_CONFLICT'; end if;
    if revision_value is null then
      insert into public.editor_drafts(quote_id,invoice_id,payload) values(case when kind='quote' then doc end,case when kind='invoice' then doc end,p_data->'payload');
      insert into public.document_workflow(quote_id,invoice_id) values(case when kind='quote' then doc end,case when kind='invoice' then doc end);
    else
      update public.editor_drafts set payload=p_data->'payload',revision=revision+1,updated_at=now() where quote_id=doc or invoice_id=doc;
    end if;
    return result||jsonb_build_object('revision',coalesce(revision_value,0)+1);
  elsif p_action in ('workflow','delete-draft') then
    kind:=p_data->>'kind'; doc:=(p_data->>'id')::uuid;
    if kind not in ('quote','invoice') or kind is null then raise exception 'LOGIFA_DOCUMENT_KIND'; end if;
    execute format('select to_jsonb(d) from public.%I d where id=$1 and issuer_profile_id=$2',case kind when 'quote' then 'quotes' else 'invoices' end) into doc_row using doc,issuer;
    if doc_row is null then raise exception 'LOGIFA_DOCUMENT_NOT_FOUND'; end if;
    if p_action='delete-draft' then
      if kind<>'quote' or doc_row->>'lifecycle' is distinct from 'draft' or doc_row->>'quote_number' is not null or
        exists(select 1 from public.document_workflow where quote_id=doc and state<>'draft') or
        exists(select 1 from public.invoices where quote_id=doc) or exists(select 1 from public.payments where quote_id=doc) or
        exists(select 1 from public.document_files where quote_id=doc) or exists(select 1 from public.signature_tracking where quote_id=doc)
        then raise exception 'LOGIFA_DELETE_BLOCKED'; end if;
      if p_data->>'confirmation' is distinct from 'SUPPRIMER' then raise exception 'LOGIFA_CONFIRMATION_REQUIRED'; end if;
      insert into public.document_events(actor_subject,event_type,table_name,record_id,data) values(auth.jwt()->>'sub','delete-draft','quotes',doc,doc_row);
      delete from public.editor_drafts where quote_id=doc; delete from public.document_workflow where quote_id=doc;
      delete from public.quote_items where quote_id=doc; delete from public.quotes where id=doc;
    else
      state_value:=p_data->>'state';
      if state_value is null or state_value not in ('sent','accepted','declined','expired','archived','cancelled') then raise exception 'LOGIFA_WORKFLOW_STATE'; end if;
      if state_value in ('sent','accepted','declined','expired') and (kind<>'quote' or doc_row->>'lifecycle' is distinct from 'issued') then raise exception 'LOGIFA_ISSUED_QUOTE_REQUIRED'; end if;
      if state_value='accepted' then perform logifa_private.api_accept_quote(doc); end if;
      if state_value in ('archived','cancelled','declined') and nullif(btrim(p_data->>'reason'),'') is null then raise exception 'LOGIFA_REASON_REQUIRED'; end if;
      insert into public.document_workflow(quote_id,invoice_id,state,reason) values(case when kind='quote' then doc end,case when kind='invoice' then doc end,state_value,p_data->>'reason')
        on conflict do nothing;
      update public.document_workflow set state=state_value,reason=p_data->>'reason',updated_at=now() where quote_id=doc or invoice_id=doc;
    end if;
    return jsonb_build_object('id',doc);
  end if;
  raise exception 'LOGIFA_ACTION_NOT_ALLOWED';
end $$;
revoke execute on function logifa_private.api_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function logifa_private.api_workspace(text,jsonb) to authenticated;

do $$declare t text;begin foreach t in array array['editor_drafts','document_workflow','clients','projects'] loop execute format('create trigger logifa_audit_workspace after insert or update on public.%I for each row execute function logifa_private.audit_event()',t);end loop;end $$;
create function logifa_private.api_mail(p_action text,p_issuer uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare account logifa_private.mail_accounts; job logifa_private.mail_outbox; doc jsonb; source_table text; token uuid;
begin
  perform logifa_private.assert_admin();
  if not exists(select 1 from public.issuer_profiles where id=p_issuer) then raise exception 'LOGIFA_ISSUER_REQUIRED'; end if;
  select * into account from logifa_private.mail_accounts where issuer_profile_id=p_issuer for update;
  if p_action='state' then
    return jsonb_build_object('configured',account.issuer_profile_id is not null,'sender_name',account.sender_name,'from_email',account.from_email,
      'reply_to',account.reply_to,'domain',account.domain,'signature',account.signature,'default_subject',account.default_subject,'default_body',account.default_body,
      'domain_status',account.domain_status,'verified_at',account.verified_at,'key_version',account.key_version,
      'history',(select coalesce(jsonb_agg(to_jsonb(x)-'claim_token'),'[]') from (select * from logifa_private.mail_outbox where issuer_profile_id=p_issuer order by created_at desc limit 100) x));
  elsif p_action='credentials' then
    if account.issuer_profile_id is null then raise exception 'LOGIFA_MAIL_NOT_CONFIGURED'; end if;
    return to_jsonb(account); -- ciphertext only; decryption requires the server's external master key
  elsif p_action='configure' then
    if nullif(p_data->>'sender_name','') is null or nullif(p_data->>'from_email','') is null or nullif(p_data->>'reply_to','') is null or nullif(p_data->>'domain','') is null then raise exception 'LOGIFA_MAIL_CONFIGURATION'; end if;
    if p_data->'encrypted_key' is null and account.issuer_profile_id is null then raise exception 'LOGIFA_MAIL_KEY_REQUIRED'; end if;
    if p_data->'encrypted_key' is not null and (jsonb_typeof(p_data->'encrypted_key') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(p_data->'encrypted_key') k where k not in ('v','nonce','tag','data'))
      or p_data->'encrypted_key'->>'v' is distinct from '1' or nullif(p_data->'encrypted_key'->>'data','') is null) then raise exception 'LOGIFA_MAIL_ENCRYPTED_KEY_REQUIRED'; end if;
    insert into logifa_private.mail_accounts(issuer_profile_id,encrypted_key,key_version,sender_name,from_email,reply_to,domain,signature,default_subject,default_body)
      values(p_issuer,coalesce(p_data->'encrypted_key',account.encrypted_key),coalesce(account.key_version,0)+1,p_data->>'sender_name',p_data->>'from_email',p_data->>'reply_to',p_data->>'domain',coalesce(p_data->>'signature',''),coalesce(p_data->>'default_subject',''),coalesce(p_data->>'default_body',''))
    on conflict(issuer_profile_id) do update set encrypted_key=excluded.encrypted_key,key_version=excluded.key_version,sender_name=excluded.sender_name,
      from_email=excluded.from_email,reply_to=excluded.reply_to,domain=excluded.domain,signature=excluded.signature,default_subject=excluded.default_subject,default_body=excluded.default_body,
      domain_status='pending',verified_at=null,updated_at=now();
    insert into public.document_events(actor_subject,event_type,table_name,record_id,data) values(auth.jwt()->>'sub','mail-configured','issuer_profiles',p_issuer,
      jsonb_build_object('key_rotated',p_data->'encrypted_key' is not null,'configuration_changed',true));
    return jsonb_build_object('configured',true,'domain_status','pending');
  elsif p_action='verified' then
    if account.key_version is distinct from (p_data->>'key_version')::integer then raise exception 'LOGIFA_MAIL_CONFIG_CHANGED'; end if;
    if p_data->>'status' is null or p_data->>'status' not in ('verified','failed') then raise exception 'LOGIFA_MAIL_CONFIGURATION'; end if;
    update logifa_private.mail_accounts set domain_status=p_data->>'status',verified_at=case when p_data->>'status'='verified' then now() end where issuer_profile_id=p_issuer;
    return jsonb_build_object('domain_status',p_data->>'status');
  elsif p_action='claim' then
    if account.domain_status is distinct from 'verified' or account.key_version is distinct from (p_data->>'key_version')::integer then raise exception 'LOGIFA_MAIL_NOT_READY'; end if;
    if not exists(select 1 from public.issuer_profiles where id=p_issuer and active) then raise exception 'LOGIFA_ISSUER_INACTIVE'; end if;
    source_table:=case p_data->>'kind' when 'quote' then 'quotes' when 'invoice' then 'invoices' end;
    if source_table is null then raise exception 'LOGIFA_DOCUMENT_KIND'; end if;
    execute format('select to_jsonb(d) from public.%I d where id=$1 and issuer_profile_id=$2 and lifecycle in (''issued'',''historical'')',source_table)
      into doc using (p_data->>'document_id')::uuid,p_issuer;
    if doc is null then raise exception 'LOGIFA_MAIL_DOCUMENT_SCOPE'; end if;
    if not exists(select 1 from public.document_files f where f.id=(p_data->>'file_id')::uuid and
      ((p_data->>'kind'='quote' and f.quote_id=(p_data->>'document_id')::uuid) or (p_data->>'kind'='invoice' and f.invoice_id=(p_data->>'document_id')::uuid))) then raise exception 'LOGIFA_MAIL_FILE_SCOPE'; end if;
    select * into job from logifa_private.mail_outbox where idempotency_key=(p_data->>'key')::uuid;
    if job.id is not null then
      if job.issuer_profile_id is distinct from p_issuer or job.request_hash is distinct from p_data->>'request_hash' then raise exception 'LOGIFA_MAIL_IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('claimed',false,'id',job.id,'state',job.state,'provider_id',job.provider_id);
    end if;
    select * into job from logifa_private.mail_outbox where issuer_profile_id=p_issuer and request_hash=p_data->>'request_hash'
      and state in ('sending','sent','unknown') and created_at>now()-interval '24 hours' order by created_at desc limit 1;
    if job.id is not null then return jsonb_build_object('claimed',false,'id',job.id,'state',job.state,'provider_id',job.provider_id); end if;
    insert into logifa_private.mail_outbox(issuer_profile_id,quote_id,invoice_id,file_id,idempotency_key,request_hash,key_version,recipient,subject)
      values(p_issuer,case when p_data->>'kind'='quote' then (p_data->>'document_id')::uuid end,case when p_data->>'kind'='invoice' then (p_data->>'document_id')::uuid end,
        (p_data->>'file_id')::uuid,(p_data->>'key')::uuid,p_data->>'request_hash',account.key_version,p_data->>'recipient',p_data->>'subject') returning * into job;
    return jsonb_build_object('claimed',true,'id',job.id,'claim_token',job.claim_token);
  elsif p_action='finish' then
    select * into strict job from logifa_private.mail_outbox where id=(p_data->>'id')::uuid and issuer_profile_id=p_issuer and claim_token=(p_data->>'claim_token')::uuid for update;
    if job.state<>'sending' then return jsonb_build_object('id',job.id,'state',job.state); end if;
    if p_data->>'state' is null or p_data->>'state' not in ('sent','failed','unknown') then raise exception 'LOGIFA_MAIL_STATE'; end if;
    update logifa_private.mail_outbox set state=p_data->>'state',provider_id=p_data->>'provider_id',error_code=p_data->>'error_code',finished_at=now() where id=job.id;
    insert into public.document_events(actor_subject,event_type,table_name,record_id,data) values(auth.jwt()->>'sub','mail-'||(p_data->>'state'),case when job.quote_id is not null then 'quotes' else 'invoices' end,coalesce(job.quote_id,job.invoice_id),
      jsonb_build_object('mail_job_id',job.id,'provider_id',p_data->>'provider_id','error_code',p_data->>'error_code','regulatory_transmission',false));
    return jsonb_build_object('id',job.id,'state',p_data->>'state');
  end if;
  raise exception 'LOGIFA_MAIL_ACTION';
end $$;
revoke execute on all functions in schema logifa_private from public,anon,authenticated;
commit;


