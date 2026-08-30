"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LanguageSwitcher, useLanguage } from "../language-provider";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const password = String(new FormData(event.currentTarget).get("password")); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); if (response.ok) { router.push("/"); router.refresh(); } else { const body = await response.json(); setError(body.error || t("Unable to sign in.")); setLoading(false); } }
  return <main className="login-page"><div className="login-language"><LanguageSwitcher /></div><form className="login-card" onSubmit={login}><div className="brand"><span className="brand-mark">↗</span><span>KamJey</span></div><p className="eyebrow">{t("PRIVATE DASHBOARD")}</p><h1>{t("Welcome back.")}</h1><p className="login-copy">{t("Enter your admin password to manage your loans.")}</p><label>{t("Password")}<input name="password" type="password" autoFocus required /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button" disabled={loading}>{t(loading ? "Signing in…" : "Sign in")}</button></form></main>;
}
