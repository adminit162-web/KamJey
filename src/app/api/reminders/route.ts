import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

type Reminder = {
  borrowerName: string;
  amountDue: string;
  dueDate: string;
  daysUntilDue: number;
};

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) {
    return NextResponse.json({ error: "TELEGRAM_ADMIN_CHAT_ID is not configured." }, { status: 503 });
  }

  const { reminders } = await request.json() as { reminders?: Reminder[] };
  if (!reminders?.length) return NextResponse.json({ sent: 0 });

  const message = ["<b>KamJey payment reminders</b>", "", ...reminders.map((reminder) => {
    const timing = reminder.daysUntilDue < 0 ? `${Math.abs(reminder.daysUntilDue)} day(s) overdue` : `due in ${reminder.daysUntilDue} day(s)`;
    return `• <b>${reminder.borrowerName}</b> — ${reminder.amountDue}\n  ${reminder.dueDate} · ${timing}`;
  })].join("\n");

  await sendTelegramMessage({ chatId, text: message });
  return NextResponse.json({ sent: reminders.length });
}
