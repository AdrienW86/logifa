-- Link all eligible previously issued deposit invoices to a draft final invoice.
-- Authorization, cross-issuer scoping, and financial guards are preserved.
create or replace function logifa_private.api_link_all_deposits(
  p_issuer uuid,
  p_final uuid
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  final_doc public.invoices;
  dep record;
  n integer := 0;
  linked_ids uuid[] := '{}'::uuid[];
begin
  perform logifa_private.assert_admin();
  select * into final_doc from public.invoices where id=p_final for update;
  if final_doc.id is null or final_doc.issuer_profile_id is distinct from p_issuer
     or final_doc.document_kind <> 'final' or final_doc.lifecycle <> 'draft'
     or final_doc.legal_entity_id is null
     or (final_doc.quote_id is null and final_doc.project_id is null)
     then raise exception 'LOGIFA_FINAL_CONTEXT_REQUIRED';
  end if;

  if (select count(*) from public.invoices d
        where d.legal_entity_id=final_doc.legal_entity_id
        and d.client_id=final_doc.client_id
        and d.document_kind='deposit'
        and d.lifecycle in ('issued','historical')
        and ((final_doc.quote_id is not null and d.quote_id=final_doc.quote_id)
          or (final_doc.quote_id is null and final_doc.project_id is not null
            and d.quote_id is null and d.project_id=final_doc.project_id))
      ) > 50 then raise exception 'LOGIFA_TOO_MANY_DEPOSITS'; end if;

  for dep in
    select d.id from public.invoices d
    where d.legal_entity_id=final_doc.legal_entity_id
      and d.client_id=final_doc.client_id
      and d.document_kind='deposit'
      and d.lifecycle in ('issued','historical')
      and ((final_doc.quote_id is not null and d.quote_id=final_doc.quote_id)
        or (final_doc.quote_id is null and final_doc.project_id is not null
          and d.quote_id is null and d.project_id=final_doc.project_id))
    order by d.issue_date, d.id
  loop
    perform logifa_private.api_link_deposit(final_doc.id,dep.id);
    linked_ids := array_append(linked_ids,dep.id);
    n := n+1;
  end loop;

  return jsonb_build_object('linked_count',n,'deposit_ids',to_jsonb(linked_ids));
end
$$;

create or replace function public.logifa_link_all_deposits(
  p_issuer uuid,
  p_final uuid
) returns jsonb language sql set search_path to ''
as $$ select logifa_private.api_link_all_deposits($1,$2) $$;
revoke all on function logifa_private.api_link_all_deposits(uuid,uuid) from public,anon,authenticated;
revoke all on function public.logifa_link_all_deposits(uuid,uuid) from public,anon;
grant execute on function logifa_private.api_link_all_deposits(uuid,uuid) to authenticated,service_role;
grant execute on function public.logifa_link_all_deposits(uuid,uuid) to authenticated,service_role;