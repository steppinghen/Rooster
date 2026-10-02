-- Phase 1.5 slice 1: the export carries every 1.5 table and none of its secrets; Delete family
-- removes every 1.5 row of the family (feed URLs, unlocks and lockout rows included) and
-- nothing of the other family.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();
update public.parents set unlock_pin_hash = extensions.crypt('246810', extensions.gen_salt('bf', 8)) where user_id = '00000000-0000-4000-8000-0000000000a1';

-- ----- export -----
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
create temp table ex as select public.export_family() as doc;
reset role;

select is((select (doc ->> 'version')::int from ex), 2, 'export: version 2');
select is_empty($$select t from unnest(private.deck_tables()) t
  where t not in ('families', 'module_catalog', 'pairing_attempts', 'pin_attempts', 'display_unlock_attempts')
    and not ((select doc from ex) -> 'tables') ? t$$, 'export: every family table in deck_tables is in the export');
select ok((select jsonb_array_length(doc -> 'tables' -> t) > 0 from ex), format('export: %s has family 1 rows', t))
  from unnest(array['routine_kids', 'device_kids', 'checkin_moments', 'feelings_notes', 'calendars', 'device_calendars', 'parent_calendar_prefs',
                    'event_kids', 'meals', 'dinner_plan', 'weather_cache', 'kid_decks', 'sticker_awards', 'display_unlocks']) t;
select ok((select doc::text !~* '(webcal|https)://[^"]*(caldav|calendar\.google)' from ex), 'export: no calendar feed link anywhere in it');
select ok((select doc::text not like '%FAKE-%' and doc::text not like '%fake-work%' from ex), 'export: not even the secret part of a link');
select ok((select doc::text not like '%$2a$%' and doc::text not like '%$2b$%' from ex), 'export: no bcrypt hash (kid PINs, kitchen PIN)');
select ok((select not (doc -> 'tables' -> 'parents' -> 0) ? 'unlock_pin_hash' from ex), 'export: parents rows carry no unlock_pin_hash');
select ok((select (doc -> 'tables' -> 'parents' -> 0) ? 'has_unlock_pin' from ex), 'export: but do say whether a kitchen PIN is set');
select ok((select doc -> 'omitted' ? 'calendar feed links' from ex), 'export: lists feed links as omitted');
select ok((select doc::text not like '%Family Two%' and doc::text not like '%Tacos%' and doc::text not like '%fam2-party%' from ex), 'export: nothing of family 2');

-- ----- delete -----
create temp table before2 as
  select t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where family_id = %L', t, '00000000-0000-4000-8000-0000000000f2'), false, true, '')))[1]::text::int as n
  from unnest(private.deck_tables()) t
  where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'family_id');
create temp table feeds2_before as select count(*)::int as n from private.calendar_feeds where family_id = '00000000-0000-4000-8000-0000000000f2';

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select public.delete_family('Family One')$$, 'delete: family 1 deletes');
reset role;

select is((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where family_id = %L', t, '00000000-0000-4000-8000-0000000000f1'), false, true, '')))[1]::text::int, 0,
  format('delete: no family 1 rows left in %s', t))
  from unnest(private.deck_tables()) t
  where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'family_id');
select is((select count(*)::int from private.calendar_feeds where family_id = '00000000-0000-4000-8000-0000000000f1'), 0, 'delete: family 1''s feed links are gone');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000d3'), 0, 'delete: Kid A''s iPad identity is gone');
select is((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where family_id = %L', b.t, '00000000-0000-4000-8000-0000000000f2'), false, true, '')))[1]::text::int, b.n,
  format('delete: family 2''s %s untouched', b.t))
  from before2 b;
select is((select count(*)::int from private.calendar_feeds where family_id = '00000000-0000-4000-8000-0000000000f2'), (select n from feeds2_before), 'delete: family 2''s feed links untouched');

select * from finish();
rollback;
