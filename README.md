# KamJey

Personal loan dashboard built with Next.js.

## Monthly loan model

- A loan's first payment anniversary is one calendar month after its start date.
- Interest accrues monthly on the remaining principal.
- Payments cover accrued interest first; the remainder reduces principal.
- Borrowers may pay interest only, interest plus any principal amount, or the full balance.
- For start dates on the 29th-31st, shorter months use their final calendar day.

Run `db/schema.sql` in the Supabase SQL editor after pulling schema changes. The script can upgrade an existing KamJey database without deleting its records.

## Telegram reminders

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Copy `.env.example` to `.env.local`, then add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, and a long `CRON_SECRET`. Never paste the bot token into chat or commit `.env.local`.
3. Send a message to your bot, then use Telegram's `getUpdates` endpoint to find your `chat.id`.
4. Schedule a daily POST request to `/api/reminders` with `Authorization: Bearer <CRON_SECRET>`. Once the database is added, the job will retrieve due loans and supply their reminders automatically.

The endpoint is intentionally protected and does not send messages without the configured secret.
