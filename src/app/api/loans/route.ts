import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const sql = db();
    await sql`select accrue_loan(id, current_date) from loans where status = 'active'`;
    const rows = await sql`select l.id, l.loan_number, b.full_name as borrower, l.principal, l.current_principal, l.accrued_interest, l.next_interest_adjustment, l.interest_due_since, l.monthly_interest_rate as rate, l.start_date, l.next_payment_date, l.payment_day, l.status, coalesce(sum(p.amount), 0) as paid, coalesce(sum(p.interest_amount), 0) as interest_paid, coalesce(sum(p.principal_amount), 0) as principal_paid, count(p.id)::integer as payment_count, coalesce((select sum(t.amount) from loan_topups t where t.loan_id = l.id), 0) as total_topups, coalesce((select json_agg(json_build_object('amount', t.amount, 'topped_up_at', t.topped_up_at) order by t.topped_up_at, t.created_at) from loan_topups t where t.loan_id = l.id), '[]'::json) as topup_history from loans l join borrowers b on b.id = l.borrower_id left join payments p on p.loan_id = l.id group by l.id, b.full_name order by case when l.status = 'paid' then 2 when l.interest_due_since is not null and l.interest_due_since < current_date then 0 else 1 end, coalesce(l.interest_due_since, l.next_payment_date) asc, l.loan_number asc`;
    return NextResponse.json(rows);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const borrower = String(body.borrower || "").trim(); const principal = Number(body.principal); const rate = Number(body.rate); const start = String(body.start || "");
    if (!borrower || borrower.length > 120 || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || rate > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ error: "Please provide valid loan details." }, { status: 400 });
    const sql = db(); const [person] = await sql`insert into borrowers (full_name) values (${borrower}) returning id, full_name`;
    const [loan] = await sql`insert into loans (borrower_id, principal, current_principal, monthly_interest_rate, start_date, due_date, next_payment_date, payment_day) values (${person.id}, ${principal}, ${principal}, ${rate}, ${start}, next_monthly_date(${start}::date, extract(day from ${start}::date)::integer), next_monthly_date(${start}::date, extract(day from ${start}::date)::integer), extract(day from ${start}::date)::integer) returning id, loan_number, principal, current_principal, accrued_interest, monthly_interest_rate as rate, start_date, next_payment_date, status`;
    return NextResponse.json({ ...loan, borrower: person.full_name, paid: 0 }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error" }, { status: 503 }); }
}
