import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { cookieName, createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const plaintextMatches = typeof password === "string" && configuredPassword && Buffer.byteLength(password) === Buffer.byteLength(configuredPassword) && timingSafeEqual(Buffer.from(password), Buffer.from(configuredPassword));
  const hashMatches = typeof password === "string" && hash && await bcrypt.compare(password, hash);
  if (!plaintextMatches && !hashMatches) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, await createSession(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return response;
}
