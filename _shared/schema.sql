-- =============================================================
-- ROOSTER — ALLOW-LIST SCHEMA
-- Run once in your PERSONAL Supabase project:
--   Supabase dashboard → SQL Editor → paste → Run
-- =============================================================
-- One table drives every gated site in the monorepo. The `site`
-- column is the per-site list: 'hvac-visits', 'lab', or '*' for
-- an email that should reach everything.

create table if not exists public.allowed_emails (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  site       text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: one row per (email, site).
create unique index if not exists allowed_emails_email_site_idx
  on public.allowed_emails (lower(email), site);

alter table public.allowed_emails enable row level security;

-- No policies are created for anon below, so with RLS on, the table
-- is unreadable from the browser. That is deliberate — reads go
-- through the function further down.


-- =============================================================
-- MODE 'rpc' — RECOMMENDED (overlay default)
-- =============================================================
-- Answers one yes/no question without exposing the list. SECURITY
-- DEFINER lets it read the table while callers still cannot.

create or replace function public.is_email_allowed(p_email text, p_site text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.allowed_emails
     where lower(email) = lower(trim(p_email))
       and site in (p_site, '*')
  );
$$;

revoke all on function public.is_email_allowed(text, text) from public;
grant execute on function public.is_email_allowed(text, text) to anon, authenticated;


-- =============================================================
-- MODE 'table' — the original comms-platform behaviour
-- =============================================================
-- Only if you set allowListMode: 'table' in auth-config.js.
-- WARNING: this policy makes every allowed email publicly readable
-- by anyone holding the anon key (which ships in your page source).
-- Uncomment only if you accept that.
--
-- create policy "anon can read allow-list"
--   on public.allowed_emails for select to anon using (true);


-- =============================================================
-- SEED — replace with your own addresses
-- =============================================================
insert into public.allowed_emails (email, site, note) values
  ('you@example.com', '*',           'owner — all sites'),
  ('dad@example.com', 'hvac-visits', 'hvac tool')
on conflict do nothing;


-- =============================================================
-- HANDY QUERIES
-- =============================================================
-- Who can reach what:
--   select site, email from allowed_emails order by site, email;
--
-- Grant access:
--   insert into allowed_emails (email, site) values ('new@x.com', 'lab');
--
-- Revoke access (also delete the auth user below, or their existing
-- session stays valid until it expires):
--   delete from allowed_emails where lower(email) = 'old@x.com';
--   -- then: Supabase dashboard → Authentication → Users → delete
