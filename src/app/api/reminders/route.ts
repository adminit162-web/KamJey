import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

const PHNOM_PENH_TIME_ZONE = "Asia/Phnom_Penh";

const money = (amount: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
}).format(amount);

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function phnomPenhDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHNOM_PENH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function daysFromToday(dateValue: string, todayValue: string) {
  const due = Date.parse(`${dateValue}T00:00:00Z`);
  const today = Date.parse(`${todayValue}T00:00:00Z`);
  return Math.round((due - today) / 86_400_000);
}

function displayDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function alertDetails(days: number) {
  if (days === 3) return { kind: "three-days-before", heading: "🔔 Payment due in 3 days" };
  if (days === 0) return { kind: "due-today", heading: "⏰ Payment due today" };
  if (days === -1) return { kind: "one-day-overdue", heading: "🚨 Payment overdue by 1 day" };
  if (days < -1 && (Math.abs(days) - 1) % 3 === 0) return { kind: `${Math.abs(days)}-days-overdue`, heading: `🚨 Payment overdue by ${Math.abs(days)} days` };
  return null;
}

async function sendDailySummary(sql: ReturnType<typeof db>, chatId: string, today: string) {
  const deliveryKey = `daily-summary-${today}`;
  const [claim] = await sql`
    insert into telegram_delivery_logs (delivery_key, delivery_kind, status)
    values (${deliveryKey}, 'daily-summary', 'pending')
    on conflict (delivery_key) do update set status = 'pending', error_message = null,
      attempt_count = telegram_delivery_logs.attempt_count + 1, updated_at = now()
    where telegram_delivery_logs.status = 'failed'
      or (telegram_delivery_logs.status = 'pending' and telegram_delivery_logs.updated_at < now() - interval '15 minutes')
    returning id
  `;
  if (!claim) return false;
  try {
    const [summary] = await sql`
      select
        count(*) filter (where coalesce(interest_due_since, next_payment_date) = ${today}::date)::integer as due_today,
        count(*) filter (where coalesce(interest_due_since, next_payment_date) < ${today}::date)::integer as overdue,
        count(*) filter (where coalesce(interest_due_since, next_payment_date) > ${today}::date and coalesce(interest_due_since, next_payment_date) <= ${today}::date + 7)::integer as upcoming,
        coalesce(sum(current_principal), 0) as principal,
        coalesce(sum(accrued_interest), 0) as interest
      from loans where status = 'active'
    `;
    await sendTelegramMessage({ chatId, text: [
      `<b>📊 Daily loan summary — ${displayDate(today)}</b>`,
      `Due today: <b>${summary.due_today}</b>`,
      `Overdue: <b>${summary.overdue}</b>`,
      `Due in the next 7 days: <b>${summary.upcoming}</b>`,
      `Outstanding principal: <b>${money(Number(summary.principal))}</b>`,
      `Accrued interest: <b>${money(Number(summary.interest))}</b>`,
      "", "Commands: /today · /overdue · /upcoming · /summary",
    ].join("\n") });
    await sql`update telegram_delivery_logs set status = 'sent', updated_at = now() where id = ${claim.id}`;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Summary delivery failed";
    await sql`update telegram_delivery_logs set status = 'failed', error_message = ${message}, updated_at = now() where id = ${claim.id}`;
    throw error;
  }
}

async function sendReminders(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.TELEGRAM_ADMIN_CHAT_ID) {
    return NextResponse.json({ error: "TELEGRAM_ADMIN_CHAT_ID is not configured." }, { status: 503 });
  }

  try {
    const sql = db();
    const today = phnomPenhDate();
    await sql`select accrue_loan(id, ${today}::date) from loans where status = 'active'`;
    const loans = await sql`
      select l.id, l.loan_number, b.full_name as borrower, l.current_principal,
        l.accrued_interest, l.monthly_interest_rate, l.next_interest_adjustment,
        l.next_payment_date, l.interest_due_since
      from loans l
      join borrowers b on b.id = l.borrower_id
      where l.status = 'active'
    `;
    const reminders: {
      id: string;
      kind: string;
      heading: string;
      borrower: string;
      loanNumber: number;
      dueDate: string;
      principal: number;
      interest: number;
      total: number;
    }[] = [];

    for (const loan of loans) {
      const dateValue = String(loan.interest_due_since || loan.next_payment_date).slice(0, 10);
      const alert = alertDetails(daysFromToday(dateValue, today));
      if (!alert) continue;

      const principal = Number(loan.current_principal);
      const accruedInterest = Number(loan.accrued_interest);
      const scheduledInterest = Math.max(0, Math.round((principal * Number(loan.monthly_interest_rate) / 100 + Number(loan.next_interest_adjustment)) * 100) / 100);
      const interest = accruedInterest > 0 ? accruedInterest : scheduledInterest;
      if (principal + interest <= 0) continue;

      const kind = `${dateValue}-${alert.kind}`;
      reminders.push({
        id: String(loan.id),
        kind,
        heading: alert.heading,
        borrower: String(loan.borrower),
        loanNumber: Number(loan.loan_number),
        dueDate: displayDate(dateValue),
        principal,
        interest,
        total: principal + interest,
      });
    }

    let sentCount = 0;
    for (const reminder of reminders) {
      const [claim] = await sql`
        insert into reminder_logs (loan_id, reminder_kind, status) values (${reminder.id}, ${reminder.kind}, 'pending')
        on conflict (loan_id, reminder_kind) do update set status = 'pending', error_message = null,
          attempt_count = reminder_logs.attempt_count + 1, updated_at = now()
        where reminder_logs.status = 'failed'
          or (reminder_logs.status = 'pending' and reminder_logs.updated_at < now() - interval '15 minutes')
        returning id
      `;
      if (!claim) continue;
      const text = [
        `<b>${reminder.heading}</b>`,
        `<b>${escapeHtml(reminder.borrower)}</b> — KJ-${String(reminder.loanNumber).padStart(4, "0")}`,
        `Due: ${reminder.dueDate}`,
        `Interest due: ${money(reminder.interest)}`,
        `Principal remaining: ${money(reminder.principal)}`,
        `<b>Total balance: ${money(reminder.total)}</b>`,
      ].join("\n");
      try {
        await sendTelegramMessage({ chatId: process.env.TELEGRAM_ADMIN_CHAT_ID, text });
        await sql`update reminder_logs set status = 'sent', updated_at = now() where id = ${claim.id}`;
        sentCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reminder delivery failed";
        await sql`update reminder_logs set status = 'failed', error_message = ${message}, updated_at = now() where id = ${claim.id}`;
      }
    }
    const summarySent = await sendDailySummary(sql, process.env.TELEGRAM_ADMIN_CHAT_ID, today);
    return NextResponse.json({ sent: sentCount, summarySent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reminder failed" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  return sendReminders(request);
}

// Keep POST available for existing manual reminder calls.
export async function POST(request: NextRequest) {
  return sendReminders(request);
}
