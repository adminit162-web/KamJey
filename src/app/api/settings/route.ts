import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const backups = await db()`select b.id, b.filename, b.status, b.error_message, b.created_at, u.full_name as requested_by_name from backup_logs b left join users u on u.id = b.requested_by order by b.created_at desc limit 5`;
  return NextResponse.json({
    general: { currency: "USD", dateFormat: "DD/MM/YY", interestModel: "Reducing balance" },
    integrations: { telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN), adminChat: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID), reminders: Boolean(process.env.CRON_SECRET) },
    security: { sessionSecret: Boolean(process.env.SESSION_SECRET) },
    backups,
  });
}
