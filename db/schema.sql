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
  status text not null default 'active' check (status in ('active', 'paid', 'overdue')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
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
