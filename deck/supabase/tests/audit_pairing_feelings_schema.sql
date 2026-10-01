-- AUDIT: schema prerequisites for pairing codes (slice 3) and the 30-day feelings deletion
-- job (slice 9). The RPCs and the job are not built; these check that the current schema can't
-- be used against them and flags (as TODO) what would make them easy to get wrong.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
select tests.make_two_families();
insert into public.pairing_codes (family_id, code_hash, label) values
  ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('11112222', extensions.gen_salt('bf', 8)), 'Code 1');

-- ---- pairing codes ------------------------------------------------------------------------
select ok(not has_table_privilege(r, 'public.pairing_codes', 'insert') and not has_table_privilege(r, 'public.pairing_codes', 'update')
  and not has_table_privilege(r, 'public.pairing_codes', 'delete')
  and not has_any_column_privilege(r, 'public.pairing_codes', 'insert') and not has_any_column_privilege(r, 'public.pairing_codes', 'update'),
  format('%s cannot create, redeem, extend or delete pairing codes directly', r))
  from unnest(array['anon', 'authenticated']) r;
select ok(not has_column_privilege(r, 'public.pairing_codes', 'code_hash', 'select'), format('%s cannot read code_hash', r))
  from unnest(array['anon', 'authenticated']) r;

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select throws_ok('select p from public.pairing_codes p', '42501', null, 'parent: code_hash not readable via whole-row reference');
select throws_ok('select to_jsonb(p) from public.pairing_codes p', '42501', null, 'parent: code_hash not readable via to_jsonb');
select throws_ok($$select id from public.pairing_codes where code_hash = extensions.crypt('11112222', code_hash)$$, '42501', null,
  'parent: cannot test a code guess against code_hash in WHERE');
select throws_ok($$update public.pairing_codes set used_at = null$$, '42501', null, 'parent: cannot un-use a code');
select throws_ok($$update public.pairing_codes set expires_at = now() + interval '1 day'$$, '42501', null, 'parent: cannot extend a code');
reset role;

-- The 10-minute window: default and upper bound.
select ok((select expires_at - created_at = interval '10 minutes' from public.pairing_codes where label = 'Code 1'),
  'pairing code defaults to a 10-minute life');
select throws_ok($$insert into public.pairing_codes (family_id, code_hash, label, expires_at)
  values ('00000000-0000-4000-8000-0000000000f1', 'x', 'Long', now() + interval '11 minutes')$$,
  '23514', null, 'a code cannot be created with more than 10 minutes to live');
-- But the bound is relative to created_at, which is an ordinary writable column.
-- (Fixed in slice 3 by the pairing_codes_clock trigger; a real bcrypt hash keeps the shape
-- check from masking the clock check.)
insert into public.pairing_codes (family_id, code_hash, label, created_at, expires_at)
  values ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('24682468', extensions.gen_salt('bf', 4)), 'Future',
          now() + interval '1 year', now() + interval '1 year 10 minutes');
select ok((select created_at <= now() and expires_at <= now() + interval '10 minutes' from public.pairing_codes where label = 'Future'),
  'a code cannot be valid for a year by setting created_at in the future (server clamps both)');
-- "Stored hashed" is a convention, not a constraint.
select throws_ok($$insert into public.pairing_codes (family_id, code_hash, label) values ('00000000-0000-4000-8000-0000000000f1', '12345678', 'Plain')$$,
  '23514', null, 'code_hash rejects a plaintext 8-digit code');

-- ---- feelings retention ------------------------------------------------------------------
select ok(not has_column_privilege(r, 'public.feelings_checkins', 'created_at', 'insert')
  and not has_column_privilege(r, 'public.feelings_checkins', 'created_at', 'update'),
  format('%s cannot set feelings created_at (the 30-day clock)', r))
  from unnest(array['anon', 'authenticated']) r;
select ok(not has_table_privilege(r, 'public.feelings_checkins', 'update') and not has_any_column_privilege(r, 'public.feelings_checkins', 'update'),
  format('%s cannot update check-ins at all', r))
  from unnest(array['anon', 'authenticated']) r;
select col_not_null('public', 'feelings_checkins', 'created_at', 'feelings created_at is not null (no immortal rows)');
select col_type_is('public', 'feelings_checkins', 'created_at', 'timestamp with time zone', 'feelings created_at is timestamptz');
select has_index('public', 'feelings_checkins', 'feelings_checkins_created', 'retention job has an index on created_at');
select is_empty($$
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'feelings_checkins'
    and column_name ~ '(score|point|reward|sticker|streak)'
$$, 'no score, points or reward columns on feelings');
-- Feelings rows can only be read by parents, and only the device's own family is writable.
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty('select 1 from public.feelings_checkins', 'device: reads no check-ins, not even its own kids''');
reset role;
-- Deleting a kid removes their check-ins with them.
delete from public.kids where id = '00000000-0000-4000-8000-0000000000ca';
select is_empty($$select 1 from public.feelings_checkins where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  'deleting a kid deletes their check-ins');
select isnt_empty($$select 1 from public.feelings_checkins where kid_id = '00000000-0000-4000-8000-0000000000cc'$$,
  'deleting a kid leaves other families'' check-ins');

select * from finish();
rollback;
