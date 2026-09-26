-- Fix: pgcrypto lives in the `extensions` schema on Supabase, so the
-- SECURITY DEFINER functions with `search_path = public` couldn't find
-- crypt() / gen_salt(). Add `extensions` to their search_path.

alter function coop_verify_parent_pin(text)      set search_path = public, extensions;
alter function coop_set_parent_pin(text)         set search_path = public, extensions;
alter function coop_verify_kid_pin(uuid, text)   set search_path = public, extensions;
alter function coop_set_kid_pin(uuid, text)      set search_path = public, extensions;
alter function coop_clear_kid_pin(uuid)          set search_path = public, extensions;
