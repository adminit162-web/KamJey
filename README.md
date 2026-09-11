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
4. Vercel schedules the daily GET request to `/api/reminders` for 08:00 Cambodia time with `Authorization: Bearer <CRON_SECRET>`. Actual invocation time depends on the hosting plan.
5. Run `db/schema.sql` after pulling changes. It adds delivery status and retry logs without removing existing records.

The daily run sends one collection report grouped into due today, due within the next 3 days, and overdue. Each loan appears once, with remaining principal, interest to collect, and days overdue when applicable. The report includes interest totals for each group. Individual reminders and the previous portfolio summary are no longer sent. Commands retain their existing names; `/upcoming` still covers 7 days.

Apply `db/migrations/20260909_telegram_collection.sql` before deploying this version (also included in `db/schema.sql`). Reports are saved by Cambodia calendar date. Successful parts are checkpointed; a failed same-day run resumes unsent parts, and concurrent or completed runs are skipped. Temporary Telegram failures are retried up to three times per request with bounded waits and timeouts. A missed day is replaced by the next day's fresh report, which still includes unpaid loans; old reports are not replayed. To retry sooner, rerun the Cron Job from Vercel. An ambiguous network failure after Telegram accepts a message can still cause a duplicate, because Telegram provides no idempotency key.

Interest is projected through the current Cambodia date using the monthly loan rules, including unpaid balances and top-up adjustments. Reports and commands do not modify financial records. Principal is informational, not a required principal installment.

Run the focused checks with `node --test tests/telegram-collection.mjs`.

### Telegram commands

Set a separate `TELEGRAM_WEBHOOK_SECRET`, deploy the application, and register this webhook with Telegram:

`https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`

Only `TELEGRAM_ADMIN_CHAT_ID` is allowed to use the webhook. Available read-only commands are `/today`, `/overdue`, `/upcoming`, `/loan KJ-0001`, `/borrower name`, `/summary`, and `/help`.

The endpoint is intentionally protected and does not send messages without the configured secret.

## Users and roles

- The first login creates the bootstrap administrator with username `admin` and the password configured by `ADMIN_PASSWORD_HASH` or `ADMIN_PASSWORD`.
- Administrators can manage users, settings, exports, and Telegram backups.
- Staff can manage borrowers, loans, top-ups, and payments, but cannot access settings or user management.
- Run `db/schema.sql` before deploying this feature so the `users` and `backup_logs` tables exist.

## Telegram data backups

Administrators can open Settings and send a timestamped JSON snapshot to `TELEGRAM_ADMIN_CHAT_ID`. The snapshot contains borrowers, loans, payments, top-ups, and reminder logs; password hashes are never included. Each attempted Telegram backup is recorded in `backup_logs`.

### Adjusting payment splits
Apply `db/migrations/20260911_payment_split.sql` (also included in `db/schema.sql`) before deploying. The payment form defaults to automatic allocation. “Adjust split” permits an explicit interest portion, covering accrued interest first and then the upcoming installment. Early payments retain their actual receipt date and store the upcoming due date and credit. When an early payment also reduces principal, the upcoming installment retains its pre-payment amount; following installments use the reduced principal. Editing an adjusted payment retains its interest portion; delete and re-record to change that portion. Existing closed-period edit/delete restrictions remain in place.
