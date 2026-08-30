"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "./language-provider";

type LoanStatus = "Due soon" | "Active" | "Overdue" | "Paid";
type LoanFilter = "All" | "Needs attention" | "Paid this month" | "Paid off";
type SecondaryFilter = "All loans" | "Interest-free" | "Active";
type BorrowingTopup = { amount: number; toppedUpAt: string };
type Loan = {
  id: string; loanNumber: number; borrower: string; initials: string; color: string;
  principal: number; currentPrincipal: number; accruedInterest: number; nextInterestAdjustment: number;
  interestDueSince: string | null; rate: number; start: string; nextPayment: string; paymentDay: number;
  paid: number; interestPaid: number; principalPaid: number; paymentCount: number;
  currentMonthPaid: number; currentMonthInterestPaid: number; currentMonthPrincipalPaid: number; latestMonthPaymentDate: string | null;
  totalTopups: number; topupHistory: BorrowingTopup[]; status: LoanStatus;
};
type Payment = { id: string; amount: number; interestAmount: number; principalAmount: number; paidAt: string; method: string | null; note: string | null };
type Topup = { id: string; amount: number; toppedUpAt: string; partialInterest: number; principalBefore: number; principalAfter: number; note: string | null };

const colors = ["rose", "blue", "amber", "violet", "green"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
const dateFromSql = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`);
const displayDate = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year.slice(-2)}`; };
const readableDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(dateFromSql(value));
const daysUntil = (value: string) => Math.ceil((dateFromSql(value).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
const loanStatus = (status: string, nextPayment: string, dueSince?: string | null): LoanStatus => status === "paid" ? "Paid" : dueSince && daysUntil(dueSince) < 0 ? "Overdue" : dueSince || daysUntil(nextPayment) <= 7 ? "Due soon" : "Active";
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const localToday = () => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; };
const nextMonthlyDate = (value: string, preferredDay: number) => { const current = dateFromSql(value); const year = current.getFullYear() + (current.getMonth() === 11 ? 1 : 0); const month = (current.getMonth() + 1) % 12; const lastDay = new Date(year, month + 1, 0).getDate(); return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`; };
const previousMonthlyDate = (value: string, preferredDay: number) => { const current = dateFromSql(value); const year = current.getFullYear() - (current.getMonth() === 0 ? 1 : 0); const month = (current.getMonth() + 11) % 12; const lastDay = new Date(year, month + 1, 0).getDate(); return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`; };
const dateDays = (later: string, earlier: string) => Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
const fullMonthInterest = (loan: Loan) => Math.round(loan.currentPrincipal * loan.rate) / 100;
const scheduledInterest = (loan: Loan) => Math.max(0, Math.round((fullMonthInterest(loan) + loan.nextInterestAdjustment) * 100) / 100);
const displayedInterestDue = (loan: Loan) => loan.accruedInterest > 0 ? loan.accruedInterest : scheduledInterest(loan);
const projectedInterest = (loan: Loan, paymentDate: string) => { let interest = loan.accruedInterest; let anniversary = loan.nextPayment.slice(0, 10); let adjustment = loan.nextInterestAdjustment; let cycles = 0; while (anniversary <= paymentDate && cycles < 1200) { interest = Math.max(0, Math.round((interest + loan.currentPrincipal * loan.rate / 100 + adjustment) * 100) / 100); adjustment = 0; anniversary = nextMonthlyDate(anniversary, loan.paymentDay); cycles += 1; } return interest; };

function mapLoan(record: Record<string, unknown>, index: number): Loan {
  const topupHistory = Array.isArray(record.topup_history) ? record.topup_history.map((entry) => {
    const topup = entry as Record<string, unknown>;
    return { amount: Number(topup.amount), toppedUpAt: String(topup.topped_up_at) };
  }) : [];
  return {
    id: String(record.id), loanNumber: Number(record.loan_number), borrower: String(record.borrower), initials: initials(String(record.borrower)), color: colors[index % colors.length],
    principal: Number(record.principal), currentPrincipal: Number(record.current_principal), accruedInterest: Number(record.accrued_interest), nextInterestAdjustment: Number(record.next_interest_adjustment),
    interestDueSince: record.interest_due_since ? String(record.interest_due_since) : null, rate: Number(record.rate), start: String(record.start_date), nextPayment: String(record.next_payment_date), paymentDay: Number(record.payment_day),
    paid: Number(record.paid), interestPaid: Number(record.interest_paid), principalPaid: Number(record.principal_paid), paymentCount: Number(record.payment_count), currentMonthPaid: Number(record.current_month_paid), currentMonthInterestPaid: Number(record.current_month_interest_paid), currentMonthPrincipalPaid: Number(record.current_month_principal_paid), latestMonthPaymentDate: record.latest_month_payment_date ? String(record.latest_month_payment_date) : null, totalTopups: Number(record.total_topups), topupHistory, status: loanStatus(String(record.status), String(record.next_payment_date), record.interest_due_since ? String(record.interest_due_since) : null),
  };
}

async function fetchLoans(): Promise<Loan[]> {
  const response = await fetch("/api/loans");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load loans.");
  return body.map((record: Record<string, unknown>, index: number) => mapLoan(record, index));
}

export default function Home() {
  const { t } = useLanguage();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [createStart, setCreateStart] = useState("");
  const [paymentLoan, setPaymentLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localToday);
  const [topupLoan, setTopupLoan] = useState<Loan | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupDate, setTopupDate] = useState(localToday);
  const [historyLoan, setHistoryLoan] = useState<Loan | null>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [editTopup, setEditTopup] = useState<Topup | null>(null);
  const [editTopupAmount, setEditTopupAmount] = useState("");
  const [editTopupDate, setEditTopupDate] = useState("");
  const [editTopupNote, setEditTopupNote] = useState("");
  const [topupEditSaving, setTopupEditSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loanSearch, setLoanSearch] = useState("");
  const [loanFilter, setLoanFilter] = useState<LoanFilter>("All");
  const [secondaryFilter, setSecondaryFilter] = useState<SecondaryFilter>("All loans");

  const loadLoans = useCallback(async () => {
    setLoans(await fetchLoans());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLoans()
      .then((loadedLoans) => { if (!cancelled) setLoans(loadedLoans); })
      .catch((error: Error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => {
    const principalOwed = loans.reduce((sum, loan) => sum + loan.currentPrincipal, 0);
    const interestLeftThisMonth = loans.reduce((sum, loan) => {
      if (loan.status === "Paid" || loan.rate === 0) return sum;
      if (loan.accruedInterest > 0) return sum + loan.accruedInterest;
      if (loan.currentMonthInterestPaid > 0) return sum;
      return sum + scheduledInterest(loan);
    }, 0);
    return {
      toCollect: principalOwed + interestLeftThisMonth,
      principalOwed,
      interestLeftThisMonth,
      expectedMonthlyInterest: loans.filter((loan) => loan.status !== "Paid").reduce((sum, loan) => sum + fullMonthInterest(loan), 0),
      receivedThisMonth: loans.reduce((sum, loan) => sum + loan.currentMonthPaid, 0),
      interestReceivedThisMonth: loans.reduce((sum, loan) => sum + loan.currentMonthInterestPaid, 0),
      principalReceivedThisMonth: loans.reduce((sum, loan) => sum + loan.currentMonthPrincipalPaid, 0),
      dueSoon: loans.filter((loan) => loan.status === "Due soon" || loan.status === "Overdue").length,
      statuses: {
        overdue: loans.filter((loan) => loan.status === "Overdue").length,
        dueSoon: loans.filter((loan) => loan.status === "Due soon").length,
        active: loans.filter((loan) => loan.status === "Active").length,
        paid: loans.filter((loan) => loan.status === "Paid").length,
      },
    };
  }, [loans]);
  const visibleLoans = useMemo(() => {
    const query = loanSearch.trim().toLowerCase();
    return loans.filter((loan) => {
      const matchesSearch = !query || loan.borrower.toLowerCase().includes(query) || `kj-${String(loan.loanNumber).padStart(4, "0")}`.includes(query);
      const paidThisMonth = loan.currentMonthPaid > 0 && loan.accruedInterest === 0 && loan.status !== "Paid" && loan.status !== "Overdue";
      const matchesFilter = loanFilter === "All" || loanFilter === "Needs attention" && (loan.status === "Due soon" || loan.status === "Overdue") || loanFilter === "Paid this month" && loan.currentMonthPaid > 0 || loanFilter === "Paid off" && loan.status === "Paid";
      const matchesSecondaryFilter = secondaryFilter === "All loans" || secondaryFilter === "Interest-free" && loan.rate === 0 || secondaryFilter === "Active" && loan.status === "Active" && !paidThisMonth;
      return matchesSearch && matchesFilter && matchesSecondaryFilter;
    });
  }, [loanFilter, loanSearch, loans, secondaryFilter]);
  const interestOnPaymentDate = paymentLoan ? projectedInterest(paymentLoan, paymentDate) : 0;
  const enteredPayment = Math.max(0, Number(paymentAmount) || 0);
  const interestAllocation = Math.min(enteredPayment, interestOnPaymentDate);
  const principalAllocation = paymentLoan ? Math.min(Math.max(0, enteredPayment - interestAllocation), paymentLoan.currentPrincipal) : 0;
  const principalAfterPayment = paymentLoan ? paymentLoan.currentPrincipal - principalAllocation : 0;
  const enteredTopup = Math.max(0, Number(topupAmount) || 0);
  const topupPeriodStart = topupLoan ? previousMonthlyDate(topupLoan.nextPayment, topupLoan.paymentDay) : "";
  const topupPeriodDays = topupLoan ? dateDays(topupLoan.nextPayment.slice(0, 10), topupPeriodStart) : 0;
  const topupRemainingDays = topupLoan ? Math.max(0, dateDays(topupLoan.nextPayment.slice(0, 10), topupDate)) : 0;
  const topupPartialInterest = topupLoan && topupPeriodDays > 0 ? Math.round(enteredTopup * topupLoan.rate / 100 * topupRemainingDays / topupPeriodDays * 100) / 100 : 0;
  const topupInterestAtNextDue = topupLoan ? Math.round((scheduledInterest(topupLoan) + topupPartialInterest) * 100) / 100 : 0;
  const topupFollowingFullMonthInterest = topupLoan ? Math.round((topupLoan.currentPrincipal + enteredTopup) * topupLoan.rate) / 100 : 0;

  function openPayment(loan: Loan) { setPaymentLoan(loan); setPaymentAmount(""); setPaymentDate(localToday()); }
  function openTopup(loan: Loan) { setTopupLoan(loan); setTopupAmount(""); setTopupDate(localToday()); }

  async function addLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower: data.get("borrower"), principal: Number(data.get("principal")), rate: Number(data.get("rate")), start: data.get("start") }) });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to save loan.");
    await loadLoans(); setShowForm(false); setCreateStart(""); setLoadError("");
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentLoan) return;
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/loans/${paymentLoan.id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(data.get("amount")), paidAt: data.get("paidAt"), method: data.get("method") }) });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to record payment.");
    await loadLoans(); setPaymentLoan(null); setPaymentAmount(""); setLoadError("");
  }

  async function recordTopup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topupLoan) return;
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/loans/${topupLoan.id}/topups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(data.get("amount")), toppedUpAt: data.get("toppedUpAt"), note: data.get("note") }) });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to record top-up.");
    await loadLoans(); setTopupLoan(null); setTopupAmount(""); setLoadError("");
  }

  async function openHistory(loan: Loan) {
    setHistoryLoan(loan); setHistoryLoading(true); setPayments([]); setTopups([]);
    const [paymentResponse, topupResponse] = await Promise.all([fetch(`/api/loans/${loan.id}/payments`), fetch(`/api/loans/${loan.id}/topups`)]);
    const [paymentBody, topupBody] = await Promise.all([paymentResponse.json(), topupResponse.json()]);
    if (!paymentResponse.ok || !topupResponse.ok) setLoadError(paymentBody.error || topupBody.error || "Unable to load history.");
    else { setPayments(paymentBody.map((payment: Record<string, string | number | null>) => ({ id: String(payment.id), amount: Number(payment.amount), interestAmount: Number(payment.interest_amount), principalAmount: Number(payment.principal_amount), paidAt: String(payment.paid_at), method: payment.method ? String(payment.method) : null, note: payment.note ? String(payment.note) : null }))); setTopups(topupBody.map((topup: Record<string, string | number | null>) => ({ id: String(topup.id), amount: Number(topup.amount), toppedUpAt: String(topup.topped_up_at), partialInterest: Number(topup.partial_interest), principalBefore: Number(topup.principal_before), principalAfter: Number(topup.principal_after), note: topup.note ? String(topup.note) : null }))); }
    setHistoryLoading(false);
  }

  async function updateLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editLoan) return;
    setEditError("");
    setEditSaving(true);
    try {
      const data = new FormData(event.currentTarget);
      const response = await fetch(`/api/loans/${editLoan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower: data.get("borrower"), principal: Number(data.get("principal")), rate: Number(data.get("rate")), nextPayment: data.get("nextPayment") }) });
      const body = await response.json();
      if (!response.ok) { setEditError(body.error || "Unable to update loan."); return; }
      await loadLoans(); setEditLoan(null); setLoadError("");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Unable to update loan.");
    } finally {
      setEditSaving(false);
    }
  }

  function openTopupEdit(topup: Topup) {
    setEditTopup(topup); setEditTopupAmount(String(topup.amount)); setEditTopupDate(topup.toppedUpAt.slice(0, 10)); setEditTopupNote(topup.note || ""); setEditError("");
  }

  async function updateTopup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!historyLoan || !editTopup) return;
    setTopupEditSaving(true); setEditError("");
    try {
      const response = await fetch(`/api/loans/${historyLoan.id}/topups/${editTopup.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(editTopupAmount), toppedUpAt: editTopupDate, note: editTopupNote }) });
      const body = await response.json();
      if (!response.ok) return setEditError(body.error || "Unable to update top-up.");
      setEditTopup(null); await Promise.all([loadLoans(), openHistory(historyLoan)]);
    } catch (error) { setEditError(error instanceof Error ? error.message : "Unable to update top-up."); }
    finally { setTopupEditSaving(false); }
  }

  async function deleteTopup(topup: Topup) {
    if (!historyLoan || !window.confirm(t("Delete this added-funds record? The loan balance and interest will be recalculated."))) return;
    const response = await fetch(`/api/loans/${historyLoan.id}/topups/${topup.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to delete top-up.");
    await Promise.all([loadLoans(), openHistory(historyLoan)]); setLoadError("");
  }

  async function deleteLoan(loan: Loan) {
    if (!window.confirm(t("Delete {borrower}'s loan and all of its payment history? This cannot be undone.", { borrower: loan.borrower }))) return;
    const response = await fetch(`/api/loans/${loan.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to delete loan.");
    setLoans((current) => current.filter((item) => item.id !== loan.id)); setLoadError("");
  }

  return <main className="dashboard-page"><header><div><p className="eyebrow">{t("Loan management")}</p><h1>{t("Welcome to KamJey.")}</h1></div><button onClick={() => setShowForm(true)} className="primary-button"><span>＋</span> {t("New loan")}</button></header>
      <div className="analytics-grid">
        <ReceivableCard title={t("Money to collect")} copy={t("What borrowers still need to pay.")} totalLabel={t("Total")} total={money(totals.toCollect)} principalLabel={t("Principal left")} principal={money(totals.principalOwed)} interestLabel={t("Interest left this month")} interest={money(totals.interestLeftThisMonth)}/>
        <DonutCard title={t("Loan status")} copy={t("Current portfolio health")} centerLabel={t("Total loans")} centerValue={String(loans.length)} segments={[{ label: t("Overdue"), value: totals.statuses.overdue, color: "#d95f4f" }, { label: t("Due soon"), value: totals.statuses.dueSoon, color: "#e4a03c" }, { label: t("Active"), value: totals.statuses.active, color: "#3f8b68" }, { label: t("Paid off"), value: totals.statuses.paid, color: "#7890a3" }]}/>
        <div className="analytics-kpis"><Metric label={t("Expected monthly interest")} value={money(totals.expectedMonthlyInterest)} detail={t("Based on current balances")}/><Metric label={t("Needs attention")} value={String(totals.dueSoon).padStart(2, "0")} detail={t(totals.dueSoon ? "Requires attention" : "Portfolio is clear")} alert={totals.dueSoon > 0}/><Metric label={t("Received this month")} value={money(totals.receivedThisMonth)} detail={t("{principal} principal · {interest} interest", { principal: money(totals.principalReceivedThisMonth), interest: money(totals.interestReceivedThisMonth) })}/></div>
      </div>
      <div className="section-heading portfolio-heading"><div><h2>{t("Loan portfolio")}</h2><p>{t("Balances, upcoming payments and account status at a glance.")}</p></div><span>{t("{shown} of {total} loans", { shown: visibleLoans.length, total: loans.length })}</span></div>
      {loadError && <p className="database-notice">{loadError}</p>}
      <div className="portfolio-toolbar"><div className="portfolio-filter-controls"><div className="portfolio-filters" role="group" aria-label={t("Loans")}>{(["All", "Needs attention", "Paid this month", "Paid off"] as LoanFilter[]).map((filter) => <button type="button" className={loanFilter === filter ? "active" : ""} key={filter} onClick={() => setLoanFilter(filter)}>{t(filter)}</button>)}</div><select className={secondaryFilter === "All loans" ? "portfolio-secondary-filter" : "portfolio-secondary-filter active"} value={secondaryFilter} onChange={(event) => setSecondaryFilter(event.target.value as SecondaryFilter)} aria-label={t("More filters")}><option value="All loans">{t("More filters")}</option><option value="Interest-free">{t("Interest-free")}</option><option value="Active">{t("Active")}</option></select></div><label className="portfolio-search"><span aria-hidden="true">⌕</span><input value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder={t("Search borrower or loan ID")} aria-label={t("Search borrower or loan ID")} /></label></div>
      <div className={`portfolio-table ${loanFilter === "Paid this month" ? "paid-month-view" : ""}`}><div className="portfolio-table-head"><span>{t("Borrower")}</span><span>{t("Outstanding balance")}</span><span>{t(loanFilter === "Paid this month" ? "Paid this month" : "Loan status")}</span><span>{t("Next payment")}</span>{loanFilter !== "Paid this month" && <span aria-label={t("Manage")}/>}</div>
        {visibleLoans.length ? visibleLoans.map((loan) => {
          const dueReference = loan.interestDueSince || loan.nextPayment;
          const days = daysUntil(dueReference);
          const statusText = loan.status === "Paid" ? t("Paid in full") : loan.status === "Overdue" ? t("{days} day(s) overdue", { days: Math.abs(days) }) : loan.status === "Due soon" ? days === 0 ? t("Due today") : t("Due in {days} day(s)", { days }) : "";
          const paidThisMonth = loan.currentMonthPaid > 0 && loan.accruedInterest === 0 && loan.status !== "Paid" && loan.status !== "Overdue";
          const statusLabel = loan.status === "Paid" ? t("Paid off") : paidThisMonth ? t("Paid this month") : t(loan.status);
          const statusClass = paidThisMonth ? "paid-month" : loan.status.toLowerCase().replace(" ", "-");
          const monthlyBreakdown = loan.currentMonthInterestPaid > 0 && loan.currentMonthPrincipalPaid > 0 ? t("{principal} principal · {interest} interest", { principal: compactMoney(loan.currentMonthPrincipalPaid), interest: compactMoney(loan.currentMonthInterestPaid) }) : loan.currentMonthPrincipalPaid > 0 ? t("{amount} principal", { amount: compactMoney(loan.currentMonthPrincipalPaid) }) : t("{amount} interest", { amount: compactMoney(loan.currentMonthInterestPaid) });
          const nextPaymentCell = <div className="portfolio-next-payment"><strong>{loan.rate === 0 ? t("Principal payment") : money(displayedInterestDue(loan))}</strong><small>{readableDate(dueReference)}</small></div>;
          return <article className="portfolio-row" key={loan.id}>
            <div className="portfolio-borrower"><div className={`avatar ${loan.color}`}>{loan.initials}</div><div><strong>{loan.borrower}</strong><small>KJ-{String(loan.loanNumber).padStart(4, "0")}</small></div></div>
            <div className="portfolio-balance"><strong>{money(loan.currentPrincipal + loan.accruedInterest)}</strong><small>{t("{principal} principal · {interest} interest", { principal: money(loan.currentPrincipal), interest: money(loan.accruedInterest) })}</small></div>
            {loanFilter === "Paid this month" ? <div className="portfolio-month-payment"><strong>{money(loan.currentMonthPaid)}</strong><small>{monthlyBreakdown}</small>{loan.latestMonthPaymentDate && <time>{t("Last paid on {date}", { date: displayDate(loan.latestMonthPaymentDate) })}</time>}</div> : <div className="portfolio-status"><span className={`status-pill ${statusClass}`}>{statusLabel}</span>{!paidThisMonth && statusText && <small>{statusText}</small>}</div>}
            {nextPaymentCell}
            {loanFilter !== "Paid this month" && <div className="portfolio-actions"><button className="action-button pay-action" disabled={loan.status === "Paid"} onClick={() => openPayment(loan)}>{t(loan.status === "Paid" ? "Paid" : "Pay")}</button><div className="more-actions"><button className="more-trigger" aria-label={`${t("Manage")} ${loan.borrower}`} aria-expanded={actionMenu === loan.id} onClick={() => setActionMenu((current) => current === loan.id ? null : loan.id)}>•••</button>{actionMenu === loan.id && <div className="actions-menu"><button onClick={() => { setActionMenu(null); openHistory(loan); }}><span>↺</span><span><strong>{t("View history")}</strong><small>{t("{count} recorded activities", { count: loan.paymentCount + loan.topupHistory.length })}</small></span></button><button disabled={loan.status === "Paid"} onClick={() => { setActionMenu(null); openTopup(loan); }}><span>＋</span><span><strong>{t("Add funds")}</strong><small>{t("Increase this loan")}</small></span></button><button onClick={() => { setActionMenu(null); setEditError(""); setEditLoan(loan); }}><span>✎</span><span><strong>{t("Edit loan")}</strong><small>{t("Name, rate or due date")}</small></span></button><button className="menu-delete" onClick={() => { setActionMenu(null); deleteLoan(loan); }}><span>⌫</span><span><strong>{t("Delete loan")}</strong><small>{t("Remove loan and history")}</small></span></button></div>}</div></div>}
          </article>;
        }) : loans.length ? <div className="empty-state"><div className="empty-icon">⌕</div><h3>{t("No matching loans")}</h3><p>{t("Try another name, loan ID, or status filter.")}</p><button onClick={() => { setLoanSearch(""); setLoanFilter("All"); setSecondaryFilter("All loans"); }} className="primary-button">{t("Clear filters")}</button></div> : <div className="empty-state"><div className="empty-icon">◫</div><h3>{t("No loans yet")}</h3><p>{t("Create your first loan to begin monthly interest tracking.")}</p><button onClick={() => setShowForm(true)} className="primary-button">{t("Create your first loan")}</button></div>}
      </div>
    {showForm && <Modal close={() => setShowForm(false)}><form onSubmit={addLoan}><ModalTitle eyebrow={t("NEW RECORD")} title={t("Create a loan")} close={() => setShowForm(false)}/><label>{t("Borrower name")}<input required maxLength={120} name="borrower" placeholder={t("e.g. Jamie Lee")} /></label><div className="form-grid"><label>{t("Principal amount")}<input required name="principal" type="number" min="0.01" step="0.01" /></label><label>{t("Monthly rate (%)")}<input required name="rate" type="number" min="0" max="100" step="0.001" /></label></div><label><span className="date-label"><span>{t("Start date")}</span><i className="date-format">DD/MM/YY</i></span><span className="formatted-date-input"><span className={createStart ? "selected-date" : "date-placeholder"}>{createStart ? displayDate(createStart) : t("Choose a date")}</span><span className="calendar-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg></span><input required aria-label={t("Start date")} name="start" type="date" value={createStart} onClick={(event) => event.currentTarget.showPicker()} onChange={(event) => setCreateStart(event.target.value)}/></span><small className="field-help">{t("Click anywhere in the field to choose a date. The first interest payment is due one month later.")}</small></label><button className="primary-button submit">{t("Create loan")}</button></form></Modal>}

    {paymentLoan && <Modal close={() => setPaymentLoan(null)}><form onSubmit={recordPayment}><ModalTitle eyebrow={t("RECORD PAYMENT")} title={paymentLoan.borrower} close={() => setPaymentLoan(null)}/><div className="payment-summary three-up"><span>{t("Principal remaining")}<strong>{money(paymentLoan.currentPrincipal)}</strong></span><span>{t("Next full-month interest")}<strong>{money(fullMonthInterest(paymentLoan))}</strong></span><span>{t("Interest due on selected date")}<strong>{money(interestOnPaymentDate)}</strong></span></div><label>{t("Amount received")}<input required autoFocus name="amount" type="number" min="0.01" max={paymentLoan.currentPrincipal + interestOnPaymentDate} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><div className="form-grid"><label>{t("Payment date")}<input required name="paidAt" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)}/></label><label>{t("Method")}<select name="method"><option value="Cash">{t("Cash")}</option><option value="Bank transfer">{t("Bank transfer")}</option><option value="Other">{t("Other")}</option></select></label></div><div className="allocation-preview"><div><span>{t("This payment")}</span><strong>{money(enteredPayment)}</strong></div><div><span>{t("To interest")}</span><strong>{money(interestAllocation)}</strong></div><div><span>{t("To principal")}</span><strong>{money(principalAllocation)}</strong></div><div className="principal-after"><span>{t("Principal after payment")}</span><strong>{money(principalAfterPayment)}</strong></div></div><p className="allocation-note">{t("Interest is paid first. Only the remaining amount reduces the principal and lowers future monthly interest.")}</p><button className="primary-button submit">{t("Record payment")}</button></form></Modal>}

    {topupLoan && <Modal close={() => setTopupLoan(null)}><form onSubmit={recordTopup}><ModalTitle eyebrow={t("ADD TO LOAN")} title={topupLoan.borrower} close={() => setTopupLoan(null)}/><div className="payment-summary"><span>{t("Principal before")}<strong>{money(topupLoan.currentPrincipal)}</strong></span><span>{t("Monthly rate")}<strong>{topupLoan.rate}%</strong></span></div><label>{t("Additional amount")}<input required autoFocus name="amount" type="number" min="0.01" step="0.01" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)}/></label><label>{t("Top-up date")}<input required name="toppedUpAt" type="date" min={topupPeriodStart} max={localToday()} value={topupDate} onChange={(event) => setTopupDate(event.target.value)}/></label><div className="topup-preview"><div><span>{t("Principal after top-up")}</span><strong>{money(topupLoan.currentPrincipal + enteredTopup)}</strong></div><div><span>{t("Days charged this period")}</span><strong>{topupRemainingDays} / {topupPeriodDays}</strong></div><div><span>{t("Interest on this top-up")}</span><strong>{money(topupPartialInterest)}</strong></div><div className="topup-interest-total"><span>{t("Total interest due {date}", { date: readableDate(topupLoan.nextPayment) })}</span><strong>{money(topupInterestAtNextDue)}</strong></div><div className="topup-full-month"><span>{t("Following full month")}</span><strong>{money(topupFollowingFullMonthInterest)}</strong></div></div><label>{t("Note (optional)")}<input name="note" maxLength={240} placeholder={t("Reason for additional borrowing")}/></label><p className="allocation-note">{t("Only the added amount is prorated for the remaining days. From the following full month, interest uses the complete new principal.")}</p><button className="primary-button submit">{t("Add {amount} to loan", { amount: money(enteredTopup) })}</button></form></Modal>}

    {editLoan && <Modal close={() => { if (!editSaving) setEditLoan(null); }}><form onSubmit={updateLoan}><ModalTitle eyebrow={t("EDIT LOAN")} title={editLoan.borrower} close={() => { if (!editSaving) setEditLoan(null); }}/><label>{t("Borrower name")}<input required maxLength={120} name="borrower" defaultValue={editLoan.borrower}/></label><label>{t("Principal amount")}<input required name="principal" type="number" min="0.01" step="0.01" defaultValue={editLoan.principal}/></label><div className="form-grid"><label>{t("Monthly rate (%)")}<input required name="rate" type="number" min="0" max="100" step="0.001" defaultValue={editLoan.rate}/></label><label>{t("Next payment date")}<input required name="nextPayment" type="date" min={editLoan.start.slice(0, 10)} defaultValue={editLoan.nextPayment.slice(0, 10)}/></label></div><p className="allocation-note">{t("Changing the amount or rate recalculates principal and accrued interest. Financial terms are locked after payments or added funds exist.")}</p>{editError && <p className="modal-error" role="alert">{editError}</p>}<button className="primary-button submit" disabled={editSaving}>{t(editSaving ? "Saving…" : "Save changes")}</button></form></Modal>}

    {editTopup && historyLoan && <Modal close={() => { if (!topupEditSaving) setEditTopup(null); }}><form onSubmit={updateTopup}><ModalTitle eyebrow={t("EDIT ADDED FUNDS")} title={historyLoan.borrower} close={() => { if (!topupEditSaving) setEditTopup(null); }}/><label>{t("Additional amount")}<input required autoFocus type="number" min="0.01" step="0.01" value={editTopupAmount} onChange={(event) => setEditTopupAmount(event.target.value)}/></label><label>{t("Top-up date")}<input required type="date" max={localToday()} value={editTopupDate} onChange={(event) => setEditTopupDate(event.target.value)}/></label><label>{t("Note (optional)")}<input maxLength={240} value={editTopupNote} onChange={(event) => setEditTopupNote(event.target.value)} placeholder={t("Reason for additional borrowing")}/></label><p className="allocation-note">{t("The loan principal and prorated interest will be recalculated automatically.")}</p>{editError && <p className="modal-error" role="alert">{editError}</p>}<button className="primary-button submit" disabled={topupEditSaving}>{t(topupEditSaving ? "Saving…" : "Save changes")}</button></form></Modal>}

    {historyLoan && <Modal close={() => setHistoryLoan(null)} wide><div><ModalTitle eyebrow={t("LOAN HISTORY")} title={historyLoan.borrower} close={() => setHistoryLoan(null)}/><div className="history-summary"><span>{t("Original loan")}<strong>{money(historyLoan.principal)}</strong></span><span>{t("Added funds")}<strong>{money(historyLoan.totalTopups)}</strong></span><span>{t("Principal left")}<strong>{money(historyLoan.currentPrincipal)}</strong></span><span>{t("Interest due")}<strong>{money(displayedInterestDue(historyLoan))}</strong><small>{historyLoan.accruedInterest > 0 ? t("Unpaid") : readableDate(historyLoan.nextPayment)}</small></span><span>{t("Total received")}<strong>{money(historyLoan.paid)}</strong></span></div>{historyLoading ? <p className="history-empty">{t("Loading history…")}</p> : <><h3 className="history-section-title">{t("Payments")}</h3>{payments.length ? <div className="history-list"><div className="history-head">{["Date", "Amount", "Interest", "Principal", "Method"].map((label) => <span key={label}>{t(label)}</span>)}</div>{payments.map((payment) => <div className="history-row" key={payment.id}><span>{displayDate(payment.paidAt)}</span><strong>{money(payment.amount)}</strong><span>{money(payment.interestAmount)}</span><span>{money(payment.principalAmount)}</span><span>{payment.method ? t(payment.method) : "—"}</span></div>)}</div> : <p className="compact-history-empty">{t("No recorded payments.")}</p>}<h3 className="history-section-title topup-history-title">{t("Top-ups")}</h3>{topups.length ? <div className="history-list"><div className="history-head topup-history-grid">{["Date", "Added", "Prorated interest", "Before", "After", "Actions"].map((label) => <span key={label}>{t(label)}</span>)}</div>{topups.map((topup, index) => <div className="history-row topup-history-grid" key={topup.id}><span>{displayDate(topup.toppedUpAt)}</span><strong>{money(topup.amount)}</strong><span>{money(topup.partialInterest)}</span><span>{money(topup.principalBefore)}</span><span>{money(topup.principalAfter)}</span><span className="topup-history-actions">{index === 0 ? <><button type="button" onClick={() => openTopupEdit(topup)}>{t("Edit")}</button><button type="button" className="delete" onClick={() => deleteTopup(topup)}>{t("Delete")}</button></> : <small>{t("Locked")}</small>}</span></div>)}</div> : <p className="compact-history-empty">{t("No top-ups recorded.")}</p>}</>}</div></Modal>}
  </main>;
}

function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={close}><div className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>; }
function ModalTitle({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) { return <div className="modal-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" onClick={close}>×</button></div>; }
function Metric({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) { return <article className="metric"><div className="metric-top"><span>{label}</span></div><strong>{value}</strong><div className="metric-bottom"><span className={alert ? "warning-dot" : ""}>{detail}</span></div></article>; }

function ReceivableCard({ title, copy, totalLabel, total, principalLabel, principal, interestLabel, interest }: { title: string; copy: string; totalLabel: string; total: string; principalLabel: string; principal: string; interestLabel: string; interest: string }) {
  return <article className="receivable-card"><div className="donut-card-heading"><h2>{title}</h2><p>{copy}</p></div><div className="receivable-total"><span>{totalLabel}</span><strong>{total}</strong></div><div className="receivable-breakdown"><div><i className="principal-dot"/><span>{principalLabel}</span><strong>{principal}</strong></div><div><i className="interest-dot"/><span>{interestLabel}</span><strong>{interest}</strong></div></div></article>;
}

type DonutSegment = { label: string; value: number; color: string; displayValue?: string };
function DonutCard({ title, copy, centerLabel, centerValue, segments }: { title: string; copy: string; centerLabel: string; centerValue: string; segments: DonutSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const stops = segments.filter((segment) => segment.value > 0).reduce<{ items: string[]; position: number }>((result, segment) => {
    const end = result.position + (total ? segment.value / total * 100 : 0);
    return { items: [...result.items, `${segment.color} ${result.position}% ${end}%`], position: end };
  }, { items: [], position: 0 }).items;
  const background = stops.length ? `conic-gradient(${stops.join(", ")})` : "#e7edf1";
  const description = segments.map((segment) => `${segment.label}: ${segment.displayValue ?? segment.value}`).join(", ");
  return <article className="donut-card"><div className="donut-card-heading"><div><h2>{title}</h2><p>{copy}</p></div></div><div className="donut-card-body"><div className="donut-chart" style={{ background }} role="img" aria-label={description}><div className="donut-center"><strong>{centerValue}</strong><span>{centerLabel}</span></div></div><div className="donut-legend">{segments.map((segment) => <div key={segment.label}><i style={{ background: segment.color }}/><span>{segment.label}</span><strong>{segment.displayValue ?? segment.value}</strong></div>)}</div></div></article>;
}
