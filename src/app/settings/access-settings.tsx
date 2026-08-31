"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "../language-provider";

type User = { id: string; username: string; full_name: string; role: "admin" | "staff"; active: boolean; last_login_at: string | null; created_at: string };
type BackupLog = { id: string; filename: string; status: "sent" | "failed"; error_message: string | null; created_at: string; requested_by_name: string | null };
type Settings = { general: { currency: string; dateFormat: string; interestModel: string }; integrations: { telegram: boolean; adminChat: boolean; reminders: boolean }; security: { sessionSecret: boolean }; backups: BackupLog[] };

export default function AccessSettings() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [settingsResponse, usersResponse] = await Promise.all([fetch("/api/settings"), fetch("/api/users")]);
    const settingsBody = await settingsResponse.json();
    const usersBody = await usersResponse.json();
    if (!settingsResponse.ok) throw new Error(settingsBody.error || "Unable to load settings.");
    if (!usersResponse.ok) throw new Error(usersBody.error || "Unable to load users.");
    return { settings: settingsBody as Settings, users: usersBody.users as User[] };
  }, []);

  useEffect(() => { load().then((data) => { setSettings(data.settings); setUsers(data.users); }).catch((reason: Error) => setError(reason.message)); }, [load]);

  async function refresh() { const data = await load(); setSettings(data.settings); setUsers(data.users); }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(""); setMessage("");
    const form = event.currentTarget; const data = new FormData(form);
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), fullName: data.get("fullName"), password: data.get("password"), role: data.get("role") }) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setError(body.error || "Unable to create user.");
    form.reset(); setMessage("User created."); await refresh();
  }

  async function updateUser(user: User, changes: Record<string, unknown>) {
    setBusy(user.id); setError(""); setMessage("");
    const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setError(body.error || "Unable to update user.");
    setMessage("User updated."); await refresh();
  }

  async function resetPassword(user: User) {
    const password = window.prompt(`New password for ${user.username} (minimum 8 characters)`);
    if (password) await updateUser(user, { password });
  }

  async function sendBackup() {
    setBusy("backup"); setError(""); setMessage("");
    const response = await fetch("/api/backups/telegram", { method: "POST" }); const body = await response.json(); setBusy("");
    if (!response.ok) return setError(body.error || "Unable to send backup.");
    setMessage(`Backup sent to Telegram: ${body.filename}`); await refresh();
  }

  return <main className="route-page settings-page">
    <header className="route-header"><div><p className="eyebrow">{t("Configuration")}</p><h1>{t("Settings")}</h1><p>{t("Manage access, integrations, security, and protected data backups.")}</p></div></header>
    {error && <p className="modal-error settings-feedback">{error}</p>}{message && <p className="settings-success">{message}</p>}
    {!settings ? <p className="settings-loading">{t("Loading settings…")}</p> : <div className="settings-grid">
      <SettingsCard title={t("General")} copy={t("Current financial display and calculation conventions.")}><SettingRow label={t("Currency")} value={settings.general.currency}/><SettingRow label={t("Date format")} value={settings.general.dateFormat}/><SettingRow label={t("Interest model")} value={settings.general.interestModel}/></SettingsCard>
      <SettingsCard title={t("Telegram")} copy={t("Reminder delivery and encrypted off-site backup destination.")}><StatusRow label={t("Bot token")} ready={settings.integrations.telegram}/><StatusRow label={t("Admin chat")} ready={settings.integrations.adminChat}/><StatusRow label={t("Cron protection")} ready={settings.integrations.reminders}/></SettingsCard>
      <section className="settings-card settings-users"><div className="settings-card-heading"><div><h2>{t("Users and roles")}</h2><p>{t("Admins manage settings and users. Staff can operate loans, borrowers, and payments.")}</p></div></div>
        <form className="user-create-form" onSubmit={createUser}><label>{t("Full name")}<input name="fullName" required minLength={2}/></label><label>{t("Username")}<input name="username" required minLength={3} pattern="[a-zA-Z0-9._-]+"/></label><label>{t("Temporary password")}<input name="password" type="password" required minLength={8}/></label><label>{t("Role")}<select name="role" defaultValue="staff"><option value="staff">{t("Staff")}</option><option value="admin">{t("Administrator")}</option></select></label><button className="primary-button" disabled={busy === "create"}>{busy === "create" ? t("Creating…") : t("Create user")}</button></form>
        <div className="user-list"><div className="user-list-head"><span>{t("Account")}</span><span>{t("Role")}</span><span>{t("Status")}</span><span>{t("Actions")}</span></div>{users.map((user) => <div className="user-list-row" key={user.id}><div><strong>{user.full_name}</strong><small>@{user.username}{user.last_login_at ? ` · ${t("Last login")} ${new Date(user.last_login_at).toLocaleDateString()}` : ` · ${t("Never signed in")}`}</small></div><select value={user.role} disabled={busy === user.id} onChange={(event) => updateUser(user, { role: event.target.value })}><option value="admin">{t("Administrator")}</option><option value="staff">{t("Staff")}</option></select><span className={user.active ? "config-ready" : "config-missing"}>{t(user.active ? "Active" : "Disabled")}</span><div className="user-actions"><button type="button" onClick={() => resetPassword(user)} disabled={busy === user.id}>{t("Reset password")}</button><button type="button" onClick={() => updateUser(user, { active: !user.active })} disabled={busy === user.id}>{t(user.active ? "Disable" : "Enable")}</button></div></div>)}</div>
      </section>
      <SettingsCard title={t("Security")} copy={t("Every account uses a bcrypt password hash and a signed seven-day session.")}><StatusRow label={t("Session signing")} ready={settings.security.sessionSecret}/><SettingRow label={t("Authorization")} value={t("Admin / Staff")}/></SettingsCard>
      <SettingsCard title={t("Data backup")} copy={t("Export locally or send a timestamped JSON snapshot to your Telegram admin chat.")}><div className="backup-actions"><a className="export-button secondary-export" href="/api/export" download>{t("Download JSON")}</a><button className="export-button" type="button" onClick={sendBackup} disabled={busy === "backup"}>{busy === "backup" ? t("Sending…") : t("Send to Telegram")}</button></div><div className="backup-history">{settings.backups.length ? settings.backups.map((backup) => <div className="setting-row" key={backup.id}><span><strong>{backup.status === "sent" ? t("Sent") : t("Failed")}</strong><small>{new Date(backup.created_at).toLocaleString()} · {backup.requested_by_name || t("Unknown user")}</small></span><span className={backup.status === "sent" ? "config-ready" : "config-missing"}>{backup.status}</span></div>) : <p className="settings-help">{t("No Telegram backups yet.")}</p>}</div></SettingsCard>
    </div>}
  </main>;
}

function SettingsCard({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) { return <section className="settings-card"><h2>{title}</h2><p>{copy}</p><div className="settings-rows">{children}</div></section>; }
function SettingRow({ label, value }: { label: string; value: string }) { return <div className="setting-row"><span>{label}</span><strong>{value}</strong></div>; }
function StatusRow({ label, ready }: { label: string; ready: boolean }) { const { t } = useLanguage(); return <div className="setting-row"><span>{label}</span><strong className={ready ? "config-ready" : "config-missing"}>{t(ready ? "Configured" : "Missing")}</strong></div>; }
