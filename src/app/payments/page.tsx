"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../language-provider";
import { cambodiaToday } from "@/lib/dates";

type Payment = { id: string; paid_at: string; amount: string; interest_amount: string; principal_amount: string; method: string | null; loan_number: number; borrower: string };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const date = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year.slice(-2)}`; };
const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
const monthLabel = (month: string, locale: string) => { const [year, number] = month.split("-").map(Number); return locale.startsWith("km") ? `${khmerMonths[number - 1]} ${String(year).replace(/\d/g, (digit) => "០១២៣៤៥៦៧៨៩"[Number(digit)])}` : new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(year, number - 1, 1)); };

export default function PaymentsPage() {
  const { t, locale } = useLanguage();
  const [payments, setPayments] = useState<Payment[]>([]); const [error, setError] = useState("");
  const [month, setMonth] = useState(() => cambodiaToday().slice(0, 7)); const [query, setQuery] = useState("");
  useEffect(() => { fetch("/api/payments").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setPayments).catch((reason: Error) => setError(reason.message)); }, []);
  // Totals follow the chosen month, so they match the dashboard for that month.
  const months = useMemo(() => [...new Set([cambodiaToday().slice(0, 7), ...payments.map((payment) => payment.paid_at.slice(0, 7))])].sort().reverse(), [payments]);
  const visible = useMemo(() => payments.filter((payment) => (month === "all" || payment.paid_at.slice(0, 7) === month) && (!query.trim() || `${payment.borrower} kj-${String(payment.loan_number).padStart(4, "0")}`.toLowerCase().includes(query.trim().toLowerCase()))), [payments, month, query]);
  const totals = useMemo(() => ({ received: visible.reduce((sum, payment) => sum + Number(payment.amount), 0), interest: visible.reduce((sum, payment) => sum + Number(payment.interest_amount), 0), principal: visible.reduce((sum, payment) => sum + Number(payment.principal_amount), 0) }), [visible]);
  return <main className="route-page"><header className="route-header"><div><p className="eyebrow">{t("Ledger")}</p><h1>{t("Payments")}</h1><p>{t("A complete history of money received and how it was allocated.")}</p></div></header><div className="page-toolbar"><div className="filter-tabs">{[...months, "all"].map((item) => <button key={item} onClick={() => setMonth(item)} className={month === item ? "active" : ""}>{item === "all" ? t("All months") : monthLabel(item, locale)}<span>{item === "all" ? payments.length : payments.filter((payment) => payment.paid_at.slice(0, 7) === item).length}</span></button>)}</div><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search borrower or loan ID")}/></div><div className="mini-summary"><span>{t("Total received")}<strong>{money(totals.received)}</strong></span><span>{t("Interest collected")}<strong>{money(totals.interest)}</strong></span><span>{t("Principal collected")}<strong>{money(totals.principal)}</strong></span></div>{error && <p className="database-notice">{error}</p>}<div className="data-card"><div className="data-table payments-table data-head">{["Date", "Loan", "Borrower", "Amount", "Interest", "Principal", "Method"].map((label) => <span key={label}>{t(label)}</span>)}</div>{visible.length ? visible.map((payment) => <div className="data-table payments-table" key={payment.id}><span data-label={t("Date")}>{date(payment.paid_at)}</span><strong data-label={t("Loan")}>KJ-{String(payment.loan_number).padStart(4, "0")}</strong><span data-label={t("Borrower")}>{payment.borrower}</span><strong data-label={t("Amount")}>{money(Number(payment.amount))}</strong><span data-label={t("Interest")}>{money(Number(payment.interest_amount))}</span><span data-label={t("Principal")}>{money(Number(payment.principal_amount))}</span><span data-label={t("Method")}>{payment.method ? t(payment.method) : "—"}</span></div>) : <div className="route-empty"><strong>{t("No payments yet")}</strong><p>{t("Recorded loan payments will appear here.")}</p></div>}</div></main>;
}
