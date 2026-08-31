"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { LanguageSwitcher, useLanguage } from "../language-provider";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const data = new FormData(event.currentTarget); const username = String(data.get("username")); const password = String(data.get("password")); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); if (response.ok) { router.push("/"); router.refresh(); } else { const body = await response.json(); setError(body.error || t("Unable to sign in.")); setLoading(false); } }
  return <main className="login-page"><div className="login-language"><LanguageSwitcher /></div><form className="login-card" onSubmit={login}><div className="brand"><span className="brand-mark"><Image src="/kamjey-logo.png" alt="" width={31} height={31} priority /></span><span>KamJey</span></div><p className="eyebrow">{t("PRIVATE DASHBOARD")}</p><h1>{t("Welcome back.")}</h1><p className="login-copy">{t("Sign in with your KamJey account.")}</p><label>{t("Username")}<input name="username" type="text" defaultValue="admin" autoComplete="username" autoFocus required /></label><label>{t("Password")}<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button" disabled={loading}>{t(loading ? "Signing in…" : "Sign in")}</button></form></main>;
}
