"use client";

import { useEffect, useMemo, useState } from "react";

type Loan = { id?: string; borrower: string; initials: string; color: string; principal: number; rate: number; start: string; due: string; paid: number; status: "Due soon" | "Active" | "Overdue" };

const initialLoans: Loan[] = [];

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const months = (start: string, due: string) => Math.max(1, Math.round((new Date(due).getTime() - new Date(start).getTime()) / 2.628e9));
const totalDue = (loan: Loan) => loan.principal * (1 + loan.rate / 100 * months(loan.start, loan.due));
const displayDate = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
const colors = ["rose", "blue", "amber", "violet", "green"];

export default function Home() {
  const [loans, setLoans] = useState(initialLoans);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Overview");
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    fetch("/api/loans")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return response.json();
      })
      .then((records) => {
        setLoans(records.map((loan: { id: string; borrower: string; principal: string | number; rate: string | number; start_date: string; due_date: string; paid: string | number; status: string }, index: number) => ({
          id: loan.id, borrower: loan.borrower, initials: loan.borrower.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase(), color: colors[index % colors.length], principal: Number(loan.principal), rate: Number(loan.rate), start: displayDate(loan.start_date), due: displayDate(loan.due_date), paid: Number(loan.paid), status: loan.status === "overdue" ? "Overdue" : "Active",
        })));
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);
  const totals = useMemo(() => ({
    outstanding: loans.reduce((s, l) => s + totalDue(l) - l.paid, 0),
    principal: loans.reduce((s, l) => s + l.principal, 0),
    dueSoon: loans.filter(l => l.status === "Due soon" || l.status === "Overdue").length,
    collected: loans.reduce((s, l) => s + l.paid, 0),
  }), [loans]);
  const visibleLoans = loans.filter(l => l.borrower.toLowerCase().includes(query.toLowerCase()));
  const borrowerCount = new Set(loans.map((loan) => loan.borrower)).size;

  async function addLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const borrower = String(data.get("borrower"));
    const response = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower, principal: Number(data.get("principal")), rate: Number(data.get("rate")), start: data.get("start"), due: data.get("due") }) });
    if (!response.ok) { setLoadError((await response.json()).error || "Unable to save loan."); return; }
    const loan = await response.json();
    setLoans(current => [{ id: loan.id, borrower, initials: borrower.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(), color: "green", principal: Number(loan.principal), rate: Number(loan.rate), start: displayDate(loan.start_date), due: displayDate(loan.due_date), paid: 0, status: "Active" }, ...current]);
    setShowForm(false); setLoadError("");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">↗</span><span>KamJey</span></div><nav>{["Overview", "Loans", "Borrowers", "Payments"].map(item => <button key={item} onClick={() => setTab(item)} className={tab === item ? "nav-item active" : "nav-item"}><span>{item === "Overview" ? "▦" : item === "Loans" ? "◫" : item === "Borrowers" ? "◉" : "↕"}</span>{item}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item"><span>⚙</span>Settings</button><button className="nav-item sign-out" onClick={logout}><span>↪</span>Sign out</button><div className="profile"><div className="avatar navy">KJ</div><div><strong>KamJey</strong><small>Personal account</small></div></div></div></aside>
    <section className="content"><header><div><p className="eyebrow">{tab === "Overview" ? "Loan management" : "Portfolio"}</p><h1>{tab === "Overview" ? "Welcome to KamJey." : tab}</h1></div><div className="header-actions"><button className="icon-button">⌕</button><button className="icon-button notification">♧<i /></button><button onClick={() => setShowForm(true)} className="primary-button"><span>＋</span> New loan</button></div></header>
      <div className="summary-grid"><Metric label="Total outstanding" value={money(totals.outstanding)} detail={loans.length ? "Across active loans" : "No active loans yet"}/><Metric label="Principal lent" value={money(totals.principal)} detail={`${borrowerCount} borrower${borrowerCount === 1 ? "" : "s"}`}/><Metric label="Due this week" value={String(totals.dueSoon).padStart(2, "0")} detail={totals.dueSoon ? "Requires attention" : "Nothing due soon"} alert={totals.dueSoon > 0}/><Metric label="Collected this month" value={money(totals.collected)} detail={totals.collected ? "Payments received" : "No payments recorded"}/></div>
      <div className="section-heading"><div><h2>Active loans</h2><p>Keep track of your current lending.</p></div><button className="text-button" onClick={() => setTab("Loans")}>View all <span>→</span></button></div>{loadError && <p className="database-notice">Database setup needed: {loadError}</p>}
      <div className="loan-card"><div className="table-head"><span>Borrower</span><span>Loan details</span><span>Balance remaining</span><span>Due date</span><span></span></div>{visibleLoans.length ? visibleLoans.map((loan, index) => { const due = totalDue(loan); const remaining = due - loan.paid; const statusText = loan.status === "Overdue" ? "8 days overdue" : loan.status === "Due soon" ? "Due in 6 days" : "On track"; return <div className="loan-row" key={loan.borrower + index}><div className="borrower"><div className={`avatar ${loan.color}`}>{loan.initials}</div><div><strong>{loan.borrower}</strong><small>Loan #{String(index + 1042)}</small></div></div><div><strong>{money(loan.principal)}</strong><small>{loan.rate}% / month · Simple interest</small></div><div className="progress-wrap"><strong className="remaining-amount">{money(remaining)}</strong><div className="progress-label"><span>Payment received</span><span>{Math.round(loan.paid / due * 100)}%</span></div><div className="progress"><i style={{ width: `${loan.paid / due * 100}%` }} /></div></div><div><strong>{loan.due}</strong><span className={`status-pill ${loan.status.toLowerCase().replace(" ", "-")}`}>{statusText}</span></div><button className="more">•••</button></div>}) : <div className="empty-state"><div className="empty-icon">◫</div><h3>No loans yet</h3><p>Start with your first loan. KamJey will calculate the monthly interest automatically.</p><button onClick={() => setShowForm(true)} className="primary-button"><span>＋</span> Create your first loan</button></div>}</div>
      <section className="lower-grid"><div className="upcoming"><div className="section-heading compact"><div><h2>Upcoming payments</h2><p>Next 7 days</p></div><button className="text-button">Calendar →</button></div>{loans.length ? <p className="empty-payments">Payment dates will appear here as you add loans.</p> : <p className="empty-payments">No upcoming payments. Create a loan to begin tracking due dates.</p>}</div><div className="reminder"><span className="spark">✦</span><h3>Telegram reminders are ready</h3><p>KamJey will be ready to notify you before payments are due once your loans are stored in the database.</p><button>Reminder settings <span>→</span></button></div></section>
    </section>
    {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><form className="modal" onSubmit={addLoan} onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">NEW RECORD</p><h2>Create a loan</h2></div><button type="button" onClick={() => setShowForm(false)}>×</button></div><label>Borrower name<input required name="borrower" placeholder="e.g. Jamie Lee" /></label><div className="form-grid"><label>Principal amount<input required name="principal" type="number" min="1" placeholder="10,000" /></label><label>Monthly rate (%)<input required name="rate" type="number" min="0" step="0.1" placeholder="3" /></label></div><div className="form-grid"><label>Start date<input required name="start" type="date" /></label><label>Due date<input required name="due" type="date" /></label></div><button className="primary-button submit">Create loan</button></form></div>}
  </main>;
}

function Metric({ label, value, detail, trend, alert = false }: { label: string; value: string; detail: string; trend?: string; alert?: boolean }) { return <article className="metric"><div className="metric-top"><span>{label}</span><button>•••</button></div><strong>{value}</strong><div className="metric-bottom"><span className={alert ? "warning-dot" : ""}>{detail}</span>{trend && <b>{trend}</b>}</div></article>; }
