-- Reduce one HTTP/PostgREST RPC per invoice to a single scoped request.
-- All balances remain computed by the existing canonical balance function.
create or replace function logifa_private.api_invoice_balances(
  p_issuer uuid,
  p_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare answer jsonb;
begin
  perform logifa_private.assert_admin();
  if p_issuer is null or p_ids is null or cardinality(p_ids)>500
    then raise exception 'LOGIFA_BALANCE_SCOPE'; end if;
  if exists(select 1 from unnest(p_ids) doc_id
    where doc_id is null
      or not exists(select 1 from public.invoices i
        where i.id=doc_id and i.issuer_profile_id=p_issuer
          and i.lifecycle<>'draft'))
  then raise exception 'LOGIFA_BALANCE_SCOPE'; end if;
  select coalesce(jsonb_object_agg(i.id::text,logifa_private.balance(i.id)), '{}'::jsonb)
    into answer from public.invoices i
  where i.id=any(p_ids) and i.issuer_profile_id=p_issuer
    and i.lifecycle<>'draft';
  return answer;
end $$;
create or replace function public.logifa_invoice_balances(p_issuer uuid,p_ids uuid[])
returns jsonb language sql set search_path to ''
as $$ select logifa_private.api_invoice_balances($1,$2) $$;
revoke all on function logifa_private.api_invoice_balances(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.logifa_invoice_balances(uuid,uuid[]) from public,anon;
grant execute on function logifa_private.api_invoice_balances(uuid,uuid[]) to authenticated,service_role;
grant execute on function public.logifa_invoice_balances(uuid,uuid[]) to authenticated,service_role;