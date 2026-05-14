-- Fraylon Certificate Verification System — initial schema
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- =========================================================================
-- certificates
-- =========================================================================
create table certificates (
  id              uuid primary key default gen_random_uuid(),
  cert_number     text unique not null,                  -- e.g. FRY-INT-2026-00042
  cert_type       text not null check (cert_type in ('INT','WRK','CRS')),
  recipient_name  text not null,
  recipient_email text,                                  -- collected only, not used in Phase 1
  program         text not null,                         -- e.g. "Web Development"
  duration        text not null,                         -- e.g. "3-Month Internship"
  start_date      date not null,
  end_date        date not null,
  issue_date      date not null default current_date,
  issued_by       text not null default 'Fraylon Technologies LLP',
  signature_hash  text not null,                         -- HMAC-SHA256 hex
  status          text not null default 'active' check (status in ('active','revoked')),
  revoke_reason   text,
  revoked_at      timestamptz,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now(),
  created_by      uuid references auth.users(id)
);

create index idx_certificates_cert_number on certificates (cert_number);
create index idx_certificates_status      on certificates (status);
create index idx_certificates_created_at  on certificates (created_at desc);

-- =========================================================================
-- verification_logs
--   - result includes 'tampered' (signature mismatch) — distinct UI state
--   - ip_hash is sha256(ip || IP_HASH_SALT), never raw IP
-- =========================================================================
create table verification_logs (
  id          bigserial primary key,
  cert_number text not null,
  ip_hash     text,
  user_agent  text,
  result      text not null check (result in ('valid','not_found','revoked','tampered')),
  verified_at timestamptz default now()
);

create index idx_verification_logs_cert       on verification_logs (cert_number);
create index idx_verification_logs_verified   on verification_logs (verified_at desc);

-- =========================================================================
-- cert_counters
--   Monotonic per-(type,year) sequence allocator. Locked via SELECT ... FOR
--   UPDATE inside the next_cert_seq() function to avoid duplicate sequences
--   under concurrent inserts. Advisory locks deliberately not used.
-- =========================================================================
create table cert_counters (
  cert_type text not null check (cert_type in ('INT','WRK','CRS')),
  year      int  not null,
  last_seq  int  not null default 0,
  primary key (cert_type, year)
);

create or replace function next_cert_seq(p_cert_type text, p_year int)
returns int
language plpgsql
as $$
declare
  v_seq int;
begin
  -- Upsert-then-lock: ensure the row exists, then take a row lock for the
  -- duration of the transaction so concurrent callers serialize on it.
  insert into cert_counters (cert_type, year, last_seq)
  values (p_cert_type, p_year, 0)
  on conflict (cert_type, year) do nothing;

  select last_seq + 1
    into v_seq
    from cert_counters
   where cert_type = p_cert_type
     and year      = p_year
     for update;

  update cert_counters
     set last_seq = v_seq
   where cert_type = p_cert_type
     and year      = p_year;

  return v_seq;
end;
$$;

-- =========================================================================
-- Row-level security
-- =========================================================================
alter table certificates       enable row level security;
alter table verification_logs  enable row level security;
alter table cert_counters      enable row level security;

-- Authenticated admins (filtered by ADMIN_EMAIL_ALLOWLIST server-side) get
-- full access to certificates. The public verify endpoint uses the service
-- role key from a server-only API route, which bypasses RLS by design.
create policy "admin full access on certificates"
  on certificates for all
  using (auth.role() = 'authenticated');

create policy "admin read on cert_counters"
  on cert_counters for select
  using (auth.role() = 'authenticated');

-- verification_logs are written by the service role; no public read/insert.
-- (Policies omitted intentionally — service role bypasses RLS.)
