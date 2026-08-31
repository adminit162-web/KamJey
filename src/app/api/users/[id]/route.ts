import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sessionFromRequest, type UserRole } from "@/lib/auth";
import { db } from "@/lib/db";

type UserRow = { id: string; username: string; full_name: string; password_hash: string; role: UserRole; active: boolean; last_login_at: string | null; created_at: string };

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const sql = db();
    const [target] = await sql<UserRow[]>`select id, username, full_name, password_hash, role, active, last_login_at, created_at from users where id = ${id}`;
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const nextRole: UserRole = body.role === "admin" || body.role === "staff" ? body.role : target.role;
    const nextActive = typeof body.active === "boolean" ? body.active : target.active;
    const nextFullName = typeof body.fullName === "string" ? body.fullName.trim() : target.full_name;
    const password = typeof body.password === "string" ? body.password : "";
    if (nextFullName.length < 2 || nextFullName.length > 80) return NextResponse.json({ error: "Full name must be 2–80 characters." }, { status: 400 });
    if (password && password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    if (id === session.id && (!nextActive || nextRole !== "admin")) return NextResponse.json({ error: "You cannot disable or demote your own account." }, { status: 400 });
    if (target.role === "admin" && target.active && (!nextActive || nextRole !== "admin")) {
      const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from users where role = 'admin' and active`;
      if (count <= 1) return NextResponse.json({ error: "At least one active administrator is required." }, { status: 400 });
    }

    const nextPasswordHash = password ? await bcrypt.hash(password, 12) : target.password_hash;
    const [user] = await sql`update users set full_name = ${nextFullName}, password_hash = ${nextPasswordHash}, role = ${nextRole}, active = ${nextActive}, updated_at = now() where id = ${id} returning id, username, full_name, role, active, last_login_at, created_at`;
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Unable to update user." }, { status: 503 });
  }
}
