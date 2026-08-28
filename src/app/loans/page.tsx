"use client";

import { useEffect, useMemo, useState } from "react";

type LoanRecord = {
  id: string; loan_number: number; borrower: string; principal: string;
  current_principal: string; accrued_interest: string; rate: string;
  start_date: string; next_payment_date: string; interest_due_since: string | null;
  status: string; paid: string; total_topups: string;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const date = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year.slice(-2)}`; };
const viewStatus = (loan: LoanRecord) => loan.status === "paid" ? "Paid" : loan.interest_due_since && loan.interest_due_since.slice(0, 10) < new Date().toISOString().slice(0, 10) ? "Overdue" : "Active";

export default function LoansPage() {
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/loans")
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then(setLoans)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const visible = useMemo(() => loans.filter((loan) =>
    (filter === "All" || viewStatus(loan) === filter) && loan.borrower.toLowerCase().includes(query.toLowerCase())
  ), [loans, filter, query]);

  return <main className="route-page">
    <PageTitle eyebrow="Portfolio" title="Loans" copy="Review every active, overdue and completed loan."/>
    <div className="page-toolbar">
      <div className="filter-tabs">{["All", "Active", "Overdue", "Paid"].map((item) =>
        <button key={item} onClick={() => setFilter(item)} className={filter === item ? "active" : ""}>{item}<span>{item === "All" ? loans.length : loans.filter((loan) => viewStatus(loan) === item).length}</span></button>
      )}</div>
      <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search borrower…"/>
    </div>
    {error && <p className="database-notice">{error}</p>}
    <div className="data-card">
      <div className="data-table loans-table data-head"><span>Reference</span><span>Borrower</span><span>Total borrowed</span><span>Principal left</span><span>Interest due</span><span>Next payment</span><span>Status</span></div>
      {visible.length ? visible.map((loan) => {
        const topups = Number(loan.total_topups);
        return <div className="data-table loans-table" key={loan.id}>
          <strong>KJ-{String(loan.loan_number).padStart(4, "0")}</strong>
          <span>{loan.borrower}</span>
          <span>{money(Number(loan.principal) + topups)}{topups > 0 && <small className="table-subtext">Includes {money(topups)} top-ups</small>}</span>
          <strong className="balance-emphasis">{money(Number(loan.current_principal))}</strong>
          <span>{money(Number(loan.accrued_interest))}</span>
          <span>{date(loan.next_payment_date)}</span>
          <span className={`status-pill ${viewStatus(loan).toLowerCase()}`}>{viewStatus(loan)}</span>
        </div>;
      }) : <Empty text="No loans match this view."/>}
    </div>
  </main>;
}

function PageTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <header className="route-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div></header>; }
function Empty({ text }: { text: string }) { return <div className="route-empty"><strong>Nothing here yet</strong><p>{text}</p></div>; }
