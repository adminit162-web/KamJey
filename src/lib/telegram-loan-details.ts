const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function telegramLoanLines(rows: Record<string, unknown>[]) {
  if (!rows.length) return "No matching active loans.";
  return rows.map((row) => {
    const due = String(row.alert_date).split("-").reverse().join("/");
    const principal = Number(row.current_principal);
    const accrued = Number(row.accrued_interest);
    // Match the dashboard/reminders: unpaid accrued interest takes precedence;
    // otherwise show the next installment, including any top-up adjustment.
    const scheduled = Math.max(0, Math.round((principal * Number(row.monthly_interest_rate) / 100 + Number(row.next_interest_adjustment)) * 100) / 100);
    const interest = accrued > 0 ? accrued : scheduled;
    return [
      `<b>KJ-${String(row.loan_number).padStart(4, "0")}</b> · ${escapeHtml(String(row.borrower))}`,
      `Due: ${due}`,
      `Principal remaining: <b>${money(principal)}</b>`,
      `${accrued > 0 ? "Unpaid interest" : "Interest at next payment"}: <b>${money(interest)}</b>`,
      `Principal + interest: <b>${money(principal + interest)}</b>`,
    ].join("\n");
  }).join("\n\n");
}
