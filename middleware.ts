import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/reminders") return NextResponse.next();
  if (await verifySession(request.cookies.get("kamjey_session")?.value)) return NextResponse.next();
  const url = new URL("/login", request.url); return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
