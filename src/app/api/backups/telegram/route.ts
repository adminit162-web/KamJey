import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth";
import { createDataBackup } from "@/lib/backup";
import { db } from "@/lib/db";
import { sendTelegramDocument } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: "Telegram bot and admin chat must be configured." }, { status: 400 });
  const filename = `kamjey-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  try {
    const backup = await createDataBackup();
    await sendTelegramDocument({ chatId, filename, content: JSON.stringify(backup, null, 2), caption: `KamJey backup created by ${session.fullName}` });
    await db()`insert into backup_logs (requested_by, filename, status) values (${session.id}, ${filename}, 'sent')`;
    return NextResponse.json({ ok: true, filename, sentAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown backup error";
    try { await db()`insert into backup_logs (requested_by, filename, status, error_message) values (${session.id}, ${filename}, 'failed', ${message})`; } catch {}
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
