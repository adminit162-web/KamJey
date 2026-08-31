import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { cookieName, createSession, type UserRole } from "@/lib/auth";
import { db } from "@/lib/db";

type DbUser = { id: string; username: string; full_name: string; password_hash: string; role: UserRole; active: boolean };

function safePlaintextMatch(password: string) {
  const configured = process.env.ADMIN_PASSWORD;
  return Boolean(configured && Buffer.byteLength(password) === Buffer.byteLength(configured) && timingSafeEqual(Buffer.from(password), Buffer.from(configured)));
}

async function matchesBootstrapPassword(password: string) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  return safePlaintextMatch(password) || Boolean(hash && await bcrypt.compare(password, hash));
}

async function bootstrapAdmin(username: string, password: string) {
  if (username !== "admin" || !await matchesBootstrapPassword(password)) return null;
  const sql = db();
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from users`;
  if (count !== 0) return null;
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`insert into users (username, full_name, password_hash, role) values ('admin', 'KamJey Admin', ${passwordHash}, 'admin') on conflict do nothing`;
  const [created] = await sql<DbUser[]>`select id, username, full_name, password_hash, role, active from users where lower(username) = 'admin' limit 1`;
  return created ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) return NextResponse.json({ error: "Username and password are required." }, { status: 400 });

    const sql = db();
    let user: DbUser | undefined = (await sql<DbUser[]>`select id, username, full_name, password_hash, role, active from users where lower(username) = ${username} limit 1`)[0];
    if (!user) user = await bootstrapAdmin(username, password) ?? undefined;
    if (!user || !user.active || !await bcrypt.compare(password, user.password_hash)) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }

    await sql`update users set last_login_at = now() where id = ${user.id}`;
    const sessionUser = { id: user.id, username: user.username, fullName: user.full_name, role: user.role };
    const response = NextResponse.json({ ok: true, user: sessionUser });
    response.cookies.set(cookieName, await createSession(sessionUser), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to sign in. Confirm the database schema is up to date." }, { status: 503 });
  }
}
