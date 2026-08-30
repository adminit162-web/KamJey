"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const password = String(new FormData(event.currentTarget).get("password")); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); if (response.ok) { router.push("/"); router.refresh(); } else { const body = await response.json(); setError(body.error || "Unable to sign in."); setLoading(false); } }
  return <main className="login-page"><form className="login-card" onSubmit={login}><div className="brand"><span className="brand-mark">↗</span><span>KamJey</span></div><p className="eyebrow">PRIVATE DASHBOARD</p><h1>Welcome back.</h1><p className="login-copy">Enter your admin password to manage your loans.</p><label>Password<input name="password" type="password" autoFocus required /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button></form></main>;
}
