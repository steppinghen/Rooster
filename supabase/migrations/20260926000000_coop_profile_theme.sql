-- Per-kid theme + layout preferences for the kid-side UI redesign.
--   accent_color / on_accent_text: paired so the parent can pick a
--     background hue and a readable text color for text-on-accent
--     (Play button, "New from" label, selected nav accent).
--   nav_style: sidebar (248px full nav w/ channel list) or rail
--     (96px icon-only). Editable in Parent Mode.
--   tile_size: regular or large. Affects channel tile size on Home
--     and, indirectly, home-row density.
--
-- The two current kids are seeded to the values the user specified:
--   RC:    sage    #A9D3BE, on-accent #14231C, sidebar, regular
--   Brody: sky     #9CC8E8, on-accent #0F1E2A, rail,    large

alter table coop_profiles
  add column accent_color   text not null default '#A9D3BE'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column on_accent_text text not null default '#14231C'
    check (on_accent_text ~ '^#[0-9A-Fa-f]{6}$'),
  add column nav_style      text not null default 'sidebar'
    check (nav_style in ('sidebar','rail')),
  add column tile_size      text not null default 'regular'
    check (tile_size in ('regular','large'));

update coop_profiles
   set accent_color   = '#A9D3BE',
       on_accent_text = '#14231C',
       nav_style      = 'sidebar',
       tile_size      = 'regular'
 where name = 'RC';

update coop_profiles
   set accent_color   = '#9CC8E8',
       on_accent_text = '#0F1E2A',
       nav_style      = 'rail',
       tile_size      = 'large'
 where name = 'Brody';
