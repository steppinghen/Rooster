-- AUDIT (Phase 1.5 slice 1): a Kid's iPad (job kid, d3, used by Kid A) in its own family.
-- audit_device_capabilities.sql sweeps the Kitchen iPad, which the 1.5 fixture turned into a
-- Family display, so this file sweeps a kid iPad the same way: every (relation, operation) not
-- on the allowed list must be 'none' or 'denied', including tables added later. Then the
-- My look columns (slice 13's RPC is the only write path), and the my_device_id() helper.
-- Plain assertions are blocking; todo() blocks are non-blocking hardening.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---- audit harness (identical in every audit_*.sql; created and rolled back per file) --------
-- audit.sweep(fam) probes every relation in `public` (tables, views, matviews, foreign tables,
-- found from the catalog, so a table added later is covered automatically) for select, insert,
-- update and delete, as the CURRENT role. Each probe runs in its own subtransaction and is
-- always rolled back, so a probe that succeeds cannot change data for later assertions.
-- Results: 'none' (0 rows), 'denied' (42501), 'READ n' / 'WROTE n', or 'blocked:<sqlstate>'.
-- Inserts copy a real row (captured as postgres) using only the columns the role may insert,
-- so a constraint error can't mask a missing RLS check (RLS WITH CHECK runs before unique/FK).
create schema audit;
grant usage on schema audit to anon, authenticated;

create function audit.tenancy_col(t regclass) returns text language sql stable set search_path = '' as $$
  select case
    when t = 'public.families'::regclass then 'id'
    when exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = t and a.attname = 'family_id' and not a.attisdropped) then 'family_id'
  end
$$;

create function audit.qn(t regclass) returns text language sql stable set search_path = '' as $$ select t::text $$;

create function audit.relations() returns setof regclass language sql stable set search_path = '' as $$
  select c.oid::regclass from pg_catalog.pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
  order by c.relname
$$;

create table audit.sample (tbl regclass, fam uuid, row jsonb);
grant select on audit.sample to anon, authenticated;

create function audit.capture() returns void language plpgsql set search_path = '' as $$
declare t regclass; tc text;
begin
  delete from audit.sample;
  for t in select * from audit.relations() loop
    tc := audit.tenancy_col(t);
    if tc is null then
      execute format('insert into audit.sample select %L::regclass, null, pg_catalog.to_jsonb(x) from (select * from %s limit 1) x', t, t);
    else
      execute format('insert into audit.sample select distinct on (x.%I) %L::regclass, x.%I, pg_catalog.to_jsonb(x) from %s x order by x.%I', tc, t, tc, t, tc);
    end if;
  end loop;
end $$;

-- p_fam: when set, restrict the probe to rows of that family (and copy that family's row).
-- p_override: jsonb merged over the copied row before insert (used for retargeting attacks).
create function audit.probe(t regclass, op text, p_fam uuid default null, p_override jsonb default '{}')
returns text language plpgsql set search_path = '' as $$
declare
  tc text := audit.tenancy_col(t);
  w text := case when p_fam is not null and tc is not null then format(' where %I = %L', tc, p_fam) else '' end;
  s jsonb; cols text; ucol text; q text; n bigint := 0; res text;
begin
  if op = 'select' then
    q := format('select count(*) from %s%s', t, w);
  elsif op = 'insert' then
    select a.row || p_override into s from audit.sample a
      where a.tbl = t and (p_fam is null or tc is null or a.fam = p_fam) limit 1;
    select string_agg(quote_ident(attname), ',' order by attnum) into cols from pg_catalog.pg_attribute
      where attrelid = t and attnum > 0 and not attisdropped and attgenerated = ''
        and pg_catalog.has_column_privilege(t, attname, 'INSERT');
    if cols is null or s is null then
      q := format('insert into %s default values', t);
    else
      q := format('insert into %s (%s) select %s from pg_catalog.jsonb_populate_record(null::%s, %L::jsonb)', t, cols, cols, t, s);
    end if;
  elsif op = 'update' then
    select quote_ident(attname) into ucol from pg_catalog.pg_attribute
      where attrelid = t and attnum > 0 and not attisdropped and attgenerated = ''
      order by pg_catalog.has_column_privilege(t, attname, 'UPDATE') desc, attnum limit 1;
    q := format('update %s set %s = %s%s', t, ucol, ucol, w);
  elsif op = 'delete' then
    q := format('delete from %s%s', t, w);
  else
    raise exception 'unknown op %', op;
  end if;
  begin
    if op = 'select' then execute q into n; else execute q; get diagnostics n = row_count; end if;
    raise exception using errcode = 'AUDT0', message = 'undo probe';
  exception
    when sqlstate 'AUDT0' then
      res := case when n = 0 then 'none' when op = 'select' then 'READ ' || n else 'WROTE ' || n end;
    when insufficient_privilege then res := 'denied';
    when others then res := 'blocked:' || sqlstate;
  end;
  return res;
end $$;

create function audit.sweep(p_fam uuid default null)
returns table (tbl text, op text, result text) language sql set search_path = '' as $$
  select r::text, o.op, audit.probe(r, o.op, p_fam)
  from audit.relations() r cross join (values ('select'), ('insert'), ('update'), ('delete')) o (op)
  where p_fam is null or audit.tenancy_col(r) is not null
  order by 1, 2
$$;

grant execute on all functions in schema audit to anon, authenticated;

select tests.make_phase15();
select audit.capture();
-- ---- end harness ------------------------------------------------------------------------------

create function pg_temp.probe(uid uuid, aal text, anon boolean, q text) returns text language plpgsql as $$
declare r text;
begin
  begin
    if uid is null then perform tests.as_anon(); else perform tests.authenticate(uid, aal, anon); end if;
    execute q into r;
    raise exception 'probe-done' using detail = coalesce(r, 'null');
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm = 'probe-done' then
      get stacked diagnostics r = pg_exception_detail;
      return 'ok:' || r;
    end if;
    return 'err:' || sqlstate;
  end;
end $$;

create temp table kid_ipad_allowed (tbl text, op text);
insert into kid_ipad_allowed values
  -- kid-facing reads
  ('public.families', 'select'), ('public.kids', 'select'), ('public.routines', 'select'),
  ('public.routine_completions', 'select'), ('public.events', 'select'), ('public.reset_plans', 'select'),
  ('public.family_modules', 'select'), ('public.kid_focus', 'select'), ('public.devices', 'select'),
  ('public.calendars', 'select'), ('public.checkin_moments', 'select'), ('public.device_kids', 'select'),
  ('public.event_kids', 'select'), ('public.kid_decks', 'select'), ('public.routine_kids', 'select'),
  ('public.sticker_awards', 'select'), ('public.weather_cache', 'select'),
  -- kid-facing writes
  ('public.routine_completions', 'insert'), ('public.routine_completions', 'update'),
  ('public.feelings_checkins', 'insert'),
  ('public.reset_plans', 'insert'), ('public.reset_plans', 'update'),
  ('public.usage_events', 'insert');
grant select on kid_ipad_allowed to authenticated;

select tests.authenticate('00000000-0000-4000-8000-0000000000d3', 'aal1', true);
select ok(s.result in ('none', 'denied'), format('kid iPad, own family, not allowed: %s %s -> %s', s.tbl, s.op, s.result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f1') s
  where not exists (select 1 from kid_ipad_allowed a where a.tbl = s.tbl and a.op = s.op);
select ok(s.result in ('none', 'denied'), format('kid iPad, other family: %s %s -> %s', s.tbl, s.op, s.result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f2') s;
select ok(s.result = 'denied', format('kid iPad: lockout table %s %s -> %s', s.tbl, s.op, s.result))
  from audit.sweep() s where s.tbl in ('public.pairing_attempts', 'public.pin_attempts');

-- Allowed reads are narrowed.
select results_eq('select id from public.devices', $$values ('00000000-0000-4000-8000-000000000dd3'::uuid)$$,
  'kid iPad: reads only its own devices row');
select results_eq('select device_id, kid_id from public.device_kids', $$values ('00000000-0000-4000-8000-000000000dd3'::uuid, '00000000-0000-4000-8000-0000000000ca'::uuid)$$,
  'kid iPad: reads only its own "who uses it"');
select is_empty($$select 1 from public.device_calendars$$, 'kid iPad: reads no display modes (not even the display''s)');
select is_empty($$select 1 from public.calendars where kids_default = 'never'$$, 'kid iPad: the work calendar is not listed');
select is_empty($$select 1 from public.events e join public.calendars c on c.id = e.calendar_id and c.family_id = e.family_id where c.kids_default = 'never'$$,
  'kid iPad: no work event, joined or not');
select is_empty($$select 1 from public.display_unlocks$$, 'kid iPad: no unlock rows');
select throws_ok($$select pin_hash from public.kids$$, '42501', null, 'kid iPad: no kid PIN hashes');
select is_empty($$select 1 from public.parents$$, 'kid iPad: no parent rows (faces, PIN state)');
select ok((select private.my_device_id()) = '00000000-0000-4000-8000-000000000dd3', 'my_device_id: the kid iPad''s own row');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---- my_device_id is never a parent's, a revoked iPad's, or a forged session's -------------------
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000a1', 'aal2', false, 'select private.my_device_id()::text'), 'ok:null', 'my_device_id: null for a parent');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000d9', 'aal1', true, 'select private.my_device_id()::text'), 'ok:null', 'my_device_id: null for a revoked iPad');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000d1', 'aal2', false, 'select private.my_device_id()::text'), 'ok:null', 'my_device_id: null when the iPad''s id comes without is_anonymous');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000e2', 'aal1', true, 'select private.my_device_id()::text'), 'ok:null', 'my_device_id: null for an anonymous user that never paired');
select ok(pg_temp.probe(null, null, null, 'select private.my_device_id()::text') in ('ok:null', 'err:42501'), 'my_device_id: nothing for the anon key (not even executable)');

-- ---- My look: avatar and accent have no direct client write path (slice 13 RPC only) -----------
create temp table look_attackers (who text, uid uuid, aal text, anon boolean);
insert into look_attackers values
  ('kid iPad', '00000000-0000-4000-8000-0000000000d3', 'aal1', true),
  ('Family display', '00000000-0000-4000-8000-0000000000d1', 'aal1', true),
  ('revoked iPad', '00000000-0000-4000-8000-0000000000d9', 'aal1', true),
  ('other family''s iPad', '00000000-0000-4000-8000-0000000000d2', 'aal1', true),
  ('other family''s parent', '00000000-0000-4000-8000-0000000000b1', 'aal2', false),
  ('parent before MFA', '00000000-0000-4000-8000-0000000000a1', 'aal1', false),
  ('never-paired anonymous', '00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select is(pg_temp.probe(a.uid, a.aal, a.anon,
    format($q$with u as (update public.kids set %s where id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$q$, c.setter)),
  'ok:0', format('look: %s cannot set %s on Kid A directly', a.who, c.col))
  from look_attackers a
  cross join (values ('avatar', $s$avatar = 'octopus'$s$), ('accent', $s$accent = 'lime'$s$), ('nickname', $s$nickname = 'Hacked'$s$),
                     ('can_change_look', 'can_change_look = true'), ('default_volume', $s$default_volume = 'normal'$s$),
                     ('age_band', $s$age_band = 'prereader'$s$)) as c(col, setter);
select is(pg_temp.probe(null, null, null, $q$update public.kids set avatar = 'octopus' where id = '00000000-0000-4000-8000-0000000000ca'$q$),
  'err:42501', 'look: the anon key cannot even attempt it');
-- Nothing changed.
select results_eq($$select avatar, accent::text, nickname from public.kids where id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('turtle'::text, 'magenta'::text, 'Kid A'::text)$$, 'look: Kid A is untouched');
-- Control: the harness can see a parent write land.
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000a1', 'aal2', false,
    $q$with u as (update public.kids set avatar = 'octopus', accent = 'lime' where id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$q$),
  'ok:1', 'look: control, a parent (phone) can override the look');

select * from finish();
rollback;
