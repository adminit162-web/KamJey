-- Store explicit splits and the upcoming installment credit for safe reversal.
alter table payments add column if not exists split_adjusted boolean not null default false;
alter table payments add column if not exists early_interest_amount numeric(14,2) not null default 0;
alter table payments add column if not exists early_interest_due_date date;
alter table payments add column if not exists interest_adjustment_delta numeric(14,2) not null default 0;

-- A fully prepaid installment must not create an overdue date or consume arrears.
create or replace function accrue_loan(loan_id_value uuid, as_of date default current_date)
returns void language plpgsql as $$
declare loan_row loans%rowtype;
begin
  select * into loan_row from loans where id = loan_id_value for update;
  while loan_row.status = 'active'
    and loan_row.current_principal > 0
    and loan_row.next_payment_date <= as_of loop
    if loan_row.accrued_interest = 0 then loan_row.interest_due_since := loan_row.next_payment_date; end if;
    loan_row.accrued_interest := greatest(0, round(loan_row.accrued_interest + greatest(0, round(loan_row.current_principal * loan_row.monthly_interest_rate / 100 + loan_row.next_interest_adjustment, 2)), 2));
    if loan_row.accrued_interest = 0 then loan_row.interest_due_since := null; end if;
    loan_row.next_interest_adjustment := 0;
    loan_row.next_payment_date := next_monthly_date(loan_row.next_payment_date, loan_row.payment_day);
  end loop;
  update loans set
    accrued_interest = loan_row.accrued_interest,
    interest_due_since = loan_row.interest_due_since,
    next_interest_adjustment = loan_row.next_interest_adjustment,
    next_payment_date = loan_row.next_payment_date,
    status = case when loan_row.current_principal = 0 and loan_row.accrued_interest = 0 then 'paid' else loan_row.status end
  where id = loan_id_value;
end;
$$;
