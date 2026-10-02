-- AUDIT (Phase 1.5 slice 1): sticker_awards and kid_decks before their RPCs exist (slice 8).
--
-- 1. No client role (any device, either family's parents, a stranger, the anon key) can insert,
--    pick, place, move, delete or reroll anything directly.
-- 2. Reads stay inside the family; a revoked iPad reads nothing.
-- 3. The trigger is the backstop for the slice 8 definer RPCs: an offer, its kid, family, deck
--    and day are fixed; a pick is final; a placed sticker never changes; four a day per kid.
-- Fixture: Kid A (ca) has deck dc1 (this week), award 5a10 placed (octopus), award 5a20 waiting
-- (offered wheel, rocket, shamrock). Family 2: Kid C (cc), deck dc2, award 5b10 placed.
-- Plain assertions are blocking; todo() blocks are non-blocking hardening.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();

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

create temp table roles15 (who text, uid uuid, aal text, anon boolean);
insert into roles15 values
  ('Kid A''s iPad', '00000000-0000-4000-8000-0000000000d3', 'aal1', true),
  ('the Family display', '00000000-0000-4000-8000-0000000000d1', 'aal1', true),
  ('a revoked iPad', '00000000-0000-4000-8000-0000000000d9', 'aal1', true),
  ('the other family''s iPad', '00000000-0000-4000-8000-0000000000d2', 'aal1', true),
  ('Parent A', '00000000-0000-4000-8000-0000000000a1', 'aal2', false),
  ('the other family''s parent', '00000000-0000-4000-8000-0000000000b1', 'aal2', false),
  ('a stranger', '00000000-0000-4000-8000-0000000000e1', 'aal2', false),
  ('a never-paired anonymous user', '00000000-0000-4000-8000-0000000000e2', 'aal1', true),
  ('the anon key', null, null, null);

-- ---- 1. no direct write path, for anyone -------------------------------------------------------
select is(pg_temp.probe(r.uid, r.aal, r.anon, a.q), 'err:42501', format('stickers: %s cannot %s', r.who, a.what))
  from roles15 r cross join (values
    ('award a sticker', $q$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
        values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{octopus}') returning 'x'$q$),
    ('pick a sticker that was offered', $q$update public.sticker_awards set sticker_key = 'wheel' where id = '00000000-0000-4000-8000-000000005a20'$q$),
    ('pick a sticker that was not offered', $q$update public.sticker_awards set sticker_key = 'unicorn' where id = '00000000-0000-4000-8000-000000005a20'$q$),
    ('place a waiting sticker', $q$update public.sticker_awards set sticker_key = 'wheel', x = 0.5, y = 0.5, size = 90, tilt = 8, placed_at = now() where id = '00000000-0000-4000-8000-000000005a20'$q$),
    ('move a placed sticker', $q$update public.sticker_awards set x = 0.1, y = 0.1 where id = '00000000-0000-4000-8000-000000005a10'$q$),
    ('resize or retilt a placed sticker', $q$update public.sticker_awards set size = 96, tilt = 12 where id = '00000000-0000-4000-8000-000000005a10'$q$),
    ('re-pick a placed sticker', $q$update public.sticker_awards set sticker_key = 'shell' where id = '00000000-0000-4000-8000-000000005a10'$q$),
    ('hand an award to the sibling', $q$update public.sticker_awards set kid_id = '00000000-0000-4000-8000-0000000000cb' where id = '00000000-0000-4000-8000-000000005a20'$q$),
    ('move an award to another day (cap bypass)', $q$update public.sticker_awards set award_date = award_date - 1 where id = '00000000-0000-4000-8000-000000005a20'$q$),
    ('delete an award (free a slot)', $q$delete from public.sticker_awards where id = '00000000-0000-4000-8000-000000005a20'$q$),
    ('delete the other family''s award', $q$delete from public.sticker_awards where id = '00000000-0000-4000-8000-000000005b10'$q$),
    ('make a deck', $q$insert into public.kid_decks (family_id, kid_id, week_start, design_key, world)
        values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', date_trunc('week', current_date)::date, 'x', 'surf') returning 'x'$q$),
    ('reroll a deck', $q$update public.kid_decks set design_key = 'other', rerolls_used = 0 where id = '00000000-0000-4000-8000-000000000dc1'$q$),
    ('delete a deck (and its stickers)', $q$delete from public.kid_decks where id = '00000000-0000-4000-8000-000000000dc1'$q$)
  ) as a(what, q);

-- Nothing changed.
select results_eq($$select id, sticker_key, x, y, size, tilt, kid_id from public.sticker_awards
    where id in ('00000000-0000-4000-8000-000000005a10', '00000000-0000-4000-8000-000000005a20', '00000000-0000-4000-8000-000000005b10') order by id$$,
  $$values ('00000000-0000-4000-8000-000000005a10'::uuid, 'octopus'::text, 0.3::real, 0.5::real, 90::smallint, -8::real, '00000000-0000-4000-8000-0000000000ca'::uuid),
           ('00000000-0000-4000-8000-000000005a20'::uuid, null, null, null, null, null, '00000000-0000-4000-8000-0000000000ca'::uuid),
           ('00000000-0000-4000-8000-000000005b10'::uuid, 'cocoa', 0.6::real, 0.4::real, 88::smallint, 7::real, '00000000-0000-4000-8000-0000000000cc'::uuid)$$,
  'stickers: every award is as the fixture wrote it');

-- ---- 2. reads stay in the family ------------------------------------------------------------------
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000d3', 'aal1', true, $$select string_agg(id::text, ',' order by id) from public.sticker_awards$$),
  'ok:00000000-0000-4000-8000-000000005a10,00000000-0000-4000-8000-000000005a20', 'stickers: Kid A''s iPad reads its family''s awards only');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000d2', 'aal1', true, $$select string_agg(id::text, ',' order by id) from public.sticker_awards$$),
  'ok:00000000-0000-4000-8000-000000005b10', 'stickers: the other family''s iPad reads theirs only');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000b1', 'aal2', false, $$select count(*)::text from public.sticker_awards a join public.kid_decks d on d.id = a.kid_deck_id where a.family_id = '00000000-0000-4000-8000-0000000000f1' or d.family_id = '00000000-0000-4000-8000-0000000000f1'$$),
  'ok:0', 'stickers: the other family''s parent reads none of ours, joined or not');
select is(pg_temp.probe(r.uid, r.aal, r.anon, $$select count(*)::text from public.sticker_awards where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0',
  format('stickers: %s reads none of family 1''s awards', r.who))
  from roles15 r where r.who in ('a revoked iPad', 'a stranger', 'a never-paired anonymous user', 'the other family''s iPad');
select is(pg_temp.probe(r.uid, r.aal, r.anon, $$select count(*)::text from public.kid_decks where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0',
  format('decks: %s reads none of family 1''s decks', r.who))
  from roles15 r where r.who in ('a revoked iPad', 'a stranger', 'a never-paired anonymous user', 'the other family''s iPad', 'the other family''s parent');

-- ---- 3. the trigger backstop (as the definer RPCs will run) ---------------------------------------
select throws_ok($$update public.sticker_awards set kid_id = '00000000-0000-4000-8000-0000000000cb' where id = '00000000-0000-4000-8000-000000005a20'$$,
  '23514', null, 'backstop: an award can''t be handed to the sibling');
select throws_ok($$update public.sticker_awards set award_date = award_date - 1 where id = '00000000-0000-4000-8000-000000005a20'$$,
  '23514', null, 'backstop: an award can''t move to another day (no cap bypass)');
select throws_ok($$update public.sticker_awards set kid_deck_id = '00000000-0000-4000-8000-000000000dc2' where id = '00000000-0000-4000-8000-000000005a20'$$,
  null, null, 'backstop: an award can''t move to another kid''s deck (or family)');
select throws_ok($$update public.sticker_awards set family_id = '00000000-0000-4000-8000-0000000000f2' where id = '00000000-0000-4000-8000-000000005a20'$$,
  null, null, 'backstop: an award can''t move to another family');
select throws_ok($$update public.sticker_awards set y = 0.9 where id = '00000000-0000-4000-8000-000000005a10'$$, '23514', null, 'backstop: placed y is fixed');
select throws_ok($$update public.sticker_awards set size = 86 where id = '00000000-0000-4000-8000-000000005a10'$$, '23514', null, 'backstop: placed size is fixed');
select throws_ok($$update public.sticker_awards set tilt = 5 where id = '00000000-0000-4000-8000-000000005a10'$$, '23514', null, 'backstop: placed tilt is fixed');
select throws_ok($$update public.sticker_awards set placed_at = now() + interval '1 hour' where id = '00000000-0000-4000-8000-000000005a10'$$, '23514', null, 'backstop: placed_at is fixed');
select throws_ok($$update public.sticker_awards set x = null, y = null, size = null, tilt = null, placed_at = null where id = '00000000-0000-4000-8000-000000005a10'$$,
  '23514', null, 'backstop: a placed sticker can''t be un-placed (and placed again elsewhere)');
select throws_ok($$update public.sticker_awards set sticker_key = null where id = '00000000-0000-4000-8000-000000005a10'$$,
  '23514', null, 'backstop: a pick can''t be undone');
select throws_ok($$update public.sticker_awards set x = 0.5, y = 0.5, size = 90, tilt = 8, placed_at = now() where id = '00000000-0000-4000-8000-000000005a20'$$,
  '23514', null, 'backstop: nothing is placed before it is picked');
select throws_ok($$update public.sticker_awards set sticker_key = 'wheel', x = 1.5, y = 0.5, size = 90, tilt = 8, placed_at = now() where id = '00000000-0000-4000-8000-000000005a20'$$,
  '23514', null, 'backstop: placement stays on the deck (0 to 1)');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-000000000dc2', 'routine', gen_random_uuid(), current_date, '{a}')$$,
  null, null, 'backstop: no award for another family''s kid or deck (refused by the trigger or the foreign key)');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', '00000000-0000-4000-8000-000000000101', current_date, '{a,b,c}')$$,
  '23505', null, 'backstop: one award per routine per kid per day');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{a,b,c,d}')$$,
  '23514', null, 'backstop: at most three offered');

-- Four a day counts waiting picks too: Kid A has one placed and one waiting today, so two more
-- fit and the fifth is refused, whatever its source.
select lives_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'chore', gen_random_uuid(), current_date, '{a,b,c}'),
           ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{a,b,c}')$$,
  'cap: third and fourth of the day');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'last_run', gen_random_uuid(), current_date, '{moon}')$$,
  '23514', 'four stickers a day', 'cap: a fifth (Last Run''s quiet reveal) is refused');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    select '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{a}'
    from generate_series(1, 3)$$,
  '23514', 'four stickers a day', 'cap: a multi-row insert can''t slip past it');
select is((select count(*)::int from public.sticker_awards where kid_id = '00000000-0000-4000-8000-0000000000ca' and award_date = current_date), 4, 'cap: Kid A has exactly four today');
select is((select count(*)::int from public.sticker_awards where kid_id = '00000000-0000-4000-8000-0000000000cc' and award_date = current_date), 1, 'cap: the other family''s kid is unaffected');

-- ---- non-blocking: what the schema could also refuse (slice 8 must enforce it either way) ---------
-- (Promoted from todo: fixed in slice 1 after the review.)
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date + 14, '{a,b,c}')$$,
  '23514', null, 'backstop: an award two weeks out can''t go on this week''s deck');
-- (Promoted from todo: fixed in slice 1 after the review.)
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date - 1, '{octopus,octopus,octopus}')$$,
  '23514', null, 'backstop: no repeated keys in an offer');
select todo('non-blocking: a routine award names a sticker routine of the family that serves the kid', 1);
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', '00000000-0000-4000-8000-000000000201', current_date - 1, '{a,b,c}')$$,
  '23514', null, 'backstop: not for another family''s routine');

select * from finish();
rollback;
