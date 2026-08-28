"use client";

import { useEffect, useMemo, useState } from "react";

type Payment = { id: string; paid_at: string; amount: string; interest_amount: string; principal_amount: string; method: string | null; loan_number: number; borrower: string };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const date = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year.slice(-2)}`; };

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/payments").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setPayments).catch((reason: Error) => setError(reason.message)); }, []);
  const totals = useMemo(() => ({ received: payments.reduce((sum, payment) => sum + Number(payment.amount), 0), interest: payments.reduce((sum, payment) => sum + Number(payment.interest_amount), 0), principal: payments.reduce((sum, payment) => sum + Number(payment.principal_amount), 0) }), [payments]);
  return <main className="route-page"><header className="route-header"><div><p className="eyebrow">Ledger</p><h1>Payments</h1><p>A complete history of money received and how it was allocated.</p></div></header><div className="mini-summary"><span>Total received<strong>{money(totals.received)}</strong></span><span>Interest collected<strong>{money(totals.interest)}</strong></span><span>Principal collected<strong>{money(totals.principal)}</strong></span></div>{error && <p className="database-notice">{error}</p>}<div className="data-card"><div className="data-table payments-table data-head"><span>Date</span><span>Loan</span><span>Borrower</span><span>Amount</span><span>Interest</span><span>Principal</span><span>Method</span></div>{payments.length ? payments.map((payment) => <div className="data-table payments-table" key={payment.id}><span>{date(payment.paid_at)}</span><strong>KJ-{String(payment.loan_number).padStart(4, "0")}</strong><span>{payment.borrower}</span><strong>{money(Number(payment.amount))}</strong><span>{money(Number(payment.interest_amount))}</span><span>{money(Number(payment.principal_amount))}</span><span>{payment.method || "—"}</span></div>) : <div className="route-empty"><strong>No payments yet</strong><p>Recorded loan payments will appear here.</p></div>}</div></main>;
}
