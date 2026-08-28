import { NextRequest, NextResponse } from "next/server";
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
    const sql = db();
    const payment = await sql.begin(async (transaction) => {
      await transaction`select accrue_loan(${id}::uuid, ${paidAt}::date)`;
      const [loan] = await transaction`select current_principal, accrued_interest from loans where id = ${id}::uuid for update`;
      if (!loan) throw new Error("Loan not found.");
      const balance = Number(loan.current_principal) + Number(loan.accrued_interest);
      if (amount > balance) throw new Error(`Payment cannot exceed the ${balance.toFixed(2)} balance.`);
      const interestAmount = Math.min(amount, Number(loan.accrued_interest));
      const principalAmount = amount - interestAmount;
      const [record] = await transaction`insert into payments (loan_id, amount, interest_amount, principal_amount, paid_at, method, note) values (${id}, ${amount}, ${interestAmount}, ${principalAmount}, ${paidAt}, ${body.method || null}, ${body.note || null}) returning id, amount, interest_amount, principal_amount, paid_at, method, note`;
      await transaction`update loans set accrued_interest = accrued_interest - ${interestAmount}, interest_due_since = case when accrued_interest - ${interestAmount} = 0 then null else interest_due_since end, current_principal = current_principal - ${principalAmount}, status = case when current_principal - ${principalAmount} = 0 and accrued_interest - ${interestAmount} = 0 then 'paid' else 'active' end where id = ${id}`;
      return record;
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to record payment."; return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : message.includes("exceed") ? 400 : 503 }); }
}
