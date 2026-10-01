-- Slice 10: focus modes (parents only), heads-up and durations on server time, private topics.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
-- Kid B needs a focus row too (fixture inserts it via the kids trigger).

-- ----- who may switch -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out')$$, '42501', null, 'set_focus: a device cannot switch modes');
select throws_ok($$select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[])$$, '42501', null, 'cancel: a device is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select throws_ok($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out')$$, '42501', null, 'set_focus: an aal1 parent cannot');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select throws_ok($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out')$$, '42501', null, 'set_focus: not another family''s kid');
select throws_ok($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cc']::uuid[], 'lights_out')$$, '42501', null,
  'set_focus: mixing in another family''s kid fails the whole call');
reset role;
select is((select mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cc'), 'everything', 'set_focus: the mixed call changed nothing');

-- ----- heads-up, switch now, durations -----
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select is(public.set_focus(array['00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cb']::uuid[], 'lights_out'), 2, 'set_focus: whole family at once');
select results_eq($$select mode::text, pending_mode::text, switch_at between now() + interval '119 seconds' and now() + interval '121 seconds' from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('everything'::text, 'lights_out'::text, true)$$, 'heads-up: still Everything, Lights out pending in 2 minutes');
select is(public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[]), 1, 'cancel: the pending switch is called off');
select results_eq($$select mode::text, pending_mode is null from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$, $$values ('everything'::text, true)$$, 'cancel: back to plain Everything');

select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', 20, true);
select results_eq($$select mode::text, return_mode::text, ends_at between now() + interval '1199 seconds' and now() + interval '1201 seconds', pending_mode is null from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('session'::text, 'everything'::text, true, true)$$, 'switch now: Session for 20 minutes, then back to Everything');
-- A heads-up during the timed Session keeps its timer; cancelling leaves it running.
select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out');
select results_eq($$select mode::text, ends_at is not null, return_mode::text, pending_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('session'::text, true, 'everything'::text, 'lights_out'::text)$$, 'heads-up during a timed Session: the Session timer keeps running');
select public.cancel_focus_switch(array['00000000-0000-4000-8000-0000000000ca']::uuid[]);
select results_eq($$select mode::text, ends_at is not null, return_mode::text, pending_mode is null from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('session'::text, true, 'everything'::text, true)$$, 'cancel: the Session keeps its end time');
-- Re-timing the same mode keeps its own return.
select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', 10, true);
select is((select return_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'), 'everything', 're-timing Session returns to Everything, not to Session');
select throws_ok($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', 0, true)$$, '22023', null, 'duration: at least 1 minute');
select throws_ok($$select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'everything', 10, true)$$, '22023', null, 'duration: Everything is never timed');
reset role;

-- A timed session that already ran out counts as over when the next switch is computed.
update public.kid_focus set since = now() - interval '30 minutes', ends_at = now() - interval '10 minutes', return_mode = 'everything' where kid_id = '00000000-0000-4000-8000-0000000000ca';
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'lights_out');
select results_eq($$select mode::text, pending_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('everything'::text, 'lights_out'::text)$$, 'expired timed session: treated as back in Everything, with Lights out pending');
reset role;

-- A heads-up whose time has passed is live when the next switch is computed.
update public.kid_focus set switch_at = now() - interval '1 minute' where kid_id = '00000000-0000-4000-8000-0000000000ca';
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select public.set_focus(array['00000000-0000-4000-8000-0000000000ca']::uuid[], 'session', 15);
select results_eq($$select mode::text, pending_mode::text, return_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('lights_out'::text, 'session'::text, null::text)$$, 'past heads-up: Lights out is current (untimed, so no return of its own)');
select is((select pending_return_mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'), 'lights_out', 'past heads-up: the timed Session returns to Lights out');
reset role;

-- ----- private Realtime topics -----
select ok(exists (select 1 from pg_policy where polrelid = 'realtime.messages'::regclass and polname = 'deck_private_topics' and polcmd = 'r'),
  'topics: a select-only policy on realtime.messages');
select ok(not exists (select 1 from pg_policy where polrelid = 'realtime.messages'::regclass and polcmd in ('a', '*')),
  'topics: no insert policy (clients can never broadcast)');

create temp table probe as
  select t.topic, u.uid, u.aal, u.anon from
    (values ('family:00000000-0000-4000-8000-0000000000f1'), ('family:00000000-0000-4000-8000-0000000000f2'), ('device:00000000-0000-4000-8000-0000000000d1'), ('family:junk')) t(topic),
    (values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'aal2', false), ('00000000-0000-4000-8000-0000000000d1'::uuid, 'aal1', true), ('00000000-0000-4000-8000-0000000000d9'::uuid, 'aal1', true), ('00000000-0000-4000-8000-0000000000e1'::uuid, 'aal2', false)) u(uid, aal, anon);
grant select on probe to authenticated;

create function pg_temp.can_join(p_topic text, p_uid uuid, p_aal text, p_anon boolean) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform set_config('realtime.topic', p_topic, true);
  perform tests.authenticate(p_uid, p_aal, p_anon);
  ok := (select private.is_member_of(substring(p_topic from 8)::uuid)) and p_topic ~ '^family:[0-9a-f-]{36}$'
        or p_topic = 'device:' || p_uid::text and p_anon;
  reset role;
  return ok;
exception when others then
  reset role;
  return false;
end $$;

select results_eq($$select topic || ' ' || uid::text from probe where pg_temp.can_join(topic, uid, aal, anon) order by 1$$,
  $$values ('device:00000000-0000-4000-8000-0000000000d1 00000000-0000-4000-8000-0000000000d1'),
           ('family:00000000-0000-4000-8000-0000000000f1 00000000-0000-4000-8000-0000000000a1'),
           ('family:00000000-0000-4000-8000-0000000000f1 00000000-0000-4000-8000-0000000000d1')$$,
  'topics: only family 1''s parent and iPad hear family 1; an iPad hears its own device topic; revoked iPads and strangers hear nothing');

-- ----- the change signal fires, and carries no data -----
delete from realtime.messages;
update public.kid_focus set pinned = '[]' where kid_id = '00000000-0000-4000-8000-0000000000cc';
select results_eq($$select topic, event, (payload - 'id')::text from realtime.messages order by inserted_at desc limit 1$$,
  $$values ('family:00000000-0000-4000-8000-0000000000f2'::text, 'changed'::text, '{"table": "kid_focus"}'::text)$$, 'signal: a payload-free "changed" on the family''s topic');
update public.devices set revoked_at = now() where id = '00000000-0000-4000-8000-000000000dd1';
select ok(exists (select 1 from realtime.messages where topic = 'device:00000000-0000-4000-8000-0000000000d1' and event = 'revoked'), 'signal: a revoked iPad is told on its own topic');
select ok(exists (select 1 from realtime.messages where private), 'signal: messages are private');

select * from finish();
rollback;
