import { NextRequest, NextResponse } from "next/server";
import { allocatePayment } from "@/lib/payment-allocation";
import { db } from "@/lib/db";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid loan." }, { status: 400 });
    const payments = await db()`select id, amount, interest_amount, principal_amount, paid_at, method, note from payments where loan_id = ${id}::uuid order by paid_at desc, created_at desc`;
    return NextResponse.json(payments);
  } catch {
    return NextResponse.json({ error: "Unable to load payment history." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const body = await request.json(); const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
    const paidAt = String(body.paidAt || new Date().toISOString().slice(0, 10));
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return NextResponse.json({ error: "Invalid loan or payment date." }, { status: 400 });
    const adjusted = body.interestAmount !== undefined;
    if (adjusted && (typeof body.interestAmount !== "number" || !Number.isFinite(body.interestAmount))) return NextResponse.json({ error: "Invalid interest amount." }, { status: 400 });
    const sql = db();
    const payment = await sql.begin(async (transaction) => {
      await transaction`select accrue_loan(${id}::uuid, ${paidAt}::date)`;
      const [loan] = await transaction`select current_principal, accrued_interest, monthly_interest_rate, next_interest_adjustment, next_payment_date::text as next_date from loans where id = ${id}::uuid for update`;
      if (!loan) throw new Error("Loan not found.");
      const upcoming = Math.max(0, Math.round((Number(loan.current_principal) * Number(loan.monthly_interest_rate) / 100 + Number(loan.next_interest_adjustment)) * 100) / 100);
      if (adjusted && body.interestDueDate !== loan.next_date) throw new Error("Interest date changed. Please reopen the payment form.");
      const split = allocatePayment(amount, Number(loan.current_principal), Number(loan.accrued_interest), adjusted ? upcoming : 0, Number(loan.monthly_interest_rate), adjusted ? body.interestAmount : undefined);
      if (split.earlyInterest > 0 && paidAt >= loan.next_date) throw new Error("Interest date changed. Please reopen the payment form.");
      const [record] = await transaction`insert into payments (loan_id, amount, interest_amount, principal_amount, paid_at, method, note, split_adjusted, early_interest_amount, early_interest_due_date, interest_adjustment_delta) values (${id}, ${amount}, ${split.interest}, ${split.principalAmount}, ${paidAt}, ${body.method || null}, ${body.note || null}, ${adjusted}, ${split.earlyInterest}, ${split.earlyInterest > 0 ? loan.next_date : null}, ${split.adjustmentDelta}) returning id, amount, interest_amount, principal_amount, paid_at, method, note`;
      await transaction`update loans set accrued_interest = ${split.accruedAfter}, interest_due_since = case when ${split.accruedAfter} = 0 then null else interest_due_since end, next_interest_adjustment = next_interest_adjustment - ${split.adjustmentDelta}, current_principal = current_principal - ${split.principalAmount}, status = case when current_principal - ${split.principalAmount} = 0 and ${split.accruedAfter} = 0 then 'paid' else 'active' end where id = ${id}`;
      return record;
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to record payment."; return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : (message.includes("exceed") || message.includes("between") || message.includes("reopen")) ? 400 : 503 }); }
}
