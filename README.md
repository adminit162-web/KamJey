# KamJey

Personal loan dashboard built with Next.js.

## Telegram reminders

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Copy `.env.example` to `.env.local`, then add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, and a long `CRON_SECRET`. Never paste the bot token into chat or commit `.env.local`.
3. Send a message to your bot, then use Telegram's `getUpdates` endpoint to find your `chat.id`.
4. Schedule a daily POST request to `/api/reminders` with `Authorization: Bearer <CRON_SECRET>`. Once the database is added, the job will retrieve due loans and supply their reminders automatically.

The endpoint is intentionally protected and does not send messages without the configured secret.
