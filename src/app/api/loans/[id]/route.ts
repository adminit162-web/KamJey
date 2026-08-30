import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const borrower = String(body.borrower || "").trim();
    const principal = Math.round(Number(body.principal) * 100) / 100;
    const rate = Number(body.rate);
    const nextPayment = String(body.nextPayment || "");
    if (!validId(id) || !borrower || borrower.length > 120 || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || rate > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(nextPayment)) {
      return NextResponse.json({ error: "Please provide valid loan details." }, { status: 400 });
    }
    const sql = db();
    const updated = await sql.begin(async (transaction) => {
      const [loan] = await transaction`select borrower_id, principal, monthly_interest_rate, accrued_interest, start_date::text as start_date, (select count(*)::int from payments where loan_id = loans.id) as payment_count, (select count(*)::int from loan_topups where loan_id = loans.id) as topup_count from loans where id = ${id}::uuid for update`;
      if (!loan) return null;
      if (nextPayment < loan.start_date) throw new Error("Next payment cannot be before the start date.");
      const changesFinancialTerms = principal !== Number(loan.principal) || rate !== Number(loan.monthly_interest_rate);
      const hasFinancialHistory = Number(loan.payment_count) > 0 || Number(loan.topup_count) > 0 || Number(loan.accrued_interest) > 0;
      if (changesFinancialTerms && hasFinancialHistory) throw new Error("Amount and rate cannot be changed after payments, added funds, or accrued interest exist.");
      await transaction`update borrowers set full_name = ${borrower} where id = ${loan.borrower_id}`;
      const [record] = await transaction`update loans set principal = ${principal}, current_principal = case when ${changesFinancialTerms} then ${principal} else current_principal end, monthly_interest_rate = ${rate}, next_interest_adjustment = case when ${changesFinancialTerms} then 0 else next_interest_adjustment end, next_payment_date = ${nextPayment}, due_date = ${nextPayment}, payment_day = extract(day from ${nextPayment}::date)::integer where id = ${id}::uuid returning id, principal, current_principal, monthly_interest_rate as rate, next_payment_date`;
      return record;
    });
    if (!updated) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
    return NextResponse.json({ ...updated, borrower });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update loan.";
    return NextResponse.json({ error: message }, { status: message.includes("before") || message.includes("cannot be changed") ? 400 : 503 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!validId(id)) return NextResponse.json({ error: "Invalid loan." }, { status: 400 });
    const sql = db();
    const removed = await sql.begin(async (transaction) => {
      const [loan] = await transaction`delete from loans where id = ${id}::uuid returning borrower_id`;
      if (!loan) return false;
      await transaction`delete from borrowers where id = ${loan.borrower_id} and not exists (select 1 from loans where borrower_id = ${loan.borrower_id})`;
      return true;
    });
    if (!removed) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete loan." }, { status: 503 });
  }
}
