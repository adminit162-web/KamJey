import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db()`select p.id, p.paid_at, p.amount, p.interest_amount, p.principal_amount, p.method, p.note, l.loan_number, b.full_name as borrower from payments p join loans l on l.id = p.loan_id join borrowers b on b.id = l.borrower_id order by p.paid_at desc, p.created_at desc`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Unable to load payments." }, { status: 503 });
  }
}
