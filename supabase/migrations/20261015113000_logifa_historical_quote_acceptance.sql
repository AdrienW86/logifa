create table if not exists logifa_private.historical_quote_acceptances (
 quote_id uuid primary key references public.quotes(id),
 issuer_profile_id uuid not null references public.issuer_profiles(id),
 evidence text not null,
 approved_at timestamptz not null default now()
);
revoke all on logifa_private.historical_quote_acceptances from public,anon,authenticated;
create or replace function logifa_private.api_accept_historical_quote(
 p_issuer uuid,p_quote uuid,p_evidence text
) returns jsonb language plpgsql security definer set search_path to ''
as $$
declare doc public.quotes;
begin
 perform logifa_private.assert_admin();
 if length(btrim(coalesce(p_evidence,'')))<15 or length(p_evidence)>2000
   then raise exception 'LOGIFA_ACCEPTANCE_EVIDENCE'; end if;
 select * into doc from public.quotes where id=p_quote for update;
 if doc.id is null or doc.issuer_profile_id is distinct from p_issuer
    or doc.lifecycle<>'historical' or doc.origin<>'historical'
    then raise exception 'LOGIFA_HISTORICAL_QUOTE_REQUIRED'; end if;
 if doc.status='accepted' then
   return jsonb_build_object('accepted',true,'existing',true); end if;
 if doc.status<>'sent' then raise exception 'LOGIFA_QUOTE_STATUS'; end if;
 if not exists(select 1 from public.document_files
   where quote_id=p_quote and role in ('original','signed'))
   then raise exception 'PDF_ORIGINAL_REQUIRED'; end if;
 update public.quotes set status='accepted' where id=p_quote;
 update public.document_workflow set state='accepted',reason='Accord historique vérifié',updated_at=now()
   where quote_id=p_quote;
 insert into logifa_private.historical_quote_acceptances(quote_id,issuer_profile_id,evidence)
   values(p_quote,p_issuer,btrim(p_evidence));
 return jsonb_build_object('accepted',true,'existing',false);
end $$;
create or replace function public.logifa_accept_historical_quote(
 p_issuer uuid,p_quote uuid,p_evidence text
) returns jsonb language sql set search_path to ''
as $$ select logifa_private.api_accept_historical_quote($1,$2,$3) $$;
revoke all on function logifa_private.api_accept_historical_quote(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.logifa_accept_historical_quote(uuid,uuid,text) from public,anon;
grant execute on function logifa_private.api_accept_historical_quote(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.logifa_accept_historical_quote(uuid,uuid,text) to authenticated,service_role;