import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

const TIME_ZONE = "Asia/Phnom_Penh";
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number | string } };
};

function today() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function loanLines(rows: Record<string, unknown>[]) {
  if (!rows.length) return "No matching active loans.";
  return rows.map((row) => {
    const due = String(row.alert_date).slice(0, 10).split("-").reverse().join("/");
    const total = Number(row.current_principal) + Number(row.accrued_interest);
    return `<b>KJ-${String(row.loan_number).padStart(4, "0")}</b> · ${escapeHtml(String(row.borrower))}\nDue: ${due} · Balance: <b>${money(total)}</b>`;
  }).join("\n\n");
}

async function commandReply(text: string) {
  const sql = db();
  const currentDate = today();
  const [rawCommand, ...parts] = text.trim().split(/\s+/);
  const command = rawCommand.toLowerCase().split("@")[0];
  const baseQuery = sql`
    select l.loan_number, b.full_name as borrower, l.current_principal, l.accrued_interest,
      coalesce(l.interest_due_since, l.next_payment_date) as alert_date
    from loans l join borrowers b on b.id = l.borrower_id
    where l.status = 'active'
  `;

  if (command === "/today") {
    const rows = await sql`${baseQuery} and coalesce(l.interest_due_since, l.next_payment_date) = ${currentDate}::date order by l.loan_number`;
    return `<b>⏰ Due today</b>\n\n${loanLines(rows)}`;
  }
  if (command === "/overdue") {
    const rows = await sql`${baseQuery} and coalesce(l.interest_due_since, l.next_payment_date) < ${currentDate}::date order by alert_date, l.loan_number`;
    return `<b>🚨 Overdue loans</b>\n\n${loanLines(rows)}`;
  }
  if (command === "/upcoming") {
    const rows = await sql`${baseQuery} and coalesce(l.interest_due_since, l.next_payment_date) > ${currentDate}::date and coalesce(l.interest_due_since, l.next_payment_date) <= ${currentDate}::date + 7 order by alert_date, l.loan_number`;
    return `<b>📅 Due in the next 7 days</b>\n\n${loanLines(rows)}`;
  }
  if (command === "/loan") {
    const number = Number(parts.join("").replace(/^kj-/i, ""));
    if (!Number.isInteger(number) || number <= 0) return "Use: /loan KJ-0001";
    const rows = await sql`${baseQuery} and l.loan_number = ${number}`;
    return `<b>🔎 Loan details</b>\n\n${loanLines(rows)}`;
  }
  if (command === "/borrower") {
    const name = parts.join(" ").trim();
    if (name.length < 2) return "Use: /borrower borrower name";
    const rows = await sql`${baseQuery} and b.full_name ilike ${`%${name}%`} order by l.loan_number limit 20`;
    return `<b>🔎 Borrower search</b>\n\n${loanLines(rows)}`;
  }
  if (command === "/summary") {
    const [row] = await sql`
      select count(*)::integer as active,
        count(*) filter (where coalesce(interest_due_since, next_payment_date) = ${currentDate}::date)::integer as due_today,
        count(*) filter (where coalesce(interest_due_since, next_payment_date) < ${currentDate}::date)::integer as overdue,
        coalesce(sum(current_principal), 0) as principal, coalesce(sum(accrued_interest), 0) as interest
      from loans where status = 'active'
    `;
    return [`<b>📊 Loan summary</b>`, `Active loans: <b>${row.active}</b>`, `Due today: <b>${row.due_today}</b>`, `Overdue: <b>${row.overdue}</b>`, `Principal: <b>${money(Number(row.principal))}</b>`, `Accrued interest: <b>${money(Number(row.interest))}</b>`].join("\n");
  }
  return ["<b>KamJey loan tracker</b>", "/today — payments due today", "/overdue — overdue loans", "/upcoming — due in 7 days", "/loan KJ-0001 — one loan", "/borrower name — search borrowers", "/summary — portfolio totals", "/help — this list"].join("\n");
}

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const update = await request.json() as TelegramUpdate;
    const chatId = String(update.message?.chat?.id ?? "");
    const text = update.message?.text?.trim();
    if (!text || !chatId || chatId !== process.env.TELEGRAM_ADMIN_CHAT_ID) return NextResponse.json({ ok: true });
    const reply = await commandReply(text);
    await sendTelegramMessage({ chatId, text: reply });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook failed" }, { status: 503 });
  }
}
