-- Maximum video length applied at read time to every feed, Up Next, and
-- search on the kid side. Filter is: duration_seconds IS NULL OR
-- duration_seconds <= max_video_seconds — NULL passes so
-- parent-approved one-offs that haven't been backfilled yet stay
-- visible.
--   NULL       — no cap (option "No limit")
--   int > 0    — max length in seconds (30 min=1800, 1h=3600, ...)
-- Default 10800 (3 hours).
alter table coop_public_settings
  add column max_video_seconds int default 10800
  check (max_video_seconds is null or max_video_seconds > 0);
