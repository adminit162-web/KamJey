import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sessionFromRequest, type UserRole } from "@/lib/auth";
import { db } from "@/lib/db";

const usernamePattern = /^[a-z0-9._-]{3,32}$/;

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const users = await db()`select id, username, full_name, role, active, last_login_at, created_at from users order by case when role = 'admin' then 0 else 1 end, full_name`;
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role: UserRole = body.role === "admin" ? "admin" : "staff";
    if (!usernamePattern.test(username)) return NextResponse.json({ error: "Username must be 3–32 characters using letters, numbers, dots, dashes, or underscores." }, { status: 400 });
    if (fullName.length < 2 || fullName.length > 80) return NextResponse.json({ error: "Full name must be 2–80 characters." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db()`insert into users (username, full_name, password_hash, role) values (${username}, ${fullName}, ${passwordHash}, ${role}) returning id, username, full_name, role, active, last_login_at, created_at`;
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "That username is already in use." }, { status: 409 });
    return NextResponse.json({ error: "Unable to create user." }, { status: 503 });
  }
}
