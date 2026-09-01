"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "./language-provider";

type LoanStatus = "Due soon" | "Active" | "Overdue" | "Paid";
type LoanFilter = "All" | "Needs attention" | "Monthly payments" | "Paid off";
type Management = "Manith" | "Linda";
type ManagementFilter = "All management" | Management;
type MonthlyStatus = "Paid this month" | "Paid off" | "Unpaid" | "Not due yet";
type BorrowingTopup = { amount: number; toppedUpAt: string };
type Loan = {
  id: string; loanNumber: number; borrower: string; management: Management; initials: string; color: string;
  principal: number; currentPrincipal: number; accruedInterest: number; nextInterestAdjustment: number;
  interestDueSince: string | null; rate: number; start: string; nextPayment: string; paymentDay: number;
  paid: number; interestPaid: number; principalPaid: number; paymentCount: number;
  currentMonthPaid: number; currentMonthInterestPaid: number; currentMonthPrincipalPaid: number; latestMonthPaymentDate: string | null;
  periodPaid: number; periodInterestPaid: number; periodPrincipalPaid: number; latestPeriodPaymentDate: string | null;
  periodOpeningPrincipal: number; periodClosingPrincipal: number; periodTopups: number; periodTopupInterest: number;
  totalTopups: number; topupHistory: BorrowingTopup[]; status: LoanStatus;
};
type MonthlyLoan = Loan & { monthlyStatus: MonthlyStatus; periodDueDate: string; newInPeriod: boolean };
type Payment = { id: string; amount: number; interestAmount: number; principalAmount: number; paidAt: string; method: string | null; note: string | null };
type Topup = { id: string; amount: number; toppedUpAt: string; partialInterest: number; principalBefore: number; principalAfter: number; note: string | null };

const colors = ["rose", "blue", "amber", "violet", "green"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
const dateFromSql = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`);
const displayDate = (value: string) => { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year.slice(-2)}`; };
const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
const khmerNumber = (value: string | number) => String(value).replace(/\d/g, (digit) => "០១២៣៤៥៦៧៨៩"[Number(digit)]);
const formatReadableDate = (value: string, locale: string) => { const date = dateFromSql(value); return locale.startsWith("km") ? `${khmerNumber(date.getDate())} ${khmerMonths[date.getMonth()]} ${khmerNumber(date.getFullYear())}` : new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(date); };
const readableMonth = (value: string, locale: string) => { const date = dateFromSql(value); return locale.startsWith("km") ? `${khmerMonths[date.getMonth()]} ${khmerNumber(date.getFullYear())}` : new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date); };
const daysUntil = (value: string) => Math.ceil((dateFromSql(value).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
const loanStatus = (status: string, nextPayment: string, dueSince?: string | null): LoanStatus => status === "paid" ? "Paid" : dueSince && daysUntil(dueSince) < 0 ? "Overdue" : dueSince || daysUntil(nextPayment) <= 7 ? "Due soon" : "Active";
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const localToday = () => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; };
const localMonth = () => localToday().slice(0, 7);
const shiftMonth = (month: string, amount: number) => { const [year, monthNumber] = month.split("-").map(Number); const shifted = new Date(year, monthNumber - 1 + amount, 1); return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`; };
const monthDueDate = (month: string, preferredDay: number) => { const [year, monthNumber] = month.split("-").map(Number); const lastDay = new Date(year, monthNumber, 0).getDate(); return `${month}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`; };
const previousDay = (value: string) => { const date = dateFromSql(value); date.setDate(date.getDate() - 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
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
    id: String(record.id), loanNumber: Number(record.loan_number), borrower: String(record.borrower), management: String(record.management) as Management, initials: initials(String(record.borrower)), color: colors[index % colors.length],
    principal: Number(record.principal), currentPrincipal: Number(record.current_principal), accruedInterest: Number(record.accrued_interest), nextInterestAdjustment: Number(record.next_interest_adjustment),
    interestDueSince: record.interest_due_since ? String(record.interest_due_since) : null, rate: Number(record.rate), start: String(record.start_date), nextPayment: String(record.next_payment_date), paymentDay: Number(record.payment_day),
    paid: Number(record.paid), interestPaid: Number(record.interest_paid), principalPaid: Number(record.principal_paid), paymentCount: Number(record.payment_count), currentMonthPaid: Number(record.current_month_paid), currentMonthInterestPaid: Number(record.current_month_interest_paid), currentMonthPrincipalPaid: Number(record.current_month_principal_paid), latestMonthPaymentDate: record.latest_month_payment_date ? String(record.latest_month_payment_date) : null, periodPaid: Number(record.period_paid), periodInterestPaid: Number(record.period_interest_paid), periodPrincipalPaid: Number(record.period_principal_paid), latestPeriodPaymentDate: record.latest_period_payment_date ? String(record.latest_period_payment_date) : null, periodOpeningPrincipal: Number(record.period_opening_principal), periodClosingPrincipal: Number(record.period_closing_principal), periodTopups: Number(record.period_topups), periodTopupInterest: Number(record.period_topup_interest), totalTopups: Number(record.total_topups), topupHistory, status: loanStatus(String(record.status), String(record.next_payment_date), record.interest_due_since ? String(record.interest_due_since) : null),
  };
}

async function fetchLoans(month = localMonth()): Promise<Loan[]> {
  const response = await fetch(`/api/loans?month=${encodeURIComponent(month)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load loans.");
  return body.map((record: Record<string, unknown>, index: number) => mapLoan(record, index));
}

export default function Home() {
  const { t, locale } = useLanguage();
  const readableDate = (value: string) => formatReadableDate(value, locale);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [createStart, setCreateStart] = useState("");
  const [paymentLoan, setPaymentLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localToday);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const paymentSavingRef = useRef(false);
  const [topupLoan, setTopupLoan] = useState<Loan | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupDate, setTopupDate] = useState(localToday);
  const [historyLoan, setHistoryLoan] = useState<Loan | null>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("Cash");
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [paymentEditSaving, setPaymentEditSaving] = useState(false);
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
  const [managementFilter, setManagementFilter] = useState<ManagementFilter>("All management");
  const [selectedMonth, setSelectedMonth] = useState(localMonth);

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => shiftMonth(localMonth(), -index)), []);
  const selectedMonthLabel = readableMonth(`${selectedMonth}-01`, locale);
  const selectedMonthIndex = monthOptions.indexOf(selectedMonth);

  const loadLoans = useCallback(async () => {
    setLoans(await fetchLoans(selectedMonth));
  }, [selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    fetchLoans(selectedMonth)
      .then((loadedLoans) => { if (!cancelled) setLoans(loadedLoans); })
      .catch((error: Error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [selectedMonth]);

  const periodStart = `${selectedMonth}-01`;
  const periodEnd = `${shiftMonth(selectedMonth, 1)}-01`;
  const reportDate = selectedMonth === localMonth() ? localToday() : previousDay(periodEnd);
  const reportDateLabel = readableDate(reportDate);
  const monthlyLoans: MonthlyLoan[] = loans.filter((loan) => loan.start.slice(0, 10) <= reportDate && (loan.periodOpeningPrincipal > 0 || loan.periodClosingPrincipal > 0 || loan.start.slice(0, 10) >= periodStart)).map((loan) => {
    const periodDueDate = monthDueDate(selectedMonth, loan.paymentDay);
    const firstDueDate = nextMonthlyDate(loan.start.slice(0, 10), loan.paymentDay);
    const newInPeriod = loan.start.slice(0, 10) >= periodStart && loan.start.slice(0, 10) < periodEnd;
    const paidOffInPeriod = loan.periodClosingPrincipal <= 0 && loan.periodPrincipalPaid > 0;
    const monthlyStatus: MonthlyStatus = paidOffInPeriod ? "Paid off" : loan.periodPaid > 0 ? "Paid this month" : firstDueDate <= reportDate && periodDueDate <= reportDate ? "Unpaid" : "Not due yet";
    return { ...loan, monthlyStatus, periodDueDate, newInPeriod };
  });
  const statuses = {
    paid: monthlyLoans.filter((loan) => loan.monthlyStatus === "Paid this month").length,
    unpaid: monthlyLoans.filter((loan) => loan.monthlyStatus === "Unpaid").length,
    notDue: monthlyLoans.filter((loan) => loan.monthlyStatus === "Not due yet").length,
    paidOff: monthlyLoans.filter((loan) => loan.monthlyStatus === "Paid off").length,
  };
  const totals = {
    received: monthlyLoans.reduce((sum, loan) => sum + loan.periodPaid, 0),
    interestReceived: monthlyLoans.reduce((sum, loan) => sum + loan.periodInterestPaid, 0),
    principalReceived: monthlyLoans.reduce((sum, loan) => sum + loan.periodPrincipalPaid, 0),
    closingPrincipal: monthlyLoans.reduce((sum, loan) => sum + loan.periodClosingPrincipal, 0),
    expectedInterest: monthlyLoans.reduce((sum, loan) => {
      const firstDueDate = nextMonthlyDate(loan.start.slice(0, 10), loan.paymentDay);
      return firstDueDate <= loan.periodDueDate ? sum + Math.round((loan.periodOpeningPrincipal * loan.rate / 100 + loan.periodTopupInterest) * 100) / 100 : sum;
    }, 0),
    fundsIssued: monthlyLoans.reduce((sum, loan) => sum + (loan.newInPeriod ? loan.principal : 0) + loan.periodTopups, 0),
    newLoans: monthlyLoans.filter((loan) => loan.newInPeriod).length,
    statuses,
  };
  const query = loanSearch.trim().toLowerCase();
  const visibleLoans = monthlyLoans.filter((loan) => {
    const matchesSearch = !query || loan.borrower.toLowerCase().includes(query) || `kj-${String(loan.loanNumber).padStart(4, "0")}`.includes(query);
    const matchesFilter = loanFilter === "All" || loanFilter === "Needs attention" && loan.monthlyStatus === "Unpaid" || loanFilter === "Monthly payments" && loan.periodPaid > 0 || loanFilter === "Paid off" && loan.monthlyStatus === "Paid off";
    const matchesManagement = managementFilter === "All management" || loan.management === managementFilter;
    return matchesSearch && matchesFilter && matchesManagement;
  });
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
    const response = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower: data.get("borrower"), management: data.get("management"), principal: Number(data.get("principal")), rate: Number(data.get("rate")), start: data.get("start") }) });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to save loan.");
    await loadLoans(); setShowForm(false); setCreateStart(""); setLoadError("");
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentLoan || paymentSavingRef.current) return;
    paymentSavingRef.current = true; setPaymentSaving(true);
    try {
      const data = new FormData(event.currentTarget);
      const response = await fetch(`/api/loans/${paymentLoan.id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(data.get("amount")), paidAt: data.get("paidAt"), method: data.get("method") }) });
      const body = await response.json();
      if (!response.ok) return setLoadError(body.error || "Unable to record payment.");
      await loadLoans(); setPaymentLoan(null); setPaymentAmount(""); setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to record payment."); }
    finally { paymentSavingRef.current = false; setPaymentSaving(false); }
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
      const response = await fetch(`/api/loans/${editLoan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower: data.get("borrower"), management: data.get("management"), principal: Number(data.get("principal")), rate: Number(data.get("rate")), nextPayment: data.get("nextPayment") }) });
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

  function openPaymentEdit(payment: Payment) {
    setEditPayment(payment); setEditPaymentAmount(String(payment.amount)); setEditPaymentDate(payment.paidAt.slice(0, 10)); setEditPaymentMethod(payment.method || "Cash"); setEditPaymentNote(payment.note || ""); setEditError("");
  }

  async function updatePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!historyLoan || !editPayment) return;
    setPaymentEditSaving(true); setEditError("");
    try {
      const response = await fetch(`/api/loans/${historyLoan.id}/payments/${editPayment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(editPaymentAmount), paidAt: editPaymentDate, method: editPaymentMethod, note: editPaymentNote }) });
      const body = await response.json();
      if (!response.ok) return setEditError(body.error || "Unable to update payment.");
      setEditPayment(null); await Promise.all([loadLoans(), openHistory(historyLoan)]); setLoadError("");
    } catch (error) { setEditError(error instanceof Error ? error.message : "Unable to update payment."); }
    finally { setPaymentEditSaving(false); }
  }

  async function deletePayment(payment: Payment) {
    if (!historyLoan || !window.confirm(t("Delete this payment? The loan balance will be recalculated."))) return;
    const response = await fetch(`/api/loans/${historyLoan.id}/payments/${payment.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return setLoadError(body.error || "Unable to delete payment.");
    await Promise.all([loadLoans(), openHistory(historyLoan)]); setLoadError("");
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
      <section className="dashboard-report-bar"><div><span>{t("Monthly overview")}</span><strong>{selectedMonthLabel}</strong><small>{t("Data through {date}", { date: reportDateLabel })}</small></div><div className="portfolio-period dashboard-period" aria-label={t("Report month")}><button type="button" onClick={() => selectedMonthIndex < monthOptions.length - 1 && setSelectedMonth(monthOptions[selectedMonthIndex + 1])} disabled={selectedMonthIndex === monthOptions.length - 1} aria-label={t("Previous month")}>‹</button><label><span>{t("Report month")}</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{monthOptions.map((month) => <option key={month} value={month}>{readableMonth(`${month}-01`, locale)}</option>)}</select></label><button type="button" onClick={() => selectedMonthIndex > 0 && setSelectedMonth(monthOptions[selectedMonthIndex - 1])} disabled={selectedMonthIndex === 0} aria-label={t("Next month")}>›</button>{selectedMonth !== monthOptions[0] && <button type="button" className="portfolio-current-month" onClick={() => setSelectedMonth(monthOptions[0])}>{t("Current month")}</button>}</div></section>
      <div className="analytics-grid">
        <ReceivableCard title={t("Collected in {month}", { month: selectedMonthLabel })} copy={t("Payments recorded during this month.")} totalLabel={t("Total received")} total={money(totals.received)} principalLabel={t("Principal collected")} principal={money(totals.principalReceived)} interestLabel={t("Interest collected")} interest={money(totals.interestReceived)}/>
        <DonutCard title={t("Payment status in {month}", { month: selectedMonthLabel })} copy={t("Status as of {date}", { date: reportDateLabel })} centerLabel={t("Loans in month")} centerValue={String(monthlyLoans.length)} segments={[{ label: t("Paid this month"), value: totals.statuses.paid, color: "#3f8b68" }, { label: t("Unpaid"), value: totals.statuses.unpaid, color: "#d95f4f" }, { label: t("Not due yet"), value: totals.statuses.notDue, color: "#e4a03c" }, { label: t("Paid off"), value: totals.statuses.paidOff, color: "#7890a3" }]}/>
        <div className="analytics-kpis"><Metric label={t("Closing principal")} value={money(totals.closingPrincipal)} detail={t("As of {date}", { date: reportDateLabel })}/><Metric label={t("Expected interest in {month}", { month: selectedMonthLabel })} value={money(totals.expectedInterest)} detail={t("Based on opening balances")}/><Metric label={t("Funds issued in {month}", { month: selectedMonthLabel })} value={money(totals.fundsIssued)} detail={t("{count} new loan(s)", { count: totals.newLoans })}/></div>
      </div>
      <div className="section-heading portfolio-heading"><div><h2>{t("Loan activity in {month}", { month: selectedMonthLabel })}</h2><p>{t("Opening balances, payments and closing balances for the selected month.")}</p></div><span>{t("{shown} of {total} loans", { shown: visibleLoans.length, total: monthlyLoans.length })}</span></div>
      {loadError && <p className="database-notice">{loadError}</p>}
      <div className="portfolio-toolbar"><div className="portfolio-filter-controls"><label className="management-select"><select value={managementFilter} onChange={(event) => setManagementFilter(event.target.value as ManagementFilter)} aria-label={t("Management")}><option value="All management">{t("All management")}</option><option value="Manith">Manith</option><option value="Linda">Linda</option></select></label><div className="portfolio-filters" role="group" aria-label={t("Loans")}>{(["All", "Needs attention", "Monthly payments", "Paid off"] as LoanFilter[]).map((filter) => <button type="button" className={loanFilter === filter ? "active" : ""} key={filter} onClick={() => setLoanFilter(filter)}>{t(filter)}</button>)}</div></div><label className="portfolio-search"><span aria-hidden="true">⌕</span><input value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder={t("Search borrower or loan ID")} aria-label={t("Search borrower or loan ID")} /></label></div>
      <div className="portfolio-table"><div className="portfolio-table-head"><span>{t("Borrower")}</span><span>{t("Closing balance")}</span><span>{t("Month status")}</span><span>{t("Paid in {month}", { month: selectedMonthLabel })}</span><span aria-label={t("Manage")}/></div>
        {visibleLoans.length ? visibleLoans.map((loan) => {
          const firstDueDate = nextMonthlyDate(loan.start.slice(0, 10), loan.paymentDay);
          const dueDate = firstDueDate > loan.periodDueDate ? firstDueDate : loan.periodDueDate;
          const statusClass = loan.monthlyStatus === "Paid this month" ? "paid-month" : loan.monthlyStatus === "Paid off" ? "paid" : loan.monthlyStatus === "Unpaid" ? "overdue" : "not-due";
          const statusDetail = loan.latestPeriodPaymentDate ? t("Last paid on {date}", { date: displayDate(loan.latestPeriodPaymentDate) }) : t("Due {date}", { date: displayDate(dueDate) });
          const monthlyBreakdown = loan.periodPaid <= 0 ? t("No payment recorded") : loan.periodInterestPaid > 0 && loan.periodPrincipalPaid > 0 ? t("{principal} principal · {interest} interest", { principal: compactMoney(loan.periodPrincipalPaid), interest: compactMoney(loan.periodInterestPaid) }) : loan.periodPrincipalPaid > 0 ? t("{amount} principal", { amount: compactMoney(loan.periodPrincipalPaid) }) : t("{amount} interest", { amount: compactMoney(loan.periodInterestPaid) });
          const principalInterest = Math.round(loan.periodClosingPrincipal * loan.rate) / 100;
          return <article className="portfolio-row" key={loan.id}>
            <div className="portfolio-borrower"><div className={`avatar ${loan.color}`}>{loan.initials}</div><div><strong>{loan.borrower}</strong><small>KJ-{String(loan.loanNumber).padStart(4, "0")} · {loan.management}</small></div></div>
            <div className="portfolio-balance"><strong>{money(loan.periodClosingPrincipal)}</strong><small>{t("{principal} principal · {interest} interest", { principal: compactMoney(loan.periodClosingPrincipal), interest: compactMoney(principalInterest) })}</small></div>
            <div className="portfolio-status"><span className={`status-pill ${statusClass}`}>{loan.monthlyStatus === "Paid this month" ? t("Paid during {month}", { month: selectedMonthLabel }) : t(loan.monthlyStatus)}</span><small>{statusDetail}</small></div>
            <div className="portfolio-month-payment"><strong>{money(loan.periodPaid)}</strong><small>{monthlyBreakdown}</small></div>
            <div className="portfolio-actions"><div className="split-action"><button type="button" className="action-button pay-action" disabled={loan.status === "Paid"} onClick={() => openPayment(loan)}>{t(loan.status === "Paid" ? "Paid" : "Pay")}</button><div className="more-actions"><button type="button" className="more-trigger" aria-label={`${t("Manage")} ${loan.borrower}`} aria-expanded={actionMenu === loan.id} onClick={() => setActionMenu((current) => current === loan.id ? null : loan.id)}><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></button>{actionMenu === loan.id && <div className="actions-menu"><button onClick={() => { setActionMenu(null); openHistory(loan); }}><span>↺</span><span><strong>{t("View history")}</strong><small>{t("{count} recorded activities", { count: loan.paymentCount + loan.topupHistory.length })}</small></span></button><button disabled={loan.status === "Paid"} onClick={() => { setActionMenu(null); openTopup(loan); }}><span>＋</span><span><strong>{t("Add funds")}</strong><small>{t("Increase this loan")}</small></span></button><button onClick={() => { setActionMenu(null); setEditError(""); setEditLoan(loan); }}><span>✎</span><span><strong>{t("Edit loan")}</strong><small>{t("Name, rate or due date")}</small></span></button><button className="menu-delete" onClick={() => { setActionMenu(null); deleteLoan(loan); }}><span>⌫</span><span><strong>{t("Delete loan")}</strong><small>{t("Remove loan and history")}</small></span></button></div>}</div></div></div>
          </article>;
        }) : monthlyLoans.length ? <div className="empty-state"><div className="empty-icon">⌕</div><h3>{loanFilter === "Monthly payments" && !loanSearch ? t("No payments in {month}", { month: selectedMonthLabel }) : t("No matching loans")}</h3><p>{t("Try another name, loan ID, or status filter.")}</p><button onClick={() => { setLoanSearch(""); setLoanFilter("All"); setManagementFilter("All management"); }} className="primary-button">{t("Clear filters")}</button></div> : loans.length ? <div className="empty-state"><div className="empty-icon">◫</div><h3>{t("No loan activity in {month}", { month: selectedMonthLabel })}</h3><p>{t("Choose another month to review its activity.")}</p>{selectedMonthIndex < monthOptions.length - 1 && <button onClick={() => setSelectedMonth(monthOptions[selectedMonthIndex + 1])} className="primary-button">{t("View previous month")}</button>}</div> : <div className="empty-state"><div className="empty-icon">◫</div><h3>{t("No loans yet")}</h3><p>{t("Create your first loan to begin monthly interest tracking.")}</p><button onClick={() => setShowForm(true)} className="primary-button">{t("Create your first loan")}</button></div>}
      </div>
    {showForm && <Modal close={() => setShowForm(false)}><form onSubmit={addLoan}><ModalTitle eyebrow={t("NEW RECORD")} title={t("Create a loan")} close={() => setShowForm(false)}/><label>{t("Borrower name")}<input required maxLength={120} name="borrower" placeholder={t("e.g. Jamie Lee")} /></label><label>{t("Management")}<select required name="management" defaultValue="Linda"><option value="Manith">Manith</option><option value="Linda">Linda</option></select></label><div className="form-grid"><label>{t("Principal amount")}<input required name="principal" type="number" min="0.01" step="0.01" /></label><label>{t("Monthly rate (%)")}<input required name="rate" type="number" min="0" max="100" step="0.001" /></label></div><label><span className="date-label"><span>{t("Start date")}</span><i className="date-format">DD/MM/YY</i></span><span className="formatted-date-input"><span className={createStart ? "selected-date" : "date-placeholder"}>{createStart ? displayDate(createStart) : t("Choose a date")}</span><span className="calendar-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg></span><input required aria-label={t("Start date")} name="start" type="date" value={createStart} onClick={(event) => event.currentTarget.showPicker()} onChange={(event) => setCreateStart(event.target.value)}/></span><small className="field-help">{t("Click anywhere in the field to choose a date. The first interest payment is due one month later.")}</small></label><button className="primary-button submit">{t("Create loan")}</button></form></Modal>}

    {paymentLoan && <Modal close={() => { if (!paymentSaving) setPaymentLoan(null); }}><form onSubmit={recordPayment}><ModalTitle eyebrow={t("RECORD PAYMENT")} title={paymentLoan.borrower} close={() => { if (!paymentSaving) setPaymentLoan(null); }}/><div className="payment-summary three-up"><span>{t("Principal remaining")}<strong>{money(paymentLoan.currentPrincipal)}</strong></span><span>{t("Interest due on selected date")}<strong>{money(interestOnPaymentDate)}</strong></span><span>{t("Next full-month interest")}<strong>{money(fullMonthInterest(paymentLoan))}</strong></span></div><label>{t("Amount received")}<input required autoFocus name="amount" type="number" min="0.01" max={paymentLoan.currentPrincipal + interestOnPaymentDate} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><div className="form-grid"><label>{t("Payment date")}<input required name="paidAt" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)}/></label><label>{t("Method")}<select name="method"><option value="Cash">{t("Cash")}</option><option value="Bank transfer">{t("Bank transfer")}</option><option value="Other">{t("Other")}</option></select></label></div><div className="allocation-preview"><div><span>{t("This payment")}</span><strong>{money(enteredPayment)}</strong></div><div><span>{t("To interest")}</span><strong>{money(interestAllocation)}</strong></div><div><span>{t("To principal")}</span><strong>{money(principalAllocation)}</strong></div><div className="principal-after"><span>{t("Principal after payment")}</span><strong>{money(principalAfterPayment)}</strong></div></div><p className="allocation-note">{t("Interest is paid first. Only the remaining amount reduces the principal and lowers future monthly interest.")}</p><button className="primary-button submit" disabled={paymentSaving}>{t(paymentSaving ? "Saving…" : "Record payment")}</button></form></Modal>}

    {topupLoan && <Modal close={() => setTopupLoan(null)}><form onSubmit={recordTopup}><ModalTitle eyebrow={t("ADD TO LOAN")} title={topupLoan.borrower} close={() => setTopupLoan(null)}/><div className="payment-summary"><span>{t("Principal before")}<strong>{money(topupLoan.currentPrincipal)}</strong></span><span>{t("Monthly rate")}<strong>{topupLoan.rate}%</strong></span></div><label>{t("Additional amount")}<input required autoFocus name="amount" type="number" min="0.01" step="0.01" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)}/></label><label>{t("Top-up date")}<input required name="toppedUpAt" type="date" min={topupPeriodStart} max={localToday()} value={topupDate} onChange={(event) => setTopupDate(event.target.value)}/></label><div className="topup-preview"><div><span>{t("Principal after top-up")}</span><strong>{money(topupLoan.currentPrincipal + enteredTopup)}</strong></div><div><span>{t("Days charged this period")}</span><strong>{topupRemainingDays} / {topupPeriodDays}</strong></div><div><span>{t("Interest on this top-up")}</span><strong>{money(topupPartialInterest)}</strong></div><div className="topup-interest-total"><span>{t("Total interest due {date}", { date: readableDate(topupLoan.nextPayment) })}</span><strong>{money(topupInterestAtNextDue)}</strong></div><div className="topup-full-month"><span>{t("Following full month")}</span><strong>{money(topupFollowingFullMonthInterest)}</strong></div></div><label>{t("Note (optional)")}<input name="note" maxLength={240} placeholder={t("Reason for additional borrowing")}/></label><p className="allocation-note">{t("Only the added amount is prorated for the remaining days. From the following full month, interest uses the complete new principal.")}</p><button className="primary-button submit">{t("Add {amount} to loan", { amount: money(enteredTopup) })}</button></form></Modal>}

    {editLoan && <Modal close={() => { if (!editSaving) setEditLoan(null); }}><form onSubmit={updateLoan}><ModalTitle eyebrow={t("EDIT LOAN")} title={editLoan.borrower} close={() => { if (!editSaving) setEditLoan(null); }}/><label>{t("Borrower name")}<input required maxLength={120} name="borrower" defaultValue={editLoan.borrower}/></label><label>{t("Management")}<select required name="management" defaultValue={editLoan.management}><option value="Manith">Manith</option><option value="Linda">Linda</option></select></label><label>{t("Principal amount")}<input required name="principal" type="number" min="0.01" step="0.01" defaultValue={editLoan.principal}/></label><div className="form-grid"><label>{t("Monthly rate (%)")}<input required name="rate" type="number" min="0" max="100" step="0.001" defaultValue={editLoan.rate}/></label><label>{t("Next payment date")}<input required name="nextPayment" type="date" min={editLoan.start.slice(0, 10)} defaultValue={editLoan.nextPayment.slice(0, 10)}/></label></div><p className="allocation-note">{t("Changing the amount or rate recalculates principal and accrued interest. Financial terms are locked after payments or added funds exist.")}</p>{editError && <p className="modal-error" role="alert">{editError}</p>}<button className="primary-button submit" disabled={editSaving}>{t(editSaving ? "Saving…" : "Save changes")}</button></form></Modal>}

    {editTopup && historyLoan && <Modal close={() => { if (!topupEditSaving) setEditTopup(null); }}><form onSubmit={updateTopup}><ModalTitle eyebrow={t("EDIT ADDED FUNDS")} title={historyLoan.borrower} close={() => { if (!topupEditSaving) setEditTopup(null); }}/><label>{t("Additional amount")}<input required autoFocus type="number" min="0.01" step="0.01" value={editTopupAmount} onChange={(event) => setEditTopupAmount(event.target.value)}/></label><label>{t("Top-up date")}<input required type="date" max={localToday()} value={editTopupDate} onChange={(event) => setEditTopupDate(event.target.value)}/></label><label>{t("Note (optional)")}<input maxLength={240} value={editTopupNote} onChange={(event) => setEditTopupNote(event.target.value)} placeholder={t("Reason for additional borrowing")}/></label><p className="allocation-note">{t("The loan principal and prorated interest will be recalculated automatically.")}</p>{editError && <p className="modal-error" role="alert">{editError}</p>}<button className="primary-button submit" disabled={topupEditSaving}>{t(topupEditSaving ? "Saving…" : "Save changes")}</button></form></Modal>}
    {editPayment && historyLoan && <Modal close={() => { if (!paymentEditSaving) setEditPayment(null); }}><form onSubmit={updatePayment}><ModalTitle eyebrow={t("EDIT PAYMENT")} title={historyLoan.borrower} close={() => { if (!paymentEditSaving) setEditPayment(null); }}/><label>{t("Amount received")}<input required autoFocus type="number" min="0.01" step="0.01" value={editPaymentAmount} onChange={(event) => setEditPaymentAmount(event.target.value)}/></label><div className="form-grid"><label>{t("Payment date")}<input required type="date" max={localToday()} value={editPaymentDate} onChange={(event) => setEditPaymentDate(event.target.value)}/></label><label>{t("Method")}<select value={editPaymentMethod} onChange={(event) => setEditPaymentMethod(event.target.value)}><option value="Cash">{t("Cash")}</option><option value="Bank transfer">{t("Bank transfer")}</option><option value="Other">{t("Other")}</option></select></label></div><label>{t("Note (optional)")}<input maxLength={240} value={editPaymentNote} onChange={(event) => setEditPaymentNote(event.target.value)}/></label><p className="allocation-note">{t("The loan balance and payment allocation will be recalculated automatically.")}</p>{editError && <p className="modal-error" role="alert">{editError}</p>}<button className="primary-button submit" disabled={paymentEditSaving}>{t(paymentEditSaving ? "Saving…" : "Save changes")}</button></form></Modal>}

    {historyLoan && <Modal close={() => setHistoryLoan(null)} wide><div><ModalTitle eyebrow={t("LOAN HISTORY")} title={historyLoan.borrower} close={() => setHistoryLoan(null)}/><div className="history-summary"><span>{t("Original loan")}<strong>{money(historyLoan.principal)}</strong></span><span>{t("Added funds")}<strong>{money(historyLoan.totalTopups)}</strong></span><span>{t("Principal left")}<strong>{money(historyLoan.currentPrincipal)}</strong></span><span>{t("Interest due")}<strong>{money(displayedInterestDue(historyLoan))}</strong><small>{historyLoan.accruedInterest > 0 ? t("Unpaid") : readableDate(historyLoan.nextPayment)}</small></span><span>{t("Total received")}<strong>{money(historyLoan.paid)}</strong></span></div>{historyLoading ? <p className="history-empty">{t("Loading history…")}</p> : <><h3 className="history-section-title">{t("Payments")}</h3>{payments.length ? <div className="history-list"><div className="history-head payment-history-grid">{["Date", "Amount", "Interest", "Principal", "Method", "Actions"].map((label) => <span key={label}>{t(label)}</span>)}</div>{payments.map((payment, index) => <div className="history-row payment-history-grid" key={payment.id}><span>{displayDate(payment.paidAt)}</span><strong>{money(payment.amount)}</strong><span>{money(payment.interestAmount)}</span><span>{money(payment.principalAmount)}</span><span>{payment.method ? t(payment.method) : "—"}</span><span className="topup-history-actions">{index === 0 && payment.paidAt.slice(0, 10) >= previousMonthlyDate(historyLoan.nextPayment, historyLoan.paymentDay) ? <><button type="button" onClick={() => openPaymentEdit(payment)}>{t("Edit")}</button><button type="button" className="delete" onClick={() => deletePayment(payment)}>{t("Delete")}</button></> : <small>{t("Locked")}</small>}</span></div>)}</div> : <p className="compact-history-empty">{t("No recorded payments.")}</p>}<h3 className="history-section-title topup-history-title">{t("Top-ups")}</h3>{topups.length ? <div className="history-list"><div className="history-head topup-history-grid">{["Date", "Added", "Prorated interest", "Before", "After", "Actions"].map((label) => <span key={label}>{t(label)}</span>)}</div>{topups.map((topup, index) => <div className="history-row topup-history-grid" key={topup.id}><span>{displayDate(topup.toppedUpAt)}</span><strong>{money(topup.amount)}</strong><span>{money(topup.partialInterest)}</span><span>{money(topup.principalBefore)}</span><span>{money(topup.principalAfter)}</span><span className="topup-history-actions">{index === 0 ? <><button type="button" onClick={() => openTopupEdit(topup)}>{t("Edit")}</button><button type="button" className="delete" onClick={() => deleteTopup(topup)}>{t("Delete")}</button></> : <small>{t("Locked")}</small>}</span></div>)}</div> : <p className="compact-history-empty">{t("No top-ups recorded.")}</p>}</>}</div></Modal>}
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
