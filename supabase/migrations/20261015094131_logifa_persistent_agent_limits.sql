-- Additive non-financial quota storage. No customer content, no provider call.
begin;
create table logifa_private.agent_usage_limits (
  actor_subject text primary key,
  hour_start timestamptz not null,
  hour_requests integer not null check(hour_requests between 0 and 10),
  day_start date not null,
  day_requests integer not null check(day_requests between 0 and 50)
);
alter table logifa_private.agent_usage_limits enable row level security;
revoke all on logifa_private.agent_usage_limits from public,anon,authenticated;
create function logifa_private.api_consume_agent_request(p_operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text; usage logifa_private.agent_usage_limits; hour_value timestamptz:=date_trunc('hour',now()); day_value date:=(now() at time zone 'UTC')::date;
begin
  perform logifa_private.assert_admin();
  if p_operation is null or p_operation not in ('proposal','pdf_extraction') then raise exception 'LOGIFA_AGENT_OPERATION'; end if;
  actor:=auth.jwt()->>'sub';
  insert into logifa_private.agent_usage_limits(actor_subject,hour_start,hour_requests,day_start,day_requests)
    values(actor,hour_value,0,day_value,0) on conflict do nothing;
  select * into strict usage from logifa_private.agent_usage_limits where actor_subject=actor for update;
  if usage.hour_start<>hour_value then usage.hour_requests:=0; end if;
  if usage.day_start<>day_value then usage.day_requests:=0; end if;
  if usage.hour_requests>=10 or usage.day_requests>=50 then raise exception 'LOGIFA_AGENT_RATE_LIMIT'; end if;
  update logifa_private.agent_usage_limits set hour_start=hour_value,hour_requests=usage.hour_requests+1,
    day_start=day_value,day_requests=usage.day_requests+1 where actor_subject=actor;
  return jsonb_build_object('allowed',true,'hour_remaining',9-usage.hour_requests,'day_remaining',49-usage.day_requests);
end $$;
revoke all on function logifa_private.api_consume_agent_request(text) from public,anon,authenticated;
grant execute on function logifa_private.api_consume_agent_request(text) to authenticated;
create function public.logifa_consume_agent_request(p_operation text) returns jsonb
language sql security invoker set search_path='' as $$ select logifa_private.api_consume_agent_request($1) $$;
revoke all on function public.logifa_consume_agent_request(text) from public,anon,authenticated;
grant execute on function public.logifa_consume_agent_request(text) to authenticated;
commit;
