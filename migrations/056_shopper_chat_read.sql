-- Read receipts for the Titip Belanja chat: when each side last opened the thread.
set lock_timeout = '5s';
alter table shopping_chat_threads add column if not exists customer_read_at timestamptz;
alter table shopping_chat_threads add column if not exists admin_read_at timestamptz;
-- Existing threads: treat what each side already has no unread count for as read.
update shopping_chat_threads set customer_read_at = now() where customer_read_at is null and customer_unread = 0;
update shopping_chat_threads set admin_read_at = now() where admin_read_at is null and admin_unread = 0;
