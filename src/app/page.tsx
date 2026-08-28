"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LoanStatus = "Due soon" | "Active" | "Overdue" | "Paid";
type BorrowingTopup = { amount: number; toppedUpAt: string };
type Loan = {
  id: string; loanNumber: number; borrower: string; initials: string; color: string;
  principal: number; currentPrincipal: number; accruedInterest: number; nextInterestAdjustment: number;
  interestDueSince: string | null; rate: number; start: string; nextPayment: string; paymentDay: number;
  paid: number; interestPaid: number; principalPaid: number; paymentCount: number;
  totalTopups: number; topupHistory: BorrowingTopup[]; status: LoanStatus;
};
type Payment = { id: string; amount: number; interestAmount: number; principalAmount: number; paidAt: string; method: string | null; note: string | null };
type Topup = { id: string; amount: number; toppedUpAt: string; partialInterest: number; principalBefore: number; principalAfter: number; note: string | null };

const colors = ["rose", "blue", "amber", "violet", "green"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const dateFromSql = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`);
const displayDate = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year.slice(-2)}`; };
const daysUntil = (value: string) => Math.ceil((dateFromSql(value).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
const loanStatus = (status: string, nextPayment: string, dueSince?: string | null): LoanStatus => status === "paid" ? "Paid" : dueSince && daysUntil(dueSince) < 0 ? "Overdue" : dueSince || daysUntil(nextPayment) <= 7 ? "Due soon" : "Active";
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const localToday = () => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; };
const nextMonthlyDate = (value: string, preferredDay: number) => { const current = dateFromSql(value); const year = current.getFullYear() + (current.getMonth() === 11 ? 1 : 0); const month = (current.getMonth() + 1) % 12; const lastDay = new Date(year, month + 1, 0).getDate(); return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`; };
const previousMonthlyDate = (value: string, preferredDay: number) => { const current = dateFromSql(value); const year = current.getFullYear() - (current.getMonth() === 0 ? 1 : 0); const month = (current.getMonth() + 11) % 12; const lastDay = new Date(year, month + 1, 0).getDate(); return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`; };
const dateDays = (later: string, earlier: string) => Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
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
    paid: Number(record.paid), interestPaid: Number(record.interest_paid), principalPaid: Number(record.principal_paid), paymentCount: Number(record.payment_count), totalTopups: Number(record.total_topups), topupHistory, status: loanStatus(String(record.status), String(record.next_payment_date), record.interest_due_since ? String(record.interest_due_since) : null),
  };
}

export default function Home() {
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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadLoans = useCallback(async () => {
    const response = await fetch("/api/loans");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load loans.");
    setLoans(body.map((record: Record<string, unknown>, index: number) => mapLoan(record, index)));
  }, []);

  useEffect(() => { loadLoans().catch((error: Error) => setLoadError(error.message)); }, [loadLoans]);

  const totals = useMemo(() => ({
    outstanding: loans.reduce((sum, loan) => sum + loan.currentPrincipal + loan.accruedInterest, 0),
    principal: loans.reduce((sum, loan) => sum + loan.principal + loan.totalTopups, 0),
    dueSoon: loans.filter((loan) => loan.status === "Due soon" || loan.status === "Overdue").length,
    collected: loans.reduce((sum, loan) => sum + loan.paid, 0),
  }), [loans]);
  const borrowerCount = new Set(loans.map((loan) => loan.borrower)).size;
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
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/loans/${editLoan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower: data.get("borrower"), rate: Number(data.get("rate")), nextPayment: data.get("nextPayment") }) });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to update loan.");
    await loadLoans(); setEditLoan(null); setLoadError("");
  }

  async function deleteLoan(loan: Loan) {
    if (!window.confirm(`Delete ${loan.borrower}'s loan and all of its payment history? This cannot be undone.`)) return;
    const response = await fetch(`/api/loans/${loan.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to delete loan.");
    setLoans((current) => current.filter((item) => item.id !== loan.id)); setLoadError("");
  }

  return <main className="dashboard-page"><header><div><p className="eyebrow">Loan management</p><h1>Welcome to KamJey.</h1></div><button onClick={() => setShowForm(true)} className="primary-button"><span>＋</span> New loan</button></header>
      <div className="summary-grid"><Metric label="Total outstanding" value={money(totals.outstanding)} detail="Principal + accrued interest"/><Metric label="Principal lent" value={money(totals.principal)} detail={`${borrowerCount} borrower${borrowerCount === 1 ? "" : "s"}`}/><Metric label="Due this week" value={String(totals.dueSoon).padStart(2, "0")} detail={totals.dueSoon ? "Requires attention" : "Nothing due soon"} alert={totals.dueSoon > 0}/><Metric label="Total collected" value={money(totals.collected)} detail="All recorded payments"/></div>
      <div className="section-heading"><div><h2>Active loans</h2><p>Borrowing, monthly interest, payments and history.</p></div></div>
      {loadError && <p className="database-notice">{loadError}</p>}
      <div className="loan-card"><div className="table-head loan-ledger-grid grid-cols-[1.1fr_.9fr_1.15fr_.75fr_.75fr_348px]! gap-4! max-[1450px]:hidden!"><span>Borrower</span><span>Amount borrowed</span><span>Borrowing activity</span><span>Monthly interest</span><span>Next payment</span><span className="manage-heading grid! grid-cols-[112px_88px_84px_48px]! gap-2! text-center!"><span>History</span><span>Payment</span><span>Top up</span><span>Actions</span></span></div>
        {loans.length ? loans.map((loan) => {
          const monthlyInterest = Math.round(loan.currentPrincipal * loan.rate) / 100;
          const dueReference = loan.interestDueSince || loan.nextPayment;
          const days = daysUntil(dueReference);
          const statusText = loan.status === "Paid" ? "Paid in full" : days < 0 ? `${Math.abs(days)} day(s) overdue` : days === 0 ? "Due today" : days <= 7 ? `Due in ${days} day(s)` : "On track";
          return <div className="loan-row loan-ledger-grid grid-cols-[1.1fr_.9fr_1.15fr_.75fr_.75fr_348px]! gap-4! max-[1450px]:grid-cols-3! max-[1450px]:gap-6! max-[800px]:grid-cols-1!" key={loan.id}>
            <div className="borrower"><div className={`avatar ${loan.color}`}>{loan.initials}</div><div><strong>{loan.borrower}</strong><small>Loan KJ-{String(loan.loanNumber).padStart(4, "0")}</small></div></div>
            <div className="borrowed-total"><strong>{money(loan.principal + loan.totalTopups)}</strong><small>Total funds provided</small><small className="principal-left"><span>Principal left</span><b>{money(loan.currentPrincipal)}</b></small></div>
            <div className="borrowing-activity"><div className="borrowing-event original"><span>Original</span><strong>{money(loan.principal)}</strong><time>{displayDate(loan.start)}</time></div>{loan.topupHistory.map((topup, index) => <div className="borrowing-event topup" key={`${topup.toppedUpAt}-${index}`}><span>Added</span><strong>+{money(topup.amount)}</strong><time>{displayDate(topup.toppedUpAt)}</time></div>)}</div>
            <div><strong>{money(monthlyInterest)}</strong><small>{loan.rate}% of current principal</small></div>
            <div><strong>{displayDate(loan.nextPayment)}</strong><span className={`status-pill ${loan.status.toLowerCase().replace(" ", "-")}`}>{statusText}</span></div>
            <div className="loan-controls min-w-0! grid-cols-[112px_88px_84px_48px]! justify-end! max-[1450px]:col-span-full! max-[1450px]:justify-start! max-[1450px]:border-t! max-[1450px]:border-[#e5ebef]! max-[1450px]:pt-4! max-[800px]:grid-cols-[repeat(3,auto)_48px]! max-[520px]:grid-cols-2!"><button className="action-button history-action" onClick={() => openHistory(loan)}><span className="action-icon">↺</span><span>History</span><i className={loan.paymentCount + loan.topupHistory.length > 0 ? "payment-count has-payment" : "payment-count"}>{loan.paymentCount + loan.topupHistory.length}</i></button><button className="action-button pay-action" disabled={loan.status === "Paid"} onClick={() => openPayment(loan)}><span className="action-icon">＋</span>{loan.status === "Paid" ? "Paid" : "Pay"}</button><button className="action-button topup-action" disabled={loan.status === "Paid"} onClick={() => openTopup(loan)}>＋ Add</button><div className="more-actions"><button className="more-trigger" aria-label={`More actions for ${loan.borrower}`} aria-expanded={actionMenu === loan.id} onClick={() => setActionMenu((current) => current === loan.id ? null : loan.id)}>•••</button>{actionMenu === loan.id && <div className="actions-menu"><button onClick={() => { setActionMenu(null); setEditLoan(loan); }}><span>✎</span><span><strong>Edit loan</strong><small>Name, rate or due date</small></span></button><button className="menu-delete" onClick={() => { setActionMenu(null); deleteLoan(loan); }}><span>⌫</span><span><strong>Delete loan</strong><small>Remove loan and history</small></span></button></div>}</div></div>
          </div>;
        }) : <div className="empty-state"><div className="empty-icon">◫</div><h3>No loans yet</h3><p>Create your first loan to begin monthly interest tracking.</p><button onClick={() => setShowForm(true)} className="primary-button">Create your first loan</button></div>}
      </div>
    {showForm && <Modal close={() => setShowForm(false)}><form onSubmit={addLoan}><ModalTitle eyebrow="NEW RECORD" title="Create a loan" close={() => setShowForm(false)}/><label>Borrower name<input required maxLength={120} name="borrower" placeholder="e.g. Jamie Lee" /></label><div className="form-grid"><label>Principal amount<input required name="principal" type="number" min="0.01" step="0.01" /></label><label>Monthly rate (%)<input required name="rate" type="number" min="0" max="100" step="0.001" /></label></div><label><span className="date-label"><span>Start date</span><i className="date-format">DD/MM/YY</i></span><span className="formatted-date-input"><span className={createStart ? "selected-date" : "date-placeholder"}>{createStart ? displayDate(createStart) : "DD/MM/YY"}</span><span className="calendar-symbol" aria-hidden="true">▣</span><input required aria-label="Start date" name="start" type="date" value={createStart} onChange={(event) => setCreateStart(event.target.value)}/></span><small className="field-help">Choose a date normally. The first interest payment is due one month later.</small></label><button className="primary-button submit">Create loan</button></form></Modal>}

    {paymentLoan && <Modal close={() => setPaymentLoan(null)}><form onSubmit={recordPayment}><ModalTitle eyebrow="RECORD PAYMENT" title={paymentLoan.borrower} close={() => setPaymentLoan(null)}/><div className="payment-summary three-up"><span>Principal remaining<strong>{money(paymentLoan.currentPrincipal)}</strong></span><span>Monthly interest<strong>{money(Math.round(paymentLoan.currentPrincipal * paymentLoan.rate) / 100)}</strong></span><span>Interest due on selected date<strong>{money(interestOnPaymentDate)}</strong></span></div><label>Amount received<input required autoFocus name="amount" type="number" min="0.01" max={paymentLoan.currentPrincipal + interestOnPaymentDate} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><div className="form-grid"><label>Payment date<input required name="paidAt" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)}/></label><label>Method<select name="method"><option>Cash</option><option>Bank transfer</option><option>Other</option></select></label></div><div className="allocation-preview"><div><span>This payment</span><strong>{money(enteredPayment)}</strong></div><div><span>To interest</span><strong>{money(interestAllocation)}</strong></div><div><span>To principal</span><strong>{money(principalAllocation)}</strong></div><div className="principal-after"><span>Principal after payment</span><strong>{money(principalAfterPayment)}</strong></div></div><p className="allocation-note">Interest is paid first. Only the remaining amount reduces the principal and lowers future monthly interest.</p><button className="primary-button submit">Record payment</button></form></Modal>}

    {topupLoan && <Modal close={() => setTopupLoan(null)}><form onSubmit={recordTopup}><ModalTitle eyebrow="ADD TO LOAN" title={topupLoan.borrower} close={() => setTopupLoan(null)}/><div className="payment-summary"><span>Principal before<strong>{money(topupLoan.currentPrincipal)}</strong></span><span>Monthly rate<strong>{topupLoan.rate}%</strong></span></div><label>Additional amount<input required autoFocus name="amount" type="number" min="0.01" step="0.01" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)}/></label><label>Top-up date<input required name="toppedUpAt" type="date" min={topupPeriodStart} max={localToday()} value={topupDate} onChange={(event) => setTopupDate(event.target.value)}/></label><div className="topup-preview"><div><span>Principal after top-up</span><strong>{money(topupLoan.currentPrincipal + enteredTopup)}</strong></div><div><span>Days charged this period</span><strong>{topupRemainingDays} / {topupPeriodDays}</strong></div><div><span>Partial interest at next due date</span><strong>{money(topupPartialInterest)}</strong></div></div><label>Note (optional)<input name="note" maxLength={240} placeholder="Reason for additional borrowing"/></label><p className="allocation-note">Only the added amount is prorated for the remaining days. From the following full month, interest uses the complete new principal.</p><button className="primary-button submit">Add {money(enteredTopup)} to loan</button></form></Modal>}

    {editLoan && <Modal close={() => setEditLoan(null)}><form onSubmit={updateLoan}><ModalTitle eyebrow="EDIT LOAN" title={editLoan.borrower} close={() => setEditLoan(null)}/><label>Borrower name<input required maxLength={120} name="borrower" defaultValue={editLoan.borrower}/></label><div className="form-grid"><label>Monthly rate (%)<input required name="rate" type="number" min="0" max="100" step="0.001" defaultValue={editLoan.rate}/></label><label>Next payment date<input required name="nextPayment" type="date" defaultValue={editLoan.nextPayment.slice(0, 10)}/></label></div><p className="allocation-note">Original amount: {money(editLoan.principal)}. It cannot be edited because payments are tied to it.</p><button className="primary-button submit">Save changes</button></form></Modal>}

    {historyLoan && <Modal close={() => setHistoryLoan(null)} wide><div><ModalTitle eyebrow="LOAN HISTORY" title={historyLoan.borrower} close={() => setHistoryLoan(null)}/><div className="history-summary"><span>Total borrowed<strong>{money(historyLoan.principal + historyLoan.totalTopups)}</strong></span><span>Total received<strong>{money(historyLoan.paid)}</strong></span><span>Principal left<strong>{money(historyLoan.currentPrincipal)}</strong></span></div>{historyLoading ? <p className="history-empty">Loading history…</p> : <><h3 className="history-section-title">Payments</h3>{payments.length ? <div className="history-list"><div className="history-head"><span>Date</span><span>Amount</span><span>Interest</span><span>Principal</span><span>Method</span></div>{payments.map((payment) => <div className="history-row" key={payment.id}><span>{displayDate(payment.paidAt)}</span><strong>{money(payment.amount)}</strong><span>{money(payment.interestAmount)}</span><span>{money(payment.principalAmount)}</span><span>{payment.method || "—"}</span></div>)}</div> : <p className="compact-history-empty">No recorded payments.</p>}<h3 className="history-section-title topup-history-title">Top-ups</h3>{topups.length ? <div className="history-list"><div className="history-head topup-history-grid"><span>Date</span><span>Added</span><span>Partial interest</span><span>Before</span><span>After</span></div>{topups.map((topup) => <div className="history-row topup-history-grid" key={topup.id}><span>{displayDate(topup.toppedUpAt)}</span><strong>{money(topup.amount)}</strong><span>{money(topup.partialInterest)}</span><span>{money(topup.principalBefore)}</span><span>{money(topup.principalAfter)}</span></div>)}</div> : <p className="compact-history-empty">No top-ups recorded.</p>}</>}</div></Modal>}
  </main>;
}

function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={close}><div className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>; }
function ModalTitle({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) { return <div className="modal-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" onClick={close}>×</button></div>; }
function Metric({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) { return <article className="metric"><div className="metric-top"><span>{label}</span></div><strong>{value}</strong><div className="metric-bottom"><span className={alert ? "warning-dot" : ""}>{detail}</span></div></article>; }
