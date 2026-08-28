import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const sqlDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const dayDifference = (later: string, earlier: string) => Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!validId(id)) return NextResponse.json({ error: "Invalid loan." }, { status: 400 });
    const rows = await db()`select id, amount, topped_up_at, partial_interest, principal_before, principal_after, note from loan_topups where loan_id = ${id}::uuid order by topped_up_at desc, created_at desc`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Unable to load top-up history." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const toppedUpAt = String(body.toppedUpAt || "");
    const today = new Date().toISOString().slice(0, 10);
    if (!validId(id) || !Number.isFinite(amount) || amount <= 0 || !validDate(toppedUpAt) || toppedUpAt > today) return NextResponse.json({ error: "Please provide a valid amount and a date that is not in the future." }, { status: 400 });

    const record = await db().begin(async (transaction) => {
      await transaction`select accrue_loan(${id}::uuid, ${toppedUpAt}::date)`;
      const [loan] = await transaction`select current_principal, monthly_interest_rate, next_payment_date, payment_day, previous_monthly_date(next_payment_date, payment_day) as period_start, status from loans where id = ${id}::uuid for update`;
      if (!loan) throw new Error("Loan not found.");
      if (loan.status === "paid") throw new Error("A paid loan cannot be topped up.");
      const nextPayment = sqlDate(loan.next_payment_date);
      const periodStart = sqlDate(loan.period_start);
      if (toppedUpAt < periodStart) throw new Error(`Top-up date must be within the current period beginning ${periodStart}.`);
      const periodDays = dayDifference(nextPayment, periodStart);
      const remainingDays = dayDifference(nextPayment, toppedUpAt);
      const fullInterest = amount * Number(loan.monthly_interest_rate) / 100;
      const partialInterest = Math.round(fullInterest * remainingDays / periodDays * 100) / 100;
      const adjustment = partialInterest - fullInterest;
      const principalBefore = Number(loan.current_principal);
      const principalAfter = principalBefore + amount;
      const [topup] = await transaction`insert into loan_topups (loan_id, amount, topped_up_at, partial_interest, principal_before, principal_after, note) values (${id}, ${amount}, ${toppedUpAt}, ${partialInterest}, ${principalBefore}, ${principalAfter}, ${body.note || null}) returning id, amount, topped_up_at, partial_interest, principal_before, principal_after, note`;
      await transaction`update loans set current_principal = ${principalAfter}, next_interest_adjustment = next_interest_adjustment + ${adjustment}, status = 'active' where id = ${id}::uuid`;
      return { ...topup, next_payment_date: nextPayment, period_start: periodStart, remaining_days: remainingDays, period_days: periodDays };
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record top-up.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : message.includes("cannot") || message.includes("must") ? 400 : 503 });
  }
}
