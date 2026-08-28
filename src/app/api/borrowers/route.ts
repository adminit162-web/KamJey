import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db()`select b.id, b.full_name, b.phone, b.address, count(l.id)::int as loan_count, count(l.id) filter (where l.status = 'active')::int as active_loans, coalesce(sum(l.current_principal), 0) as principal_remaining, coalesce(sum(l.accrued_interest), 0) as interest_due, coalesce(sum(p.total_paid), 0) as total_paid from borrowers b left join loans l on l.borrower_id = b.id left join lateral (select sum(amount) as total_paid from payments where loan_id = l.id) p on true group by b.id order by b.full_name`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Unable to load borrowers." }, { status: 503 });
  }
}
