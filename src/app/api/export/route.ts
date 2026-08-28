import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const sql = db();
    const [borrowers, loans, payments, topups] = await Promise.all([
      sql`select * from borrowers order by created_at`,
      sql`select * from loans order by loan_number`,
      sql`select * from payments order by paid_at, created_at`,
      sql`select * from loan_topups order by topped_up_at, created_at`,
    ]);
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), borrowers, loans, payments, topups }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="kamjey-export-${new Date().toISOString().slice(0, 10)}.json"` } });
  } catch {
    return NextResponse.json({ error: "Unable to export data." }, { status: 503 });
  }
}
