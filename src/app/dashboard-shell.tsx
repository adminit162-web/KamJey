"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LanguageSwitcher, useLanguage } from "./language-provider";

const navigation = [
  { href: "/", label: "Overview", icon: "▦" },
  { href: "/loans", label: "Loans", icon: "▤" },
  { href: "/borrowers", label: "Borrowers", icon: "◉" },
  { href: "/payments", label: "Payments", icon: "↕" },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (pathname === "/login") return children;

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }

  return <div className="app-shell">
    <button className="mobile-menu-button" onClick={() => setOpen(true)} aria-label={t("Open navigation")}>☰</button>
    {open && <button className="mobile-nav-overlay" aria-label={t("Close navigation")} onClick={() => setOpen(false)}/>}
    <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
      <div className="brand"><span className="brand-mark">↗</span><span>KamJey</span><button className="mobile-close" onClick={() => setOpen(false)} aria-label={t("Close navigation")}>×</button></div>
      <LanguageSwitcher />
      <nav>{navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={pathname === item.href ? "nav-item active" : "nav-item"}><span>{item.icon}</span>{t(item.label)}</Link>)}</nav>
      <div className="sidebar-bottom">
        <Link href="/settings" onClick={() => setOpen(false)} className={pathname === "/settings" ? "nav-item active" : "nav-item"}><span>⚙</span>{t("Settings")}</Link>
        <button className="nav-item sign-out" onClick={logout}><span>↪</span>{t("Sign out")}</button>
        <div className="profile"><div className="avatar navy">KJ</div><div><strong>KamJey</strong><small>{t("Personal account")}</small></div></div>
      </div>
    </aside>
    <section className="content">{children}</section>
  </div>;
}
