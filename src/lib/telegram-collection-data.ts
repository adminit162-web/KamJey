import { db } from "./db";
import { projectCollectionLoan } from "./telegram-collection";
export async function currentTelegramLoans(sql: ReturnType<typeof db>, today: string) {
  const rows = await sql`
    select l.id, l.loan_number, b.full_name as borrower, l.current_principal,
      l.accrued_interest, l.monthly_interest_rate, l.next_interest_adjustment, l.payment_day,
      to_char(l.next_payment_date, 'YYYY-MM-DD') as next_date,
      to_char(l.interest_due_since, 'YYYY-MM-DD') as interest_date
    from loans l join borrowers b on b.id = l.borrower_id where l.status = 'active'
    order by l.loan_number
  `;
  return rows.map(row => projectCollectionLoan(row, today));
}
