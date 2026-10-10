# KamJey system check — 10 Oct 2026

I checked the dashboard, the Loans, Borrowers and Payments pages, the Telegram bot, and the payment logic. I also compared every number on the dashboard with the database.

## Result in short

- **The dashboard numbers are correct.** Every total matches the database.
- **I found 1 data problem** that needs fixing now (Sok Meng).
- **I found 4 logic problems** that can show wrong information.
- **I found 6 smaller problems** to fix later.

---

## 1. Dashboard numbers (October 2026) — checked ✅

| Card | Dashboard | Database | OK? |
|---|---|---|---|
| Total received | $307.50 | $307.50 | ✅ |
| Principal collected | $147.00 | $147.00 | ✅ |
| Interest collected | $160.50 | $160.50 | ✅ |
| Principal left at month end | $14,435.00 | $14,435.00 | ✅ |
| Expected interest | $564.70 | $564.70 | ✅ |
| Money lent this month | $1,162.00 (3 new loans) | $1,162.00 | ✅ (but includes Sok Meng's $12, see 2.1) |
| Loans in month | 19 | 19 (Chor Chanthy is paid off) | ✅ |
| Paid / Partly paid / Unpaid / Not due | 7 / 1 / 3 / 8 | same | ⚠️ Touch Rose is wrong, see 3.1 |

The principal saved on each loan also matches: first loan + added funds − principal paid. No loan has a broken balance.

---

## 2. Data problem — fix now 🔴

### 2.1 Sok Meng (KJ-0018): the 8 Oct payment is still recorded as principal

**What happened:** the 8 Oct payment of $12 is still saved as **$12 to principal and $0 to interest**. To get the principal back to $120, someone added **$12 with "Add funds"**. The payment itself was not changed.

**Why it's wrong:**
- Interest collected in October shows **$12 too low**.
- "Money lent this month" shows **$12 too high**.
- On **15 Oct**, the system will charge Sok Meng **$11 interest** that they already paid.

**How to fix (in this order):**
1. Sok Meng → View history → **Delete the $12 "Add funds" entry**.
2. Then **Edit the 8 Oct payment → Save**. The new rule will move the $12 to interest.
3. Check: principal is $120, interest on the 8 Oct payment is $12, and nothing is due on 15 Oct.

---

## 3. Logic problems 🟠

### 3.1 A borrower who is late from last month shows "Not due yet"

**Example:** Touch Rose (KJ-0027) has not paid the 20 Sep interest ($94.50), so they are 20 days late. The October board shows **"Not due yet"** because the October due date (20 Oct) has not come yet.

**Also:** if someone pays early in September for the 3 Oct due date, October shows **"Unpaid"** even though the interest is paid.

**Fix:** decide the status by **how much interest is owed today**, not only by payments made in this month:
- Interest owed today → **Unpaid** (or **Partly paid** if they paid some).
- Nothing owed → Paid / Not due yet.

### 3.2 Paying part of the interest does not update the "late since" date

When a borrower owes several months and pays some of them, the system still remembers the **oldest** due date.

**Example:** owes Aug + Sep + Oct ($5 each) and pays $10. Aug and Sep are now paid, but the system still says "late since 3 Aug". So:
- the board shows **"Unpaid 3 months"** instead of 1 month,
- Telegram shows the wrong number of days overdue.

**Fix:** when a payment covers the oldest months, move the "late since" date forward to the oldest month that is still unpaid.

### 3.3 A payment can be saved with a future date

The Record payment form accepts a date in the future. The system then charges interest up to that future date straight away, so the borrower owes more than they should today.

**Fix:** do not allow a payment date after today. Adding funds and editing a payment already have this check.

### 3.4 "Today" is wrong between midnight and 7:00 am

Some parts of the server use **UTC time**, not **Cambodia time** (UTC+7). Between 00:00 and 07:00 in Cambodia, the server still thinks it is yesterday. Because of this:
- adding funds dated today shows "date in the future",
- interest that is due today is added late,
- the Loans page "Overdue" status can be 1 day late.

**Fix:** use one Cambodia-time "today" everywhere. The Telegram report already does this correctly.

---

## 4. Smaller problems 🟡

| # | Problem | Suggested fix |
|---|---|---|
| 4.1 | Every new loan creates a **new borrower**. A person with 2 loans shows twice on the Borrowers page. | When creating a loan, let the user pick an existing borrower. |
| 4.2 | **Staff** users can edit and delete loans and payments. Only Settings, Users, Export and Backups are admin-only. | Decide if staff should be allowed to delete. If not, make delete admin-only. |
| 4.3 | Borrowers page "Interest due" only shows interest already counted. If you open it before the dashboard, it can be out of date. | Update interest before loading the Borrowers page too. |
| 4.4 | Deleting a payment can set the "late since" date too recent, so unpaid months show too few. | Save the old "late since" date with each payment and restore it on delete. |
| 4.5 | Payments page: the method (Cash, Bank transfer) is not translated to Khmer. | Use the translation for the method. |
| 4.6 | "Partly paid", "Unpaid X months" and the remaining interest only work for the **current month**. Past months only look at payments made in that month. | Save a monthly snapshot of each loan, if past months need to be exact. |

---

## 5. Things that are working well ✅

- Payment split (interest first, then principal), including early payments — 15 tests pass.
- Recording, editing and deleting payments and added funds stay in sync with the loan balance.
- The login protects all pages and data. The Telegram webhook and the daily report are protected with secret keys.
- The Telegram daily report uses Cambodia time and does not send twice.

## 6. Code not uploaded yet

These changes are on the computer but not pushed:
- interest rate on its own line under the balance,
- "Unpaid X months" only from 2 months, with the longest-unpaid first in "Needs attention".

## Suggested order

1. Fix Sok Meng's data (2.1) — today.
2. Fix the status logic (3.1) and the "late since" date (3.2) — these affect what you see every day.
3. Block future payment dates (3.3) and use Cambodia time (3.4).
4. The smaller problems when there is time.
