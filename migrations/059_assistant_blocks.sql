-- Travo's answers can carry small UI blocks (steps, facts, tips, places) next to the text. Additive.
alter table travel_assistant_messages add column if not exists blocks jsonb;
