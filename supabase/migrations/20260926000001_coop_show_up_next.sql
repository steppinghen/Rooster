-- Kid-facing "Up next" screen after a video ends. Parent toggles in
-- Parent Settings; default on. Kid sees 3 next-newest videos from the
-- same channel plus a Back tile. No countdown, no autoplay — nothing
-- starts until the kid taps.

alter table coop_public_settings
  add column show_up_next bool not null default true;
