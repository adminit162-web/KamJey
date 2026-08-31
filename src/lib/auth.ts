import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest } from "next/server";

const cookieName = "kamjey_session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "");

export type UserRole = "admin" | "staff";
export type SessionUser = { id: string; username: string; fullName: string; role: UserRole };
type SessionPayload = JWTPayload & { user: SessionUser };

export async function createSession(user: SessionUser) {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured.");
  return new SignJWT({ user }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(key());
}

export async function readSession(token?: string): Promise<SessionUser | null> {
  if (!token || !process.env.SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const user = (payload as SessionPayload).user;
    if (!user?.id || !user.username || !user.fullName || !["admin", "staff"].includes(user.role)) return null;
    return user;
  } catch {
    return null;
  }
}

export async function sessionFromRequest(request: NextRequest) {
  return readSession(request.cookies.get(cookieName)?.value);
}

export async function verifySession(token?: string) { return Boolean(await readSession(token)); }

export { cookieName };
