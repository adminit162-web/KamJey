const cents = (value: number) => Math.round(value * 100) / 100;

// Upcoming interest is fixed for this installment when explicitly paid early.
// Later installments continue using the remaining principal as before.
export function allocatePayment(amount: number, principal: number, accrued: number, upcoming: number, rate: number, override?: number) {
  const interest = override === undefined ? Math.min(amount, accrued) : cents(override);
  if (!Number.isFinite(interest) || interest < 0 || interest > amount || interest > cents(accrued + upcoming)) {
    throw new Error("Interest must be between zero and the unpaid interest, and cannot exceed the payment.");
  }
  const principalAmount = cents(amount - interest);
  if (principalAmount > principal) throw new Error("Principal payment cannot exceed the remaining principal.");
  const earlyInterest = cents(Math.max(0, interest - accrued));
  const adjustmentDelta = earlyInterest > 0 ? cents(earlyInterest - principalAmount * rate / 100) : 0;
  return { interest, principalAmount, earlyInterest, adjustmentDelta, accruedAfter: cents(accrued - interest + earlyInterest) };
}
