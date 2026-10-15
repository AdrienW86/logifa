-- PREPARED ONLY. Never apply automatically. Requires reviewed legacy schema.
begin;
create schema logifa_private;
revoke all on schema logifa_private from public, anon, authenticated;
create table logifa_private.admin_binding (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  clerk_subject text,
  clerk_issuer text,
  legacy_profile_id text references public.profiles(id) on delete restrict,
  check (not enabled or ((clerk_subject like 'user_%' and clerk_issuer like 'https://%' and legacy_profile_id is not null) is true))
);
insert into logifa_private.admin_binding(singleton) values(true);
alter table logifa_private.admin_binding enable row level security;
revoke all on logifa_private.admin_binding from public, anon, authenticated;

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  legal_name text, siren text, siret text, legal_status text,
  address jsonb not null default '{}', contacts jsonb not null default '{}',
  vat_regime text not null default 'unknown' check (vat_regime in ('unknown','standard','exempt','reverse_charge')),
  vat_exigibility text not null default 'unknown' check(vat_exigibility in ('unknown','cash','debits','delivery')),
  default_vat_rate numeric(5,2) check (default_vat_rate between 0 and 100),
  vat_number text, iban text, bic text, bank_name text,
  insurance jsonb not null default '[]', legal_mentions jsonb not null default '{}',
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.issuer_profiles (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.legal_entities(id) on delete restrict,
  commercial_name text not null, source_key text unique,
  source_fingerprint text check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  source_local_id integer, source_siret text,
  address text, city_zip text, phone text, email text, website text, logo_path text, color text,
  pdf_template text not null default 'local-v1',
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index issuer_profiles_entity_idx on public.issuer_profiles(legal_entity_id);
create table public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public.legal_entities(id) on delete restrict,
  document_type text not null check(document_type in ('invoice','quote')),
  prefix text not null check (prefix ~ '^[A-Z0-9-]{1,24}$'),
  next_value bigint not null default 1 check(next_value between 1 and 999999999999),
  last_issue_date date,
  unique(legal_entity_id, document_type)
);

-- Loosen only the old number constraints; no number or row is rewritten.
alter table public.invoices alter column invoice_number drop not null;
alter table public.invoices drop constraint invoices_invoice_number_key;
alter table public.quotes alter column quote_number drop not null;
do $$ declare t text; begin
  foreach t in array array['quotes','invoices'] loop
    execute format('alter table public.%I add column logifa_managed boolean not null default false,
      add column issuer_profile_id uuid references public.issuer_profiles(id) on delete restrict,
      add column legal_entity_id uuid references public.legal_entities(id) on delete restrict,
      add column origin text not null default ''native'' check(origin in (''native'',''historical'')),
      add column lifecycle text check(lifecycle in (''draft'',''issued'',''historical'')),
      add column issuer_snapshot jsonb not null default ''{}'',
      add column client_snapshot jsonb not null default ''{}'',
      add column historical_metadata jsonb not null default ''{}'',
      add column original_status text, add column import_key uuid unique,
      add column currency text not null default ''EUR'' check(currency = ''EUR'')',t);
    execute format('create index on public.%I(issuer_profile_id)',t);
    execute format('create index on public.%I(legal_entity_id)',t);
    execute format('create index on public.%I(client_id)',t);
    execute format('create index on public.%I(user_id)',t);
  end loop;
end $$;
alter table public.invoices
  add column document_kind text not null default 'classic' check(document_kind in ('classic','deposit','final','credit')),
  add column quote_id uuid references public.quotes(id) on delete restrict,
  add column correction_of uuid references public.invoices(id) on delete restrict,
  add column credit_reason text;
create index invoices_quote_idx on public.invoices(quote_id);
create index invoices_correction_idx on public.invoices(correction_of);
-- Histories are preserved; native finals cannot duplicate a quote/project scope.
create unique index invoices_one_native_final_quote_idx on public.invoices(quote_id)
  where logifa_managed and origin='native' and lifecycle='issued' and document_kind='final' and quote_id is not null;
create unique index invoices_one_native_final_project_idx on public.invoices(project_id)
  where logifa_managed and origin='native' and lifecycle='issued' and document_kind='final' and quote_id is null and project_id is not null;
create unique index invoices_entity_number_idx on public.invoices(legal_entity_id,invoice_number) where invoice_number is not null;
create unique index quotes_entity_number_idx on public.quotes(legal_entity_id,quote_number) where quote_number is not null;
create unique index invoices_legacy_number_idx on public.invoices(invoice_number) where legal_entity_id is null and invoice_number is not null;
alter table public.projects add column issuer_profile_id uuid references public.issuer_profiles(id) on delete restrict;
create index projects_issuer_idx on public.projects(issuer_profile_id);
create index projects_client_idx on public.projects(client_id);
alter table public.quote_items add column item_type text not null default 'item', add column position integer;
alter table public.invoice_items add column position integer;
create unique index quote_items_position_idx on public.quote_items(quote_id,position);
create unique index invoice_items_position_idx on public.invoice_items(invoice_id,position);
create index supplier_items_parent_idx on public.supplier_invoice_items(supplier_invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public.legal_entities(id) on delete restrict,
  issuer_profile_id uuid not null references public.issuer_profiles(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  amount_minor bigint not null check(amount_minor between 1 and 999999999999),
  received_on date not null check(isfinite(received_on)), method text not null check(length(btrim(method))>0),
  currency text not null default 'EUR' check(currency='EUR'),
  bank_reference text, notes text,
  qualification text not null check(qualification in ('deposit','earnest','unqualified')),
  reconciliation_status text not null default 'pending' check(reconciliation_status in ('pending','reviewed')),
  tax_review_status text not null default 'pending' check(tax_review_status in ('pending','reviewed')),
  direction text not null default 'incoming' check(direction in ('incoming','refund')),
  refund_of uuid references public.payments(id) on delete restrict,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  check((direction='incoming' and refund_of is null) or (direction='refund' and refund_of is not null))
);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount_minor bigint not null check(amount_minor between 1 and 999999999999),
  idempotency_key uuid not null unique, created_at timestamptz not null default now()
);
create table public.allocation_reversals (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.payment_allocations(id) on delete restrict,
  refund_payment_id uuid not null unique references public.payments(id) on delete restrict,
  amount_minor bigint not null check(amount_minor>0),
  created_at timestamptz not null default now()
);
create table public.deposit_deductions (
  id uuid primary key default gen_random_uuid(),
  final_invoice_id uuid not null references public.invoices(id) on delete restrict,
  deposit_invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  tax_snapshot jsonb,
  created_at timestamptz not null default now(), check(final_invoice_id<>deposit_invoice_id)
);
create table public.credit_applications (
  id uuid primary key default gen_random_uuid(),
  credit_invoice_id uuid not null references public.invoices(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount_minor bigint not null check(amount_minor>0),
  idempotency_key uuid not null unique, created_at timestamptz not null default now(),
  check(credit_invoice_id<>invoice_id)
);
-- Archival source links are evidence, not financial authorization. Validation is
-- append-only and separate from the unchanged historical document.
create table public.historical_credit_validations (
  id uuid primary key default gen_random_uuid(),
  credit_invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  reason text not null check(length(btrim(reason))>0),
  actor_subject text not null, created_at timestamptz not null default now(),
  check(credit_invoice_id<>invoice_id)
);
create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  role text not null check(role in ('original','paid_version','signed','proof')),
  bucket_id text not null default 'logifa-documents' check(bucket_id='logifa-documents'),
  storage_path text not null unique,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check(byte_size between 1 and 26214400),
  mime_type text not null default 'application/pdf' check(mime_type='application/pdf'),
  original_filename text not null,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  check(num_nonnulls(quote_id,invoice_id,project_id,payment_id)=1),
  check(role<>'paid_version' or invoice_id is not null),
  check(role<>'signed' or quote_id is not null)
);
create unique index files_original_quote_idx on public.document_files(quote_id) where role='original';
create unique index files_original_invoice_idx on public.document_files(invoice_id) where role='original';
create table public.signature_tracking (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  provider text, external_reference text,
  status text not null check(status in ('prepared','sent','signed','declined','expired')),
  sent_at timestamptz, signed_at timestamptz, signer_identity jsonb,
  signed_file_id uuid references public.document_files(id) on delete restrict,
  evidence_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check(status<>'signed' or (signed_at is not null and signed_file_id is not null)),
  check(sent_at is null or signed_at is null or signed_at>=sent_at)
);
create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_subject text not null, event_type text not null,
  table_name text not null, record_id uuid not null,
  data jsonb not null default '{}'
);
create index events_record_idx on public.document_events(table_name,record_id,occurred_at);
-- Per-issuer Resend accounts. Encryption keys stay outside PostgreSQL, on the server.
create table logifa_private.mail_accounts (
  issuer_profile_id uuid primary key references public.issuer_profiles(id) on delete restrict,
  encrypted_key jsonb not null,
  key_version integer not null default 1 check(key_version>0),
  sender_name text not null, from_email text not null, reply_to text not null,
  domain text not null, signature text not null default '', default_subject text not null default '', default_body text not null default '',
  domain_status text not null default 'pending' check(domain_status in ('pending','verified','failed')),
  verified_at timestamptz, updated_at timestamptz not null default now()
);
create table logifa_private.mail_outbox (
  id uuid primary key default gen_random_uuid(), issuer_profile_id uuid not null references public.issuer_profiles(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete restrict, invoice_id uuid references public.invoices(id) on delete restrict,
  file_id uuid not null references public.document_files(id) on delete restrict,
  idempotency_key uuid not null unique, request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  key_version integer not null, recipient text not null, subject text not null,
  state text not null default 'sending' check(state in ('sending','sent','failed','unknown')),
  provider_id text, error_code text, claim_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(), finished_at timestamptz,
  check(num_nonnulls(quote_id,invoice_id)=1)
);
create index mail_outbox_issuer_idx on logifa_private.mail_outbox(issuer_profile_id,created_at);
alter table logifa_private.mail_accounts enable row level security;
alter table logifa_private.mail_outbox enable row level security;
revoke all on logifa_private.mail_accounts,logifa_private.mail_outbox from public,anon,authenticated;
alter table public.clients add column issuer_profile_id uuid references public.issuer_profiles(id) on delete restrict,
  add column client_kind text not null default 'unknown' check(client_kind in ('unknown','individual','professional')),
  add column billing_address text not null default '', add column work_address text not null default '',
  add column addresses jsonb not null default '[]' check(jsonb_typeof(addresses)='array'),
  add column editor_fields jsonb not null default '{}' check(jsonb_typeof(editor_fields)='object'),
  add column archived_at timestamptz;
create index clients_issuer_search_idx on public.clients(issuer_profile_id,company_name);
alter table public.issuer_profiles add column active boolean not null default true;
alter table public.invoices add column operation_date date check(operation_date is null or isfinite(operation_date)),
  add column purchase_order text, add column operation_category text check(operation_category in ('services','goods','mixed'));
-- Legacy clients stay unassigned. No inferred ownership or automatic merge.
create table public.editor_drafts (
  id uuid primary key default gen_random_uuid(), quote_id uuid unique references public.quotes(id) on delete restrict,
  invoice_id uuid unique references public.invoices(id) on delete restrict,
  payload jsonb not null check(jsonb_typeof(payload)='object'), revision bigint not null default 1,
  updated_at timestamptz not null default now(), check(num_nonnulls(quote_id,invoice_id)=1)
);
create table public.document_workflow (
  id uuid primary key default gen_random_uuid(), quote_id uuid unique references public.quotes(id) on delete restrict,
  invoice_id uuid unique references public.invoices(id) on delete restrict,
  state text not null default 'draft' check(state in ('draft','issued','sent','accepted','declined','expired','archived','cancelled')),
  reason text, updated_at timestamptz not null default now(), check(num_nonnulls(quote_id,invoice_id)=1)
);

-- Composite ownership constraints are nullable for untouched legacy rows.
alter table public.clients add constraint clients_id_issuer_unique unique(id,issuer_profile_id);
do $$ declare t text;begin foreach t in array array['quotes','invoices','projects','payments'] loop execute format('alter table public.%I add constraint %I foreign key(client_id,issuer_profile_id) references public.clients(id,issuer_profile_id) on delete restrict',t,t||'_client_issuer_fk');end loop;end $$;
-- All FK lookups used for ledger aggregates get indexes, including reverse paths.
do $$ declare r record; begin
  for r in select c.conrelid::regclass as tbl, a.attname from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.connamespace='public'::regnamespace
      and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and a.attnum=any(i.indkey))
  loop execute format('create index on %s(%I)',r.tbl,r.attname); end loop;
end $$;
-- This transaction commits with every new table closed, even with Supabase's
-- default ALL grants. No reliance on the later security migration.
do $$ declare t text; begin
  foreach t in array array['legal_entities','issuer_profiles','document_sequences','payments',
    'payment_allocations','allocation_reversals','deposit_deductions','credit_applications',
    'historical_credit_validations','document_files','signature_tracking','document_events','editor_drafts','document_workflow',
    'profiles','clients','quotes','quote_items','invoices','invoice_items','projects','supplier_invoices','supplier_invoice_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
end $$;
commit;


