import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const sqlDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const daysBetween = (later: string, earlier: string) => Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);

type Context = { params: Promise<{ id: string; topupId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id, topupId } = await context.params;
    const body = await request.json();
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const toppedUpAt = String(body.toppedUpAt || "");
    const note = String(body.note || "").trim().slice(0, 240) || null;
    const today = new Date().toISOString().slice(0, 10);
    if (!validId(id) || !validId(topupId) || !Number.isFinite(amount) || amount <= 0 || !validDate(toppedUpAt) || toppedUpAt > today) return NextResponse.json({ error: "Please provide a valid amount and date." }, { status: 400 });

    const updated = await db().begin(async (transaction) => {
      const [loan] = await transaction`select current_principal, monthly_interest_rate, next_interest_adjustment, next_payment_date, payment_day, previous_monthly_date(next_payment_date, payment_day) as period_start from loans where id = ${id}::uuid for update`;
      const [topup] = await transaction`select id, amount, topped_up_at, partial_interest, principal_before from loan_topups where id = ${topupId}::uuid and loan_id = ${id}::uuid for update`;
      if (!loan || !topup) throw new Error("Top-up not found.");
      const [latest] = await transaction`select id from loan_topups where loan_id = ${id}::uuid order by topped_up_at desc, created_at desc limit 1`;
      if (String(latest.id) !== topupId) throw new Error("Only the most recent top-up can be changed.");
      const periodStart = sqlDate(loan.period_start);
      const nextPayment = sqlDate(loan.next_payment_date);
      if (sqlDate(topup.topped_up_at) < periodStart) throw new Error("This top-up belongs to a closed interest period.");
      if (toppedUpAt < periodStart || toppedUpAt > nextPayment) throw new Error(`Top-up date must be between ${periodStart} and ${nextPayment}.`);
      const periodDays = daysBetween(nextPayment, periodStart);
      const remainingDays = Math.max(0, daysBetween(nextPayment, toppedUpAt));
      const rate = Number(loan.monthly_interest_rate);
      const partialInterest = Math.round(amount * rate / 100 * remainingDays / periodDays * 100) / 100;
      const oldAdjustment = Number(topup.partial_interest) - Number(topup.amount) * rate / 100;
      const newAdjustment = partialInterest - amount * rate / 100;
      const delta = amount - Number(topup.amount);
      const currentPrincipal = Number(loan.current_principal) + delta;
      if (currentPrincipal < 0) throw new Error("The updated amount conflicts with payments already recorded.");
      const principalBefore = Number(topup.principal_before);
      const [record] = await transaction`update loan_topups set amount = ${amount}, topped_up_at = ${toppedUpAt}, partial_interest = ${partialInterest}, principal_after = ${principalBefore + amount}, note = ${note} where id = ${topupId}::uuid returning id, amount, topped_up_at, partial_interest, principal_before, principal_after, note`;
      await transaction`update loans set current_principal = ${currentPrincipal}, next_interest_adjustment = next_interest_adjustment - ${oldAdjustment} + ${newAdjustment} where id = ${id}::uuid`;
      return record;
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update top-up.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : message.includes("Only") || message.includes("period") || message.includes("between") || message.includes("conflicts") ? 400 : 503 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { id, topupId } = await context.params;
    if (!validId(id) || !validId(topupId)) return NextResponse.json({ error: "Invalid top-up." }, { status: 400 });
    await db().begin(async (transaction) => {
      const [loan] = await transaction`select current_principal, monthly_interest_rate, next_interest_adjustment, next_payment_date, payment_day, previous_monthly_date(next_payment_date, payment_day) as period_start from loans where id = ${id}::uuid for update`;
      const [topup] = await transaction`select id, amount, topped_up_at, partial_interest from loan_topups where id = ${topupId}::uuid and loan_id = ${id}::uuid for update`;
      if (!loan || !topup) throw new Error("Top-up not found.");
      const [latest] = await transaction`select id from loan_topups where loan_id = ${id}::uuid order by topped_up_at desc, created_at desc limit 1`;
      if (String(latest.id) !== topupId) throw new Error("Only the most recent top-up can be deleted.");
      if (sqlDate(topup.topped_up_at) < sqlDate(loan.period_start)) throw new Error("This top-up belongs to a closed interest period.");
      const currentPrincipal = Number(loan.current_principal) - Number(topup.amount);
      if (currentPrincipal < 0) throw new Error("This top-up cannot be deleted because payments already depend on it.");
      const adjustment = Number(topup.partial_interest) - Number(topup.amount) * Number(loan.monthly_interest_rate) / 100;
      await transaction`delete from loan_topups where id = ${topupId}::uuid`;
      await transaction`update loans set current_principal = ${currentPrincipal}, next_interest_adjustment = next_interest_adjustment - ${adjustment}, status = case when ${currentPrincipal} = 0 and accrued_interest = 0 then 'paid' else 'active' end where id = ${id}::uuid`;
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete top-up.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : message.includes("Only") || message.includes("period") || message.includes("depend") ? 400 : 503 });
  }
}
