"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitcher, useLanguage } from "./language-provider";
import type { SessionUser } from "@/lib/auth";

type SidebarIconName = "overview" | "loans" | "borrowers" | "payments" | "settings" | "sign-out";

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const paths: Record<SidebarIconName, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    loans: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h4"/><circle cx="17" cy="14" r="1.5"/></>,
    borrowers: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    payments: <><path d="M7 7h12l-3-3M17 17H5l3 3M19 7l-3 3M5 17l3-3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.43 9 1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    "sign-out": <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const navigation = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/loans", label: "Loans", icon: "loans" },
  { href: "/borrowers", label: "Borrowers", icon: "borrowers" },
  { href: "/payments", label: "Payments", icon: "payments" },
] as const;

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => { if (pathname !== "/login") fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((body) => setUser(body?.user ?? null)); }, [pathname]);
  if (pathname === "/login") return children;

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }

  return <div className="app-shell">
    <button className="mobile-menu-button" onClick={() => setOpen(true)} aria-label={t("Open navigation")}>☰</button>
    {open && <button className="mobile-nav-overlay" aria-label={t("Close navigation")} onClick={() => setOpen(false)}/>}
    <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
      <div className="brand"><span className="brand-mark"><Image src="/kamjey-logo.png" alt="" width={31} height={31} priority /></span><span>KamJey</span><button className="mobile-close" onClick={() => setOpen(false)} aria-label={t("Close navigation")}>×</button></div>
      <LanguageSwitcher />
      <nav>{navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={pathname === item.href ? "nav-item active" : "nav-item"}><span className="nav-icon"><SidebarIcon name={item.icon} /></span>{t(item.label)}</Link>)}</nav>
      <div className="sidebar-bottom">
        {user?.role === "admin" && <Link href="/settings" onClick={() => setOpen(false)} className={pathname === "/settings" ? "nav-item active" : "nav-item"}><span className="nav-icon"><SidebarIcon name="settings" /></span>{t("Settings")}</Link>}
        <button className="nav-item sign-out" onClick={logout}><span className="nav-icon"><SidebarIcon name="sign-out" /></span>{t("Sign out")}</button>
        <div className="profile"><div className="avatar navy">{user?.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "KJ"}</div><div><strong>{user?.fullName || "KamJey"}</strong><small>{user ? `${user.role === "admin" ? t("Administrator") : t("Staff")} · @${user.username}` : t("Loading…")}</small></div></div>
      </div>
    </aside>
    <section className="content">{children}</section>
  </div>;
}
