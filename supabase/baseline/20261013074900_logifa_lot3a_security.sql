begin;
-- Old policies are captured verbatim in supabase/audit. auth.uid() casts sub to
-- UUID, while Clerk subjects are user_... text. Replace authorization, not owners.
drop policy "Users manage their own projects" on public.projects;
drop policy "Users manage their own quotes" on public.quotes;
drop policy "Users manage their own invoices" on public.invoices;
drop policy "Users manage their own supplier invoices" on public.supplier_invoices;

do $$ declare t text; begin
  foreach t in array array['profiles','clients','projects','quotes','quote_items','invoices','invoice_items',
    'supplier_invoices','supplier_invoice_items','legal_entities','issuer_profiles','document_sequences','payments',
    'payment_allocations','allocation_reversals','deposit_deductions','credit_applications','historical_credit_validations','document_files','signature_tracking','document_events','editor_drafts','document_workflow'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy logifa_admin_access on public.%I to authenticated using ((select logifa_private.is_admin())) with check ((select logifa_private.is_admin()))',t);
  end loop;
end $$;
-- Ledger/document mutations are only possible via checked transactional RPCs.
-- Master data and ledger writes exclusively use checked RPCs.
grant usage on schema logifa_private to authenticated;
revoke all on all tables in schema logifa_private from public,anon,authenticated;
revoke execute on all functions in schema logifa_private from public,anon,authenticated;
grant execute on function logifa_private.is_admin() to authenticated;

do $$ declare r record; params text; public_name text; begin
  for r in select p.oid,p.proname,p.pronargs,pg_get_function_arguments(p.oid) as args,
    pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p where p.pronamespace='logifa_private'::regnamespace and p.proname like 'api\_%' escape '\'
  loop
    public_name:='logifa_'||substring(r.proname from 5);
    select coalesce(string_agg('$'||g::text,','),'') into params from generate_series(1,r.pronargs) g;
    execute format('create function public.%I(%s) returns jsonb language sql security invoker set search_path='''' as %L',
      public_name,r.args,format('select logifa_private.%I(%s)',r.proname,params));
    execute format('revoke execute on function public.%I(%s) from public,anon,authenticated',public_name,r.identity_args);
    execute format('grant execute on function public.%I(%s) to authenticated',public_name,r.identity_args);
    execute format('grant execute on function logifa_private.%I(%s) to authenticated',r.proname,r.identity_args);
  end loop;
end $$;

-- Never repurpose the public logos bucket for accounting documents.
do $$ begin
  if exists(select 1 from storage.buckets where id='logifa-documents') then raise exception 'LOGIFA_BUCKET_ALREADY_EXISTS_REVIEW_REQUIRED'; end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('logifa-documents','logifa-documents',false,26214400,array['application/pdf']);
-- Restrictive policy prevents existing permissive logo rules authorizing another
-- authenticated account. Public logo reading remains unchanged.
create policy logifa_storage_admin_gate on storage.objects as restrictive to authenticated
  using((select logifa_private.is_admin())) with check((select logifa_private.is_admin()));
create policy logifa_private_files_read on storage.objects for select to authenticated
  using(bucket_id='logifa-documents' and (select logifa_private.is_admin()));
create policy logifa_private_files_insert on storage.objects for insert to authenticated
  with check(bucket_id='logifa-documents' and (select logifa_private.is_admin())
    and name ~ '^[a-f0-9-]{36}/(invoice|quote|project|payment)/[a-f0-9-]{36}/[a-f0-9-]{36}\.pdf$');
-- No update/delete: originals and variants are separate immutable objects.
commit;


