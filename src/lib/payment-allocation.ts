const cents = (value: number) => Math.round(value * 100) / 100;

// Upcoming interest is fixed for this installment when paid early.
// Later installments continue using the remaining principal as before.
// The automatic split pays overdue interest first; with nothing overdue it pays upcoming interest first.
export function allocatePayment(amount: number, principal: number, accrued: number, upcoming: number, rate: number, override?: number) {
  const interest = override === undefined ? Math.min(amount, accrued > 0 ? accrued : upcoming) : cents(override);
  if (!Number.isFinite(interest) || interest < 0 || interest > amount || interest > cents(accrued + upcoming)) {
    throw new Error("Interest must be between zero and the unpaid interest, and cannot exceed the payment.");
  }
  const principalAmount = cents(amount - interest);
  if (principalAmount > principal) throw new Error("Principal payment cannot exceed the remaining principal.");
  const earlyInterest = cents(Math.max(0, interest - accrued));
  const adjustmentDelta = earlyInterest > 0 ? cents(earlyInterest - principalAmount * rate / 100) : 0;
  return { interest, principalAmount, earlyInterest, adjustmentDelta, accruedAfter: cents(accrued - interest + earlyInterest) };
}

const monthlyDate = (date: string, monthsBack: number, day: number) => {
  const [year, month] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};

// Unpaid interest is settled oldest month first, so the oldest unpaid due date is
// found by counting back the months the remaining interest still covers.
export function oldestUnpaidDueDate(accrued: number, monthlyInterest: number, nextPaymentDate: string, paymentDay: number, notBefore: string | null) {
  if (accrued <= 0) return null;
  const months = monthlyInterest > 0 ? Math.max(1, Math.ceil(accrued / monthlyInterest - 0.0001)) : 1;
  const dueDate = monthlyDate(nextPaymentDate, months, paymentDay);
  return notBefore && dueDate < notBefore.slice(0, 10) ? notBefore.slice(0, 10) : dueDate;
}
