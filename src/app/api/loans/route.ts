import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db()`select l.id, b.full_name as borrower, l.principal, l.monthly_interest_rate as rate, l.start_date, l.due_date, l.status, coalesce(sum(p.amount), 0) as paid from loans l join borrowers b on b.id = l.borrower_id left join payments p on p.loan_id = l.id group by l.id, b.full_name order by l.due_date asc`;
    return NextResponse.json(rows);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const borrower = String(body.borrower || "").trim(); const principal = Number(body.principal); const rate = Number(body.rate);
    if (!borrower || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || !body.start || !body.due) return NextResponse.json({ error: "Please provide valid loan details." }, { status: 400 });
    const sql = db(); const [person] = await sql`insert into borrowers (full_name) values (${borrower}) returning id, full_name`;
    const [loan] = await sql`insert into loans (borrower_id, principal, monthly_interest_rate, start_date, due_date) values (${person.id}, ${principal}, ${rate}, ${body.start}, ${body.due}) returning id, principal, monthly_interest_rate as rate, start_date, due_date, status`;
    return NextResponse.json({ ...loan, borrower: person.full_name, paid: 0 }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database error" }, { status: 503 }); }
}
