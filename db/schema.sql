create table if not exists borrowers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  telegram_chat_id text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references borrowers(id) on delete restrict,
  principal numeric(14,2) not null check (principal > 0),
  monthly_interest_rate numeric(6,3) not null check (monthly_interest_rate >= 0),
  start_date date not null,
  due_date date not null check (due_date >= start_date),
  current_principal numeric(14,2) not null check (current_principal >= 0),
  accrued_interest numeric(14,2) not null default 0 check (accrued_interest >= 0),
  next_payment_date date not null,
  interest_due_since date,
  payment_day smallint not null check (payment_day between 1 and 31),
  status text not null default 'active' check (status in ('active', 'paid', 'overdue')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  principal_amount numeric(14,2) not null default 0 check (principal_amount >= 0),
  paid_at date not null default current_date,
  method text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists reminder_logs (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  reminder_kind text not null,
  sent_at timestamptz not null default now(),
  unique (loan_id, reminder_kind)
);

create index if not exists loans_due_date_idx on loans(due_date);
create index if not exists payments_loan_id_idx on payments(loan_id);

-- Safe upgrade path for databases created by an earlier KamJey version.
alter table loans add column if not exists current_principal numeric(14,2);
alter table loans add column if not exists accrued_interest numeric(14,2) not null default 0;
alter table loans add column if not exists next_payment_date date;
alter table loans add column if not exists payment_day smallint;
alter table loans add column if not exists interest_due_since date;
update loans set current_principal = principal where current_principal is null;
update loans set next_payment_date = due_date where next_payment_date is null;
update loans set payment_day = extract(day from start_date)::smallint where payment_day is null;
alter table loans alter column current_principal set not null;
alter table loans alter column next_payment_date set not null;
alter table loans alter column payment_day set not null;

alter table payments add column if not exists interest_amount numeric(14,2) not null default 0;
alter table payments add column if not exists principal_amount numeric(14,2) not null default 0;

-- Move a monthly anniversary forward, using the last day in shorter months.
create or replace function next_monthly_date(current_date_value date, preferred_day integer)
returns date language sql immutable as $$
  select make_date(
    extract(year from (date_trunc('month', current_date_value) + interval '1 month'))::integer,
    extract(month from (date_trunc('month', current_date_value) + interval '1 month'))::integer,
    least(preferred_day, extract(day from (date_trunc('month', current_date_value) + interval '2 months - 1 day'))::integer)
  );
$$;

-- Accrue one month's interest for every reached payment anniversary.
create or replace function accrue_loan(loan_id_value uuid, as_of date default current_date)
returns void language plpgsql as $$
declare loan_row loans%rowtype;
begin
  select * into loan_row from loans where id = loan_id_value for update;
  while loan_row.status = 'active'
    and loan_row.current_principal > 0
    and loan_row.next_payment_date <= as_of loop
    if loan_row.accrued_interest = 0 then loan_row.interest_due_since := loan_row.next_payment_date; end if;
    loan_row.accrued_interest := round(loan_row.accrued_interest + loan_row.current_principal * loan_row.monthly_interest_rate / 100, 2);
    loan_row.next_payment_date := next_monthly_date(loan_row.next_payment_date, loan_row.payment_day);
  end loop;
  update loans set
    accrued_interest = loan_row.accrued_interest,
    interest_due_since = loan_row.interest_due_since,
    next_payment_date = loan_row.next_payment_date,
    status = case when loan_row.current_principal = 0 and loan_row.accrued_interest = 0 then 'paid' else loan_row.status end
  where id = loan_id_value;
end;
$$;
