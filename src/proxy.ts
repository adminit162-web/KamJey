import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";

const adminPaths = ["/settings", "/api/settings", "/api/users", "/api/export", "/api/backups"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/reminders") return NextResponse.next();

  const session = await readSession(request.cookies.get("kamjey_session")?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (adminPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) && session.role !== "admin") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"] };
