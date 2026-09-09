import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { cambodiaToday, collectionReportParts } from "@/lib/telegram-collection";
import { currentTelegramLoans } from "@/lib/telegram-collection-data";
import { deliverReportParts } from "@/lib/telegram-report-delivery";

export const maxDuration = 300;

async function sendReport(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: "Telegram is not configured." }, { status: 503 });
  try {
    const sql = db();
    const today = cambodiaToday();
    const [claim] = await sql`
      insert into public.telegram_delivery_logs (delivery_key, delivery_kind, status)
      values (${`daily-collection-${today}`}, 'daily-collection', 'pending')
      on conflict (delivery_key) do update set status = 'pending', error_message = null,
        attempt_count = public.telegram_delivery_logs.attempt_count + 1, updated_at = now()
      where public.telegram_delivery_logs.status = 'failed'
        or (public.telegram_delivery_logs.status = 'pending' and public.telegram_delivery_logs.updated_at < now() - interval '15 minutes')
      returning id, attempt_count, message_parts, sent_parts
    `;
    if (!claim) return NextResponse.json({ reportSent: false, skipped: "Already sent or in progress" });
    try {
      let parts = claim.message_parts as string[];
      if (!parts.length) {
        parts = collectionReportParts(await currentTelegramLoans(sql, today), today);
        await sql`update public.telegram_delivery_logs set message_parts = ${sql.json(parts)}, updated_at = now() where id = ${claim.id} and attempt_count = ${claim.attempt_count}`;
      }
      await deliverReportParts(parts, Number(claim.sent_parts),
        text => sendTelegramMessage({ chatId, text }),
        async count => {
          const saved = await sql`update public.telegram_delivery_logs set sent_parts = ${count}, updated_at = now() where id = ${claim.id} and attempt_count = ${claim.attempt_count} returning id`;
          if (!saved.length) throw new Error("Report delivery claim expired.");
        });
      await sql`update public.telegram_delivery_logs set status = 'sent', updated_at = now() where id = ${claim.id} and attempt_count = ${claim.attempt_count}`;
      return NextResponse.json({ reportSent: true, parts: parts.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Collection report failed";
      await sql`update public.telegram_delivery_logs set status = 'failed', error_message = ${message}, updated_at = now() where id = ${claim.id} and attempt_count = ${claim.attempt_count}`;
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection report failed" }, { status: 503 });
  }
}
export async function GET(request: NextRequest) { return sendReport(request); }
export async function POST(request: NextRequest) { return sendReport(request); }
