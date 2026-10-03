#!/usr/bin/env node
// Smoke-check helper (Phase 1.5 slice 5). The phone can't make sticker routines, decks or
// check-in moments until slices 6, 8 and 14, so The Point has nothing to show in those slots.
// This fills them in on a LOCAL stack, for the family of the most recently seen paired device
// (your iPad), with placeholder stickers only:
//   - every routine that family has earns a sticker;
//   - each kid gets this week's Sunset Stripes deck with up to six stickers already placed;
//   - each kid gets an "After school" check-in moment at 15:00.
// Run it yourself: `npm run smoke:seed` (dev stack) or `npm run smoke:seed -- build`.
// It refuses anything but a local Docker container. Undo: `npm run smoke:seed -- dev --undo`.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const undo = args.includes('--undo');
const agent = args.find((a) => !a.startsWith('--')) ?? 'dev';
const container = agent === 'dev' ? 'supabase_db_deck' : `supabase_db_deck-${agent}`;

const psql = (sql) => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' }).trim();

const family = psql(`select family_id from public.devices where revoked_at is null and last_seen_at is not null order by last_seen_at desc limit 1;`);
if (!family) {
  console.error(`No paired device has been seen on the ${agent} stack. Open the app on the iPad first.`);
  process.exit(1);
}
const name = psql(`select name from public.families where id = '${family}';`);

if (undo) {
  psql(`begin;
    delete from public.sticker_awards where family_id = '${family}' and offered_keys = array[sticker_key] and source_kind = 'routine';
    delete from public.kid_decks d where family_id = '${family}' and not exists (select 1 from public.sticker_awards a where a.kid_deck_id = d.id);
    delete from public.checkin_moments where family_id = '${family}' and label = 'After school' and at_time = '15:00';
    commit;`);
  console.log(`Removed the smoke stickers, decks and moments from "${name}".`);
  process.exit(0);
}

const STICKERS = [
  ['shell', 0.905, 0.46, 93, 5],
  ['surfboard', 0.086, 0.66, 95, -5],
  ['palm-island', 0.516, 0.31, 86, 5],
  ['barrel', 0.349, 0.69, 95, -6],
  ['flip-flop', 0.549, 0.67, 88, 5],
  ['helmet', 0.684, 0.32, 91, -9],
];

const out = psql(`
begin;
update public.routines set earns_sticker = true where family_id = '${family}';
with tz as (select timezone from public.families where id = '${family}'),
today as (select (now() at time zone (select timezone from tz))::date as d),
week as (select (d - (extract(isodow from d)::int - 1))::date as ws, d from today)
insert into public.kid_decks (family_id, kid_id, week_start, design_key, world)
select '${family}', k.id, (select ws from week), 'sunset-stripes', 'surf' from public.kids k
where k.family_id = '${family}'
on conflict (family_id, kid_id, week_start) do nothing;

with tz as (select timezone from public.families where id = '${family}'),
today as (select (now() at time zone (select timezone from tz))::date as d),
week as (select (d - (extract(isodow from d)::int - 1))::date as ws, d from today),
r as (select id, row_number() over (order by starts_at) as n from public.routines where family_id = '${family}'),
s(key, x, y, size, tilt, i) as (values ${STICKERS.map(([k, x, y, sz, t], i) => `('${k}', ${x}, ${y}, ${sz}, ${t}, ${i})`).join(', ')}),
-- Spread over the days of this week that have passed (never today: the real awards go there).
slots as (
  select s.*, ((select ws from week) + (s.i % greatest((select d - ws from week), 1)))::date as day,
         (select id from r where n = 1 + (s.i / greatest((select d - ws from week), 1)) % greatest((select count(*) from r), 1)) as routine_id
  from s
)
insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys, sticker_key, x, y, size, tilt, placed_at)
select '${family}', d.kid_id, d.id, 'routine', sl.routine_id, sl.day, array[sl.key], sl.key, sl.x, sl.y, sl.size, sl.tilt, sl.day + time '12:00'
from public.kid_decks d, slots sl, week
where d.family_id = '${family}' and d.week_start = week.ws and sl.day < week.d and sl.routine_id is not null
  and sl.i < 4 * (week.d - week.ws) -- the four-a-day cap
on conflict do nothing;

insert into public.checkin_moments (family_id, kid_id, label, at_time)
select '${family}', k.id, 'After school', '15:00' from public.kids k
where k.family_id = '${family}'
  and not exists (select 1 from public.checkin_moments m where m.kid_id = k.id and m.label = 'After school')
  and (select count(*) from public.checkin_moments m where m.kid_id = k.id) < 3;
commit;
select count(*) from public.sticker_awards where family_id = '${family}';
`);
console.log(`"${name}": routines earn stickers, this week's decks and an After school (3:00) moment are in. Stickers on decks: ${out.split('\n').pop()}.`);
console.log('Monday has no earlier days this week, so a Monday deck starts empty.');
