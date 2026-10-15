-- Synthetic pre-3A schema shape, no production rows or identities.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create table public.clients(
id uuid primary key default gen_random_uuid() not null,
user_id text not null,
company_name text not null,
commercial_name text,
contact_email text,
phone text,
siret character varying(14),
vat_number text,
street_number text,
street_name text,
postal_code text,
city text,
address_complement text,
payment_terms text default '30_days'::text not null,
created_at timestamp with time zone default now() not null);
create table public.invoice_items(
id uuid primary key default gen_random_uuid() not null,
invoice_id uuid not null,
item_type text default 'item'::text not null,
title text,
description text,
quantity numeric(10,2) default 1.00 not null,
unit text default 'unit'::text,
unit_price numeric(12,2) default 0.00 not null,
vat_rate numeric(5,2) default 20.00 not null,
total_net numeric(12,2) default 0.00 not null);
create table public.invoices(
id uuid primary key default gen_random_uuid() not null,
user_id text not null,
client_id uuid,
project_id uuid,
invoice_number text,
status text default 'draft'::text not null,
issue_date date default CURRENT_DATE not null,
due_date date,
description text,
total_net numeric(12,2) default 0.00 not null,
total_vat numeric(12,2) default 0.00 not null,
total_gross numeric(12,2) default 0.00 not null,
deposit_amount numeric(12,2) default 0.00 not null,
is_vat_exempt boolean default false not null,
sender_company_name text,
sender_siret text,
sender_address text,
sender_logo_url text,
meta_options jsonb default '{}'::jsonb,
created_at timestamp with time zone default now() not null);
create table public.profiles(
id text primary key not null,
full_name text,
username text,
company_name text,
commercial_name text,
email_pro text,
is_auto_entrepreneur boolean default false,
street_number text,
street_name text,
address_complement text,
postal_code text,
city text,
country text,
siret character varying(14),
logo_url text,
primary_color character varying(7) default '#2563eb'::character varying,
insurance_config jsonb default '[]'::jsonb not null,
label_config jsonb default '[]'::jsonb not null,
stripe_customer_id text,
stripe_subscription_id text,
subscription_status text,
legal_status text,
default_decennale text,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null);
create table public.projects(
id uuid primary key default gen_random_uuid() not null,
user_id text not null,
client_id uuid not null,
name text not null,
description text,
project_code text not null,
status text default 'pending'::text not null,
estimated_budget numeric(12,2) default 0.00 not null,
start_date date,
end_date date,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null);
create table public.quote_items(
id uuid primary key default gen_random_uuid() not null,
quote_id uuid not null,
description text not null,
quantity numeric(10,2) default 1.00 not null,
unit text default 'unit'::text,
unit_price numeric(12,2) default 0.00 not null,
vat_rate numeric(5,2) default 20.00 not null,
total_net numeric(12,2) default 0.00 not null);
create table public.quotes(
id uuid primary key default gen_random_uuid() not null,
user_id text not null,
client_id uuid,
project_id uuid,
quote_number text,
status text default 'draft'::text not null,
issue_date date default CURRENT_DATE not null,
validity_date date,
notes text,
total_net numeric(12,2) default 0.00 not null,
total_vat numeric(12,2) default 0.00 not null,
total_gross numeric(12,2) default 0.00 not null,
sender_company_name text,
sender_siret text,
sender_address text,
sender_logo_url text,
created_at timestamp with time zone default now() not null);
create table public.supplier_invoice_items(
id uuid primary key default gen_random_uuid() not null,
supplier_invoice_id uuid not null,
description text not null,
quantity numeric(10,2) default 1.00 not null,
unit_price numeric(12,2) default 0.00 not null,
vat_rate numeric(5,2) default 20.00 not null,
total_net numeric(12,2) default 0.00 not null);
create table public.supplier_invoices(
id uuid primary key default gen_random_uuid() not null,
user_id text not null,
project_id uuid,
invoice_number text,
issue_date date not null,
due_date date,
supplier_name text not null,
supplier_siret character varying(14) not null,
supplier_vat_number text,
total_net numeric(12,2) default 0.00 not null,
total_vat numeric(12,2) default 0.00 not null,
total_gross numeric(12,2) default 0.00 not null,
currency character varying(3) default 'EUR'::character varying not null,
payment_status text default 'to_pay'::text not null,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null);
alter table public.invoices add constraint invoices_invoice_number_key unique(invoice_number);
create policy "Users manage their own projects" on public.projects using (false);
create policy "Users manage their own quotes" on public.quotes using (false);
create policy "Users manage their own invoices" on public.invoices using (false);
create policy "Users manage their own supplier invoices" on public.supplier_invoices using (false);

