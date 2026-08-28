import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.TELEGRAM_ADMIN_CHAT_ID) return NextResponse.json({ error: "TELEGRAM_ADMIN_CHAT_ID is not configured." }, { status: 503 });
  try {
    const sql = db();
    await sql`select accrue_loan(id, current_date) from loans where status = 'active'`;
    const loans = await sql`select l.id, b.full_name as borrower, l.current_principal, l.accrued_interest, l.monthly_interest_rate, l.next_payment_date, l.interest_due_since from loans l join borrowers b on b.id = l.borrower_id where l.status = 'active'`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const reminders: { id: string; borrower: string; dueDate: string; remaining: number; interest: number; days: number; kind: string }[] = [];
    for (const loan of loans) {
      const dateValue = String(loan.interest_due_since || loan.next_payment_date).slice(0, 10);
      const due = new Date(`${dateValue}T00:00:00`);
      const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      if (![7, 3, 1, 0].includes(days)) continue;
      const remaining = Number(loan.current_principal) + Number(loan.accrued_interest);
      const interest = Number(loan.accrued_interest) || Number(loan.current_principal) * Number(loan.monthly_interest_rate) / 100;
      if (remaining <= 0) continue;
      const kind = `${dateValue}-due-${days}`;
      const [sent] = await sql`select id from reminder_logs where loan_id = ${loan.id} and reminder_kind = ${kind}`;
      if (!sent) reminders.push({ id: loan.id, borrower: loan.borrower, dueDate: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }), remaining, interest, days, kind });
    }
    if (!reminders.length) return NextResponse.json({ sent: 0 });
    const text = ["<b>KamJey payment reminders</b>", "", ...reminders.map((reminder) => `• <b>${escapeHtml(reminder.borrower)}</b> — interest ${money(reminder.interest)}\n  Balance ${money(reminder.remaining)} · due ${reminder.dueDate} · ${reminder.days === 0 ? "today" : `in ${reminder.days} day(s)`}`)].join("\n");
    await sendTelegramMessage({ chatId: process.env.TELEGRAM_ADMIN_CHAT_ID, text });
    for (const reminder of reminders) await sql`insert into reminder_logs (loan_id, reminder_kind) values (${reminder.id}, ${reminder.kind}) on conflict do nothing`;
    return NextResponse.json({ sent: reminders.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reminder failed" }, { status: 503 });
  }
}
