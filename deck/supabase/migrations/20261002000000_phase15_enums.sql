-- The Deck: Phase 1.5 slice 1, part 0. New values on existing enums.
-- A value added with ALTER TYPE ... ADD VALUE can't be used in the same transaction, so these
-- live in their own migration ahead of the tables that use them.

alter type public.routine_slot add value if not exists 'other';      -- routines.type: morning | after_school | bedtime | other
alter type public.event_kind add value if not exists 'school' before 'trip'; -- drives the school stickers
