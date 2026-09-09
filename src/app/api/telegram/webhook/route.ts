import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { cambodiaToday, collectionLoanDetails, money } from "@/lib/telegram-collection";
import { currentTelegramLoans } from "@/lib/telegram-collection-data";

type TelegramUpdate = { message?: { text?: string; chat?: { id?: number | string } } };

async function commandReply(text: string) {
  const [rawCommand, ...parts] = text.trim().split(/\s+/);
  const command = rawCommand.toLowerCase().split("@")[0];
  if (!["/today", "/overdue", "/upcoming", "/loan", "/borrower", "/summary"].includes(command)) {
    return ["<b>KamJey loan tracker</b>", "/today — payments due today", "/overdue — overdue loans", "/upcoming — due in 7 days", "/loan KJ-0001 — one loan", "/borrower name — search borrowers", "/summary — portfolio totals", "/help — this list"].join("\n");
  }
  const loans = await currentTelegramLoans(db(), cambodiaToday());
  let matches = loans;
  let heading = "";
  if (command === "/today") { matches = loans.filter(l => l.days === 0); heading = "⏰ Due today"; }
  if (command === "/overdue") { matches = loans.filter(l => l.days < 0); heading = "🚨 Overdue loans"; }
  if (command === "/upcoming") { matches = loans.filter(l => l.days > 0 && l.days <= 7); heading = "📅 Due in the next 7 days"; }
  if (command === "/loan") {
    const number = Number(parts.join("").replace(/^kj-/i, ""));
    if (!Number.isInteger(number) || number <= 0) return "Use: /loan KJ-0001";
    matches = loans.filter(l => l.loanNumber === number); heading = "🔎 Loan details";
  }
  if (command === "/borrower") {
    const name = parts.join(" ").trim().toLowerCase();
    if (name.length < 2) return "Use: /borrower borrower name";
    matches = loans.filter(l => l.borrower.toLowerCase().includes(name)).slice(0, 20); heading = "🔎 Borrower search";
  }
  if (command === "/summary") {
    const due = loans.filter(l => l.days === 0), overdue = loans.filter(l => l.days < 0), upcoming = loans.filter(l => l.days > 0 && l.days <= 3);
    const interest = (items: typeof loans) => money(items.reduce((sum,l) => sum + l.interest, 0));
    return ["<b>📊 Loan summary</b>", `Active loans: ${loans.length}`, `Due today: ${due.length} · Interest: <b>${interest(due)}</b>`, `Overdue: ${overdue.length} · Unpaid interest: <b>${interest(overdue)}</b>`, `Due within 3 days: ${upcoming.length} · Interest: <b>${interest(upcoming)}</b>`, `Principal remaining: <b>${money(loans.reduce((sum,l) => sum + l.principal, 0))}</b>`].join("\n");
  }
  matches.sort((a,b) => a.days - b.days || a.loanNumber - b.loanNumber);
  return `<b>${heading}</b>\n\n` + (matches.length ? matches.map(l => `${collectionLoanDetails(l)}\nPrincipal + interest: <b>${money(l.principal + l.interest)}</b>`).join("\n\n") : "No matching active loans.");
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
