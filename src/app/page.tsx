"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LoanStatus = "Due soon" | "Active" | "Overdue" | "Paid";
type Loan = {
  id: string; borrower: string; initials: string; color: string;
  principal: number; currentPrincipal: number; accruedInterest: number;
  interestDueSince: string | null; rate: number; start: string; nextPayment: string; paymentDay: number;
  paid: number; interestPaid: number; principalPaid: number; status: LoanStatus;
};
type Payment = { id: string; amount: number; interestAmount: number; principalAmount: number; paidAt: string; method: string | null; note: string | null };

const colors = ["rose", "blue", "amber", "violet", "green"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const dateFromSql = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`);
const displayDate = (value: string) => dateFromSql(value).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
const daysUntil = (value: string) => Math.ceil((dateFromSql(value).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
const loanStatus = (status: string, nextPayment: string, dueSince?: string | null): LoanStatus => status === "paid" ? "Paid" : dueSince && daysUntil(dueSince) < 0 ? "Overdue" : dueSince || daysUntil(nextPayment) <= 7 ? "Due soon" : "Active";
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const localToday = () => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; };
const nextMonthlyDate = (value: string, preferredDay: number) => { const current = dateFromSql(value); const year = current.getFullYear() + (current.getMonth() === 11 ? 1 : 0); const month = (current.getMonth() + 1) % 12; const lastDay = new Date(year, month + 1, 0).getDate(); return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`; };
const projectedInterest = (loan: Loan, paymentDate: string) => { let interest = loan.accruedInterest; let anniversary = loan.nextPayment.slice(0, 10); let cycles = 0; while (anniversary <= paymentDate && cycles < 1200) { interest = Math.round((interest + loan.currentPrincipal * loan.rate / 100) * 100) / 100; anniversary = nextMonthlyDate(anniversary, loan.paymentDay); cycles += 1; } return interest; };

function mapLoan(record: Record<string, string | number | null>, index: number): Loan {
  return {
    id: String(record.id), borrower: String(record.borrower), initials: initials(String(record.borrower)), color: colors[index % colors.length],
    principal: Number(record.principal), currentPrincipal: Number(record.current_principal), accruedInterest: Number(record.accrued_interest),
    interestDueSince: record.interest_due_since ? String(record.interest_due_since) : null, rate: Number(record.rate), start: String(record.start_date), nextPayment: String(record.next_payment_date), paymentDay: Number(record.payment_day),
    paid: Number(record.paid), interestPaid: Number(record.interest_paid), principalPaid: Number(record.principal_paid), status: loanStatus(String(record.status), String(record.next_payment_date), record.interest_due_since ? String(record.interest_due_since) : null),
  };
}

export default function Home() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [paymentLoan, setPaymentLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localToday);
  const [historyLoan, setHistoryLoan] = useState<Loan | null>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [tab, setTab] = useState("Overview");
  const [loadError, setLoadError] = useState("");

  const loadLoans = useCallback(async () => {
    const response = await fetch("/api/loans");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load loans.");
    setLoans(body.map((record: Record<string, string | number | null>, index: number) => mapLoan(record, index)));
  }, []);

  useEffect(() => { loadLoans().catch((error: Error) => setLoadError(error.message)); }, [loadLoans]);

  const totals = useMemo(() => ({
    outstanding: loans.reduce((sum, loan) => sum + loan.currentPrincipal + loan.accruedInterest, 0),
    principal: loans.reduce((sum, loan) => sum + loan.principal, 0),
    dueSoon: loans.filter((loan) => loan.status === "Due soon" || loan.status === "Overdue").length,
    collected: loans.reduce((sum, loan) => sum + loan.paid, 0),
  }), [loans]);
  const borrowerCount = new Set(loans.map((loan) => loan.borrower)).size;
  const interestOnPaymentDate = paymentLoan ? projectedInterest(paymentLoan, paymentDate) : 0;
  const enteredPayment = Math.max(0, Number(paymentAmount) || 0);
  const interestAllocation = Math.min(enteredPayment, interestOnPaymentDate);
  const principalAllocation = paymentLoan ? Math.min(Math.max(0, enteredPayment - interestAllocation), paymentLoan.currentPrincipal) : 0;
  const principalAfterPayment = paymentLoan ? paymentLoan.currentPrincipal - principalAllocation : 0;

  function openPayment(loan: Loan) { setPaymentLoan(loan); setPaymentAmount(""); setPaymentDate(localToday()); }

  async function addLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower: data.get("borrower"), principal: Number(data.get("principal")), rate: Number(data.get("rate")), start: data.get("start") }) });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to save loan.");
    await loadLoans(); setShowForm(false); setLoadError("");
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

  async function openHistory(loan: Loan) {
    setHistoryLoan(loan); setHistoryLoading(true); setPayments([]);
    const response = await fetch(`/api/loans/${loan.id}/payments`);
    const body = await response.json();
    if (!response.ok) setLoadError(body.error || "Unable to load history.");
    else setPayments(body.map((payment: Record<string, string | number | null>) => ({ id: String(payment.id), amount: Number(payment.amount), interestAmount: Number(payment.interest_amount), principalAmount: Number(payment.principal_amount), paidAt: String(payment.paid_at), method: payment.method ? String(payment.method) : null, note: payment.note ? String(payment.note) : null })));
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

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">↗</span><span>KamJey</span></div><nav>{["Overview", "Loans", "Borrowers", "Payments"].map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "nav-item active" : "nav-item"}><span>{item === "Overview" ? "▦" : item === "Loans" ? "◫" : item === "Borrowers" ? "◉" : "↕"}</span>{item}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item"><span>⚙</span>Settings</button><button className="nav-item sign-out" onClick={logout}><span>↪</span>Sign out</button><div className="profile"><div className="avatar navy">KJ</div><div><strong>KamJey</strong><small>Personal account</small></div></div></div></aside>
    <section className="content"><header><div><p className="eyebrow">Loan management</p><h1>{tab === "Overview" ? "Welcome to KamJey." : tab}</h1></div><button onClick={() => setShowForm(true)} className="primary-button"><span>＋</span> New loan</button></header>
      <div className="summary-grid"><Metric label="Total outstanding" value={money(totals.outstanding)} detail="Principal + accrued interest"/><Metric label="Principal lent" value={money(totals.principal)} detail={`${borrowerCount} borrower${borrowerCount === 1 ? "" : "s"}`}/><Metric label="Due this week" value={String(totals.dueSoon).padStart(2, "0")} detail={totals.dueSoon ? "Requires attention" : "Nothing due soon"} alert={totals.dueSoon > 0}/><Metric label="Total collected" value={money(totals.collected)} detail="All recorded payments"/></div>
      <div className="section-heading"><div><h2>Active loans</h2><p>Borrowing, monthly interest, payments and history.</p></div></div>
      {loadError && <p className="database-notice">{loadError}</p>}
      <div className="loan-card"><div className="table-head loan-ledger-grid"><span>Borrower</span><span>Amount borrowed</span><span>Monthly interest</span><span>Next payment</span><span>History</span><span>Payment</span><span>Actions</span></div>
        {loans.length ? loans.map((loan, index) => {
          const monthlyInterest = Math.round(loan.currentPrincipal * loan.rate) / 100;
          const dueReference = loan.interestDueSince || loan.nextPayment;
          const days = daysUntil(dueReference);
          const statusText = loan.status === "Paid" ? "Paid in full" : days < 0 ? `${Math.abs(days)} day(s) overdue` : days === 0 ? "Due today" : days <= 7 ? `Due in ${days} day(s)` : "On track";
          return <div className="loan-row loan-ledger-grid" key={loan.id}>
            <div className="borrower"><div className={`avatar ${loan.color}`}>{loan.initials}</div><div><strong>{loan.borrower}</strong><small>Loan #{String(index + 1042)}</small></div></div>
            <div><strong>{money(loan.principal)}</strong><small className="principal-left"><span>Principal left</span><b>{money(loan.currentPrincipal)}</b></small></div>
            <div><strong>{money(monthlyInterest)}</strong><small>{loan.rate}% of current principal</small></div>
            <div><strong>{displayDate(loan.nextPayment)}</strong><span className={`status-pill ${loan.status.toLowerCase().replace(" ", "-")}`}>{statusText}</span></div>
            <div className="history-cell"><button className="action-button history-action" onClick={() => openHistory(loan)}><span className="action-icon">↺</span><span>View</span><i className={loan.paid > 0 ? "payment-count has-payment" : "payment-count"}>{loan.paid > 0 ? "Paid" : "0"}</i></button></div>
            <div className="payment-cell"><button className="action-button pay-action" disabled={loan.status === "Paid"} onClick={() => openPayment(loan)}><span className="action-icon">＋</span>{loan.status === "Paid" ? "Paid" : "Pay"}</button></div>
            <div className="row-actions"><div className="more-actions"><button className="more-trigger" aria-label={`More actions for ${loan.borrower}`} aria-expanded={actionMenu === loan.id} onClick={() => setActionMenu((current) => current === loan.id ? null : loan.id)}>•••</button>{actionMenu === loan.id && <div className="actions-menu"><button onClick={() => { setActionMenu(null); setEditLoan(loan); }}><span>✎</span><span><strong>Edit loan</strong><small>Name, rate or due date</small></span></button><button className="menu-delete" onClick={() => { setActionMenu(null); deleteLoan(loan); }}><span>⌫</span><span><strong>Delete loan</strong><small>Remove loan and history</small></span></button></div>}</div></div>
          </div>;
        }) : <div className="empty-state"><div className="empty-icon">◫</div><h3>No loans yet</h3><p>Create your first loan to begin monthly interest tracking.</p><button onClick={() => setShowForm(true)} className="primary-button">Create your first loan</button></div>}
      </div>
    </section>

    {showForm && <Modal close={() => setShowForm(false)}><form onSubmit={addLoan}><ModalTitle eyebrow="NEW RECORD" title="Create a loan" close={() => setShowForm(false)}/><label>Borrower name<input required maxLength={120} name="borrower" placeholder="e.g. Jamie Lee" /></label><div className="form-grid"><label>Principal amount<input required name="principal" type="number" min="0.01" step="0.01" /></label><label>Monthly rate (%)<input required name="rate" type="number" min="0" max="100" step="0.001" /></label></div><label>Start date<input required name="start" type="date"/><small className="field-help">The first interest payment is due one month later.</small></label><button className="primary-button submit">Create loan</button></form></Modal>}

    {paymentLoan && <Modal close={() => setPaymentLoan(null)}><form onSubmit={recordPayment}><ModalTitle eyebrow="RECORD PAYMENT" title={paymentLoan.borrower} close={() => setPaymentLoan(null)}/><div className="payment-summary three-up"><span>Principal remaining<strong>{money(paymentLoan.currentPrincipal)}</strong></span><span>Monthly interest<strong>{money(Math.round(paymentLoan.currentPrincipal * paymentLoan.rate) / 100)}</strong></span><span>Interest due on selected date<strong>{money(interestOnPaymentDate)}</strong></span></div><label>Amount received<input required autoFocus name="amount" type="number" min="0.01" max={paymentLoan.currentPrincipal + interestOnPaymentDate} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><div className="form-grid"><label>Payment date<input required name="paidAt" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)}/></label><label>Method<select name="method"><option>Cash</option><option>Bank transfer</option><option>Other</option></select></label></div><div className="allocation-preview"><div><span>This payment</span><strong>{money(enteredPayment)}</strong></div><div><span>To interest</span><strong>{money(interestAllocation)}</strong></div><div><span>To principal</span><strong>{money(principalAllocation)}</strong></div><div className="principal-after"><span>Principal after payment</span><strong>{money(principalAfterPayment)}</strong></div></div><p className="allocation-note">Interest is paid first. Only the remaining amount reduces the principal and lowers future monthly interest.</p><button className="primary-button submit">Record payment</button></form></Modal>}

    {editLoan && <Modal close={() => setEditLoan(null)}><form onSubmit={updateLoan}><ModalTitle eyebrow="EDIT LOAN" title={editLoan.borrower} close={() => setEditLoan(null)}/><label>Borrower name<input required maxLength={120} name="borrower" defaultValue={editLoan.borrower}/></label><div className="form-grid"><label>Monthly rate (%)<input required name="rate" type="number" min="0" max="100" step="0.001" defaultValue={editLoan.rate}/></label><label>Next payment date<input required name="nextPayment" type="date" defaultValue={editLoan.nextPayment.slice(0, 10)}/></label></div><p className="allocation-note">Original amount: {money(editLoan.principal)}. It cannot be edited because payments are tied to it.</p><button className="primary-button submit">Save changes</button></form></Modal>}

    {historyLoan && <Modal close={() => setHistoryLoan(null)} wide><div><ModalTitle eyebrow="PAYMENT HISTORY" title={historyLoan.borrower} close={() => setHistoryLoan(null)}/><div className="history-summary"><span>Total borrowed<strong>{money(historyLoan.principal)}</strong></span><span>Total received<strong>{money(historyLoan.paid)}</strong></span><span>Principal left<strong>{money(historyLoan.currentPrincipal)}</strong></span></div>{historyLoading ? <p className="history-empty">Loading history…</p> : payments.length ? <div className="history-list"><div className="history-head"><span>Date</span><span>Amount</span><span>Interest</span><span>Principal</span><span>Method</span></div>{payments.map((payment) => <div className="history-row" key={payment.id}><span>{displayDate(payment.paidAt)}</span><strong>{money(payment.amount)}</strong><span>{money(payment.interestAmount)}</span><span>{money(payment.principalAmount)}</span><span>{payment.method || "—"}</span></div>)}</div> : <div className="history-empty"><strong>No payments yet</strong><p>This borrower has not made a recorded payment for this loan.</p></div>}</div></Modal>}
  </main>;
}

function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={close}><div className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>; }
function ModalTitle({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) { return <div className="modal-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" onClick={close}>×</button></div>; }
function Metric({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) { return <article className="metric"><div className="metric-top"><span>{label}</span></div><strong>{value}</strong><div className="metric-bottom"><span className={alert ? "warning-dot" : ""}>{detail}</span></div></article>; }
