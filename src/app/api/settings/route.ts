import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    general: { currency: "USD", dateFormat: "DD/MM/YY", interestModel: "Reducing balance" },
    integrations: { telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN), adminChat: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID), reminders: Boolean(process.env.CRON_SECRET) },
    security: { hashedPassword: Boolean(process.env.ADMIN_PASSWORD_HASH), sessionSecret: Boolean(process.env.SESSION_SECRET), plaintextPassword: Boolean(process.env.ADMIN_PASSWORD) },
  });
}
