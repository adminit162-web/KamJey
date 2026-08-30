"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../language-provider";

type Borrower = { id: string; full_name: string; phone: string | null; address: string | null; loan_count: number; active_loans: number; principal_remaining: string; interest_due: string; total_paid: string };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

export default function BorrowersPage() {
  const { t } = useLanguage();
  const [borrowers, setBorrowers] = useState<Borrower[]>([]); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/borrowers").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setBorrowers).catch((reason: Error) => setError(reason.message)); }, []);
  return <main className="route-page"><header className="route-header"><div><p className="eyebrow">{t("People")}</p><h1>{t("Borrowers")}</h1><p>{t("See each borrower’s loan exposure and payment totals.")}</p></div></header>{error && <p className="database-notice">{error}</p>}<div className="borrower-grid">{borrowers.length ? borrowers.map((borrower) => <article className="borrower-card" key={borrower.id}><div className="borrower-card-top"><div className="avatar blue">{borrower.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div><h2>{borrower.full_name}</h2><p>{t("{active} active of {total} loan(s)", { active: borrower.active_loans, total: borrower.loan_count })}</p></div></div><div className="borrower-stats"><span>{t("Principal left")}<strong>{money(Number(borrower.principal_remaining))}</strong></span><span>{t("Interest due")}<strong>{money(Number(borrower.interest_due))}</strong></span><span>{t("Total paid")}<strong>{money(Number(borrower.total_paid))}</strong></span></div>{(borrower.phone || borrower.address) && <p className="borrower-contact">{[borrower.phone, borrower.address].filter(Boolean).join(" · ")}</p>}</article>) : <div className="route-empty data-card"><strong>{t("No borrowers yet")}</strong><p>{t("Borrowers appear here when you create a loan.")}</p></div>}</div></main>;
}
