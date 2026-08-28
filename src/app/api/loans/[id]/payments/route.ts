import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const body = await request.json(); const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
    const [payment] = await db()`insert into payments (loan_id, amount, paid_at, method, note) values (${id}, ${amount}, ${body.paidAt || new Date().toISOString().slice(0, 10)}, ${body.method || null}, ${body.note || null}) returning id, amount, paid_at, method, note`;
    return NextResponse.json(payment, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record payment." }, { status: 503 }); }
}
