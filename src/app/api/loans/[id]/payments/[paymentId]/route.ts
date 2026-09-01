import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const sqlDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const cents = (value: number) => Math.round(value * 100) / 100;

type Context = { params: Promise<{ id: string; paymentId: string }> };

function responseStatus(message: string) {
  if (message.includes("not found")) return 404;
  if (message.includes("Only") || message.includes("closed") || message.includes("between") || message.includes("exceed")) return 400;
  return 503;
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id, paymentId } = await context.params;
    const body = await request.json();
    const amount = cents(Number(body.amount));
    const paidAt = String(body.paidAt || "");
    const method = String(body.method || "").trim().slice(0, 60) || null;
    const note = String(body.note || "").trim().slice(0, 240) || null;
    const today = new Date().toISOString().slice(0, 10);
    if (!validId(id) || !validId(paymentId) || !Number.isFinite(amount) || amount <= 0 || !validDate(paidAt) || paidAt > today) {
      return NextResponse.json({ error: "Please provide a valid amount and date." }, { status: 400 });
    }

    const updated = await db().begin(async (transaction) => {
      const [loan] = await transaction`select current_principal, accrued_interest, interest_due_since, next_payment_date, payment_day, previous_monthly_date(next_payment_date, payment_day) as period_start from loans where id = ${id}::uuid for update`;
      const [payment] = await transaction`select id, amount, interest_amount, principal_amount, paid_at from payments where id = ${paymentId}::uuid and loan_id = ${id}::uuid for update`;
      if (!loan || !payment) throw new Error("Payment not found.");

      const [latest] = await transaction`select id from payments where loan_id = ${id}::uuid order by paid_at desc, created_at desc limit 1`;
      if (String(latest.id) !== paymentId) throw new Error("Only the most recent payment can be changed.");

      const periodStart = sqlDate(loan.period_start);
      const periodEnd = sqlDate(loan.next_payment_date);
      if (sqlDate(payment.paid_at) < periodStart) throw new Error("This payment belongs to a closed interest period.");
      if (paidAt < periodStart || paidAt > periodEnd) throw new Error(`Payment date must be between ${periodStart} and ${periodEnd}.`);

      const restoredPrincipal = cents(Number(loan.current_principal) + Number(payment.principal_amount));
      const restoredInterest = cents(Number(loan.accrued_interest) + Number(payment.interest_amount));
      const balance = cents(restoredPrincipal + restoredInterest);
      if (amount > balance) throw new Error(`Payment cannot exceed the ${balance.toFixed(2)} balance.`);

      const interestAmount = cents(Math.min(amount, restoredInterest));
      const principalAmount = cents(amount - interestAmount);
      const currentPrincipal = cents(restoredPrincipal - principalAmount);
      const accruedInterest = cents(restoredInterest - interestAmount);
      const interestDueSince = accruedInterest === 0 ? null : loan.interest_due_since ? sqlDate(loan.interest_due_since) : periodStart;

      const [record] = await transaction`update payments set amount = ${amount}, interest_amount = ${interestAmount}, principal_amount = ${principalAmount}, paid_at = ${paidAt}, method = ${method}, note = ${note} where id = ${paymentId}::uuid returning id, amount, interest_amount, principal_amount, paid_at, method, note`;
      await transaction`update loans set current_principal = ${currentPrincipal}, accrued_interest = ${accruedInterest}, interest_due_since = ${interestDueSince}::date, status = case when ${currentPrincipal} = 0 and ${accruedInterest} = 0 then 'paid' else 'active' end where id = ${id}::uuid`;
      return record;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payment.";
    return NextResponse.json({ error: message }, { status: responseStatus(message) });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { id, paymentId } = await context.params;
    if (!validId(id) || !validId(paymentId)) return NextResponse.json({ error: "Invalid payment." }, { status: 400 });

    await db().begin(async (transaction) => {
      const [loan] = await transaction`select current_principal, accrued_interest, interest_due_since, next_payment_date, payment_day, previous_monthly_date(next_payment_date, payment_day) as period_start from loans where id = ${id}::uuid for update`;
      const [payment] = await transaction`select id, interest_amount, principal_amount, paid_at from payments where id = ${paymentId}::uuid and loan_id = ${id}::uuid for update`;
      if (!loan || !payment) throw new Error("Payment not found.");

      const [latest] = await transaction`select id from payments where loan_id = ${id}::uuid order by paid_at desc, created_at desc limit 1`;
      if (String(latest.id) !== paymentId) throw new Error("Only the most recent payment can be deleted.");
      const periodStart = sqlDate(loan.period_start);
      if (sqlDate(payment.paid_at) < periodStart) throw new Error("This payment belongs to a closed interest period.");

      const currentPrincipal = cents(Number(loan.current_principal) + Number(payment.principal_amount));
      const accruedInterest = cents(Number(loan.accrued_interest) + Number(payment.interest_amount));
      const interestDueSince = accruedInterest === 0 ? null : loan.interest_due_since ? sqlDate(loan.interest_due_since) : periodStart;
      await transaction`delete from payments where id = ${paymentId}::uuid`;
      await transaction`update loans set current_principal = ${currentPrincipal}, accrued_interest = ${accruedInterest}, interest_due_since = ${interestDueSince}::date, status = case when ${currentPrincipal} = 0 and ${accruedInterest} = 0 then 'paid' else 'active' end where id = ${id}::uuid`;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete payment.";
    return NextResponse.json({ error: message }, { status: responseStatus(message) });
  }
}
