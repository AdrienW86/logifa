begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table logifa_private.email_templates (
  id uuid primary key default gen_random_uuid(), issuer_id uuid not null references public.issuer_profiles(id) on delete restrict,
  name text not null check(length(name) between 1 and 100), kind text not null check(kind in ('quote','invoice','deposit','paid','reminder')),
  revision integer not null default 1 check(revision>0), archived boolean not null default false, is_default boolean not null default false,
  design jsonb not null, updated_at timestamptz not null default now(), check(not(archived and is_default)), unique(id,issuer_id)
);
alter table logifa_private.email_templates enable row level security;
revoke all on logifa_private.email_templates from PUBLIC,anon,authenticated;
create unique index email_templates_one_default on logifa_private.email_templates(issuer_id,kind) where is_default and not archived;
create table logifa_private.email_template_versions (
  template_id uuid not null, issuer_id uuid not null, revision integer not null,
  snapshot jsonb not null, actor_subject text not null, created_at timestamptz not null default now(),
  primary key(template_id,revision), foreign key(template_id,issuer_id) references logifa_private.email_templates(id,issuer_id) on delete restrict
);
alter table logifa_private.email_template_versions enable row level security;
revoke all on logifa_private.email_template_versions from PUBLIC,anon,authenticated;
create table logifa_private.email_template_usage (
  mail_id uuid primary key references logifa_private.mail_outbox(id) on delete restrict,
  template_id uuid not null, revision integer not null, issuer_id uuid not null,
  final_message jsonb not null, created_at timestamptz not null default now(),
  foreign key(template_id,revision) references logifa_private.email_template_versions(template_id,revision) on delete restrict,
  foreign key(template_id,issuer_id) references logifa_private.email_templates(id,issuer_id) on delete restrict
);
alter table logifa_private.email_template_usage enable row level security;
revoke all on logifa_private.email_template_usage from PUBLIC,anon,authenticated;

create function logifa_private.email_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'LOGIFA_EMAIL_HISTORY_IMMUTABLE'; end $$;
revoke all on function logifa_private.email_history_immutable() from PUBLIC,anon,authenticated;
create trigger email_version_immutable before update or delete on logifa_private.email_template_versions for each row execute function logifa_private.email_history_immutable();
create trigger email_usage_immutable before update or delete on logifa_private.email_template_usage for each row execute function logifa_private.email_history_immutable();

create function logifa_private.api_email_templates(p_action text,p_issuer uuid,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t logifa_private.email_templates; changed logifa_private.email_templates; d jsonb; k text; token text; result jsonb; item jsonb;
begin
  perform logifa_private.assert_admin();
  perform 1 from public.issuer_profiles where id=p_issuer for update;
  if not found then raise exception 'LOGIFA_ISSUER_REQUIRED'; end if;
  if p_action='list' then
    return jsonb_build_object('templates',coalesce((select jsonb_agg(to_jsonb(x) order by x.kind,x.is_default desc,x.name) from logifa_private.email_templates x where x.issuer_id=p_issuer),'[]'::jsonb));
  elsif p_action='history' then
    return jsonb_build_object('versions',coalesce((select jsonb_agg(to_jsonb(x) order by x.revision desc) from logifa_private.email_template_versions x where x.issuer_id=p_issuer and x.template_id=(p_data->>'id')::uuid),'[]'::jsonb),
      'usage',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from logifa_private.email_template_usage x where x.issuer_id=p_issuer and x.template_id=(p_data->>'id')::uuid),'[]'::jsonb));
  elsif p_action='initialize' then
    if jsonb_typeof(p_data->'templates') is distinct from 'array' or jsonb_array_length(p_data->'templates')<>5 then raise exception 'LOGIFA_TEMPLATE_INPUT'; end if;
    for item in select value from jsonb_array_elements(p_data->'templates') loop
      if not exists(select 1 from logifa_private.email_templates where issuer_id=p_issuer and kind=item->>'kind') then
        perform logifa_private.api_email_templates('save',p_issuer,item||jsonb_build_object('is_default',true));
      end if;
    end loop;
    return logifa_private.api_email_templates('list',p_issuer);
  end if;
  if p_data->>'id' is not null then
    select * into t from logifa_private.email_templates where id=(p_data->>'id')::uuid and issuer_id=p_issuer for update;
    if not found then raise exception 'LOGIFA_TEMPLATE_SCOPE'; end if;
    if (p_data->>'revision')::integer is distinct from t.revision then raise exception 'LOGIFA_TEMPLATE_VERSION_CONFLICT'; end if;
  elsif p_action<>'save' then raise exception 'LOGIFA_TEMPLATE_REQUIRED'; end if;
  if p_action in ('duplicate','archive','restore','default') then
    if p_action='duplicate' then
      t.id:=null;t.name:=left(t.name,90)||' (copie)';t.revision:=1;t.archived:=false;t.is_default:=false;
    elsif p_action='archive' then t.archived:=true;t.is_default:=false;
    elsif p_action='restore' then t.archived:=false;t.is_default:=false;
    elsif p_action='default' then
      if t.archived then raise exception 'LOGIFA_TEMPLATE_ARCHIVED'; end if;t.is_default:=true;
    end if;
  elsif p_action='save' then
    if t.archived then raise exception 'LOGIFA_TEMPLATE_ARCHIVED'; end if;
    if p_data->>'name' is null or length(p_data->>'name') not between 1 and 100 or p_data->>'kind' is null or p_data->>'kind' not in ('quote','invoice','deposit','paid','reminder') then raise exception 'LOGIFA_TEMPLATE_INPUT'; end if;
    if t.id is not null and t.kind is distinct from p_data->>'kind' then raise exception 'LOGIFA_TEMPLATE_KIND_IMMUTABLE'; end if;
    t.name:=p_data->>'name';t.kind:=p_data->>'kind';t.design:=p_data->'design';
    t.is_default:=coalesce((p_data->>'is_default')::boolean,false);t.archived:=false;
  else raise exception 'LOGIFA_TEMPLATE_ACTION'; end if;
  d:=t.design;
  if jsonb_typeof(d) is distinct from 'object' or d->>'font' is null or d->>'font' not in ('sans','serif','verdana')
    or d->>'color' is null or d->>'color' !~ '^#[a-fA-F0-9]{6}$' or d->>'background' is null or d->>'background' !~ '^#[a-fA-F0-9]{6}$'
    or d->>'subject' is null or length(d->>'subject') not between 1 and 200 or d->>'subject' ~ E'[\r\n]'
    or d->>'body' is null or length(d->>'body') not between 1 and 10000 then raise exception 'LOGIFA_TEMPLATE_DESIGN'; end if;
  if exists(select 1 from jsonb_object_keys(d) x where x not in ('subject','body','signature','footer','logo','color','background','font','linkLabel','linkUrl')) then raise exception 'LOGIFA_TEMPLATE_DESIGN'; end if;
  foreach k in array array['subject','body','signature','footer','logo','color','background','font','linkLabel','linkUrl'] loop
    if jsonb_typeof(d->k) is distinct from 'string' or length(d->>k)>10000 then raise exception 'LOGIFA_TEMPLATE_DESIGN'; end if;
    for token in select m[1] from regexp_matches(d->>k,'\{\{([^}]*)\}\}','g') m loop
      if token not in ('company.name','company.email','company.phone','company.address','client.name','client.email','document.number','document.date','document.total','document.due','document.remaining') then raise exception 'LOGIFA_TEMPLATE_VARIABLE'; end if;
    end loop;
    if regexp_replace(d->>k,'\{\{[^}]*\}\}','','g') ~ '\{\{|\}\}' then raise exception 'LOGIFA_TEMPLATE_VARIABLE'; end if;
  end loop;
  foreach k in array array['logo','linkUrl'] loop
    if d->>k<>'' and (d->>k !~ '^https://[^[:space:]<>"@]+$' or d->>k ~ '\{\{|\}\}') then raise exception 'LOGIFA_TEMPLATE_LINK'; end if;
  end loop;
  if t.is_default then
    for changed in update logifa_private.email_templates set is_default=false,revision=revision+1,updated_at=now()
      where issuer_id=p_issuer and kind=t.kind and is_default and id is distinct from t.id returning * loop
      insert into logifa_private.email_template_versions values(changed.id,p_issuer,changed.revision,to_jsonb(changed),auth.jwt()->>'sub',now());
    end loop;
  end if;
  if t.id is null then
    if (select count(*) from logifa_private.email_templates where issuer_id=p_issuer)>=100 then raise exception 'LOGIFA_TEMPLATE_LIMIT'; end if;
    insert into logifa_private.email_templates(issuer_id,name,kind,design,is_default) values(p_issuer,t.name,t.kind,t.design,t.is_default) returning * into t;
  else
    update logifa_private.email_templates set name=t.name,design=t.design,archived=t.archived,is_default=t.is_default,revision=revision+1,updated_at=now() where id=t.id returning * into t;
  end if;
  if not t.archived and not exists(select 1 from logifa_private.email_templates where issuer_id=p_issuer and kind=t.kind and is_default) then
    update logifa_private.email_templates set is_default=true where id=t.id returning * into t;
  elsif t.archived and not exists(select 1 from logifa_private.email_templates where issuer_id=p_issuer and kind=t.kind and is_default) then
    for changed in update logifa_private.email_templates set is_default=true,revision=revision+1,updated_at=now()
      where id=(select id from logifa_private.email_templates where issuer_id=p_issuer and kind=t.kind and not archived order by updated_at,id limit 1) returning * loop
      insert into logifa_private.email_template_versions values(changed.id,p_issuer,changed.revision,to_jsonb(changed),auth.jwt()->>'sub',now());
    end loop;
  end if;
  insert into logifa_private.email_template_versions values(t.id,p_issuer,t.revision,to_jsonb(t),auth.jwt()->>'sub',now());
  insert into public.document_events(actor_subject,event_type,table_name,record_id,data) values(auth.jwt()->>'sub','email-template-'||p_action,'issuer_profiles',p_issuer,jsonb_build_object('template_id',t.id,'revision',t.revision));
  return to_jsonb(t);
end $$;
revoke all on function logifa_private.api_email_templates(text,uuid,jsonb) from PUBLIC,anon,authenticated;
grant execute on function logifa_private.api_email_templates(text,uuid,jsonb) to authenticated;
create function public.logifa_email_templates(p_action text,p_issuer uuid,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select logifa_private.api_email_templates(p_action,p_issuer,p_data) $$;
revoke all on function public.logifa_email_templates(text,uuid,jsonb) from PUBLIC,anon,authenticated;
grant execute on function public.logifa_email_templates(text,uuid,jsonb) to authenticated;

-- Keep the existing Resend claim/finish/idempotence implementation, add a durable
-- immutable snapshot in the SAME claim transaction before a provider is called.
alter function logifa_private.api_mail(text,uuid,jsonb) rename to api_mail_legacy;
revoke all on function logifa_private.api_mail_legacy(text,uuid,jsonb) from PUBLIC,anon,authenticated;
create function logifa_private.api_mail(p_action text,p_issuer uuid,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; t logifa_private.email_templates;
begin
  perform logifa_private.assert_admin();
  if p_action='claim' and p_data->>'template_id' is not null then
    perform 1 from public.issuer_profiles where id=p_issuer for update;
    select * into t from logifa_private.email_templates where id=(p_data->>'template_id')::uuid and issuer_id=p_issuer for update;
    if not found or t.archived or t.revision is distinct from (p_data->>'template_revision')::integer then raise exception 'LOGIFA_TEMPLATE_VERSION_CONFLICT'; end if;
    if jsonb_typeof(p_data->'final_message') is distinct from 'object' or p_data->'final_message'->>'html' is null or p_data->'final_message'->>'text' is null then raise exception 'LOGIFA_TEMPLATE_MESSAGE_REQUIRED'; end if;
    if exists(select 1 from jsonb_object_keys(p_data->'final_message') k where k not in ('subject','text','html'))
      or jsonb_typeof(p_data->'final_message'->'subject') is distinct from 'string'
      or jsonb_typeof(p_data->'final_message'->'text') is distinct from 'string'
      or jsonb_typeof(p_data->'final_message'->'html') is distinct from 'string'
      or p_data->'final_message'->>'subject' is distinct from p_data->>'subject'
      or length(p_data->'final_message'->>'subject')>200
      or length(p_data->'final_message'->>'text')>20000
      or length(p_data->'final_message'->>'html')>120000 then raise exception 'LOGIFA_TEMPLATE_MESSAGE_REQUIRED'; end if;
  end if;
  result:=logifa_private.api_mail_legacy(p_action,p_issuer,p_data);
  if p_action='claim' and (result->>'claimed')::boolean and t.id is not null then
    insert into logifa_private.email_template_usage(mail_id,template_id,revision,issuer_id,final_message)
      values((result->>'id')::uuid,t.id,t.revision,p_issuer,p_data->'final_message');
  end if;
  return result;
end $$;
revoke all on function logifa_private.api_mail(text,uuid,jsonb) from PUBLIC,anon,authenticated;
grant execute on function logifa_private.api_mail(text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;

