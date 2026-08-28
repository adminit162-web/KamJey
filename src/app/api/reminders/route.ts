import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.TELEGRAM_ADMIN_CHAT_ID) return NextResponse.json({ error: "TELEGRAM_ADMIN_CHAT_ID is not configured." }, { status: 503 });
  try {
    const sql = db();
    const loans = await sql`select l.id, b.full_name as borrower, l.principal, l.monthly_interest_rate, l.start_date, l.due_date, coalesce(sum(p.amount), 0) as paid from loans l join borrowers b on b.id = l.borrower_id left join payments p on p.loan_id = l.id where l.status = 'active' group by l.id, b.full_name`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const reminders: { id: string; borrower: string; dueDate: string; remaining: number; days: number; kind: string }[] = [];
    for (const loan of loans) {
      const due = new Date(loan.due_date); due.setHours(0, 0, 0, 0); const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      if (![7, 3, 1, 0].includes(days)) continue;
      const months = Math.max(1, Math.round((due.getTime() - new Date(loan.start_date).getTime()) / 2_628_000_000));
      const remaining = Number(loan.principal) * (1 + Number(loan.monthly_interest_rate) / 100 * months) - Number(loan.paid);
      if (remaining <= 0) continue;
      const kind = `due-${days}`; const [sent] = await sql`select id from reminder_logs where loan_id = ${loan.id} and reminder_kind = ${kind}`;
      if (!sent) reminders.push({ id: loan.id, borrower: loan.borrower, dueDate: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }), remaining, days, kind });
    }
    if (!reminders.length) return NextResponse.json({ sent: 0 });
    const text = ["<b>KamJey payment reminders</b>", "", ...reminders.map((r) => `• <b>${r.borrower}</b> — ${money(r.remaining)}\n  Due ${r.dueDate} · ${r.days === 0 ? "due today" : `due in ${r.days} day(s)`}`)].join("\n");
    await sendTelegramMessage({ chatId: process.env.TELEGRAM_ADMIN_CHAT_ID, text });
    for (const reminder of reminders) await sql`insert into reminder_logs (loan_id, reminder_kind) values (${reminder.id}, ${reminder.kind})`;
    return NextResponse.json({ sent: reminders.length });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Reminder failed" }, { status: 503 }); }
}
