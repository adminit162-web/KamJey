import { db } from "@/lib/db";

export async function createDataBackup() {
  const sql = db();
  const [borrowers, loans, payments, topups, reminderLogs] = await Promise.all([
    sql`select * from borrowers order by created_at`,
    sql`select * from loans order by loan_number`,
    sql`select * from payments order by paid_at, created_at`,
    sql`select * from loan_topups order by topped_up_at, created_at`,
    sql`select * from reminder_logs order by sent_at`,
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), borrowers, loans, payments, topups, reminderLogs };
}
