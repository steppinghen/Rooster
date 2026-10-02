-- Audit (slice 10): set_focus / cancel_focus_switch, the realtime.messages topic policy, and the
-- change-signal triggers. Written by the security auditor; attacks every role.
--
-- Unlike 008_focus.sql (which re-implements the policy predicate in a helper), the topic matrix
-- here evaluates the real deck_private_topics policy: a probe row is inserted into
-- realtime.messages as postgres, then each role selects it with realtime.topic set, which is
-- how Realtime itself authorizes a private-channel join.
--
-- Assertions inside todo() blocks are non-blocking hardening items: they describe the safer
-- behaviour and are expected to fail (reported as TODO) until the schema is tightened.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();

-- Only messages on the fixture's topics count (other sessions may be writing to the shared DB).
create temp table fixture_topics(topic text primary key);
insert into fixture_topics values
  ('family:00000000-0000-4000-8000-0000000000f1'), ('family:00000000-0000-4000-8000-0000000000f2'),
  ('device:00000000-0000-4000-8000-0000000000d1'), ('device:00000000-0000-4000-8000-0000000000d9'),
  ('device:00000000-0000-4000-8000-0000000000d2'), ('device:00000000-0000-4000-8000-0000000000e2');
create temp table seen(id uuid primary key);
insert into seen select id from realtime.messages where topic in (select topic from fixture_topics);
create temp view new_msgs as
  select m.* from realtime.messages m where m.topic in (select topic from fixture_topics) and m.id not in (select id from seen);
create function pg_temp.mark() returns void language sql as $$
  insert into seen select id from new_msgs on conflict do nothing;
$$;
-- Every message the triggers ever sent in this file, for the "no data" check at the end.
create temp table all_sent as select * from realtime.messages where false;
create function pg_temp.collect() returns void language sql as $$
  insert into all_sent select * from new_msgs; insert into seen select id from new_msgs on conflict do nothing;
$$;
grant select on fixture_topics, seen, new_msgs, all_sent to authenticated, anon;
grant insert on seen, all_sent to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- 1. set_focus / cancel_focus_switch: every non-parent role is refused and changes nothing.
-- ---------------------------------------------------------------------------------------------

-- Known state for Kid A: a pending Lights out in one minute.
update public.kid_focus set mode = 'everything', since = now() - interval '1 hour', ends_at = null, return_mode = null,
  pending_mode = 'lights_out', switch_at = now() + interval '1 minute', pending_ends_at = null
  where kid_id = '00000000-0000-4000-8000-0000000000ca';
create temp table snap as select kid_id, to_jsonb(f) - 'updated_at' - 'updated_by' as row from public.kid_focus f;
select pg_temp.mark();

create function pg_temp.attack(p_uid uuid, p_aal text, p_anon boolean, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  if p_uid is null then perform tests.as_anon(); else perform tests.authenticate(p_uid, p_aal, p_anon); end if;
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'err:' || sqlstate;
  end;
  reset role;
  return res;
end $$;

create temp table roles(who text, uid uuid, aal text, anon boolean);
insert into roles values
  ('device d1', '00000000-0000-4000-8000-0000000000d1', 'aal1', true),
  ('revoked device d9', '00000000-0000-4000-8000-0000000000d9', 'aal1', true),
  ('unpaired anonymous e2', '00000000-0000-4000-8000-0000000000e2', 'aal1', true),
  ('aal1 parent a2', '00000000-0000-4000-8000-0000000000a2', 'aal1', false),
  ('family 2 parent b1', '00000000-0000-4000-8000-0000000000b1', 'aal2', false),
  ('stranger e1', '00000000-0000-4000-8000-0000000000e1', 'aal2', false),
  ('anon key only', null, null, null);

select is(pg_temp.attack(uid, aal, anon, $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', 20, true)::text$$),
  'err:42501', 'audit set_focus refused (switch now, timed): ' || who) from roles;
select is(pg_temp.attack(uid, aal, anon, $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cb']::uuid[], 'everything')::text$$),
  'err:42501', 'audit set_focus refused (heads-up, two kids): ' || who) from roles;
select is(pg_temp.attack(uid, aal, anon, $$select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[])::text$$),
  'err:42501', 'audit cancel_focus_switch is refused (and changes nothing): ' || who) from roles;
-- Direct table writes (what PostgREST would do) are refused too.
select is(pg_temp.attack(uid, aal, anon, $$with u as (update public.kid_focus set pending_mode = null, switch_at = null where kid_id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$$),
  'err:42501', 'audit kid_focus direct update is refused (no write grants): ' || who) from roles;
select is(pg_temp.attack(uid, aal, anon, $$with u as (update public.kid_focus set pinned = '["x"]' where kid_id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$$),
  'err:42501', 'audit kid_focus pinned cannot be changed: ' || who) from roles;
select alike(pg_temp.attack(uid, aal, anon, $$insert into public.kid_focus (kid_id, family_id) values ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f2') returning 'inserted'$$),
  'err:%', 'audit kid_focus insert refused: ' || who) from roles;

select results_eq($$select kid_id, to_jsonb(f) - 'updated_at' - 'updated_by' from public.kid_focus f order by 1$$,
  $$select kid_id, row from snap order by 1$$, 'audit every kid_focus row is byte-identical after all refused attempts');
select is((select count(*)::int from new_msgs), 0, 'audit refused attempts sent no Realtime signal');

-- Partial update: a family 2 parent lists their own kid first. The loop updates Kid C, then
-- fails on Kid A; nothing of either may survive, and no signal goes out.
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000b1', 'aal2', false,
  $$select public.set_focus(array['00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out', null, true)::text$$),
  'err:42501', 'audit set_focus: mixed families (own kid first) still fails');
select results_eq($$select kid_id, to_jsonb(f) - 'updated_at' - 'updated_by' from public.kid_focus f order by 1$$,
  $$select kid_id, row from snap order by 1$$, 'audit set_focus: no partial update survives the failed mixed call');
select is((select count(*)::int from new_msgs), 0, 'audit set_focus: the failed mixed call sent no signal (Kid C''s message rolled back too)');
-- cancel_focus_switch never touches another family's kid, even when listed.
update public.kid_focus set pending_mode = 'session', switch_at = now() + interval '1 minute' where kid_id = '00000000-0000-4000-8000-0000000000cc';
select pg_temp.mark();
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000a1', 'aal2', false,
  $$select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cc']::uuid[])::text$$),
  'err:42501', 'audit cancel: a family 1 parent listing Kid C is refused outright (all or nothing)');
select is((select pending_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cc'), 'session', 'audit cancel: Kid C''s pending switch is untouched');
select is((select count(*)::int from new_msgs where topic = 'family:00000000-0000-4000-8000-0000000000f2'), 0, 'audit cancel: no signal on family 2''s topic');
select pg_temp.collect();

-- ---------------------------------------------------------------------------------------------
-- 2. Argument edge cases, as the real parent (fail closed, never an illegal row).
-- ---------------------------------------------------------------------------------------------
update public.kid_focus set mode = 'everything', since = now() - interval '1 hour', ends_at = null, return_mode = null,
  pending_mode = null, switch_at = null, pending_ends_at = null where family_id = '00000000-0000-4000-8000-0000000000f1';
drop table snap;
create temp table snap as select kid_id, to_jsonb(f) - 'updated_at' - 'updated_by' as row from public.kid_focus f;
select pg_temp.collect();

create temp table edge(label text, q text, expect text);
insert into edge values
  ('negative minutes', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', -5, true)::text$$, 'err:22023'),
  ('241 minutes', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', 241, false)::text$$, 'err:22023'),
  ('int max minutes', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out', 2147483647, true)::text$$, 'err:22023'),
  ('timed Everything (heads-up)', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'everything', 5, false)::text$$, 'err:22023'),
  ('null mode, switch now', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], null, null, true)::text$$, 'err:23502'),
  ('null mode, heads-up', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], null, null, false)::text$$, 'err:23514'),
  ('null in the kid list', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', null]::uuid[], 'session')::text$$, 'err:22023'),
  ('unknown kid id', $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-00000000dead']::uuid[], 'session')::text$$, 'err:42501'),
  ('empty list', $$select public.set_focus('{}'::uuid[], 'session')::text$$, 'ok:0'),
  ('null list', $$select public.set_focus(null, 'session')::text$$, 'err:22023'),
  ('cancel: null list', $$select public.cancel_focus_switch(null)::text$$, 'ok:0'),
  ('cancel: nothing pending', $$select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[])::text$$, 'ok:0');
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000a1', 'aal2', false, q), expect, 'audit set_focus edge: ' || label) from edge;
select results_eq($$select kid_id, to_jsonb(f) - 'updated_at' - 'updated_by' from public.kid_focus f order by 1$$,
  $$select kid_id, row from snap order by 1$$, 'audit set_focus edge: no edge case changed any row');
select is((select count(*)::int from new_msgs), 0, 'audit set_focus edge: and no edge case sent a signal');
-- Duplicates are de-duplicated (one kid, one switch).
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000a1', 'aal2', false,
  $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000ca']::uuid[], 'session')::text$$),
  'ok:1', 'audit set_focus edge: a duplicated kid counts once');

-- A kid whose kid_focus row is missing (cannot normally happen) fails the whole call.
delete from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cb';
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000a1', 'aal2', false,
  $$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cb']::uuid[], 'session', null, true)::text$$),
  'err:42501', 'audit set_focus: a kid with no focus row fails the call');
select is((select mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'), 'everything', 'audit set_focus: and the other kid is unchanged');
insert into public.kid_focus (kid_id, family_id) values ('00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-0000000000f1');
select pg_temp.collect();

-- Every legal path through set_focus leaves a sane row.
create function pg_temp.sane(k uuid) returns boolean language sql as $$
  select (ends_at is null or ends_at > since)
     and since <= now()
     and (switch_at is null or switch_at > now())
     and (pending_ends_at is null or (pending_mode is not null and pending_ends_at > switch_at))
     and (return_mode is null or ends_at is not null or pending_ends_at is not null)
  from public.kid_focus where kid_id = k
$$;
create temp table combos as
  select m::public.focus_mode as m, mins, nw from unnest(enum_range(null::public.focus_mode)) m,
    (values (null::int), (1), (240)) d(mins), (values (true), (false)) n(nw)
  where not (m = 'everything' and mins is not null);
grant select on combos to authenticated;
create function pg_temp.walk() returns int language plpgsql as $$
declare c record; bad int := 0;
begin
  for c in select * from combos loop
    perform tests.authenticate('00000000-0000-4000-8000-0000000000a1');
    perform public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], c.m, c.mins, c.nw);
    reset role;
    if not pg_temp.sane('00000000-0000-4000-8000-0000000000ca') then bad := bad + 1; end if;
    if c.nw is false then
      perform tests.authenticate('00000000-0000-4000-8000-0000000000a1');
      perform public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[]);
      reset role;
      if not pg_temp.sane('00000000-0000-4000-8000-0000000000ca') then bad := bad + 1; end if;
    end if;
  end loop;
  return bad;
end $$;
select is(pg_temp.walk(), 0, 'audit set_focus: every mode x duration x now/heads-up (and cancel) leaves a sane row');
select pg_temp.collect();

-- ---------------------------------------------------------------------------------------------
-- 3. realtime.messages: who may join which topic (the real policy, not a copy of it).
-- ---------------------------------------------------------------------------------------------
insert into realtime.messages (id, topic, extension, payload, event, private) values
  ('00000000-0000-4000-8000-00000000b0b0', 'probe', 'broadcast', '{}', 'probe', true),
  ('00000000-0000-4000-8000-00000000b0b1', 'probe', 'presence', '{}', 'probe', true);

create function pg_temp.can_read(p_topic text, p_uid uuid, p_aal text, p_anon boolean, p_probe uuid default '00000000-0000-4000-8000-00000000b0b0') returns text
language plpgsql as $$
declare ok boolean;
begin
  perform set_config('realtime.topic', coalesce(p_topic, ''), true);
  if p_uid is null then perform tests.as_anon(); else perform tests.authenticate(p_uid, p_aal, p_anon); end if;
  begin
    ok := exists (select 1 from realtime.messages where id = p_probe);
  exception when others then
    reset role;
    return 'error';
  end;
  reset role;
  return case when ok then 'join' else 'denied' end;
end $$;

create temp table topics(topic text);
insert into topics values
  ('family:00000000-0000-4000-8000-0000000000f1'),
  ('family:00000000-0000-4000-8000-0000000000f2'),
  ('family:00000000-0000-4000-8000-0000000000F1'),
  ('FAMILY:00000000-0000-4000-8000-0000000000f1'),
  ('family:00000000-0000-4000-8000-0000000000f2x'),
  ('family:00000000-0000-4000-8000-0000000000f2' || E'\n'),
  ('family:00000000-0000-4000-8000-0000000000f2 '),
  (' family:00000000-0000-4000-8000-0000000000f2'),
  ('family:{00000000-0000-4000-8000-0000000000f2}'),
  ('family:000000000000400080000000000000f2'),
  ('family:0000-0000-0000-4000-80000000000000f2'),
  ('family:------------------------------------'),
  ('family:00000000-0000-4000-8000-0000000000f2'' or ''1''=''1'),
  ('family:00000000-0000-4000-8000-0000000000f2;select 1'),
  ('family:' || chr(0x200b) || '00000000-0000-4000-8000-0000000000f2'),
  ('family:'),
  ('family:*'),
  ('family:%'),
  ('realtime:family:00000000-0000-4000-8000-0000000000f2'),
  ('device:00000000-0000-4000-8000-0000000000d1'),
  ('device:00000000-0000-4000-8000-0000000000d2'),
  ('device:00000000-0000-4000-8000-0000000000d9'),
  ('device:00000000-0000-4000-8000-0000000000e2'),
  ('device:00000000-0000-4000-8000-0000000000a1'),
  ('device:00000000-0000-4000-8000-0000000000D1'),
  ('device:00000000-0000-4000-8000-0000000000d1x'),
  ('device:'),
  ('probe'),
  (null);
insert into roles values ('parent a1', '00000000-0000-4000-8000-0000000000a1', 'aal2', false);

-- The full matrix: exactly these (role, topic) pairs may join. Note the non-canonical spelling of
-- family 2's uuid: Postgres's uuid input accepts it, so family 2's own parent may join that
-- topic name. Harmless (membership is still checked on the parsed uuid, and the triggers only
-- send on the canonical spelling), but the regex is looser than it looks.
-- The full matrix: exactly these (role, topic) pairs may join; everything else is denied or errors.
select results_eq(
  $$select r.who || ' -> ' || t.topic from roles r, topics t
    where pg_temp.can_read(t.topic, r.uid, r.aal, r.anon) = 'join' order by 1$$,
  $$values ('device d1 -> device:00000000-0000-4000-8000-0000000000d1'),
           ('device d1 -> family:00000000-0000-4000-8000-0000000000f1'),
           ('family 2 parent b1 -> family:00000000-0000-4000-8000-0000000000f2'),
           ('parent a1 -> family:00000000-0000-4000-8000-0000000000f1'),
           ('revoked device d9 -> device:00000000-0000-4000-8000-0000000000d9'),
           ('unpaired anonymous e2 -> device:00000000-0000-4000-8000-0000000000e2')$$,
  'audit topics: the only joins are own-family family:<uuid> (aal2 parent, live iPad) and an anonymous user''s own device:<uid>');
-- Malformed topics must never make a member of family 1 a member of family 2's stream.
select ok(pg_temp.can_read(topic, '00000000-0000-4000-8000-0000000000d1', 'aal1', true) <> 'join',
  'audit topics: family 1 iPad cannot join ' || coalesce(quote_literal(topic), 'null'))
  from topics where topic is distinct from 'family:00000000-0000-4000-8000-0000000000f1' and topic is distinct from 'device:00000000-0000-4000-8000-0000000000d1';
-- Presence is never granted (no presence policy).
select is(pg_temp.can_read('family:00000000-0000-4000-8000-0000000000f1', uid, aal, anon, '00000000-0000-4000-8000-00000000b0b1'), 'denied',
  'audit topics: no presence read for ' || who) from roles;
-- The family 1 iPad stops hearing the family the moment it is revoked (new joins).
update public.devices set revoked_at = now() where id = '00000000-0000-4000-8000-000000000dd1';
select is(pg_temp.can_read('family:00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1', 'aal1', true), 'denied',
  'audit topics: a just-revoked iPad can no longer join its family topic');
select is(pg_temp.can_read('device:00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', 'aal1', true), 'join',
  'audit topics: but still hears its own device topic (to learn it was unpaired)');
update public.devices set revoked_at = null where id = '00000000-0000-4000-8000-000000000dd1';
select pg_temp.collect();

-- ---------------------------------------------------------------------------------------------
-- 4. Nobody but the triggers can write realtime.messages (client broadcast is impossible).
-- ---------------------------------------------------------------------------------------------
create function pg_temp.try_write(p_uid uuid, p_aal text, p_anon boolean, p_topic text, p_sql text) returns text language plpgsql as $$
declare res text; n int;
begin
  perform set_config('realtime.topic', p_topic, true);
  if p_uid is null then perform tests.as_anon(); else perform tests.authenticate(p_uid, p_aal, p_anon); end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    res := 'rows:' || n;
  exception when others then
    res := 'err:' || sqlstate;
  end;
  reset role;
  return res;
end $$;

select is(pg_temp.try_write(uid, aal, anon, 'family:00000000-0000-4000-8000-0000000000f1',
  $$insert into realtime.messages (topic, extension, payload, event, private) values ('family:00000000-0000-4000-8000-0000000000f1', 'broadcast', '{"table":"kid_focus","forged":true}', 'changed', true)$$),
  'err:42501', 'audit broadcast: private insert refused for ' || who) from roles;
select is(pg_temp.try_write(uid, aal, anon, 'family:00000000-0000-4000-8000-0000000000f1',
  $$insert into realtime.messages (topic, extension, payload, event, private) values ('family:00000000-0000-4000-8000-0000000000f1', 'broadcast', '{}', 'changed', false)$$),
  'err:42501', 'audit broadcast: public-flag insert refused for ' || who) from roles;
select is(pg_temp.try_write(uid, aal, anon, 'family:00000000-0000-4000-8000-0000000000f1',
  $$insert into realtime.messages (topic, extension, payload, event, private) values ('family:00000000-0000-4000-8000-0000000000f1', 'presence', '{}', 'presence', true)$$),
  'err:42501', 'audit broadcast: presence insert refused for ' || who) from roles;
-- Rewriting a real signal (e.g. to inject data) or deleting one.
insert into realtime.messages (id, topic, extension, payload, event, private) values
  ('00000000-0000-4000-8000-00000000b0b2', 'family:00000000-0000-4000-8000-0000000000f1', 'broadcast', '{"table":"kid_focus"}', 'changed', true);
select is(pg_temp.try_write(uid, aal, anon, 'family:00000000-0000-4000-8000-0000000000f1',
  $$update realtime.messages set payload = '{"table":"kids","nickname":"x"}', inserted_at = now() where id = '00000000-0000-4000-8000-00000000b0b2'$$),
  'rows:0', 'audit broadcast: update rewrites nothing for ' || who) from roles;
select alike(pg_temp.try_write(uid, aal, anon, 'family:00000000-0000-4000-8000-0000000000f1',
  $$delete from realtime.messages where id = '00000000-0000-4000-8000-00000000b0b2'$$),
  'err:%', 'audit broadcast: delete refused for ' || who) from roles;
select is((select payload::text from realtime.messages where id = '00000000-0000-4000-8000-00000000b0b2'), '{"table": "kid_focus"}', 'audit broadcast: the real signal is untouched');
delete from realtime.messages where id in ('00000000-0000-4000-8000-00000000b0b0', '00000000-0000-4000-8000-00000000b0b1', '00000000-0000-4000-8000-00000000b0b2');
-- realtime.send is executable by PUBLIC; calling it directly (SQL-level) must still insert nothing.
select is(pg_temp.try_write(uid, aal, anon, 'family:00000000-0000-4000-8000-0000000000f1',
  $$select realtime.send('{"forged":true}', 'changed', 'family:00000000-0000-4000-8000-0000000000f1', true)$$),
  'rows:1', 'audit broadcast: realtime.send runs (it swallows the error) for ' || who) from roles;
select is((select count(*)::int from new_msgs), 0, 'audit broadcast: but no realtime.send call by a client role left a message');
-- The signal functions themselves are not callable by API roles.
select is(pg_temp.attack(uid, aal, anon, $$select private.signal_family_change()::text$$), 'err:42501', 'audit signal_family_change not executable by ' || who) from roles;
select is(pg_temp.attack(uid, aal, anon, $$select private.signal_device_revoked()::text$$), 'err:42501', 'audit signal_device_revoked not executable by ' || who) from roles;
-- realtime is not an exposed API schema, and there is no pg_graphql to reflect it.
select ok(not exists (select 1 from pg_extension where extname = 'pg_graphql'), 'audit surface: pg_graphql is not installed (no GraphQL path to realtime.messages)');
select is((select proconfig from pg_proc where oid = 'private.signal_family_change()'::regprocedure), array['search_path=""'], 'audit signal_family_change has an empty search_path');
select is((select proconfig from pg_proc where oid = 'private.signal_device_revoked()'::regprocedure), array['search_path=""'], 'audit signal_device_revoked has an empty search_path');
select is((select prosecdef from pg_proc where oid = 'public.set_focus(uuid[], public.focus_mode, integer, boolean)'::regprocedure), true, 'audit set_focus is SECURITY DEFINER (with its own parent check; kid_focus has no write grants)');
select is((select prosecdef from pg_proc where oid = 'public.cancel_focus_switch(uuid[])'::regprocedure), true, 'audit cancel_focus_switch is SECURITY DEFINER (with its own parent check)');

-- ---------------------------------------------------------------------------------------------
-- 5. Signals fire on the write paths that matter, from the real roles, and carry no data.
-- ---------------------------------------------------------------------------------------------
select pg_temp.collect();
create function pg_temp.as_parent(p_sql text) returns text language plpgsql as $$
begin
  return pg_temp.attack('00000000-0000-4000-8000-0000000000a1', 'aal2', false, p_sql);
end $$;
create function pg_temp.signals() returns text language sql as $$
  select coalesce(string_agg(distinct topic || ' ' || event || ' ' || coalesce(payload ->> 'table', '-'), ', ' order by topic || ' ' || event || ' ' || coalesce(payload ->> 'table', '-')), '') from new_msgs
$$;
create function pg_temp.step(p_sql text) returns text language plpgsql as $$
declare r text; s text;
begin
  r := pg_temp.as_parent(p_sql);
  s := pg_temp.signals();
  perform pg_temp.collect();
  return case when r like 'err:%' then r else s end;
end $$;

select is(pg_temp.step($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cb']::uuid[], 'session', 20, true)::text$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kid_focus', 'audit signal: set_focus');
select is(pg_temp.step($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out')::text$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kid_focus', 'audit signal: set_focus heads-up');
select is(pg_temp.step($$select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[])::text$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kid_focus', 'audit signal: cancel_focus_switch');
select is(pg_temp.step($$with u as (update public.family_modules set enabled = false where family_id = '00000000-0000-4000-8000-0000000000f1' and module_key = 'routines' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed family_modules', 'audit signal: module switched off');
select is(pg_temp.step($$insert into public.family_modules (family_id, module_key) values ('00000000-0000-4000-8000-0000000000f1', 'tour_dates') returning 'x'$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed family_modules', 'audit signal: module added');
select is(pg_temp.step($$with u as (update public.routines set name = 'Dawn Patrol 2' where id = '00000000-0000-4000-8000-000000000101' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed routines', 'audit signal: routine edited');
select is(pg_temp.step($$with u as (delete from public.routines where id = '00000000-0000-4000-8000-000000000101' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed routines', 'audit signal: routine deleted');
select is(pg_temp.step($$with u as (update public.events set title = 'Beach!' where id = '00000000-0000-4000-8000-00000000e101' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed events', 'audit signal: kid-visible event edited');
select is(pg_temp.step($$with u as (update public.kids set nickname = 'Kid AA' where id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kids', 'audit signal: kid renamed');
select is(pg_temp.step($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cb', '4321')::text$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kids', 'audit signal: PIN set (the signal has no hash in it)');
select is(pg_temp.step($$with u as (update public.families set name = 'Family Uno' where id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed families', 'audit signal: family renamed');
select is(pg_temp.step($$with u as (update public.devices set ground = 'night' where id = '00000000-0000-4000-8000-000000000dd1' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed devices', 'audit signal: device ground');
select is(pg_temp.step($$insert into public.kids (family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000f1', 'Kid D', 'reader') returning 'x'$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kid_focus, family:00000000-0000-4000-8000-0000000000f1 changed kids', 'audit signal: kid added (kid and its focus row)');
select is(pg_temp.step($$with u as (delete from public.kids where nickname = 'Kid D' returning 1) select count(*)::text from u$$),
  'family:00000000-0000-4000-8000-0000000000f1 changed kid_focus, family:00000000-0000-4000-8000-0000000000f1 changed kids', 'audit signal: kid deleted (cascade to kid_focus signals too)');

-- Devices write only kid-facing rows; none of their writes can make a signal (no spam channel).
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000d1', 'aal1', true, $$select public.device_checkin()::text$$), 'ok:null', 'audit signal: device check-in runs');
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000d1', 'aal1', true,
  $$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1) returning 'x'$$), 'ok:x', 'audit signal: device check-in of feelings runs');
select is(pg_temp.attack('00000000-0000-4000-8000-0000000000d1', 'aal1', true,
  $$insert into public.usage_events (family_id, kid_id, module_key, action) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'opened') returning 'x'$$), 'ok:x', 'audit signal: device usage event runs');
select is(pg_temp.signals(), '', 'audit signal: device writes and last_seen_at send nothing');
select pg_temp.collect();

-- Revocation: the family hears "devices changed", the iPad hears "revoked", nothing else.
select is(pg_temp.step($$select public.revoke_device('00000000-0000-4000-8000-000000000dd1')::text$$),
  'device:00000000-0000-4000-8000-0000000000d1 revoked -, family:00000000-0000-4000-8000-0000000000f1 changed devices', 'audit signal: revoke_device');
-- A no-op revoke (already revoked) sends nothing.
select is(pg_temp.step($$select public.revoke_device('00000000-0000-4000-8000-000000000dd9')::text$$), '', 'audit signal: revoking an already-revoked iPad sends nothing');

-- Nothing that happened in family 1 was ever sent on family 2's or family 2's iPad's topic.
select is((select count(*)::int from all_sent where topic in ('family:00000000-0000-4000-8000-0000000000f2', 'device:00000000-0000-4000-8000-0000000000d2')), 0,
  'audit signal: no family 1 write reached a family 2 topic');
-- And no message carries data: only {table} (or {}) plus Realtime's own id, always private.
select is((select count(*)::int from all_sent
  where not (payload - 'id' = jsonb_build_object('table', payload ->> 'table') or payload - 'id' = '{}')
     or not (payload ? 'id') or private is not true or extension <> 'broadcast'
     or event not in ('changed', 'revoked')
     or topic !~ '^(family|device):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), 0,
  'audit signal: every message is private, payload-free ({table} + id), on a canonical topic');
select ok((select count(*) from all_sent) >= 15, 'audit signal: (sanity) the run above produced signals to check');

-- ---------------------------------------------------------------------------------------------
-- 6. delete_family: cascades signal only the deleted family, carry nothing, and leave nothing.
-- ---------------------------------------------------------------------------------------------
select pg_temp.collect();
-- Family 1 is now named "Family Uno" (renamed above).
select is(pg_temp.as_parent($$select public.delete_family('Family Uno')::text$$), 'ok:', 'audit delete: Family 1 deleted by its parent');
select is((select count(*)::int from new_msgs where topic not like '%-0000000000f1' and topic not in ('device:00000000-0000-4000-8000-0000000000d1', 'device:00000000-0000-4000-8000-0000000000d9')), 0,
  'audit delete: cascade signals went only to the deleted family''s topics');
select is((select count(*)::int from new_msgs where not (payload - 'id' = jsonb_build_object('table', payload ->> 'table') or payload - 'id' = '{}')), 0,
  'audit delete: cascade signals carry no data');
select pg_temp.collect();
-- Blocking (retention): "Delete family removes every row for that family". realtime.messages
-- still holds rows on topic family:<deleted id> (and device:<deleted iPad uid>), with
-- timestamps of every change the family made, until Realtime drops the partition (days).
select is((select count(*)::int from realtime.messages
  where topic in ('family:00000000-0000-4000-8000-0000000000f1', 'device:00000000-0000-4000-8000-0000000000d1', 'device:00000000-0000-4000-8000-0000000000d9')), 0,
  'audit delete: no realtime.messages row for the deleted family or its iPads remains');
select ok((select count(*) from public.kid_focus where family_id = '00000000-0000-4000-8000-0000000000f2') = 1, 'audit delete: family 2''s focus row is untouched');

-- ---------------------------------------------------------------------------------------------
-- 7. Non-blocking hardening (TODO): what a parent can still store, and two set_focus quirks.
-- ---------------------------------------------------------------------------------------------
-- Direct writes as Family 2's parent (PostgREST: PATCH /kid_focus).
create function pg_temp.as_b(p_sql text) returns text language plpgsql as $$
begin
  return pg_temp.attack('00000000-0000-4000-8000-0000000000b1', 'aal2', false, p_sql);
end $$;
-- Fixed after the slice 10 review: kid_focus has no write grants (set_focus only), plus CHECKs.
select ok(pg_temp.as_b($$with u as (update public.kid_focus set pending_mode = 'lights_out', switch_at = now() - interval '1 day' returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: a pending switch in the past is refused');
select ok(pg_temp.as_b($$with u as (update public.kid_focus set pending_mode = null, switch_at = null, pending_ends_at = now() + interval '1 hour' returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: pending_ends_at without a pending switch is refused');
select ok(pg_temp.as_b($$with u as (update public.kid_focus set pending_mode = 'session', switch_at = now() + interval '2 minutes', pending_ends_at = now() returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: a pending timed mode that ends before it starts is refused');
select ok(pg_temp.as_b($$with u as (update public.kid_focus set since = now() + interval '1 year', pending_mode = null, switch_at = null, pending_ends_at = null returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: since in the future is refused');
select ok(pg_temp.as_b($$with u as (update public.kid_focus set mode = 'everything', since = now(), ends_at = now() + interval '1 hour', return_mode = 'lights_out' returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: a timed Everything is refused (set_focus refuses it)');
select ok(pg_temp.as_b($$with u as (update public.kid_focus set ends_at = null, return_mode = 'session' returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: return_mode without any end time is refused');
select ok(pg_temp.as_b($$with u as (update public.kid_focus set pinned = (select jsonb_agg(jsonb_build_object('blob', repeat('x', 500000))) from generate_series(1, 20)) returning 1) select count(*)::text from u$$) in ('err:42501', 'err:23514'), 'audit hardening: pinned is a short list of stable ids, not a 10 MB blob');

-- set_focus behaviour on Kid C (family 2 now has the only kids left).
update public.kid_focus set mode = 'everything', since = now() - interval '1 hour', ends_at = null, return_mode = null,
  pending_mode = null, switch_at = null, pending_ends_at = null, pinned = '[]' where kid_id = '00000000-0000-4000-8000-0000000000cc';
select is(pg_temp.as_b($$select public.set_focus(array['00000000-0000-4000-8000-0000000000cc']::uuid[], 'session', 20, true)::text$$), 'ok:1', 'audit quirk setup: Session for 20 minutes');
select is(pg_temp.as_b($$select public.set_focus(array['00000000-0000-4000-8000-0000000000cc']::uuid[], 'session', 10)::text$$), 'ok:1', 'audit quirk setup: then Session for 10 minutes');
select is((select return_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cc'), 'everything',
  'audit quirk: re-timing the current Session still returns to Everything (today: returns to Session, so the kid stays in Session)');
update public.kid_focus set mode = 'everything', since = now() - interval '1 hour', ends_at = null, return_mode = null,
  pending_mode = null, switch_at = null, pending_ends_at = null where kid_id = '00000000-0000-4000-8000-0000000000cc';
select is(pg_temp.as_b($$select public.set_focus(array['00000000-0000-4000-8000-0000000000cc']::uuid[], 'session', 20, true)::text$$), 'ok:1', 'audit quirk setup: Session for 20 minutes again');
select is(pg_temp.as_b($$select public.set_focus(array['00000000-0000-4000-8000-0000000000cc']::uuid[], 'lights_out')::text$$), 'ok:1', 'audit quirk setup: Lights out with a heads-up');
select ok((select ends_at is not null from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cc'),
  'audit quirk: a heads-up during a timed Session keeps the Session timer (today: dropped at once)');
select is(pg_temp.as_b($$select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000cc']::uuid[])::text$$), 'ok:1', 'audit quirk setup: cancel the heads-up');
select results_eq($$select mode::text, ends_at is not null from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cc'$$,
  $$values ('session'::text, true)$$, 'audit quirk: cancelling that heads-up leaves the Session timed (today: untimed, so the kid stays in Session)');

-- Parent-only events still signal the family topic, so a paired iPad learns when parents edit
-- an event it cannot read (timing only, no content).
select pg_temp.collect();
select is(pg_temp.as_b($$insert into public.events (family_id, title, on_date, kind, kid_visibility) values ('00000000-0000-4000-8000-0000000000f2', 'Parents only', current_date + 1, 'other', 'hidden') returning 'x'$$), 'ok:x', 'audit setup: a parent-only event');
select is((select count(*)::int from new_msgs where topic = 'family:00000000-0000-4000-8000-0000000000f2'), 0,
  'audit hardening: a parent-only event sends no signal that iPads hear');

select * from finish();
rollback;
