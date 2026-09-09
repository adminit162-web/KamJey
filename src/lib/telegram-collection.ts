export type CollectionLoan = {
  id: string; loanNumber: number; borrower: string; principal: number; interest: number;
  dueDate: string; days: number;
};
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
export const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export const displayDate = (value: string) => value.split("-").reverse().join("/");
export function cambodiaToday(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
function nextMonth(date: string, day: number) {
  const [year, month] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
// Project the existing monthly accrual rules without changing financial records.
export function projectCollectionLoan(row: Record<string, unknown>, today: string): CollectionLoan {
  const principal = Number(row.current_principal);
  const rate = Number(row.monthly_interest_rate);
  let accrued = Number(row.accrued_interest);
  let adjustment = Number(row.next_interest_adjustment);
  let next = String(row.next_date);
  let dueSince = row.interest_date ? String(row.interest_date) : null;
  for (let cycles = 0; principal > 0 && next <= today; cycles++) {
    if (cycles >= 1200) throw new Error("Loan accrual exceeds supported date range.");
    if (accrued === 0) dueSince = next;
    accrued = Math.max(0, round(accrued + principal * rate / 100 + adjustment));
    adjustment = 0;
    next = nextMonth(next, Number(row.payment_day));
  }
  const dueDate = accrued > 0 && dueSince ? dueSince : next;
  return {
    id: String(row.id), loanNumber: Number(row.loan_number), borrower: String(row.borrower), principal,
    interest: accrued > 0 ? accrued : Math.max(0, round(principal * rate / 100 + adjustment)),
    dueDate, days: Math.round((Date.parse(dueDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000),
  };
}
export function collectionLoanDetails(loan: CollectionLoan) {
  return [
    `<b>KJ-${String(loan.loanNumber).padStart(4, "0")}</b> · ${escapeHtml(loan.borrower)}`,
    `Due: ${displayDate(loan.dueDate)}${loan.days < 0 ? ` · ${-loan.days} day(s) overdue` : ""}`,
    `Principal remaining: <b>${money(loan.principal)}</b>`,
    `${loan.days <= 0 ? "Interest to pay" : "Upcoming interest"}: <b>${money(loan.interest)}</b>`,
  ].join("\n");
}
export function collectionReportParts(loans: CollectionLoan[], today: string) {
  const groups = [
    { title: "⏰ Due today", loans: loans.filter(l => l.days === 0) },
    { title: "📅 Due within 3 days", loans: loans.filter(l => l.days > 0 && l.days <= 3) },
    { title: "🚨 Overdue", loans: loans.filter(l => l.days < 0) },
  ];
  const blocks = [`<b>📋 Daily collection report — ${displayDate(today)}</b>`];
  for (const group of groups) {
    blocks.push(`<b>${group.title} (${group.loans.length})</b>`);
    blocks.push(...(group.loans.length ? group.loans.sort((a,b) => a.days - b.days || a.loanNumber - b.loanNumber).map(collectionLoanDetails) : ["None."]));
  }
  blocks.push(["<b>Interest collection totals</b>", ...groups.map(g => `${g.title}: <b>${money(g.loans.reduce((sum,l) => sum + l.interest, 0))}</b>`), "", "Principal is shown for reference; it is not a required principal installment.", "Commands: /today · /upcoming · /overdue · /summary"].join("\n"));
  // Split only between complete blocks, keeping HTML tags and each loan intact.
  const parts: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (block.length > 3900) throw new Error("A report entry exceeds Telegram's message limit.");
    if (current && current.length + block.length + 2 > 3900) { parts.push(current); current = ""; }
    current += (current ? "\n\n" : "") + block;
  }
  if (current) parts.push(current);
  return parts.map((part,index) => parts.length > 1 ? `<b>Collection report ${displayDate(today)} · ${index + 1}/${parts.length}</b>\n\n${part}` : part);
}
