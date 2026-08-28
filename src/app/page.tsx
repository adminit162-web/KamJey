"use client";

import { useMemo, useState } from "react";

type Loan = { borrower: string; initials: string; color: string; principal: number; rate: number; start: string; due: string; paid: number; status: "Due soon" | "Active" | "Overdue" };

const initialLoans: Loan[] = [
  { borrower: "Maya S.", initials: "MS", color: "rose", principal: 12000, rate: 3, start: "Jun 12, 2026", due: "Aug 31, 2026", paid: 0, status: "Due soon" },
  { borrower: "Daniel Wong", initials: "DW", color: "blue", principal: 8500, rate: 2.5, start: "Jul 02, 2026", due: "Sep 02, 2026", paid: 2500, status: "Active" },
  { borrower: "Arun K.", initials: "AK", color: "amber", principal: 5000, rate: 4, start: "May 18, 2026", due: "Aug 18, 2026", paid: 0, status: "Overdue" },
  { borrower: "Lina Phan", initials: "LP", color: "violet", principal: 15000, rate: 2, start: "Aug 08, 2026", due: "Oct 08, 2026", paid: 0, status: "Active" },
];

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const months = (start: string, due: string) => Math.max(1, Math.round((new Date(due).getTime() - new Date(start).getTime()) / 2.628e9));
const totalDue = (loan: Loan) => loan.principal * (1 + loan.rate / 100 * months(loan.start, loan.due));

export default function Home() {
  const [loans, setLoans] = useState(initialLoans);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Overview");
  const totals = useMemo(() => ({
    outstanding: loans.reduce((s, l) => s + totalDue(l) - l.paid, 0),
    principal: loans.reduce((s, l) => s + l.principal, 0),
    dueSoon: loans.filter(l => l.status === "Due soon" || l.status === "Overdue").length,
    collected: loans.reduce((s, l) => s + l.paid, 0),
  }), [loans]);
  const visibleLoans = loans.filter(l => l.borrower.toLowerCase().includes(query.toLowerCase()));

  function addLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const borrower = String(data.get("borrower"));
    setLoans(current => [{ borrower, initials: borrower.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(), color: "green", principal: Number(data.get("principal")), rate: Number(data.get("rate")), start: new Date(String(data.get("start"))).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }), due: new Date(String(data.get("due"))).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }), paid: 0, status: "Active" }, ...current]);
    setShowForm(false);
  }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">↗</span><span>KamJey</span></div><nav>{["Overview", "Loans", "Borrowers", "Payments"].map(item => <button key={item} onClick={() => setTab(item)} className={tab === item ? "nav-item active" : "nav-item"}><span>{item === "Overview" ? "▦" : item === "Loans" ? "◫" : item === "Borrowers" ? "◉" : "↕"}</span>{item}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item"><span>⚙</span>Settings</button><div className="profile"><div className="avatar navy">NS</div><div><strong>Nithin S.</strong><small>Personal account</small></div><span>⌄</span></div></div></aside>
    <section className="content"><header><div><p className="eyebrow">{tab === "Overview" ? "Tuesday, August 25" : "Portfolio"}</p><h1>{tab === "Overview" ? "Good morning, Nithin." : tab}</h1></div><div className="header-actions"><button className="icon-button">⌕</button><button className="icon-button notification">♧<i /></button><button onClick={() => setShowForm(true)} className="primary-button"><span>＋</span> New loan</button></div></header>
      <div className="summary-grid"><Metric label="Total outstanding" value={money(totals.outstanding)} detail="Across active loans" trend="↗ 8.2%"/><Metric label="Principal lent" value={money(totals.principal)} detail="Across 4 borrowers"/><Metric label="Due this week" value={String(totals.dueSoon).padStart(2, "0")} detail="Requires attention" alert/><Metric label="Collected this month" value={money(totals.collected)} detail="Payments received" trend="↗ 12.5%"/></div>
      <div className="section-heading"><div><h2>Active loans</h2><p>Keep track of your current lending.</p></div><button className="text-button" onClick={() => setTab("Loans")}>View all <span>→</span></button></div>
      <div className="loan-card"><div className="table-head"><span>Borrower</span><span>Loan details</span><span>Balance remaining</span><span>Due date</span><span></span></div>{visibleLoans.map((loan, index) => { const due = totalDue(loan); const remaining = due - loan.paid; const statusText = loan.status === "Overdue" ? "8 days overdue" : loan.status === "Due soon" ? "Due in 6 days" : "On track"; return <div className="loan-row" key={loan.borrower + index}><div className="borrower"><div className={`avatar ${loan.color}`}>{loan.initials}</div><div><strong>{loan.borrower}</strong><small>Loan #{String(index + 1042)}</small></div></div><div><strong>{money(loan.principal)}</strong><small>{loan.rate}% / month · Simple interest</small></div><div className="progress-wrap"><strong className="remaining-amount">{money(remaining)}</strong><div className="progress-label"><span>Payment received</span><span>{Math.round(loan.paid / due * 100)}%</span></div><div className="progress"><i style={{ width: `${loan.paid / due * 100}%` }} /></div></div><div><strong>{loan.due}</strong><span className={`status-pill ${loan.status.toLowerCase().replace(" ", "-")}`}>{statusText}</span></div><button className="more">•••</button></div>})}</div>
      <section className="lower-grid"><div className="upcoming"><div className="section-heading compact"><div><h2>Upcoming payments</h2><p>Next 7 days</p></div><button className="text-button">Calendar →</button></div><div className="payment"><div className="date"><b>31</b><span>AUG</span></div><div><strong>Maya S.</strong><small>Loan #1042 · Full payment</small></div><b>{money(totalDue(loans[0]))}</b></div><div className="payment"><div className="date overdue-date"><b>18</b><span>AUG</span></div><div><strong>Arun K.</strong><small>Loan #1044 · Full payment</small></div><b>{money(totalDue(loans[2]))}</b></div></div><div className="reminder"><span className="spark">✦</span><h3>Stay ahead of due dates</h3><p>Connect Telegram to receive automatic reminders before payments are due.</p><button>Set up reminders <span>→</span></button></div></section>
    </section>
    {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><form className="modal" onSubmit={addLoan} onMouseDown={e => e.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">NEW RECORD</p><h2>Create a loan</h2></div><button type="button" onClick={() => setShowForm(false)}>×</button></div><label>Borrower name<input required name="borrower" placeholder="e.g. Jamie Lee" /></label><div className="form-grid"><label>Principal amount<input required name="principal" type="number" min="1" placeholder="10,000" /></label><label>Monthly rate (%)<input required name="rate" type="number" min="0" step="0.1" placeholder="3" /></label></div><div className="form-grid"><label>Start date<input required name="start" type="date" /></label><label>Due date<input required name="due" type="date" /></label></div><button className="primary-button submit">Create loan</button></form></div>}
  </main>;
}

function Metric({ label, value, detail, trend, alert = false }: { label: string; value: string; detail: string; trend?: string; alert?: boolean }) { return <article className="metric"><div className="metric-top"><span>{label}</span><button>•••</button></div><strong>{value}</strong><div className="metric-bottom"><span className={alert ? "warning-dot" : ""}>{detail}</span>{trend && <b>{trend}</b>}</div></article>; }
