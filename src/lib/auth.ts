import { SignJWT, jwtVerify } from "jose";

const cookieName = "kamjey_session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "");

export async function createSession() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured.");
  return new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(key());
}

export async function verifySession(token?: string) {
  if (!token || !process.env.SESSION_SECRET) return false;
  try { await jwtVerify(token, key()); return true; } catch { return false; }
}

export { cookieName };
