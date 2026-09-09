-- Preserve each day's report and progress so retries resume unsent parts.
alter table public.telegram_delivery_logs add column if not exists message_parts jsonb not null default '[]'::jsonb;
alter table public.telegram_delivery_logs add column if not exists sent_parts integer not null default 0;
