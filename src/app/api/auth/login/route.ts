import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookieName, createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || typeof password !== "string" || !(await bcrypt.compare(password, hash))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, await createSession(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return response;
}
